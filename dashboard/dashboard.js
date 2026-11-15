/* ==========================================================================
   Scrapedeez — PM Operations Command Center & Automated Submitter
   ========================================================================== */

const CANONICAL_DEFAULT_PROFILE = {
  fullName: 'Will Tan',
  email: 'will@synopsdigital.com',
  phone: '415-555-0199',
  location: 'San Francisco, CA',
  linkedInUrl: 'https://linkedin.com/in/willtan',
  githubUrl: 'https://github.com/wtan404',
  portfolioUrl: 'https://synopsdigital.com',
  coverNote: 'Experienced WebOps, DevOps & IT Engineering Manager with a proven track record leading high-availability cloud infrastructure, continuous delivery pipelines, and cross-functional engineering teams.',
  legallyAuthorized: 'Yes',
  requiresSponsorship: 'No',
  desiredSalary: 160000,
  noticePeriod: '2 Weeks',
  referralSource: 'Company Career Page',
  eeocGender: 'Decline to Self-Identify'
};

const DEFAULT_SEED_RESUMES = [
  {
    id: 'res_seed_devops',
    label: 'DevOps & Cloud Infrastructure Lead',
    specialization: 'AWS, Kubernetes, Terraform, CI/CD',
    fileName: 'Will_Tan_DevOps_Cloud_Lead.pdf',
    uploadDate: new Date().toISOString(),
    sizeBytes: 148200,
    isDefault: true
  },
  {
    id: 'res_seed_webops',
    label: 'WebOps & Engineering Manager',
    specialization: 'Web Operations, Platform Infrastructure, Team Leadership',
    fileName: 'Will_Tan_WebOps_Engineering_Manager.pdf',
    uploadDate: new Date().toISOString(),
    sizeBytes: 154300,
    isDefault: false
  }
];

let allCuratedJobs = [];
let savedResumes = [];
let applicantProfile = { ...CANONICAL_DEFAULT_PROFILE };
let submissionLogs = [];
let selectedJobs = new Map(); // jobId -> { job, resumeId }

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
    let summary = null;
    if (isLocalBackend()) {
      try {
        const res = await fetch(`./api/dashboard/summary?t=${Date.now()}`);
        if (res.ok) {
          const text = await res.text();
          try {
            summary = JSON.parse(text);
          } catch (e) {
            summary = null;
          }
        }
      } catch (e) {
        summary = null;
      }
    }

    if (summary && summary.profile && summary.profile.fullName) {
      applicantProfile = { ...CANONICAL_DEFAULT_PROFILE, ...summary.profile };
      savedResumes = (summary.resumes && summary.resumes.length > 0) ? summary.resumes : await getFallbackResumes();
      submissionLogs = summary.recentLogs || [];
      updateKPIs(summary.jobsCount24h, savedResumes.length, submissionLogs.length, summary.totalVerified);
    } else {
      await loadProfileFallback();
      await loadResumesFallback();
      await loadLogsFallback();
    }

    // 2. Fetch 24-hour job queue
    await fetch24hQueue();

  } catch (err) {
    console.warn('Dashboard initialization warning:', err);
    await loadProfileFallback();
    await loadResumesFallback();
    await fetch24hQueue();
  } finally {
    populateProfileForm();
    renderResumesList();
    renderTriageTable();
    renderReceiptsLog();
    if (window.lucide) lucide.createIcons();
  }
}

function updateKPIs(count24h, resumesCount, subsCount, totalVerified) {
  const el24h = document.getElementById('metric24hCount');
  const elResumes = document.getElementById('metricResumesCount');
  const elSubs = document.getElementById('metricSubmissionsCount');
  const elTotal = document.getElementById('metricTotalVerified');

  if (el24h) el24h.textContent = count24h ?? 0;
  if (elResumes) elResumes.textContent = resumesCount ?? 0;
  if (elSubs) elSubs.textContent = subsCount ?? 0;
  if (elTotal) elTotal.textContent = totalVerified ? totalVerified.toLocaleString() : '0';
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
// 24-Hour Hotlist Triage Queue
// --------------------------------------------------------------------------

async function fetch24hQueue() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const res = await fetch(`./api/jobs/curated-24h?t=${Date.now()}`);
    let data = null;
    try {
      if (res.ok) data = await res.json();
    } catch (e) {}

    if (data && Array.isArray(data.jobs)) {
      allCuratedJobs = data.jobs;
    } else {
      const statRes = await fetch(`../jobs_data.json?t=${Date.now()}`);
      if (statRes.ok) {
        const fullData = await statRes.json();
        const rawJobs = fullData.jobs || [];
        allCuratedJobs = rawJobs.filter(j => {
          if (!j || !j.date) return false;
          const t = new Date(j.date).getTime();
          return !isNaN(t) && (now - t) <= TWENTY_FOUR_HOURS_MS;
        });

        const totalVerifiedEl = document.getElementById('metricTotalVerified');
        if (totalVerifiedEl) totalVerifiedEl.textContent = rawJobs.length.toLocaleString();
      }
    }
  } catch (e) {
    console.warn('24h queue fetch notice:', e);
  }

  const countEl = document.getElementById('metric24hCount');
  if (countEl) countEl.textContent = allCuratedJobs.length;
}

