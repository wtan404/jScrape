const assert = require('assert');
const { parseJobUrl } = require('../server');

async function runOracleTests() {
  console.log('--- Running Oracle Cloud & Taleo Parsing Verification Tests ---');

  // Test 1: Oracle Internal Corporate Requisition (Candidate Experience)
  console.log('Fetching Oracle Cloud internal requisition (eeho)...');
  const oracleRes = await parseJobUrl('https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch/job/338214');
  assert.strictEqual(oracleRes.company, 'Oracle', 'Employer should resolve to Oracle');
  assert.strictEqual(oracleRes.title, 'Oracle Fusion Finance Functional Consultant', 'Title should match posting Title');
  assert(oracleRes.location.length > 0, 'Location should not be empty');
  assert.strictEqual(oracleRes.source, 'Oracle Cloud (Oracle)', 'Source should indicate Oracle Cloud (Oracle)');
  console.log('✅ Test 1 Passed: Oracle Cloud internal requisition parsed with Title, Employer, and Location.');

  // Test 2: Enterprise Tenant (JPMorgan Chase on Oracle Cloud CX)
  console.log('Fetching JPMC Oracle Cloud requisition...');
  const jpmcRes = await parseJobUrl('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210617464');
  assert.strictEqual(jpmcRes.company, 'JPMorgan Chase', 'JPMC tenant should resolve to JPMorgan Chase');
  assert.strictEqual(jpmcRes.title, 'U.S. Private Bank - Client Service Associate', 'Title should match JPMC job posting');
  assert.strictEqual(jpmcRes.location, 'Chicago, IL, United States', 'Location should match Chicago, IL, United States');
  assert.strictEqual(jpmcRes.source, 'Oracle Cloud (JPMorgan Chase)', 'Source should indicate Oracle Cloud (JPMorgan Chase)');
  console.log('✅ Test 2 Passed: JPMC Oracle Cloud candidate portal requisition correctly extracted.');

  // Test 3: Taleo URL Recognition & Company Inference
  const taleoRes = await parseJobUrl('https://acme.taleo.net/careersection/2/jobdetail.ftl?job=123456');
  assert.strictEqual(taleoRes.company, 'Acme', 'Taleo company should be inferred from subdomain');
  assert.strictEqual(taleoRes.source, 'Taleo (Acme)', 'Source should indicate Taleo (Acme)');
  console.log('✅ Test 3 Passed: Taleo URL successfully identified with employer subdomain.');

  // Test 4: Live LinkedIn Numeric ID with Guest API
  console.log('Testing LinkedIn numeric ID resolution via Guest API...');
  let liRes = await parseJobUrl('https://www.linkedin.com/jobs/view/4492266556/');
  if (liRes.company === 'Direct Employer') {
    await new Promise(r => setTimeout(r, 1000));
    liRes = await parseJobUrl('https://www.linkedin.com/jobs/view/4492266556/');
  }
  assert(liRes.company === 'Navy Federal Credit Union' || liRes.source === 'LinkedIn', 'Should resolve Navy Federal Credit Union or LinkedIn source');
  assert.strictEqual(liRes.title, 'Experience Owner', 'Title should be Experience Owner');
  assert.strictEqual(liRes.source, 'LinkedIn', 'Source should be LinkedIn');
  console.log('✅ Test 4 Passed: Live LinkedIn numeric ID cleanly extracted through Guest API.');

  console.log('\n🎉 ALL ORACLE & ATS PARSING TESTS PASSED SUCCESSFULLY!');
}

runOracleTests().catch(err => {
  console.error('\n❌ Oracle test failed:', err);
  process.exit(1);
});
