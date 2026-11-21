const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==============================================================================
// 1. Geolocation, Distance & Workplace Classification Engine
// ==============================================================================

function calculateDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function classifyWorkType(locationStr = '', titleStr = '') {
  const text = (locationStr + ' ' + titleStr).toLowerCase();
  if (text.includes('hybrid')) return 'Hybrid';
  if (text.includes('remote') || text.includes('telecommute') || text.includes('work from home') || text.includes('anywhere')) return 'Remote';
  return 'Onsite';
}

function detectLocationAndWorkType(locationStr = '', titleStr = '', jdText = '') {
  let workType = classifyWorkType(locationStr, titleStr);
  const combined = `${locationStr} ${titleStr} ${jdText}`.toLowerCase();

  if (workType === 'Onsite') {
    if (combined.includes('hybrid')) workType = 'Hybrid';
    else if (combined.includes('remote') || combined.includes('telecommute') || combined.includes('work from home')) workType = 'Remote';
  }

  if (workType === 'Onsite') {
    return { location: locationStr || 'Onsite', workType };
  }

  const isLimitedStateGroup =
    /(?:eligible|participating|specific|select|selected|approved|certain|limited)\s+(?:us\s+)?states/i.test(combined) ||
    /(?:remote|telecommute|wfh)[\s\S]{0,100}(?:only\s+in|restricted\s+to|limited\s+to|eligible\s+states|following\s+states|selected\s+states|certain\s+states|specific\s+states|only\s+to\s+candidates\s+in)/i.test(combined) ||
    /(?:must\s+(?:reside|live|be\s+located)|open\s+to\s+(?:residents\s+of|candidates\s+in)|hiring\s+(?:only\s+)?in)[\s\S]{0,120}(?:following\s+states|these\s+states|selected\s+states|select\s+states|\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\s*,\s*[A-Z]{2})+\b)/i.test(combined) ||
    /(?:remote|hybrid)\s*[-–—:]\s*(?:[A-Za-z\s]+,\s*){1,10}[A-Za-z\s]+/i.test(locationStr) && /(?:california|texas|new york|washington|florida|colorado|illinois|\b(?:ca|ny|tx|wa|fl|il|ma|co|nc|ga|va|mi|oh|pa|nj|az)\b)/i.test(locationStr) ||
    /(?:remote|hybrid)\s*\((?:[A-Z]{2}[,\s/]+){1,15}[A-Z]{2}\)/i.test(locationStr) ||
    /\((?:[A-Z]{2}[,\s/]+){1,15}[A-Z]{2}\)\s*(?:remote|hybrid)/i.test(locationStr) ||
    /(?:,\s*us-[a-z\s]+){2,}/i.test(locationStr) ||
    /(?:remote|hybrid)[\s\S]{0,30}(?:select|specific|certain|limited)\s+states/i.test(locationStr);

  const finalLocation = isLimitedStateGroup ? 'limited, US' : (locationStr || 'Remote');
  return { location: finalLocation, workType };
}

// ==============================================================================
// 2. Compensation & Salary Extraction Engine
// ==============================================================================

function extractSalaryFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.replace(/,/g, '');

  const rangeYearly = /\$(\d{2,3}(?:\d{3})?)\s*(?:-|–|—|to)\s*\$?(\d{2,3}(?:\d{3})?)\s*(?:per\s*year|\/yr|\/year|annually|annual|yr)?/i.exec(clean);
  if (rangeYearly) {
    let min = parseInt(rangeYearly[1], 10);
    let max = parseInt(rangeYearly[2], 10);
    if (min < 1000) min *= 1000;
    if (max < 1000) max *= 1000;
    if (min >= 30000 && max >= 30000) {
      return { min, max, text: `$${min.toLocaleString()} - $${max.toLocaleString()}` };
    }
  }

  const singleYearly = /\$(\d{2,3}(?:\d{3})?)\s*(?:per\s*year|\/yr|\/year|annually|annual|yr)/i.exec(clean);
  if (singleYearly) {
    let amount = parseInt(singleYearly[1], 10);
    if (amount < 1000) amount *= 1000;
    if (amount >= 30000) {
      return { min: amount, max: amount, text: `$${amount.toLocaleString()}` };
    }
  }

  const hourlyRange = /\$(\d{2,3}(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$?(\d{2,3}(?:\.\d{2})?)\s*(?:per\s*hour|\/hr|\/hour|hourly)/i.exec(clean);
  if (hourlyRange) {
    const minH = parseFloat(hourlyRange[1]);
    const maxH = parseFloat(hourlyRange[2]);
    const min = Math.round(minH * 2080);
    const max = Math.round(maxH * 2080);
    return { min, max, text: `$${min.toLocaleString()} - $${max.toLocaleString()} ($${minH}-$${maxH}/hr)` };
  }

  const singleHourly = /\$(\d{2,3}(?:\.\d{2})?)\s*(?:per\s*hour|\/hr|\/hour|hourly)/i.exec(clean);
  if (singleHourly) {
    const rate = parseFloat(singleHourly[1]);
    const annual = Math.round(rate * 2080);
    return { min: annual, max: annual, text: `$${annual.toLocaleString()} ($${rate}/hr)` };
  }

  return null;
}

// ==============================================================================
// 3. Verification & 14-Day Maximum Age Retention Engine
// ==============================================================================

function isWithin14Days(dateStr) {
  if (!dateStr) return false;
  const posted = new Date(dateStr);
  if (isNaN(posted.getTime())) return false;
  const now = new Date();
  const diffDays = (now - posted) / (1000 * 60 * 60 * 24);
  return diffDays <= 14;
}

function isWithin30Days(dateStr) {
  if (!dateStr) return false;
  const posted = new Date(dateStr);
  if (isNaN(posted.getTime())) return false;
  const now = new Date();
  const diffDays = (now - posted) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

async function verifySingleJob(job) {
  if (!job || !job.url) return false;
  try {
    const res = await axios.get(job.url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 5,
      validateStatus: s => s < 400
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function verifyAndPruneJobs(jobs = []) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  return jobs.filter(job => isWithin14Days(job.date));
}

// ==============================================================================
// 4. Criteria & Role Guardrails
// ==============================================================================

const PREDEFINED_ROLES = [
  'Staff Engineer',
  'Technical Program Manager',
  'Staff Technical Program Manager',
  'Lead Technical Program Manager',
  'Website Operations',
  'Web Operations',
  'WebOps Manager',
  'Web Manager',
  'Website Manager',
  'Web Engineering Manager',
  'Forward Deploy Manager',
  'Forward Deployed Engineer',
  'Forward Deployed Software Engineer',
  'Release Manager',
  'Release Engineer',
  'Release Engineering Manager',
  'DevOps Manager',
  'DevOps Lead',
  'Director of DevOps',
  'DevOps Engineer',
  'Infrastructure Manager',
  'Site Reliability Manager',
  'Manager of IT',
  'IT Manager',
  'Director of IT',
  'Shopify Developer',
  'Shopify Engineer',
  'Shopify Manager',
  'WordPress Developer',
  'WordPress Engineer',
  'WordPress Manager',
  'CMS Manager'
];

const PREDEFINED_KEYWORDS = [
  'staff engineer', 'technical program manager', 'tpm',
  'web operations', 'website operations', 'webops', 'web manager',
  'forward deploy', 'forward deployed', 'release manager', 'release engineering',
  'devops manager', 'devops', 'site reliability', 'sre', 'infrastructure', 'it management',
  'shopify', 'shopify plus', 'wordpress', 'wordpress vip', 'woocommerce'
];

const EXCLUDED_ROLE_PATTERNS = [
  /\b(product manager|group product manager|principal product manager|director of product|vp of product|head of product|product owner|product marketing)\b/i,
  /\b(human resources|talent acquisition|recruiter|recruiting|people ops|people operations|people partner|talent partner|people lead|people specialist)\b/i,
  /\b(accounting|accountant|finance|financial analyst|controller|payroll|accounts payable|accounts receivable|audit|tax|billing)\b/i
];

function isExcludedRole(title = '', extra = '') {
  const combined = (title + ' ' + extra).toLowerCase();
  if (combined.includes('technical program manager') || combined.includes('tpm') || combined.includes('it program manager') || combined.includes('infrastructure program manager')) {
    return false;
  }
  return EXCLUDED_ROLE_PATTERNS.some(rx => rx.test(combined));
}

// ==============================================================================
// 5. ATS Company Rosters & Parsers (Greenhouse, Lever, Ashby, SmartRecruiters)
// ==============================================================================

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

async function scrapeGreenhouseCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });
    if (response.status !== 200 || !response.data || typeof response.data !== 'object') return [];

    const jobs = response.data.jobs || [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (isExcludedRole(job.title || '', job.content || '')) continue;
      const title = (job.title || '').toLowerCase();
      const content = (job.content || '').toLowerCase();
      const location = job.location ? job.location.name : 'Remote / Various';
      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(location, job.title, job.content || '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        const salary = extractSalaryFromText(job.content || '');
        matches.push({
          id: `gh-${company}-${job.id}`,
          source: `Greenhouse (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location: finalLocation,
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

async function scrapeLeverCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });
    if (response.status !== 200 || !Array.isArray(response.data)) return [];

    const jobs = response.data;
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      const description = (job.descriptionPlain || '') + ' ' + (job.additionalPlain || '');
      if (isExcludedRole(job.text || '', description)) continue;

      const title = (job.text || '').toLowerCase();
      const content = description.toLowerCase();
      const location = (job.categories && job.categories.location) ? job.categories.location : 'Remote / Various';
      const matchedTerm = searchTerms.find(term => title.includes(term) || content.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(location, job.text, description);
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        const salary = extractSalaryFromText(description);
        matches.push({
          id: `lever-${company}-${job.id}`,
          source: `Lever (${company.toUpperCase()})`,
          title: job.text,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location: finalLocation,
          workType,
          salary,
          url: job.hostedUrl || job.applyUrl,
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

async function scrapeAshbyCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
    const query = {
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: company },
      query: `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
          jobPostings {
            id
            title
            locationName
            employmentType
            secondaryLocations { locationName }
            publishedAt
          }
        }
      }`
    };

    const response = await axios.post(url, query, { headers: BROWSER_HEADERS, timeout: 6000 });
    const jobPostings = response.data?.data?.jobBoard?.jobPostings || [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobPostings) {
      if (isExcludedRole(job.title || '', '')) continue;
      const title = (job.title || '').toLowerCase();
      const location = job.locationName || 'Remote / Various';
      const matchedTerm = searchTerms.find(term => title.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(location, job.title, '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        matches.push({
          id: `ashby-${company}-${job.id}`,
          source: `Ashby (${company.toUpperCase()})`,
          title: job.title,
          company: company.charAt(0).toUpperCase() + company.slice(1),
          location: finalLocation,
          workType,
          salary: null,
          url: `https://jobs.ashbyhq.com/${company}/${job.id}`,
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

async function scrapeSmartRecruitersCompany(company, targetTitles = [], keywords = []) {
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${company}/postings`;
    const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 6000 });
    if (response.status !== 200 || !response.data || !Array.isArray(response.data.content)) return [];

    const jobs = response.data.content;
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (isExcludedRole(job.name || '', '')) continue;
      const title = (job.name || '').toLowerCase();
      const location = (job.location && job.location.city) ? `${job.location.city}, ${job.location.region || ''} ${job.location.country || ''}` : 'Remote / Various';
      const matchedTerm = searchTerms.find(term => title.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(location, job.name, '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        let salary = null;
        let postingUrl = `https://jobs.smartrecruiters.com/${company}/${job.id}`;

        try {
          const detailRes = await axios.get(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${job.id}`, { headers: BROWSER_HEADERS, timeout: 3000 });
          if (detailRes.data && detailRes.data.jobAd && detailRes.data.jobAd.sections) {
            const sections = detailRes.data.jobAd.sections;
            const fullDesc = Object.values(sections).map(s => s.text || '').join(' ');
            salary = extractSalaryFromText(fullDesc);
          }
          if (detailRes.data && detailRes.data.applyUrl) {
            postingUrl = detailRes.data.applyUrl;
          }
        } catch (e) {}

        matches.push({
          id: `sr-${company}-${job.id}`,
          source: `SmartRecruiters (${company.toUpperCase()})`,
          title: job.name,
          company: (job.company && job.company.name) ? job.company.name : (company.charAt(0).toUpperCase() + company.slice(1)),
          location: finalLocation,
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

// ==============================================================================
// 6. Public Tech Feeds (RemoteOK, WeWorkRemotely, Remotive, Jobicy)
// ==============================================================================

async function scrapeRemoteOK(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Scrapedeez-HourlyVerifier/1.29.0' },
      timeout: 8000
    });
    const data = response.data;
    if (!Array.isArray(data)) return [];

    const jobs = data.slice(1);
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (isExcludedRole(job.position || '', job.description || '')) continue;
      const title = (job.position || '').toLowerCase();
      const tags = (job.tags || []).map(t => t.toLowerCase());
      const desc = (job.description || '').toLowerCase();
      const matchedTerm = searchTerms.find(term => title.includes(term) || tags.some(tag => tag.includes(term)) || desc.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(job.location || 'Remote', job.position, job.description || '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        let salary = null;
        if (job.salary_min && job.salary_max) {
          salary = { min: job.salary_min, max: job.salary_max, text: `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` };
        } else {
          salary = extractSalaryFromText(job.description || '');
        }

        matches.push({
          id: `rok-${job.id}`,
          source: 'RemoteOK',
          title: job.position,
          company: job.company || 'Unknown',
          location: finalLocation,
          workType,
          salary,
          url: job.url,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.date ? new Date(job.date).toISOString() : new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

async function scrapeWeWorkRemotely(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const feeds = [
      'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
      'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss'
    ];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const feedUrl of feeds) {
      try {
        const res = await axios.get(feedUrl, { headers: { 'User-Agent': 'Scrapedeez-HourlyVerifier/1.29.0' }, timeout: 8000 });
        const xml = res.data;
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
          const itemContent = match[1];
          const rawTitle = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(itemContent) || /<title>(.*?)<\/title>/i.exec(itemContent) || [])[1] || '';
          const link = (/<link>(.*?)<\/link>/i.exec(itemContent) || [])[1] || '';
          const pubDate = (/<pubDate>(.*?)<\/pubDate>/i.exec(itemContent) || [])[1] || '';
          const description = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i.exec(itemContent) || /<description>([\s\S]*?)<\/description>/i.exec(itemContent) || [])[1] || '';

          if (isExcludedRole(rawTitle, description)) continue;

          let company = 'Unknown';
          let roleTitle = rawTitle;
          if (rawTitle.includes(':')) {
            const parts = rawTitle.split(':');
            company = parts[0].trim();
            roleTitle = parts.slice(1).join(':').trim();
          }

          const combined = (roleTitle + ' ' + description).toLowerCase();
          const matchedTerm = searchTerms.find(term => combined.includes(term));

          if (matchedTerm || searchTerms.length === 0) {
            const { location: finalLocation, workType } = detectLocationAndWorkType('Remote', roleTitle, description);
            if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

            const salary = extractSalaryFromText(description);
            const guid = (/<guid.*?>(.*?)<\/guid>/i.exec(itemContent) || [])[1] || link;
            matches.push({
              id: `wwr-${Buffer.from(guid).toString('base64').substring(0, 16)}`,
              source: 'WeWorkRemotely',
              title: roleTitle,
              company,
              location: finalLocation,
              workType,
              salary,
              url: link,
              matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
              date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
            });
          }
        }
      } catch (err) {}
    }
    return matches;
  } catch (err) {
    return [];
  }
}

async function scrapeRemotive(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const res = await axios.get('https://remotive.com/api/remote-jobs?category=devops-sysadmin', {
      headers: { 'User-Agent': 'Scrapedeez-HourlyVerifier/1.29.0' },
      timeout: 8000
    });
    const jobs = res.data?.jobs || [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (isExcludedRole(job.title || '', job.description || '')) continue;
      const title = (job.title || '').toLowerCase();
      const desc = (job.description || '').toLowerCase();
      const matchedTerm = searchTerms.find(term => title.includes(term) || desc.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(job.candidate_required_location || 'Remote', job.title, job.description || '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        const salary = job.salary ? extractSalaryFromText(job.salary) || { text: job.salary } : extractSalaryFromText(job.description || '');
        matches.push({
          id: `remotive-${job.id}`,
          source: 'Remotive',
          title: job.title,
          company: job.company_name || 'Unknown',
          location: finalLocation,
          workType,
          salary,
          url: job.url,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.publication_date ? new Date(job.publication_date).toISOString() : new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

async function scrapeJobicy(targetTitles = PREDEFINED_ROLES, keywords = PREDEFINED_KEYWORDS) {
  try {
    const res = await axios.get('https://jobicy.com/api/v2/remote-jobs?count=50&geo=usa', {
      headers: { 'User-Agent': 'Scrapedeez-HourlyVerifier/1.29.0' },
      timeout: 8000
    });
    const jobs = res.data?.jobs || [];
    const searchTerms = [...targetTitles, ...keywords].map(t => t.toLowerCase().trim()).filter(Boolean);
    const matches = [];

    for (const job of jobs) {
      if (isExcludedRole(job.jobTitle || '', job.jobDescription || '')) continue;
      const title = (job.jobTitle || '').toLowerCase();
      const desc = (job.jobDescription || '').toLowerCase();
      const matchedTerm = searchTerms.find(term => title.includes(term) || desc.includes(term));

      if (matchedTerm || searchTerms.length === 0) {
        const { location: finalLocation, workType } = detectLocationAndWorkType(job.jobGeo || 'Remote / US', job.jobTitle, job.jobDescription || '');
        if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') continue;

        const salary = (job.annualSalaryMin && job.annualSalaryMax)
          ? { min: parseInt(job.annualSalaryMin, 10), max: parseInt(job.annualSalaryMax, 10), text: `$${parseInt(job.annualSalaryMin, 10).toLocaleString()} - $${parseInt(job.annualSalaryMax, 10).toLocaleString()}` }
          : extractSalaryFromText(job.jobDescription || '');

        matches.push({
          id: `jobicy-${job.id}`,
          source: 'Jobicy',
          title: job.jobTitle,
          company: job.companyName || 'Unknown',
          location: finalLocation,
          workType,
          salary,
          url: job.url,
          matchedKeyword: matchedTerm ? matchedTerm.toUpperCase() : 'USER MATCH',
          date: job.pubDate ? new Date(job.pubDate).toISOString() : new Date().toISOString()
        });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
}

// ==============================================================================
// 7. Master Pipeline Orchestrator & Multi-Source Re-Verification
// ==============================================================================

async function runScraperJob(customGreenhouse = [], customLever = [], customTitles = [], customKeywords = [], customAshby = [], customSmartRecruiters = []) {
  console.log('[Scrapedeez] Launching Pipeline for Active Criteria (< 14 days old, 2 weeks max)...');

  const ROOT_DIR = path.join(__dirname, '..');
  let cfg = {};
  const configPath = path.join(ROOT_DIR, 'dta', 'config.json');
  if (fs.existsSync(configPath)) {
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
  }

  const greenhouseCompanies = customGreenhouse.length > 0 ? customGreenhouse : (cfg.greenhouseCompanies || []);
  const leverCompanies = customLever.length > 0 ? customLever : (cfg.leverCompanies || []);
  const ashbyCompanies = customAshby.length > 0 ? customAshby : (cfg.ashbyCompanies || []);
  const smartRecruitersCompanies = customSmartRecruiters.length > 0 ? customSmartRecruiters : (cfg.smartRecruitersCompanies || []);
  const targetTitles = customTitles.length > 0 ? customTitles : (cfg.targetTitles || PREDEFINED_ROLES);
  const keywords = customKeywords.length > 0 ? customKeywords : (cfg.keywords || PREDEFINED_KEYWORDS);

  const dataPath = path.join(ROOT_DIR, 'dta', 'jobs_data.json');
  let existingStore = { jobs: [] };
  if (fs.existsSync(dataPath)) {
    try { existingStore = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) {}
  }

  const verifiedExistingJobs = await verifyAndPruneJobs(existingStore.jobs || []);

  const [remoteOkJobs, wwrJobs, remotiveJobs, jobicyJobs, atsJobs] = await Promise.all([
    scrapeRemoteOK(targetTitles, keywords).catch(() => []),
    scrapeWeWorkRemotely(targetTitles, keywords).catch(() => []),
    scrapeRemotive(targetTitles, keywords).catch(() => []),
    scrapeJobicy(targetTitles, keywords).catch(() => []),
    scrapeAllATSCompanies(greenhouseCompanies, leverCompanies, targetTitles, keywords, ashbyCompanies, smartRecruitersCompanies).catch(() => [])
  ]);

  const newlyScraped = [...atsJobs, ...remoteOkJobs, ...wwrJobs, ...remotiveJobs, ...jobicyJobs].filter(j => isWithin30Days(j.date));

  const mergedJobs = [];
  const seenUrls = new Set();

  for (const job of [...newlyScraped, ...verifiedExistingJobs]) {
    const key = (job.title + '|' + job.company).toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);

    if (job.title && isExcludedRole(job.title, (job.company || '') + ' ' + (job.matchedKeyword || ''))) {
      continue;
    }

    const { location: finalLocation, workType } = detectLocationAndWorkType(job.location, job.title, job.description || job.content || '');
    if (workType.toLowerCase().includes('onsite') || workType.toLowerCase() === 'on-site') {
      continue;
    }

    let parsedSalary = job.salary;
    if (!parsedSalary && (job.description || job.content)) {
      parsedSalary = extractSalaryFromText(job.description || job.content);
    }

    mergedJobs.push({
      id: job.id,
      source: job.source,
      title: job.title,
      company: job.company,
      location: finalLocation,
      workType,
      salary: parsedSalary || null,
      url: job.url,
      matchedKeyword: job.matchedKeyword,
      date: job.date,
      isNew: !verifiedExistingJobs.some(ej => (ej.title + '|' + ej.company).toLowerCase() === key)
    });
  }

  const finalVerifiedJobs = await verifyAndPruneJobs(mergedJobs);

  finalVerifiedJobs.sort((a, b) => new Date(b.date) - new Date(a.date));

  const outputPayload = {
    lastScraped: new Date().toISOString(),
    totalMatches: finalVerifiedJobs.length,
    maxAgeDays: 14,
    targetCriteria: targetTitles,
    keywords,
    jobs: finalVerifiedJobs
  };

  fs.writeFileSync(dataPath, JSON.stringify(outputPayload, null, 2));
  console.log(`[Scrapedeez] Scrape Pipeline Finished. Preserved ${finalVerifiedJobs.length} verified listings (< 14 days old).`);
  return finalVerifiedJobs;
}

if (require.main === module) {
  runScraperJob().catch(err => {
    console.error('[Scrapedeez] Scraper execution error:', err);
    process.exit(1);
  });
}

module.exports = {
  runScraperJob,
  scrapeRemotive,
  scrapeJobicy,
  scrapeRemoteOK,
  scrapeWeWorkRemotely,
  scrapeAllATSCompanies,
  scrapeGreenhouseCompany,
  scrapeLeverCompany,
  scrapeAshbyCompany,
  scrapeSmartRecruitersCompany,
  calculateDistanceMiles,
  classifyWorkType,
  detectLocationAndWorkType,
  extractSalaryFromText,
  isWithin14Days,
  isWithin30Days,
  verifySingleJob,
  verifyAndPruneJobs,
  PREDEFINED_ROLES,
  PREDEFINED_KEYWORDS
};
