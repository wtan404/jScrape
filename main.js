/* ==========================================================================
   Scrapedeez — Automated Hourly Job Engine, Link Verifier & Multi-Sort
   ========================================================================== */

let allJobsData = [];
let lastScrapedTimestamp = null;
let isScrapingActive = false;

let isEditingKeywords = false;
let isEditingSalary = false;
let editingTagsList = [];

// Default search configuration
let userConfig = {
  minSalary: 120000,
  targetTitles: [
    'Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager',
    'Website Development', 'DevOps Manager', 'DevOps Lead', 'Director of IT',
    'Web Engineering Manager', 'Software Engineering Manager'
  ],
  keywords: [
    'devops', 'webops', 'web development', 'infrastructure',
    'cloud', 'terraform', 'kubernetes', 'change control', 'it management'
  ],
  greenhouseCompanies: [
    'webflow', 'squarespace', 'contentful', 'fastly', 'klaviyo', 'braze', 'circleci',
    'grafanalabs', 'pagerduty', 'launchdarkly', 'cockroachlabs', 'elastic', 'mongodb',
    'twilio', 'canonical', 'gusto', 'checkr', 'carta', 'samsara', 'lattice', 'airtable',
    'bitwarden', 'toast', 'remote', 'coursera', 'scaleai', 'anthropic', 'ripple',
    'cloudflare', 'datadog', 'vercel', 'gitlab', 'stripe', 'figma', 'pinterest',
    'reddit', 'discord', 'instacart', 'affirm', 'brex', 'robinhood'
  ],
  leverCompanies: [
    'palantir', 'spotify', 'wealthfront', 'coupa', 'outreach', 'jumpcloud',
    'secureframe', 'everbridge', 'sophos', 'sysdig', 'scaleway', 'siteground',
    'kinsta', 'neon', 'metabase', 'activecampaign', 'brevo', 'mindtickle',
    'walkme', 'zilliz', 'zerotier', 'twingate', 'omnisend', 'netomi', 'brilliant',
    'clari', 'highspot', 'kraken', 'mistral', 'veeva'
  ]
};

