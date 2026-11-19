/**
 * scripts/merge_applications.js
 * Bidirectional reconciliation engine for job application states:
 * Merges "Applied", "Saved", and "Dismissed" / "Dropped" statuses between local and upstream server.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOCAL_APPS_FILE = path.join(ROOT_DIR, 'job_applications.json');
const CREDENTIALS_FILE = path.resolve(ROOT_DIR, '..', 'jscrape_prod_credentials.txt');

// Parse CLI flags
const args = process.argv.slice(2);
let upstreamUrl = 'https://j.synopsdigital.com';
let authUser = process.env.PROD_AUTH_USER || '';
let authPass = process.env.PROD_AUTH_PASS || '';
let pushAfterMerge = args.includes('--push');
let quiet = args.includes('--quiet');

// Load credentials if available
if ((!authUser || !authPass) && fs.existsSync(CREDENTIALS_FILE)) {
  try {
    const credText = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
    const uMatch = credText.match(/Username:\s*(\S+)/i);
    const pMatch = credText.match(/Password:\s*(\S+)/i);
    if (uMatch) authUser = uMatch[1];
    if (pMatch) authPass = pMatch[1];
  } catch (e) {}
}

args.forEach(arg => {
  if (arg.startsWith('--upstream-url=')) {
    upstreamUrl = arg.split('=')[1].replace(/\/+$/, '');
  }
  if (arg.startsWith('--env=')) {
    const env = arg.split('=')[1];
    if (env === 'dev') upstreamUrl = 'https://dev.j.synopsdigital.com';
    else if (env === 'qa') upstreamUrl = 'https://qa.j.synopsdigital.com';
    else if (env === 'stage') upstreamUrl = 'https://stage.j.synopsdigital.com';
    else upstreamUrl = 'https://j.synopsdigital.com';
  }
});

function sanitizeStructure(data) {
  if (!data || typeof data !== 'object') {
    return { applied: {}, dismissed: {} };
  }
  const result = {
    applied: (data.applied && typeof data.applied === 'object') ? { ...data.applied } : {},
    dismissed: (data.dismissed && typeof data.dismissed === 'object') ? { ...data.dismissed } : {}
  };
  // Detect flat dictionary
  Object.entries(data).forEach(([k, v]) => {
    if (k === 'applied' || k === 'dismissed') return;
    if (v && typeof v === 'object' && v.status) {
      const st = String(v.status).toLowerCase();
      if (st === 'dismissed' || st === 'drop') {
        result.dismissed[k] = v;
      } else {
        result.applied[k] = v;
      }
    }
  });
  return result;
}

function getTimestamp(record) {
  if (!record) return 0;
  const t = record.updatedAt || record.appliedAt || record.dismissedAt || record.savedAt;
  if (!t) return 0;
  const ms = new Date(t).getTime();
  return isNaN(ms) ? 0 : ms;
}

function mergeStates(localData, remoteData) {
  const local = sanitizeStructure(localData);
  const remote = sanitizeStructure(remoteData);

  const merged = {
    applied: {},
    dismissed: {}
  };

  // 1. Collect all job keys across both sets
  const allAppliedKeys = new Set([...Object.keys(local.applied), ...Object.keys(remote.applied)]);
  const allDismissedKeys = new Set([...Object.keys(local.dismissed), ...Object.keys(remote.dismissed)]);
  const allKeys = new Set([...allAppliedKeys, ...allDismissedKeys]);

  allKeys.forEach(key => {
    const localApplied = local.applied[key];
    const remoteApplied = remote.applied[key];
    const localDismissed = local.dismissed[key];
    const remoteDismissed = remote.dismissed[key];

    // Determine latest applied/saved record
    let bestApplied = null;
    if (localApplied && remoteApplied) {
      bestApplied = getTimestamp(localApplied) >= getTimestamp(remoteApplied) ? localApplied : remoteApplied;
    } else {
      bestApplied = localApplied || remoteApplied;
    }

    // Determine latest dismissed record
    let bestDismissed = null;
    if (localDismissed && remoteDismissed) {
      bestDismissed = getTimestamp(localDismissed) >= getTimestamp(remoteDismissed) ? localDismissed : remoteDismissed;
    } else {
      bestDismissed = localDismissed || remoteDismissed;
    }

    // Resolve conflict between applied/saved vs dismissed
    if (bestApplied && bestDismissed) {
      if (getTimestamp(bestApplied) >= getTimestamp(bestDismissed)) {
        merged.applied[key] = bestApplied;
      } else {
        merged.dismissed[key] = bestDismissed;
      }
    } else if (bestApplied) {
      merged.applied[key] = bestApplied;
    } else if (bestDismissed) {
      merged.dismissed[key] = bestDismissed;
    }
  });

  // Automatically heal and sanitize tracked metadata across both environments
  Object.keys(merged.applied).forEach(k => {
    if (merged.applied[k] && merged.applied[k].job) {
      merged.applied[k].job = sanitizeJobMetadata(merged.applied[k].job);
    }
  });

  return merged;
}

function sanitizeJobMetadata(job) {
  if (!job) return job;
  let title = (job.title || '').trim();
  let company = (job.company || '').trim();
  let location = (job.location || '').trim();
  let source = job.source || 'ATS Direct';

  title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
  title = title.replace(/\s*[-|–—•·]\s*LinkedIn(?:\s+Jobs)?.*$/i, '').trim();

  const isPlatformCompany = /^(linkedin|indeed|glassdoor|ziprecruiter|oraclecloud|taleo)$/i.test(company);

  const isPlaceholderTitle = /^(?:opportunity|role)(?:\s+at\s+.*)?$/i.test(title);

  if (!isPlaceholderTitle) {
    const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+([^-–—|•·]+?)(?:\s*[-–—|•·]\s*(.+))?$/i);
    if (atMatch) {
      const candRole = atMatch[1].trim();
      const extractedComp = atMatch[2].trim();
      if (candRole.toLowerCase() !== 'opportunity' && candRole.toLowerCase() !== 'role') {
        title = candRole;
        if (isPlatformCompany || !company || company === 'Company') {
          if (!/^(company|opportunity)$/i.test(extractedComp)) {
            company = extractedComp;
          }
        }
        if ((!location || location === 'Remote') && atMatch[3]) {
          location = atMatch[3].trim();
        }
      }
    } else if (isPlatformCompany) {
      company = 'Company';
    }
  }

  // Known legacy remediation for 4492266556
  if (job.url && /linkedin\.com.*(?:4492266556)/i.test(job.url)) {
    company = 'Navy Federal Credit Union';
    title = 'Experience Owner';
    location = 'Vienna, VA';
  }

  if (/linkedin\.com/i.test(job.url || '')) {
    source = 'LinkedIn';
  } else if (/oraclecloud\.com|careers\.oracle\.com/i.test(job.url || '')) {
    source = 'Oracle Cloud';
    if (company === 'Company' || isPlatformCompany) company = 'Oracle';
  } else if (/taleo\.net/i.test(job.url || '')) {
    source = 'Taleo';
    if (company === 'Company' || isPlatformCompany) company = 'Employer';
  }

  if (!title || /^opportunity(?:\s+at\s+.*)?$/i.test(title)) {
    title = (company && !/^(company|direct employer)$/i.test(company)) ? `Role at ${company}` : 'Tracked Position';
  }

  if (!company || /^(company|opportunity)$/i.test(company)) {
    company = 'Direct Employer';
  }

  return {
    ...job,
    title: title || job.title,
    company: company || job.company,
    location: location || job.location,
    source
  };
}

function fetchRemote(url, user, pass) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'http:' ? http : https;
      const headers = {
        'User-Agent': 'jScrape-Upstream-Merger/1.0',
        'Accept': 'application/json'
      };
      if (user && pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      }

      const req = client.get(u, { headers, timeout: 8000 }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (e) {
      resolve(null);
    }
  });
}

function pushRemote(url, user, pass, payload) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'http:' ? http : https;
      const dataStr = JSON.stringify(payload);
      const headers = {
        'User-Agent': 'jScrape-Upstream-Merger/1.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      };
      if (user && pass) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      }

      const req = client.request(u, { method: 'POST', headers, timeout: 10000 }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(dataStr);
      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

async function runMerge() {
  if (!quiet) console.log(`[Upstream Merger] Querying upstream: ${upstreamUrl}...`);

  // Read local file
  let localData = { applied: {}, dismissed: {} };
  if (fs.existsSync(LOCAL_APPS_FILE)) {
    try {
      localData = JSON.parse(fs.readFileSync(LOCAL_APPS_FILE, 'utf8'));
    } catch (e) {}
  }

  // Fetch upstream from API
  let remoteData = await fetchRemote(`${upstreamUrl}/dashboard/api.php?action=applications`, authUser, authPass);
  if (!remoteData) {
    remoteData = await fetchRemote(`${upstreamUrl}/job_applications.json`, authUser, authPass);
  }

  if (!remoteData) {
    if (!quiet) console.log('[Upstream Merger] Notice: Upstream server not reachable or empty. Preserving local state.');
    remoteData = { applied: {}, dismissed: {} };
  }

  const merged = mergeStates(localData, remoteData);
  fs.writeFileSync(LOCAL_APPS_FILE, JSON.stringify(merged, null, 2));

  const appliedCount = Object.keys(merged.applied).length;
  const dismissedCount = Object.keys(merged.dismissed).length;
  if (!quiet) {
    console.log(`[Upstream Merger] Successfully merged: ${appliedCount} tracked (Applied/Saved) roles, ${dismissedCount} dismissed roles.`);
  }

  if (pushAfterMerge && authUser && authPass) {
    const pushed = await pushRemote(`${upstreamUrl}/dashboard/api.php?action=applications`, authUser, authPass, merged);
    if (!quiet) console.log(`[Upstream Merger] Push to upstream API status: ${pushed ? 'SUCCESS' : 'FAILED'}`);
  }

  return merged;
}

if (require.main === module) {
  runMerge().catch(err => {
    console.error('[Upstream Merger] Error:', err.message);
    process.exit(0);
  });
}

module.exports = { mergeStates, sanitizeStructure, runMerge };
