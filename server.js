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
const PROFILES_FILE = path.join(__dirname, 'profiles.json');

// Correct 3 User Profiles Setup: Profile 1 has ALL original criteria, Profiles 2 & 3 are custom user slots
const DEFAULT_PROFILES = {
  activeProfileId: 'profile1',
  profiles: {
    profile1: {
      id: 'profile1',
      name: 'User 1 - IT Management, WebOps & DevOps',
      pin: null,
      targetTitles: [
        'Manager of IT',
        'IT Manager',
        'Web Operations',
        'WebOps Manager',
        'Website Development',
        'DevOps Manager',
        'DevOps Lead',
        'Director of IT',
        'Web Engineering Manager'
      ],
      keywords: [
        'devops', 'webops', 'web development', 'infrastructure', 
        'cloud', 'terraform', 'kubernetes', 'change control', 'it management'
      ],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 'hashicorp', 'vercel'],
      leverCompanies: ['netflix', 'spotify', 'palantir', 'figma', 'postman']
    },
    profile2: {
      id: 'profile2',
      name: 'User Profile 2 (Custom)',
      pin: null,
      targetTitles: [],
      keywords: [],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare'],
      leverCompanies: ['netflix', 'spotify']
    },
    profile3: {
      id: 'profile3',
      name: 'User Profile 3 (Custom)',
      pin: null,
      targetTitles: [],
      keywords: [],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare'],
      leverCompanies: ['netflix', 'spotify']
    }
  }
};

// Always sync profiles file to use correct schema
fs.writeFileSync(PROFILES_FILE, JSON.stringify(DEFAULT_PROFILES, null, 2));

// GET /api/profiles
app.get('/api/profiles', (req, res) => {
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const store = JSON.parse(raw);

    const sanitizedProfiles = {};
    for (const [id, prof] of Object.entries(store.profiles)) {
      sanitizedProfiles[id] = {
        ...prof,
        hasPin: Boolean(prof.pin),
        pin: undefined
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

// POST /api/profiles/verify-pin
app.post('/api/profiles/verify-pin', (req, res) => {
  const { profileId, pin } = req.body;
  if (!profileId || !pin) {
    return res.status(400).json({ error: 'Profile ID and 4-digit PIN are required.' });
  }

  try {
    const store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    const target = store.profiles[profileId];

    if (!target) return res.status(404).json({ error: 'Profile not found.' });

    if (!target.pin) {
      target.pin = String(pin).trim();
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2));
      return res.json({ status: 'pin_created', success: true, message: 'New 4-digit PIN set successfully!' });
    }

    if (target.pin === String(pin).trim()) {
      return res.json({ status: 'pin_verified', success: true });
    } else {
      return res.status(401).json({ status: 'invalid_pin', success: false, error: 'Incorrect PIN entered.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'PIN verification failed.' });
  }
});

// POST /api/profiles/save
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
      process.env.SERPAPI_KEY,
      activeProf.targetTitles,
      activeProf.keywords
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
    await runScraperJob(activeProf.greenhouseCompanies || [], activeProf.leverCompanies || [], process.env.SERPAPI_KEY, activeProf.targetTitles, activeProf.keywords);
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] 3-Profile Engine running on http://localhost:${PORT}`);
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan error:', err.message));
});