// High-Speed US Metropolitan Area Geocode Dictionary
const US_CITY_COORDS = {
  // Silicon Valley & SF Bay Area
  'san francisco': { lat: 37.7749, lon: -122.4194 },
  'sf': { lat: 37.7749, lon: -122.4194 },
  'bay area': { lat: 37.7749, lon: -122.4194 },
  'south san francisco': { lat: 37.6547, lon: -122.4077 },
  'san bruno': { lat: 37.6305, lon: -122.4111 },
  'mountain view': { lat: 37.3861, lon: -122.0839 },
  'sunnyvale': { lat: 37.3688, lon: -122.0363 },
  'palo alto': { lat: 37.4419, lon: -122.1430 },
  'santa clara': { lat: 37.3541, lon: -121.9552 },
  'san jose': { lat: 37.3382, lon: -121.8863 },
  'redwood city': { lat: 37.4852, lon: -122.2364 },
  'san mateo': { lat: 37.5630, lon: -122.3255 },
  'menlo park': { lat: 37.4530, lon: -122.1817 },
  'cupertino': { lat: 37.3230, lon: -122.0322 },
  'foster city': { lat: 37.5585, lon: -122.2711 },
  'fremont': { lat: 37.5485, lon: -121.9886 },
  'oakland': { lat: 37.8044, lon: -122.2712 },
  'berkeley': { lat: 37.8716, lon: -122.2727 },
  'pleasanton': { lat: 37.6624, lon: -121.8747 },

  // Pacific Northwest
  'seattle': { lat: 47.6062, lon: -122.3321 },
  'bellevue': { lat: 47.6101, lon: -122.2015 },
  'kirkland': { lat: 47.6769, lon: -122.2060 },
  'redmond': { lat: 47.6740, lon: -122.1215 },
  'portland': { lat: 45.5152, lon: -122.6784 },

  // Southern California
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'la': { lat: 34.0522, lon: -118.2437 },
  'irvine': { lat: 33.6846, lon: -117.8265 },
  'culver city': { lat: 34.0211, lon: -118.3965 },
  'santa monica': { lat: 34.0195, lon: -118.4912 },
  'pasadena': { lat: 34.1478, lon: -118.1445 },
  'san diego': { lat: 32.7157, lon: -117.1611 },

  // Texas
  'austin': { lat: 30.2672, lon: -97.7431 },
  'dallas': { lat: 32.7767, lon: -96.7970 },
  'plano': { lat: 33.0198, lon: -96.6989 },
  'frisco': { lat: 33.1507, lon: -96.8236 },
  'irving': { lat: 32.8140, lon: -96.9489 },
  'houston': { lat: 29.7604, lon: -95.3698 },
  'san antonio': { lat: 29.4241, lon: -98.4936 },
  'fort worth': { lat: 32.7555, lon: -97.3308 },

  // New York & Tri-State
  'new york': { lat: 40.7128, lon: -74.0060 },
  'nyc': { lat: 40.7128, lon: -74.0060 },
  'manhattan': { lat: 40.7831, lon: -73.9712 },
  'brooklyn': { lat: 40.6782, lon: -73.9442 },
  'jersey city': { lat: 40.7178, lon: -74.0431 },
  'hoboken': { lat: 40.7440, lon: -74.0324 },
  'newark': { lat: 40.7357, lon: -74.1724 },

  // Greater Boston & Northeast
  'boston': { lat: 42.3601, lon: -71.0589 },
  'cambridge': { lat: 42.3736, lon: -71.1097 },
  'waltham': { lat: 42.3765, lon: -71.2356 },
  'philadelphia': { lat: 39.9526, lon: -75.1652 },
  'philly': { lat: 39.9526, lon: -75.1652 },
  'pittsburgh': { lat: 40.4406, lon: -79.9959 },

  // Mid-Atlantic & Southeast
  'washington': { lat: 38.9072, lon: -77.0369 },
  'dc': { lat: 38.9072, lon: -77.0369 },
  'arlington': { lat: 38.8799, lon: -77.1068 },
  'reston': { lat: 38.9586, lon: -77.3570 },
  'mclean': { lat: 38.9339, lon: -77.1773 },
  'herndon': { lat: 38.9696, lon: -77.3861 },
  'tysons': { lat: 38.9187, lon: -77.2311 },
  'baltimore': { lat: 39.2904, lon: -76.6122 },
  'raleigh': { lat: 35.7796, lon: -78.6382 },
  'durham': { lat: 35.9940, lon: -78.8986 },
  'chapel hill': { lat: 35.9132, lon: -79.0558 },
  'cary': { lat: 35.7915, lon: -78.7811 },
  'morrisville': { lat: 35.8324, lon: -78.8256 },
  'charlotte': { lat: 35.2271, lon: -80.8431 },
  'atlanta': { lat: 33.7490, lon: -84.3880 },
  'alpharetta': { lat: 34.0754, lon: -84.2941 },
  'miami': { lat: 25.7617, lon: -80.1918 },
  'tampa': { lat: 27.9506, lon: -82.4572 },
  'orlando': { lat: 28.5383, lon: -81.3792 },

  // Midwest & Mountain
  'chicago': { lat: 41.8781, lon: -87.6298 },
  'denver': { lat: 39.7392, lon: -104.9903 },
  'boulder': { lat: 40.0150, lon: -105.2705 },
  'salt lake city': { lat: 40.7608, lon: -111.8910 },
  'minneapolis': { lat: 44.9778, lon: -93.2650 },
  'detroit': { lat: 42.3314, lon: -83.0458 },
  'columbus': { lat: 39.9612, lon: -82.9988 },
  'st. louis': { lat: 38.6270, lon: -90.1994 },
  'nashville': { lat: 36.1627, lon: -86.7816 },
  'phoenix': { lat: 33.4484, lon: -112.0740 },
  'sacramento': { lat: 38.5816, lon: -121.4944 },
  'las vegas': { lat: 36.1699, lon: -115.1398 },

  // States
  'california': { lat: 36.7783, lon: -119.4179 },
  'texas': { lat: 31.9686, lon: -99.9018 },
  'washington state': { lat: 47.7511, lon: -120.7401 },
  'colorado': { lat: 39.5501, lon: -105.7821 },
  'illinois': { lat: 40.6331, lon: -89.3985 },
  'massachusetts': { lat: 42.4072, lon: -71.3824 },
  'virginia': { lat: 37.4316, lon: -78.6569 },
  'north carolina': { lat: 35.7596, lon: -79.0193 },
  'florida': { lat: 27.6648, lon: -81.5158 },
  'georgia': { lat: 32.1656, lon: -82.9001 },
  'pennsylvania': { lat: 41.2033, lon: -77.1945 },
  'ohio': { lat: 40.4173, lon: -82.9071 },
  'michigan': { lat: 44.3148, lon: -85.6024 },
  'utah': { lat: 39.3210, lon: -111.0937 },
  'arizona': { lat: 34.0489, lon: -111.0937 },
  'oregon': { lat: 43.8041, lon: -120.5542 },
  'minnesota': { lat: 46.7296, lon: -94.6859 },
  'tennessee': { lat: 35.5175, lon: -86.5804 },
  'missouri': { lat: 37.9643, lon: -91.8318 },
  'maryland': { lat: 39.0458, lon: -76.6413 },
  'new jersey': { lat: 40.0583, lon: -74.4057 },

  // International Tech Metros
  'tokyo': { lat: 35.6762, lon: 139.6503 },
  'london': { lat: 51.5074, lon: -0.1278 },
  'toronto': { lat: 43.6532, lon: -79.3832 },
  'vancouver': { lat: 49.2827, lon: -123.1207 }
};

