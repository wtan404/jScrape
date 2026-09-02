const axios = require('axios');
const { classifyWorkType } = require('./geo_helper');

const DEFAULT_GREENHOUSE_COMPANIES = [
  'webflow', 'squarespace', 'contentful', 'fastly', 'klaviyo', 'braze', 'circleci',
  'grafanalabs', 'pagerduty', 'launchdarkly', 'cockroachlabs', 'elastic', 'mongodb',
  'twilio', 'canonical', 'gusto', 'checkr', 'carta', 'samsara', 'lattice', 'airtable',
  'bitwarden', 'toast', 'remote', 'coursera', 'scaleai', 'anthropic', 'ripple',
  'cloudflare', 'datadog', 'vercel', 'gitlab', 'stripe', 'figma', 'pinterest',
  'reddit', 'discord', 'instacart', 'affirm', 'brex', 'robinhood'
];
const DEFAULT_LEVER_COMPANIES = [
  'palantir', 'spotify', 'wealthfront', 'coupa', 'outreach', 'jumpcloud',
  'secureframe', 'everbridge', 'sophos', 'sysdig', 'scaleway', 'siteground',
  'kinsta', 'neon', 'metabase', 'activecampaign', 'brevo', 'mindtickle',
  'walkme', 'zilliz', 'zerotier', 'twingate', 'omnisend', 'netomi', 'brilliant',
  'clari', 'highspot', 'kraken', 'mistral', 'veeva'
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Scrape Greenhouse Board Safely
async function scrapeGreenhouseCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });

    if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
      return [];
    }

    const jobs = response.data.jobs || [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const title = (job.title || '').toLowerCase();
      const content = (job.content || '').toLowerCase();
      const location = job.location ? job.location.name : 'Remote / Various';

      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const workType = classifyWorkType(location, job.title);
        matches.push({
          id: `gh-${company}-${job.id}`,
          source: `Greenhouse (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          workType,
          url: job.absolute_url,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.updated_at || new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape Lever Board Safely
async function scrapeLeverCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });

    if (response.status !== 200 || !response.data || !Array.isArray(response.data)) {
      return [];
    }

    const jobs = response.data;
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const title = (job.text || '').toLowerCase();
      const description = (job.descriptionPlain || '').toLowerCase();
      const location = job.categories ? job.categories.location : 'Remote';

      const matchedTerm = searchTerms.find(term => title.includes(term) || description.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const workType = classifyWorkType(location, job.text);
        matches.push({
          id: `lever-${company}-${job.id}`,
          source: `Lever (${company.toUpperCase()})`,
          title: job.text,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          workType,
          url: job.hostedUrl,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Master ATS Engine
async function scrapeAllATSCompanies(customGreenhouse = [], customLever = [], targetTitles = [], keywords = []) {
  const ghList = customGreenhouse.length > 0 ? customGreenhouse : DEFAULT_GREENHOUSE_COMPANIES;
  const leverList = customLever.length > 0 ? customLever : DEFAULT_LEVER_COMPANIES;

  const ghPromises = ghList.map(c => scrapeGreenhouseCompany(c, targetTitles, keywords));
  const leverPromises = leverList.map(c => scrapeLeverCompany(c, targetTitles, keywords));

  const results = await Promise.all([...ghPromises, ...leverPromises]);
  return results.flat();
}

module.exports = { scrapeAllATSCompanies, DEFAULT_GREENHOUSE_COMPANIES, DEFAULT_LEVER_COMPANIES };
