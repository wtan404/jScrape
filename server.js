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
const PROFILES_FILE = path.join(__dirname, 'profiles.json');

// Default 3 User Profiles Store
const DEFAULT_PROFILES = {
  activeProfileId: 'profile1',
  profiles: {
    profile1: {
      id: 'profile1',
      name: 'Profile 1 - IT Management',
      pin: null,
      targetTitles: ['Manager of IT', 'IT Manager', 'Director of IT'],
      keywords: ['management', 'devops', 'webops', 'infrastructure'],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare'],
      leverCompanies: ['netflix', 'spotify']
    },
    profile2: {
      id: 'profile2',
      name: 'Profile 2 - Web Operations (WebOps)',
      pin: null,
      targetTitles: ['Web Operations', 'WebOps Manager', 'Website Development'],
      keywords: ['webops', 'web development', 'cloudflare', 'terraform', 'vercel'],
      greenhouseCompanies: ['datadog', 'hashicorp', 'vercel'],
      leverCompanies: ['figma', 'postman']
    },
    profile3: {
      id: 'profile3',
      name: 'Profile 3 - DevOps Leadership',
      pin: null,
      targetTitles: ['DevOps Manager', 'DevOps Lead', 'Web Engineering Manager'],
      keywords: ['devops', 'kubernetes', 'cloud', 'aws', 'ci/cd'],
      greenhouseCompanies: ['gitlab', 'datadog', 'hashicorp'],
      leverCompanies: ['palantir', 'spotify']
    }
  }
};

// Ensure profile store exists
if (!fs.existsSync(PROFILES_FILE)) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(DEFAULT_PROFILES, null, 2));
}

// GET /api/profiles
app.get('/api/profiles', (req, res) => {
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const store = JSON.parse(raw);

    // Sanitize pins for security response (indicate hasPin boolean)
    const sanitizedProfiles = {};
    for (const [id, prof] of Object.entries(store.profiles)) {
      sanitizedProfiles[id] = {
        ...prof,
        hasPin: Boolean(prof.pin),
        pin: undefined // Hide actual PIN hash/value
      };
    }

    res.json({
      activeProfileId: store.activeProfileId,
      profiles: sanitizedProfiles
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read profiles.' });
  }
});

// POST /api/profiles/verify-pin (Verify or set initial PIN)
app.post('/api/profiles/verify-pin', (req, res) => {
  const { profileId, pin } = req.body;
  if (!profileId || !pin) {
    return res.status(400).json({ error: 'Profile ID and 4-digit PIN are required.' });
  }

  try {
    const store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    const target = store.profiles[profileId];

    if (!target) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    // Set PIN if first time
    if (!target.pin) {
      target.pin = String(pin).trim();
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2));
      return res.json({ status: 'pin_created', success: true, message: 'New 4-digit PIN set successfully!' });
    }

    // Verify existing PIN
    if (target.pin === String(pin).trim()) {
      return res.json({ status: 'pin_verified', success: true });
    } else {
      return res.status(401).json({ status: 'invalid_pin', success: false, error: 'Incorrect PIN entered.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'PIN verification failed.' });
  }
});

// POST /api/profiles/save (Save profile criteria after PIN authentication)
app.post('/api/profiles/save', (req, res) => {
  const { profileId, pin, name, targetTitles, keywords, greenhouseCompanies } = req.body;

  try {
    const store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    const target = store.profiles[profileId];

    if (!target) return res.status(404).json({ error: 'Profile not found.' });
    if (target.pin && target.pin !== String(pin).trim()) {
      return res.status(401).json({ error: 'Invalid PIN authentication.' });
    }

    if (name) target.name = name;
    if (targetTitles) target.targetTitles = targetTitles;
    if (keywords) target.keywords = keywords;
    if (greenhouseCompanies) target.greenhouseCompanies = greenhouseCompanies;

    store.activeProfileId = profileId;
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2));

    res.json({ status: 'success', profile: target });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save profile criteria.' });
  }
});

// GET /api/jobs
app.get('/api/jobs', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      res.json(JSON.parse(raw));
    } else {
      res.json({ lastScraped: null, totalMatches: 0, jobs: [] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read job database.' });
  }
});

// POST /api/scrape-now
app.post('/api/scrape-now', async (req, res) => {
  try {
    let store = DEFAULT_PROFILES;
    if (fs.existsSync(PROFILES_FILE)) {
      try { store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch (e) {}
    }

    const activeProf = store.profiles[store.activeProfileId] || store.profiles.profile1;

    const matches = await runScraperJob(
      activeProf.greenhouseCompanies || [],
      activeProf.leverCompanies || [],
      process.env.SERPAPI_KEY
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

// Schedule Automated Hourly Rescan & Availability Verification
cron.schedule('0 * * * *', async () => {
  console.log(`[Hourly Cron Scheduler] Running automated rescan: ${new Date().toISOString()}`);
  try {
    let store = DEFAULT_PROFILES;
    if (fs.existsSync(PROFILES_FILE)) {
      try { store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch (e) {}
    }
    const activeProf = store.profiles[store.activeProfileId] || store.profiles.profile1;
    await runScraperJob(activeProf.greenhouseCompanies || [], activeProf.leverCompanies || []);
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] 3-Profile PIN Protected Job Engine running on http://localhost:${PORT}`);
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan error:', err.message));
});
