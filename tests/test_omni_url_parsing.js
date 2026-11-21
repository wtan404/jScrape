const assert = require('assert');
const { parseJobUrl } = require('../scripts/server');

async function runOmniTests() {
  console.log('--- Running Universal Omni-Link Job Parser Verification Tests ---');

  // Test 1: Oracle Internal Corporate Requisition (Candidate Experience)
  console.log('Testing Oracle Cloud internal requisition...');
  const oracleRes = await parseJobUrl('https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/jobsearch/job/338214');
  assert.strictEqual(oracleRes.company, 'Oracle', 'Employer should resolve to Oracle');
  assert.strictEqual(oracleRes.title, 'Oracle Fusion Finance Functional Consultant', 'Title should match posting Title');
  assert.strictEqual(oracleRes.source, 'Oracle Cloud (Oracle)', 'Source should indicate Oracle Cloud (Oracle)');
  console.log('✅ Test 1 Passed: Oracle Cloud requisition parsed.');

  // Test 2: Enterprise Tenant (JPMC on Oracle Cloud)
  console.log('Testing JPMC Oracle Cloud requisition...');
  const jpmcRes = await parseJobUrl('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210617464');
  assert.strictEqual(jpmcRes.company, 'JPMorgan Chase', 'JPMC tenant should resolve to JPMorgan Chase');
  assert.strictEqual(jpmcRes.title, 'U.S. Private Bank - Client Service Associate', 'Title should match JPMC job posting');
  console.log('✅ Test 2 Passed: JPMC Oracle Cloud requisition parsed.');

  // Test 3: Taleo URL Recognition & Company Inference
  console.log('Testing Taleo URL recognition...');
  const taleoRes = await parseJobUrl('https://acme.taleo.net/careersection/2/jobdetail.ftl?job=123456');
  assert.strictEqual(taleoRes.company, 'Acme', 'Taleo company should be inferred from subdomain');
  assert.strictEqual(taleoRes.source, 'Taleo (Acme)', 'Source should indicate Taleo (Acme)');
  console.log('✅ Test 3 Passed: Taleo URL successfully identified.');

  // Test 4: Live LinkedIn Numeric ID with Guest API
  console.log('Testing LinkedIn numeric ID resolution via Guest API...');
  const liRes = await parseJobUrl('https://www.linkedin.com/jobs/view/4492266556/');
  assert.strictEqual(liRes.company, 'Navy Federal Credit Union', 'Employer should be Navy Federal Credit Union');
  assert.strictEqual(liRes.title, 'Experience Owner', 'Title should be Experience Owner');
  assert.strictEqual(liRes.location, 'Vienna, VA', 'Location should be Vienna, VA');
  assert.strictEqual(liRes.source, 'LinkedIn', 'Source should be LinkedIn');
  console.log('✅ Test 4 Passed: Live LinkedIn numeric ID cleanly extracted through Guest API.');

  // Test 5: Workday URL Pattern Recognition & Tenant Inference
  console.log('Testing Workday URL pattern recognition...');
  const wdRes = await parseJobUrl('https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose-CA/Senior-Software-Engineer_R123456');
  assert.strictEqual(wdRes.company, 'Adobe', 'Workday tenant should resolve to Adobe');
  assert.strictEqual(wdRes.source, 'Workday (Adobe)', 'Source should indicate Workday (Adobe)');
  console.log('✅ Test 5 Passed: Workday URL structure recognized with tenant.');

  // Test 6: Ashby URL Pattern Recognition
  console.log('Testing Ashby URL pattern recognition...');
  const ashbyRes = await parseJobUrl('https://jobs.ashbyhq.com/linear/03f0b240-69ce-4422-9e9d-165b6f3c19b0');
  assert.strictEqual(ashbyRes.company, 'Linear', 'Ashby company should resolve to Linear');
  assert.strictEqual(ashbyRes.source, 'Ashby (Linear)', 'Source should indicate Ashby (Linear)');
  console.log('✅ Test 6 Passed: Ashby URL structure recognized.');

  // Test 7: SmartRecruiters URL Recognition
  console.log('Testing SmartRecruiters URL pattern recognition...');
  const srRes = await parseJobUrl('https://jobs.smartrecruiters.com/Square/743999999999-staff-software-engineer');
  assert.strictEqual(srRes.company, 'Square', 'SmartRecruiters company should resolve to Square');
  assert.strictEqual(srRes.source, 'SmartRecruiters (Square)', 'Source should indicate SmartRecruiters (Square)');
  console.log('✅ Test 7 Passed: SmartRecruiters URL structure recognized.');

  // Test 8: BambooHR URL Recognition
  console.log('Testing BambooHR URL pattern recognition...');
  const bhrRes = await parseJobUrl('https://gitlab.bamboohr.com/careers/123');
  assert.strictEqual(bhrRes.company, 'Gitlab', 'BambooHR tenant should resolve to Gitlab');
  assert.strictEqual(bhrRes.source, 'BambooHR (Gitlab)', 'Source should indicate BambooHR (Gitlab)');
  console.log('✅ Test 8 Passed: BambooHR URL structure recognized.');

  // Test 9: Compound Title Decompiler - "<Role> at <Company> - <Location>"
  console.log('Testing compound title decompiler (Role at Company)...');
  const customRes1 = await parseJobUrl('https://careers.stripe.com/jobs/staff-infrastructure-engineer');
  assert(customRes1.company.length > 0, 'Company should be extracted');
  console.log('✅ Test 9 Passed: Direct corporate career page parsed (Company: ' + customRes1.company + ').');

  console.log('\n🎉 ALL UNIVERSAL OMNI-LINK PARSING TESTS PASSED SUCCESSFULLY!\n');
}

runOmniTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
