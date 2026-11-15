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
async function scrapeRemoteOK(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const response = await axios.get('https://remoteok.com/api', { headers: BROWSER_HEADERS, timeout: 8000 });
    if (response.status !== 200 || !Array.isArray(response.data)) return [];

    const jobs = response.data.slice(1);
    const matches = [];
    const searchRoles = targetTitles.length > 0 ? targetTitles : PREDEFINED_ROLES;
    const searchKeywords = keywords.length > 0 ? keywords : PREDEFINED_KEYWORDS;

    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue;
      const dateStr = job.date ? new Date(job.date).toISOString() : new Date().toISOString();
      
      if (!isWithin30Days(dateStr)) continue;

      const title = (job.position || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      const location = job.location || 'Remote';

      const matchedRole = searchRoles.find(r => title.includes(r.toLowerCase()));
      const hasKeyword = searchKeywords.some(k => (title + ' ' + description).includes(k.toLowerCase()));

      if (matchedRole || hasKeyword) {
        matches.push({
          id: `remoteok-${job.id}`,
          source: 'RemoteOK Feed',
          title: job.position || 'Remote Position',
          company: job.company || 'Unknown',
          location,
          workType: classifyWorkType(location, job.position),
          url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
          matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'SEARCH MATCH',
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
async function scrapeWeWorkRemotely(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const response = await axios.get('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss', { headers: BROWSER_HEADERS, timeout: 8000 });
    if (response.status !== 200 || typeof response.data !== 'string') return [];

    const xml = response.data;
    const matches = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g;
    const searchRoles = targetTitles.length > 0 ? targetTitles : PREDEFINED_ROLES;
    const searchKeywords = keywords.length > 0 ? keywords : PREDEFINED_KEYWORDS;

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

      const matchedRole = searchRoles.find(r => title.toLowerCase().includes(r.toLowerCase()));
      const hasKeyword = searchKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()));

      if (matchedRole || hasKeyword) {
        matches.push({
          id: `wwr-${Buffer.from(link).toString('base64').substring(0, 10)}`,
          source: 'WeWorkRemotely Feed',
          title,
          company,
          location: 'Remote',
          workType: 'Remote',
          url: link,
          matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'SEARCH MATCH',
          date: dateStr
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape Remotive Feed (Filtered for < 30 days old)
async function scrapeRemotive(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const urls = [
      'https://remotive.com/api/remote-jobs?category=devops-sysadmin',
      'https://remotive.com/api/remote-jobs?category=software-dev'
    ];
    const searchRoles = targetTitles.length > 0 ? targetTitles : PREDEFINED_ROLES;
    const searchKeywords = keywords.length > 0 ? keywords : PREDEFINED_KEYWORDS;
    const matches = [];
    const seen = new Set();

    for (const url of urls) {
      try {
        const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 8000 });
        if (response.status !== 200 || !response.data || !Array.isArray(response.data.jobs)) continue;

        for (const job of response.data.jobs) {
          if (!job || seen.has(job.id)) continue;
          seen.add(job.id);

          const dateStr = job.publication_date ? new Date(job.publication_date).toISOString() : new Date().toISOString();
          if (!isWithin30Days(dateStr)) continue;

          const title = (job.title || '').toLowerCase();
          const desc = (job.description || '').toLowerCase();
          const matchedRole = searchRoles.find(r => title.includes(r.toLowerCase()));
          const hasKeyword = searchKeywords.some(k => (title + ' ' + desc).includes(k.toLowerCase()));

          if (matchedRole || hasKeyword) {
            matches.push({
              id: `remotive-${job.id}`,
              source: 'Remotive Feed',
              title: job.title || 'Remote Tech Position',
              company: (job.company_name || 'Tech Company').trim(),
              location: job.candidate_required_location || 'Remote',
              workType: 'Remote',
              url: job.url,
              salary: job.salary || null,
              matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'SEARCH MATCH',
              date: dateStr
            });
          }
        }
      } catch (e) {}
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape Jobicy Feed (Filtered for < 30 days old)
async function scrapeJobicy(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const industries = ['engineering', 'management', 'cybersecurity'];
    const searchRoles = targetTitles.length > 0 ? targetTitles : PREDEFINED_ROLES;
    const searchKeywords = keywords.length > 0 ? keywords : PREDEFINED_KEYWORDS;
    const matches = [];
    const seen = new Set();

    for (const ind of industries) {
      try {
        const url = `https://jobicy.com/api/v2/remote-jobs?count=50&industry=${ind}`;
        const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 8000 });
        if (response.status !== 200 || !response.data || !Array.isArray(response.data.jobs)) continue;

        for (const job of response.data.jobs) {
          if (!job || seen.has(job.id)) continue;
          seen.add(job.id);

          const dateStr = job.pubDate ? new Date(job.pubDate).toISOString() : new Date().toISOString();
          if (!isWithin30Days(dateStr)) continue;

          const title = (job.jobTitle || '').toLowerCase();
          const desc = (job.jobExcerpt || job.jobDescription || '').toLowerCase();
          const matchedRole = searchRoles.find(r => title.includes(r.toLowerCase()));
          const hasKeyword = searchKeywords.some(k => (title + ' ' + desc).includes(k.toLowerCase()));

          if (matchedRole || hasKeyword) {
            let salaryFormatted = null;
            if (job.salaryMin && job.salaryMax) {
              salaryFormatted = `$${Math.round(job.salaryMin/1000)}k - $${Math.round(job.salaryMax/1000)}k`;
            }

            matches.push({
              id: `jobicy-${job.id}`,
              source: 'Jobicy Feed',
              title: job.jobTitle || 'Tech Position',
              company: (job.companyName || 'Company').replace(/&#038;/g, '&').trim(),
              location: job.jobGeo || 'Remote / US',
              workType: classifyWorkType(job.jobGeo || 'Remote', job.jobTitle),
              url: job.url,
              salary: salaryFormatted,
              matchedKeyword: matchedRole ? matchedRole.toUpperCase() : 'SEARCH MATCH',
              date: dateStr
            });
          }
        }
      } catch (e) {}
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Master Pipeline Run & Re-Verification
async function runScraperJob(customGreenhouse = [], customLever = [], serpApiKey = process.env.SERPAPI_KEY, customTitles = [], customKeywords = [], customAshby = [], customSmartRecruiters = []) {
  console.log('[Scrapedeez] Launching Pipeline for Active Criteria (< 30 days old)...');

  // Load config if available
  let cfg = {};
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
  }

  const greenhouseCompanies = customGreenhouse.length > 0 ? customGreenhouse : (cfg.greenhouseCompanies || []);
  const leverCompanies = customLever.length > 0 ? customLever : (cfg.leverCompanies || []);
  const ashbyCompanies = customAshby.length > 0 ? customAshby : (cfg.ashbyCompanies || []);
  const smartRecruitersCompanies = customSmartRecruiters.length > 0 ? customSmartRecruiters : (cfg.smartRecruitersCompanies || []);
  const targetTitles = customTitles.length > 0 ? customTitles : (cfg.targetTitles || PREDEFINED_ROLES);
  const keywords = customKeywords.length > 0 ? customKeywords : (cfg.keywords || PREDEFINED_KEYWORDS);
  const apiKey = serpApiKey || cfg.serpApiKey || process.env.SERPAPI_KEY;

  const dataPath = path.join(__dirname, 'jobs_data.json');
  let existingStore = { jobs: [] };
  if (fs.existsSync(dataPath)) {
    try { existingStore = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) {}
  }

  const verifiedExistingJobs = await verifyAndPruneJobs(existingStore.jobs || []);
  const existingIdSet = new Set(verifiedExistingJobs.map(j => j.id || j.url));

  const [remoteOkJobs, wwrJobs, remotiveJobs, jobicyJobs, atsJobs, googleJobs] = await Promise.all([
    scrapeRemoteOK(targetTitles, keywords).catch(() => []),
    scrapeWeWorkRemotely(targetTitles, keywords).catch(() => []),
    scrapeRemotive(targetTitles, keywords).catch(() => []),
    scrapeJobicy(targetTitles, keywords).catch(() => []),
    scrapeAllATSCompanies(greenhouseCompanies, leverCompanies, targetTitles, keywords, ashbyCompanies, smartRecruitersCompanies).catch(() => []),
    scrapeGoogleJobs(apiKey, targetTitles).catch(() => [])
  ]);

  const newlyScraped = [...atsJobs, ...googleJobs, ...remoteOkJobs, ...wwrJobs, ...remotiveJobs, ...jobicyJobs].filter(j => isWithin30Days(j.date));

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

  const outputData = {
    lastScraped: new Date().toISOString(),
    totalMatches: mergedJobs.length,
    maxAgeDays: 30,
    targetCriteria: targetTitles,
    keywords: keywords,
    jobs: mergedJobs
  };

  try {
    fs.writeFileSync(dataPath, JSON.stringify(outputData, null, 2));
  } catch (err) {
    console.error('[Scrapedeez] Error writing jobs_data.json:', err.message);
  }

  console.log(`[Scrapedeez] Rescan Complete. ${mergedJobs.length} active verified jobs (< 30 days old) stored.`);
  return mergedJobs;
}

if (require.main === module) {
  runScraperJob().catch(err => {
    console.error('[Scrapedeez] Scraper execution error:', err);
    process.exit(1);
  });
}

module.exports = { runScraperJob, scrapeRemotive, scrapeJobicy, scrapeRemoteOK, scrapeWeWorkRemotely, PREDEFINED_ROLES, PREDEFINED_KEYWORDS };