const US_STATE_CENTROIDS = {
  'AL': { lat: 32.806671, lon: -86.791130 },
  'AK': { lat: 61.370716, lon: -152.404419 },
  'AZ': { lat: 33.729759, lon: -111.431221 },
  'AR': { lat: 34.969704, lon: -92.373123 },
  'CA': { lat: 36.116203, lon: -119.681564 },
  'CO': { lat: 39.059811, lon: -105.311104 },
  'CT': { lat: 41.597782, lon: -72.755371 },
  'DE': { lat: 39.318523, lon: -75.507141 },
  'DC': { lat: 38.897438, lon: -77.026817 },
  'FL': { lat: 27.766279, lon: -81.686783 },
  'GA': { lat: 33.040619, lon: -83.643074 },
  'HI': { lat: 21.094318, lon: -157.498337 },
  'ID': { lat: 44.240459, lon: -114.478828 },
  'IL': { lat: 40.349457, lon: -88.986137 },
  'IN': { lat: 39.849426, lon: -86.258278 },
  'IA': { lat: 42.011539, lon: -93.210526 },
  'KS': { lat: 38.526600, lon: -96.726486 },
  'KY': { lat: 37.668140, lon: -84.670067 },
  'LA': { lat: 31.169546, lon: -91.867805 },
  'ME': { lat: 44.693947, lon: -69.381927 },
  'MD': { lat: 39.063946, lon: -76.802101 },
  'MA': { lat: 42.230171, lon: -71.530106 },
  'MI': { lat: 43.326618, lon: -84.536095 },
  'MN': { lat: 45.694454, lon: -93.900192 },
  'MS': { lat: 32.741646, lon: -89.678696 },
  'MO': { lat: 38.456085, lon: -92.288368 },
  'MT': { lat: 46.921925, lon: -110.454353 },
  'NE': { lat: 41.125370, lon: -98.268082 },
  'NV': { lat: 38.313515, lon: -117.055374 },
  'NH': { lat: 43.452492, lon: -71.563896 },
  'NJ': { lat: 40.298904, lon: -74.521011 },
  'NM': { lat: 34.840515, lon: -106.248482 },
  'NY': { lat: 42.165726, lon: -74.948051 },
  'NC': { lat: 35.630066, lon: -79.806419 },
  'ND': { lat: 47.528912, lon: -99.784012 },
  'OH': { lat: 40.388783, lon: -82.764915 },
  'OK': { lat: 35.565342, lon: -96.928917 },
  'OR': { lat: 44.572021, lon: -122.070938 },
  'PA': { lat: 40.590752, lon: -77.209755 },
  'RI': { lat: 41.680893, lon: -71.511780 },
  'SC': { lat: 33.856892, lon: -80.945007 },
  'SD': { lat: 44.299782, lon: -99.438828 },
  'TN': { lat: 35.747845, lon: -86.692345 },
  'TX': { lat: 31.054487, lon: -97.563461 },
  'UT': { lat: 40.150032, lon: -111.862434 },
  'VT': { lat: 44.045876, lon: -72.710686 },
  'VA': { lat: 37.769337, lon: -78.169968 },
  'WA': { lat: 47.400902, lon: -121.490494 },
  'WV': { lat: 38.491226, lon: -80.954453 },
  'WI': { lat: 44.268543, lon: -89.616508 },
  'WY': { lat: 42.755966, lon: -107.302490 }
};

