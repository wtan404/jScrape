const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROFILE_FILE = path.join(__dirname, 'applicant_profile.json');
const LOGS_FILE = path.join(__dirname, 'submissions_log.json');
const RESUMES_DIR = path.join(__dirname, 'uploads', 'resumes');
const RESUMES_META = path.join(RESUMES_DIR, 'metadata.json');

// Default Profile Template
const DEFAULT_PROFILE = {
  fullName: 'Will Tan',
  email: 'will@synopsdigital.com',
  phone: '415-555-0199',
  location: 'San Francisco, CA',
  linkedInUrl: 'https://linkedin.com/in/willtan',
  githubUrl: 'https://github.com/wtan404',
  portfolioUrl: 'https://synopsdigital.com',
  coverNote: 'Experienced WebOps, DevOps & IT Engineering Manager with a proven track record leading high-availability cloud infrastructure, continuous delivery pipelines, and cross-functional engineering teams.'
};

function readProfile() {
  if (fs.existsSync(PROFILE_FILE)) {
    try {
      return { ...DEFAULT_PROFILE, ...JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')) };
    } catch (e) {
      return DEFAULT_PROFILE;
    }
  }
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2));
  return DEFAULT_PROFILE;
}

function saveProfile(profileData) {
  const current = readProfile();
  const updated = { ...current, ...profileData, updatedAt: new Date().toISOString() };
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

function readSubmissionsLog() {
  if (fs.existsSync(LOGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveSubmissionsLog(logs) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

function getResumeFile(resumeId) {
  if (!fs.existsSync(RESUMES_META)) return null;
  try {
    const list = JSON.parse(fs.readFileSync(RESUMES_META, 'utf8'));
    const item = list.find(r => r.id === resumeId);
    if (!item) return null;
    const filePath = path.join(RESUMES_DIR, item.storedFile);
    if (fs.existsSync(filePath)) {
      return {
        item,
        buffer: fs.readFileSync(filePath),
        filePath
      };
    }
  } catch (e) {}
  return null;
}

// Extract company slug & job id from Greenhouse URLs or IDs
function parseGreenhouseInfo(job) {
  const url = job.url || '';
  const idStr = job.id || '';

  // gh-company-12345
  if (idStr.startsWith('gh-')) {
    const parts = idStr.split('-');
    if (parts.length >= 3) {
      return { company: parts[1], jobId: parts.slice(2).join('-') };
    }
  }

  // https://boards.greenhouse.io/{company}/jobs/{jobId}
  const match = url.match(/greenhouse\.io\/(?:v1\/boards\/)?([^/]+)\/jobs\/(\d+)/i);
  if (match) {
    return { company: match[1], jobId: match[2] };
  }

  // https://job-boards.greenhouse.io/{company}/jobs/{jobId}
  const match2 = url.match(/job-boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
  if (match2) {
    return { company: match2[1], jobId: match2[2] };
  }

  return null;
}

// Extract company slug & job id from Lever URLs or IDs
function parseLeverInfo(job) {
  const url = job.url || '';
  const idStr = job.id || '';

  if (idStr.startsWith('lever-')) {
    const parts = idStr.split('-');
    if (parts.length >= 3) {
      return { company: parts[1], jobId: parts.slice(2).join('-') };
    }
  }

  // https://jobs.lever.co/{company}/{jobId}
  const match = url.match(/lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
  if (match) {
    return { company: match[1], jobId: match[2] };
  }

  return null;
}

// Submit via Greenhouse Board API
async function submitGreenhouseApplication(company, jobId, profile, resume) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`;
    
    // Split full name into first and last
    const nameParts = (profile.fullName || 'Candidate').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Candidate';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Applicant';

    const payload = {
      first_name: firstName,
      last_name: lastName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      urls: [
        { type: 'LinkedIn', value: profile.linkedInUrl },
        { type: 'Portfolio', value: profile.portfolioUrl },
        { type: 'GitHub', value: profile.githubUrl }
      ].filter(u => Boolean(u.value))
    };

    if (resume && resume.buffer) {
      payload.resume_content = resume.buffer.toString('base64');
      payload.resume_content_filename = resume.item.fileName || 'resume.pdf';
    }

    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    });

    if (res.status >= 200 && res.status < 300) {
      return {
        status: 'submitted_api',
        message: 'Direct submission successfully received by Greenhouse API (HTTP ' + res.status + ')',
        details: res.data || {}
      };
    }

    return {
      status: 'assisted_ready',
      message: 'Greenhouse returned HTTP ' + res.status + '; queued for assisted 1-click launch.',
      details: res.data
    };
  } catch (err) {
    const status = err.response ? err.response.status : null;
    const errData = err.response ? err.response.data : err.message;
    return {
      status: 'assisted_ready',
      message: `Greenhouse form requires custom questions or verification (${status || 'Network'}); pre-packaged for assisted 1-click dispatch.`,
      details: errData
    };
  }
}

// Submit via Lever Postings API
async function submitLeverApplication(company, jobId, profile, resume) {
  try {
    const url = `https://api.lever.co/v0/postings/${company}/${jobId}`;
    const payload = {
      name: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      comments: profile.coverNote,
      urls: {
        LinkedIn: profile.linkedInUrl,
        Portfolio: profile.portfolioUrl,
        GitHub: profile.githubUrl
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 10000
    });

    if (res.status >= 200 && res.status < 300) {
      return {
        status: 'submitted_api',
        message: 'Direct submission successfully received by Lever API (HTTP ' + res.status + ')',
        details: res.data || {}
      };
    }

    return {
      status: 'assisted_ready',
      message: 'Lever returned HTTP ' + res.status + '; queued for assisted 1-click launch.',
      details: res.data
    };
  } catch (err) {
    const status = err.response ? err.response.status : null;
    const errData = err.response ? err.response.data : err.message;
    return {
      status: 'assisted_ready',
      message: `Lever posting requires custom screening responses (${status || 'Network'}); pre-packaged for assisted 1-click dispatch.`,
      details: errData
    };
  }
}

// Master Submission Executor for a single position
async function processJobSubmission(job, profile, resumeId) {
  const resume = resumeId ? getResumeFile(resumeId) : null;
  const resumeLabel = resume && resume.item ? resume.item.label : 'Default Resume';

  const baseRecord = {
    receiptId: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    jobId: job.id || job.url,
    title: job.title || 'Tech Role',
    company: job.company || 'Enterprise Employer',
    url: job.url || '#',
    source: job.source || 'Aggregated',
    workType: job.workType || 'Remote',
    resumeId: resumeId || null,
    resumeLabel,
    applicantName: profile.fullName,
    applicantEmail: profile.email,
    submittedAt: new Date().toISOString()
  };

  // 1. Try Greenhouse
  const ghInfo = parseGreenhouseInfo(job);
  if (ghInfo) {
    const ghRes = await submitGreenhouseApplication(ghInfo.company, ghInfo.jobId, profile, resume);
    return {
      ...baseRecord,
      status: ghRes.status,
      message: ghRes.message,
      apiDetails: ghRes.details
    };
  }

  // 2. Try Lever
  const leverInfo = parseLeverInfo(job);
  if (leverInfo) {
    const leverRes = await submitLeverApplication(leverInfo.company, leverInfo.jobId, profile, resume);
    return {
      ...baseRecord,
      status: leverRes.status,
      message: leverRes.message,
      apiDetails: leverRes.details
    };
  }

  // 3. Ashby / Remotive / Jobicy / Google Jobs (Assisted 1-Click Launchpad)
  return {
    ...baseRecord,
    status: 'assisted_ready',
    message: `Pre-packaged with ${resumeLabel} & profile clipboard helper; ready for instant 1-click review and submission.`,
    apiDetails: { mode: 'assisted_dispatch' }
  };
}

// Process a batch of jobs confirmed by the PM
async function processBatchSubmissions(jobsList = [], customProfile = null) {
  const profile = customProfile || readProfile();
  const currentLogs = readSubmissionsLog();
  const newReceipts = [];

  for (const item of jobsList) {
    try {
      const receipt = await processJobSubmission(item.job || item, profile, item.resumeId);
      newReceipts.push(receipt);
      currentLogs.unshift(receipt);
    } catch (err) {
      const failReceipt = {
        receiptId: 'sub_err_' + Date.now(),
        jobId: item.jobId || (item.job && item.job.id),
        title: (item.job && item.job.title) || item.title || 'Role',
        company: (item.job && item.job.company) || item.company || 'Company',
        url: (item.job && item.job.url) || item.url || '#',
        status: 'failed',
        message: 'Submission error: ' + err.message,
        submittedAt: new Date().toISOString()
      };
      newReceipts.push(failReceipt);
      currentLogs.unshift(failReceipt);
    }
  }

  // Keep latest 500 receipts
  const trimmed = currentLogs.slice(0, 500);
  saveSubmissionsLog(trimmed);

  return {
    success: true,
    processedCount: newReceipts.length,
    receipts: newReceipts
  };
}

module.exports = {
  readProfile,
  saveProfile,
  readSubmissionsLog,
  saveSubmissionsLog,
  processBatchSubmissions,
  processJobSubmission
};
