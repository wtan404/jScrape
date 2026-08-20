/* ==========================================================================
   Scrapedeez — Interactive Dashboard Engine
   ========================================================================== */

let allJobsData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  fetchJobsDatabase();
});

async function fetchJobsDatabase() {
  const jobsList = document.getElementById('jobsList');
  try {
    const response = await fetch('/api/jobs');
    const data = await response.json();

    allJobsData = data.jobs || [];

    // Update Telemetry Header Metrics
    const totalEl = document.getElementById('totalMatchesCount');
    const timeEl = document.getElementById('lastScrapedTime');

    if (totalEl) totalEl.textContent = data.totalMatches || allJobsData.length;
    if (timeEl && data.lastScraped) {
      timeEl.textContent = formatDate(data.lastScraped);
    }

    renderJobs(allJobsData);
  } catch (err) {
    if (jobsList) {
      jobsList.innerHTML = `
        <div class="empty-state">
          <p>Failed to connect to Scrapedeez server. Please start backend server via <code>npm start</code>.</p>
        </div>
      `;
    }
  }
}

async function triggerScrapeNow() {
  const btn = document.getElementById('btnScrape');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Scraping Feeds...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/scrape-now', { method: 'POST' });
    const data = await res.json();
    fetchJobsDatabase();
  } catch (err) {
    alert('Scrape request failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Scrape Jobs Now</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderJobs(jobs) {
  const jobsList = document.getElementById('jobsList');
  if (!jobsList) return;

  if (jobs.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <p>No matching IT Manager, WebOps, or DevOps job postings found for this search filter.</p>
      </div>
    `;
    return;
  }

  jobsList.innerHTML = jobs.map(job => `
    <article class="job-card">
      <div class="job-info">
        <div class="job-meta-top">
          <span class="job-company">${escapeHtml(job.company)}</span>
          <span class="job-source">${escapeHtml(job.source)}</span>
          <span class="job-matched-badge">Match: ${escapeHtml(job.matchedKeyword)}</span>
        </div>
        <h3 class="job-title">${escapeHtml(job.title)}</h3>
        <div class="job-footer-info">
          <span><i data-lucide="map-pin"></i> ${escapeHtml(job.location || 'Remote')}</span>
          <span><i data-lucide="clock"></i> ${formatDate(job.date)}</span>
        </div>
      </div>
      <div class="job-action">
        <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">
          <span>View Posting</span>
          <i data-lucide="external-link"></i>
        </a>
      </div>
    </article>
  `).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function filterJobs() {
  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const source = document.getElementById('sourceSelect')?.value || 'all';

  const filtered = allJobsData.filter(job => {
    const matchQuery = !query || 
      job.title.toLowerCase().includes(query) || 
      job.company.toLowerCase().includes(query) || 
      job.matchedKeyword.toLowerCase().includes(query);

    const matchSource = source === 'all' || job.source === source;

    return matchQuery && matchSource;
  });

  renderJobs(filtered);
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
