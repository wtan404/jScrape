const axios = require('axios');

async function scrapeGoogleJobs(apiKey = process.env.SERPAPI_KEY) {
  if (!apiKey || apiKey === 'your_serpapi_key_here') {
    console.log('[Google Jobs Scraper] No SERPAPI_KEY configured. Returning live SerpAPI integration setup guide.');
    return [];
  }

  const queries = [
    'Manager of IT web operations',
    'IT Manager web development',
    'DevOps Manager'
  ];

  const allJobs = [];

  for (const query of queries) {
    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_jobs',
          q: query,
          hl: 'en',
          gl: 'us',
          api_key: apiKey
        },
        timeout: 10000
      });

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
      console.error(`[Google Jobs Scraper] SerpAPI search failed for query "${query}":`, err.message);
    }
  }

  return allJobs;
}

module.exports = { scrapeGoogleJobs };
