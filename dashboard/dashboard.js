/* ==========================================================================
   Scrapedeez — PM Operations Command Center & Automated Submitter
   ========================================================================== */

const CANONICAL_DEFAULT_PROFILE = {
  fullName: 'William Tan',
  email: 'wtan.web404@gmail.com',
  phone: '+1.619.928.9574',
  location: 'San Diego, CA',
  linkedInUrl: 'https://linkedin.com/in/willtan',
  githubUrl: 'https://github.com/wtan404',
  portfolioUrl: 'https://synopsdigital.com',
  coverNote: 'IT Operations leader and Web Operations specialist with over 10 years of experience delivering enterprise solutions across multiple platforms. Proven track record of scaling global IT initiatives, bridging IT with commercial strategy, leading cross-functional teams, managing change control (ServiceNow), and engineering path-to-production CI/CD workflows.',
  legallyAuthorized: 'Yes',
  requiresSponsorship: 'No',
  desiredSalary: 160000,
  noticePeriod: '2 Weeks',
  referralSource: 'Company Career Page',
  eeocGender: 'Decline to Self-Identify'
};

const DEFAULT_SEED_RESUMES = [
  {
    id: 'res_it_corp_lead',
    label: 'Corporate / IT Lead & Operations',
    specialization: 'IT Management, Release Management, WebOps, DevOps, Governance',
    fileName: 'William Tan - Resume.docx',
    uploadDate: new Date().toISOString(),
    sizeBytes: 12228,
    isDefault: true
  },
  {
    id: 'res_web_ecommerce',
    label: 'Web Operations & E-commerce',
    specialization: 'Website Operations, Shopify, Web Architecture, E-commerce, CRO',
    fileName: 'William Tan - E-commerce Resume.docx',
    uploadDate: new Date().toISOString(),
    sizeBytes: 653030,
    isDefault: false
  }
];

let allCuratedJobs = [];
let allHotlist72hJobs = [];
let allArchive14dJobs = [];
let currentTimeHorizon = '72h'; // '72h' | '14d'
let savedResumes = [];
let applicantProfile = { ...CANONICAL_DEFAULT_PROFILE };
let submissionLogs = [];
let selectedJobs = new Map(); // jobId -> { job, resumeId }
let currentQueueTab = 'active'; // 'active' | 'applied' | 'dismissed'
let appliedJobsMap = {}; // key -> { jobId, job, status, resumeId, resumeLabel, notes, appliedAt }
let dismissedJobsMap = {}; // key -> { jobId, job, reason, dismissedAt }

let selectedResumeUploadBase64 = null;
let selectedResumeUploadFileName = null;

function isLocalBackend() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || window.location.port === '8090';
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  if (window.lucide) lucide.createIcons();
  initDashboard();
});

// --------------------------------------------------------------------------
// Initialization & Data Loading
// --------------------------------------------------------------------------

async function initDashboard(forceRefresh = false) {
  try {
    // 1. Instant optimistic load from browser localStorage
    loadApplicationsState();

    // 2. Fetch server cloud state (PHP API in prod / Express in local dev)
    let summary = null;
    try {
      const res = await fetch(`./api.php?action=summary&t=${Date.now()}`);
      if (res.ok) {
        summary = await res.json();
      }
    } catch (e) {
      summary = null;
    }

    if (!summary) {
      try {
        const res = await fetch(`./api/dashboard/summary?t=${Date.now()}`);
        if (res.ok) {
          summary = await res.json();
        }
      } catch (e2) {
        summary = null;
      }
    }

    if (summary && summary.profile && summary.profile.fullName) {
      applicantProfile = { ...CANONICAL_DEFAULT_PROFILE, ...summary.profile };
      savedResumes = (summary.resumes && summary.resumes.length > 0) ? summary.resumes : await getFallbackResumes();
      submissionLogs = summary.recentLogs || [];
      if (summary.applications) {
        await syncApplicationsFromServer(summary.applications);
      }
      updateKPIs(summary.jobsCount24h, savedResumes.length, submissionLogs.length, summary.totalVerified);
    } else {
      await loadProfileFallback();
      await loadResumesFallback();
      await loadLogsFallback();
      await syncApplicationsFromServer();
    }

    // 3. Fetch 72-hour job queue
    await fetch24hQueue();

  } catch (err) {
    console.warn('Dashboard initialization warning:', err);
    await loadProfileFallback();
    await loadResumesFallback();
    await syncApplicationsFromServer();
    await fetch24hQueue();
  } finally {
    populateProfileForm();
    renderResumesList();
    renderTriageTable();
    renderReceiptsLog();
    updateQueueBadgeCounts();
    if (window.lucide) lucide.createIcons();
  }
}

function updateKPIs(count24h, resumesCount, subsCount, totalVerified) {
  const el24h = document.getElementById('metric24hCount');
  const elResumes = document.getElementById('metricResumesCount');
  const elSubs = document.getElementById('metricSubmissionsCount');
  const elTotal = document.getElementById('metricTotalVerified');

  const activeCount = getActiveFilteredJobs(false).length;
  const appliedCount = Object.keys(appliedJobsMap).length;

  if (el24h) el24h.textContent = activeCount;
  if (elResumes) elResumes.textContent = resumesCount ?? 0;
  if (elSubs) elSubs.textContent = appliedCount;
  if (elTotal) elTotal.textContent = totalVerified ? totalVerified.toLocaleString() : '0';

  updateQueueBadgeCounts();
}

function loadApplicationsState() {
  try {
    const raw = localStorage.getItem('scrapedeez_job_applications');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.applied && typeof parsed.applied === 'object') {
          appliedJobsMap = { ...parsed.applied };
        }
        if (parsed.dismissed && typeof parsed.dismissed === 'object') {
          dismissedJobsMap = { ...parsed.dismissed };
        }
      }
    }
  } catch (e) {
    console.warn('Error reading application state from localStorage:', e);
  }

  // Also import from submissionLogs if not already present in appliedJobsMap
  if (Array.isArray(submissionLogs)) {
    submissionLogs.forEach(log => {
      const key = log.url || log.receiptId;
      if (key && !appliedJobsMap[key]) {
        appliedJobsMap[key] = {
          jobId: key,
          job: {
            title: log.title,
            company: log.company,
            url: log.url,
            source: 'ATS'
          },
          status: 'Applied',
          resumeLabel: log.resumeLabel || 'Default Resume',
          appliedAt: log.submittedAt || new Date().toISOString(),
          notes: log.message || ''
        };
      }
    });
  }
}