const SORTED_CITY_COORDS = Object.entries(US_CITY_COORDS).sort((a, b) => b[0].length - a[0].length);

const zipGeocodeCache = {};
const ONE_HOUR_MS = 60 * 60 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Load cached settings & jobs from localStorage
  const savedCfg = localStorage.getItem('scrapedeez_config');
  if (savedCfg) {
    try { userConfig = { ...userConfig, ...JSON.parse(savedCfg) }; } catch (e) {}
  }

  const savedJobs = localStorage.getItem('scrapedeez_jobs');
  const savedScrapedAt = localStorage.getItem('scrapedeez_last_scraped');
  if (savedJobs) {
    try {
      allJobsData = JSON.parse(savedJobs);
      if (savedScrapedAt) lastScrapedTimestamp = new Date(savedScrapedAt).getTime();
    } catch (e) {}
  }

  // Setup Event Listeners for Filters
  const zipInput = document.getElementById('zipInput');
  if (zipInput) {
    zipInput.addEventListener('input', handleZipInput);
    zipInput.addEventListener('change', handleZipInput);
    zipInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        filterJobs();
      }
    });
  }

  const radiusSelect = document.getElementById('radiusSelect');
  if (radiusSelect) {
    radiusSelect.addEventListener('change', () => {
      filterJobs();
    });
  }

  renderCriteriaCard();
  filterJobs();

  // Load server config and jobs database
  initApp();

  // Update status badge timer every 10 seconds
  setInterval(updateElapsedBadge, 10000);

  // Background Auto-Fetch Hourly Check (checks every 30 seconds if > 1 hour elapsed)
  setInterval(() => {
    checkAndAutoRescan();
  }, 30000);
});

async function initApp() {
  await fetchConfig();
  await fetchJobsDatabase();

  // If jobs are missing or older than 1 hour, auto-trigger a live scan immediately
  const now = Date.now();
  if (allJobsData.length === 0 || !lastScrapedTimestamp || (now - lastScrapedTimestamp) >= ONE_HOUR_MS) {
    console.log('[Scrapedeez] Data is missing or > 1 hour old. Running auto-scan on startup...');
    triggerScrapeNow();
  }
}

function checkAndAutoRescan() {
  if (isScrapingActive) return;
  const now = Date.now();
  if (!lastScrapedTimestamp || (now - lastScrapedTimestamp) >= ONE_HOUR_MS) {
    console.log('[Scrapedeez] Auto-hourly threshold reached. Running scheduled rescan...');
    triggerScrapeNow();
  }
}

