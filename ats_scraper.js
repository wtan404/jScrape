const axios = require('axios');

const DEFAULT_GREENHOUSE_COMPANIES = ['stripe', 'gitlab', 'github', 'cloudflare', 'datadog', 'hashicorp', 'vercel'];
const DEFAULT_LEVER_COMPANIES = ['netflix', 'spotify', 'palantir', 'figma', 'postman'];

// Scrape Greenhouse Company Board using User's Custom Titles/Keywords
async function scrapeGreenhouseCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
    const response = await axios.get(url, { timeout: 6000 });
    const jobs = response.data.jobs || [];

    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const title = (job.title || '').toLowerCase();
      const content = (job.content || '').toLowerCase();
      const location = job.location ? job.location.name : 'Remote / Various';

      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        matches.push({
          id: `gh-${company}-${job.id}`,
          source: `Greenhouse (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
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

// Scrape Lever Company Board using User's Custom Titles/Keywords
async function scrapeLeverCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
    const response = await axios.get(url, { timeout: 6000 });
    const jobs = response.data || [];

    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const title = (job.text || '').toLowerCase();
      const description = (job.descriptionPlain || '').toLowerCase();
      const location = job.categories ? job.categories.location : 'Remote';

      const matchedTerm = searchTerms.find(term => title.includes(term) || description.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        matches.push({
          id: `lever-${company}-${job.id}`,
          source: `Lever (${company.toUpperCase()})`,
          title: job.text,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
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

// Master ATS Engine accepting User-Defined Keywords & Companies
async function scrapeAllATSCompanies(customGreenhouse = [], customLever = [], targetTitles = [], keywords = []) {
  const ghList = customGreenhouse.length > 0 ? customGreenhouse : DEFAULT_GREENHOUSE_COMPANIES;
  const leverList = customLever.length > 0 ? customLever : DEFAULT_LEVER_COMPANIES;

  console.log(`[ATS Scraper] Querying ${ghList.length} Greenhouse & ${leverList.length} Lever boards using custom keywords:`, targetTitles);

  const ghPromises = ghList.map(c => scrapeGreenhouseCompany(c, targetTitles, keywords));
  const leverPromises = leverList.map(c => scrapeLeverCompany(c, targetTitles, keywords));

  const results = await Promise.all([...ghPromises, ...leverPromises]);
  return results.flat();
}

module.exports = { scrapeAllATSCompanies, DEFAULT_GREENHOUSE_COMPANIES, DEFAULT_LEVER_COMPANIES };
