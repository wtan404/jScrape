/* ==========================================================================
   Scrapedeez — Hourly Automated Scraper & Link Verifier Engine
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  fetchJobsDatabase();

  // Tick live time elapsed badge every 10 seconds
  setInterval(updateElapsedBadge, 10000);
});

async function fetchJobsDatabase() {
  const jobsList = document.getElementById('jobsList');
  try {
    // Try static jobs_data.json first (works on standard static web hosts)
    let response = await fetch('jobs_data.json');
    if (!response.ok) {
      response = await fetch('api/jobs');
    }
    
    if (!response.ok) {
      renderJobs([]);
      return;
    }

    const data = await response.json();
    allJobsData = data.jobs || [];

    const totalEl = document.getElementById('totalMatchesCount');
    const timeEl = document.getElementById('lastScrapedTime');

    if (totalEl) totalEl.textContent = data.totalMatches || allJobsData.length;
    
    if (data.lastScraped) {
      lastScrapedTimestamp = new Date(data.lastScraped).getTime();
      if (timeEl) timeEl.textContent = formatDate(data.lastScraped);
      updateElapsedBadge();
    }

    renderJobs(allJobsData);
  } catch (err) {
    console.error('Initial job database fetch error:', err);
  }
}

function updateElapsedBadge() {
  const badgeText = document.getElementById('elapsedTimerText');
  if (!badgeText) return;

  if (!lastScrapedTimestamp || isNaN(lastScrapedTimestamp)) {
    badgeText.textContent = 'Refreshed just now';
    return;
  }

  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - lastScrapedTimestamp) / 1000));

  if (elapsedSec < 15) {
    badgeText.textContent = 'Refreshed just now';
  } else if (elapsedSec < 60) {
    badgeText.textContent = `Refreshed ${elapsedSec}s ago`;
  } else if (elapsedSec < 3600) {
    const mins = Math.floor(elapsedSec / 60);
    badgeText.textContent = `Refreshed ${mins}m ago`;
  } else {
    const hours = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    badgeText.textContent = mins > 0 ? `Refreshed ${hours}h ${mins}m ago` : `Refreshed ${hours}h ago`;
  }
}

async function triggerScrapeNow() {
  const btn = document.getElementById('btnScrape');
  const jobsList = document.getElementById('jobsList');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Re-Verifying & Rescanning...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  if (jobsList) {
    jobsList.innerHTML = `
      <div class="loading-state">
        <i data-lucide="loader-2" class="spin"></i>
        <p>Re-verifying link availability of existing jobs & checking all feeds for new postings...</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  try {
    let res = await fetch('api/scrape-now', { method: 'POST' });
    
    if (!res.ok) {
      // Re-fetch static data as fallback
      await fetchJobsDatabase();
      return;
    }

    const data = await res.json();
    allJobsData = data.jobs || [];

    if (data.scrapedAt) {
      lastScrapedTimestamp = new Date(data.scrapedAt).getTime();
      updateElapsedBadge();
    }

    renderJobs(allJobsData);
  } catch (err) {
    // If backend not active, re-fetch static data
    await fetchJobsDatabase();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Re-Verify & Rescan Now</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderJobs(jobs) {
  const jobsList = document.getElementById('jobsList');
  const totalEl = document.getElementById('totalMatchesCount');

  if (totalEl) totalEl.textContent = jobs.length;
  if (!jobsList) return;

  if (jobs.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <i data-lucide="briefcase"></i>
        <p>No active verified job postings available right now. Click <strong>Re-Verify & Rescan Now</strong> above.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  jobsList.innerHTML = jobs.map(job => `
    <article class="job-card ${job.isNew ? 'is-new' : ''}">
      <div class="job-info">
        <div class="job-meta-top">
          ${job.isNew ? '<span class="badge-new">NEW ROLE</span>' : '<span class="badge-verified"><i data-lucide="check"></i> VERIFIED LIVE</span>'}
          <span class="job-company">${escapeHtml(job.company)}</span>
          <span class="job-source">${escapeHtml(job.source)}</span>
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
      job.location.toLowerCase().includes(query) ||
      (job.matchedKeyword && job.matchedKeyword.toLowerCase().includes(query));

    let matchSource = true;
    if (sourceFilter === 'new') {
      matchSource = job.isNew === true;
    } else if (sourceFilter === 'ats') {
      matchSource = job.source.includes('Greenhouse') || job.source.includes('Lever');
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
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
