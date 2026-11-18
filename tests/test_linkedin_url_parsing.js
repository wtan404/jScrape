const assert = require('assert');

// 1. Test LinkedIn Compound Title regex decomposition
function deconstructTitle(rawTitle, rawCompany = '', rawLocation = '') {
  let detectedTitle = (rawTitle || '').replace(/\s*[-|–—•·]\s*LinkedIn.*$/i, '').trim();
  let detectedCompany = rawCompany;
  let detectedLocation = rawLocation;

  const atMatch = detectedTitle.match(/^(.+?)\s+(?:at|@)\s+([^-–—|•·]+?)(?:\s*[-–—|•·]\s*(.+))?$/i);
  if (atMatch) {
    detectedTitle = atMatch[1].trim();
    const extractedComp = atMatch[2].trim();
    if (!detectedCompany || /^(linkedin|indeed|glassdoor|ziprecruiter|company)$/i.test(detectedCompany.trim())) {
      detectedCompany = extractedComp;
    }
    if ((!detectedLocation || detectedLocation === 'Remote') && atMatch[3]) {
      detectedLocation = atMatch[3].trim();
    }
  }

  return { title: detectedTitle, company: detectedCompany, location: detectedLocation };
}

// 2. Test URL Slug parser
function parseLinkedInSlug(targetUrl) {
  let title = '';
  let company = '';
  try {
    const u = new URL(targetUrl);
    const pathParts = u.pathname.split('/').filter(Boolean);
    const viewIdx = pathParts.indexOf('view');
    if (viewIdx !== -1 && pathParts[viewIdx + 1]) {
      const slug = pathParts[viewIdx + 1].replace(/-[0-9]{6,}$/, '');
      if (slug.includes('-at-')) {
        const [roleSlug, companySlug] = slug.split('-at-');
        if (roleSlug) {
          title = roleSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        if (companySlug) {
          company = companySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
    }
  } catch (e) {}
  return { title, company };
}

// 3. Test Sanitize Job Metadata
function sanitizeJobMetadata(job) {
  if (!job) return job;
  let title = (job.title || '').trim();
  let company = (job.company || '').trim();
  let location = (job.location || '').trim();
  let source = job.source || 'ATS Direct';

  title = title.replace(/\s*[-|–—•·]\s*LinkedIn.*$/i, '').trim();
  const isPlatformCompany = /^(linkedin|indeed|glassdoor|ziprecruiter)$/i.test(company);

  const atMatch = title.match(/^(.+?)\s+(?:at|@)\s+([^-–—|•·]+?)(?:\s*[-–—|•·]\s*(.+))?$/i);
  if (atMatch) {
    title = atMatch[1].trim();
    const extractedComp = atMatch[2].trim();
    if (isPlatformCompany || !company || company === 'Company') {
      company = extractedComp;
    }
    if ((!location || location === 'Remote') && atMatch[3]) {
      location = atMatch[3].trim();
    }
  } else if (isPlatformCompany) {
    company = 'Company';
  }

  if ((!company || company === 'Company' || isPlatformCompany) && job.url && /linkedin\.com/i.test(job.url)) {
    const slugRes = parseLinkedInSlug(job.url);
    if ((!title || title.startsWith('Opportunity at')) && slugRes.title) title = slugRes.title;
    if (slugRes.company) company = slugRes.company;
  }

  if (/linkedin\.com/i.test(job.url || '')) {
    source = 'LinkedIn';
  }

  return {
    ...job,
    title: title || job.title,
    company: company || job.company,
    location: location || job.location,
    source
  };
}

console.log('--- Running LinkedIn Parsing Verification Tests ---');

// Test Suite 1: Compound Titles
const t1 = deconstructTitle('Staff Technical Program Manager at Stripe - San Francisco, CA', 'LinkedIn');
assert.strictEqual(t1.title, 'Staff Technical Program Manager');
assert.strictEqual(t1.company, 'Stripe');
assert.strictEqual(t1.location, 'San Francisco, CA');
console.log('✅ Test 1 Passed: Compound title with location successfully separated.');

const t2 = deconstructTitle('Software Engineer at Datadog | LinkedIn', 'LinkedIn');
assert.strictEqual(t2.title, 'Software Engineer');
assert.strictEqual(t2.company, 'Datadog');
console.log('✅ Test 2 Passed: Platform branding suffix stripped, company preserved.');

const t3 = deconstructTitle('Lead DevOps Engineer at Roblox - San Mateo, CA (Hybrid)', '');
assert.strictEqual(t3.title, 'Lead DevOps Engineer');
assert.strictEqual(t3.company, 'Roblox');
assert.strictEqual(t3.location, 'San Mateo, CA (Hybrid)');
console.log('✅ Test 3 Passed: Title without preset company successfully resolved.');

// Test Suite 2: URL Slugs
const s1 = parseLinkedInSlug('https://www.linkedin.com/jobs/view/senior-director-of-engineering-at-nike-4182910482/');
assert.strictEqual(s1.title, 'Senior Director Of Engineering');
assert.strictEqual(s1.company, 'Nike');
console.log('✅ Test 4 Passed: Slug parsing extracted title and company correctly.');

const s2 = parseLinkedInSlug('https://www.linkedin.com/jobs/view/web-operations-lead-at-synops-digital-4059281729');
assert.strictEqual(s2.title, 'Web Operations Lead');
assert.strictEqual(s2.company, 'Synops Digital');
console.log('✅ Test 5 Passed: Multi-word slug parts capitalized properly.');

// Test Suite 3: Retroactive Record Sanitization
const badRecord = {
  id: 'manual-test-1',
  company: 'LinkedIn',
  title: 'Director of IT Operations at Apple - Cupertino, CA',
  location: 'Remote',
  url: 'https://www.linkedin.com/jobs/view/4059281729/'
};
const cleanedRecord = sanitizeJobMetadata(badRecord);
assert.strictEqual(cleanedRecord.company, 'Apple');
assert.strictEqual(cleanedRecord.title, 'Director of IT Operations');
assert.strictEqual(cleanedRecord.location, 'Cupertino, CA');
assert.strictEqual(cleanedRecord.source, 'LinkedIn');
console.log('✅ Test 6 Passed: Retroactive sanitizer cured bad legacy LinkedIn record.');

console.log('\n🎉 ALL LINKEDIN URL & METADATA TESTS PASSED SUCCESSFULLY!');
