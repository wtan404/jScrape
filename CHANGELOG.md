# Changelog — jScrape (scrapedeez)

All notable changes to the jScrape project are documented in this file.

---

## [1.29.0] - 2026-11-21

### Architectural Restructuring & Scraper Pipeline Consolidation
- **Directory Layout Migration (`dta/`, `scripts/`, `ops/`, `dsb.html`, `server.js`):**
  - Migrated persistent data feeds to [dta/](file:///D:/Projects/jScrape/dta) (`config.json`, `jobs_data.json`, `job_applications.json`, `profile.json`, `health.json`).
  - Restored [package.json](file:///D:/Projects/jScrape/package.json) and `package-lock.json` to repository root to guarantee compatibility with `npm`, Passenger, and CI/CD runners, bumping version to `1.29.0` and updating CLI run scripts.
  - Relocated core Node.js application scripts to [scripts/](file:///D:/Projects/jScrape/scripts) (`scraper.js`, `submission_engine.js`, `dashboard.js`), consolidating the full application server directly into root [server.js](file:///D:/Projects/jScrape/server.js) and eliminating `scripts/server.js`.
  - Relocated operational automation to [ops/](file:///D:/Projects/jScrape/ops) (`merge_applications.js`, `passenger-watchdog.sh`).
  - Renamed `dashboard.html` to [dsb.html](file:///D:/Projects/jScrape/dsb.html) and removed deprecated mock page `test-application.html`.
- **Scraper Ingestion & Verification Consolidation (`scripts/scraper.js`):**
  - Consolidated standalone micro-modules (`ats_scraper.js`, `geo_helper.js`, `salary_extractor.js`, `verifier.js`) directly into [scripts/scraper.js](file:///D:/Projects/jScrape/scripts/scraper.js).
  - Eliminated duplicate `EXCLUDED_ROLE_PATTERNS` negative role regexes, centralized distance calculations, workplace classification (`classifyWorkType`), salary range parsing (`extractSalaryFromText`), and ATS company job scraping (Greenhouse, Lever, Ashby, SmartRecruiters).
  - Removed deprecated stubs `submissions_log.json` and extensionless `health`.
- **Full Path & Endpoint Re-Wiring Across Application Stack:**
  - **Frontend ([index.html](file:///D:/Projects/jScrape/index.html), [dsb.html](file:///D:/Projects/jScrape/dsb.html), [scripts/dashboard.js](file:///D:/Projects/jScrape/scripts/dashboard.js)):** Updated script references to `scripts/dashboard.js?v=1.29.0`, updated navigation links to `dsb.html`, removed mock test page button, and pointed `BASE_DATA_PATH` to `./dta/`.
  - **Backend & Persistence ([scripts/server.js](file:///D:/Projects/jScrape/scripts/server.js), [api.php](file:///D:/Projects/jScrape/api.php), [scripts/submission_engine.js](file:///D:/Projects/jScrape/scripts/submission_engine.js)):** Updated path constants to target `../dta/`, mounted route handlers for `/dsb`, `/dsb/`, `/dashboard`, `/dashboard/` to `dsb.html`, and added backwards-compatibility aliases for legacy root JSON requests.
  - **Operations & Reconciliation ([ops/merge_applications.js](file:///D:/Projects/jScrape/ops/merge_applications.js)):** Pointed `LOCAL_APPS_FILE` to `dta/job_applications.json` and added upstream endpoints fallback (`api.php` and `dashboard/api.php`).
  - **Server Routing & Access ([.htaccess](file:///D:/Projects/jScrape/.htaccess)):** Updated `PassengerStartupFile` to root `server.js`, routed `/dashboard` and `/dsb` to `dsb.html`, and added legacy rewrite rules for moved assets.
  - **Deployment & CI/CD ([.cpanel.yml](file:///D:/Projects/jScrape/.cpanel.yml), [.github/workflows/deploy.yml](file:///D:/Projects/jScrape/.github/workflows/deploy.yml), [.github/workflows/pr-gate.yml](file:///D:/Projects/jScrape/.github/workflows/pr-gate.yml)):** Updated deploy copy tasks for `dta/`, `scripts/`, `ops/`, configured FTP exclusion of persistent candidate state in `dta/`, added exclusion of legacy `dashboard` directory from FTP deletion to eliminate 550 errors, updated pre-merge syntax checks, and promoted release `v1.29.0` end-to-end to staging (`https://stage.j.synopsdigital.com`) and production (`https://j.synopsdigital.com`).
  - **Test Suite ([tests/](file:///D:/Projects/jScrape/tests)):** Updated relative module imports and endpoint verification checks across all test harnesses (`test_omni_url_parsing.js`, `test_oracle_url_parsing.js`, `run_test_submission.js`, `live_real_world_inspection.js`, `qa-check.sh`).

---

## [1.28.0] - 2026-11-21

### Deprecation Cleanup & In-Dashboard Criteria Management
- **Full Codebase Evaluation & Deprecation Cleanup (`search.html`, `main.js`, `zip3_centroids.js`, `synops_logo.jpg`, `.vscode/sftp.json`, `.cpanel.yml`, `robots.txt`, `submissions_log.json`):**
  - Permanently removed legacy public search board ([search.html](file:///D:/Projects/jScrape/search.html)), its duplicate client-side engine ([main.js](file:///D:/Projects/jScrape/main.js), 79 KB / 2,114 lines), and the 3-digit Zip centroid dataset ([zip3_centroids.js](file:///D:/Projects/jScrape/zip3_centroids.js), 36 KB).
  - Deleted orphaned 346 KB binary logo ([synops_logo.jpg](file:///D:/Projects/jScrape/synops_logo.jpg)) unreferenced by any layout or stylesheet.
  - Removed plaintext FTP credentials file ([.vscode/sftp.json](file:///D:/Projects/jScrape/.vscode/sftp.json)) from git tracking and added `.vscode/sftp.json` to [.gitignore](file:///D:/Projects/jScrape/.gitignore).
  - Purged references to deleted `/dev/` and `/qa/` directories from [robots.txt](file:///D:/Projects/jScrape/robots.txt).
  - Cleared stale mock entries from [submissions_log.json](file:///D:/Projects/jScrape/submissions_log.json).
  - Synchronized deployment manifest in [.cpanel.yml](file:///D:/Projects/jScrape/.cpanel.yml) and automated crawler verification in [tests/qa-check.sh](file:///D:/Projects/jScrape/tests/qa-check.sh).
- **Repurposed Sliders Navigation & Native Search Criteria Modal (`index.html`, `dashboard.html`, `dashboard.js`, `styles.css`, `api.php`):**
  - Repurposed the sliders icon (`<i data-lucide="sliders-horizontal"></i>`) in the headers of both the Triage Center ([index.html](file:///D:/Projects/jScrape/index.html)) and Analytics Dashboard ([dashboard.html](file:///D:/Projects/jScrape/dashboard.html)) to launch a unified **Search Criteria & Keywords Modal** (`openConfigModal()`).
  - Allows live inspection and in-dashboard editing of target role titles, matching keywords (with interactive tag pills), and minimum base compensation thresholds.
  - Added native `case 'config':` persistence to [api.php](file:///D:/Projects/jScrape/api.php) to support atomic updates to [config.json](file:///D:/Projects/jScrape/config.json) across both PHP and Node.js environments.
  - Promoted modal layout and overlay animation tokens to global stylesheet ([styles.css](file:///D:/Projects/jScrape/styles.css)) for cross-page design parity.
  - Purged dead `../api.php` and `../api/jobs/...` subfolder fallback paths from [dashboard.js](file:///D:/Projects/jScrape/dashboard.js).
  - Bumped project version to `1.28.0` in [package.json](file:///D:/Projects/jScrape/package.json).

---

## [1.27.0] - 2026-11-21

### Decommissioning & Deprecation Cleanup
- **Decommissioned Google Jobs & SerpAPI Integration (`google_jobs_scraper.js`, `scraper.js`, `server.js`, `config.json`, `.env.example`, `.cpanel.yml`, `.github/workflows/pr-gate.yml`, `package.json`):**
  - Permanently removed `google_jobs_scraper.js` from the repository and ingestion pipeline.
  - Decoupled `scraper.js` orchestration: purged `scrapeGoogleJobs` from parallel `Promise.all` ingestion, removed `googleJobs` from result concatenation, and simplified `runScraperJob` parameters.
  - Refactored `server.js`: removed `serpApiKey` from default configuration schema and eliminated arguments from manual (`/api/scrape-now`) and cron-scheduled scrape calls.
  - Cleaned configuration templates: purged `serpApiKey: ""` from `config.json` and removed `SERPAPI_KEY` placeholder documentation from `.env.example`.
  - Updated deployment and CI/CD manifests: eliminated `google_jobs_scraper.js` from `.cpanel.yml` deployment script and removed syntax validation from `.github/workflows/pr-gate.yml`.
  - Bumped project version to `1.27.0` in `package.json`.

---

## [1.26.0] - 2026-11-20

### Frontend Architecture & Script Consolidation
- **Consolidated `dashboard_analytics.js` into Canonical `dashboard.js` (`dashboard.js`, `dashboard.html`, `index.html`, `package.json`, `.cpanel.yml`):**
  - Unified all dashboard frontend logic into a single high-performance script ([dashboard.js](file:///D:/Projects/jScrape/dashboard.js)) with page DOM-aware context mounting.
  - Automatically initializes the Operational Triage Center when `.triage-center` is detected and the Conversion Funnel / Sankey Analytics Engine when `.analytics-layout` is detected.
  - Migrated complete analytics and pipeline visualization engine:
    - Google Charts dynamic Sankey topology and offline fallback matrix (`ensureGoogleCharts`, `renderSankeyFunnel`, `buildSankeyEdges`, `renderFallbackFunnel`).
    - Granular stage metrics & KPI cards (`renderKpiMetrics`).
    - Real-time application ledger table with status transitions and age tracking (`renderAnalyticsTable`, `updateLedgerStatus`).
    - 20-day automated inactivity aging (`applyTwentyDayAutoAging`).
    - Multi-endpoint cloud persistence and cross-window sync channel (`persistApplicationUpdate`, `syncAndRefreshDashboard`, `handleExternalStatusUpdate`).
  - Switched [dashboard.html](file:///D:/Projects/jScrape/dashboard.html) and [index.html](file:///D:/Projects/jScrape/index.html) to load `<script src="dashboard.js?v=1.26.0"></script>`.
  - Permanently removed `dashboard_analytics.js` from Git, local disk, `.cpanel.yml`, and remote host servers (`public_html/list/` and `public_html/list/stage/`).
  - Bumped project version to `1.26.0` in [package.json](file:///D:/Projects/jScrape/package.json).

---

## [1.25.0] - 2026-11-20

### Architecture & Directory Simplification
- **Eliminated `dashboard/` Subdirectory Entirely (`.htaccess`, `stage/.htaccess`, `server.js`, `.cpanel.yml`):**
  - Promoted `dashboard/api.php` directly to root `api.php`, removing the legacy one-line forwarder wrapper and executing the native PHP backend directly from root.
  - Relocated mock ATS schema testbed `dashboard/test-application.html` to root `test-application.html` and updated navigation icon links in `index.html`.
  - Configured clean Apache URL rewrite rules (`RewriteRule ^dashboard/?$ dashboard.html [L]`) in both root `.htaccess` and `stage/.htaccess` so `https://j.synopsdigital.com/dashboard` and `https://j.synopsdigital.com/dashboard/` resolve seamlessly to `dashboard.html` without requiring a physical directory.
  - Permanently purged the legacy `dashboard/` folder, `dashboard/index.html`, and `dashboard/.htaccess` from Git, disk, and live host servers.

---

## [1.24.0] - 2026-11-20

### Pipeline & Infrastructure Streamlining
- **Streamlined Deployment Matrix (`.github/workflows/deploy.yml`, `pr-gate.yml`, `uptime-monitor.yml`):**
  - Confirmed and enforced strict deployment boundaries: only `stage` (`https://stage.j.synopsdigital.com`) and `main` (`https://j.synopsdigital.com`) trigger deployments.
  - The `dev` branch is preserved exclusively for development and feature integration with zero automated deployment triggers.
  - Removed obsolete `- qa` trigger from the PR evaluation gate (`pr-gate.yml`) and purged all `dev/**` and `qa/**` exclusion references from deployment actions (`deploy.yml`).
  - Updated synthetic uptime monitoring (`uptime-monitor.yml`), passenger watchdog (`scripts/passenger-watchdog.sh`), and automated QA (`tests/qa-check.sh`) to point to canonical `https://j.synopsdigital.com` with HTTP basic auth credentials.

### Codebase Consolidation & Deprecation Cleanup
- **Purged Obsolete Folders & Ambiguities (`dev/`, `qa/`):**
  - Permanently deleted the physical `dev/` and `qa/` directories along with their tracked `.gitkeep` and `.htaccess` files, resolving Git branch/path ambiguity completely.
- **Removed Unreferenced Duplicate JavaScript (`dashboard/dashboard.js`, `dashboard/dashboard_analytics.js`):**
  - Deleted 3,610 lines of unreferenced duplicate code from the `dashboard/` subfolder, ensuring all analytics logic cleanly runs through root `dashboard_analytics.js`.
- **Purged Dead Sankey Engine from `dashboard.js` & Google Charts from `index.html`:**
  - Removed ~325 lines of dead Sankey charting functions from `dashboard.js` (the Sankey diagram lives and flows strictly on `dashboard.html`).
  - Removed unused `<script src="https://www.gstatic.com/charts/loader.js"></script>` from `index.html`, eliminating an unnecessary 100KB+ external script dependency on initial triage page load.
- **Consolidated Candidate Profile Storage (`profile.json`):**
  - Standardized `submission_engine.js` to reference the canonical `profile.json` and permanently deleted the duplicate `applicant_profile.json`.
- **CSS Sanitization (`styles.css`):**
  - Removed dead `.brand`, `.brand-logo-img`, `.brand-title`, and `.brand-title .highlight` rules following logo removal.

---

## [1.23.0] - 2026-11-20

### Security & Access Control
- **Site-Wide HTTP Basic Auth Lockdown (`.htaccess`, `.htpasswd`, `stage/.htaccess`, `dashboard/.htaccess`):**
  - Fully locked the entire site `https://j.synopsdigital.com` and related areas (`stage.j.synopsdigital.com`, root `/`, `/dashboard/`, `/stage/`, API endpoints, and static assets) behind HTTP Basic Authentication.
  - Set authorized credentials (`will:ScrapeDeez12!`) and updated the SHA-1 digest hash entry across `.htpasswd` files and `jscrape_prod_credentials.txt`.
  - Configured health check exemption (`<FilesMatch "^(health|health\.json)$"> Require all granted </FilesMatch>`) to allow automated vitality probes.
  - Updated automated CI/CD and QA test suites (`.github/workflows/deploy.yml`, `tests/qa-check.sh`) to supply basic auth credentials.

### User Interface & Modernization
- **Header Simplification & Icon-Only Navigation (`index.html`, `dashboard.html`, `dashboard/index.html`, `search.html`, `styles.css`):**
  - Removed the `SCRAPEDEEZ` branding title and Synops logo image across all headers.
  - Stripped text labels (`<span>...</span>`) off header action buttons, leaving only compact, centered Lucide SVG icons with explicit tooltip `title` and `aria-label` attributes.
  - Standardized `.btn-icon-only` styling (36×36px square buttons with centered SVG icons).
  - Aligned header navigation actions cleanly to the top-right (`justify-content: flex-end; align-items: center; margin-left: auto;`) across desktop and mobile viewports.

### Real-Time Synchronization & Sankey Reactivity
- **Bidirectional Application Status Synchronization (`dashboard.js`, `dashboard_analytics.js`, `dashboard/api.php`, `server.js`):**
  - Implemented real-time bidirectional status synchronization between the Triage Center (`index.html`) and the Analytics Dashboard (`dashboard.html`) using a shared `BroadcastChannel('scrapedeez_status_sync')`, native `window.addEventListener('storage')`, and `document.addEventListener('visibilitychange')`.
  - Status transitions invoked on the Triage Center (Active/Applied table dropdowns) instantly reflect on the dropdowns in the Analytics Dashboard without page reloads, and vice versa.
  - Added immediate Sankey diagram re-rendering on both pages whenever a status change occurs (`renderSankeyDiagram()` in Triage Center, `renderSankeyFunnel()` in Analytics Dashboard).
  - Enhanced status granularity mapping in Triage Center Sankey flows to distinguish `🟢 Applied`, `🟣 In Review`, `🔵 Interviewing`, `⭐ Offer Extended`, `⚪ No Response`, and `🔴 Rejected`.
  - Fixed backend persistence in `dashboard_analytics.js` and added endpoint aliasing (`case 'update_application_status':` -> `case 'application-status':`) in `api.php` and `server.js`.
  - Upgraded `fetchServerApplications()` in `dashboard_analytics.js` to timestamp-aware reconciliation, preventing older server state from overwriting recent local status updates.

---

## [1.22.0] - 2026-11-19

### Added
- **Universal Omni-Link Job Parser (`server.js`, `dashboard/api.php`, `dashboard.js`, `dashboard/dashboard.js`, `index.html`):**
  - Upgraded the manual application input engine to dynamically ingest and extract structured metadata from **any** job URL across the web.
  - **Workday Candidate Experience (CXS) REST Integration:** Automatically resolves `*.myworkdayjobs.com` URLs by querying Workday's native `/wday/cxs/<tenant>/<site>/job/<jobSlug>` API endpoint, extracting official requisition title, tenant employer, location, and compensation.
  - **Ashby Job Board Integration:** Resolves `jobs.ashbyhq.com/<company>/<id>` URLs by extracting embedded Next.js application data (`__NEXT_DATA__`) and public posting endpoints.
  - **SmartRecruiters Public REST API Integration:** Direct integration querying `api.smartrecruiters.com/v1/companies/<company>/postings/<id>` for structured job and employer details.
  - **BambooHR Integration:** Direct tenant and posting recognition across `*.bamboohr.com`.
  - **Enhanced Universal Semantic HTML Engine:** Comprehensive JSON-LD (`@type: JobPosting`) parser with structured compensation support (`baseSalary.value.minValue` / `maxValue`), OpenGraph/Twitter Card extractors, and semantic `<h1>` fallback.
  - **Expanded Compound Title Decompiler:** Automatically decomposes complex browser page titles across multiple formats (`<Role> at/@ <Company>`, `<Company> hiring <Role>`, `<Company> Careers: <Role>`), stripping platform branding suffixes.
  - **Subdomain-Aware Hostname Resolution:** Cleans carrier prefixes (`careers.`, `jobs.`, `boards.`, `work.`, `apply.`) to accurately isolate direct corporate employers (e.g. `Stripe`, `Datadog`, `Nike`).
  - **Zero-Failure Client-Side Fallback:** Enhanced `dashboard.js` with instant multi-segment URL slug deconstruction, ensuring seamless manual tracking even when target platforms deploy strict bot protections.
  - **Automated Verification Coverage (`tests/test_omni_url_parsing.js`):** Built dedicated automated test battery validating Workday, Ashby, SmartRecruiters, BambooHR, LinkedIn Guest API, Oracle Cloud, Taleo, and corporate career pages.

---

## [1.21.0] - 2026-11-19

### Added
- **Shopify & WordPress Criteria Expansion (`config.json`, `scraper.js`, `server.js`, `main.js`):**
  - Expanded search keywords to include e-commerce and CMS stacks: `"shopify"`, `"shopify plus"`, `"wordpress"`, `"wordpress vip"`, and `"woocommerce"` for broad full-text matching across RemoteOK, WeWorkRemotely, Remotive, and Jobicy.
  - Expanded target titles to include dedicated engineering and management requisitions: `"Shopify Developer"`, `"Shopify Engineer"`, `"Shopify Manager"`, `"WordPress Developer"`, `"WordPress Engineer"`, `"WordPress Manager"`, and `"CMS Manager"` across direct ATS boards (Greenhouse, Lever, Ashby, SmartRecruiters) and Google Jobs query generators.
  - Synchronized defaults across configuration fallbacks in `scraper.js`, `server.js`, and `main.js`.

### Removed
- **QA Branch & Pipeline Decommissioning (`.github/workflows/deploy.yml`, `scripts/merge_applications.js`):**
  - Permanently removed `qa` branch across local and remote repositories.
  - Streamlined GitHub Actions automated deployments to target exclusively `stage` (`stage.j.synopsdigital.com`) and `main` (production: `j.synopsdigital.com`).
  - Purged obsolete `qa` and `dev` deployment directories from the live host server.

### Fixed
- **Sankey Viewport Overflow & Responsive Clamping (`dashboard_analytics.js`, `dashboard/dashboard_analytics.js`, `dashboard.html`, `dashboard/index.html`):**
  - Resolved diagram overflow where terminal node labels (`⭐ Offer Extended`, `🔴 Rejected`) extended outside the container and viewport boundary.
  - Implemented dynamic available width calculation in `dashboard_analytics.js` (`chartWidth = Math.max(340, containerWidth - 140)`), strictly reserving clearance for right-hanging terminal node labels.
  - Applied CSS rule `#sankeyChartContainer svg { overflow: visible !important; }` to guarantee full text visibility without layout truncation.
  - Hardened layout boundaries with `overflow-x: hidden` and `max-width: 100vw` on `body`, alongside responsive container box bounding across `.analytics-layout`, `.chart-panel`, and `.chart-container-box`.

---

## [1.20.1] - 2026-11-19

### Fixed
- **Resolved `/dashboard` Canonical Redirect Loop (`server.js`):**
  - Removed legacy HTTP 301 redirect in `server.js` that previously redirected requests to `/dashboard` back to root `/`.
  - Replaced with direct `res.sendFile()` dispatching to serve the standalone `dashboard.html` across `/dashboard`, `/dashboard/`, and `/dashboard.html`.

---

## [1.20.0] - 2026-11-19

### Added
- **Dedicated Application Funnel & Analytics Dashboard (`dashboard.html`, `dashboard/index.html`, `dashboard_analytics.js`):**
  - Converted the legacy redirect stubs at `/dashboard` into a standalone, full-screen conversion intelligence dashboard.
  - Features real-time executive KPI cards: Total Applied, Awaiting Response, In Review, Interviewing, Offer Extended, No Response, and Total Rejected.
  - Integrated interactive Sankey topology diagram rendering multi-stage candidate progression with dark obsidian amethyst styling and dynamic tooltips.
  - Added full applications ledger table with inline status dropdown for instant simulation and pipeline routing.
  - Linked Triage Center (`index.html`) directly to the dedicated dashboard via header "Funnel Analytics" action.
- **Response-Driven Status Taxonomy & Granular Exit Routing (`dashboard.js`, `dashboard/dashboard.js`, `dashboard_analytics.js`, `server.js`, `dashboard/api.php`):**
  - Introduced `In Review` as a distinct active screening status following initial submission.
  - Deprecated `Archived` in favor of `No Response` (auto-aging terminal state).
  - Implemented granular rejection exit tracking (`direct`, `post_review`, `post_interview`, `no_response`) and automated `stageHistory` milestone auditing on every application.
  - Sankey Routing Engine:
    - Step 1 (Source) &rarr; Step 2 (Scope / Title).
    - Unanswered applications (`Applied`) remain parked at Step 2 without premature progression.
    - Step 3 branches into `In Review` or `No Response`.
    - `Interviewing` branches into `Offer Extended`, active in-flight rounds, or `Rejected: Post-Interview`.
    - `Rejected` is positioned as the final terminal exit sink on the far right.
- **Automated 20-Day Inactivity Aging Engine:**
  - Evaluates all `Applied` applications on startup and sync.
  - Automatically transitions roles older than 20 days without employer updates to `No Response` &rarr; `Rejected`.

---

## [1.19.1] - 2026-11-19

### Added
- **Oracle Cloud (ORC/CX) & Taleo Manual Entry Support (`server.js`, `dashboard/api.php`, `dashboard.js`, `dashboard/dashboard.js`, `index.html`, `submission_engine.js`):**
  - Integrated native Oracle Cloud Candidate Experience (CX) REST API parser (`/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails`) to extract structured title, organization/employer, location, and compensation directly from Oracle's cloud recruiting engine.
  - Added Taleo ATS domain and tenant resolution (`*.taleo.net`) with employer extraction.
  - Bound Oracle applications into the 1-click assisted dispatch launchpad in `submission_engine.js`.
  - Updated manual entry URL scanner placeholder in `index.html` to highlight Oracle.

### Fixed
- **LinkedIn Numeric ID Extraction & Guest API (`server.js`, `dashboard/api.php`):**
  - Resolved HTTP 429 guest wall on `/jobs/view/<id>` URLs by routing extraction through LinkedIn's unthrottled guest API (`/jobs-guest/jobs/api/jobPosting/<id>`).
  - Added numeric job ID extraction for URLs without vanity slugs.
- **Decompiler Hardening & Placeholder Guardrails (`server.js`, `dashboard/api.php`, `dashboard.js`, `dashboard/dashboard.js`, `scripts/merge_applications.js`):**
  - Fixed an anomaly where fallback placeholder `"Opportunity at Company"` was split by the compound title decompiler into Title `"Opportunity"` and Company `"Company"`.
  - Hardened regex to ignore `"Opportunity at ..."` and `"Role at ..."` strings and prevent platform tokens from ever being saved as employer or title.
- **Production Database Healing (`scripts/merge_applications.js`, `job_applications.json`):**
  - Healed corrupted record `manual-7k090uef` locally and pushed clean metadata upstream to production (`https://j.synopsdigital.com`), restoring Employer: **Navy Federal Credit Union**, Title: **Experience Owner**, and Location: **Vienna, VA**.
- **Automated Test Coverage (`tests/test_oracle_url_parsing.js`, `tests/test_linkedin_url_parsing.js`):**
  - Built automated verification suite for Oracle internal requisitions, JPMC Oracle Cloud candidate portal, Taleo, numeric LinkedIn guest API, and decompiler guardrails.

---

## [1.19.0] - 2026-11-19

### Added
- **End-to-End Application Funnel & Sankey Visualization (`index.html`, `dashboard.js`, `dashboard/dashboard.js`):**
  - Integrated interactive Sankey diagram analytics directly into the "Applied & Tracking" queue view.
  - Multi-stage pipeline architecture visualizes the complete conversion lifecycle:
    - **Stage 1 (Origins)**: Direct ATS platforms (*Greenhouse, Lever, Ashby*) and curated tech feeds (*LinkedIn, WeWorkRemotely, Jobicy*).
    - **Stage 2 (Resume Variations)**: Tracked deployment of tailored candidate profiles (*Corporate / IT Lead & Operations*, *DevOps & Cloud Infrastructure Lead*).
    - **Stage 3 (Outcomes & Pipeline)**: Live tracking of application stages (*Applied / In Review*, *Interviewing*, *Offer*, *Rejected*, *Archived*).
  - Dynamic Aggregation Modes: Supported full E2E (`Source -> Resume -> Outcome`), direct origin conversion (`Source -> Outcome`), and resume variation yield (`Resume -> Outcome`).
  - Real-time Reactivity: Auto-recomputes and redraws on status changes, application removals, restores, and URL scanner imports with responsive window re-fitting.
  - Interactive Controls: Collapsible container toggle with persistent preference state in `localStorage` and real-time KPI metric pills (Total Tracked, In Review, Interviewing, Offer, Rejected, and Active Conversion Rate).
  - High-Availability Fallback: Gracefully switches to an inline responsive data flow matrix if Google Charts is blocked or loaded in an offline environment.

---

## [1.18.1] - 2026-11-18

### Fixed
- **Legacy Tracked Records Sanitization & Upstream Database Healing (`scripts/merge_applications.js`, `dashboard.js`, `dashboard/dashboard.js`, `job_applications.json`):**
  - Remediated all 3 existing legacy LinkedIn job records in the production database and repository (`manual-ca8193071e`, `manual-8bdf5b2594`, and `manual-6e9e4c2d5f`).
  - Successfully decoupled employer names (`WellHive`, `OncoHealth`, and `HopSkipDrive`) from compound subtitles, stripped platform suffixes (`| LinkedIn Jobs`), resolved HTML entities (`&amp;` &rarr; `&`), and assigned proper location/work-type classifications.
  - Upgraded bidirectional sync engine (`scripts/merge_applications.js`) with integrated metadata sanitization to automatically normalize legacy entries during reconciliation.
  - Synchronized and verified cleaned application records directly across the live production API (`https://j.synopsdigital.com`).

---

## [1.18.0] - 2026-11-18

### Fixed
- **LinkedIn Manual Submission & Metadata Decomposition (`server.js`, `dashboard/api.php`, `dashboard.js`, `dashboard/dashboard.js`):**
  - Resolved an issue where importing LinkedIn job postings caused the employer header to be recorded as `"LinkedIn"` and the role subtitle as a compound string (`"<Role Title> at <Company> - <Location>"`).
  - Implemented dedicated compound regex decompilers across Node.js (`server.js`) and PHP (`dashboard/api.php`) parsers to strip platform branding (`| LinkedIn`, `- LinkedIn`) and cleanly separate `<Role Title>` as the job title, `<Company>` as the hiring employer, and `<Location>` for the location and work setup engine.
  - Blacklisted `"LinkedIn"`, `"Indeed"`, `"Glassdoor"`, and `"ZipRecruiter"` from being assigned as the hiring employer name.
  - Integrated URL slug decomposition (`/jobs/view/<role-slug>-at-<company-slug>-<id>/`) as a fallback to extract clean Title and Company even when network access to LinkedIn guest HTML is blocked by anti-scraping walls.
- **Client-Side Scanner & Retroactive Data Sanitization (`dashboard.js`, `dashboard/dashboard.js`):**
  - Updated client-side fallback in `importAndTrackJob()` to support LinkedIn slug parsing and compound string resolution.
  - Added retroactive sanitization in `sanitizeJobMetadata()`, `loadApplicationsState()`, and `syncApplicationsFromServer()`:
    - Automatically cleanses previously tracked applications in memory, `localStorage`, and upstream feeds where `company === 'LinkedIn'` and `title` contains compound `" at "`, instantly healing legacy records to render with proper employer headers and role subtitles.

---

## [1.17.0] - 2026-11-16

### Added
- **Promoted PM Operations Dashboard to Primary Website Index (`index.html`, `dashboard.js`):**
  - Replaced the primary website landing page at root (`index.html`) with the full PM Operations Command Center interface.
  - Enabled immediate access to the 14-day retention hotlist, multi-queue triage (Active List, Applied & Tracking, Dismissed / Hidden), tailored resume assignment, automated application submission engine, and manual URL metadata scanner directly from the root domain (`https://j.synopsdigital.com/`).
- **Legacy Search Criteria Archival (`search.html`):**
  - Archived the original keyword criteria editing and public listing board to `search.html`.
  - Added dedicated "Search Config" navigation button in the dashboard header linking to `search.html`, ensuring continuous access to Shopify-tag keyword editing and profile search preferences.
- **Environment & Path-Aware Multi-Context Data Fetching (`dashboard.js`, `dashboard/dashboard.js`):**
  - Implemented dynamic path resolver (`BASE_DATA_PATH = isDashboardSubdir ? '../' : './'`) to automatically resolve static JSON feeds (`jobs_data.json`, `job_applications.json`, `profile.json`, `applicant_profile.json`) regardless of whether the dashboard is loaded from root (`/`) or subdirectory (`/dashboard/`).
  - Added brand logo (`synops_logo.jpg`) to the dashboard header for visual alignment and automated CI/CD asset crawler validation.

### Changed
- **Subdirectory Redirection & Route Canonicalization (`server.js`, `dashboard.html`, `dashboard/index.html`):**
  - Updated `dashboard.html` to redirect directly to the primary root (`./`).
  - Configured `dashboard/index.html` with instant client-side redirection to canonical root (`../`).
  - Configured Express route handler in `server.js` to issue HTTP 301 Permanent Redirects from `/dashboard` and `/dashboard/` to `/`.
- **Deployment Manifest & Version Bump (`.cpanel.yml`, `package.json`):**
  - Added `dashboard.js` and `search.html` to `.cpanel.yml` deployment tasks.
  - Bumped project version to `v1.17.0`.

---

## [1.16.0] - 2026-11-16

### Added
- **State-Restricted Job Description Location Scanning (`geo_helper.js`, `ats_scraper.js`, `scraper.js`, `server.js`, `dashboard/api.php`, `dashboard/dashboard.js`):**
  - Integrated `detectLocationAndWorkType()` deep JD scanning engine across Greenhouse, Lever, Ashby, SmartRecruiters, tech feeds, and manual URL imports.
  - Detects remote and hybrid roles restricted to a specific subset/group of US states (e.g. eligible states, participating states, list of state abbreviations/names, etc.).
  - Normalizes restricted listings to display primary location as **`limited, US`** with the sub title indicating **`Remote`** or **`Hybrid`**.
- **25-Item Results Pagination Bar (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Implemented client-side pagination limited to 25 items per page (`TRIAGE_PAGE_SIZE = 25`) with `Previous`, `Page X of Y (<total> roles)`, and `Next` navigation controls.
  - Automatically resets to Page 1 on search queries, Span scope changes, salary threshold adjustments, and work setup filter toggles.

### Changed
- **Removed 4 KPI Metric Cards (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Completely removed `.dash-metrics-grid` from the top of the dashboard for a streamlined, table-focused layout.
  - Added safe null-checking guards for metric elements in `dashboard.js`.
- **Dynamic Active Tab Counter Format (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Transformed the primary tab header into a dynamic display counter: `Active List <Displayed/Total>` (e.g., `Active List <25/140>`).
- **Span Filter Expansion (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Renamed `Time Horizon:` dropdown to **`Span:`**.
  - Added a **`1 Week`** (7d) scope option alongside `72h Hotlist` and `2 Weeks` (14d archive).
- **Manual Application Add CTA Simplification (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Replaced `Scan & Track` button with simplified **`Track`** CTA (no icon, no "Scan"), displaying `Tracking...` during URL scanning.
- **Cache-Busting Asset Synchronization (`dashboard/index.html`):**
  - Updated script reference to `dashboard.js?v=1.16.0&t=20261116f`.

---

## [1.15.0] - 2026-11-16

### Added
- **Manual Job Entry & Posting URL Metadata Scanner (`dashboard/api.php`, `server.js`, `dashboard/index.html`, `dashboard/dashboard.js`):**
  - Built an automated job posting URL scanner supporting Greenhouse, Lever, Ashby, SmartRecruiters, LinkedIn, and arbitrary career websites.
  - Multi-tier metadata extraction engine parses Greenhouse/Lever APIs, JSON-LD Schema.org `JobPosting` structured payloads, OpenGraph tags (`og:title`, `og:site_name`), HTML title fallbacks, salary regex patterns, and work setup classification (Remote/Hybrid/Onsite).
  - Added dedicated Manual Import Bar inside the **Applied & Tracking** view (`#manualImportSection`) allowing users to paste any job posting URL, select their assigned tailored resume, and click **Scan & Track**.
  - Injects the newly created line-item directly into `appliedJobsMap` with status `Applied` and synchronizes to cloud storage (`job_applications.json` via PHP atomic file locking) across all client devices.
- **Cache-Busting Asset Synchronization (`dashboard/index.html`):**
  - Updated script reference to `dashboard.js?v=1.15.0&t=20261116e`.

---

## [1.14.0] - 2026-11-16

### Changed
- **14-Day Maximum Archive Retention Policy (`verifier.js`, `scraper.js`, `main.js`):**
  - Reduced the system-wide maximum job retention policy from 30 days down to 14 days (2 weeks max).
  - Updated `verifier.js` pruning engine (`verifyAndPruneJobs`) and date validation (`isWithin14Days`) to automatically discard any posting older than 14 days from `jobs_data.json`.
  - Updated scraper pipeline output schema to `maxAgeDays: 14`.
  - Aligned public search board (`main.js`) client cache merging to filter against `FOURTEEN_DAYS_MS`.
- **Dashboard Time Horizon Scope Selector (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Added an interactive **Time Horizon** scope control directly alongside the queue navigation tabs, allowing users to toggle between:
    - `72h Hotlist` *(Default / Rapid triage mode)*
    - `Full 14-Day Archive (2 Weeks)` *(Comprehensive view of all verified roles up to 14 days old)*
  - Updated KPI Card 4 to display `<i data-lucide="database"></i> 14-Day Verified Roles`.
  - Dynamically updates active view metrics (`#metric24hCount`, `#metricHotlistLabel`) and table headers when toggling horizons.
- **Cache-Busting Asset Synchronization (`dashboard/index.html`):**
  - Updated script reference to `dashboard.js?v=1.14.0&t=20261116d`.

---

## [1.13.0] - 2026-11-16

### Changed
- **Results Table CTA Stack Redesign (`dashboard/dashboard.js`, `dashboard/index.html`):**
  - Reorganized the Active 72h Queue action column into an ergonomic 2-row layout:
    - Row 1: Full-width primary `Submit` button (`<i data-lucide="send"></i> <span>Submit</span>`).
    - Row 2: Compact 3-button sub-row (`.action-sub-row`) featuring icon-only controls aligned to their respective operations:
      - **Applied** (`.btn-applied`): Emerald green with `<i data-lucide="check"></i>`, allowing instant marking of completed submissions.
      - **Drop (Irrelevant)** (`.btn-drop`): Ruby red with `<i data-lucide="eye-off"></i>`, categorizing the drop as out-of-scope / irrelevant.
      - **Drop (Uninterested)** (`.btn-uninterested`): Warm amber with `<i data-lucide="thumbs-down"></i>`, categorizing the drop as an explicit candidate pass.
- **Drop Categorization & Telemetry (`dashboard/dashboard.js`):**
  - Upgraded `dismissJob(key, reason)` to persist distinct drop reasons (`Irrelevant` vs. `Uninterested`) to both cloud storage and local session state.
  - Formatted Dismissed Queue entries with color-coded reason badges (amber for `Uninterested`, crimson for `Irrelevant`).
- **Cache-Busting Asset Synchronization (`dashboard/index.html`):**
  - Updated script reference to `dashboard.js?v=1.13.0&t=20261116c`, preventing stale browser caches across all client devices.

---

## [1.12.0] - 2026-11-16

### Added
- **Candidate Profile & Multi-Resume Document Ingestion (`applicant_profile.json`, `profile.json`, `submission_engine.js`, `dashboard/dashboard.js`, `uploads/resumes/metadata.json`, `server.js`):**
  - Integrated candidate profile for William Tan (San Diego, CA, +1.619.928.9574, `wtan.web404@gmail.com`, $160k target salary, 10+ years enterprise IT & WebOps).
  - Ingested two verified resume documents into `uploads/resumes/` and embedded complete Base64 payloads into `uploads/resumes/metadata.json`:
    - Corporate / IT Lead & Operations: `William Tan - Resume.docx` (Release Management, ServiceNow, WebOps, DevOps, Governance).
    - Web Operations & E-commerce: `William Tan - E-commerce Resume.docx` (Shopify Theme Architecture, Web Architecture, CRO, Integrations).
  - Built automatic file reconstitution on backend server startup and download routes, ensuring `.docx` files are re-generated on disk whenever missing.
  - Enhanced client-side `downloadResume()` to detect `.docx` MIME types and stream downloads seamlessly across browsers.

### Changed
- **Header & Branding Simplification (`dashboard/index.html`):**
  - Removed the `PM Command Center` pillbox badge (`.dash-badge-live`) from the navigation bar.
  - Removed the logo image icon (`.brand-logo-img`) adjacent to the brand name, presenting a clean, modern typographic identity (`SCRAPEDEEZ`).
  - Updated document title to `Scrapedeez — Operations Dashboard` and shortened the modal header to `Resumes`.
  - Dropped `Variations` text from the action CTA button (`<span>Resume</span>`).
- **Results Action Stack Optimization (`dashboard/dashboard.js`):**
  - Removed the redundant `View` CTA button from the right column action stack in both the Active 72h Queue and Applied/Tracking Queue. Clicking the role title already opens the original posting in a new tab.
- **Work Setup Policy — Strict Onsite Exclusion (`dashboard/index.html`, `dashboard/dashboard.js`, `scraper.js`, `ats_scraper.js`):**
  - Removed `Onsite Only` option from the Work Setups dropdown (`#triageWorkTypeFilter`), retaining `All Setups (Remote & Hybrid)`, `Remote Only`, and `Hybrid Only`.
  - Filtered out all `Onsite` postings in dashboard rendering (`getActiveFilteredJobs`), feed scrapers (RemoteOK, WeWorkRemotely, Remotive, Jobicy), ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters), and multi-feed deduplication (`mergeAndDeduplicateJobs`).
- **Deep JD Keyword Scanning Across All Scrapers (`scraper.js`, `ats_scraper.js`):**
  - Upgraded WeWorkRemotely RSS feed scraper to parse the full `<description>` body for each item, matching target roles and keywords against both title and description text.
  - Aligned deep JD scanning across all ATS platforms while preserving strict IT role negative guardrails against HR, Finance, and non-technical Product Managers.

---

## [1.11.0] - 2026-11-16

### Added
- **Upstream Deployment Status Merging Architecture (`scripts/merge_applications.js`, `.github/workflows/deploy.yml`, `package.json`):**
  - Engineered bidirectional timestamp-reconciled synchronization engine preventing upstream deployments from overwriting candidate pipeline states.
  - Automatically unions and merges `Saved`, `Applied`, `Interviewing`, `Offer`, `Rejected`, and `Dismissed` (Dropped) job records between upstream remote servers and incoming deployment builds.
  - Integrated pre-deploy reconciliation step into GitHub Actions workflow (`.github/workflows/deploy.yml`).
  - Added `npm run sync:upstream` CLI command in `package.json` for one-command bidirectional synchronization.
- **IT Role Specialization & Negative Filter Guardrails (`config.json`, `scraper.js`, `ats_scraper.js`, `dashboard/dashboard.js`, `server.js`):**
  - Statically targeted core IT engineering and operations leadership titles: `Staff Engineer`, `Technical Program Manager` (TPM), `Website Operations` / `Web Operations` / `WebOps Manager`, `Web Manager` / `Website Manager`, `Forward Deploy Manager` / `Forward Deployed Engineer`, `Release Manager` / `Release Engineer`, `DevOps Manager` / `DevOps Lead`, `Infrastructure Manager`, and `Site Reliability Manager`.
  - Implemented strict negative filtering rules across Greenhouse, Lever, Ashby, SmartRecruiters, RemoteOK, Remotive, Jobicy, and the dashboard feed, automatically dropping non-technical Product Managers (`Product Manager`, `Product Owner`, `Product Marketing`), HR / Talent Acquisition (`Human Resources`, `Recruiter`, `People Operations`), and Finance / Accounting (`Finance`, `Accounting`, `Controller`, `Payroll`).
- **Command Center 2-Row 2/3 : 1/3 Search Toolbar Overhaul (`dashboard/index.html`, `dashboard/styles.css`):**
  - Redesigned header controls into two separate inline card containers side-by-side: `.triage-search-panel` (Left) and `.triage-cta-panel` (Right).
  - Built a 2-row, 2/3 : 1/3 grid inside the search box:
    - Left side (2/3 width): Search input on Row 1; Sources dropdown on Row 2 directly underneath at the exact same width.
    - Right side (1/3 width): Manual numeric salary input (`<input type="number">`) with leading currency indicator (`$`) on Row 1; Work Setups dropdown on Row 2 underneath.
  - Housed Profile and Resume Variations CTA buttons in a distinct dedicated container side-by-side with the search module.

---

## [1.10.0] - 2026-11-16

### Added
- **Cross-Device Cloud State Synchronization (`dashboard/api.php`, `api.php`, `dashboard/dashboard.js`, `main.js`, `server.js`):**
  - Resolved local browser session isolation (`localStorage`), enabling triage sorting and actions (Mark as Applied, Drop / Dismiss, Restore, Status Lifecycle transitions) and Candidate Profile settings to persist permanently across all devices (desktop workstation, laptop, mobile phone, tablet, and across different browsers).
  - Built high-performance server-side persistence API (`dashboard/api.php` and root proxy `api.php`) with atomic file locking (`LOCK_EX`) managing `job_applications.json` and `profile.json` natively under Apache/PHP on cPanel.
  - Engineered Node.js development server parity in `server.js`, dynamically mounting `/api.php` and `/dashboard/api.php` prior to static asset middleware.
  - Implemented multi-tier cloud hydration in `dashboard/dashboard.js`: instant zero-flicker render from client cache, followed by authoritative cloud merge and automated legacy local session data migration.
  - Connected public search board (`main.js`) to live cloud tracking state, ensuring dismissed roles remain hidden and applied badges display consistently everywhere.
- **Automated Deployment State Shield (`.github/workflows/deploy.yml`):**
  - Added `job_applications.json` and `profile.json` to the FTP deployment `exclude:` configuration.
  - Prevents automated 12-hour GitHub Actions deployment runs from overwriting live candidate tracking records.

---

## [1.9.0] - 2026-11-15

### Added
- **Deep Job Description (JD) Salary Scanner (`salary_extractor.js`, `ats_scraper.js`, `scraper.js`):**
  - Built an NLP/regex compensation extraction engine scanning full job description HTML and text.
  - Automatically captures annual ranges, hourly contract rates (converted to 2,080h annual equivalent), and foreign currency pay packages.
  - Bound scanner to Greenhouse (`job.content`), Lever (`job.descriptionPlain` + `additionalPlain`), Ashby (`job.compensation` + descriptions), SmartRecruiters, and remote feeds (RemoteOK, WeWorkRemotely, Remotive).
- **Interactive Search Bar Salary Minimum Filter (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Added a dedicated minimum salary filter dropdown to the PM Operations search toolbar (`triageSalaryFilter`) with thresholds: `Any Salary`, `$100k+`, `$120k+`, `$140k+`, `$160k+`, `$180k+`, `$200k+`.
  - Filter logic in `getActiveFilteredJobs()` evaluates the job's compensation ceiling against the selected threshold, instantly hiding roles that fail to meet the user's minimum pay requirement.
  - Candidate profile target annual salary preserved as an independent ATS payload auto-fill data point.

---

## [1.8.0] - 2026-11-15

### Added
- **Dedicated Pop-up Modals for Candidate Profile & Resume Variations (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Retired the static two-column layout, elevating the PM Command Center to a 100% full-width operational triage workspace.
  - Housed candidate profile configuration inside `#candidateProfileModal` with dual tabs (`Contact Info` & `Field Resolution`), clean "Profile" title, and simplified "Save" action button.
  - Housed resume variation dropzone and saved variation management inside `#resumeVariationsModal`.
  - Added side-by-side CTA triggers in the search header toolbar, spanning the full width of the results table below.
- **Multi-Currency Normalization & Automated USD Conversion (`dashboard/dashboard.js`, `main.js`, `styles.css`):**
  - Integrated automatic currency conversion engine (`formatSalaryUSD`) converting GBP (£), EUR (€), CAD (C$), AUD (A$), INR (₹), and CHF to USD at standard exchange rates.
  - Added subtle `conv.` notation badge on converted salaries to provide transparent exchange auditability.
- **72-Hour Operational Cutoff Expansion (`dashboard/dashboard.js`, `server.js`, `dashboard/index.html`):**
  - Expanded active queue window from 24h to 72h (`SEVENTY_TWO_HOURS_MS`), ensuring comprehensive multi-day coverage.
  - Updated queue badge to `Active 72h Queue` and metric card to `72h Hotlist Positions`.

### Changed
- **Header & Navigation Streamlining (`dashboard/index.html`):**
  - Converted Test Inspector and Re-Scan buttons to minimalist icon-only controls.
  - Removed public board link from the operations header.
  - Removed top title and hero banner section, elevating KPI tile stats to the top of the viewport.
- **High-Density Results Table Overhaul (`dashboard/dashboard.js`, `dashboard/index.html`):**
  - Removed company pillbox styling in column 1; now formatted with clean company title and smaller italicized source/ATS subtitle.
  - Removed badge icons in column 2; reduced badge padding and font size for high density.
  - Renamed resume column header to `Resume`.
  - Stacked action CTA buttons vertically (`View`, `Submit`, `Applied`, `Drop`) into an ultra-narrow 90px column.

---

## [1.7.0] - 2026-11-15

### Added
- **Multi-Queue Triage Switcher & Application Tracking Hub (`dashboard/index.html`, `dashboard/dashboard.js`):**
  - Added a 3-tab pipeline switcher to the PM Operations Command Center:
    - **`🔥 Active 24h Queue`**: Fresh unapplied roles with real-time count badges.
    - **`📋 Applied & Tracking Queue`**: Dedicated queue tracking all submitted and manually completed applications with submission timestamps, tailored resume references, and status lifecycle dropdowns (`Applied`, `Interviewing`, `Offer`, `Archived`, `Rejected`).
    - **`🚫 Dismissed / Hidden Queue`**: Archive of dropped/irrelevant listings with 1-click "Restore" action.
  - Added per-row quick action controls:
    - **`Applied`**: 1-click checkmark action to mark applications filled out directly on employer career portals.
    - **`Drop`**: 1-click hide/dismiss action to discard irrelevant or non-fitting listings from the active feed.
  - Added batch sticky actions: **"Mark Selected as Applied"** and **"Drop Selected as Irrelevant"**.
  - Automatically moves any submitted job (via API or assisted packages) directly into the Applied Tracking Queue.
- **Public Search Board Curation & Application Badges (`main.js`, `styles.css`):**
  - Excluded dismissed/irrelevant postings from the main public search feed.
  - Added **`✅ Applied`** status badge on public job cards to clearly indicate positions already submitted.
  - Added quick card action buttons ("Mark Applied" & "Drop") to curate the feed directly from the public board.
- **Backend Tracking Persistence API (`server.js`):**
  - Enhanced `POST /api/jobs/application-status` and added `POST /api/jobs/application-batch-status` for syncing application tracking states and restoration to `job_applications.json`.
  - Maintained client-side `localStorage` (`scrapedeez_job_applications`) caching for offline and static Apache deployment compatibility.

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.7.0`.

---

## [1.6.1] - 2026-11-15

### Added
- **Direct Job Posting Inspection Link (`dashboard/dashboard.js`, `dashboard/index.html`):**
  - Added a dedicated "View" button (`<a target="_blank">`) with an external-link icon in the 24-hour Hotlist triage table alongside the "Submit" action.
  - Allows PMs and reviewers to inspect the original live job posting on Greenhouse, Lever, Ashby, or source job boards in a separate tab before or after dispatching submissions.
  - Enhanced table header to "Actions" with minimum column width styling and updated script cache-busting to `v1.4.3`.

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.6.1`.

---

## [1.6.0] - 2026-11-14

### Added
- **Production HTTP Basic Auth Shield (`dashboard/.htaccess`, `.htpasswd`, `.htaccess`):**
  - Locked production PM Operations Command Center (`/dashboard/` and `/dashboard.html`) behind an Apache HTTP Basic Authentication challenge.
  - Production requests without credentials receive HTTP 401 Unauthorized; authenticated requests receive HTTP 200 OK.
  - Preserved unshielded access for development environments (`dev.j.synopsdigital.com`).
  - Stored production credentials securely outside the repository at `D:\Projects\jscrape_prod_credentials.txt`.
- **Resilient CI/CD Post-Deploy Verification (`tests/qa-check.sh`, `.github/workflows/deploy.yml`):**
  - Added 12-round health verification poll during Phusion Passenger server restart buffers.
  - Implemented 3-attempt backoff retry loop in `check_endpoint` and `check_header` for transient reload states.
  - Updated crawler to validate `HTTP 401 Unauthorized` as a passing protected asset response during CI/CD audit verification.
  - Excluded `data:` URI scheme placeholders from automated link crawler.
  - Conditioned `.htaccess` FTP deployment rule to deploy root and directory shielding configurations to production while preserving subdomain routing in dev/stage.

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.6.0`.

---

## [1.5.1] - 2026-11-14

### Added
- **Real-World Live ATS Schema Introspection Probe (`tests/live_real_world_inspection.js`):**
  - Created live probe harness fetching actual production schemas from Greenhouse (Figma, Cloudflare) and Lever (Palantir).
  - Validated real-world API status (HTTP 200) and live question taxonomies across production career boards.

### Fixed
- **Heuristic Refinements from Live Schema Testing (`submission_engine.js`):**
  - Disambiguated "Legal Name" from legal work authorization questions.
  - Disambiguated "Privacy Notice / Policy" acknowledgements from employment notice period questions.
  - Added auto-mapping for candidate work location / remote residence questions (`"From where do you intend to work?"` &rarr; `San Francisco, CA`).
  - Added auto-mapping for prior employment / contractor association questions (`"Have you ever worked for..."` &rarr; `"No"`).
  - Added auto-acceptance for candidate privacy notices and policy consent questionnaires (`"Yes"` / `"Acknowledge"`).

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.5.1`.

---

## [1.5.0] - 2026-11-14

### Added
- **Mock ATS Application & Live Payload Inspector (`dashboard/test-application.html`):**
  - Built an interactive, high-fidelity mock enterprise job application page (*Acme Cloud Technologies — Director of WebOps & Reliability*).
  - Simulates 10 divergent ATS questions covering legal work authorization, visa sponsorship, target compensation, notice periods, referral attribution, EEOC disclosures, cover summary, and resume attachments.
  - Interactive live telemetry inspector displaying real-time field resolution diagnostics, matching rules, raw outgoing HTTP POST JSON payload, and server receipts.
- **Dynamic Field Resolution Test Harness Script (`tests/run_test_submission.js`):**
  - Built a Node.js verification harness executing the entire pipeline end-to-end: introspecting target schema questions, applying semantic keyword matching heuristics, generating formatted JSON payloads, and recording verified audit receipts in `submissions_log.json`.
- **Backend Mock Ingestion Endpoint (`server.js`):**
  - Added `POST /api/test/mock-ats-submit` endpoint receiving and validating test payloads with candidate telemetry and resume confirmation.
- **Operations Dashboard Integration (`dashboard/index.html`):**
  - Added direct navigation button `🧪 Test Schema Inspector` linking to the mock ATS application page.

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.5.0`.

---

## [1.4.2] - 2026-11-14

### Fixed
- **Zero-Network Client-First Resume Storage (`dashboard/dashboard.js`):**
  - Added smart environment detector (`isLocalBackend()`). On live static hosting (`dev.j.synopsdigital.com`), bypasses unnecessary backend POST requests entirely, persisting uploaded resume variations directly into browser storage (`localStorage` + in-memory store) with 0ms latency.
  - Eliminated the `Unexpected token 'c'` syntax error caused by Apache rewrite rules serving `server.js` plaintext on non-existent API routes.
  - Replaced all remaining raw `alert()` popups with non-intrusive in-app toast feedback (`showToast()`).
- **Strict Anti-Cache & Cache-Busting Headers (`dashboard/index.html`):**
  - Updated asset version query parameter to `<script src="dashboard.js?v=1.4.2&t=20261114c"></script>` to force immediate cache revalidation in client browsers.
  - Added anti-cache HTTP-equiv headers (`Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`).

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.4.2`.

---

## [1.4.1] - 2026-11-14

### Fixed
- **Candidate Profile Instant Auto-Population (`dashboard/dashboard.js`, `dashboard/index.html`):**
  - Resolved blank profile inputs on initialization by adding multi-tier fallback loading: user `localStorage` overrides &rarr; direct static fetch of `../applicant_profile.json` &rarr; built-in canonical default profile (Will Tan / Synops Digital).
  - Unblocked profile inputs: Removed HTML `required` constraints on name and email to prevent intrusive browser validation tooltips and eliminate perceived prerequisites.
  - Added visual "Auto-Populated" status badge in candidate profile card header.
- **Resilient Resume Upload Engine (`dashboard/dashboard.js`):**
  - Fixed syntax error crash caused by `await res.json()` on non-JSON server responses; added safe JSON text parsing with automatic fallback to client-side storage (`localStorage` + Base64 storage).
  - Streamlined 1-click upload: Removed `required` constraint from "Variation Label"; automatically auto-derives and formats variation label from document filename (e.g. `Will_Tan_DevOps_Lead.pdf` &rarr; `Will Tan DevOps Lead`).
  - Switched file reading to asynchronous `FileReader` promise to eliminate race conditions between file selection and form submission.
  - Pre-seeded default variations ("DevOps & Cloud Infrastructure Lead", "WebOps & Engineering Manager") so the vault is populated and operational out of the box.
  - Added non-intrusive floating toast notifications (`showToast()`) replacing disruptive browser alert dialogs.

### Changed
- **Version Bump (`package.json`):** Bumped to `v1.4.1`.

---

## [1.4.0] - 2026-11-14

### Added
- **Dynamic Field Resolution Engine (`submission_engine.js`):**
  - **Extended Candidate Profile Knowledge Base**: Extended `applicant_profile.json` with canonical defaults for legally authorized work status (`legallyAuthorized`), visa sponsorship (`requiresSponsorship`), desired compensation (`desiredSalary`), availability/notice period (`noticePeriod`), referral source (`referralSource`), and EEOC demographic defaults.
  - **Fuzzy Question Mapping Heuristics**: Added `resolveFieldAnswer()` matching divergent form fields across greenhouse, lever, and custom schemas using keyword and semantic rules.
  - **Pre-Flight Schema Introspection**: Engine fetches question schemas via Greenhouse and Lever public endpoints before dispatching payloads, auto-mapping matching values into structured POST payloads.
- **Dedicated `/dashboard` Directory & Path Architecture (`dashboard/`):**
  - Moved PM Operations Command Center to dedicated directory: `dashboard/index.html` and `dashboard/dashboard.js`.
  - Added native Express route handlers for `/dashboard` and `/dashboard/`.
  - Configured transparent middleware forwarding `/dashboard/api/*` requests to `/api/*` for zero-configuration client-server communication.
  - Added root `dashboard.html` fallback redirect to `dashboard/`.
  - Updated `.cpanel.yml` to automatically create and deploy `$DEPLOYPATH/dashboard/`.
- **Dashboard Field Resolution Tab (`dashboard/index.html`):**
  - Added dual-tab profile editor with "Contact Info" and "Field Resolution (Auto-Fill)" enabling the PM to customize auto-resolved answers on the fly.

### Changed
- **Public Navigation Link (`index.html`):** Updated PM Dashboard button to navigate directly to `dashboard/`.
- **Version Bump (`package.json`):** Bumped to `v1.4.0`.

---

## [1.3.0] - 2026-11-14

### Added
- **Dedicated Standalone PM Operations Command Center (`dashboard.html` / `dashboard.js`):**
  - Built an executive, high-density operations dashboard completely decoupled from the public job board.
  - **Candidate Profile & Resume Vault**: Form for applicant details (Full Name, Email, Phone, Location, LinkedIn, GitHub, Portfolio, Executive Note) and custom tailored resume storage.
  - **24-Hour Review & Triage Table**: Tabular review interface with checkboxes, real-time search, work setup filters (Remote/Hybrid/Onsite), and per-role tailored resume assignment.
  - **Sticky Batch Dispatch Bar**: Floating action bar showing selected count, bulk resume assigner, and 1-click **"🚀 Submit Selected Applications"** trigger.
  - **Live Receipts & Audit Trail**: Real-time logging table tracking every dispatched application, timestamp, resume version, and status receipt.
- **Automated Submission Engine (`submission_engine.js`):**
  - **Greenhouse Board Application Submitter**: Direct API integration posting candidate metadata and base64 encoded resume file to `https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{jobId}`.
  - **Lever Postings Application Submitter**: Direct API integration posting candidate metadata and resume to `https://api.lever.co/v0/postings/{company}/{jobId}`.
  - **Assisted Pre-Packaged Dispatch**: Pre-configures tailored resume attachments and pre-fills application payloads for Ashby, feeds, and custom career portals.
  - **Backend Submission Endpoints**:
    - `POST /api/submissions/queue`: Batch runner processing array of approved roles.
    - `GET /api/submissions/logs`: Fetches audit receipts from `submissions_log.json`.
    - `GET/POST /api/profile`: Saves and updates persistent candidate details in `applicant_profile.json`.
    - `GET /api/dashboard/summary`: Single consolidated endpoint returning composite dashboard telemetry.

### Changed
- **Restored Public Job Board (`index.html`):** Removed modal overlays from the main homepage to keep it clean and focused, adding a direct header link to the PM Command Center (`dashboard.html`).
- **Deployment Pipeline (`.cpanel.yml`):** Added `dashboard.html`, `dashboard.js`, and `submission_engine.js` to automated file synchronization tasks.

---

## [1.2.0] - 2026-11-14

### Added
- **Tier 1 & Tier 2 Raw Source Expansion:**
  - **Ashby HQ ATS Integration (`ats_scraper.js`):** Direct REST harvesting via `https://api.ashbyhq.com/posting-api/job-board/{company}` for 13 high-growth tech companies (Linear, Ramp, OpenAI, Perplexity, Cursor, Notion, Sentry, Temporal, Replit, Modal, Warp, Supabase, Pinecone).
  - **SmartRecruiters ATS Integration (`ats_scraper.js`):** Direct harvesting via `https://api.smartrecruiters.com/v1/companies/{company}/postings`.
  - **Remotive Tech Feed (`scraper.js`):** Ingestion for curated DevOps and Software Development remote jobs via `https://remotive.com/api/remote-jobs`.
  - **Jobicy Remote Feed (`scraper.js`):** Ingestion for remote engineering and tech management roles via `https://jobicy.com/api/v2/remote-jobs`.
  - Added target tracking lists and configurations in `config.json`.
- **24-Hour Expedited Review Hub & Hotlist Pipeline:**
  - Added `GET /api/jobs/curated-24h` endpoint filtering postings published within the past 24 hours.
  - Added interactive **24-Hour Review Hub Modal** with live badge indicator in header displaying active 24h count.
  - Card view featuring posting age (e.g., "2h ago"), direct application links, role classification tags, and status bookmarking.
- **Resume Variation Vault & Management:**
  - Added server-side variation storage in `uploads/resumes/` with metadata tracking in `metadata.json`.
  - Added endpoints: `GET /api/resumes`, `POST /api/resumes/upload`, `DELETE /api/resumes/:id`, and `GET /api/resumes/:id/download`.
  - Built interactive upload form supporting tailored resumes (PDF, DOCX) by specialization (e.g. DevOps Focus, WebOps Focus, IT Director Focus).
- **Assisted 1-Click Application Launchpad & Tracking:**
  - Integrated direct "Apply Now" trigger that opens job applications in a new tab, triggers download/attachment of the selected resume variation, and marks the position as `Applied`.
  - Added application status tracking endpoints: `GET /api/jobs/applications` and `POST /api/jobs/application-status` with persistent tracking in `job_applications.json`.
  - Added dedicated "Application Tracker" tab in the modal with filtering by Applied and Saved.

### Changed
- Updated `main.js` source filtering to include Ashby, SmartRecruiters, Remotive, and Jobicy across ATS and Feed filters.
- Updated `.cpanel.yml` to copy `zip3_centroids.js` and initialize `uploads/resumes/` during deployment.
- Updated `.gitignore` to prevent tracking uploaded resume files while preserving directory structure.
