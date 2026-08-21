/* ==========================================================================
   Scrapedeez — Profile-Bound Job Engine & Multi-Sort
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;
let currentProfileId = 'profile1';
let authenticatedPin = null;
let pendingEditTarget = null; // 'name' or 'criteria'

let isEditingName = false;
let isEditingKeywords = false;
let isEditingSalary = false;
let editingTagsList = [];

// Default client-side profiles fallback with profile-bound job stores
let profilesData = {
  profile1: {
    id: 'profile1',
    name: 'Will',
    hasPin: true,
    pin: '0418',
    minSalary: 120000,
    targetTitles: ['Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager', 'DevOps Manager', 'DevOps Lead', 'devops', 'web development'],
    keywords: [],
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
    minSalary: 0,
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
    minSalary: 0,
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

  // Setup Event Listeners for Filters
  const zipInput = document.getElementById('zipInput');
  if (zipInput) {
    zipInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        filterJobs();
      }
    });
  }

  fetchProfiles();
  fetchJobsDatabase();

  setInterval(updateElapsedBadge, 10000);
});

async function fetchProfiles() {
  try {
    let res = await fetch(`./profiles.php?t=${Date.now()}`);
    if (!res.ok) {
      res = await fetch(`./api/profiles?t=${Date.now()}`);
    }
    if (res.ok) {
      const data = await res.json();
      if (data.profiles) {
        profilesData = data.profiles;
        localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));
      }
      if (data.activeProfileId) currentProfileId = data.activeProfileId;
    }
  } catch (err) {
    console.warn('Profiles fetch note:', err);
  } finally {
    renderProfileDropdown();
    renderActiveProfileCard();
    filterJobs();
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

function onProfileChange() {
  const dropdown = document.getElementById('profileSelectDropdown');
  if (!dropdown) return;

  currentProfileId = dropdown.value;
  authenticatedPin = null;
  isEditingName = false;
  isEditingKeywords = false;
  isEditingSalary = false;

  renderActiveProfileCard();
  fetchJobsDatabase();
}

function renderActiveProfileCard() {
  const container = document.getElementById('profileNameContainer');
  const salaryContainer = document.getElementById('profileSalaryCriteriaContainer');
  const activeProf = profilesData[currentProfileId] || { name: 'User Profile', targetTitles: [], keywords: [], minSalary: 120000 };

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

  if (salaryContainer) {
    const salaryVal = activeProf.minSalary || 0;
    const formattedVal = salaryVal > 0 ? `$${(salaryVal/1000).toFixed(0)}k / yr` : 'Any Salary';

    if (isEditingSalary) {
      salaryContainer.innerHTML = `
        <select id="inlineMinSalarySelect" class="salary-select-inline" onchange="saveInlineMinSalary()">
          <option value="0" ${salaryVal === 0 ? 'selected' : ''}>Any Salary</option>
          <option value="80000" ${salaryVal === 80000 ? 'selected' : ''}>Min. $80k / yr</option>
          <option value="100000" ${salaryVal === 100000 ? 'selected' : ''}>Min. $100k / yr</option>
          <option value="120000" ${salaryVal === 120000 ? 'selected' : ''}>Min. $120k / yr</option>
          <option value="140000" ${salaryVal === 140000 ? 'selected' : ''}>Min. $140k / yr</option>
          <option value="160000" ${salaryVal === 160000 ? 'selected' : ''}>Min. $160k / yr</option>
          <option value="180000" ${salaryVal === 180000 ? 'selected' : ''}>Min. $180k / yr</option>
          <option value="200000" ${salaryVal === 200000 ? 'selected' : ''}>Min. $200k+ / yr</option>
        </select>
        <button class="btn btn-secondary btn-xs" onclick="cancelInlineSalaryEdit()">Cancel</button>
      `;
    } else {
      salaryContainer.innerHTML = `
        <div class="salary-badge" title="Minimum acceptable salary filter">
          <i data-lucide="dollar-sign"></i>
          <span>Min. Salary: <strong>${formattedVal}</strong></span>
        </div>
        <button class="btn btn-secondary btn-xs" onclick="toggleSalaryEdit()">
          <i data-lucide="sliders"></i>
          <span>Edit</span>
        </button>
      `;
    }
  }

  renderKeywordsSection();

  if (window.lucide) lucide.createIcons();
}

function toggleSalaryEdit() {
  isEditingSalary = !isEditingSalary;
  renderActiveProfileCard();
}

function cancelInlineSalaryEdit() {
  isEditingSalary = false;
  renderActiveProfileCard();
}

async function saveInlineMinSalary() {
  const select = document.getElementById('inlineMinSalarySelect');
  const val = select ? parseInt(select.value, 10) : 0;

  if (profilesData[currentProfileId]) {
    profilesData[currentProfileId].minSalary = val;
  }
  localStorage.setItem('scrapedeez_profiles', JSON.stringify(profilesData));

  try {
    let res = await fetch('./profiles.php?action=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        pin: authenticatedPin,
        name: profilesData[currentProfileId].name,
        minSalary: val
      })
    });
    if (!res.ok) {
      await fetch('./api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfileId,
          pin: authenticatedPin,
          name: profilesData[currentProfileId].name,
          minSalary: val
        })
      });
    }
  } catch (e) {}

  isEditingSalary = false;
  renderActiveProfileCard();
  filterJobs();
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
      kwListEl.innerHTML = `<span class="kw-tag" style="background:rgba(255,255,255,0.05); color:#94a3b8;">No keywords defined. Click Edit Keywords to add terms.</span>`;
    } else {
      kwListEl.innerHTML = allTerms.map(term => `<span class="kw-tag">${escapeHtml(term)}</span>`).join('');
    }
  }
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
    let res = await fetch('./profiles.php?action=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: currentProfileId,
        pin: authenticatedPin,
        name: nameVal
      })
    });
    if (!res.ok) {
      await fetch('./api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfileId,
          pin: authenticatedPin,
          name: nameVal
        })
      });
    }
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

  const btn = document.getElementById('btnSaveTags');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save"></i><span>Save & Re-Scan</span>`;
    if (window.lucide) lucide.createIcons();
  }

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
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Saving to Server...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    let res = await fetch('./profiles.php?action=save', {
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
    if (!res.ok) {
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
    }
  } catch (e) {
    console.error('Save error:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save"></i><span>Save & Re-Scan</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }

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
      let res = await fetch('./profiles.php?action=verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: currentProfileId, pin: pinVal })
      });
      if (!res.ok) {
        res = await fetch('./api/profiles/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: currentProfileId, pin: pinVal })
        });
      }
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
    const res = await fetch(`./jobs_data.json?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      allJobsData = data.jobs || [];
      if (data.lastScraped) {
        lastScrapedTimestamp = new Date(data.lastScraped).getTime();
        activeProf.lastScraped = data.lastScraped;
      }
      activeProf.jobs = allJobsData;
    }
  } catch (err) {
    console.warn('Jobs fetch note:', err);
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
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Re-Scanning...</span>`;
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
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Re-Scan</span>`;
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

function formatSalary(job) {
  if (job.salary) return job.salary;
  
  const text = (job.title + ' ' + (job.description || '')).toLowerCase();
  const match = text.match(/\$(\d{2,3}(?:,\d{3})*|\d{2,3}k)\s*(?:-|to)?\s*\$?(\d{2,3}(?:,\d{3})*|\d{2,3}k)?/i);
  if (match) {
    return match[0];
  }

  const titleLower = job.title.toLowerCase();
  if (titleLower.includes('director') || titleLower.includes('head') || titleLower.includes('vp')) {
    return '$175,000 - $245,000 / yr (est.)';
  } else if (titleLower.includes('manager') || titleLower.includes('lead')) {
    return '$135,000 - $185,000 / yr (est.)';
  } else if (titleLower.includes('senior') || titleLower.includes('sr')) {
    return '$120,000 - $165,000 / yr (est.)';
  } else {
    return '$105,000 - $150,000 / yr (est.)';
  }
}

function parseSalaryMin(salaryStr) {
  if (!salaryStr) return 0;
  const clean = salaryStr.replace(/,/g, '');
  const match = clean.match(/\$(\d+)(?:k|000)?/i);
  if (match) {
    let num = parseInt(match[1], 10);
    if (num < 1000) num *= 1000;
    return num;
  }
  return 0;
}

async function filterJobs() {
  const applyBtn = document.getElementById('btnApplyGeoFilters');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Filtering & Sorting...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const sourceFilter = document.getElementById('sourceSelect')?.value || 'all';
  const sortMode = document.getElementById('sortSelect')?.value || 'time';

  const enableRemote = document.getElementById('chkRemote')?.checked ?? true;
  const enableHybrid = document.getElementById('chkHybrid')?.checked ?? true;
  const enableOnsite = document.getElementById('chkOnsite')?.checked ?? true;

  const zipVal = document.getElementById('zipInput')?.value.trim() || '';
  const radiusVal = document.getElementById('radiusSelect')?.value || 'any';

  const activeProf = profilesData[currentProfileId] || { targetTitles: [], keywords: [], minSalary: 0 };
  const minProfileSalary = activeProf.minSalary || 0;

  const profileTerms = [...(activeProf.targetTitles || []), ...(activeProf.keywords || [])]
    .map(t => t.toLowerCase().trim())
    .filter(Boolean);

  // IF NO KEYWORDS ENTERED FOR CUSTOM PROFILE: Show "No Results" message
  if (profileTerms.length === 0 && currentProfileId !== 'profile1') {
    renderJobs([]);
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.innerHTML = `<i data-lucide="filter"></i><span>Apply Filters</span>`;
      if (window.lucide) lucide.createIcons();
    }
    return;
  }

  let userCoords = null;
  if (/^\d{5}$/.test(zipVal)) {
    userCoords = await geocodeZipCode(zipVal);
  }

  const filtered = allJobsData.filter(job => {
    // 1. Profile 1 displays full dataset; Custom profiles match OR terms
    if (currentProfileId !== 'profile1') {
      const jobText = (job.title + ' ' + job.company + ' ' + job.location + ' ' + (job.matchedKeyword || '')).toLowerCase();
      const matchesProfile = profileTerms.some(term => {
        const cleanTerm = term.trim().toLowerCase();
        return cleanTerm.length > 0 && jobText.includes(cleanTerm);
      });
      if (!matchesProfile) return false;
    }

    // 2. Minimum Acceptable Salary Filter
    if (minProfileSalary > 0) {
      const jobSalaryStr = formatSalary(job);
      const jobSalNum = parseSalaryMin(jobSalaryStr);
      if (jobSalNum > 0 && jobSalNum < minProfileSalary) {
        return false;
      }
    }

    // 3. In-Memory Search Box Input Query
    const matchQuery = !query || 
      job.title.toLowerCase().includes(query) || 
      job.company.toLowerCase().includes(query) || 
      job.location.toLowerCase().includes(query) ||
      (job.matchedKeyword && job.matchedKeyword.toLowerCase().includes(query));

    if (!matchQuery) return false;

    // 4. Source Filter
    let matchSource = true;
    if (sourceFilter === 'new') {
      matchSource = job.isNew === true;
    } else if (sourceFilter === 'ats') {
      matchSource = job.source.includes('Greenhouse') || job.source.includes('Lever');
    } else if (sourceFilter === 'feeds') {
      matchSource = job.source.includes('RemoteOK') || job.source.includes('WeWorkRemotely');
    }

    if (!matchSource) return false;

    // 5. Multi-Select Location Setup Checkboxes (Remote, Hybrid, Onsite)
    const rawWt = (job.workType || '').toLowerCase();
    const locLower = (job.location || '').toLowerCase();
    const titleLower = (job.title || '').toLowerCase();

    const isRemote = rawWt.includes('remote') || locLower.includes('remote') || titleLower.includes('remote');
    const isHybrid = rawWt.includes('hybrid') || locLower.includes('hybrid') || titleLower.includes('hybrid');
    const isOnsite = !isRemote && !isHybrid;

    let matchWorkType = false;
    if (isRemote && enableRemote) matchWorkType = true;
    if (isHybrid && enableHybrid) matchWorkType = true;
    if (isOnsite && enableOnsite) matchWorkType = true;

    if (!matchWorkType) return false;

    // 6. Distance Radius & Location Filter
    let matchRadius = true;
    if (zipVal) {
      if (userCoords && radiusVal !== 'any' && !isRemote) {
        const maxMiles = parseFloat(radiusVal);
        if (job.lat && job.lon) {
          const dist = getDistanceMiles(userCoords.lat, userCoords.lon, job.lat, job.lon);
          matchRadius = dist <= maxMiles;
        } else if (userCoords.city || userCoords.state) {
          const cleanCity = (userCoords.city || '').toLowerCase();
          const cleanState = (userCoords.state || '').toLowerCase();
          matchRadius = locLower.includes(cleanCity) || locLower.includes(cleanState) || locLower.includes(zipVal);
        }
      } else if (!userCoords) {
        matchRadius = locLower.includes(zipVal);
      }
    }

    return matchRadius;
  });

  // Calculate distance for sorting
  filtered.forEach(job => {
    const rawWt = (job.workType || '').toLowerCase();
    const locLower = (job.location || '').toLowerCase();
    const titleLower = (job.title || '').toLowerCase();
    const isRemote = rawWt.includes('remote') || locLower.includes('remote') || titleLower.includes('remote');

    if (userCoords && job.lat && job.lon) {
      job.distanceMiles = getDistanceMiles(userCoords.lat, userCoords.lon, job.lat, job.lon);
    } else if (isRemote) {
      job.distanceMiles = 99999;
    } else {
      job.distanceMiles = 9999;
    }
  });

  // MULTI-SORT LOGIC (Time Posted, Salary, Distance)
  if (sortMode === 'salary') {
    filtered.sort((a, b) => parseSalaryMin(formatSalary(b)) - parseSalaryMin(formatSalary(a)));
  } else if (sortMode === 'distance' || userCoords) {
    filtered.sort((a, b) => a.distanceMiles - b.distanceMiles);
  } else {
    // Default: Time Posted (Newest First)
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }

  renderJobs(filtered);

  if (applyBtn) {
    applyBtn.disabled = false;
    applyBtn.innerHTML = `<i data-lucide="filter"></i><span>Apply Filters</span>`;
    if (window.lucide) lucide.createIcons();
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
        <p>No active verified job postings matching your selected filters. Adjust your filters or click <strong>Re-Scan</strong>.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  jobsList.innerHTML = jobs.map(job => {
    const rawWt = (job.workType || '').toLowerCase();
    const locLower = (job.location || '').toLowerCase();
    const titleLower = (job.title || '').toLowerCase();

    let workTypeClass = 'onsite';
    let workTypeLabel = 'ONSITE';

    if (rawWt.includes('remote') || locLower.includes('remote') || titleLower.includes('remote')) {
      workTypeClass = 'remote';
      workTypeLabel = 'REMOTE';
    } else if (rawWt.includes('hybrid') || locLower.includes('hybrid') || titleLower.includes('hybrid')) {
      workTypeClass = 'hybrid';
      workTypeLabel = 'HYBRID';
    }

    const salaryVal = formatSalary(job);

    return `
      <article class="job-card ${job.isNew ? 'is-new' : ''}">
        <div class="job-info">
          <!-- Top Meta Row Order: Status Indicator Dot -> Company -> Location -> Setup Badge -->
          <div class="job-meta-top">
            ${job.isNew ? '<span class="dot-new" title="New Role (Discovered Recent Hour)"></span>' : '<span class="dot-verified" title="Verified Live & Active"></span>'}
            <span class="job-company">${escapeHtml(job.company)}</span>
            <span class="job-location-top"><i data-lucide="map-pin"></i> ${escapeHtml(job.location || 'Remote')}</span>
            <span class="work-type-badge ${workTypeClass}">${workTypeLabel}</span>
            ${job.distanceMiles && job.distanceMiles < 9000 ? `<span class="badge-distance"><i data-lucide="map-pin"></i> ${Math.round(job.distanceMiles)} mi away</span>` : ''}
          </div>
          
          <h3 class="job-title">${escapeHtml(job.title)}</h3>
          
          <!-- Bottom Info Line: Salary -> Date Only (Time Removed) -->
          <div class="job-footer-info">
            <span class="job-salary"><i data-lucide="dollar-sign"></i> ${escapeHtml(salaryVal)}</span>
            <span><i data-lucide="calendar"></i> ${formatDate(job.date)}</span>
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

// Date-Only Formatting (Time Removed)
function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}
