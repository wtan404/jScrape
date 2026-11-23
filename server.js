const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const axios = require('axios');
const { runScraperJob, extractSalaryFromText, detectLocationAndWorkType } = require('./scripts/scraper');
const {
  readProfile,
  saveProfile,
  readSubmissionsLog,
  saveSubmissionsLog,
  processBatchSubmissions
} = require('./scripts/submission_engine');

const app = express();
const PORT = process.env.PORT || 8090;

const ROOT_DIR = __dirname;
const DATA_FILE = path.join(ROOT_DIR, 'dta', 'jobs_data.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'dta', 'config.json');
const APPLICATIONS_FILE = path.join(ROOT_DIR, 'dta', 'job_applications.json');
const RESUMES_DIR = path.join(ROOT_DIR, 'uploads', 'resumes');
const RESUMES_META = path.join(RESUMES_DIR, 'metadata.json');

// Ensure resumes directory exists
if (!fs.existsSync(RESUMES_DIR)) {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
}

// Helpers for Resumes & Applications
function readResumesMeta() {
  if (fs.existsSync(RESUMES_META)) {
    try {
      const list = JSON.parse(fs.readFileSync(RESUMES_META, 'utf8'));
      let modified = false;
      for (const item of list) {
        if (!item.storedFile && item.fileName) {
          item.storedFile = item.id + '_' + item.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
          modified = true;
        }
        if (item.storedFile && item.fileBase64) {
          const filePath = path.join(RESUMES_DIR, item.storedFile);
          if (!fs.existsSync(filePath)) {
            try {
              const cleanBase64 = item.fileBase64.replace(/^data:[^;]+;base64,/, '');
              fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
            } catch (err) {}
          }
        }
      }
      if (modified) {
        saveResumesMeta(list);
      }
      return list;
    } catch (e) { return []; }
  }
  return [];
}

function saveResumesMeta(list) {
  fs.writeFileSync(RESUMES_META, JSON.stringify(list, null, 2));
}

function sanitizeApplicationsStructure(apps) {
  if (!apps || typeof apps !== 'object') {
    return { applied: {}, dismissed: {} };
  }
  const result = {
    applied: (apps.applied && typeof apps.applied === 'object') ? apps.applied : {},
    dismissed: (apps.dismissed && typeof apps.dismissed === 'object') ? apps.dismissed : {}
  };
  Object.entries(apps).forEach(([k, v]) => {
    if (k === 'applied' || k === 'dismissed') return;
    if (v && typeof v === 'object' && v.status) {
      const st = String(v.status).toLowerCase();
      if (st === 'dismissed' || st === 'drop') {
        result.dismissed[k] = v;
      } else {
        result.applied[k] = v;
      }
    }
  });
  return result;
}

function readApplications() {
  if (fs.existsSync(APPLICATIONS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8'));
      return sanitizeApplicationsStructure(parsed);
    } catch (e) {
      return { applied: {}, dismissed: {} };
    }
  }
  return { applied: {}, dismissed: {} };
}

function saveApplications(apps) {
  const sanitized = sanitizeApplicationsStructure(apps);
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(sanitized, null, 2));
}

