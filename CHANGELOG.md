# Changelog — jScrape (scrapedeez)

All notable changes to the jScrape project are documented in this file.

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
