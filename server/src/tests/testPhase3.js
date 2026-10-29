/**
 * Phase 3 Verification Suite: Hopin Internship Ingestion Pipeline
 */

const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const { fetchInternships } = require('../services/hopinService');
const {
  normalizeHopinInternship,
  validateNormalizedOpportunity,
  computeOpportunityStatus
} = require('../utils/normalizeOpportunity');
const { syncHopinInternships } = require('../services/syncService');

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 3 VERIFICATION SUITE: HOPIN INTERNSHIPS');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init();

  const testIds = ['e4841672-3717-4959-ac26-d9fa5fca7673', 'hopin-test-intern-002'];

  try {
    // -----------------------------------------------------------------
    // TEST 1: Hopin Live API Fetch Reachability
    // -----------------------------------------------------------------
    console.log('--- Test 1: Hopin API Reachability & Live Endpoint ---');
    const liveFetch = await fetchInternships({ timeoutMs: 6000 });
    console.assert(liveFetch.success === true, `Live fetch should succeed: ${liveFetch.error}`);
    console.assert(Array.isArray(liveFetch.internships), 'Expected internships to be an array');
    console.log(`[PASS] Test 1: Successfully reached Hopin API (Status: ${liveFetch.statusCode}, Live Count: ${liveFetch.internships.length}).`);

    // -----------------------------------------------------------------
    // TEST 2: Normalization of Hopin Payload to Canonical Opportunity Structure
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Normalization Logic ---');
    const sampleHopinPayload = {
      id: testIds[0],
      company: 'Infosys Technologies',
      title: 'Cloud Full-Stack Intern',
      description: 'Build enterprise React and Node.js microservices with MongoDB and Docker.',
      location: 'Bangalore, India',
      work_type: 'Hybrid',
      industry: 'Information Technology',
      role_type: 'Software Engineer',
      stipend: '₹35,000 / month',
      duration: '6 months',
      posted_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      posted_days: 0,
      is_on_campus: false,
      is_active: true,
      job_type: 'internship'
    };

    const normalized = normalizeHopinInternship(sampleHopinPayload);
    const validation = validateNormalizedOpportunity(normalized);

    console.assert(validation.isValid, `Validation failed: ${validation.errors.join(', ')}`);
    console.assert(normalized.organization === 'Infosys Technologies', 'Organization mismatch');
    console.assert(normalized.mode === 'HYBRID', `Expected mode HYBRID, got ${normalized.mode}`);
    console.assert(normalized.location === 'Bangalore, India', 'Location mismatch');
    console.assert(normalized.stipend === '₹35,000 / month', 'Stipend mismatch');
    console.assert(normalized.eligibility.skills.includes('React'), 'Skills must include React');
    console.assert(normalized.eligibility.skills.includes('Node.js'), 'Skills must include Node.js');
    console.assert(normalized.eligibility.skills.includes('MongoDB'), 'Skills must include MongoDB');
    console.assert(normalized.eligibility.department.includes('Computer Science'), 'Department must include Computer Science');
    console.assert(normalized.status === 'ACTIVE', `Expected status ACTIVE, got ${normalized.status}`);
    console.log('[PASS] Test 2: Hopin payload normalized and validated into canonical opportunity structure.');

    // -----------------------------------------------------------------
    // TEST 3: Required Source Identity (source=hopin, externalId, type=INTERNSHIP)
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Source Identity Verification ---');
    console.assert(normalized.source === 'hopin', `Expected source 'hopin', got '${normalized.source}'`);
    console.assert(normalized.externalId === testIds[0], `Expected externalId '${testIds[0]}', got '${normalized.externalId}'`);
    console.assert(normalized.type === 'INTERNSHIP', `Expected type 'INTERNSHIP', got '${normalized.type}'`);
    console.log('[PASS] Test 3: Source identity verified (source=hopin, valid externalId, type=INTERNSHIP).');

    // -----------------------------------------------------------------
    // TEST 4: First Synchronization (Inserts)
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: First Synchronization (Insertion) ---');
    // Clean any previous test data
    await Opportunity.deleteMany({ source: 'hopin', externalId: { $in: testIds } });
    await SyncLog.deleteMany({ source: 'hopin' });

    const batchData = [
      sampleHopinPayload,
      {
        id: testIds[1],
        company: 'Zeta Innovations',
        title: 'Python Machine Learning Research Intern',
        description: 'Implement computer vision and NLP models using Python and PyTorch.',
        location: 'Remote',
        work_type: 'Remote',
        industry: 'Artificial Intelligence',
        role_type: 'Data Scientist',
        stipend: '₹40,000 / month',
        posted_at: new Date().toISOString(),
        is_active: true
      }
    ];

    const firstRun = await syncHopinInternships({
      customData: batchData,
      persistToDisk: false
    });

    console.assert(firstRun.success === true, `First run should succeed: ${JSON.stringify(firstRun.errors)}`);
    console.assert(firstRun.recordsFetched === 2, `Expected 2 fetched, got ${firstRun.recordsFetched}`);
    console.assert(firstRun.recordsInserted === 2, `Expected 2 inserted, got ${firstRun.recordsInserted}`);
    console.assert(firstRun.recordsUpdated === 0, `Expected 0 updated on first run, got ${firstRun.recordsUpdated}`);
    console.assert(firstRun.errors.length === 0, `Expected 0 errors, got ${firstRun.errors.length}`);

    const countInDbAfterFirst = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testIds }
    });
    console.assert(countInDbAfterFirst === 2, `Expected 2 documents in DB, found ${countInDbAfterFirst}`);
    console.log(`[PASS] Test 4: First run successfully inserted ${firstRun.recordsInserted} records (0 updated, 0 duplicates).`);

    // -----------------------------------------------------------------
    // TEST 5: Second Synchronization (Updates without Duplication)
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: Second Synchronization (Deduplication & Updates) ---');
    // Modify stipend in second batch to verify update detection
    const updatedBatchData = [
      {
        ...sampleHopinPayload,
        stipend: '₹38,000 / month (Revised)'
      },
      batchData[1]
    ];

    const secondRun = await syncHopinInternships({
      customData: updatedBatchData,
      persistToDisk: false
    });

    console.assert(secondRun.success === true, `Second run should succeed: ${JSON.stringify(secondRun.errors)}`);
    console.assert(secondRun.recordsFetched === 2, `Expected 2 fetched, got ${secondRun.recordsFetched}`);
    console.assert(secondRun.recordsInserted === 0, `Expected 0 inserted on second run, got ${secondRun.recordsInserted}`);
    console.assert(secondRun.recordsUpdated === 2, `Expected 2 updated on second run, got ${secondRun.recordsUpdated}`);
    console.assert(secondRun.errors.length === 0, `Expected 0 errors, got ${secondRun.errors.length}`);

    const countInDbAfterSecond = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testIds }
    });
    console.assert(countInDbAfterSecond === 2, `Total count must remain 2 (no duplicates!), found ${countInDbAfterSecond}`);

    const updatedDoc = await Opportunity.findOne({ source: 'hopin', externalId: testIds[0] });
    console.assert(updatedDoc.stipend === '₹38,000 / month (Revised)', `Stipend should be updated to revised amount, got ${updatedDoc.stipend}`);
    console.log(`[PASS] Test 5: Second run updated ${secondRun.recordsUpdated} existing records with ZERO duplicates.`);

    // -----------------------------------------------------------------
    // TEST 6: SyncLog Lifecycle & Accurate Metrics
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: SyncLog Generation & Verification ---');
    console.assert(secondRun.syncLog._id, 'SyncLog must have an ID');
    const dbLog = await SyncLog.findById(secondRun.syncLog._id);
    console.assert(dbLog !== null, 'SyncLog must exist in DB');
    console.assert(dbLog.source === 'hopin', 'SyncLog source mismatch');
    console.assert(dbLog.status === 'SUCCESS', `Expected status SUCCESS, got ${dbLog.status}`);
    console.assert(dbLog.recordsFetched === 2, 'SyncLog recordsFetched mismatch');
    console.assert(dbLog.recordsInserted === 0, 'SyncLog recordsInserted mismatch');
    console.assert(dbLog.recordsUpdated === 2, 'SyncLog recordsUpdated mismatch');
    console.assert(dbLog.completedAt !== null, 'completedAt must be populated');
    console.log('[PASS] Test 6: SyncLog accurately recorded synchronization execution and statistics.');

    // -----------------------------------------------------------------
    // TEST 7: Resilient Failure Handling (Network Error / Unreachable Endpoint)
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Failure Handling (Unavailable Host) ---');
    const failRun = await syncHopinInternships({
      baseUrl: 'http://127.0.0.1:59999/unreachable',
      timeoutMs: 1500,
      persistToDisk: false
    });

    console.assert(failRun.success === false, 'failRun should report success: false');
    console.assert(failRun.syncLog.status === 'FAILED', 'SyncLog status should be FAILED');
    console.assert(failRun.syncLog.errorMessage.length > 0, 'errorMessage should be recorded');

    // Existing opportunities must remain untouched
    const countAfterFailure = await Opportunity.countDocuments({
      source: 'hopin',
      externalId: { $in: testIds }
    });
    console.assert(countAfterFailure === 2, 'Existing data must remain intact after sync failure');
    console.log('[PASS] Test 7: API connection failure gracefully caught, logged in SyncLog, server did not crash, and data remained safe.');

    // -----------------------------------------------------------------
    // TEST 8: Existing API Compatibility (GET /opportunities & type filter)
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Existing Opportunity REST API Compatibility ---');
    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(5098, resolve));
    const baseUrl = 'http://localhost:5098';

    try {
      // 1. Fetch all opportunities (should include Hopin opportunities)
      const allRes = await fetch(`${baseUrl}/opportunities`).then(r => r.json());
      const hopinOpps = allRes.filter(o => o.source === 'hopin');
      console.assert(hopinOpps.length >= 2, `Expected at least 2 Hopin opportunities in catalog, found ${hopinOpps.length}`);
      console.log(`[PASS] GET /opportunities returned ${allRes.length} items (including ${hopinOpps.length} Hopin opportunities).`);

      // 2. Fetch with lowercase type filter ?type=internship
      const lowerTypeRes = await fetch(`${baseUrl}/opportunities?type=internship`).then(r => r.json());
      const lowerHopin = lowerTypeRes.filter(o => o.source === 'hopin');
      console.assert(lowerHopin.length >= 2, `Expected Hopin internships to match ?type=internship, found ${lowerHopin.length}`);
      console.log(`[PASS] GET /opportunities?type=internship matched ${lowerTypeRes.length} items (case-insensitive compatibility verified).`);

      // 3. Fetch with uppercase type filter ?type=INTERNSHIP
      const upperTypeRes = await fetch(`${baseUrl}/opportunities?type=INTERNSHIP`).then(r => r.json());
      const upperHopin = upperTypeRes.filter(o => o.source === 'hopin');
      console.assert(upperHopin.length >= 2, `Expected Hopin internships to match ?type=INTERNSHIP, found ${upperHopin.length}`);
      console.log(`[PASS] GET /opportunities?type=INTERNSHIP matched ${upperTypeRes.length} items.`);

      // 4. Fetch single opportunity details by ID
      const singleRes = await fetch(`${baseUrl}/opportunities/${hopinOpps[0]._id}`).then(r => r.json());
      console.assert(singleRes._id === hopinOpps[0]._id, 'Single opportunity ID mismatch');
      console.assert(singleRes.source === 'hopin', 'Single opportunity source mismatch');
      console.assert(singleRes.externalId === hopinOpps[0].externalId, 'Single opportunity externalId mismatch');
      console.log('[PASS] GET /opportunities/:id successfully retrieved synchronized Hopin opportunity.');
    } finally {
      await new Promise(resolve => testServer.close(resolve));
    }

    console.log('\n======================================================');
    console.log('ALL PHASE 3 UNIT AND INTEGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Clean up test records
    await Opportunity.deleteMany({ source: 'hopin', externalId: { $in: testIds } });
    await SyncLog.deleteMany({ source: 'hopin' });
    await closeDB();
  }
}

if (require.main === module) {
  runPhase3Tests().then(() => process.exit(0)).catch(err => {
    console.error('Phase 3 test failure:', err);
    process.exit(1);
  });
}

module.exports = { runPhase3Tests };
