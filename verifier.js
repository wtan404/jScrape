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

    // Check if body contains explicit job closure text
    const isClosed = EXPIRED_MARKERS.some(marker => html.includes(marker));
    if (isClosed) {
      console.log(`[Verifier] Job URL expired/closed: ${jobUrl}`);
      return false;
    }

    return true;
  } catch (err) {
    // HTTP 404, 410, or network error = expired/removed job
    if (err.response && (err.response.status === 404 || err.response.status === 410)) {
      console.log(`[Verifier] Pruning dead job URL (${err.response.status}): ${jobUrl}`);
      return false;
    }
    // Network timeouts stay true to prevent false prunes on soft glitches
    return true;
  }
}

// Verify a batch of existing jobs and return only active ones
async function verifyAndPruneJobs(existingJobs = []) {
  if (!existingJobs.length) return [];

  console.log(`[Verifier] Re-verifying ${existingJobs.length} existing jobs for link availability...`);
  
  const verificationResults = await Promise.all(
    existingJobs.map(async job => {
      const isStillAvailable = await verifyJobLink(job.url);
      return isStillAvailable ? job : null;
    })
  );

  const activeJobs = verificationResults.filter(Boolean);
  const prunedCount = existingJobs.length - activeJobs.length;

  if (prunedCount > 0) {
    console.log(`[Verifier] Auto-pruned ${prunedCount} closed/expired job postings.`);
  } else {
    console.log(`[Verifier] All ${existingJobs.length} existing jobs verified active.`);
  }

  return activeJobs;
}

module.exports = { verifyJobLink, verifyAndPruneJobs };