function renderTriageTable() {
  const tbody = document.getElementById('triageTableBody');
  if (!tbody) return;

  const searchVal = document.getElementById('triageSearchInput')?.value.toLowerCase().trim() || '';
  const wtFilter = document.getElementById('triageWorkTypeFilter')?.value || 'all';
  const srcFilter = document.getElementById('triageSourceFilter')?.value || 'all';

  const filtered = allCuratedJobs.filter(job => {
    // 1. Text Search
    if (searchVal) {
      const text = (job.title + ' ' + job.company + ' ' + (job.matchedKeyword || '') + ' ' + (job.location || '')).toLowerCase();
      if (!text.includes(searchVal)) return false;
    }

    // 2. Work Setup
    if (wtFilter !== 'all') {
      const wt = (job.workType || '').toLowerCase();
      if (!wt.includes(wtFilter)) return false;
    }

    // 3. Source Filter
    if (srcFilter === 'ats') {
      const s = (job.source || '').toLowerCase();
      if (!s.includes('greenhouse') && !s.includes('lever') && !s.includes('ashby') && !s.includes('smartrecruiters')) return false;
    } else if (srcFilter === 'feeds') {
      const s = (job.source || '').toLowerCase();
      if (!s.includes('remotive') && !s.includes('jobicy') && !s.includes('remoteok') && !s.includes('weworkremotely')) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <i data-lucide="check-circle" style="width: 32px; height: 32px; margin: 0 auto 0.6rem; color: var(--accent-emerald);"></i>
          <p>No 24-hour positions matching your active filters. All caught up!</p>
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

    return `
      <tr class="${isChecked ? 'selected' : ''}" id="row_${escapeHtml(key)}">
        <td style="text-align: center;">
          <input type="checkbox" class="chk-select-job" 
            ${isChecked ? 'checked' : ''} 
            onchange="toggleJobSelection('${escapeHtml(key)}', this.checked)">
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(job.company)}</div>
          <span class="triage-company-badge">${escapeHtml(job.source || 'ATS')}</span>
        </td>
        <td>
          <div class="triage-role-title">
            <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-main); text-decoration:none;" title="Open posting in new tab">
              ${escapeHtml(job.title)}
            </a>
          </div>
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
            ${job.matchedKeyword ? `<span class="hotlist-tag match-tag"><i data-lucide="sparkles"></i> ${escapeHtml(job.matchedKeyword)}</span>` : ''}
            ${job.salary ? `<span class="hotlist-tag salary-tag"><i data-lucide="dollar-sign"></i> ${escapeHtml(job.salary)}</span>` : ''}
          </div>
        </td>
        <td>
          <div>${escapeHtml(job.location || 'Remote')}</div>
          <div style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(job.workType || 'Remote')}</div>
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
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-xs" onclick="quickSingleSubmit('${escapeHtml(key)}')" title="Submit this position via API">
            <i data-lucide="send"></i>
            <span>Submit</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
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
  allCuratedJobs.forEach(job => {
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

  if (count > 0) {
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
        const subsCountEl = document.getElementById('metricSubmissionsCount');
        if (subsCountEl) subsCountEl.textContent = submissionLogs.length;

        showToast(`✅ Dispatched ${result.processedCount} application(s) via API`);
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

  renderReceiptsLog();
  const subsCountEl = document.getElementById('metricSubmissionsCount');
  if (subsCountEl) subsCountEl.textContent = submissionLogs.length;
  showToast(`✅ Generated packages for ${receipts.length} position(s)`);
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

  if (isLocalBackend()) {
    try {
      await fetch(`./api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    } catch (e) {}
  }

  applicantProfile = profile;
  try {
    localStorage.setItem('scrapedeez_profile', JSON.stringify(profile));
  } catch (e) {}

  if (btn) btn.textContent = 'Saved!';
  showToast('✅ Candidate Profile saved successfully');
  setTimeout(() => { if (btn) btn.textContent = 'Save Profile'; }, 2000);
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
    const a = document.createElement('a');
    a.href = item.fileBase64;
    a.download = item.fileName || 'resume.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // Generate text export for seed or text files
    const content = `Resume Variation: ${item.label}\nSpecialization: ${item.specialization || 'Tech Lead'}\nCandidate: ${applicantProfile.fullName || 'Will Tan'}\nEmail: ${applicantProfile.email || 'will@synopsdigital.com'}\nLocation: ${applicantProfile.location || 'San Francisco, CA'}\nLinkedIn: ${applicantProfile.linkedInUrl || ''}\nGitHub: ${applicantProfile.githubUrl || ''}\nPortfolio: ${applicantProfile.portfolioUrl || ''}\n\nSummary:\n${applicantProfile.coverNote || ''}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (item.fileName ? item.fileName.replace(/\.pdf$/, '.txt') : 'resume.txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
  // Tier 1: Local Storage user overrides
  try {
    const saved = localStorage.getItem('scrapedeez_profile');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.fullName) {
        loaded = parsed;
      }
    }
  } catch (e) {}

  // Tier 2: Direct static fetch of applicant_profile.json
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

  // Tier 3: Merge with canonical default profile
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
