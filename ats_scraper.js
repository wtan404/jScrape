const axios = require('axios');

// Default target tech companies using Greenhouse, Lever, or Ashby
const DEFAULT_GREENHOUSE_COMPANIES = [
  'stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 
  'hashicorp', 'vercel', 'fastly', 'elastic', 'mongodb', 'pagerduty'
];

const DEFAULT_LEVER_COMPANIES = [
  'netflix', 'spotify', 'palantir', 'figma', 'postman'
];

const TARGET_KEYWORDS = [
  'it manager', 'manager of it', 'web operations', 'webops', 
  'devops manager', 'devops lead', 'director of it', 'infrastructure manager',
  'web development manager', 'release engineering', 'head of web'
];

// Scrape Greenhouse Boards
async function scrapeGreenhouseCompany(company) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
    const response = await axios.get(url, { timeout: 6000 });
    const jobs = response.data.jobs || [];

    const matches = [];
    for (const job of jobs) {
      const title = job.title || '';
      const location = job.location ? job.location.name : 'Remote / Various';
      const jobUrl = job.absolute_url;

      const matchedKeyword = TARGET_KEYWORDS.find(k => title.toLowerCase().includes(k));
      if (matchedKeyword) {
        matches.push({
          id: `gh-${company}-${job.id}`,
          source: `Greenhouse (${company.toUpperCase()})`,
          title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          url: jobUrl,
          matchedKeyword: matchedKeyword.toUpperCase(),
          date: job.updated_at || new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    // Board not found or no open jobs
    return [];
  }
}

// Scrape Lever Boards
async function scrapeLeverCompany(company) {
  try {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
    const response = await axios.get(url, { timeout: 6000 });
    const jobs = response.data || [];

    const matches = [];
    for (const job of jobs) {
      const title = job.text || '';
      const location = job.categories ? job.categories.location : 'Remote';
      const jobUrl = job.hostedUrl;

      const matchedKeyword = TARGET_KEYWORDS.find(k => title.toLowerCase().includes(k));
      if (matchedKeyword) {
        matches.push({
          id: `lever-${company}-${job.id}`,
          source: `Lever (${company.toUpperCase()})`,
          title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          url: jobUrl,
          matchedKeyword: matchedKeyword.toUpperCase(),
          date: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Master ATS Scraper Engine
async function scrapeAllATSCompanies(customGreenhouse = [], customLever = []) {
  const ghList = [...new Set([...DEFAULT_GREENHOUSE_COMPANIES, ...customGreenhouse])];
  const leverList = [...new Set([...DEFAULT_LEVER_COMPANIES, ...customLever])];

  console.log(`[ATS Scraper] Querying ${ghList.length} Greenhouse & ${leverList.length} Lever company boards...`);

  const ghPromises = ghList.map(c => scrapeGreenhouseCompany(c));
  const leverPromises = leverList.map(c => scrapeLeverCompany(c));

  const results = await Promise.all([...ghPromises, ...leverPromises]);
  const flatMatches = results.flat();

  console.log(`[ATS Scraper] Found ${flatMatches.length} matching leadership/WebOps postings across company career boards.`);
  return flatMatches;
}

module.exports = { scrapeAllATSCompanies, DEFAULT_GREENHOUSE_COMPANIES, DEFAULT_LEVER_COMPANIES };