async function syncApplicationsFromServer(serverData = null) {
  try {
    let data = serverData;
    if (!data) {
      try {
        const res = await fetch(`./api.php?action=applications&t=${Date.now()}`);
        if (res.ok) data = await res.json();
      } catch (e) {}
    }
    if (!data) {
      try {
        const res = await fetch(`./api/jobs/applications?t=${Date.now()}`);
        if (res.ok) data = await res.json();
      } catch (e) {}
    }
    if (!data) {
      try {
        const res = await fetch(`../job_applications.json?t=${Date.now()}`);
        if (res.ok) data = await res.json();
      } catch (e) {}
    }

    if (data && typeof data === 'object') {
      const serverApplied = (data.applied && typeof data.applied === 'object') ? data.applied : {};
      const serverDismissed = (data.dismissed && typeof data.dismissed === 'object') ? data.dismissed : {};

      // Detect if we have local uncommitted changes from an offline/previous session
      let hasLocalUnsynced = false;
      Object.keys(appliedJobsMap).forEach(k => {
        if (!serverApplied[k]) hasLocalUnsynced = true;
      });
      Object.keys(dismissedJobsMap).forEach(k => {
        if (!serverDismissed[k]) hasLocalUnsynced = true;
      });

      // Two-way reconciliation preserving latest timestamps for Applied, Saved, and Dismissed
      const allKeys = new Set([
        ...Object.keys(appliedJobsMap),
        ...Object.keys(dismissedJobsMap),
        ...Object.keys(serverApplied),
        ...Object.keys(serverDismissed)
      ]);

      const mergedApplied = {};
      const mergedDismissed = {};

      allKeys.forEach(k => {
        const localApp = appliedJobsMap[k];
        const serverApp = serverApplied[k];
        const localDis = dismissedJobsMap[k];
        const serverDis = serverDismissed[k];

        const bestApp = (localApp && serverApp)
          ? ((new Date(localApp.updatedAt || localApp.appliedAt || 0).getTime()) >= (new Date(serverApp.updatedAt || serverApp.appliedAt || 0).getTime()) ? localApp : serverApp)
          : (localApp || serverApp);

        const bestDis = (localDis && serverDis)
          ? ((new Date(localDis.updatedAt || localDis.dismissedAt || 0).getTime()) >= (new Date(serverDis.updatedAt || serverDis.dismissedAt || 0).getTime()) ? localDis : serverDis)
          : (localDis || serverDis);

        if (bestApp && bestDis) {
          const tApp = new Date(bestApp.updatedAt || bestApp.appliedAt || 0).getTime();
          const tDis = new Date(bestDis.updatedAt || bestDis.dismissedAt || 0).getTime();
          if (tApp >= tDis) mergedApplied[k] = bestApp;
          else mergedDismissed[k] = bestDis;
        } else if (bestApp) {
          mergedApplied[k] = bestApp;
        } else if (bestDis) {
          mergedDismissed[k] = bestDis;
        }
      });

      appliedJobsMap = mergedApplied;
      dismissedJobsMap = mergedDismissed;

      try {
        localStorage.setItem('scrapedeez_job_applications', JSON.stringify({
          applied: appliedJobsMap,
          dismissed: dismissedJobsMap
        }));
      } catch (e) {}

      if (hasLocalUnsynced) {
        syncApplicationsToServer();
      }
      return true;
    }
  } catch (err) {
    console.warn('Applications cloud sync notice:', err.message);
  }
  return false;
}

async function syncApplicationsToServer() {
  try {
    const payload = {
      applied: appliedJobsMap,
      dismissed: dismissedJobsMap
    };
    const res = await fetch(`./api.php?action=applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      await fetch(`./api/jobs/application-batch-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: Object.values(appliedJobsMap) })
      });
    }
  } catch (e) {}
}

async function persistApplicationStatus(jobId, action, extra = {}) {
  const payload = { jobId, action, ...extra };
  try {
    const res = await fetch(`./api.php?action=application-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      await fetch(`./api/jobs/application-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.warn('Action sync notice:', err.message);
  }
}

async function persistBatchApplicationStatus(action, jobs) {
  const payload = { action, jobs };
  try {
    const res = await fetch(`./api.php?action=application-batch-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      await fetch(`./api/jobs/application-batch-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: jobs, action })
      });
    }
  } catch (err) {
    console.warn('Batch sync notice:', err.message);
  }
}

async function persistProfile(profile) {
  try {
    const res = await fetch(`./api.php?action=profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    if (!res.ok) {
      await fetch(`./api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    }
  } catch (err) {
    console.warn('Profile sync notice:', err.message);
  }
}

function saveApplicationsState() {
  try {
    localStorage.setItem('scrapedeez_job_applications', JSON.stringify({
      applied: appliedJobsMap,
      dismissed: dismissedJobsMap
    }));
  } catch (e) {}

  updateQueueBadgeCounts();
}

function updateQueueBadgeCounts() {
  const activeJobs = getActiveFilteredJobs(false);
  const appliedCount = Object.keys(appliedJobsMap).length;
  const dismissedCount = Object.keys(dismissedJobsMap).length;

  const elActive = document.getElementById('countTabActive');
  const elApplied = document.getElementById('countTabApplied');
  const elDismissed = document.getElementById('countTabDismissed');

  if (elActive) elActive.textContent = activeJobs.length;
  if (elApplied) elApplied.textContent = appliedCount;
  if (elDismissed) elDismissed.textContent = dismissedCount;

  const kpi24h = document.getElementById('metric24hCount');
  if (kpi24h) kpi24h.textContent = activeJobs.length;

  const kpiSubs = document.getElementById('metricSubmissionsCount');
  if (kpiSubs) kpiSubs.textContent = appliedCount;
}

const DASH_EXCLUDED_ROLE_PATTERNS = [
  /\b(product manager|group product manager|principal product manager|director of product|vp of product|head of product|product owner|product marketing)\b/i,
  /\b(human resources|talent acquisition|recruiter|recruiting|people ops|people operations|people partner|talent partner|people lead|people specialist)\b/i,
  /\b(accounting|accountant|finance|financial analyst|controller|payroll|accounts payable|accounts receivable|audit|tax|billing)\b/i
];

function isDashExcludedRole(title = '', extra = '') {
  const combined = (title + ' ' + extra).toLowerCase();
  if (combined.includes('technical program manager') || combined.includes('tpm') || combined.includes('it program manager') || combined.includes('infrastructure program manager')) {
    return false;
  }
  return DASH_EXCLUDED_ROLE_PATTERNS.some(rx => rx.test(combined));
}

function getActiveFilteredJobs(applyFilters = true) {
  let list = allCuratedJobs.filter(job => {
    const key = job.id || job.url;
    if (appliedJobsMap[key] || dismissedJobsMap[key]) return false;
    // Exclude HR, Finance, and non-technical Product Managers (strict IT focus)
    if (isDashExcludedRole(job.title || '', (job.company || '') + ' ' + (job.matchedKeyword || ''))) return false;
    // Exclude Onsite positions from curated results (Remote & Hybrid only)
    const wt = (job.workType || '').toLowerCase();
    if (wt.includes('onsite') || wt === 'on-site') return false;
    return true;
  });

  if (!applyFilters) return list;

  const searchVal = document.getElementById('triageSearchInput')?.value.toLowerCase().trim() || '';
  const wtFilter = document.getElementById('triageWorkTypeFilter')?.value || 'all';
  const srcFilter = document.getElementById('triageSourceFilter')?.value || 'all';
  const salFilter = parseInt(document.getElementById('triageSalaryFilter')?.value, 10) || 0;

  return list.filter(job => {
    if (searchVal) {
      const text = (job.title + ' ' + job.company + ' ' + (job.matchedKeyword || '') + ' ' + (job.location || '')).toLowerCase();
      if (!text.includes(searchVal)) return false;
    }
    if (wtFilter !== 'all') {
      const wt = (job.workType || '').toLowerCase();
      if (!wt.includes(wtFilter)) return false;
    }
    if (srcFilter !== 'all') {
      const s = (job.source || '').toLowerCase();
      if (srcFilter === 'ats') {
        if (!s.includes('greenhouse') && !s.includes('lever') && !s.includes('ashby') && !s.includes('smartrecruiters') && s !== 'ats') return false;
      } else if (srcFilter === 'feeds') {
        if (!s.includes('remotive') && !s.includes('jobicy') && !s.includes('remoteok') && !s.includes('weworkremotely') && s !== 'feed') return false;
      }
    }
    if (salFilter > 0) {
      const salaryData = formatSalaryUSD(job.salary, job.title);
      const ceiling = parseSalaryCeiling(salaryData.formatted);
      if (ceiling > 0 && ceiling < salFilter) {
        return false;
      }
    }
    return true;
  });
}

