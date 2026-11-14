const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runScraperJob } = require('./scraper');
const {
  readProfile,
  saveProfile,
  readSubmissionsLog,
  saveSubmissionsLog,
  processBatchSubmissions
} = require('./submission_engine');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'jobs_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const APPLICATIONS_FILE = path.join(__dirname, 'job_applications.json');
const RESUMES_DIR = path.join(__dirname, 'uploads', 'resumes');
const RESUMES_META = path.join(RESUMES_DIR, 'metadata.json');

// Ensure resumes directory exists
if (!fs.existsSync(RESUMES_DIR)) {
  fs.mkdirSync(RESUMES_DIR, { recursive: true });
}

// Helpers for Resumes & Applications
function readResumesMeta() {
  if (fs.existsSync(RESUMES_META)) {
    try { return JSON.parse(fs.readFileSync(RESUMES_META, 'utf8')); } catch (e) { return []; }
  }
  return [];
}

function saveResumesMeta(list) {
  fs.writeFileSync(RESUMES_META, JSON.stringify(list, null, 2));
}

function readApplications() {
  if (fs.existsSync(APPLICATIONS_FILE)) {
    try { return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8')); } catch (e) { return {}; }
  }
  return {};
}

function saveApplications(apps) {
  fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
}

// Helper to read config
function readConfig() {
  const defaultConfig = {
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
    ],
    ashbyCompanies: [
      'linear', 'ramp', 'openai', 'perplexity', 'cursor', 'notion', 'sentry',
      'temporal', 'replit', 'modal', 'warp', 'supabase', 'pinecone'
    ],
    smartRecruitersCompanies: [
      'smartrecruiters'
    ],
    serpApiKey: ''
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

// GET /api/jobs/curated-24h (Curated 24-Hour Hotlist)
app.get('/api/jobs/curated-24h', (req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json({ count: 0, lastScraped: null, jobs: [] });
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    const jobs = data.jobs || [];
    const applications = readApplications();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const curated = jobs.filter(job => {
      if (!job || !job.date) return false;
      const jobTime = new Date(job.date).getTime();
      if (isNaN(jobTime)) return false;
      return (now - jobTime) <= TWENTY_FOUR_HOURS_MS;
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

// GET /api/jobs/applications (Application Tracking Status Map)
app.get('/api/jobs/applications', (req, res) => {
  try {
    const apps = readApplications();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications tracking data.' });
  }
});

// POST /api/jobs/application-status (Update status: applied, saved, skipped)
app.post('/api/jobs/application-status', (req, res) => {
  try {
    const { jobId, status, resumeId, notes } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId parameter.' });
    }

    const apps = readApplications();
    apps[jobId] = {
      status: status || 'unreviewed',
      resumeId: resumeId || null,
      notes: notes || '',
      updatedAt: new Date().toISOString()
    };
    saveApplications(apps);

    res.json({ status: 'success', application: apps[jobId] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save application status.', message: err.message });
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

    const filePath = path.join(RESUMES_DIR, target.storedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Resume file missing on disk.');
    }

    res.download(filePath, target.fileName);
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
      config.serpApiKey || process.env.SERPAPI_KEY,
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
      config.serpApiKey || process.env.SERPAPI_KEY,
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
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();
      jobsCount24h = jobs.filter(j => j && j.date && (now - new Date(j.date).getTime()) <= TWENTY_FOUR_HOURS_MS).length;
    }

    res.json({
      profile,
      resumesCount: resumes.length,
      resumes,
      jobsCount24h,
      totalVerified,
      submissionsCount: logs.length,
      recentLogs: logs.slice(0, 10),
      applications
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compile dashboard summary.' });
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] Personal Job Engine running on http://localhost:${PORT}`);
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan notice:', err.message));
});
