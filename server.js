const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runScraperJob, PREDEFINED_ROLES } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'jobs_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Ensure data files exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ lastScraped: null, totalMatches: 0, targetCriteria: PREDEFINED_ROLES, jobs: [] }));
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

// POST /api/scrape-now (Manual trigger to re-verify links and fetch new postings)
app.post('/api/scrape-now', async (req, res) => {
  try {
    let config = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
    }

    const matches = await runScraperJob(
      config.greenhouseCompanies || [],
      config.leverCompanies || [],
      config.serpApiKey || process.env.SERPAPI_KEY
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

// Schedule Automated Hourly Rescan & Availability Verification (Every 60 minutes)
cron.schedule('0 * * * *', async () => {
  console.log('\n=============================================================');
  console.log(`[Hourly Cron Scheduler] Running automated rescan & link verification: ${new Date().toISOString()}`);
  console.log('=============================================================\n');
  
  try {
    let config = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
    }

    await runScraperJob(
      config.greenhouseCompanies || [],
      config.leverCompanies || [],
      config.serpApiKey || process.env.SERPAPI_KEY
    );
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] Automated Hourly Job Scraper & Link Verifier running on http://localhost:${PORT}`);
  // Run initial scan & verification on startup
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan error:', err.message));
});
