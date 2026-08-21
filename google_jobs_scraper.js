const axios = require('axios');

async function scrapeGoogleJobs(apiKey = process.env.SERPAPI_KEY, targetTitles = ['IT Manager', 'DevOps Manager']) {
  // Ignore empty, undefined, or dummy placeholder keys
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '' || apiKey === 'your_serpapi_key_here' || apiKey.length < 15) {
    return [];
  }

  const cleanKey = apiKey.trim();
  const queries = targetTitles.length > 0 ? targetTitles.slice(0, 3) : ['IT Manager', 'DevOps Manager'];
  const allJobs = [];

  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_jobs',
          q: query,
          hl: 'en',
          gl: 'us',
          api_key: cleanKey
        },
        timeout: 8000
      });

      // Check if SerpAPI returned an error object
      if (response.data && response.data.error) {
        console.warn(`[Google Jobs Scraper] SerpAPI notice: ${response.data.error}`);
        break;
      }

      const jobs = response.data.jobs_results || [];
      for (const job of jobs) {
        allJobs.push({
          id: `gjobs-${job.job_id || Math.random().toString(36).substring(7)}`,
          source: `Google Jobs (${job.via || 'Aggregated'})`,
          title: job.title || query,
          company: job.company_name || 'Enterprise Client',
          location: job.location || 'Remote / US',
          url: job.share_link || (job.related_links && job.related_links[0] ? job.related_links[0].link : 'https://google.com'),
          matchedKeyword: query.toUpperCase(),
          date: job.detected_extensions && job.detected_extensions.posted_at ? job.detected_extensions.posted_at : new Date().toISOString()
        });
      }
    } catch (err) {
      // Catch 401 / Invalid key errors gracefully without interrupting ATS scrape
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        console.warn('[Google Jobs Scraper] SerpAPI Key is invalid or expired. Skipping Google Jobs query.');
        break;
      }
    }
  }

  return allJobs;
}

module.exports = { scrapeGoogleJobs };
