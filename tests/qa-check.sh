#!/usr/bin/env bash
# ==============================================================================
# jScrape — Universal Automated Test Suite & Pre-Flight Verifier
# Zero external dependencies (cURL + Bash only).
# Works across local development, GitHub Actions runners, and live environments.
# ==============================================================================

set -uo pipefail

TARGET_URL="${1:-https://dev.j.synopsdigital.com}"
# Strip trailing slash if present
TARGET_URL="${TARGET_URL%/}"

MODE="smoke"
for arg in "$@"; do
  case "$arg" in
    --mode=*)
      MODE="${arg#*=}"
      ;;
  esac
done

echo "======================================================"
echo "🧪 Running Automated jScrape QA Suite"
echo "Target URL: ${TARGET_URL}"
echo "Test Mode : ${MODE}"
echo "======================================================"

PASSED=0
FAILED=0

# Extract Hostname for DNS & Host Header checks
HOSTNAME=$(echo "${TARGET_URL}" | sed -E 's|https?://([^/:]+).*|\1|')

# --- Pre-Check: DNS Resolution ---
if ! host "${HOSTNAME}" >/dev/null 2>&1 && ! nslookup "${HOSTNAME}" >/dev/null 2>&1 && ! getent hosts "${HOSTNAME}" >/dev/null 2>&1; then
  echo "⚠️ WARNING: DNS record for '${HOSTNAME}' is not resolving yet."
  echo "👉 Please ensure an A-record for '${HOSTNAME}' is configured in your DNS settings."
  echo "Skipping live QA curl suite until DNS propagation is complete."
  exit 0
fi

# Function to check an endpoint
check_endpoint() {
  local path="$1"
  local expected_status="$2"
  local required_text="${3:-}"

  local url="${TARGET_URL}${path}"
  local tmpfile
  tmpfile=$(mktemp)

  # Fetch response body and capture HTTP status + timing
  local meta
  meta=$(curl -s -L -o "$tmpfile" -w "%{http_code} %{time_total}" --max-time 15 "$url")
  local http_code
  local duration
  http_code=$(echo "$meta" | awk '{print $1}')
  duration=$(echo "$meta" | awk '{print $2}')

  # Resilient retry if first attempt failed or missing required text (e.g. during server reload buffer)
  if [ "$http_code" != "$expected_status" ] || ([ -n "$required_text" ] && ! grep -i -q "$required_text" "$tmpfile"); then
    sleep 3
    meta=$(curl -s -L -o "$tmpfile" -w "%{http_code} %{time_total}" --max-time 15 "$url")
    http_code=$(echo "$meta" | awk '{print $1}')
    duration=$(echo "$meta" | awk '{print $2}')
  fi

  if [ "$http_code" = "$expected_status" ]; then
    if [ -n "$required_text" ]; then
      if grep -i -q "$required_text" "$tmpfile"; then
        echo "✅ PASS: ${path} (HTTP ${http_code} · ${duration}s)"
        PASSED=$((PASSED + 1))
      else
        echo "❌ FAIL: ${path} returned HTTP ${http_code} but missing expected content: '${required_text}'"
        FAILED=$((FAILED + 1))
      fi
    else
      echo "✅ PASS: ${path} (HTTP ${http_code} · ${duration}s)"
      PASSED=$((PASSED + 1))
    fi
  else
    echo "❌ FAIL: ${path} expected HTTP ${expected_status}, received HTTP ${http_code} (${duration}s)"
    FAILED=$((FAILED + 1))
  fi

  rm -f "$tmpfile"
}

# Function to audit security headers
check_header() {
  local header_name="$1"
  local headers
  headers=$(curl -s -L -I --max-time 10 "${TARGET_URL}/")

  if echo "$headers" | grep -i -q "^${header_name}:"; then
    echo "  ✅ Security Header Present: ${header_name}"
    PASSED=$((PASSED + 1))
  else
    echo "  ⚠️ Security Header Missing: ${header_name}"
    # Treated as warning in smoke/full, failure in strict audit
    if [ "${MODE}" = "audit" ]; then
      FAILED=$((FAILED + 1))
    fi
  fi
}