// --------------------------------------------------------------------------
// Modal Controls: Candidate Profile & Resume Variations
// --------------------------------------------------------------------------

function openProfileModal(tab = 'core') {
  const modal = document.getElementById('candidateProfileModal');
  if (modal) {
    modal.classList.add('open');
    switchProfileTab(tab);
    if (window.lucide) lucide.createIcons();
  }
}

function closeProfileModal() {
  const modal = document.getElementById('candidateProfileModal');
  if (modal) modal.classList.remove('open');
}

function openResumesModal() {
  const modal = document.getElementById('resumeVariationsModal');
  if (modal) {
    modal.classList.add('open');
    renderResumesList();
    if (window.lucide) lucide.createIcons();
  }
}

function closeResumesModal() {
  const modal = document.getElementById('resumeVariationsModal');
  if (modal) modal.classList.remove('open');
}

function handleModalBackdropClick(event, modalId) {
  if (event && event.target && event.target.id === modalId) {
    if (modalId === 'candidateProfileModal') closeProfileModal();
    if (modalId === 'resumeVariationsModal') closeResumesModal();
  }
}

// Global escape key listener to close active pop-up modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeProfileModal();
    closeResumesModal();
  }
});

// --------------------------------------------------------------------------
// Multi-Currency Normalization & USD Auto-Conversion Engine
// --------------------------------------------------------------------------

function formatSalaryUSD(rawSalary, jobTitle = '') {
  let raw = (typeof rawSalary === 'object' && rawSalary !== null) ? (rawSalary.salary || '') : (rawSalary || '');
  raw = String(raw).trim();

  // If empty and jobTitle provided, return estimate in USD
  if (!raw && jobTitle) {
    const t = String(jobTitle).toLowerCase();
    if (t.includes('director') || t.includes('head') || t.includes('vp')) {
      return { formatted: '$175,000 - $245,000 / yr (est.)', isConverted: false };
    }
    if (t.includes('manager') || t.includes('lead')) {
      return { formatted: '$135,000 - $185,000 / yr (est.)', isConverted: false };
    }
    if (t.includes('senior') || t.includes('sr')) {
      return { formatted: '$120,000 - $165,000 / yr (est.)', isConverted: false };
    }
    return { formatted: '$105,000 - $150,000 / yr (est.)', isConverted: false };
  }
  if (!raw) return { formatted: '', isConverted: false };

  // Exchange rates for automated USD conversions
  const rates = {
    'GBP': 1.28, '£': 1.28,
    'EUR': 1.08, '€': 1.08,
    'CAD': 0.74, 'C$': 0.74, 'CA$': 0.74,
    'AUD': 0.65, 'A$': 0.65, 'AU$': 0.65,
    'INR': 0.012, '₹': 0.012,
    'CHF': 1.13
  };

  let detectedCurrency = null;
  let rate = 1.0;

  if (/£|GBP/i.test(raw)) { detectedCurrency = 'GBP'; rate = rates.GBP; }
  else if (/€|EUR/i.test(raw)) { detectedCurrency = 'EUR'; rate = rates.EUR; }
  else if (/C\$|CA\$|CAD/i.test(raw)) { detectedCurrency = 'CAD'; rate = rates.CAD; }
  else if (/A\$|AU\$|AUD/i.test(raw)) { detectedCurrency = 'AUD'; rate = rates.AUD; }
  else if (/₹|INR/i.test(raw)) { detectedCurrency = 'INR'; rate = rates.INR; }
  else if (/CHF/i.test(raw)) { detectedCurrency = 'CHF'; rate = rates.CHF; }

  // If already in USD or no foreign currency symbol
  if (!detectedCurrency) {
    let display = raw;
    if (/^\d/.test(display)) display = '$' + display;
    return { formatted: display, isConverted: false };
  }

  // Extract numeric amounts (ranges like £80k - £100k or €75,000 - €95,000)
  const nums = raw.match(/\d[\d,]*(?:\.\d+)?k?/gi);
  if (!nums || nums.length === 0) {
    return { formatted: raw, isConverted: false };
  }

  const convertedParts = nums.map(n => {
    const isK = /k$/i.test(n);
    let val = parseFloat(n.replace(/,/g, '').replace(/k/i, ''));
    if (isNaN(val)) return n;
    if (isK) val *= 1000;
    const usdVal = Math.round(val * rate);
    if (usdVal >= 1000) {
      return '$' + Math.round(usdVal / 1000) + 'k';
    }
    return '$' + usdVal.toLocaleString();
  });

  const convertedRange = convertedParts.join(' - ');
  const subtleNote = `<span class="salary-converted-note" title="Converted to USD from ${escapeHtml(raw)}">conv.</span>`;
  return {
    formatted: `${convertedRange} ${subtleNote}`,
    isConverted: true,
    orig: raw
  };
}

function parseSalaryCeiling(salaryStr) {
  if (!salaryStr || typeof salaryStr !== 'string') return 0;
  const clean = salaryStr.replace(/<[^>]+>/g, '').replace(/,/g, '');
  const matches = clean.match(/(\d+)(?:k|000)?/gi);
  if (!matches || matches.length === 0) return 0;
  let max = 0;
  for (const m of matches) {
    let num = parseInt(m, 10);
    if (num < 1000) num *= 1000;
    if (num > max) max = num;
  }
  return max;
}

// --------------------------------------------------------------------------
// Profile Tabs & Field Resolution Toggles
// --------------------------------------------------------------------------

function switchProfileTab(tabName) {
  const btnCore = document.getElementById('profTabBtnCore');
  const btnRes = document.getElementById('profTabBtnResolution');
  const tabCore = document.getElementById('profTabCore');
  const tabRes = document.getElementById('profTabResolution');

  if (tabName === 'core') {
    if (btnCore) btnCore.classList.add('active');
    if (btnRes) btnRes.classList.remove('active');
    if (tabCore) tabCore.style.display = 'flex';
    if (tabRes) tabRes.style.display = 'none';
  } else {
    if (btnCore) btnCore.classList.remove('active');
    if (btnRes) btnRes.classList.add('active');
    if (tabCore) tabCore.style.display = 'none';
    if (tabRes) tabRes.style.display = 'flex';
  }
}

// --------------------------------------------------------------------------
// 72-Hour Hotlist & 14-Day Archive Triage Queue
// --------------------------------------------------------------------------

