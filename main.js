/* ==========================================================================
   Scrapedeez — 3-Profile PIN Protected Job Engine
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;
let currentProfileId = 'profile1';
let profilesData = {};
let authenticatedPin = null;

const zipGeocodeCache = {};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  fetchProfiles();
  fetchJobsDatabase();

  setInterval(updateElapsedBadge, 10000);
});

async function fetchProfiles() {
  try {
    const res = await fetch('./api/profiles');
    if (!res.ok) return;
    const data = await res.json();

    profilesData = data.profiles || {};
    if (data.activeProfileId) {
      currentProfileId = data.activeProfileId;
      const dropdown = document.getElementById('profileSelectDropdown');
      if (dropdown) dropdown.value = currentProfileId;
    }
  } catch (err) {
    console.warn('Profiles fetch note:', err);
  }
}

function onProfileChange() {
  const dropdown = document.getElementById('profileSelectDropdown');
  if (!dropdown) return;

  currentProfileId = dropdown.value;
  authenticatedPin = null; // Lock criteria box when switching profiles
  lockProfileBox();
  fetchJobsDatabase();
}

function openPinModal() {
  const targetProf = profilesData[currentProfileId];
  const overlay = document.getElementById('pinModalOverlay');
  const heading = document.getElementById('pinModalHeading');
  const prompt = document.getElementById('pinModalPrompt');
  const errorMsg = document.getElementById('pinErrorMessage');
  const pinInput = document.getElementById('pinCodeInput');

  if (!overlay || !targetProf) return;

  if (errorMsg) errorMsg.style.display = 'none';
  if (pinInput) pinInput.value = '';

  if (!targetProf.hasPin) {
    if (heading) heading.textContent = 'Set New Security PIN';
    if (prompt) prompt.textContent = `No PIN set for ${targetProf.name}. Enter a 4-digit PIN to secure your search criteria.`;
  } else {
    if (heading) heading.textContent = 'Enter Security PIN';
    if (prompt) prompt.textContent = `Enter 4-digit security PIN to unlock & edit search criteria for ${targetProf.name}.`;
  }

  overlay.style.display = 'flex';
  if (pinInput) pinInput.focus();
}

function closePinModal() {
  const overlay = document.getElementById('pinModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitPinVerification(e) {
  e.preventDefault();

  const pinInput = document.getElementById('pinCodeInput');
  const errorMsg = document.getElementById('pinErrorMessage');
  const btn = document.getElementById('btnVerifyPin');

  const pinVal = pinInput ? pinInput.value.trim() : '';

  if (!/^\d{4}$/.test(pinVal)) {
    if (errorMsg) {
      errorMsg.textContent = 'PIN must be exactly 4 digits.';
      errorMsg.style.display = 'block';
    }
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('./api/profiles/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: currentProfileId, pin: pinVal })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      authenticatedPin = pinVal;
      if (profilesData[currentProfileId]) {
        profilesData[currentProfileId].hasPin = true;
      }

      closePinModal();
      unlockProfileBox();
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || 'Incorrect PIN entered.';
        errorMsg.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = 'PIN verification failed: ' + err.message;
      errorMsg.style.display = 'block';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function unlockProfileBox() {
  const box = document.getElementById('profileCriteriaBox');
  const title = document.getElementById('activeProfileBoxTitle');
  const prof = profilesData[currentProfileId];

  if (!box || !prof) return;

  if (title) title.textContent = `Editing Search Criteria: ${prof.name}`;

  document.getElementById('profileTitlesInput').value = (prof.targetTitles || []).join(', ');
  document.getElementById('profileKeywordsInput').value = (prof.keywords || []).join(', ');
  document.getElementById('profileCompaniesInput').value = (prof.greenhouseCompanies || []).join(', ');

  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth' });
}

function lockProfileBox() {
  const box = document.getElementById('profileCriteriaBox');
  if (box) box.style.display = 'none';
}

async function saveProfileCriteria(e) {
  e.preventDefault();

  if (!authenticatedPin) {
    openPinModal();
    return;
  }

  const titlesVal = document.getElementById('profileTitlesInput')?.value || '';
  const keywordsVal = document.getElementById('profileKeywordsInput')?.value || '';
  const companiesVal = document.getElementById('profileCompaniesInput')?.value || '';

  const targetTitles = titlesVal.split(',').map(s => s.trim()).filter(Boolean);
  const keywords = keywordsVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const greenhouseCompanies = companiesVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const btn = document.getElementById('btnSaveProfile');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Saving & Rescanning...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('./api/profiles/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        pin: authenticatedPin,
        targetTitles,
        keywords,
        greenhouseCompanies
      })
    });

    if (res.ok) {
      lockProfileBox();
      triggerScrapeNow();
    } else {
      alert('Save failed: Invalid PIN authentication.');
    }
  } catch (err) {
    alert('Save error: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save"></i><span>Save & Re-Scan Profile</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function fetchJobsDatabase() {
  const jobsList = document.getElementById('jobsList');
  try {
    const dataUrl = './jobs_data.json?t=' + Date.now();
    const response = await fetch(dataUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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

    filterJobs();
  } catch (err) {
    console.warn('Fallback: Unable to fetch jobs_data.json directly:', err);
    filterJobs();
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

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Re-Verifying & Rescanning...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    try {
      const res = await fetch('./api/scrape-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.jobs) {
          allJobsData = data.jobs;
          if (data.scrapedAt) lastScrapedTimestamp = new Date(data.scrapedAt).getTime();
        }
      }
    } catch (e) {}

    await fetchJobsDatabase();
  } catch (err) {
    console.error('Trigger error:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Re-Verify & Rescan Now</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function geocodeZipCode(zip) {
  const cleanZip = String(zip).trim();
  if (!/^\d{5}$/.test(cleanZip)) return null;

  if (zipGeocodeCache[cleanZip]) {
    return zipGeocodeCache[cleanZip];
  }

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.places && data.places[0]) {
      const place = data.places[0];
      const coords = {
        lat: parseFloat(place.latitude),
        lon: parseFloat(place.longitude),
        city: place['place name'],
        state: place['state abbreviation']
      };
      zipGeocodeCache[cleanZip] = coords;
      return coords;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function filterJobs() {
  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const sourceFilter = document.getElementById('sourceSelect')?.value || 'all';
  const workTypeFilter = document.getElementById('workTypeSelect')?.value || 'all';
  const zipVal = document.getElementById('zipInput')?.value.trim() || '';
  const radiusVal = document.getElementById('radiusSelect')?.value || 'any';

  let userCoords = null;
  if (/^\d{5}$/.test(zipVal)) {
    userCoords = await geocodeZipCode(zipVal);
  }

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

    let matchWorkType = true;
    const wt = (job.workType || 'Onsite').toLowerCase();
    if (workTypeFilter === 'remote') {
      matchWorkType = wt === 'remote';
    } else if (workTypeFilter === 'hybrid') {
      matchWorkType = wt === 'hybrid';
    } else if (workTypeFilter === 'onsite') {
      matchWorkType = wt === 'onsite';
    }

    let matchRadius = true;
    if (userCoords && radiusVal !== 'any' && wt !== 'remote') {
      const maxMiles = parseFloat(radiusVal);
      if (job.lat && job.lon) {
        const dist = getDistanceMiles(userCoords.lat, userCoords.lon, job.lat, job.lon);
        matchRadius = dist <= maxMiles;
      }
    }

    return matchQuery && matchSource && matchWorkType && matchRadius;
  });

  renderJobs(filtered);
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
        <p>No active verified job postings available matching your workplace/distance filters. Adjust your filters or click <strong>Re-Verify & Rescan Now</strong>.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  jobsList.innerHTML = jobs.map(job => {
    const workTypeClass = (job.workType || 'Onsite').toLowerCase();
    const workTypeLabel = (job.workType || 'ONSITE').toUpperCase();

    return `
      <article class="job-card ${job.isNew ? 'is-new' : ''}">
        <div class="job-info">
          <div class="job-meta-top">
            <span class="work-type-badge ${workTypeClass}">${workTypeLabel}</span>
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
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
