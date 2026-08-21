const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { scrapeAllATSCompanies } = require('./ats_scraper');
const { scrapeGoogleJobs } = require('./google_jobs_scraper');
const { verifyAndPruneJobs, isWithin30Days } = require('./verifier');
const { classifyWorkType } = require('./geo_helper');

const PREDEFINED_ROLES = [
  'Manager of IT',
  'IT Manager',
  'Web Operations',
  'WebOps Manager',
  'Website Development',
  'DevOps Manager',
  'DevOps Lead',
  'Director of IT',
  'Web Engineering Manager'
];

const PREDEFINED_KEYWORDS = [
  'devops', 'webops', 'web development', 'infrastructure', 
  'cloud', 'terraform', 'kubernetes', 'change control', 'it management'
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Scrape RemoteOK Feed (Filtered for < 30 days old)
async function scrapeRemoteOK() {
  try {
    const response = await axios.get('https://remoteok.com/api', { headers: BROWSER_HEADERS, timeout: 8000 });
    if (response.status !== 200 || !Array.isArray(response.data)) return [];

    const jobs = response.data.slice(1);
    const matches = [];

    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue;
      const dateStr = job.date ? new Date(job.date).toISOString() : new Date().toISOString();
      
      if (!isWithin30Days(dateStr)) continue;

      const title = (job.position || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      const location = job.location || 'Remote';

      const matchedRole = PREDEFINED_ROLES.find(r => title.includes(r.toLowerCase()));
      const hasKeyword = PREDEFINED_KEYWORDS.some(k => (title + ' ' + description).includes(k));

      if (matchedRole || hasKeyword) {
        matches.push({
          id: `remoteok-${job.id}`,
          source: 'RemoteOK Feed',
          title: job.position || 'Remote Position',
          company: job.company || 'Unknown',
          location,
          workType: classifyWorkType(location, job.position),
          url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
          matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'DEVOPS / WEBOPS FILTER',
          date: dateStr
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape WeWorkRemotely Feed (Filtered for < 30 days old)
async function scrapeWeWorkRemotely() {
  try {
    const response = await axios.get('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', { headers: BROWSER_HEADERS, timeout: 8000 });
    if (response.status !== 200 || typeof response.data !== 'string') return [];

    const xml = response.data;
    const matches = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const rawTitle = match[1];
      const link = match[2];
      const pubDate = match[3];
      const dateStr = new Date(pubDate).toISOString();

      if (!isWithin30Days(dateStr)) continue;

      const parts = rawTitle.split(':');
      const company = parts.length > 1 ? parts[0].trim() : 'Unknown';
      const title = parts.length > 1 ? parts.slice(1).join(':').trim() : rawTitle;

      const matchedRole = PREDEFINED_ROLES.find(r => title.toLowerCase().includes(r.toLowerCase()));
      const hasKeyword = PREDEFINED_KEYWORDS.some(k => title.toLowerCase().includes(k));

      if (matchedRole || hasKeyword) {
        matches.push({
          id: `wwr-${Buffer.from(link).toString('base64').substring(0, 10)}`,
          source: 'WeWorkRemotely Feed',
          title,
          company,
          location: 'Remote',
          workType: 'Remote',
          url: link,
          matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'DEVOPS / WEBOPS FILTER',
          date: dateStr
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Master Pipeline Run & Re-Verification
async function runScraperJob(customGreenhouse = [], customLever = [], serpApiKey = process.env.SERPAPI_KEY) {
  console.log('[Scrapedeez] Launching Pipeline for Locked Criteria (< 30 days old)...');

  const dataPath = path.join(__dirname, 'jobs_data.json');
  let existingStore = { jobs: [] };
  if (fs.existsSync(dataPath)) {
    try { existingStore = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) {}
  }

  const verifiedExistingJobs = await verifyAndPruneJobs(existingStore.jobs || []);
  const existingIdSet = new Set(verifiedExistingJobs.map(j => j.id || j.url));

  const [remoteOkJobs, wwrJobs, atsJobs, googleJobs] = await Promise.all([
    scrapeRemoteOK(),
    scrapeWeWorkRemotely(),
    scrapeAllATSCompanies(customGreenhouse, customLever, PREDEFINED_ROLES, PREDEFINED_KEYWORDS),
    scrapeGoogleJobs(serpApiKey, PREDEFINED_ROLES)
  ]);

  const newlyScraped = [...atsJobs, ...googleJobs, ...remoteOkJobs, ...wwrJobs].filter(j => isWithin30Days(j.date));

  const mergedJobs = [];
  const seenUrls = new Set();

  for (const job of [...newlyScraped, ...verifiedExistingJobs]) {
    const key = (job.title + '|' + job.company).toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);

    const isNew = !existingIdSet.has(job.id || job.url);
    const workType = job.workType || classifyWorkType(job.location, job.title);

    mergedJobs.push({
      ...job,
      workType,
      isNew: isNew,
      verifiedAt: new Date().toISOString()
    });
  }

  mergedJobs.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || new Date(b.date) - new Date(a.date));

  fs.writeFileSync(dataPath, JSON.stringify({
    lastScraped: new Date().toISOString(),
    totalMatches: mergedJobs.length,
    maxAgeDays: 30,
    targetCriteria: PREDEFINED_ROLES,
    jobs: mergedJobs
  }, null, 2));

  console.log(`[Scrapedeez] Rescan Complete. ${mergedJobs.length} active verified jobs (< 30 days old) stored.`);
  return mergedJobs;
}

module.exports = { runScraperJob, PREDEFINED_ROLES, PREDEFINED_KEYWORDS };
