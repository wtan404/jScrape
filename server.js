const express = require('express');
const path = require('path');
const fs = require('fs');
const { runScraperJob } = require('./scraper');
const { DEFAULT_GREENHOUSE_COMPANIES, DEFAULT_LEVER_COMPANIES } = require('./ats_scraper');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'jobs_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default config fallback
const DEFAULT_CONFIG = {
  targetTitles: ['IT Manager', 'Manager of IT', 'Web Operations', 'DevOps Manager'],
  keywords: ['devops', 'webops', 'infrastructure', 'cloud', 'terraform'],
  greenhouseCompanies: DEFAULT_GREENHOUSE_COMPANIES,
  leverCompanies: DEFAULT_LEVER_COMPANIES,
  serpApiKey: ''
};

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ lastScraped: null, totalMatches: 0, jobs: [] }));
}

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

// GET /api/jobs
app.get('/api/jobs', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read job database.' });
  }
});

// GET /api/config
app.get('/api/config', (req, res) => {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read configuration.' });
  }
});

// POST /api/config (Save user custom keywords, titles & companies)
app.post('/api/config', (req, res) => {
  try {
    const { targetTitles, keywords, greenhouseCompanies, leverCompanies, serpApiKey } = req.body;
    const config = {
      targetTitles: targetTitles || DEFAULT_CONFIG.targetTitles,
      keywords: keywords || DEFAULT_CONFIG.keywords,
      greenhouseCompanies: greenhouseCompanies || DEFAULT_GREENHOUSE_COMPANIES,
      leverCompanies: leverCompanies || DEFAULT_LEVER_COMPANIES,
      serpApiKey: serpApiKey || ''
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    res.json({ status: 'success', config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update configuration.' });
  }
});

// POST /api/scrape-now
app.post('/api/scrape-now', async (req, res) => {
  try {
    let config = DEFAULT_CONFIG;
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }

    const matches = await runScraperJob(
      config.greenhouseCompanies,
      config.leverCompanies,
      config.serpApiKey || process.env.SERPAPI_KEY,
      config.targetTitles,
      config.keywords
    );

    res.json({
      status: 'success',
      count: matches.length,
      scrapedAt: new Date().toISOString(),
      jobs: matches
    });
  } catch (err) {
    res.status(500).json({ error: 'Scraper execution failed.', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] Web Scraper Dashboard running on http://localhost:${PORT}`);
});