# --- Fast Smoke Mode ---
if [ "${MODE}" = "smoke" ]; then
  echo ""
  echo "--- Fast Smoke Verification ---"
  check_endpoint "/" "200" "SCRAPEDEEZ"
  check_endpoint "/styles.css" "200" ""
  check_endpoint "/jobs_data.json" "200" ""
  check_endpoint "/health" "200" "healthy"
  echo ""
  echo "------------------------------------------------------"
  echo "Smoke Results: ${PASSED} Passed, ${FAILED} Failed"
  echo "------------------------------------------------------"
  [ ${FAILED} -gt 0 ] && exit 1 || exit 0
fi

# --- Full Mode: Core Routes & Feed Integrity ---
echo ""
echo "--- 1. Core Route & Feed Integrity Verification ---"
check_endpoint "/" "200" "SCRAPEDEEZ"
check_endpoint "/health" "200" "healthy"
check_endpoint "/jobs_data.json" "200" "title"

echo ""
echo "--- 2. Critical Asset & SEO Manifest Verification ---"
check_endpoint "/styles.css" "200" ""
check_endpoint "/main.js" "200" ""
check_endpoint "/synops_logo.jpg" "200" ""
check_endpoint "/robots.txt" "200" "Sitemap:"
check_endpoint "/sitemap.xml" "200" "<urlset"

# --- Full Mode: Internal Link & Asset Crawler ---
echo ""
echo "--- 3. Automated Dead Link & Asset Crawler (Sitemap-Driven) ---"

PAGES=()
if [ -f "sitemap.xml" ]; then
  sitemap_paths=$(grep -oE '<loc>[^<]+</loc>' sitemap.xml | sed -E 's|</?loc>||g' | sed -E 's|https?://[^/]+||g')
else
  sitemap_paths=$(curl -s -L --max-time 10 "${TARGET_URL}/sitemap.xml" | grep -oE '<loc>[^<]+</loc>' | sed -E 's|</?loc>||g' | sed -E 's|https?://[^/]+||g')
fi

while IFS= read -r p; do
  [ -n "$p" ] && PAGES+=("$p")
done <<< "$sitemap_paths"

if [ ${#PAGES[@]} -eq 0 ]; then
  PAGES=("/")
fi

echo "Discovered ${#PAGES[@]} canonical routes from sitemap.xml:"
for p in "${PAGES[@]}"; do
  echo "  📄 Route: ${p}"
done

CRAWLED_LINKS=()
for page in "${PAGES[@]}"; do
  content=$(curl -s -L --max-time 10 "${TARGET_URL}${page}")
  found_links=$(echo "$content" | grep -oE '(href|src)="[^"#?]+"' | sed -E 's/(href|src)="([^"]+)"/\2/' | grep -vE '^(http|https|mailto|tel|javascript|#):' || true)

  while IFS= read -r link; do
    [ -z "$link" ] && continue
    [[ "$link" != /* ]] && link="/$link"
    CRAWLED_LINKS+=("$link")
  done <<< "$found_links"
done

# Deduplicate
UNIQUE_LINKS=()
if [ ${#CRAWLED_LINKS[@]} -gt 0 ]; then
  while IFS= read -r item; do
    [ -n "$item" ] && UNIQUE_LINKS+=("$item")
  done < <(printf "%s\n" "${CRAWLED_LINKS[@]}" | sort -u)
fi

echo ""
echo "Found ${#UNIQUE_LINKS[@]} unique internal assets & links across all pages..."
for link in "${UNIQUE_LINKS[@]}"; do
  case "$link" in
    /|/styles.css|/main.js|/synops_logo.jpg|/jobs_data.json|/robots.txt|/sitemap.xml)
      continue
      ;;
  esac

  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${TARGET_URL}${link}")
  if [ "$status" = "200" ] || [ "$status" = "301" ] || [ "$status" = "302" ]; then
    echo "  ✅ Asset OK: ${link} (HTTP ${status})"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ BROKEN LINK/ASSET: ${link} (HTTP ${status})"
    FAILED=$((FAILED + 1))
  fi
done

# --- Security Headers & TLS Audit ---
echo ""
echo "--- 4. Security Headers & TLS Audit ---"
check_header "Strict-Transport-Security"
check_header "X-Content-Type-Options"
check_header "X-Frame-Options"

echo ""
echo "------------------------------------------------------"
echo "QA Results: ${PASSED} Passed, ${FAILED} Failed"
echo "------------------------------------------------------"

if [ ${FAILED} -gt 0 ]; then
  echo "🚨 QA Suite Encountered ${FAILED} Failures."
  exit 1
fi

echo "✨ All Checks Passed Successfully!"
exit 0