// PHP API Emulation for local Node dev environment
async function handlePhpApi(req, res) {
  const action = req.query.action || '';
  const apps = readApplications();

  if (action === 'summary') {
    const profile = readProfile();
    const resumes = readResumesMeta();
    let count72h = 0;
    let totalVerified = 0;
    if (fs.existsSync(DATA_FILE)) {
      try {
        const jd = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const rawJobs = jd.jobs || [];
        totalVerified = rawJobs.length;
        const cutoff = Date.now() - (72 * 3600 * 1000);
        count72h = rawJobs.filter(j => j.date && new Date(j.date).getTime() >= cutoff).length;
      } catch (e) {}
    }
    return res.json({
      profile,
      resumesCount: resumes.length,
      resumes,
      jobsCount24h: count72h,
      totalVerified,
      submissionsCount: Object.keys(apps.applied).length,
      applications: apps
    });
  }

  if (action === 'applications') {
    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.applied && typeof body.applied === 'object') {
        Object.assign(apps.applied, body.applied);
      }
      if (body.dismissed && typeof body.dismissed === 'object') {
        Object.assign(apps.dismissed, body.dismissed);
      }
      saveApplications(apps);
      return res.json({
        status: 'success',
        message: 'Applications state synchronized.',
        appliedCount: Object.keys(apps.applied).length,
        dismissedCount: Object.keys(apps.dismissed).length,
        applications: apps
      });
    }
    return res.json(apps);
  }

  if (action === 'application-status' || action === 'update_application_status') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { jobId, job = {}, status, action: op = status || 'applied', reason, notes, resumeId, resumeLabel, appliedAt, dismissedAt } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
    const now = new Date().toISOString();

    if (op === 'applied') {
      delete apps.dismissed[jobId];
      apps.applied[jobId] = {
        jobId,
        job,
        status: status || 'Applied',
        resumeId: resumeId || null,
        resumeLabel: resumeLabel || 'Default Resume',
        notes: notes || 'Application recorded via Command Center',
        appliedAt: appliedAt || now,
        updatedAt: now
      };
    } else if (op === 'dismiss' || op === 'drop') {
      delete apps.applied[jobId];
      apps.dismissed[jobId] = {
        jobId,
        job,
        reason: reason || 'Marked as irrelevant by PM',
        dismissedAt: dismissedAt || now,
        updatedAt: now
      };
    } else if (op === 'restore' || op === 're-activate') {
      delete apps.applied[jobId];
      delete apps.dismissed[jobId];
    } else if (op === 'update_status') {
      if (apps.applied[jobId]) {
        apps.applied[jobId].status = status || apps.applied[jobId].status;
        apps.applied[jobId].updatedAt = now;
        if (req.body.rejectionStage !== undefined) apps.applied[jobId].rejectionStage = req.body.rejectionStage;
        if (req.body.stageHistory) apps.applied[jobId].stageHistory = req.body.stageHistory;
        if (notes) apps.applied[jobId].notes = notes;
      }
    } else if (op === 'remove_tracking') {
      delete apps.applied[jobId];
    }
    saveApplications(apps);

    return res.json({
      status: 'success',
      action: op,
      jobId,
      appliedCount: Object.keys(apps.applied).length,
      dismissedCount: Object.keys(apps.dismissed).length
    });
  }

  if (action === 'application-batch-status') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { jobs = [], action: op = 'mark_applied', status, reason } = req.body;
    const now = new Date().toISOString();
    let updatedCount = 0;

    jobs.forEach(item => {
      const key = item.jobId || item.id || item.url;
      if (!key) return;
      const jobData = item.job || item;

      if (op === 'mark_applied') {
        delete apps.dismissed[key];
        apps.applied[key] = {
          jobId: key,
          job: jobData,
          status: status || 'Applied',
          resumeId: item.resumeId || null,
          resumeLabel: item.resumeLabel || 'Default Resume',
          notes: 'Batch application recorded via Command Center',
          appliedAt: now,
          updatedAt: now
        };
        updatedCount++;
      } else if (op === 'dismiss' || op === 'drop') {
        delete apps.applied[key];
        apps.dismissed[key] = {
          jobId: key,
          job: jobData,
          reason: reason || 'Dropped during batch triage',
          dismissedAt: now,
          updatedAt: now
        };
        updatedCount++;
      }
    });
    saveApplications(apps);

    return res.json({
      status: 'success',
      action: op,
      updatedCount,
      appliedCount: Object.keys(apps.applied).length,
      dismissedCount: Object.keys(apps.dismissed).length
    });
  }

  if (action === 'profile') {
    if (req.method === 'POST') {
      saveProfile(req.body);
      return res.json({ status: 'success', profile: req.body });
    }
    return res.json(readProfile());
  }

  if (action === 'parse-job-url') {
    const targetUrl = (req.body && req.body.url) ? req.body.url.trim() : (req.query.url ? req.query.url.trim() : '');
    if (!targetUrl) {
      return res.status(400).json({ error: 'Please provide a valid job posting URL.' });
    }
    try {
      const parsedJob = await parseJobUrl(targetUrl);
      return res.json({ status: 'success', job: parsedJob });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to scan job posting URL.', message: err.message });
    }
  }

  return res.json({
    status: 'healthy',
    service: 'jscrape-persistence-api',
    timestamp: new Date().toISOString(),
    actions: ['applications', 'application-status', 'application-batch-status', 'profile', 'summary', 'parse-job-url']
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount PHP API dynamically BEFORE express.static
app.all('/api.php', handlePhpApi);

// Dedicated /dsb route handlers: serve the Funnel Analytics Dashboard
app.get(['/dsb', '/dsb/'], (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'dsb.html'));
});
app.get('/dsb.html', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'dsb.html'));
});
app.get('/jobs_data.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'dta', 'jobs_data.json')));
app.get('/job_applications.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'dta', 'job_applications.json')));
app.get('/profile.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'dta', 'profile.json')));
app.get('/config.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'dta', 'config.json')));
app.get('/health.json', (req, res) => {
  const hFile = path.join(ROOT_DIR, 'dta', 'health.json');
  if (fs.existsSync(hFile)) return res.sendFile(hFile);
  res.json({ status: 'healthy', service: 'scrapedeez' });
});

app.use(express.static(ROOT_DIR));

// Helper to read config
function readConfig() {
  const defaultConfig = {
    minSalary: 120000,
    targetTitles: [
      'Staff Engineer', 'Technical Program Manager', 'Staff Technical Program Manager',
      'Website Operations', 'Web Operations', 'WebOps Manager', 'Web Manager',
      'Website Manager', 'Web Engineering Manager', 'Forward Deploy Manager',
      'Forward Deployed Engineer', 'Release Manager', 'Release Engineer',
      'Release Engineering Manager', 'DevOps Manager', 'DevOps Lead',
      'Director of DevOps', 'DevOps Engineer', 'Infrastructure Manager',
      'Site Reliability Manager', 'Manager of IT', 'IT Manager', 'Director of IT',
      'Shopify Developer', 'Shopify Engineer', 'Shopify Manager',
      'WordPress Developer', 'WordPress Engineer', 'WordPress Manager', 'CMS Manager'
    ],
    keywords: [
      'staff engineer', 'technical program manager', 'tpm', 'web operations',
      'website operations', 'webops', 'web manager', 'forward deploy',
      'forward deployed', 'release manager', 'release engineering', 'devops manager',
      'devops', 'site reliability', 'sre', 'infrastructure', 'it management',
      'shopify', 'shopify plus', 'wordpress', 'wordpress vip', 'woocommerce'
    ],
    excludedKeywords: [
      'product manager', 'product management', 'product owner', 'product marketing',
      'group product manager', 'director of product', 'human resources',
      'talent acquisition', 'recruiter', 'recruiting', 'people operations',
      'people partner', 'accounting', 'accountant', 'finance', 'financial analyst',
      'controller', 'payroll', 'accounts payable', 'accounts receivable'
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
    ],
    ashbyCompanies: [
      'linear', 'ramp', 'openai', 'perplexity', 'cursor', 'notion', 'sentry',
      'temporal', 'replit', 'modal', 'warp', 'supabase', 'pinecone'
    ],
    smartRecruitersCompanies: [
      'smartrecruiters'
    ]
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      return defaultConfig;
    }
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  return defaultConfig;
}

// GET /api/config
app.get('/api/config', (req, res) => {
  try {
    const config = readConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read search configuration.' });
  }
});

// POST /api/config
app.post('/api/config', (req, res) => {
  try {
    const current = readConfig();
    const updated = {
      ...current,
      ...req.body
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
    res.json({ status: 'success', config: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save search configuration.' });
  }
});

// GET /api/jobs
app.get('/api/jobs', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      return res.json({
        lastScraped: data.lastScraped || null,
        totalMatches: data.totalMatches || (data.jobs ? data.jobs.length : 0),
        jobs: data.jobs || []
      });
    }
    res.json({ lastScraped: null, totalMatches: 0, jobs: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read job database.' });
  }
});

// GET /api/jobs/curated-24h (Curated Hotlist, up to 72 hours)
app.get('/api/jobs/curated-24h', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ count: 0, lastScraped: null, jobs: [] });
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const jobs = data.jobs || [];
    const applications = readApplications();
    const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
    const now = Date.now();

    const curated = jobs.filter(job => {
      if (!job || !job.date) return false;
      const jobTime = new Date(job.date).getTime();
      if (isNaN(jobTime)) return false;
      return (now - jobTime) <= SEVENTY_TWO_HOURS_MS;
    }).map(job => {
      const key = job.id || job.url;
      const appRecord = applications[key] || { status: 'unreviewed', resumeId: null, updatedAt: null, notes: '' };
      return {
        ...job,
        applicationRecord: appRecord
      };
    });

    curated.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      count: curated.length,
      lastScraped: data.lastScraped || null,
      jobs: curated
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch curated 24-hour postings.', message: err.message });
  }
});

// Helper: Parse Job Posting URL metadata (JSON-LD, OpenGraph, ATS APIs)
async function parseJobUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') throw new Error('Invalid URL');

  let detectedTitle = '';
  let detectedCompany = '';
  let detectedLocation = 'Remote';
  let detectedWorkType = 'Remote';
  let detectedSalary = null;
  let detectedSource = 'Direct Manual Import';
  let detectedDate = new Date().toISOString();
  let rawJdContent = '';

  // 1. Greenhouse Board API
  const ghMatch = targetUrl.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/([0-9]+)/i);
  if (ghMatch) {
    const ghCompany = ghMatch[1];
    const ghJobId = ghMatch[2];
    try {
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${ghCompany}/jobs/${ghJobId}`;
      const res = await axios.get(apiUrl, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.data) {
        detectedTitle = res.data.title || '';
        detectedCompany = ghCompany.charAt(0).toUpperCase() + ghCompany.slice(1);
        detectedLocation = res.data.location?.name || 'Remote';
        detectedSource = `Greenhouse (${ghCompany.toUpperCase()})`;
        rawJdContent = res.data.content || '';
        const sal = extractSalaryFromText(res.data.content || '');
        if (sal) detectedSalary = sal;
      }
    } catch (e) {}
  }

  // 2. Lever Postings API
  const levMatch = targetUrl.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
  if (!detectedTitle && levMatch) {
    const levCompany = levMatch[1];
    const levJobId = levMatch[2];
    try {
      const apiUrl = `https://api.lever.co/v0/postings/${levCompany}/${levJobId}`;
      const res = await axios.get(apiUrl, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.data) {
        detectedTitle = res.data.text || '';
        detectedCompany = levCompany.charAt(0).toUpperCase() + levCompany.slice(1);
        detectedLocation = res.data.categories?.location || 'Remote';
        detectedSource = `Lever (${levCompany.toUpperCase()})`;
        rawJdContent = (res.data.descriptionPlain || res.data.description || '') + ' ' + (res.data.additionalPlain || '');
      }
    } catch (e) {}
  }

  // 3. Workday Candidate Experience (CXS) REST API
  const wdMatch = targetUrl.match(/([a-zA-Z0-9_-]+)\.(?:wd\d+\.)?myworkdayjobs\.com/i);
  if (!detectedTitle && wdMatch) {
    const tenant = wdMatch[1];
    try {
      const u = new URL(targetUrl);
      const host = u.hostname;
      const pathMatch = u.pathname.match(/(?:[a-z]{2}(?:-[a-z]{2})?\/)?([^/]+)\/job\/(?:.*?\/)?([^/?#]+)/i);
      if (pathMatch) {
        const site = pathMatch[1];
        const jobSlug = pathMatch[2];
        const apiUrl = `https://${host}/wday/cxs/${tenant}/${site}/job/${jobSlug}`;
        const wdRes = await axios.get(apiUrl, {
          timeout: 7000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (wdRes.data && wdRes.data.jobPostingInfo) {
          const info = wdRes.data.jobPostingInfo;
          detectedTitle = (info.title || '').trim();
          detectedLocation = info.location || 'Remote';
          rawJdContent = info.jobDescription || '';
          if (info.startDate) detectedDate = info.startDate;
          const sal = extractSalaryFromText(rawJdContent);
          if (sal) detectedSalary = sal;
        }
      }
      if (!detectedCompany) {
        detectedCompany = tenant.charAt(0).toUpperCase() + tenant.slice(1);
      }
      detectedSource = `Workday (${detectedCompany})`;
    } catch (wdErr) {
      if (!detectedCompany) {
        detectedCompany = tenant.charAt(0).toUpperCase() + tenant.slice(1);
      }
      detectedSource = `Workday (${detectedCompany})`;
    }
  }

  // 4. Ashby Board & Job Resolver (Embedded Next.js & REST)
  const ashbyMatch = targetUrl.match(/jobs\.ashbyhq\.com\/([^/?#]+)(?:\/([a-zA-Z0-9_-]+))?/i);
  if (!detectedTitle && ashbyMatch) {
    const companySlug = ashbyMatch[1];
    try {
      const ashbyRes = await axios.get(targetUrl, {
        timeout: 7000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = ashbyRes.data || '';
      if (html) {
        rawJdContent = html;
        const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1]);
            const jp = nextData.props?.pageProps?.jobPosting;
            if (jp) {
              if (jp.title) detectedTitle = jp.title.trim();
              if (jp.companyName) detectedCompany = jp.companyName.trim();
              if (jp.locationName) detectedLocation = jp.locationName.trim();
              if (jp.descriptionHtml) rawJdContent = jp.descriptionHtml;
              if (jp.compensation?.scrapeCompensationSummary) {
                detectedSalary = jp.compensation.scrapeCompensationSummary;
              }
            }
          } catch (e) {}
        }
      }
      if (!detectedCompany) {
        detectedCompany = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
      }
      detectedSource = `Ashby (${detectedCompany})`;
    } catch (ashbyErr) {
      if (!detectedCompany) {
        detectedCompany = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
      }
      detectedSource = `Ashby (${detectedCompany})`;
    }
  }

  // 5. SmartRecruiters Postings API
  const srMatch = targetUrl.match(/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)\/([a-zA-Z0-9_-]+)/i);
  if (!detectedTitle && srMatch) {
    const srCompany = srMatch[1];
    const srJobSlug = srMatch[2];
    const srJobId = srJobSlug.split('-')[0];
    try {
      const apiUrl = `https://api.smartrecruiters.com/v1/companies/${srCompany}/postings/${srJobId}`;
      const srRes = await axios.get(apiUrl, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (srRes.data) {
        detectedTitle = srRes.data.name || '';
        detectedCompany = srRes.data.company?.name || (srCompany.charAt(0).toUpperCase() + srCompany.slice(1));
        if (srRes.data.location) {
          const loc = srRes.data.location;
          const locParts = [loc.city, loc.region, loc.country].filter(Boolean);
          detectedLocation = locParts.length > 0 ? locParts.join(', ') : (loc.remote ? 'Remote' : 'Remote');
        }
        detectedSource = `SmartRecruiters (${detectedCompany})`;
        if (srRes.data.jobAd?.sections?.jobDescription?.text) {
          rawJdContent = srRes.data.jobAd.sections.jobDescription.text;
          const sal = extractSalaryFromText(rawJdContent);
          if (sal) detectedSalary = sal;
        }
      }
    } catch (srErr) {
      if (!detectedCompany) detectedCompany = srCompany.charAt(0).toUpperCase() + srCompany.slice(1);
      detectedSource = `SmartRecruiters (${detectedCompany})`;
    }
  }

  // 6. BambooHR Postings
  const bhrMatch = targetUrl.match(/([a-zA-Z0-9_-]+)\.bamboohr\.com\/(?:careers|jobs)/i);
  if (!detectedTitle && bhrMatch) {
    const bhrTenant = bhrMatch[1];
    detectedCompany = bhrTenant.charAt(0).toUpperCase() + bhrTenant.slice(1);
    detectedSource = `BambooHR (${detectedCompany})`;
  }

  // 7. Oracle Cloud Recruiting (ORC / Candidate Experience CX) & Taleo
  const isOracleCloud = /oraclecloud\.com|careers\.oracle\.com/i.test(targetUrl);
  const isTaleo = /taleo\.net/i.test(targetUrl);

  if (!detectedTitle && isOracleCloud) {
    try {
      const u = new URL(targetUrl);
      const host = u.hostname;
      // Identify tenant name
      let tenantName = 'Oracle';
      if (/^([a-zA-Z0-9_-]+)\.fa\.(?:[a-zA-Z0-9_-]+\.)?oraclecloud\.com/i.test(host)) {
        const tMatch = host.match(/^([a-zA-Z0-9_-]+)\.fa\./i);
        tenantName = tMatch ? tMatch[1] : 'Oracle';
      } else if (/^([a-zA-Z0-9_-]+)\.oraclecloud\.com/i.test(host)) {
        const tMatch = host.match(/^([a-zA-Z0-9_-]+)\.oraclecloud\.com/i);
        tenantName = tMatch ? tMatch[1] : 'Oracle';
      }

      // Map well-known tenants
      let formattedEmployer = tenantName.toUpperCase();
      if (/^eeho$/i.test(tenantName) || /careers\.oracle\.com/i.test(host)) formattedEmployer = 'Oracle';
      else if (/^jpmc$/i.test(tenantName)) formattedEmployer = 'JPMorgan Chase';
      else if (/^[a-z0-9]+$/i.test(tenantName) && tenantName.length > 4) {
        formattedEmployer = tenantName.charAt(0).toUpperCase() + tenantName.slice(1);
      }

      // Extract siteNumber and jobId from path
      // Pattern: /sites/:siteNumber/job/:jobId or /sites/:siteNumber/requisitions/preview/:jobId
      const siteMatch = u.pathname.match(/sites\/([^/]+)\/(?:job|requisitions\/preview)\/([0-9a-zA-Z_-]+)/i) ||
                        u.pathname.match(/job\/([0-9a-zA-Z_-]+)/i);

      let siteNumber = 'CX';
      let jobId = null;
      if (siteMatch) {
        if (siteMatch.length === 3) {
          siteNumber = siteMatch[1];
          jobId = siteMatch[2];
        } else if (siteMatch.length === 2) {
          jobId = siteMatch[1];
        }
      }

      if (jobId) {
        // Query Oracle Fusion HCM Candidate Experience REST API
        const apiUrl = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?onlyData=true&expand=all&finder=ById;Id=%22${jobId}%22,siteNumber=${siteNumber}`;
        const orcRes = await axios.get(apiUrl, {
          timeout: 7000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (orcRes.data && orcRes.data.items && orcRes.data.items.length > 0) {
          const it = orcRes.data.items[0];
          detectedTitle = (it.Title || '').trim();
          detectedLocation = it.PrimaryLocation || 'Remote';
          rawJdContent = (it.ExternalDescriptionStr || '') + ' ' + (it.ShortDescriptionStr || '');

          if (/^jpmc$/i.test(tenantName)) {
            detectedCompany = 'JPMorgan Chase';
          } else {
            const corpEmployer = it.LegalEmployer || it.Organization || it.BusinessUnit;
            if (corpEmployer && !/^(oraclecloud|company)$/i.test(corpEmployer.trim())) {
              detectedCompany = corpEmployer.trim();
            } else {
              detectedCompany = formattedEmployer;
            }
          }

          detectedSource = `Oracle Cloud (${detectedCompany})`;
          if (it.ExternalPostedStartDate) detectedDate = it.ExternalPostedStartDate;

          const sal = extractSalaryFromText(rawJdContent);
          if (sal) detectedSalary = sal;
        }
      }
    } catch (orcErr) {}
  }

  if (!detectedTitle && isTaleo) {
    try {
      const u = new URL(targetUrl);
      const hostParts = u.hostname.split('.');
      let taleoOrg = hostParts[0];
      if (taleoOrg === 'chm' || taleoOrg === 'tbe') {
        const orgParam = u.searchParams.get('org');
        if (orgParam) taleoOrg = orgParam;
      }
      if (!/^(taleo|www|chm|tbe)$/i.test(taleoOrg)) {
        detectedCompany = taleoOrg.charAt(0).toUpperCase() + taleoOrg.slice(1);
      } else {
        detectedCompany = 'Employer';
      }
      detectedSource = `Taleo (${detectedCompany})`;
    } catch (e) {}
  }

  // 4. LinkedIn URL Recognition, Guest API & Slug Parsing
  const isLinkedIn = /linkedin\.com/i.test(targetUrl);
  if (isLinkedIn) {
    detectedSource = 'LinkedIn';

    // A. Extract numeric LinkedIn Job ID
    let linkedInJobId = null;
    const idMatch = targetUrl.match(/\/jobs\/view\/(?:[^\/]+-)?(\d{6,})/i) ||
                    targetUrl.match(/[?&]currentJobId=(\d{6,})/i) ||
                    targetUrl.match(/\/jobs\/view\/(\d+)/i);
    if (idMatch) linkedInJobId = idMatch[1];

    // B. Query LinkedIn Guest API (Bypasses standard 429 guest view wall)
    if (linkedInJobId) {
      try {
        const guestApiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedInJobId}`;
        const guestRes = await axios.get(guestApiUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        const gHtml = guestRes.data || '';
        if (gHtml) {
          rawJdContent = gHtml;
          const titleMatch = gHtml.match(/<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) ||
                             gHtml.match(/<h1[^>]*class="[^"]*topcard__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                             gHtml.match(/<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
          if (titleMatch) {
            detectedTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
          }

          const compMatch = gHtml.match(/<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                            gHtml.match(/<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                            gHtml.match(/class="[^"]*top-card-layout__first-subline[^"]*"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
          if (compMatch) {
            const parsedComp = compMatch[1].replace(/<[^>]+>/g, '').trim();
            if (parsedComp && !/^(linkedin|company)$/i.test(parsedComp)) {
              detectedCompany = parsedComp;
            }
          }

          const locMatch = gHtml.match(/<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                           gHtml.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
          if (locMatch) {
            detectedLocation = locMatch[1].replace(/<[^>]+>/g, '').trim();
          }

          const sal = extractSalaryFromText(gHtml);
          if (sal) detectedSalary = sal;
        }
      } catch (guestErr) {}
    }

    // C. Slug parsing fallback if guest API was not able to determine title/company
    if (!detectedTitle || !detectedCompany) {
      try {
        const u = new URL(targetUrl);
        const pathParts = u.pathname.split('/').filter(Boolean);
        const viewIdx = pathParts.indexOf('view');
        if (viewIdx !== -1 && pathParts[viewIdx + 1]) {
          const slug = pathParts[viewIdx + 1].replace(/-[0-9]{6,}$/, '');
          if (slug.includes('-at-')) {
            const [roleSlug, companySlug] = slug.split('-at-');
            if (roleSlug && !detectedTitle) {
              detectedTitle = roleSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            if (companySlug && !detectedCompany) {
              detectedCompany = companySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
          }
        }
      } catch (e) {}
    }
  }

  // 8. Universal Semantic HTML Engine (JSON-LD / OpenGraph / Twitter Cards / Semantic H1)
  if (!detectedTitle || !detectedCompany) {
    try {
      const res = await axios.get(targetUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const html = typeof res.data === 'string' ? res.data : '';
      if (html) {
        rawJdContent = html;
        // A. Parse JSON-LD JobPosting schema
        const jsonLdMatches = html.match(/<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatches) {
          for (const m of jsonLdMatches) {
            try {
              const rawJson = m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
              const parsed = JSON.parse(rawJson);
              const items = parsed['@graph'] ? parsed['@graph'] : (Array.isArray(parsed) ? parsed : [parsed]);
              for (const it of items) {
                if (it && it['@type'] && /jobposting|job/i.test(it['@type'])) {
                  if (it.title && !detectedTitle) detectedTitle = it.title.trim();
                  if (it.hiringOrganization?.name && !detectedCompany) {
                    const org = it.hiringOrganization.name.trim();
                    if (!/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|greenhouse|lever|workday|ashby|smartrecruiters)$/i.test(org)) {
                      detectedCompany = org;
                    }
                  }
                  if (it.jobLocation?.address) {
                    const addr = it.jobLocation.address;
                    const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
                    if (parts.length > 0) detectedLocation = parts.join(', ');
                  } else if (it.jobLocationType && /telecommute/i.test(it.jobLocationType)) {
                    detectedLocation = 'Remote';
                  }
                  if (it.datePosted) detectedDate = it.datePosted;

                  if (it.baseSalary?.value) {
                    const v = it.baseSalary.value;
                    if (v.minValue && v.maxValue) {
                      detectedSalary = `$${Number(v.minValue).toLocaleString()} - $${Number(v.maxValue).toLocaleString()}`;
                    } else if (v.value) {
                      detectedSalary = `$${Number(v.value).toLocaleString()}`;
                    }
                  } else if (typeof it.baseSalary === 'string') {
                    detectedSalary = it.baseSalary;
                  }
                  break;
                }
              }
            } catch (e) {}
            if (detectedTitle && detectedCompany) break;
          }
        }

        // B. OpenGraph & Twitter Cards
        if (!detectedTitle) {
          const ogTitle = html.match(/<meta[^>]+(?:property|name)=['"](?:og:title|twitter:title)['"][^>]+content=['"](.*?)['"]/i) ||
                          html.match(/<meta[^>]+content=['"](.*?)['"][^>]+(?:property|name)=['"](?:og:title|twitter:title)['"]/i);
          if (ogTitle) detectedTitle = ogTitle[1].trim();
        }
        if (!detectedCompany) {
          const ogSite = html.match(/<meta[^>]+(?:property|name)=['"](?:og:site_name|twitter:site)['"][^>]+content=['"](.*?)['"]/i) ||
                         html.match(/<meta[^>]+content=['"](.*?)['"][^>]+(?:property|name)=['"](?:og:site_name|twitter:site)['"]/i);
          if (ogSite) {
            const cleanSite = ogSite[1].replace(/^@/, '').trim();
            if (!/^(@?)(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|greenhouse|lever|workday|ashby|smartrecruiters|twitter|company|direct employer)$/i.test(cleanSite)) {
              detectedCompany = cleanSite;
            }
          }
        }

        // C. Semantic H1 in page
        if (!detectedTitle) {
          const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          if (h1Match) {
            const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();
            if (h1Text && h1Text.length < 120 && !/^(sign in|login|welcome|careers|jobs)$/i.test(h1Text)) {
              detectedTitle = h1Text;
            }
          }
        }

        // D. Title tag fallback
        if (!detectedTitle) {
          const titleTag = html.match(/<title[^>]*>(.*?)<\/title>/i);
          if (titleTag) {
            detectedTitle = titleTag[1].replace(/<[^>]+>/g, '').trim();
          }
        }

        // E. Salary regex fallback
        if (!detectedSalary) {
          const sal = extractSalaryFromText(html);
          if (sal) detectedSalary = sal;
        }
      }
    } catch (e) {}
  }

  // Deconstruct compound titles:
  // e.g. "<Role> at <Company> - <Location> | LinkedIn"
  // e.g. "<Company> hiring <Role>" or "<Company> Careers: <Role>"
  if (detectedTitle) {
    // Strip platform suffixes
    detectedTitle = detectedTitle.replace(/\s*[-|–—•·]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|Built In|Workday|Greenhouse|Lever|Ashby|SmartRecruiters|Jobs|Careers).*$/i, '').trim();

    // Guard against placeholder strings like "Opportunity at Company" or "Role at Company"
    const isPlaceholderTitle = /^(?:opportunity|role)(?:\s+at\s+.*)?$/i.test(detectedTitle);

    if (!isPlaceholderTitle) {
      const atMatch = detectedTitle.match(/^(.+?)\s+(?:at|@)\s+([^-–—|•·]+?)(?:\s*[-–—|•·]\s*(.+))?$/i);
      const hiringMatch = detectedTitle.match(/^([^-–—|•·]+?)\s+(?:is\s+)?hiring\s+(?:a\s+|an\s+)?(.+)/i);
      const careersMatch = detectedTitle.match(/^([^-–—|•·]+?)\s+(?:careers|jobs)\s*[:|–—-]\s*(.+)/i);

      if (atMatch && atMatch[1].trim().toLowerCase() !== 'opportunity' && atMatch[1].trim().toLowerCase() !== 'role') {
        const candidateRole = atMatch[1].trim();
        const extractedCompany = atMatch[2].trim();
        detectedTitle = candidateRole;
        if (!detectedCompany || /^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i.test(detectedCompany.trim())) {
          if (!/^(company|opportunity|role)$/i.test(extractedCompany)) {
            detectedCompany = extractedCompany;
          }
        }
        if ((!detectedLocation || detectedLocation === 'Remote') && atMatch[3]) {
          detectedLocation = atMatch[3].trim();
        }
      } else if (hiringMatch) {
        const extractedCompany = hiringMatch[1].trim();
        const candidateRole = hiringMatch[2].trim();
        detectedTitle = candidateRole;
        if (!detectedCompany || /^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i.test(detectedCompany.trim())) {
          detectedCompany = extractedCompany;
        }
      } else if (careersMatch) {
        const extractedCompany = careersMatch[1].trim();
        const candidateRole = careersMatch[2].trim();
        detectedTitle = candidateRole;
        if (!detectedCompany || /^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i.test(detectedCompany.trim())) {
          detectedCompany = extractedCompany;
        }
      }
    }
  }

  // Hostname fallback with subdomain stripping
  if (!detectedCompany || /^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|direct employer)$/i.test(detectedCompany.trim())) {
    try {
      const u = new URL(targetUrl);
      const hostParts = u.hostname.replace(/^www\./i, '').split('.');
      const filteredParts = hostParts.filter(p => !/^(careers|jobs|boards|work|apply|hire|corp|cdn)$/i.test(p));
      const candidate = filteredParts.length >= 2 ? filteredParts[filteredParts.length - 2] : filteredParts[0] || u.hostname;
      if (!/^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo|company|myworkdayjobs|bamboohr|ashbyhq|smartrecruiters)$/i.test(candidate)) {
        detectedCompany = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      } else {
        detectedCompany = isOracleCloud ? 'Oracle' : (isTaleo ? 'Employer' : (isLinkedIn ? 'Direct Employer' : 'Company'));
      }
    } catch (e) {
      detectedCompany = 'Direct Employer';
    }
  }

  if (!detectedTitle || /^opportunity(?:\s+at\s+.*)?$/i.test(detectedTitle.trim())) {
    detectedTitle = (detectedCompany && detectedCompany !== 'Company' && detectedCompany !== 'Direct Employer') 
      ? `Role at ${detectedCompany}` 
      : 'Tracked Position';
  }

  const resolved = detectLocationAndWorkType(detectedLocation, detectedTitle, rawJdContent);
  detectedLocation = resolved.location;
  detectedWorkType = resolved.workType;

  const hash = Buffer.from(targetUrl).toString('base64').substring(0, 10).replace(/[^a-zA-Z0-9]/g, '');
  return {
    id: `manual-${hash}`,
    source: detectedSource,
    title: detectedTitle.trim(),
    company: detectedCompany.trim(),
    location: detectedLocation.trim(),
    workType: detectedWorkType,
    salary: detectedSalary,
    url: targetUrl,
    matchedKeyword: 'MANUAL IMPORT',
    date: detectedDate
  };
}

// POST /api/jobs/parse-url (Scan and extract metadata from job posting URL)
app.post('/api/jobs/parse-url', async (req, res) => {
  const targetUrl = req.body && req.body.url ? req.body.url.trim() : '';
  if (!targetUrl) {
    return res.status(400).json({ error: 'Please provide a valid job posting URL.' });
  }

  try {
    const job = await parseJobUrl(targetUrl);
    res.json({ status: 'success', job });
  } catch (err) {
    res.status(500).json({ error: 'Failed to scan job URL.', message: err.message });
  }
});

// GET /api/jobs/applications (Application Tracking Status Map)
app.get('/api/jobs/applications', (req, res) => {
  try {
    const apps = readApplications();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications tracking data.' });
  }
});

// POST /api/jobs/application-status (Update status: applied, dismissed, active)
app.post('/api/jobs/application-status', (req, res) => {
  try {
    const { jobId, status, resumeId, resumeLabel, notes, job, action: op, reason, dismissedAt, appliedAt } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId parameter.' });
    }

    const apps = readApplications();
    const effectiveOp = op || status || 'applied';
    const now = new Date().toISOString();

    if (effectiveOp === 'active' || effectiveOp === 'restore' || effectiveOp === 'restored') {
      delete apps.applied[jobId];
      delete apps.dismissed[jobId];
    } else if (effectiveOp === 'dismiss' || effectiveOp === 'drop' || effectiveOp === 'dismissed') {
      delete apps.applied[jobId];
      apps.dismissed[jobId] = {
        jobId,
        job: job || (apps.dismissed[jobId] && apps.dismissed[jobId].job) || {},
        reason: reason || 'Irrelevant',
        dismissedAt: dismissedAt || now,
        updatedAt: now
      };
    } else if (effectiveOp === 'remove_tracking') {
      delete apps.applied[jobId];
    } else if (effectiveOp === 'update_status') {
      if (apps.applied[jobId]) {
        apps.applied[jobId].status = status || apps.applied[jobId].status;
        apps.applied[jobId].updatedAt = now;
        if (req.body.rejectionStage !== undefined) apps.applied[jobId].rejectionStage = req.body.rejectionStage;
        if (req.body.stageHistory) apps.applied[jobId].stageHistory = req.body.stageHistory;
        if (notes) apps.applied[jobId].notes = notes;
      }
    } else { // applied
      delete apps.dismissed[jobId];
      apps.applied[jobId] = {
        jobId,
        job: job || (apps.applied[jobId] && apps.applied[jobId].job) || {},
        status: status || 'Applied',
        resumeId: resumeId || null,
        resumeLabel: resumeLabel || 'Default Resume',
        notes: notes || 'Application recorded',
        appliedAt: appliedAt || now,
        updatedAt: now
      };
    }
    saveApplications(apps);

    res.json({
      status: 'success',
      action: effectiveOp,
      jobId,
      appliedCount: Object.keys(apps.applied).length,
      dismissedCount: Object.keys(apps.dismissed).length,
      all: apps
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save application status.', message: err.message });
  }
});

// POST /api/jobs/application-batch-status (Batch update: multiple jobs applied or dismissed)
app.post('/api/jobs/application-batch-status', (req, res) => {
  try {
    const { updates, jobs, action: op } = req.body;
    const items = updates || jobs;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Updates must be an array.' });
    }

    const apps = readApplications();
    const now = new Date().toISOString();
    items.forEach(u => {
      const key = u.jobId || u.id || u.url;
      if (!key) return;
      const jobData = u.job || u;
      const effectiveOp = op || u.status || 'applied';

      if (effectiveOp === 'active' || effectiveOp === 'restore' || effectiveOp === 'restored') {
        delete apps.applied[key];
        delete apps.dismissed[key];
      } else if (effectiveOp === 'dismiss' || effectiveOp === 'drop' || effectiveOp === 'dismissed') {
        delete apps.applied[key];
        apps.dismissed[key] = {
          jobId: key,
          job: jobData,
          reason: u.reason || u.notes || 'Dropped during batch triage',
          dismissedAt: u.dismissedAt || now,
          updatedAt: now
        };
      } else {
        delete apps.dismissed[key];
        apps.applied[key] = {
          jobId: key,
          job: jobData,
          status: u.status || 'Applied',
          resumeId: u.resumeId || null,
          resumeLabel: u.resumeLabel || 'Default Resume',
          notes: u.notes || 'Batch application recorded',
          appliedAt: u.appliedAt || now,
          updatedAt: now
        };
      }
    });
    saveApplications(apps);

    res.json({
      status: 'success',
      count: items.length,
      appliedCount: Object.keys(apps.applied).length,
      dismissedCount: Object.keys(apps.dismissed).length,
      all: apps
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save batch application status.', message: err.message });
  }
});

// GET /api/resumes (List Resume Variations)
app.get('/api/resumes', (req, res) => {
  try {
    const list = readResumesMeta();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read resumes metadata.' });
  }
});

// POST /api/resumes/upload (Upload Resume Variation via Base64 JSON)
app.post('/api/resumes/upload', (req, res) => {
  try {
    const { label, specialization, fileName, fileBase64 } = req.body;
    if (!fileName || !fileBase64) {
      return res.status(400).json({ error: 'Missing fileName or fileBase64 payload.' });
    }

    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = 'res_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const storedFile = `${id}_${safeName}`;
    const filePath = path.join(RESUMES_DIR, storedFile);

    fs.writeFileSync(filePath, buffer);

    const resumes = readResumesMeta();
    const newResume = {
      id,
      label: label || safeName,
      specialization: specialization || 'General Tech',
      fileName: safeName,
      storedFile,
      uploadDate: new Date().toISOString(),
      sizeBytes: buffer.length
    };

    resumes.push(newResume);
    saveResumesMeta(resumes);

    res.json({ status: 'success', resume: newResume });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload resume variation.', message: err.message });
  }
});

// DELETE /api/resumes/:id (Remove Resume Variation)
app.delete('/api/resumes/:id', (req, res) => {
  try {
    const id = req.params.id;
    let resumes = readResumesMeta();
    const target = resumes.find(r => r.id === id);

    if (target) {
      const filePath = path.join(RESUMES_DIR, target.storedFile);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      resumes = resumes.filter(r => r.id !== id);
      saveResumesMeta(resumes);
    }

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete resume variation.', message: err.message });
  }
});

// GET /api/resumes/:id/download (Download Specific Resume Variation)
app.get('/api/resumes/:id/download', (req, res) => {
  try {
    const id = req.params.id;
    const resumes = readResumesMeta();
    const target = resumes.find(r => r.id === id);

    if (!target) {
      return res.status(404).send('Resume not found.');
    }

    const storedFile = target.storedFile || (target.id + '_' + (target.fileName || 'resume.docx').replace(/[^a-zA-Z0-9._-]/g, '_'));
    const filePath = path.join(RESUMES_DIR, storedFile);
    if (!fs.existsSync(filePath) && target.fileBase64) {
      const cleanBase64 = target.fileBase64.replace(/^data:[^;]+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Resume file missing on disk.');
    }

    res.download(filePath, target.fileName || 'resume.docx');
  } catch (err) {
    res.status(500).send('Error downloading resume.');
  }
});

// GET /health & /api/health (Service Telemetry & Uptime Probes)
app.get(['/health', '/api/health'], (req, res) => {
  try {
    let jobsCount = 0;
    let lastScraped = null;
    let dataAgeMinutes = null;

    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      jobsCount = data.totalMatches || (data.jobs ? data.jobs.length : 0);
      lastScraped = data.lastScraped || null;
      if (lastScraped) {
        const diffMs = Date.now() - new Date(lastScraped).getTime();
        dataAgeMinutes = Math.max(0, Math.round(diffMs / 60000));
      }
    }

    // Mark degraded if data is older than 24 hours (1440 min)
    const isStale = dataAgeMinutes !== null && dataAgeMinutes > 1440;

    res.json({
      status: isStale ? 'degraded' : 'healthy',
      service: 'scrapedeez',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      jobsCount,
      lastScraped,
      dataAgeMinutes,
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
    });
  } catch (err) {
    res.status(500).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/scrape-now (Manual rescan trigger)
app.post('/api/scrape-now', async (req, res) => {
  console.log(`[Scrapedeez] Manual scan requested: ${new Date().toISOString()}`);
  try {
    const config = readConfig();
    const matches = await runScraperJob(
      config.greenhouseCompanies || [],
      config.leverCompanies || [],
      config.targetTitles || [],
      config.keywords || [],
      config.ashbyCompanies || [],
      config.smartRecruitersCompanies || []
    );

    res.json({
      status: 'success',
      count: matches.length,
      scrapedAt: new Date().toISOString(),
      jobs: matches
    });
  } catch (err) {
    console.error('[Scrapedeez] Scraper execution error:', err);
    res.status(500).json({ error: 'Scraper execution failed.', message: err.message });
  }
});

// Schedule Automated Hourly Rescan & Link Verification (Every hour on the hour)
cron.schedule('0 * * * *', async () => {
  console.log(`[Hourly Cron Scheduler] Running automated hourly rescan: ${new Date().toISOString()}`);
  try {
    const config = readConfig();
    await runScraperJob(
      config.greenhouseCompanies || [],
      config.leverCompanies || [],
      config.targetTitles || [],
      config.keywords || [],
      config.ashbyCompanies || [],
      config.smartRecruitersCompanies || []
    );
    console.log('[Hourly Cron Scheduler] Hourly scan completed successfully.');
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

// GET /api/profile
app.get('/api/profile', (req, res) => {
  try {
    res.json(readProfile());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read applicant profile.' });
  }
});

// POST /api/profile
app.post('/api/profile', (req, res) => {
  try {
    const updated = saveProfile(req.body);
    res.json({ status: 'success', profile: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save applicant profile.' });
  }
});

// GET /api/submissions/logs
app.get('/api/submissions/logs', (req, res) => {
  try {
    res.json(readSubmissionsLog());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read submission receipts.' });
  }
});

// POST /api/submissions/queue (Batch Auto-Submitter)
app.post('/api/submissions/queue', async (req, res) => {
  try {
    const { jobs, profile } = req.body;
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Missing or empty jobs array to submit.' });
    }

    const result = await processBatchSubmissions(jobs, profile);
    res.json(result);
  } catch (err) {
    console.error('[Submission Engine] Error processing queue:', err);
    res.status(500).json({ error: 'Batch submission failed.', message: err.message });
  }
});

// POST /api/test/mock-ats-submit (Mock ATS Endpoint for Testing & Payload Inspection)
app.post('/api/test/mock-ats-submit', (req, res) => {
  try {
    const payload = req.body || {};
    const answers = payload.answers || [];
    const resumeInfo = payload.resume_content ? {
      filename: payload.resume_content_filename || 'resume.pdf',
      sizeBytes: Math.round(payload.resume_content.length * 0.75)
    } : null;

    const receipt = {
      status: 'submitted_mock_ats',
      httpCode: 200,
      timestamp: new Date().toISOString(),
      receiptId: 'mock_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      candidate: {
        name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim() || payload.name,
        email: payload.email,
        phone: payload.phone
      },
      resolvedFieldsCount: answers.length,
      resumeAttached: Boolean(resumeInfo),
      resumeInfo,
      receivedPayload: payload
    };

    console.log(`[Mock ATS] Ingested test submission for ${receipt.candidate.name} (${answers.length} custom fields)`);
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: 'Mock ATS ingestion failure', message: err.message });
  }
});

// GET /api/dashboard/summary
app.get('/api/dashboard/summary', (req, res) => {
  try {
    const profile = readProfile();
    const resumes = readResumesMeta();
    const logs = readSubmissionsLog();
    const applications = readApplications();
    let jobsCount24h = 0;
    let totalVerified = 0;

    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const jobs = data.jobs || [];
      totalVerified = jobs.length;
      const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
      const now = Date.now();
      jobsCount24h = jobs.filter(j => j && j.date && (now - new Date(j.date).getTime()) <= SEVENTY_TWO_HOURS_MS).length;
    }

    res.json({
      profile,
      resumesCount: resumes.length,
      resumes,
      jobsCount24h,
      totalVerified,
      submissionsCount: Object.keys(applications.applied || {}).length || logs.length,
      recentLogs: logs.slice(0, 10),
      applications
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compile dashboard summary.' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Scrapedeez] Personal Job Engine running on http://localhost:${PORT}`);
    runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan notice:', err.message));
  });
}

module.exports = { app, parseJobUrl };
