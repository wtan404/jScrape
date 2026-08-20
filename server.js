const express = require('express');
const path = require('path');
const fs = require('fs');
const { runScraperJob } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 8090;

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'jobs_data.json');

// Ensure jobs data file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ lastScraped: null, totalMatches: 0, jobs: [] }));
}

// GET /api/jobs
app.get('/api/jobs', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read job database.' });
  }
});

// POST /api/scrape-now
app.post('/api/scrape-now', async (req, res) => {
  try {
    const matches = await runScraperJob();
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

// Start Server
app.listen(PORT, () => {
  console.log(`[Scrapedeez] Job Scraper Dashboard running on http://localhost:${PORT}`);
  // Initial background scrape on startup
  runScraperJob().catch(err => console.error('[Scrapedeez] Initial scrape error:', err));
});
