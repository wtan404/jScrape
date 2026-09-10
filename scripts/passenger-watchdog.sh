#!/usr/bin/env bash
# ==============================================================================
# Scrapedeez — Apache Passenger Watchdog & Self-Healing Script
# Checks local & remote health endpoints. If unreachable or failing,
# triggers Passenger application restart via `tmp/restart.txt`.
# Configured for cPanel Cron: e.g. every 5 or 10 minutes.
# ==============================================================================

set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_URL="${1:-https://dev.j.synopsdigital.com}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
LOG_FILE="${APP_DIR}/watchdog.log"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  echo "[$(timestamp)] $1" | tee -a "$LOG_FILE"
}

HEALTH_URL="${TARGET_URL%/}/health"

# Query /health with 10s max-time
HTTP_CODE=$(curl -s -L -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  log "⚠️ HEALTH CHECK FAILED: ${HEALTH_URL} returned HTTP ${HTTP_CODE}. Initiating self-healing restart..."
  
  # Trigger Passenger Graceful Restart
  mkdir -p "${APP_DIR}/tmp"
  touch "${APP_DIR}/tmp/restart.txt"
  log "✅ Touched ${APP_DIR}/tmp/restart.txt (Passenger restart signaled)."

  # Send Slack alert if webhook configured
  if [ -n "$SLACK_WEBHOOK" ]; then
    ALERT_JSON=$(cat <<EOF
{
  "text": "⚠️ *jScrape Watchdog Alert*: \`${HEALTH_URL}\` returned HTTP \`${HTTP_CODE}\`. Automated recovery restart triggered via \`tmp/restart.txt\`."
}
EOF
    )
    curl -s -X POST -H 'Content-type: application/json' --data "$ALERT_JSON" "$SLACK_WEBHOOK" > /dev/null 2>&1 || true
  fi

  # Sleep 5s and check recovery
  sleep 5
  RETRY_CODE=$(curl -s -L -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "000")
  log "ℹ️ Post-restart probe returned HTTP ${RETRY_CODE}."
else
  log "✅ Health OK (HTTP 200) from ${HEALTH_URL}."
fi
