const axios = require('axios');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const EXPIRED_MARKERS = [
  'job expired',
  'position closed',
  'no longer accepting applications',
  'this job has been filled',
  '404 page not found',
  'posting expired',
  'job not found'
];

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (2 weeks max retention)

// Check if date is within 14 days (2 weeks max)
function isWithin14Days(dateStr) {
  if (!dateStr) return true; // Keep if unknown date to avoid accidental loss
  const jobDate = new Date(dateStr);
  if (isNaN(jobDate.getTime())) return true;
  return (Date.now() - jobDate.getTime()) <= FOURTEEN_DAYS_MS;
}

// Backward-compatible alias
const isWithin30Days = isWithin14Days;

// Verify if a single job posting URL is still active
async function verifyJobLink(jobUrl) {
  if (!jobUrl || typeof jobUrl !== 'string') return false;

  try {
    const response = await axios.get(jobUrl, {
      headers: BROWSER_HEADERS,
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400
    });

    const html = (typeof response.data === 'string' ? response.data : '').toLowerCase();

    const isClosed = EXPIRED_MARKERS.some(marker => html.includes(marker));
    if (isClosed) {
      console.log(`[Verifier] Job URL expired/closed: ${jobUrl}`);
      return false;
    }

    return true;
  } catch (err) {
    if (err.response && (err.response.status === 404 || err.response.status === 410)) {
      console.log(`[Verifier] Pruning dead job URL (${err.response.status}): ${jobUrl}`);
      return false;
    }
    return true;
  }
}

// Verify a batch of existing jobs: Prunes dead links AND jobs older than 14 days (2 weeks max)
async function verifyAndPruneJobs(existingJobs = []) {
  if (!existingJobs.length) return [];

  console.log(`[Verifier] Re-verifying ${existingJobs.length} existing jobs (pruning dead links & postings > 14 days old)...`);
  
  // 1. Filter out jobs older than 14 days
  const recentJobs = existingJobs.filter(job => isWithin14Days(job.date));
  const agePrunedCount = existingJobs.length - recentJobs.length;

  if (agePrunedCount > 0) {
    console.log(`[Verifier] Auto-pruned ${agePrunedCount} jobs older than 14 days.`);
  }

  // 2. Verify link availability
  const verificationResults = await Promise.all(
    recentJobs.map(async job => {
      const isStillAvailable = await verifyJobLink(job.url);
      return isStillAvailable ? job : null;
    })
  );

  const activeJobs = verificationResults.filter(Boolean);
  return activeJobs;
}

module.exports = { verifyJobLink, verifyAndPruneJobs, isWithin14Days, isWithin30Days };
