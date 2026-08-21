const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { scrapeAllATSCompanies } = require('./ats_scraper');
const { scrapeGoogleJobs } = require('./google_jobs_scraper');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Scrape RemoteOK Feed Safely
async function scrapeRemoteOK(targetTitles = [], keywords = []) {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: BROWSER_HEADERS,
      timeout: 8000
    });

    if (response.status !== 200 || !Array.isArray(response.data)) {
      return [];
    }

    const jobs = response.data.slice(1);
    const matches = [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);

    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue;

      const title = (job.position || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      const company = job.company || 'Unknown';
      const url = job.url || `https://remoteok.com/remote-jobs/${job.id}`;
      const date = job.date ? new Date(job.date).toISOString() : new Date().toISOString();

      const matchedTerm = searchTerms.find(term => title.includes(term) || description.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        matches.push({
          id: `remoteok-${job.id}`,
          source: 'RemoteOK Feed',
          title: job.position || 'Remote Position',
          company,
          location: job.location || 'Remote',
          url,
          tags: job.tags || [],
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date
        });
      }
    }

    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape WeWorkRemotely Feed Safely
async function scrapeWeWorkRemotely(targetTitles = [], keywords = []) {
  try {
    const response = await axios.get('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', {
      headers: BROWSER_HEADERS,
      timeout: 8000
    });

    if (response.status !== 200 || typeof response.data !== 'string') {
      return [];
    }

    const xml = response.data;
    const matches = [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const rawTitle = match[1];
      const link = match[2];
      const pubDate = match[3];

      const parts = rawTitle.split(':');
      const company = parts.length > 1 ? parts[0].trim() : 'Unknown';
      const title = parts.length > 1 ? parts.slice(1).join(':').trim() : rawTitle;

      const matchedTerm = searchTerms.find(term => title.toLowerCase().includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        matches.push({
          id: `wwr-${Buffer.from(link).toString('base64').substring(0, 10)}`,
          source: 'WeWorkRemotely Feed',
          title,
          company,
          location: 'Remote',
          url: link,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: new Date(pubDate).toISOString()
        });
      }
    }

    return matches;
  } catch (err) {
    return [];
  }
}

// Master Pipeline Orchestrator
async function runScraperJob(customGreenhouse = [], customLever = [], serpApiKey = process.env.SERPAPI_KEY, targetTitles = [], keywords = []) {
  console.log('[Scrapedeez] Launching Pipeline with Search Terms:', targetTitles);

  const [remoteOkJobs, wwrJobs, atsJobs, googleJobs] = await Promise.all([
    scrapeRemoteOK(targetTitles, keywords),
    scrapeWeWorkRemotely(targetTitles, keywords),
    scrapeAllATSCompanies(customGreenhouse, customLever, targetTitles, keywords),
    scrapeGoogleJobs(serpApiKey, targetTitles)
  ]);

  const allMatches = [...atsJobs, ...googleJobs, ...remoteOkJobs, ...wwrJobs];

  // Remove duplicates
  const seen = new Set();
  const uniqueMatches = allMatches.filter(job => {
    const key = ((job.title || '') + '|' + (job.company || '')).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Save to local data store
  const dataPath = path.join(__dirname, 'jobs_data.json');
  fs.writeFileSync(dataPath, JSON.stringify({
    lastScraped: new Date().toISOString(),
    totalMatches: uniqueMatches.length,
    activeKeywords: targetTitles,
    sources: {
      atsCompanyCount: atsJobs.length,
      googleJobsCount: googleJobs.length,
      remoteOkCount: remoteOkJobs.length,
      weWorkRemotelyCount: wwrJobs.length
    },
    jobs: uniqueMatches
  }, null, 2));

  console.log(`[Scrapedeez] Pipeline Complete. ${uniqueMatches.length} matching job opportunities stored.`);
  return uniqueMatches;
}

module.exports = { runScraperJob };