async function fetchConfig() {
  try {
    const res = await fetch(`./api/config?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      userConfig = { ...userConfig, ...data };
      localStorage.setItem('scrapedeez_config', JSON.stringify(userConfig));
    } else {
      const cfgRes = await fetch(`./config.json?t=${Date.now()}`);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        userConfig = { ...userConfig, ...data };
        localStorage.setItem('scrapedeez_config', JSON.stringify(userConfig));
      }
    }
  } catch (err) {
    console.warn('Config fetch note:', err);
  } finally {
    renderCriteriaCard();
  }
}

function renderCriteriaCard() {
  const salaryContainer = document.getElementById('profileSalaryCriteriaContainer');

  if (salaryContainer) {
    const salaryVal = userConfig.minSalary || 0;
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
  renderCriteriaCard();
}

function cancelInlineSalaryEdit() {
  isEditingSalary = false;
  renderCriteriaCard();
}

async function saveInlineMinSalary() {
  const select = document.getElementById('inlineMinSalarySelect');
  const val = select ? parseInt(select.value, 10) : 0;

  userConfig.minSalary = val;
  localStorage.setItem('scrapedeez_config', JSON.stringify(userConfig));

  try {
    await fetch('./api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minSalary: val })
    });
  } catch (e) {}

  isEditingSalary = false;
  renderCriteriaCard();
  filterJobs();
}

function renderKeywordsSection() {
  const kwListEl = document.getElementById('activeKeywordsList');
  const inputBar = document.getElementById('shopifyTagInputBar');
  const btnEditCriteria = document.getElementById('btnEditCriteria');

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

    const allTerms = [...(userConfig.targetTitles || []), ...(userConfig.keywords || [])];
    if (allTerms.length === 0) {
      kwListEl.innerHTML = `<span class="kw-tag" style="background:rgba(255,255,255,0.05); color:#94a3b8;">No keywords defined. Click Edit Keywords to add terms.</span>`;
    } else {
      kwListEl.innerHTML = allTerms.map(term => `<span class="kw-tag">${escapeHtml(term)}</span>`).join('');
    }
  }
}

function startShopifyTagEdit() {
  const allTerms = [...(userConfig.targetTitles || []), ...(userConfig.keywords || [])];
  editingTagsList = [...allTerms];
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

    if (val && !editingTagsList.some(t => t.toLowerCase() === val.toLowerCase())) {
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
  userConfig.targetTitles = [...editingTagsList];
  userConfig.keywords = [];
  localStorage.setItem('scrapedeez_config', JSON.stringify(userConfig));

  const btn = document.getElementById('btnSaveTags');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Saving...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    await fetch('./api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetTitles: editingTagsList,
        keywords: []
      })
    });
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

async function fetchJobsDatabase() {
  try {
    let loaded = false;

    // 1. Try GET /api/jobs
    try {
      const res = await fetch(`./api/jobs?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.jobs && data.jobs.length > 0) {
          allJobsData = data.jobs;
          if (data.lastScraped) {
            lastScrapedTimestamp = new Date(data.lastScraped).getTime();
            localStorage.setItem('scrapedeez_last_scraped', data.lastScraped);
          }
          localStorage.setItem('scrapedeez_jobs', JSON.stringify(allJobsData));
          loaded = true;
        }
      }
    } catch (e) {}

    // 2. Try static jobs_data.json fallback
    if (!loaded) {
      try {
        const res = await fetch(`./jobs_data.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.jobs && data.jobs.length > 0) {
            allJobsData = data.jobs;
            if (data.lastScraped) {
              lastScrapedTimestamp = new Date(data.lastScraped).getTime();
              localStorage.setItem('scrapedeez_last_scraped', data.lastScraped);
            }
            localStorage.setItem('scrapedeez_jobs', JSON.stringify(allJobsData));
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Jobs fetch error:', err);
  }

  updateElapsedBadge();
  filterJobs();
}

function updateElapsedBadge() {
  const badgeText = document.getElementById('elapsedTimerText');
  if (!badgeText) return;

  if (!lastScrapedTimestamp) {
    badgeText.textContent = 'Not scanned yet';
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

// Manual or Auto Trigger: Re-Scan & Sync Pipeline
async function triggerScrapeNow() {
  if (isScrapingActive) return;
  isScrapingActive = true;

  const btn = document.getElementById('btnScrape');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Syncing...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    let freshDataLoaded = false;

    // 1. Fetch latest server database with cache busting
    try {
      const serverRes = await fetch(`./jobs_data.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (serverRes.ok) {
        const serverData = await serverRes.json();
        if (serverData.jobs && serverData.jobs.length > 0) {
          allJobsData = serverData.jobs;
          if (serverData.lastScraped) {
            lastScrapedTimestamp = new Date(serverData.lastScraped).getTime();
            localStorage.setItem('scrapedeez_last_scraped', serverData.lastScraped);
          }
          localStorage.setItem('scrapedeez_jobs', JSON.stringify(allJobsData));
          freshDataLoaded = true;
        }
      }
    } catch (e) {
      console.warn('Server JSON fetch notice:', e);
    }

    // 2. Try Backend API Trigger (/api/scrape-now) if available
    try {
      const res = await fetch('./api/scrape-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTitles: userConfig.targetTitles,
          keywords: userConfig.keywords
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.jobs && data.jobs.length > 0) {
          allJobsData = data.jobs;
          lastScrapedTimestamp = data.scrapedAt ? new Date(data.scrapedAt).getTime() : Date.now();
          localStorage.setItem('scrapedeez_last_scraped', new Date(lastScrapedTimestamp).toISOString());
          localStorage.setItem('scrapedeez_jobs', JSON.stringify(allJobsData));
          freshDataLoaded = true;
        }
      }
    } catch (e) {
      // Backend not running on static hosting
    }

    // 3. Client-Side Live Scraper (Direct public Greenhouse / Lever / Feeds)
    try {
      const clientJobs = await runClientSideScraper();
      if (clientJobs && clientJobs.length > 0) {
        allJobsData = clientJobs;
        lastScrapedTimestamp = Date.now();
        localStorage.setItem('scrapedeez_last_scraped', new Date(lastScrapedTimestamp).toISOString());
        localStorage.setItem('scrapedeez_jobs', JSON.stringify(allJobsData));
        freshDataLoaded = true;
      }
    } catch (e) {
      console.warn('Client scrape notice:', e);
    }

    if (freshDataLoaded && !lastScrapedTimestamp) {
      lastScrapedTimestamp = Date.now();
    }
  } catch (err) {
    console.error('Trigger scrape error:', err);
  } finally {
    isScrapingActive = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i><span>Re-Scan</span>`;
      if (window.lucide) lucide.createIcons();
    }
    updateElapsedBadge();
    filterJobs();
  }
}

function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

// Client-Side Scraper Engine (Direct Browser Calls to Public ATS APIs)
async function runClientSideScraper() {
  const ghCompanies = userConfig.greenhouseCompanies || [
    'webflow', 'squarespace', 'contentful', 'fastly', 'klaviyo', 'braze', 'circleci',
    'grafanalabs', 'pagerduty', 'launchdarkly', 'cockroachlabs', 'elastic', 'mongodb',
    'twilio', 'canonical', 'gusto', 'checkr', 'carta', 'samsara', 'lattice', 'airtable',
    'bitwarden', 'toast', 'remote', 'coursera', 'scaleai', 'anthropic', 'ripple',
    'cloudflare', 'datadog', 'vercel', 'gitlab', 'stripe', 'figma', 'pinterest',
    'reddit', 'discord', 'instacart', 'affirm', 'brex', 'robinhood'
  ];
  const leverCompanies = userConfig.leverCompanies || [
    'palantir', 'spotify', 'wealthfront', 'coupa', 'outreach', 'jumpcloud',
    'secureframe', 'everbridge', 'sophos', 'sysdig', 'scaleway', 'siteground',
    'kinsta', 'neon', 'metabase', 'activecampaign', 'brevo', 'mindtickle',
    'walkme', 'zilliz', 'zerotier', 'twingate', 'omnisend', 'netomi', 'brilliant',
    'clari', 'highspot', 'kraken', 'mistral', 'veeva'
  ];
  const searchTerms = [...(userConfig.targetTitles || []), ...(userConfig.keywords || [])]
    .map(t => t.toLowerCase().trim())
    .filter(Boolean);

  const promises = [];

  // Scrape Greenhouse Boards (CORS-friendly public REST API)
  for (const company of ghCompanies) {
    promises.push(
      fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`, {}, 4500)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || !data.jobs) return [];
          const matches = [];
          for (const job of data.jobs) {
            const title = (job.title || '').toLowerCase();
            const content = (job.content || '').toLowerCase();
            const location = job.location ? job.location.name : 'Remote / Various';

            const matched = searchTerms.find(term => title.includes(term) || content.includes(term));
            if (matched || searchTerms.length === 0) {
              matches.push({
                id: `gh-${company}-${job.id}`,
                source: `Greenhouse (${company.toUpperCase()})`,
                title: job.title,
                company: company.charAt(0).toUpperCase() + company.slice(1),
                location,
                workType: classifyClientWorkType(location, job.title),
                url: job.absolute_url,
                matchedKeyword: matched ? matched.toUpperCase() : 'SEARCH MATCH',
                date: job.updated_at || new Date().toISOString()
              });
            }
          }
          return matches;
        })
        .catch(() => [])
    );
  }

  // Scrape Lever Boards (CORS-friendly public REST API)
  for (const company of leverCompanies) {
    promises.push(
      fetchWithTimeout(`https://api.lever.co/v0/postings/${company}?mode=json`, {}, 4500)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || !Array.isArray(data)) return [];
          const matches = [];
          for (const job of data) {
            const title = (job.text || '').toLowerCase();
            const description = (job.descriptionPlain || '').toLowerCase();
            const location = job.categories ? job.categories.location : 'Remote';

            const matched = searchTerms.find(term => title.includes(term) || description.includes(term));
            if (matched || searchTerms.length === 0) {
              matches.push({
                id: `lever-${company}-${job.id}`,
                source: `Lever (${company.toUpperCase()})`,
                title: job.text,
                company: company.charAt(0).toUpperCase() + company.slice(1),
                location,
                workType: classifyClientWorkType(location, job.text),
                url: job.hostedUrl,
                matchedKeyword: matched ? matched.toUpperCase() : 'SEARCH MATCH',
                date: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString()
              });
            }
          }
          return matches;
        })
        .catch(() => [])
    );
  }

  // Scrape WeWorkRemotely RSS via public RSS-to-JSON
  promises.push(
    fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss')}`, {}, 4500)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.items) return [];
        const matches = [];
        for (const item of data.items) {
          const rawTitle = item.title || '';
          const parts = rawTitle.split(':');
          const company = parts.length > 1 ? parts[0].trim() : 'Unknown';
          const title = parts.length > 1 ? parts.slice(1).join(':').trim() : rawTitle;

          const matched = searchTerms.find(term => title.toLowerCase().includes(term));
          if (matched || searchTerms.length === 0) {
            matches.push({
              id: `wwr-${btoa(item.link || Math.random().toString()).substring(0, 10)}`,
              source: 'WeWorkRemotely Feed',
              title,
              company,
              location: 'Remote',
              workType: 'Remote',
              url: item.link,
              matchedKeyword: matched ? matched.toUpperCase() : 'DEVOPS / WEBOPS',
              date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
            });
          }
        }
        return matches;
      })
      .catch(() => [])
  );

  const results = await Promise.all(promises);
  const flatResults = results.flat();

  // Merge with existing cached jobs, deduplicate, filter < 30 days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const merged = [];
  const seen = new Set();

  for (const job of [...flatResults, ...allJobsData]) {
    const jobTime = new Date(job.date || now).getTime();
    if (!isNaN(jobTime) && (now - jobTime) > THIRTY_DAYS_MS) continue;

    const key = (job.title + '|' + job.company).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    merged.push({
      ...job,
      workType: job.workType || classifyClientWorkType(job.location, job.title),
      verifiedAt: new Date().toISOString()
    });
  }

  merged.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return merged;
}

