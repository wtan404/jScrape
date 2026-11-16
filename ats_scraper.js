const axios = require('axios');
const { classifyWorkType } = require('./geo_helper');
const { extractSalaryFromText } = require('./salary_extractor');

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
const DEFAULT_ASHBY_COMPANIES = [
  'linear', 'ramp', 'openai', 'perplexity', 'cursor', 'notion', 'sentry',
  'temporal', 'replit', 'modal', 'warp', 'supabase', 'pinecone'
];
const DEFAULT_SMARTRECRUITERS_COMPANIES = [
  'smartrecruiters'
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Negative Filter Guardrails: Strict IT focus, excluding non-technical Product Managers, HR, and Finance
const EXCLUDED_ROLE_PATTERNS = [
  /\b(product manager|group product manager|principal product manager|director of product|vp of product|head of product|product owner|product marketing)\b/i,
  /\b(human resources|talent acquisition|recruiter|recruiting|people ops|people operations|people partner|talent partner|people lead|people specialist)\b/i,
  /\b(accounting|accountant|finance|financial analyst|controller|payroll|accounts payable|accounts receivable|audit|tax|billing)\b/i
];

function isExcludedRole(title = '', extra = '') {
  const combined = (title + ' ' + extra).toLowerCase();
  // Exception: Technical Program Managers and IT Program Managers are explicitly retained
  if (combined.includes('technical program manager') || combined.includes('tpm') || combined.includes('it program manager') || combined.includes('infrastructure program manager')) {
    return false;
  }
  return EXCLUDED_ROLE_PATTERNS.some(rx => rx.test(combined));
}

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
      if (isExcludedRole(job.title || '')) continue;

      const title = (job.title || '').toLowerCase();
      const content = (job.content || '').toLowerCase();
      const location = job.location ? job.location.name : 'Remote / Various';

      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const workType = classifyWorkType(location, job.title);
        const salary = extractSalaryFromText(job.content || '');
        matches.push({
          id: `gh-${company}-${job.id}`,
          source: `Greenhouse (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          workType,
          salary,
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
      const category = job.categories ? (job.categories.team || job.categories.department || '') : '';
      if (isExcludedRole(job.text || '', category)) continue;

      const title = (job.text || '').toLowerCase();
      const description = (job.descriptionPlain || '').toLowerCase();
      const location = job.categories ? job.categories.location : 'Remote';

      const matchedTerm = searchTerms.find(term => title.includes(term) || description.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const workType = classifyWorkType(location, job.text);
        const fullDesc = (job.descriptionPlain || '') + ' ' + (job.additionalPlain || '');
        const salary = extractSalaryFromText(fullDesc);
        matches.push({
          id: `lever-${company}-${job.id}`,
          source: `Lever (${company.toUpperCase()})`,
          title: job.text,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          workType,
          salary,
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

// Scrape Ashby Board Safely
async function scrapeAshbyCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company}`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });

    if (response.status !== 200 || !response.data || !Array.isArray(response.data.jobs)) {
      return [];
    }

    const jobs = response.data.jobs;
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (!job || !job.isListed) continue;
      const dept = job.department || '';
      if (isExcludedRole(job.title || '', dept)) continue;

      const title = (job.title || '').toLowerCase();
      const content = (job.descriptionPlain || job.descriptionHtml || '').toLowerCase();
      const location = job.location || (job.address && job.address.postalAddress ? job.address.postalAddress.addressCountry : 'Remote');

      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        let workType = 'Onsite';
        if (job.workplaceType) {
          const wt = job.workplaceType.toLowerCase();
          if (wt.includes('remote') || job.isRemote) workType = 'Remote';
          else if (wt.includes('hybrid')) workType = 'Hybrid';
        } else {
          workType = classifyWorkType(location, job.title);
        }

        let salary = null;
        if (job.compensation && job.compensation.compensationTierSummary) {
          salary = job.compensation.compensationTierSummary;
        } else if (job.compensation && job.compensation.minValue && job.compensation.maxValue) {
          const cur = job.compensation.currency || '$';
          salary = `${cur}${Math.round(job.compensation.minValue / 1000)}k - ${cur}${Math.round(job.compensation.maxValue / 1000)}k`;
        } else {
          salary = extractSalaryFromText(job.descriptionPlain || job.descriptionHtml || '');
        }

        matches.push({
          id: `ashby-${company}-${job.id}`,
          source: `Ashby (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location,
          workType,
          salary,
          url: job.applyUrl || job.jobUrl,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.publishedAt || new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Scrape SmartRecruiters Board Safely
async function scrapeSmartRecruitersCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${company}/postings`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });

    if (response.status !== 200 || !response.data || !Array.isArray(response.data.content)) {
      return [];
    }

    const jobs = response.data.content;
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const dept = (job.department && job.department.label ? job.department.label : '').toLowerCase();
      if (isExcludedRole(job.name || '', dept)) continue;

      const title = (job.name || '').toLowerCase();
      const location = job.location ? (job.location.fullLocation || job.location.city || 'Remote') : 'Remote';

      const matchedTerm = searchTerms.find(term => title.includes(term) || dept.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        let workType = 'Onsite';
        if (job.location && job.location.remote) workType = 'Remote';
        else if (job.location && job.location.hybrid) workType = 'Hybrid';
        else workType = classifyWorkType(location, job.name);

        const postingUrl = `https://jobs.smartrecruiters.com/${company}/${job.id}`;
        const salary = extractSalaryFromText(job.content || job.name || '');

        matches.push({
          id: `sr-${company}-${job.id}`,
          source: `SmartRecruiters (${company.toUpperCase()})`,
          title: job.name,
          company: (job.company && job.company.name) ? job.company.name : (company.charAt(0).toUpperCase() + company.slice(1)),
          location,
          workType,
          salary,
          url: postingUrl,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.releasedDate || new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// Master ATS Engine
async function scrapeAllATSCompanies(customGreenhouse = [], customLever = [], targetTitles = [], keywords = [], customAshby = [], customSmartRecruiters = []) {
  const ghList = customGreenhouse.length > 0 ? customGreenhouse : DEFAULT_GREENHOUSE_COMPANIES;
  const leverList = customLever.length > 0 ? customLever : DEFAULT_LEVER_COMPANIES;
  const ashbyList = customAshby.length > 0 ? customAshby : DEFAULT_ASHBY_COMPANIES;
  const srList = customSmartRecruiters.length > 0 ? customSmartRecruiters : DEFAULT_SMARTRECRUITERS_COMPANIES;

  const ghPromises = ghList.map(c => scrapeGreenhouseCompany(c, targetTitles, keywords));
  const leverPromises = leverList.map(c => scrapeLeverCompany(c, targetTitles, keywords));
  const ashbyPromises = ashbyList.map(c => scrapeAshbyCompany(c, targetTitles, keywords));
  const srPromises = srList.map(c => scrapeSmartRecruitersCompany(c, targetTitles, keywords));

  const results = await Promise.all([...ghPromises, ...leverPromises, ...ashbyPromises, ...srPromises]);
  return results.flat();
}

module.exports = {
  scrapeAllATSCompanies,
  scrapeGreenhouseCompany,
  scrapeLeverCompany,
  scrapeAshbyCompany,
  scrapeSmartRecruitersCompany,
  DEFAULT_GREENHOUSE_COMPANIES,
  DEFAULT_LEVER_COMPANIES,
  DEFAULT_ASHBY_COMPANIES,
  DEFAULT_SMARTRECRUITERS_COMPANIES
};
