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

const DEFAULT_PROFILES = {
  activeProfileId: 'profile1',
  profiles: {
    profile1: {
      id: 'profile1',
      name: 'User 1 - IT Management, WebOps & DevOps',
      pin: null,
      targetTitles: [
        'Manager of IT', 'IT Manager', 'Web Operations', 'WebOps Manager',
        'Website Development', 'DevOps Manager', 'DevOps Lead', 'Director of IT', 'Web Engineering Manager'
      ],
      keywords: [
        'devops', 'webops', 'web development', 'infrastructure', 
        'cloud', 'terraform', 'kubernetes', 'change control', 'it management'
      ],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 'hashicorp', 'vercel'],
      leverCompanies: ['netflix', 'spotify', 'palantir', 'figma', 'postman'],
      lastScraped: new Date().toISOString(),
      totalMatches: 0,
      jobs: []
    },
    profile2: {
      id: 'profile2',
      name: 'User Profile 2 (Custom)',
      pin: null,
      targetTitles: [],
      keywords: [],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare'],
      leverCompanies: ['netflix', 'spotify'],
      lastScraped: null,
      totalMatches: 0,
      jobs: []
    },
    profile3: {
      id: 'profile3',
      name: 'User Profile 3 (Custom)',
      pin: null,
      targetTitles: [],
      keywords: [],
      greenhouseCompanies: ['stripe', 'gitlab', 'github', 'cloudflare'],
      leverCompanies: ['netflix', 'spotify'],
      lastScraped: null,
      totalMatches: 0,
      jobs: []
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

    const sanitizedProfiles = {};
    for (const [id, prof] of Object.entries(store.profiles)) {
      sanitizedProfiles[id] = {
        ...prof,
        hasPin: Boolean(prof.pin),
        pin: undefined,
        jobs: undefined // Omit heavy jobs payload in lightweight profiles call
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

// GET /api/jobs (Supports profile-specific fetch: /api/jobs?profileId=profile1)
app.get('/api/jobs', (req, res) => {
  const profileId = req.query.profileId || 'profile1';
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      const prof = store.profiles[profileId];

      if (prof && prof.jobs && prof.jobs.length > 0) {
        return res.json({
          profileId,
          lastScraped: prof.lastScraped,
          totalMatches: prof.jobs.length,
          jobs: prof.jobs
        });
      }
    }

    // Static fallback to global jobs_data.json
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      res.json({
        profileId,
        lastScraped: data.lastScraped,
        totalMatches: data.totalMatches || (data.jobs ? data.jobs.length : 0),
        jobs: data.jobs || []
      });
    } else {
      res.json({ profileId, lastScraped: null, totalMatches: 0, jobs: [] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read job database.' });
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

// POST /api/scrape-now (Profile-specific rescan)
app.post('/api/scrape-now', async (req, res) => {
  const profileId = req.body.profileId || 'profile1';

  try {
    let store = DEFAULT_PROFILES;
    if (fs.existsSync(PROFILES_FILE)) {
      try { store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch (e) {}
    }

    const targetProf = store.profiles[profileId] || store.profiles.profile1;

    const matches = await runScraperJob(
      targetProf.greenhouseCompanies || [],
      targetProf.leverCompanies || [],
      process.env.SERPAPI_KEY,
      targetProf.targetTitles,
      targetProf.keywords
    );

    targetProf.jobs = matches;
    targetProf.lastScraped = new Date().toISOString();
    targetProf.totalMatches = matches.length;

    store.activeProfileId = profileId;
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2));

    res.json({
      status: 'success',
      profileId,
      count: matches.length,
      scrapedAt: targetProf.lastScraped,
      jobs: matches
    });
  } catch (err) {
    res.status(500).json({ error: 'Scraper execution failed.', message: err.message });
  }
});

// Schedule Automated Hourly Rescan & Verification for All Profiles
cron.schedule('0 * * * *', async () => {
  console.log(`[Hourly Cron Scheduler] Running automated rescan for active profiles: ${new Date().toISOString()}`);
  try {
    let store = DEFAULT_PROFILES;
    if (fs.existsSync(PROFILES_FILE)) {
      try { store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch (e) {}
    }

    for (const [profId, prof] of Object.entries(store.profiles)) {
      if ((prof.targetTitles && prof.targetTitles.length > 0) || (prof.keywords && prof.keywords.length > 0)) {
        console.log(`[Hourly Cron Scheduler] Scanning jobs bound to profile: ${prof.name} (${profId})`);
        const matches = await runScraperJob(
          prof.greenhouseCompanies || [],
          prof.leverCompanies || [],
          process.env.SERPAPI_KEY,
          prof.targetTitles,
          prof.keywords
        );
        prof.jobs = matches;
        prof.lastScraped = new Date().toISOString();
        prof.totalMatches = matches.length;
      }
    }

    fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[Hourly Cron Scheduler] Automated run error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Scrapedeez] Profile-bound Job Engine running on http://localhost:${PORT}`);
  runScraperJob().catch(err => console.error('[Scrapedeez] Startup scan error:', err.message));
});
