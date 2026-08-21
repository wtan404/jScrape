const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { scrapeAllATSCompanies } = require('./ats_scraper');
const { scrapeGoogleJobs } = require('./google_jobs_scraper');

// Target Job Keywords & Role Titles
const TARGET_TITLES = [
  'IT Manager',
  'Manager of IT',
  'Web Operations',
  'WebOps',
  'DevOps Manager',
  'DevOps Lead',
  'Web Development Manager',
  'Director of IT',
  'Infrastructure Manager',
  'Release Engineering',
  'Head of Web'
];

const KEYWORDS = ['devops', 'webops', 'web development', 'infrastructure', 'sysadmin', 'cloud', 'terraform', 'kubernetes', 'change control'];

// Scrape RemoteOK Public Endpoint
async function scrapeRemoteOK() {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'ScrapedeezJobScraper/1.0' },
      timeout: 8000
    });

    const jobs = response.data.slice(1);
    const matches = [];

    for (const job of jobs) {
      const title = job.position || '';
      const description = job.description || '';
      const company = job.company || 'Unknown';
      const url = job.url || `https://remoteok.com/remote-jobs/${job.id}`;
      const date = job.date ? new Date(job.date).toISOString() : new Date().toISOString();

      const matchedTitle = TARGET_TITLES.find(t => title.toLowerCase().includes(t.toLowerCase()));
      const hasKeywords = KEYWORDS.some(k => (title + ' ' + description).toLowerCase().includes(k));

      if (matchedTitle || hasKeywords) {
        matches.push({
          id: `remoteok-${job.id}`,
          source: 'RemoteOK Feed',
          title,
          company,
          location: job.location || 'Remote',
          url,
          tags: job.tags || [],
          matchedKeyword: matchedTitle || 'DEVOPS / WEBOPS FILTER',
          date
        });
      }
    }

    return matches;
  } catch (err) {
    console.error('[Scraper] RemoteOK feed offline or timed out.');
    return [];
  }
}

// Scrape WeWorkRemotely Feed
async function scrapeWeWorkRemotely() {
  try {
    const response = await axios.get('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', {
      headers: { 'User-Agent': 'ScrapedeezJobScraper/1.0' },
      timeout: 8000
    });

    const xml = response.data;
    const matches = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const rawTitle = match[1];
      const link = match[2];
      const pubDate = match[3];

      const parts = rawTitle.split(':');
      const company = parts.length > 1 ? parts[0].trim() : 'Unknown';
      const title = parts.length > 1 ? parts.slice(1).join(':').trim() : rawTitle;

      const matchedTitle = TARGET_TITLES.find(t => title.toLowerCase().includes(t.toLowerCase()));
      const hasKeywords = KEYWORDS.some(k => title.toLowerCase().includes(k));

      if (matchedTitle || hasKeywords) {
        matches.push({
          id: `wwr-${Buffer.from(link).toString('base64').substring(0, 10)}`,
          source: 'WeWorkRemotely Feed',
          title,
          company,
          location: 'Remote',
          url: link,
          matchedKeyword: matchedTitle || 'DEVOPS / WEBOPS FILTER',
          date: new Date(pubDate).toISOString()
        });
      }
    }

    return matches;
  } catch (err) {
    console.error('[Scraper] WeWorkRemotely feed offline or timed out.');
    return [];
  }
}

// Master Scraper Pipeline
async function runScraperJob(customGreenhouse = [], customLever = [], serpApiKey = process.env.SERPAPI_KEY) {
  console.log('[Scrapedeez] Launching Master Multi-Source Job Scraper Pipeline...');

  const [remoteOkJobs, wwrJobs, atsJobs, googleJobs] = await Promise.all([
    scrapeRemoteOK(),
    scrapeWeWorkRemotely(),
    scrapeAllATSCompanies(customGreenhouse, customLever),
    scrapeGoogleJobs(serpApiKey)
  ]);

  const allMatches = [...atsJobs, ...googleJobs, ...remoteOkJobs, ...wwrJobs];

  // Remove duplicates by URL or title+company
  const seen = new Set();
  const uniqueMatches = allMatches.filter(job => {
    const key = (job.title + '|' + job.company).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Save to local data store
  const dataPath = path.join(__dirname, 'jobs_data.json');
  fs.writeFileSync(dataPath, JSON.stringify({
    lastScraped: new Date().toISOString(),
    totalMatches: uniqueMatches.length,
    sources: {
      atsCompanyCount: atsJobs.length,
      googleJobsCount: googleJobs.length,
      remoteOkCount: remoteOkJobs.length,
      weWorkRemotelyCount: wwrJobs.length
    },
    jobs: uniqueMatches
  }, null, 2));

  console.log(`[Scrapedeez] Pipeline Complete. ${uniqueMatches.length} total IT Manager, WebOps & DevOps job opportunities stored.`);
  return uniqueMatches;
}

if (require.main === module) {
  runScraperJob();
}

module.exports = { runScraperJob, TARGET_TITLES, KEYWORDS };
