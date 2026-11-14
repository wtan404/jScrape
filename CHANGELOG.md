# Changelog — jScrape (scrapedeez)

All notable changes to the jScrape project are documented in this file.

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
