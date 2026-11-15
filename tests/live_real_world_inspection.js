/**
 * jScrape — Real-World Live ATS Schema Introspection Probe
 * Probes live Greenhouse (Figma, Cloudflare) and Lever (Palantir) endpoints
 */

const axios = require('axios');
const { resolveFieldAnswer, readProfile } = require('../submission_engine');

async function probeLiveAts() {
  const profile = readProfile();

  console.log('================================================================================');
  console.log('🌐 REAL-WORLD ATS LIVE PROBE & SCHEMA INTROSPECTION');
  console.log('================================================================================\n');

  // 1. FIGMA (Greenhouse)
  console.log('--------------------------------------------------------------------------------');
  console.log('🏢 PROBE 1: FIGMA (via Greenhouse Boards API)');
  console.log('URL: https://boards-api.greenhouse.io/v1/boards/figma/jobs/5707966004?questions=true');
  console.log('--------------------------------------------------------------------------------');

  try {
    const res = await axios.get('https://boards-api.greenhouse.io/v1/boards/figma/jobs/5707966004?questions=true', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    console.log(`HTTP Status: ${res.status} OK`);
    console.log(`Job Title  : ${res.data.title}`);
    console.log(`Updated At : ${res.data.updated_at}`);
    console.log(`Total Live Questions: ${res.data.questions.length}\n`);

    console.log('Dynamic Resolution against Figma questions:');
    res.data.questions.forEach((q, i) => {
      const options = (q.values || []).map(v => (typeof v === 'object' ? (v.label || v.value) : v));
      const resolved = resolveFieldAnswer(q.label, q.type, options, profile);
      const req = q.required ? '[REQUIRED]' : '[OPTIONAL]';
      const cleanAns = typeof resolved === 'string' && resolved.length > 45 ? resolved.substring(0, 42) + '...' : resolved;
      console.log(`  ${String(i + 1).padStart(2)}. ${req} "${q.label}"`);
      console.log(`      ↳ Resolved Answer: "${cleanAns || '(standard field)'}"`);
    });
  } catch (e) {
    console.log('Figma probe error:', e.response ? e.response.status : e.message);
  }

  // 2. CLOUDFLARE (Greenhouse)
  console.log('\n--------------------------------------------------------------------------------');
  console.log('🏢 PROBE 2: CLOUDFLARE (via Greenhouse Boards API)');
  console.log('URL: https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/7695702?questions=true');
  console.log('--------------------------------------------------------------------------------');

  try {
    const res = await axios.get('https://boards-api.greenhouse.io/v1/boards/cloudflare/jobs/7695702?questions=true', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    console.log(`HTTP Status: ${res.status} OK`);
    console.log(`Job Title  : ${res.data.title}`);
    console.log(`Total Live Questions: ${res.data.questions.length}\n`);

    console.log('Dynamic Resolution against Cloudflare questions:');
    res.data.questions.forEach((q, i) => {
      const options = (q.values || []).map(v => (typeof v === 'object' ? (v.label || v.value) : v));
      const resolved = resolveFieldAnswer(q.label, q.type, options, profile);
      const req = q.required ? '[REQUIRED]' : '[OPTIONAL]';
      const cleanAns = typeof resolved === 'string' && resolved.length > 45 ? resolved.substring(0, 42) + '...' : resolved;
      console.log(`  ${String(i + 1).padStart(2)}. ${req} "${q.label}"`);
      console.log(`      ↳ Resolved Answer: "${cleanAns || '(standard field)'}"`);
    });
  } catch (e) {
    console.log('Cloudflare probe error:', e.response ? e.response.status : e.message);
  }

  // 3. PALANTIR (Lever)
  console.log('\n--------------------------------------------------------------------------------');
  console.log('🏢 PROBE 3: PALANTIR (via Lever Postings API)');
  console.log('URL: https://api.lever.co/v0/postings/palantir/51ea4a3b-7764-4c87-96e4-310e19c856d5');
  console.log('--------------------------------------------------------------------------------');

  try {
    const res = await axios.get('https://api.lever.co/v0/postings/palantir/51ea4a3b-7764-4c87-96e4-310e19c856d5', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    console.log(`HTTP Status: ${res.status} OK`);
    console.log(`Job Title  : ${res.data.text}`);
    console.log(`Location   : ${res.data.categories?.location}`);
    console.log(`Commitment : ${res.data.categories?.commitment}`);
    console.log(`Custom Questions Count: ${(res.data.customQuestions || []).length}`);
  } catch (e) {
    console.log('Palantir probe error:', e.response ? e.response.status : e.message);
  }

  console.log('\n================================================================================');
  console.log('🏁 REAL-WORLD PROBE COMPLETED');
  console.log('================================================================================');
}

probeLiveAts().catch(console.error);
