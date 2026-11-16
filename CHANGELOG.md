# Changelog — jScrape (scrapedeez)

All notable changes to the jScrape project are documented in this file.

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
