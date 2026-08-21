/* ==========================================================================
   Scrapedeez — 3-Profile PIN Protected Job Engine
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;
let currentProfileId = 'profile1';
let authenticatedPin = null;
let pendingEditTarget = null; // 'name' or 'criteria'

// Default client-side profiles fallback (works on static web hosts)
let profilesData = {
  profile1: {
    id: 'profile1',
    name: 'User 1 - IT Management, WebOps & DevOps',
    hasPin: false,
    targetTitles: ['Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager', 'Website Development', 'DevOps Manager', 'DevOps Lead', 'Director of IT', 'Web Engineering Manager'],
    keywords: ['devops', 'webops', 'web development', 'infrastructure', 'cloud', 'terraform', 'kubernetes', 'change control', 'it management'],
    greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 'hashicorp', 'vercel']
  },
  profile2: {
    id: 'profile2',
    name: 'User Profile 2 (Custom)',
    hasPin: false,
    targetTitles: [],
    keywords: [],
    greenhouseCompanies: ['stripe', 'gitlab', 'github']
  },
  profile3: {
    id: 'profile3',
    name: 'User Profile 3 (Custom)',
    hasPin: false,
    targetTitles: [],
    keywords: [],
    greenhouseCompanies: ['stripe', 'gitlab', 'github']
  }
};

const zipGeocodeCache = {};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Load saved local profiles if available
  const savedProfs = localStorage.getItem('scrapedeez_profiles');
  if (savedProfs) {
    try { profilesData = JSON.parse(savedProfs); } catch (e) {}
  }

  fetchProfiles();
  fetchJobsDatabase();

  setInterval(updateElapsedBadge, 10000);
});

async function fetchProfiles() {
  try {
    const res = await fetch('./api/profiles');
    if (res.ok) {
      const data = await res.json();
      if (data.profiles) profilesData = data.profiles;
      if (data.activeProfileId) currentProfileId = data.activeProfileId;
    }
  } catch (err) {
    console.warn('Profiles fetch note:', err);
  } finally {
    renderProfileDropdown();
    renderActiveProfileCard();
  }
}

function renderProfileDropdown() {
  const dropdown = document.getElementById('profileSelectDropdown');
  if (!dropdown || !profilesData) return;

  dropdown.innerHTML = Object.values(profilesData).map(p => `
    <option value="${p.id}" ${p.id === currentProfileId ? 'selected' : ''}>
      ${escapeHtml(p.name)}
    </option>
  `).join('');
}

function renderActiveProfileCard() {
  const nameEl = document.getElementById('activeProfileDisplayName');
  const kwListEl = document.getElementById('activeKeywordsList');
  const activeProf = profilesData[currentProfileId] || { name: 'User Profile', targetTitles: [], keywords: [] };

  if (nameEl) nameEl.textContent = activeProf.name;

  if (kwListEl) {
    const allTerms = [...(activeProf.targetTitles || []), ...(activeProf.keywords || [])];
    if (allTerms.length === 0) {
      kwListEl.innerHTML = `<span class="kw-tag" style="background:rgba(255,255,255,0.05); color:#94a3b8;">No search criteria set yet. Click Edit Target Titles & Keywords to add terms.</span>`;
    } else {
      kwListEl.innerHTML = allTerms.map(term => `<span class="kw-tag">${escapeHtml(term)}</span>`).join('');
    }
  }
}

function onProfileChange() {
  const dropdown = document.getElementById('profileSelectDropdown');
  if (!dropdown) return;

  currentProfileId = dropdown.value;
  authenticatedPin = null;
  lockNameEditBox();
  lockProfileBox();
  renderActiveProfileCard();
  fetchJobsDatabase();
}

// 1. Trigger Edit Profile Name
function openEditNameModal() {
  pendingEditTarget = 'name';
  if (authenticatedPin) {
    unlockNameEditBox();
  } else {
    openPinModal();
  }
}

// 2. Trigger Edit Target Titles & Keywords
function openEditCriteriaModal() {
  pendingEditTarget = 'criteria';
  if (authenticatedPin) {
    unlockProfileBox();
  } else {
    openPinModal();
  }
}

function openPinModal() {
  const targetProf = profilesData[currentProfileId] || { name: 'User Profile', hasPin: false };
  const overlay = document.getElementById('pinModalOverlay');
  const heading = document.getElementById('pinModalHeading');
  const prompt = document.getElementById('pinModalPrompt');
  const errorMsg = document.getElementById('pinErrorMessage');
  const pinInput = document.getElementById('pinCodeInput');

  if (!overlay) return;

  if (errorMsg) errorMsg.style.display = 'none';
  if (pinInput) pinInput.value = '';

  if (!targetProf.hasPin && !targetProf.pin) {
    if (heading) heading.textContent = 'Set New Security PIN';
    if (prompt) prompt.textContent = `No PIN set for ${targetProf.name}. Enter a 4-digit PIN to lock your profile.`;
  } else {
    if (heading) heading.textContent = 'Enter Security PIN';
    if (prompt) prompt.textContent = `Enter 4-digit security PIN to unlock & edit details for ${targetProf.name}.`;
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
    const targetProf = profilesData[currentProfileId];

    // Check client-side stored PIN or API
    let success = false;
    try {
      const res = await fetch('./api/profiles/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: currentProfileId, pin: pinVal })
      });
      if (res.ok) {
        const data = await res.json();
        success = data.success;
      }
    } catch (apiErr) {}

    // Fallback PIN verification in browser memory
    if (!success) {
      if (!targetProf.pin) {
        targetProf.pin = pinVal;
        targetProf.hasPin = true;
        success = true;
      } else if (targetProf.pin === pinVal) {
        success = true;
      }
    }

    if (success) {
      authenticatedPin = pinVal;
      if (targetProf) targetProf.hasPin = true;
      localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));

      closePinModal();

      if (pendingEditTarget === 'name') {
        unlockNameEditBox();
      } else {
        unlockProfileBox();
      }
    } else {
      if (errorMsg) {
        errorMsg.textContent = 'Incorrect PIN entered.';
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

function unlockNameEditBox() {
  lockProfileBox();
  const box = document.getElementById('profileNameEditBox');
  const prof = profilesData[currentProfileId] || { name: '' };

  if (!box) return;

  document.getElementById('profileNameInput').value = prof.name || '';
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth' });
}

function lockNameEditBox() {
  const box = document.getElementById('profileNameEditBox');
  if (box) box.style.display = 'none';
}

function unlockProfileBox() {
  lockNameEditBox();
  const box = document.getElementById('profileCriteriaBox');
  const title = document.getElementById('activeProfileBoxTitle');
  const prof = profilesData[currentProfileId] || { targetTitles: [], keywords: [], greenhouseCompanies: [] };

  if (!box) return;

  if (title) title.textContent = `Editing Search Criteria: ${prof.name || 'User Profile'}`;

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

async function saveProfileName(e) {
  e.preventDefault();

  if (!authenticatedPin) {
    openEditNameModal();
    return;
  }

  const nameVal = document.getElementById('profileNameInput')?.value || '';
  const btn = document.getElementById('btnSaveName');

  if (btn) btn.disabled = true;

  try {
    if (profilesData[currentProfileId]) {
      profilesData[currentProfileId].name = nameVal;
    }
    localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));

    try {
      await fetch('./api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfileId,
          pin: authenticatedPin,
          name: nameVal
        })
      });
    } catch (apiErr) {}

    renderProfileDropdown();
    renderActiveProfileCard();
    lockNameEditBox();
  } catch (err) {
    alert('Save error: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveProfileCriteria(e) {
  e.preventDefault();

  if (!authenticatedPin) {
    openEditCriteriaModal();
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
    if (profilesData[currentProfileId]) {
      profilesData[currentProfileId].targetTitles = targetTitles;
      profilesData[currentProfileId].keywords = keywords;
      profilesData[currentProfileId].greenhouseCompanies = greenhouseCompanies;
    }
    localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));

    try {
      await fetch('./api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfileId,
          pin: authenticatedPin,
          name: profilesData[currentProfileId].name,
          targetTitles,
          keywords,
          greenhouseCompanies
        })
      });
    } catch (apiErr) {}

    renderActiveProfileCard();
    lockProfileBox();
    triggerScrapeNow();
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
