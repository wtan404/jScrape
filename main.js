/* ==========================================================================
   Scrapedeez — Simple Search & Aggregator Engine
   ========================================================================== */

let allJobsData = [];
let currentConfig = {};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  fetchConfig();
  fetchJobsDatabase();
});

async function fetchJobsDatabase() {
  try {
    const response = await fetch('/api/jobs');
    if (!response.ok) return;
    const data = await response.json();

    allJobsData = data.jobs || [];
    renderJobs(allJobsData);
  } catch (err) {
    console.error('Failed to fetch initial job database:', err);
  }
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    currentConfig = await res.json();

    const searchInput = document.getElementById('targetKeywordsInput');
    const ghInput = document.getElementById('ghCompaniesInput');
    const serpInput = document.getElementById('serpApiKeyInput');

    if (searchInput && currentConfig.targetTitles) {
      searchInput.value = currentConfig.targetTitles.join(', ');
    }

    if (ghInput && currentConfig.greenhouseCompanies) {
      ghInput.value = currentConfig.greenhouseCompanies.join(', ');
    }

    if (serpInput && currentConfig.serpApiKey) {
      serpInput.value = currentConfig.serpApiKey;
    }
  } catch (err) {
    console.error('Config fetch failed:', err);
  }
}

async function executeJobSearch(e) {
  e.preventDefault();

  const searchVal = document.getElementById('targetKeywordsInput')?.value || '';
  const ghVal = document.getElementById('ghCompaniesInput')?.value || '';
  const serpKey = document.getElementById('serpApiKeyInput')?.value || '';

  const targetTitles = searchVal.split(',').map(s => s.trim()).filter(Boolean);
  const greenhouseCompanies = ghVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const btn = document.getElementById('btnSearch');
  const jobsList = document.getElementById('jobsList');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Searching & Aggregating...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  if (jobsList) {
    jobsList.innerHTML = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Querying company career boards & global job feeds for <strong>"${escapeHtml(targetTitles.join(', '))}"</strong>...</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  try {
    // 1. Save Config
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        targetTitles, 
        keywords: targetTitles.map(t => t.toLowerCase()), 
        greenhouseCompanies, 
        leverCompanies: currentConfig.leverCompanies || [], 
        serpApiKey: serpKey 
      })
    });

    // 2. Trigger Scrape Job
    const res = await fetch('/api/scrape-now', { method: 'POST' });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server returned HTTP ${res.status}: ${text.substring(0, 80)}`);
    }

    const data = await res.json();
    allJobsData = data.jobs || [];
    renderJobs(allJobsData);
  } catch (err) {
    if (jobsList) {
      jobsList.innerHTML = `
        <div class="empty-state">
          <p>Search failed: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="arrow-right"></i><span>Search & Aggregate Jobs</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderJobs(jobs) {
  const jobsList = document.getElementById('jobsList');
  const countBadge = document.getElementById('resultsCountBadge');

  if (countBadge) {
    countBadge.textContent = `${jobs.length} Postings Found`;
  }

  if (!jobsList) return;

  if (jobs.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="briefcase"></i>
        <p>No job postings found matching your search. Enter your target job titles or keywords above and click <strong>Search & Aggregate Jobs</strong>.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  jobsList.innerHTML = jobs.map(job => `
    <article class="job-card">
      <div class="job-info">
        <div class="job-meta-top">
          <span class="job-company">${escapeHtml(job.company)}</span>
          <span class="job-source">${escapeHtml(job.source)}</span>
          <span class="job-matched-badge">${escapeHtml(job.matchedKeyword)}</span>
        </div>
        <h3 class="job-title">${escapeHtml(job.title)}</h3>
        <div class="job-footer-info">
          <span><i data-lucide="map-pin"></i> ${escapeHtml(job.location || 'Remote')}</span>
          <span><i data-lucide="clock"></i> ${formatDate(job.date)}</span>
        </div>
      </div>
      <div class="job-action">
        <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">
          <span>View & Apply</span>
          <i data-lucide="external-link"></i>
        </a>
      </div>
    </article>
  `).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function filterFetchedResults() {
  const query = document.getElementById('subFilterInput')?.value.toLowerCase().trim() || '';

  const filtered = allJobsData.filter(job => {
    return !query || 
      job.title.toLowerCase().includes(query) || 
      job.company.toLowerCase().includes(query) || 
      job.location.toLowerCase().includes(query) ||
      job.matchedKeyword.toLowerCase().includes(query);
  });

  renderJobs(filtered);
}

function toggleAdvancedSettings() {
  const el = document.getElementById('advancedSettings');
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