async function fetch24hQueue() {
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const statRes = await fetch(`../jobs_data.json?t=${Date.now()}`);
    if (statRes.ok) {
      const fullData = await statRes.json();
      const rawJobs = fullData.jobs || [];

      // Filter to maximum 14 days retention (2 weeks max archive)
      allArchive14dJobs = rawJobs.filter(j => {
        if (!j || !j.date) return false;
        const t = new Date(j.date).getTime();
        return !isNaN(t) && (now - t) <= FOURTEEN_DAYS_MS;
      });

      // Filter to 72h hotlist
      allHotlist72hJobs = allArchive14dJobs.filter(j => {
        const t = new Date(j.date).getTime();
        return (now - t) <= SEVENTY_TWO_HOURS_MS;
      });

      allCuratedJobs = (currentTimeHorizon === '14d') ? allArchive14dJobs : allHotlist72hJobs;

      const totalVerifiedEl = document.getElementById('metricTotalVerified');
      if (totalVerifiedEl) totalVerifiedEl.textContent = allArchive14dJobs.length.toLocaleString();
    } else {
      const res = await fetch(`./api/jobs/curated-24h?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.jobs)) {
          allHotlist72hJobs = data.jobs;
          allArchive14dJobs = data.jobs;
          allCuratedJobs = data.jobs;
        }
      }
    }
  } catch (e) {
    console.warn('Triage queue fetch notice:', e);
  }

  const countEl = document.getElementById('metric24hCount');
  if (countEl) countEl.textContent = allCuratedJobs.length;
}

function switchTimeHorizon(horizon) {
  currentTimeHorizon = horizon || '72h';
  allCuratedJobs = (currentTimeHorizon === '14d') ? allArchive14dJobs : allHotlist72hJobs;

  const tabLabel = document.getElementById('tabLabelActive');
  if (tabLabel) {
    tabLabel.textContent = (currentTimeHorizon === '14d') ? 'Active 14d Archive' : 'Active 72h Queue';
  }

  const kpiLabel = document.getElementById('metricHotlistLabel');
  if (kpiLabel) {
    kpiLabel.innerHTML = (currentTimeHorizon === '14d')
      ? '<i data-lucide="archive"></i> 14d Active View Roles'
      : '<i data-lucide="flame"></i> 72h Hotlist Positions';
    if (window.lucide) lucide.createIcons();
  }

  selectedJobs.clear();
  updateStickyDispatchBar();
  renderTriageTable();
  updateQueueBadgeCounts();
}

function switchQueueTab(tabName) {
  currentQueueTab = tabName;
  ['active', 'applied', 'dismissed'].forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
  });
  selectedJobs.clear();
  updateStickyDispatchBar();
  renderTriageTable();
}

function renderTriageTable() {
  const thead = document.getElementById('triageTableHead');
  const tbody = document.getElementById('triageTableBody');
  if (!tbody) return;

  const searchVal = document.getElementById('triageSearchInput')?.value.toLowerCase().trim() || '';
  const wtFilter = document.getElementById('triageWorkTypeFilter')?.value || 'all';
  const srcFilter = document.getElementById('triageSourceFilter')?.value || 'all';

  // 1. ACTIVE 72H QUEUE
  if (currentQueueTab === 'active') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 40px; text-align: center;">
            <input type="checkbox" id="chkSelectAll" class="chk-select-job" onchange="toggleSelectAll(this.checked)" title="Select/Deselect All">
          </th>
          <th>Employer & Source</th>
          <th>Role Title & Match</th>
          <th>Location & Setup</th>
          <th>Age</th>
          <th>Resume</th>
          <th style="text-align: right; width: 90px; min-width: 90px;">Actions</th>
        </tr>
      `;
    }

    const filtered = getActiveFilteredJobs(true);

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <i data-lucide="check-circle" style="width: 32px; height: 32px; margin: 0 auto 0.6rem; color: var(--accent-emerald);"></i>
            <p>No active positions within 72 hours matching your filters. All caught up or moved to Tracking!</p>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    tbody.innerHTML = filtered.map(job => {
      const key = job.id || job.url;
      const isChecked = selectedJobs.has(key);
      const timeAgo = formatTimeAgo(job.date);
      const assignedResumeId = selectedJobs.get(key)?.resumeId || (savedResumes[0] ? savedResumes[0].id : '');
      const salaryResult = formatSalaryUSD(job.salary, job.title);

      return `
        <tr class="${isChecked ? 'selected' : ''}" id="row_${escapeHtml(key)}">
          <td style="text-align: center;">
            <input type="checkbox" class="chk-select-job" 
              ${isChecked ? 'checked' : ''} 
              onchange="toggleJobSelection('${escapeHtml(key)}', this.checked)">
          </td>
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(job.company)}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.15rem;">${escapeHtml(job.source || 'ATS Direct')}</div>
          </td>
          <td>
            <div class="triage-role-title">
              <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-main); text-decoration:none;" title="Open posting in new tab">
                ${escapeHtml(job.title)}
              </a>
            </div>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; margin-top: 0.25rem;">
              ${job.matchedKeyword ? `<span class="hotlist-tag match-tag compact-tag">${escapeHtml(job.matchedKeyword)}</span>` : ''}
              ${salaryResult.formatted ? `<span class="hotlist-tag salary-tag compact-tag">${salaryResult.formatted}</span>` : ''}
            </div>
          </td>
          <td>
            <div>${escapeHtml(job.location || 'Remote')}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.1rem;">${escapeHtml(job.workType || 'Remote')}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent-emerald);">
            ${timeAgo}
          </td>
          <td>
            <select class="triage-resume-select" id="resume_sel_${escapeHtml(key)}" onchange="updateJobResume('${escapeHtml(key)}', this.value)">
              ${savedResumes.length === 0 ? '<option value="">Default Resume</option>' : ''}
              ${savedResumes.map(r => `
                <option value="${r.id}" ${assignedResumeId === r.id ? 'selected' : ''}>
                  ${escapeHtml(r.label)}
                </option>
              `).join('')}
            </select>
          </td>
          <td style="text-align: right; width: 90px; min-width: 90px; padding: 0.5rem 0.4rem;">
            <div class="action-stack-vert">
              <button type="button" class="btn btn-primary btn-xs" onclick="quickSingleSubmit('${escapeHtml(key)}')" title="Auto-submit / package application">
                <i data-lucide="send"></i>
                <span>Submit</span>
              </button>
              <div class="action-sub-row">
                <button type="button" class="btn btn-applied btn-xs" onclick="markJobAsApplied('${escapeHtml(key)}')" title="Mark as Applied (Already filled out)">
                  <i data-lucide="check"></i>
                </button>
                <button type="button" class="btn btn-drop btn-xs" onclick="dismissJob('${escapeHtml(key)}', 'Irrelevant')" title="Drop: Irrelevant / Out of Scope">
                  <i data-lucide="eye-off"></i>
                </button>
                <button type="button" class="btn btn-uninterested btn-xs" onclick="dismissJob('${escapeHtml(key)}', 'Uninterested')" title="Drop: Uninterested / Pass">
                  <i data-lucide="thumbs-down"></i>
                </button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    return;
  }

  // 2. APPLIED & TRACKING QUEUE
  if (currentQueueTab === 'applied') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Employer & Role</th>
          <th>Location & Work Setup</th>
          <th>Date Applied</th>
          <th>Resume</th>
          <th>Application Status</th>
          <th style="text-align: right; width: 90px; min-width: 90px;">Actions</th>
        </tr>
      `;
    }

    let appliedList = Object.values(appliedJobsMap);
    if (searchVal) {
      appliedList = appliedList.filter(item => {
        const j = item.job || {};
        const text = (j.title + ' ' + j.company + ' ' + (item.notes || '') + ' ' + (item.status || '')).toLowerCase();
        return text.includes(searchVal);
      });
    }

    if (appliedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <i data-lucide="file-check" style="width: 32px; height: 32px; margin: 0 auto 0.6rem; color: var(--accent-emerald);"></i>
            <p>No applied applications in tracking yet. Click "Submit" or "Applied" on any active job to track it here!</p>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Sort newest applied first
    appliedList.sort((a, b) => new Date(b.appliedAt || 0).getTime() - new Date(a.appliedAt || 0).getTime());

    tbody.innerHTML = appliedList.map(item => {
      const key = item.jobId;
      const job = item.job || {};
      const timeAgo = formatTimeAgo(item.appliedAt);
      const appliedDate = item.appliedAt ? new Date(item.appliedAt).toLocaleDateString() : 'Recently';

      return `
        <tr id="row_${escapeHtml(key)}">
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(job.company || 'Company')}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.15rem;">
              <a href="${escapeHtml(job.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--text-dim); text-decoration:none;" title="Open posting in new tab">
                ${escapeHtml(job.title || 'Job Title')}
              </a>
            </div>
          </td>
          <td>
            <div>${escapeHtml(job.location || 'Remote')}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.1rem;">${escapeHtml(job.workType || 'Remote')}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent-emerald);">
            ${timeAgo}
            <div style="font-size: 0.7rem; color: var(--text-dim);">${appliedDate}</div>
          </td>
          <td>
            <span style="font-size: 0.78rem; color: var(--text-muted);"><i data-lucide="file-text"></i> ${escapeHtml(item.resumeLabel || 'Default Resume')}</span>
          </td>
          <td>
            <select class="status-select-badge" onchange="updateAppliedStatus('${escapeHtml(key)}', this.value)">
              <option value="Applied" ${item.status === 'Applied' ? 'selected' : ''}>🟢 Applied</option>
              <option value="Interviewing" ${item.status === 'Interviewing' ? 'selected' : ''}>🔵 Interviewing</option>
              <option value="Offer" ${item.status === 'Offer' ? 'selected' : ''}>⭐ Offer</option>
              <option value="Archived" ${item.status === 'Archived' ? 'selected' : ''}>⚪ Archived</option>
              <option value="Rejected" ${item.status === 'Rejected' ? 'selected' : ''}>🔴 Rejected</option>
            </select>
          </td>
          <td style="text-align: right; width: 90px; min-width: 90px; padding: 0.5rem 0.4rem;">
            <div class="action-stack-vert">
              <button type="button" class="btn btn-secondary btn-xs" onclick="restoreJob('${escapeHtml(key)}')" title="Move back to Active 72h Queue">
                <i data-lucide="undo-2"></i>
                <span>Re-Activate</span>
              </button>
              <button type="button" class="btn btn-drop btn-xs" onclick="removeTrackingRecord('${escapeHtml(key)}')" title="Remove from tracking">
                <i data-lucide="trash-2"></i>
                <span>Remove</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    return;
  }

  // 3. DISMISSED / HIDDEN QUEUE
  if (currentQueueTab === 'dismissed') {
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Employer & Role Title</th>
          <th>Location & Source</th>
          <th>Dropped Date</th>
          <th>Drop Reason</th>
          <th style="text-align: right; width: 90px; min-width: 90px;">Actions</th>
        </tr>
      `;
    }

    let dismissedList = Object.values(dismissedJobsMap);
    if (searchVal) {
      dismissedList = dismissedList.filter(item => {
        const j = item.job || {};
        const text = (j.title + ' ' + j.company + ' ' + (item.reason || '')).toLowerCase();
        return text.includes(searchVal);
      });
    }

    if (dismissedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <i data-lucide="sparkles" style="width: 32px; height: 32px; margin: 0 auto 0.6rem; color: var(--accent-purple-light);"></i>
            <p>No dismissed postings. Click "Drop" on any irrelevant job in the active queue to hide it from review.</p>
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    dismissedList.sort((a, b) => new Date(b.dismissedAt || 0).getTime() - new Date(a.dismissedAt || 0).getTime());

    tbody.innerHTML = dismissedList.map(item => {
      const key = item.jobId;
      const job = item.job || {};
      const timeAgo = formatTimeAgo(item.dismissedAt);

      return `
        <tr id="row_${escapeHtml(key)}">
          <td>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(job.company || 'Company')}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.15rem;">
              <a href="${escapeHtml(job.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--text-dim); text-decoration:none;" title="Open posting in new tab">
                ${escapeHtml(job.title || 'Job Title')}
              </a>
            </div>
          </td>
          <td>
            <div>${escapeHtml(job.location || 'Remote')}</div>
            <div style="font-size: 0.74rem; font-style: italic; color: var(--text-dim); margin-top: 0.15rem;">${escapeHtml(job.source || 'ATS')}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dim);">
            ${timeAgo}
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 0.74rem; color: ${item.reason === 'Uninterested' ? '#fbbf24' : '#f87171'}; background: ${item.reason === 'Uninterested' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.1)'}; border: 1px solid ${item.reason === 'Uninterested' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.25)'}; padding: 0.2rem 0.5rem; border-radius: 4px;">
              ${escapeHtml(item.reason || 'Irrelevant')}
            </span>
          </td>
          <td style="text-align: right; width: 90px; min-width: 90px; padding: 0.5rem 0.4rem;">
            <div class="action-stack-vert">
              <button type="button" class="btn btn-primary btn-xs" onclick="restoreJob('${escapeHtml(key)}')" title="Restore back to Active 72h Queue">
                <i data-lucide="rotate-ccw"></i>
                <span>Restore</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    return;
  }
}

// --------------------------------------------------------------------------
// Queue Action Operations (Mark Applied, Dismiss, Restore)
// --------------------------------------------------------------------------

function markJobAsApplied(key) {
  const job = allCuratedJobs.find(j => (j.id || j.url) === key) || (dismissedJobsMap[key] && dismissedJobsMap[key].job);
  if (!job) return;

  const resumeSelect = document.getElementById(`resume_sel_${key}`);
  const resumeId = resumeSelect ? resumeSelect.value : (savedResumes[0] ? savedResumes[0].id : null);
  const resumeLabel = getResumeLabel(resumeId);
  const now = new Date().toISOString();

  appliedJobsMap[key] = {
    jobId: key,
    job: { ...job },
    status: 'Applied',
    resumeId,
    resumeLabel,
    appliedAt: now,
    notes: 'Marked via PM Operations Dashboard'
  };

  delete dismissedJobsMap[key];
  selectedJobs.delete(key);
  saveApplicationsState();

  // Async server persistence across all devices
  persistApplicationStatus(key, 'applied', {
    job: { ...job },
    status: 'Applied',
    resumeId,
    resumeLabel,
    appliedAt: now,
    notes: 'Marked via PM Operations Dashboard'
  });

  showToast(`✅ Marked "${job.title}" as Applied & moved to Tracking Queue!`);
  renderTriageTable();
  updateStickyDispatchBar();
}

function dismissJob(key, reason = 'Irrelevant') {
  const job = allCuratedJobs.find(j => (j.id || j.url) === key) || (appliedJobsMap[key] && appliedJobsMap[key].job);
  if (!job) return;

  const now = new Date().toISOString();
  const cleanReason = (reason === 'Uninterested') ? 'Uninterested' : 'Irrelevant';

  dismissedJobsMap[key] = {
    jobId: key,
    job: { ...job },
    dismissedAt: now,
    reason: cleanReason
  };

  delete appliedJobsMap[key];
  selectedJobs.delete(key);
  saveApplicationsState();

  // Async server persistence across all devices
  persistApplicationStatus(key, 'dismiss', {
    job: { ...job },
    reason: cleanReason,
    dismissedAt: now
  });

  const toastIcon = cleanReason === 'Uninterested' ? '👎' : '🚫';
  showToast(`${toastIcon} Dropped "${job.title}" (${cleanReason}).`);
  renderTriageTable();
  updateStickyDispatchBar();
}

function restoreJob(key) {
  const item = appliedJobsMap[key] || dismissedJobsMap[key];
  const title = item?.job?.title || 'Position';

  delete dismissedJobsMap[key];
  delete appliedJobsMap[key];
  saveApplicationsState();

  // Async server persistence across all devices
  persistApplicationStatus(key, 'restore');

  showToast(`✨ Restored "${title}" to Active Queue.`);
  renderTriageTable();
  updateStickyDispatchBar();
}

function removeTrackingRecord(key) {
  delete appliedJobsMap[key];
  delete dismissedJobsMap[key];
  saveApplicationsState();

  // Async server persistence across all devices
  persistApplicationStatus(key, 'remove_tracking');

  showToast('Removed tracking record.');
  renderTriageTable();
}

function updateAppliedStatus(key, newStatus) {
  if (appliedJobsMap[key]) {
    appliedJobsMap[key].status = newStatus;
    saveApplicationsState();

    // Async server persistence across all devices
    persistApplicationStatus(key, 'update_status', { status: newStatus });

    showToast(`Updated status to: ${newStatus}`);
  }
}

function executeBatchMarkApplied() {
  if (selectedJobs.size === 0) return;
  const count = selectedJobs.size;
  const now = new Date().toISOString();
  const batchList = [];

  selectedJobs.forEach((val, key) => {
    const rec = {
      jobId: key,
      job: { ...val.job },
      status: 'Applied',
      resumeId: val.resumeId,
      resumeLabel: getResumeLabel(val.resumeId),
      appliedAt: now,
      notes: 'Batch marked via PM Operations Dashboard'
    };
    appliedJobsMap[key] = rec;
    delete dismissedJobsMap[key];
    batchList.push(rec);
  });

  selectedJobs.clear();
  saveApplicationsState();

  // Async batch server persistence
  persistBatchApplicationStatus('mark_applied', batchList);

  showToast(`✅ Moved ${count} position(s) to Applied Tracking Queue!`);
  renderTriageTable();
  updateStickyDispatchBar();
}

function executeBatchDismiss() {
  if (selectedJobs.size === 0) return;
  const count = selectedJobs.size;
  const now = new Date().toISOString();
  const batchList = [];

  selectedJobs.forEach((val, key) => {
    const rec = {
      jobId: key,
      job: { ...val.job },
      dismissedAt: now,
      reason: 'Irrelevant'
    };
    dismissedJobsMap[key] = rec;
    delete appliedJobsMap[key];
    batchList.push(rec);
  });

  selectedJobs.clear();
  saveApplicationsState();

  // Async batch server persistence
  persistBatchApplicationStatus('dismiss', batchList);

  showToast(`🚫 Dropped ${count} position(s) as irrelevant.`);
  renderTriageTable();
  updateStickyDispatchBar();
}

// --------------------------------------------------------------------------
// Job Selection & Batch Actions
// --------------------------------------------------------------------------

function toggleJobSelection(key, isChecked) {
  const job = allCuratedJobs.find(j => (j.id || j.url) === key);
  if (!job) return;

  if (isChecked) {
    const resumeSelect = document.getElementById(`resume_sel_${key}`);
    const resumeId = resumeSelect ? resumeSelect.value : (savedResumes[0] ? savedResumes[0].id : null);
    selectedJobs.set(key, { job, resumeId });
  } else {
    selectedJobs.delete(key);
  }

  const row = document.getElementById(`row_${key}`);
  if (row) row.classList.toggle('selected', isChecked);

  updateStickyDispatchBar();
}

function toggleSelectAll(isChecked) {
  if (currentQueueTab !== 'active') return;
  const list = getActiveFilteredJobs(true);
  list.forEach(job => {
    const key = job.id || job.url;
    if (isChecked) {
      const resumeSelect = document.getElementById(`resume_sel_${key}`);
      const resumeId = resumeSelect ? resumeSelect.value : (savedResumes[0] ? savedResumes[0].id : null);
      selectedJobs.set(key, { job, resumeId });
    } else {
      selectedJobs.delete(key);
    }
  });

  renderTriageTable();
  updateStickyDispatchBar();
}

function updateJobResume(key, resumeId) {
  if (selectedJobs.has(key)) {
    const existing = selectedJobs.get(key);
    selectedJobs.set(key, { ...existing, resumeId });
  }
}

function applyBulkResumeSelection(resumeId) {
  if (!resumeId) return;
  for (const [key, item] of selectedJobs.entries()) {
    selectedJobs.set(key, { ...item, resumeId });
    const sel = document.getElementById(`resume_sel_${key}`);
    if (sel) sel.value = resumeId;
  }
}

function clearSelectedJobs() {
  selectedJobs.clear();
  const selectAll = document.getElementById('chkSelectAll');
  if (selectAll) selectAll.checked = false;
  renderTriageTable();
  updateStickyDispatchBar();
}

function updateStickyDispatchBar() {
  const bar = document.getElementById('stickyDispatchBar');
  const countBadge = document.getElementById('selectedJobsCountBadge');
  const count = selectedJobs.size;

  if (!bar) return;

  if (count > 0 && currentQueueTab === 'active') {
    bar.style.display = 'flex';
    if (countBadge) countBadge.textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

// --------------------------------------------------------------------------
// Automated Submission Pipeline Execution
// --------------------------------------------------------------------------

async function quickSingleSubmit(key) {
  const job = allCuratedJobs.find(j => (j.id || j.url) === key);
  if (!job) return;

  const resumeSelect = document.getElementById(`resume_sel_${key}`);
  const resumeId = resumeSelect ? resumeSelect.value : (savedResumes[0] ? savedResumes[0].id : null);

  await submitBatchPayload([{ job, resumeId }]);
}

async function executeBatchSubmission() {
  if (selectedJobs.size === 0) {
    showToast('Please select at least one position to submit.', 'warning');
    return;
  }

  const items = Array.from(selectedJobs.values());
  const btn = document.getElementById('btnExecuteBatch');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Dispatching ${items.length} applications...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    await submitBatchPayload(items);
    clearSelectedJobs();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="rocket"></i> <span>🚀 Submit Selected Applications</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function submitBatchPayload(itemsList) {
  const profile = getProfileFormData();

  if (isLocalBackend()) {
    try {
      const res = await fetch(`./api/submissions/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: itemsList,
          profile
        })
      });

      let result = null;
      try {
        if (res.ok) {
          const text = await res.text();
          result = JSON.parse(text);
        }
      } catch (e) {}

      if (result && result.receipts) {
        submissionLogs = [...result.receipts, ...submissionLogs];
        renderReceiptsLog();

        // Move submitted items to Applied Tracking Queue
        itemsList.forEach(item => {
          const key = item.job.id || item.job.url;
          appliedJobsMap[key] = {
            jobId: key,
            job: { ...item.job },
            status: 'Applied',
            resumeId: item.resumeId,
            resumeLabel: getResumeLabel(item.resumeId),
            appliedAt: new Date().toISOString(),
            notes: 'Submitted via API'
          };
          delete dismissedJobsMap[key];
          selectedJobs.delete(key);
        });
        saveApplicationsState();
        renderTriageTable();
        updateStickyDispatchBar();

        showToast(`✅ Dispatched ${result.processedCount} application(s) via API and moved to Tracking!`);
        return;
      }
    } catch (err) {
      console.warn('API batch submission notice:', err.message);
    }
  }

  // Client-Side Assisted Submissions Package
  const receipts = itemsList.map(item => ({
    receiptId: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    title: item.job.title,
    company: item.job.company,
    url: item.job.url,
    resumeLabel: getResumeLabel(item.resumeId),
    status: 'assisted_ready',
    message: 'Pre-packaged application with auto-resolved fields and resume ready for dispatch.',
    submittedAt: new Date().toISOString()
  }));

  submissionLogs = [...receipts, ...submissionLogs];
  try {
    localStorage.setItem('scrapedeez_submission_logs', JSON.stringify(submissionLogs));
  } catch (e) {}

  // Move submitted items to Applied Tracking Queue
  const now = new Date().toISOString();
  const appliedBatch = [];
  itemsList.forEach(item => {
    const key = item.job.id || item.job.url;
    const rec = {
      jobId: key,
      job: { ...item.job },
      status: 'Applied',
      resumeId: item.resumeId,
      resumeLabel: getResumeLabel(item.resumeId),
      appliedAt: now,
      notes: 'Submitted via Operations Dashboard'
    };
    appliedJobsMap[key] = rec;
    delete dismissedJobsMap[key];
    selectedJobs.delete(key);
    appliedBatch.push(rec);
  });
  saveApplicationsState();
  persistBatchApplicationStatus('mark_applied', appliedBatch);

  renderReceiptsLog();
  renderTriageTable();
  updateStickyDispatchBar();

  showToast(`✅ Generated packages for ${receipts.length} position(s) and moved to Tracking!`);
}

function getResumeLabel(id) {
  const r = savedResumes.find(x => x.id === id);
  return r ? r.label : 'Default Resume';
}

function renderReceiptsLog() {
  const container = document.getElementById('receiptsLogList');
  const badge = document.getElementById('receiptsCountBadge');
  if (!container) return;

  if (badge) badge.textContent = `${submissionLogs.length} Receipts`;

  if (submissionLogs.length === 0) {
    container.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        No submissions dispatched yet in this session. Select positions above and click Submit.
      </div>
    `;
    return;
  }

  container.innerHTML = submissionLogs.slice(0, 50).map(rec => {
    const isDirectApi = rec.status === 'submitted_api';
    const statusColor = isDirectApi ? 'var(--accent-emerald)' : 'var(--accent-amber)';
    const statusBg = isDirectApi ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
    const statusText = isDirectApi ? 'Submitted via API' : 'Assisted Ready';

    return `
      <div class="receipt-item-row">
        <div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
            ${escapeHtml(rec.company)} &bull; <span style="font-weight: 500;">${escapeHtml(rec.title)}</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">
            📄 <strong>${escapeHtml(rec.resumeLabel || 'Resume')}</strong> &bull; ${formatTimeAgo(rec.submittedAt)} &bull; ${escapeHtml(rec.message || '')}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 999px; background: ${statusBg}; color: ${statusColor};">
            ${statusText}
          </span>
          ${rec.url ? `
            <a href="${escapeHtml(rec.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs" title="Open Job Application">
              <i data-lucide="external-link"></i>
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// --------------------------------------------------------------------------
// Profile & Resume Variations Management
// --------------------------------------------------------------------------

function populateProfileForm() {
  document.getElementById('profFullName').value = applicantProfile.fullName || '';
  document.getElementById('profEmail').value = applicantProfile.email || '';
  document.getElementById('profPhone').value = applicantProfile.phone || '';
  document.getElementById('profLocation').value = applicantProfile.location || '';
  document.getElementById('profLinkedIn').value = applicantProfile.linkedInUrl || '';
  document.getElementById('profGitHub').value = applicantProfile.githubUrl || '';
  document.getElementById('profPortfolio').value = applicantProfile.portfolioUrl || '';
  document.getElementById('profCoverNote').value = applicantProfile.coverNote || '';

  // Extended Field Resolution Knowledge Base
  if (document.getElementById('profWorkAuth')) {
    document.getElementById('profWorkAuth').value = applicantProfile.legallyAuthorized || 'Yes';
  }
  if (document.getElementById('profSponsorship')) {
    document.getElementById('profSponsorship').value = applicantProfile.requiresSponsorship || 'No';
  }
  if (document.getElementById('profDesiredSalary')) {
    document.getElementById('profDesiredSalary').value = applicantProfile.desiredSalary || 160000;
  }
  if (document.getElementById('profNoticePeriod')) {
    document.getElementById('profNoticePeriod').value = applicantProfile.noticePeriod || '2 Weeks';
  }
  if (document.getElementById('profReferralSource')) {
    document.getElementById('profReferralSource').value = applicantProfile.referralSource || 'Company Career Page';
  }
  if (document.getElementById('profEEOC')) {
    document.getElementById('profEEOC').value = applicantProfile.eeocGender ? 'Standard' : 'Decline';
  }
}

function getProfileFormData() {
  return {
    fullName: document.getElementById('profFullName')?.value.trim() || '',
    email: document.getElementById('profEmail')?.value.trim() || '',
    phone: document.getElementById('profPhone')?.value.trim() || '',
    location: document.getElementById('profLocation')?.value.trim() || '',
    linkedInUrl: document.getElementById('profLinkedIn')?.value.trim() || '',
    githubUrl: document.getElementById('profGitHub')?.value.trim() || '',
    portfolioUrl: document.getElementById('profPortfolio')?.value.trim() || '',
    coverNote: document.getElementById('profCoverNote')?.value.trim() || '',

    // Extended Resolution Fields
    legallyAuthorized: document.getElementById('profWorkAuth')?.value || 'Yes',
    requiresSponsorship: document.getElementById('profSponsorship')?.value || 'No',
    desiredSalary: parseInt(document.getElementById('profDesiredSalary')?.value, 10) || 160000,
    noticePeriod: document.getElementById('profNoticePeriod')?.value || '2 Weeks',
    referralSource: document.getElementById('profReferralSource')?.value || 'Company Career Page',
    eeocGender: document.getElementById('profEEOC')?.value === 'Decline' ? 'Decline to Self-Identify' : 'Male',
    eeocRace: 'Decline to Self-Identify',
    eeocVeteran: 'I am not a protected veteran',
    eeocDisability: 'No, I do not have a disability'
  };
}

async function saveProfileData() {
  const profile = getProfileFormData();
  const btn = document.getElementById('btnSaveProfile');
  if (btn) btn.textContent = 'Saving...';

  // Cloud server persistence
  await persistProfile(profile);

  applicantProfile = profile;
  try {
    localStorage.setItem('scrapedeez_profile', JSON.stringify(profile));
  } catch (e) {}

  if (btn) btn.textContent = 'Saved!';
  showToast('✅ Profile saved successfully');
  setTimeout(() => { if (btn) btn.textContent = 'Save'; }, 2000);
}

function handleResumeFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  const fb = document.getElementById('fileUploadFeedback');
  const labelInput = document.getElementById('resumeLabelInput');

  if (!file) {
    selectedResumeUploadBase64 = null;
    selectedResumeUploadFileName = null;
    if (fb) fb.textContent = '';
    return;
  }

  selectedResumeUploadFileName = file.name;
  if (fb) fb.innerHTML = `📄 <strong>${escapeHtml(file.name)}</strong> <span style="color:var(--text-dim);">(${(file.size / 1024).toFixed(0)} KB)</span>`;

  // Auto-populate variation label from filename if empty
  if (labelInput && !labelInput.value.trim()) {
    const derivedLabel = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    labelInput.value = derivedLabel;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    selectedResumeUploadBase64 = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleResumeUpload(e) {
  if (e) e.preventDefault();
  const labelInput = document.getElementById('resumeLabelInput');
  const specInput = document.getElementById('resumeSpecInput');
  const fileInput = document.getElementById('resumeFileInput');
  const btn = document.getElementById('btnUploadResume');

  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file && !selectedResumeUploadBase64) {
    showToast('Please select a resume file (.pdf, .doc, .docx)', 'warning');
    return;
  }

  const fileName = file ? file.name : (selectedResumeUploadFileName || 'resume.pdf');
  const derivedLabel = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  const label = (labelInput && labelInput.value.trim()) ? labelInput.value.trim() : derivedLabel;
  const spec = (specInput && specInput.value.trim()) ? specInput.value.trim() : 'General Tech';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Uploading...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    let fileBase64 = selectedResumeUploadBase64;
    if (!fileBase64 && file) {
      fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file document'));
        reader.readAsDataURL(file);
      });
    }

    let savedResumeItem = null;

    // 1. Try server API only if running local Express server
    if (isLocalBackend()) {
      try {
        const res = await fetch(`./api/resumes/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label,
            specialization: spec,
            fileName,
            fileBase64
          })
        });

        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data && data.resume) {
              savedResumeItem = data.resume;
            }
          } catch (jsonErr) {}
        }
      } catch (apiErr) {
        console.warn('API upload fallback to local storage:', apiErr.message);
      }
    }

    // 2. Client-first storage for static hosting / fallback
    if (!savedResumeItem) {
      savedResumeItem = {
        id: 'res_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        label,
        specialization: spec,
        fileName,
        fileBase64,
        uploadDate: new Date().toISOString(),
        sizeBytes: file ? file.size : (fileBase64 ? Math.round(fileBase64.length * 0.75) : 120000)
      };
    }

    // Add to saved resumes at the top
    savedResumes.unshift(savedResumeItem);
    try {
      localStorage.setItem('scrapedeez_resumes', JSON.stringify(savedResumes));
    } catch (storageErr) {
      console.warn('localStorage quota note:', storageErr.message);
    }

    // Reset upload inputs
    if (labelInput) labelInput.value = '';
    if (specInput) specInput.value = '';
    if (fileInput) fileInput.value = '';
    const fb = document.getElementById('fileUploadFeedback');
    if (fb) fb.textContent = '';
    selectedResumeUploadBase64 = null;
    selectedResumeUploadFileName = null;

    renderResumesList();
    renderTriageTable();
    const countEl = document.getElementById('metricResumesCount');
    if (countEl) countEl.textContent = savedResumes.length;

    showToast(`✅ Resume "${label}" added to vault!`);
  } catch (err) {
    console.error('Resume upload error:', err);
    showToast('Notice: Could not process file (' + (err.message || 'Unknown issue') + ')', 'warning');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="upload"></i> <span>Upload Variation</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function renderResumesList() {
  const container = document.getElementById('savedResumesList');
  const bulkSelect = document.getElementById('bulkResumeSelect');
  if (!container) return;

  if (bulkSelect) {
    bulkSelect.innerHTML = `
      <option value="">Apply Default Resume to All Selected</option>
      ${savedResumes.map(r => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
    `;
  }

  if (savedResumes.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.78rem; color: var(--text-dim); text-align: center; padding: 1rem 0;">
        No resume variations stored. Upload one above.
      </div>
    `;
    return;
  }

  container.innerHTML = savedResumes.map(r => `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.65rem 0.8rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
      <div>
        <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-main);">${escapeHtml(r.label)}</div>
        <div style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">
          📄 ${escapeHtml(r.fileName)} ${r.sizeBytes ? `&bull; ${(r.sizeBytes/1024).toFixed(0)} KB` : ''}
        </div>
      </div>
      <div style="display: flex; gap: 0.3rem;">
        <button type="button" class="btn btn-secondary btn-xs" onclick="downloadResume('${r.id}')" title="Download">
          <i data-lucide="download"></i>
        </button>
        <button type="button" class="btn btn-secondary btn-xs text-danger" onclick="deleteResume('${r.id}')" title="Delete">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function downloadResume(id) {
  const item = savedResumes.find(r => r.id === id);
  if (!item) return;

  if (item.fileBase64) {
    let dataUri = item.fileBase64;
    if (!dataUri.startsWith('data:')) {
      const isDocx = (item.fileName && item.fileName.toLowerCase().endsWith('.docx'));
      const isPdf = (item.fileName && item.fileName.toLowerCase().endsWith('.pdf'));
      const mime = isDocx
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : (isPdf ? 'application/pdf' : 'application/octet-stream');
      dataUri = `data:${mime};base64,` + item.fileBase64;
    }
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = item.fileName || 'resume.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // Attempt download via backend endpoint or fallback to candidate summary
    const a = document.createElement('a');
    a.href = `./api/resumes/${encodeURIComponent(item.id)}/download`;
    a.download = item.fileName || 'resume.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

async function deleteResume(id) {
  if (!confirm('Delete this resume variation?')) return;
  if (isLocalBackend()) {
    try {
      await fetch(`./api/resumes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {}
  }

  savedResumes = savedResumes.filter(r => r.id !== id);
  try {
    localStorage.setItem('scrapedeez_resumes', JSON.stringify(savedResumes));
  } catch (e) {}
  renderResumesList();
  renderTriageTable();
  const countEl = document.getElementById('metricResumesCount');
  if (countEl) countEl.textContent = savedResumes.length;
  showToast('Resume variation deleted');
}

// --------------------------------------------------------------------------
// Fallbacks for Static Hosting & Instant Auto-Population
// --------------------------------------------------------------------------

async function loadProfileFallback() {
  let loaded = null;
  // Tier 1: Direct server profile fetch
  try {
    const res = await fetch(`./api.php?action=profile&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.fullName) loaded = data;
    }
  } catch (e) {}

  if (!loaded) {
    try {
      const res = await fetch(`../profile.json?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.fullName) loaded = data;
      }
    } catch (e) {}
  }

  // Tier 2: Local Storage user overrides
  if (!loaded) {
    try {
      const saved = localStorage.getItem('scrapedeez_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.fullName) {
          loaded = parsed;
        }
      }
    } catch (e) {}
  }

  // Tier 3: Direct static fetch of applicant_profile.json
  if (!loaded) {
    try {
      const res = await fetch(`../applicant_profile.json?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.fullName) {
          loaded = data;
        }
      }
    } catch (e) {}
  }

  // Tier 4: Merge with canonical default profile
  applicantProfile = {
    ...CANONICAL_DEFAULT_PROFILE,
    ...(loaded || {})
  };
}

async function getFallbackResumes() {
  try {
    const saved = localStorage.getItem('scrapedeez_resumes');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_SEED_RESUMES];
}

async function loadResumesFallback() {
  savedResumes = await getFallbackResumes();
  const elResumes = document.getElementById('metricResumesCount');
  if (elResumes) elResumes.textContent = savedResumes.length;
}

async function loadLogsFallback() {
  try {
    const saved = localStorage.getItem('scrapedeez_submission_logs');
    if (saved) submissionLogs = JSON.parse(saved);
  } catch (e) {}
}

function showToast(message, type = 'success') {
  let toastContainer = document.getElementById('dashToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'dashToastContainer';
    toastContainer.style.cssText = 'position:fixed; top:1.5rem; right:1.5rem; z-index:9999; display:flex; flex-direction:column; gap:0.5rem; pointer-events:none;';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto;
    background: ${type === 'success' ? 'var(--bg-surface)' : 'var(--bg-card)'};
    color: var(--text-main);
    border: 1px solid ${type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-amber)'};
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    border-radius: var(--radius-sm);
    padding: 0.75rem 1.1rem;
    font-size: 0.84rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    animation: fadeInToast 0.25s ease-out;
  `;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function triggerHourlyRescan() {
  const btn = document.getElementById('btnRescan');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Scanning...`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    if (isLocalBackend()) {
      await fetch(`./api/scrape-now`, { method: 'POST' });
    }
    await fetch24hQueue();
    renderTriageTable();
    showToast('✅ Rescan complete! Fresh postings refreshed.');
  } catch (e) {
    showToast('Notice: Queue refreshed.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i> <span>Re-Scan</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// --------------------------------------------------------------------------
// Helpers & Theme
// --------------------------------------------------------------------------

function formatTimeAgo(isoStr) {
  if (!isoStr) return 'Recently';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  if (isNaN(diffMs) || diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(text) {
  return text ? String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
}

function initTheme() {
  const saved = localStorage.getItem('scrapedeez_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const sunIcon = document.getElementById('themeIconSun');
  const moonIcon = document.getElementById('themeIconMoon');
  if (sunIcon && moonIcon) {
    sunIcon.style.display = theme === 'dark' ? 'inline-block' : 'none';
    moonIcon.style.display = theme === 'dark' ? 'none' : 'inline-block';
  }
}

function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  localStorage.setItem('scrapedeez_theme', next);
  applyTheme(next);
}
