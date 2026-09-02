const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runScraperJob } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'jobs_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

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
      config.keywords || []
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
      config.keywords || []
    );
    console.log('[Hourly Cron Scheduler] Hourly scan completed successfully.');
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] Personal Job Engine running on http://localhost:${PORT}`);
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan notice:', err.message));
});
