/* ==========================================================================
   Scrapedeez — Profile-Bound Job Engine
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;
let currentProfileId = 'profile1';
let authenticatedPin = null;
let pendingEditTarget = null; // 'name' or 'criteria'

let isEditingName = false;
let isEditingKeywords = false;
let editingTagsList = [];

// Default client-side profiles fallback with profile-bound job stores
let profilesData = {
  profile1: {
    id: 'profile1',
    name: 'User 1 - IT Management, WebOps & DevOps',
    hasPin: false,
    targetTitles: ['Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager', 'Website Development', 'DevOps Manager', 'DevOps Lead', 'Director of IT', 'Web Engineering Manager'],
    keywords: ['devops', 'webops', 'web development', 'infrastructure', 'cloud', 'terraform', 'kubernetes', 'change control', 'it management'],
    greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 'hashicorp', 'vercel'],
    lastScraped: new Date().toISOString(),
    jobs: []
  },
  profile2: {
    id: 'profile2',
    name: 'User Profile 2 (Custom)',
    hasPin: false,
    targetTitles: [],
    keywords: [],
    greenhouseCompanies: ['stripe', 'gitlab', 'github'],
    lastScraped: null,
    jobs: []
  },
  profile3: {
    id: 'profile3',
    name: 'User Profile 3 (Custom)',
    hasPin: false,
    targetTitles: [],
    keywords: [],
    greenhouseCompanies: ['stripe', 'gitlab', 'github'],
    lastScraped: null,
    jobs: []
  }
};

const zipGeocodeCache = {};

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
      if (data.profiles) {
        for (const [id, prof] of Object.entries(data.profiles)) {
          if (!profilesData[id]) profilesData[id] = prof;
          else {
            profilesData[id].name = prof.name;
            profilesData[id].hasPin = prof.hasPin;
            profilesData[id].targetTitles = prof.targetTitles || [];
            profilesData[id].keywords = prof.keywords || [];
            if (prof.lastScraped) profilesData[id].lastScraped = prof.lastScraped;
          }
        }
      }
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
  const container = document.getElementById('profileSegmentedTabs');
  if (!container || !profilesData) return;

  container.innerHTML = Object.values(profilesData).map(p => `
    <button class="profile-tab-btn ${p.id === currentProfileId ? 'active' : ''}" onclick="selectProfile('${p.id}')">
      ${escapeHtml(p.name)}
    </button>
  `).join('');
}

function selectProfile(profileId) {
  if (profileId === currentProfileId) return;

  currentProfileId = profileId;
  authenticatedPin = null;
  isEditingName = false;
  isEditingKeywords = false;

  renderProfileDropdown();
  renderActiveProfileCard();
  fetchJobsDatabase();
}

function renderActiveProfileCard() {
  const container = document.getElementById('profileNameContainer');
  const activeProf = profilesData[currentProfileId] || { name: 'User Profile', targetTitles: [], keywords: [] };

  if (container) {
    if (isEditingName) {
      container.innerHTML = `
        <div class="inline-name-input-group">
          <input type="text" id="inlineNameInput" value="${escapeHtml(activeProf.name)}" autofocus>
          <button class="btn btn-secondary btn-xs" onclick="cancelInlineNameEdit()">Cancel</button>
          <button class="btn btn-primary btn-xs" onclick="saveInlineName()">Save</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <h2 id="activeProfileDisplayName">${escapeHtml(activeProf.name)}</h2>
        <button class="btn btn-secondary btn-xs" onclick="openEditNameModal()" id="btnEditName">
          <i data-lucide="edit-2"></i>
          <span>Edit Name</span>
        </button>
      `;
    }
  }

  renderKeywordsSection();

  if (window.lucide) lucide.createIcons();
}

function renderKeywordsSection() {
  const kwListEl = document.getElementById('activeKeywordsList');
  const inputBar = document.getElementById('shopifyTagInputBar');
  const btnEditCriteria = document.getElementById('btnEditCriteria');
  const activeProf = profilesData[currentProfileId] || { targetTitles: [], keywords: [] };

  if (!kwListEl) return;

  if (isEditingKeywords) {
    if (btnEditCriteria) btnEditCriteria.style.display = 'none';
    if (inputBar) inputBar.style.display = 'flex';

    if (editingTagsList.length === 0) {
      kwListEl.innerHTML = `<span class="kw-tag" style="background:rgba(255,255,255,0.05); color:#94a3b8;">No keywords set. Type a keyword below and press Enter to add.</span>`;
    } else {
      kwListEl.innerHTML = editingTagsList.map((term, index) => `
        <span class="kw-tag editable">
          ${escapeHtml(term)}
          <button type="button" class="tag-remove-btn" onclick="removeShopifyTag(${index})" title="Remove keyword">&times;</button>
        </span>
      `).join('');
    }
  } else {
    if (btnEditCriteria) btnEditCriteria.style.display = 'inline-flex';
    if (inputBar) inputBar.style.display = 'none';

    const allTerms = [...(activeProf.targetTitles || []), ...(activeProf.keywords || [])];
    if (allTerms.length === 0) {
      kwListEl.innerHTML = `<span class="kw-tag" style="background:rgba(255,255,255,0.05); color:#94a3b8;">No keywords defined. Click Edit Keywords & Roles to add terms.</span>`;
    } else {
      kwListEl.innerHTML = allTerms.map(term => `<span class="kw-tag">${escapeHtml(term)}</span>`).join('');
    }
  }
}

function onProfileChange() {
  selectProfile(currentProfileId);
}

// 1. Trigger Edit Profile Name (Inline)
function openEditNameModal() {
  pendingEditTarget = 'name';
  if (authenticatedPin) {
    isEditingName = true;
    renderActiveProfileCard();
  } else {
    openPinModal();
  }
}

function cancelInlineNameEdit() {
  isEditingName = false;
  renderActiveProfileCard();
}

async function saveInlineName() {
  const nameInput = document.getElementById('inlineNameInput');
  const nameVal = nameInput ? nameInput.value.trim() : '';

  if (!nameVal) return;

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
  } catch (e) {}

  isEditingName = false;
  renderProfileDropdown();
  renderActiveProfileCard();
}

// 2. Trigger Edit Keywords (Shopify-style Tag Manager)
function openEditCriteriaModal() {
  pendingEditTarget = 'criteria';
  if (authenticatedPin) {
    startShopifyTagEdit();
  } else {
    openPinModal();
  }
}

function startShopifyTagEdit() {
  const activeProf = profilesData[currentProfileId] || { targetTitles: [], keywords: [] };
  editingTagsList = [...(activeProf.targetTitles || []), ...(activeProf.keywords || [])];
  isEditingKeywords = true;
  renderKeywordsSection();

  const input = document.getElementById('shopifyTagInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

function handleShopifyTagInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const input = document.getElementById('shopifyTagInput');
    const val = input ? input.value.replace(/,/g, '').trim() : '';

    if (val && !editingTagsList.includes(val)) {
      editingTagsList.push(val);
      input.value = '';
      renderKeywordsSection();
    }
  }
}

function removeShopifyTag(index) {
  if (index >= 0 && index < editingTagsList.length) {
    editingTagsList.splice(index, 1);
    renderKeywordsSection();
  }
}

function cancelShopifyTagEdit() {
  isEditingKeywords = false;
  renderKeywordsSection();
}

async function saveShopifyTags() {
  if (profilesData[currentProfileId]) {
    profilesData[currentProfileId].targetTitles = editingTagsList;
    profilesData[currentProfileId].keywords = [];
  }
  localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));

  const btn = document.getElementById('btnSaveTags');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Saving...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    await fetch('./api/profiles/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        pin: authenticatedPin,
        name: profilesData[currentProfileId].name,
        targetTitles: editingTagsList,
        keywords: []
      })
    });
  } catch (e) {}

  isEditingKeywords = false;
  renderKeywordsSection();
  filterJobs();
  triggerScrapeNow();
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
        isEditingName = true;
        renderActiveProfileCard();
      } else {
        startShopifyTagEdit();
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

async function fetchJobsDatabase() {
  const activeProf = profilesData[currentProfileId] || {};

  try {
    const res = await fetch(`./api/jobs?profileId=${currentProfileId}&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      allJobsData = data.jobs || [];

      if (data.lastScraped) {
        activeProf.lastScraped = data.lastScraped;
      }
      activeProf.jobs = allJobsData;
      localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));
    } else {
      throw new Error('API offline');
    }
  } catch (err) {
    if (activeProf.jobs && activeProf.jobs.length > 0) {
      allJobsData = activeProf.jobs;
    } else {
      try {
        const globalRes = await fetch('./jobs_data.json?t=' + Date.now());
        if (globalRes.ok) {
          const globalData = await globalRes.json();
          allJobsData = globalData.jobs || [];
          if (!activeProf.lastScraped && globalData.lastScraped) {
            activeProf.lastScraped = globalData.lastScraped;
          }
        }
      } catch (e) {
        allJobsData = [];
      }
    }
  }

  const timeEl = document.getElementById('lastScrapedTime');
  if (timeEl) {
    timeEl.textContent = activeProf.lastScraped ? formatDate(activeProf.lastScraped) : 'Never';
  }
  updateElapsedBadge();
  filterJobs();
}

function updateElapsedBadge() {
  const badgeText = document.getElementById('elapsedTimerText');
  if (!badgeText) return;

  const activeProf = profilesData[currentProfileId] || {};
  const lastScraped = activeProf.lastScraped;

  if (!lastScraped) {
    badgeText.textContent = 'Not scanned yet';
    return;
  }

  const scrapedTime = new Date(lastScraped).getTime();
  if (isNaN(scrapedTime)) {
    badgeText.textContent = 'Not scanned yet';
    return;
  }

  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - scrapedTime) / 1000));

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
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Re-Verifying & Rescanning Profile...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    try {
      const res = await fetch('./api/scrape-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: currentProfileId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobs) {
          allJobsData = data.jobs;
          if (profilesData[currentProfileId]) {
            profilesData[currentProfileId].jobs = data.jobs;
            profilesData[currentProfileId].lastScraped = data.scrapedAt || new Date().toISOString();
            localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));
          }
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

  const activeProf = profilesData[currentProfileId] || { targetTitles: [], keywords: [] };
  const profileTerms = [...(activeProf.targetTitles || []), ...(activeProf.keywords || [])]
    .map(t => t.toLowerCase().trim())
    .filter(Boolean);

  // IF NO KEYWORDS ENTERED: Show "No Results" message immediately
  if (profileTerms.length === 0) {
    renderJobs([]);
    return;
  }

  let userCoords = null;
  if (/^\d{5}$/.test(zipVal)) {
    userCoords = await geocodeZipCode(zipVal);
  }

  const filtered = allJobsData.filter(job => {
    // 1. Strict OR Criteria: Job matches if it contains ANY ONE of the profile's keyword/title terms
    const jobText = (job.title + ' ' + job.company + ' ' + job.location + ' ' + (job.matchedKeyword || '')).toLowerCase();

    const matchesProfile = profileTerms.some(term => {
      const cleanTerm = term.trim().toLowerCase();
      return cleanTerm.length > 0 && jobText.includes(cleanTerm);
    });

    if (!matchesProfile) return false;

    // 2. In-Memory Search Box Input Query
    const matchQuery = !query || 
      job.title.toLowerCase().includes(query) || 
      job.company.toLowerCase().includes(query) || 
      job.location.toLowerCase().includes(query) ||
      (job.matchedKeyword && job.matchedKeyword.toLowerCase().includes(query));

    if (!matchQuery) return false;

    // 3. Source Filter
    let matchSource = true;
    if (sourceFilter === 'new') {
      matchSource = job.isNew === true;
    } else if (sourceFilter === 'ats') {
      matchSource = job.source.includes('Greenhouse') || job.source.includes('Lever');
    } else if (sourceFilter === 'feeds') {
      matchSource = job.source.includes('RemoteOK') || job.source.includes('WeWorkRemotely');
    }

    if (!matchSource) return false;

    // 4. Workplace Type Filter
    let matchWorkType = true;
    const wt = (job.workType || 'Onsite').toLowerCase();
    if (workTypeFilter === 'remote') {
      matchWorkType = wt === 'remote';
    } else if (workTypeFilter === 'hybrid') {
      matchWorkType = wt === 'hybrid';
    } else if (workTypeFilter === 'onsite') {
      matchWorkType = wt === 'onsite';
    }

    if (!matchWorkType) return false;

    // 5. Distance Radius Filter
    let matchRadius = true;
    if (userCoords && radiusVal !== 'any' && wt !== 'remote') {
      const maxMiles = parseFloat(radiusVal);
      if (job.lat && job.lon) {
        const dist = getDistanceMiles(userCoords.lat, userCoords.lon, job.lat, job.lon);
        matchRadius = dist <= maxMiles;
      }
    }

    return matchRadius;
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
        <p>No active verified job postings matching the active profile's search keywords. Click <strong>Edit Keywords & Roles</strong> to add terms.</p>
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
