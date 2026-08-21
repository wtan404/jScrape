/* ==========================================================================
   Scrapedeez — Ever-Present Search Dashboard Engine
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
  const jobsList = document.getElementById('jobsList');
  try {
    const response = await fetch('/api/jobs');
    const data = await response.json();

    allJobsData = data.jobs || [];

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
          <p>Failed to connect to Scrapedeez server. Ensure local server is running on port 8090.</p>
        </div>
      `;
    }
  }
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    currentConfig = await res.json();

    const titlesInput = document.getElementById('targetTitlesInput');
    const keywordsInput = document.getElementById('keywordsInput');
    const ghInput = document.getElementById('ghCompaniesInput');
    const serpInput = document.getElementById('serpApiKeyInput');

    if (titlesInput && currentConfig.targetTitles) {
      titlesInput.value = currentConfig.targetTitles.join(', ');
    }
    if (keywordsInput && currentConfig.keywords) {
      keywordsInput.value = currentConfig.keywords.join(', ');
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

async function saveAndScrape(e) {
  e.preventDefault();

  const titlesVal = document.getElementById('targetTitlesInput')?.value || '';
  const keywordsVal = document.getElementById('keywordsInput')?.value || '';
  const ghVal = document.getElementById('ghCompaniesInput')?.value || '';
  const serpKey = document.getElementById('serpApiKeyInput')?.value || '';

  const targetTitles = titlesVal.split(',').map(s => s.trim()).filter(Boolean);
  const keywords = keywordsVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const greenhouseCompanies = ghVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const btn = document.getElementById('btnScrape');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Saving & Scraping All Sources...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    // 1. Save Config
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTitles, keywords, greenhouseCompanies, leverCompanies: currentConfig.leverCompanies || [], serpApiKey: serpKey })
    });

    // 2. Trigger Scrape Job
    const res = await fetch('/api/scrape-now', { method: 'POST' });
    const data = await res.json();

    fetchJobsDatabase();
  } catch (err) {
    alert('Save and Scrape failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Save & Scrape All Sources</span>`;
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
        <p>No matching postings found for your current target search terms. Adjust your search controls above and click <strong>Save & Scrape All Sources</strong>.</p>
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
          <span>Apply / View</span>
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
  const sourceFilter = document.getElementById('sourceSelect')?.value || 'all';

  const filtered = allJobsData.filter(job => {
    const matchQuery = !query || 
      job.title.toLowerCase().includes(query) || 
      job.company.toLowerCase().includes(query) || 
      job.matchedKeyword.toLowerCase().includes(query);

    let matchSource = true;
    if (sourceFilter === 'ats') {
      matchSource = job.source.includes('Greenhouse') || job.source.includes('Lever');
    } else if (sourceFilter === 'gjobs') {
      matchSource = job.source.includes('Google Jobs');
    } else if (sourceFilter === 'feeds') {
      matchSource = job.source.includes('RemoteOK') || job.source.includes('WeWorkRemotely');
    }

    return matchQuery && matchSource;
  });

  renderJobs(filtered);
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