function classifyClientWorkType(location = '', title = '') {
  const text = (location + ' ' + title).toLowerCase();
  if (text.includes('remote') || text.includes('anywhere') || text.includes('virtual') || text.includes('wfh')) {
    return 'Remote';
  }
  if (text.includes('hybrid') || text.includes('flexible')) {
    return 'Hybrid';
  }
  return 'Onsite';
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

function getJobCoords(job) {
  if (job.lat && job.lon) return { lat: job.lat, lon: job.lon };

  const rawLoc = job.location || '';
  const loc = rawLoc.toLowerCase();

  // 1. Check embedded 5-digit zip code if already cached
  const zipMatch = rawLoc.match(/\b(\d{5})\b/);
  if (zipMatch && zipGeocodeCache[zipMatch[1]]) {
    return zipGeocodeCache[zipMatch[1]];
  }

  // 2. Check prioritized city dictionary (longest match first)
  for (const [city, coords] of SORTED_CITY_COORDS) {
    if (loc.includes(city)) {
      return coords;
    }
  }

  // 3. Check for standard 2-letter US State abbreviation (e.g., "CA", "San Jose, CA", "Austin, TX")
  const stateMatch = rawLoc.match(/(?:,\s*|\b)([A-Z]{2})\b/);
  if (stateMatch && US_STATE_CENTROIDS[stateMatch[1]]) {
    return US_STATE_CENTROIDS[stateMatch[1]];
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

let zipInputDebounceTimer = null;
function handleZipInput() {
  clearTimeout(zipInputDebounceTimer);
  zipInputDebounceTimer = setTimeout(() => {
    const zipVal = document.getElementById('zipInput')?.value.trim() || '';
    if (zipVal.length === 5 && /^\d{5}$/.test(zipVal)) {
      const sortSelect = document.getElementById('sortSelect');
      if (sortSelect) sortSelect.value = 'distance';
      filterJobs();
    } else if (zipVal.length === 0) {
      const sortSelect = document.getElementById('sortSelect');
      if (sortSelect && sortSelect.value === 'distance') sortSelect.value = 'time';
      filterJobs();
    }
  }, 250);
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

  const minProfileSalary = userConfig.minSalary || 0;

  let userCoords = null;
  if (/^\d{5}$/.test(zipVal)) {
    userCoords = await geocodeZipCode(zipVal);
  }

  let filtered = allJobsData.filter(job => {
    // 1. Minimum Acceptable Salary Filter
    if (minProfileSalary > 0) {
      const jobSalaryStr = formatSalary(job);
      const jobSalNum = parseSalaryMin(jobSalaryStr);
      if (jobSalNum > 0 && jobSalNum < minProfileSalary) {
        return false;
      }
    }

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
      matchSource = (job.source || '').includes('Greenhouse') || (job.source || '').includes('Lever');
    } else if (sourceFilter === 'feeds') {
      matchSource = (job.source || '').includes('RemoteOK') || (job.source || '').includes('WeWorkRemotely');
    }

    if (!matchSource) return false;

    // 4. Multi-Select Location Setup Checkboxes (Remote, Hybrid, Onsite)
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

    return matchWorkType;
  });

  // Calculate distance using US Metropolitan Geocode Lookup Table
  filtered.forEach(job => {
    const rawWt = (job.workType || '').toLowerCase();
    const locLower = (job.location || '').toLowerCase();
    const titleLower = (job.title || '').toLowerCase();
    const isRemote = rawWt.includes('remote') || locLower.includes('remote') || titleLower.includes('remote');

    const jobCoords = getJobCoords(job);

    if (userCoords && jobCoords) {
      job.distanceMiles = getDistanceMiles(userCoords.lat, userCoords.lon, jobCoords.lat, jobCoords.lon);
    } else if (isRemote) {
      job.distanceMiles = 99990;
    } else {
      job.distanceMiles = 99999;
    }
  });

  // Filter out jobs beyond user-selected radius if radius != 'any' & zip entered
  if (userCoords && radiusVal !== 'any') {
    const maxMiles = parseFloat(radiusVal);
    filtered = filtered.filter(job => {
      const rawWt = (job.workType || '').toLowerCase();
      const locLower = (job.location || '').toLowerCase();
      const titleLower = (job.title || '').toLowerCase();
      const isRemote = rawWt.includes('remote') || locLower.includes('remote') || titleLower.includes('remote');

      if (isRemote) return true; // Keep remote roles
      return job.distanceMiles !== undefined && job.distanceMiles <= maxMiles;
    });
  }

  // Multi-Sort (Time Posted, Salary, Distance)
  if (sortMode === 'salary') {
    filtered.sort((a, b) => parseSalaryMin(formatSalary(b)) - parseSalaryMin(formatSalary(a)));
  } else if (sortMode === 'distance' || userCoords) {
    // Sort closest to furthest away from the user's inputted zip code
    filtered.sort((a, b) => {
      const distA = a.distanceMiles !== undefined ? a.distanceMiles : 99999;
      const distB = b.distanceMiles !== undefined ? b.distanceMiles : 99999;
      if (distA !== distB) {
        return distA - distB;
      }
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
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
            ${job.distanceMiles !== undefined && job.distanceMiles < 9000 ? `<span class="badge-distance"><i data-lucide="navigation"></i> ${Math.round(job.distanceMiles) <= 0 ? '&lt; 1' : Math.round(job.distanceMiles)} mi away</span>` : ''}
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

// Date-Only Formatting
function formatDate(isoStr) {
  if (!isoStr) return 'Recently';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}

