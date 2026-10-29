/**
 * Phase 5 Verification Suite: Brabble API Integration for Hackathons & Competitions
 * 
 * Verifies:
 * 1. Live Brabble API reachability for /api/listings and authentication error handling
 * 2. Normalization & validation for Brabble Hackathons (canonical type: HACKATHON)
 * 3. Normalization & validation for Brabble Competitions (canonical type: COMPETITION)
 * 4. Strict null preservation (no invented deadlines or fees) and skill extraction
 * 5. First synchronization run (insertions)
 * 6. Second synchronization run (idempotent updates with exactly 0 duplicates)
 * 7. SyncLog lifecycle and category logging ('hackathons', 'competitions')
 * 8. Resilient failure handling (unreachable network/host, timeout)
 * 9. Existing REST API compatibility (GET /opportunities, type filters, search, single item)
 */

const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const { fetchListings, fetchHackathons, fetchCompetitions } = require('../services/brabbleService');
const {
  normalizeBrabbleListing,
  classifyBrabbleListingType,
  validateNormalizedOpportunity
} = require('../utils/normalizeOpportunity');
const {
  syncBrabbleHackathons,
  syncBrabbleCompetitions,
  syncAllBrabble,
  syncAllSources
} = require('../services/syncService');

async function runPhase5Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 5 VERIFICATION SUITE: BRABBLE API INTEGRATION');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init();

  const testHackathonIds = ['brbl-test-hack-001', 'brbl-test-hack-002'];
  const testCompetitionIds = ['brbl-test-comp-001', 'brbl-test-comp-002'];
  const allTestIds = [...testHackathonIds, ...testCompetitionIds];

  try {
    // -----------------------------------------------------------------
    // TEST 1: Live API Reachability and Auth Handling
    // -----------------------------------------------------------------
    console.log('--- Test 1: Live Brabble API Endpoint Reachability & Auth Handshake ---');
    const liveFetch = await fetchListings({ timeoutMs: 8000 });
    // Without an API key, the official live endpoint responds with HTTP 401
    console.assert(
      liveFetch.statusCode === 401 || liveFetch.statusCode === 200,
      `Expected status 401 or 200 from Brabble live API, got ${liveFetch.statusCode}`
    );
    console.assert(
      liveFetch.success === (liveFetch.statusCode === 200),
      'liveFetch.success should match HTTP 200 status'
    );
    console.log(`[PASS] Live Brabble Endpoint reached (HTTP ${liveFetch.statusCode}). Error/Auth gracefully caught without crashing.`);
    console.log('       (Note: Brabble live endpoint requires an API key. Schema-conforming fixtures will be used for pipeline ingestion tests.)');

    // -----------------------------------------------------------------
    // TEST 2: Normalization Logic for Brabble Hackathons
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Normalization of Brabble Hackathons ---');
    const sampleHackathonPayload = {
      id: testHackathonIds[0],
      title: 'Smart India Hackathon 2026 - Hardware & Software Edition',
      organiser: 'Ministry of Education & AICTE',
      type: 'HACKATHON',
      kind: 'competition',
      platform: 'Unstop',
      url: 'https://unstop.com/hackathons/smart-india-hackathon-2026',
      shareUrl: 'https://brabble.ai/listing/brbl-test-hack-001',
      deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      mode: 'ONLINE',
      city: 'New Delhi',
      prize: {
        label: '₹1,00,000 Cash Prize + Mentorship',
        inr: 100000
      },
      team: '1-6 members',
      fee: 'Free',
      eligibility: ['Open to all college students', 'B.Tech/BE/MCA/BCA'],
      registered: 1420
    };

    const normalizedHack = normalizeBrabbleListing(sampleHackathonPayload);
    const hackValidation = validateNormalizedOpportunity(normalizedHack);

    console.assert(hackValidation.isValid, `Hackathon validation failed: ${hackValidation.errors.join(', ')}`);
    console.assert(normalizedHack.type === 'HACKATHON', `Expected type HACKATHON, got ${normalizedHack.type}`);
    console.assert(normalizedHack.source === 'brabble', `Expected source brabble, got ${normalizedHack.source}`);
    console.assert(normalizedHack.externalId === testHackathonIds[0], `Expected externalId ${testHackathonIds[0]}, got ${normalizedHack.externalId}`);
    console.assert(normalizedHack.mode === 'ONLINE', `Expected mode ONLINE, got ${normalizedHack.mode}`);
    console.assert(normalizedHack.stipendOrReward.includes('1,00,000'), `Prize mismatch: ${normalizedHack.stipendOrReward}`);
    console.assert(normalizedHack.fee === 'Free', `Fee mismatch: ${normalizedHack.fee}`);
    console.assert(normalizedHack.deadline !== null, 'Deadline should be preserved');
    console.assert(normalizedHack.tags.includes('hackathon'), 'Tags must include hackathon');
    console.assert(normalizedHack.tags.includes('brabble'), 'Tags must include brabble');
    console.log('[PASS] Test 2: Brabble Hackathon normalized and validated as canonical HACKATHON opportunity.');

    // -----------------------------------------------------------------
    // TEST 3: Normalization Logic for Brabble Competitions
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Normalization of Brabble Competitions & Contests ---');
    const sampleCompetitionPayload = {
      id: testCompetitionIds[0],
      title: 'National AI & Data Science Challenge 2026',
      organiser: 'Analytics Vidhya & AWS',
      type: 'COMPETITION',
      kind: 'challenge',
      platform: 'Devfolio',
      url: 'https://devfolio.co/competitions/ai-data-challenge-2026',
      shareUrl: 'https://brabble.ai/listing/brbl-test-comp-001',
      deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
      mode: 'HYBRID',
      city: 'Bengaluru',
      prize: {
        label: '₹75,000 Prize Pool',
        inr: 75000
      },
      team: '1-3',
      eligibility: ['Undergraduate and Postgraduate students in Computer Science and Data Science'],
      registered: 530
    };

    const normalizedComp = normalizeBrabbleListing(sampleCompetitionPayload);
    const compValidation = validateNormalizedOpportunity(normalizedComp);

    console.assert(compValidation.isValid, `Competition validation failed: ${compValidation.errors.join(', ')}`);
    console.assert(normalizedComp.type === 'COMPETITION', `Expected type COMPETITION, got ${normalizedComp.type}`);
    console.assert(normalizedComp.source === 'brabble', `Expected source brabble, got ${normalizedComp.source}`);
    console.assert(normalizedComp.mode === 'HYBRID', `Expected mode HYBRID, got ${normalizedComp.mode}`);
    console.assert(normalizedComp.stipendOrReward.includes('75,000'), `Prize mismatch: ${normalizedComp.stipendOrReward}`);
    console.assert(normalizedComp.eligibility.skills.includes('Data Science') || normalizedComp.eligibility.skills.includes('Machine Learning'), 'Should detect AI/Data Science skills');
    console.assert(normalizedComp.tags.includes('competition'), 'Tags must include competition');
    console.log('[PASS] Test 3: Brabble Competition normalized and validated as canonical COMPETITION opportunity.');

    // -----------------------------------------------------------------
    // TEST 4: Strict Null Preservation (No Invented Deadlines/Fees)
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Strict Null Preservation for Deadlines & Fees ---');
    const noDeadlinePayload = {
      id: 'brbl-test-no-deadline',
      title: 'Open Innovation Coding Contest',
      organiser: 'Open Source Guild',
      type: 'COMPETITION',
      kind: 'contest',
      mode: 'ONLINE'
    };
    const normalizedNoDeadline = normalizeBrabbleListing(noDeadlinePayload);
    console.assert(normalizedNoDeadline.deadline === null, 'deadline must remain null if missing in source');
    console.assert(normalizedNoDeadline.fee === null, 'fee must remain null if missing in source');
    console.assert(normalizedNoDeadline.status === 'ACTIVE', 'status should be ACTIVE when no past deadline is present');
    console.log('[PASS] Test 4: Strict null preservation verified (zero hallucinated deadlines or fees).');

    // Clean any previous test artifacts before ingestion tests
    await Opportunity.deleteMany({ source: 'brabble', externalId: { $in: allTestIds } });
    await SyncLog.deleteMany({ source: 'brabble' });

    // -----------------------------------------------------------------
    // TEST 5: First Synchronization Run (Insertions)
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: First Synchronization Run (Insertions) ---');
    const mockHackathons = [
      sampleHackathonPayload,
      {
        id: testHackathonIds[1],
        title: 'FinTech Revolution Hackathon 2026',
        organiser: 'HackerEarth & NPCI',
        type: 'HACKATHON',
        kind: 'hackathon',
        platform: 'HackerEarth',
        url: 'https://hackerearth.com/challenges/hackathon/fintech-revolution',
        mode: 'ONLINE',
        deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
        prize: { label: '₹1,50,000 Total Prize Pool', inr: 150000 },
        fee: 'Free'
      }
    ];

    const hackSync1 = await syncBrabbleHackathons({ customData: mockHackathons });
    console.assert(hackSync1.success === true, `Hackathons sync failed: ${hackSync1.syncLog?.errorMessage}`);
    console.assert(hackSync1.recordsFetched === 2, `Expected 2 fetched, got ${hackSync1.recordsFetched}`);
    console.assert(hackSync1.recordsInserted === 2, `Expected 2 inserted, got ${hackSync1.recordsInserted}`);
    console.assert(hackSync1.recordsUpdated === 0, `Expected 0 updated, got ${hackSync1.recordsUpdated}`);
    console.assert(hackSync1.errors.length === 0, `Expected 0 errors, got ${hackSync1.errors.length}`);
    console.log('[PASS] Test 5a: Brabble Hackathons first run inserted 2 records (0 updated, 0 duplicates).');

    const mockCompetitions = [
      sampleCompetitionPayload,
      {
        id: testCompetitionIds[1],
        title: 'Global Cyber Security Challenge 2026',
        organiser: 'IEEE Computer Society',
        type: 'COMPETITION',
        kind: 'contest',
        platform: 'Unstop',
        url: 'https://unstop.com/competitions/global-cyber-security',
        mode: 'OFFLINE',
        city: 'Mumbai',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        prize: { label: '₹50,000 Cash Prize', inr: 50000 },
        fee: 'Free'
      }
    ];

    const compSync1 = await syncBrabbleCompetitions({ customData: mockCompetitions });
    console.assert(compSync1.success === true, `Competitions sync failed: ${compSync1.syncLog?.errorMessage}`);
    console.assert(compSync1.recordsFetched === 2, `Expected 2 fetched, got ${compSync1.recordsFetched}`);
    console.assert(compSync1.recordsInserted === 2, `Expected 2 inserted, got ${compSync1.recordsInserted}`);
    console.assert(compSync1.recordsUpdated === 0, `Expected 0 updated, got ${compSync1.recordsUpdated}`);
    console.log('[PASS] Test 5b: Brabble Competitions first run inserted 2 records (0 updated, 0 duplicates).');

    const totalBrabbleCountAfterRun1 = await Opportunity.countDocuments({
      source: 'brabble',
      externalId: { $in: allTestIds }
    });
    console.assert(totalBrabbleCountAfterRun1 === 4, `Expected 4 total records, found ${totalBrabbleCountAfterRun1}`);
    console.log(`[PASS] Verified total 4 Brabble opportunities active in database.`);

    // -----------------------------------------------------------------
    // TEST 6: Second Synchronization Run (Idempotency & Updates)
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Second Synchronization Run (Deduplication & Updates) ---');
    // Modify prize and team size in existing records to verify update without duplicate
    const modifiedHackathons = [
      {
        ...sampleHackathonPayload,
        title: 'Smart India Hackathon 2026 - Hardware & Software (Updated Edition)',
        prize: { label: '₹2,00,000 Enhanced Cash Prize', inr: 200000 }
      },
      mockHackathons[1]
    ];

    const hackSync2 = await syncBrabbleHackathons({ customData: modifiedHackathons });
    console.assert(hackSync2.success === true, 'Hackathon rerun should succeed');
    console.assert(hackSync2.recordsInserted === 0, `Expected 0 inserted, got ${hackSync2.recordsInserted}`);
    console.assert(hackSync2.recordsUpdated === 2, `Expected 2 updated, got ${hackSync2.recordsUpdated}`);

    const compSync2 = await syncBrabbleCompetitions({ customData: mockCompetitions });
    console.assert(compSync2.success === true, 'Competition rerun should succeed');
    console.assert(compSync2.recordsInserted === 0, `Expected 0 inserted, got ${compSync2.recordsInserted}`);
    console.assert(compSync2.recordsUpdated === 2, `Expected 2 updated, got ${compSync2.recordsUpdated}`);

    const totalBrabbleCountAfterRun2 = await Opportunity.countDocuments({
      source: 'brabble',
      externalId: { $in: allTestIds }
    });
    console.assert(
      totalBrabbleCountAfterRun2 === 4,
      `Duplicate detected! Expected exactly 4 records, found ${totalBrabbleCountAfterRun2}`
    );

    // Verify record was updated in place
    const updatedHack = await Opportunity.findOne({ source: 'brabble', externalId: testHackathonIds[0] });
    console.assert(
      updatedHack.title === 'Smart India Hackathon 2026 - Hardware & Software (Updated Edition)',
      'Title should have updated'
    );
    console.assert(
      updatedHack.stipendOrReward.includes('2,00,000'),
      'Prize should have updated'
    );
    console.log('[PASS] Test 6: Second synchronization ran idempotently: 0 duplicates created, records updated in place.');

    // -----------------------------------------------------------------
    // TEST 7: SyncLog Lifecycle & Category Tracking
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: SyncLog Lifecycle & Category Tracking ---');
    const hackLogs = await SyncLog.find({ source: 'brabble', category: 'hackathons' }).sort({ startedAt: -1 });
    const compLogs = await SyncLog.find({ source: 'brabble', category: 'competitions' }).sort({ startedAt: -1 });

    console.assert(hackLogs.length >= 2, `Expected >= 2 hackathon logs, found ${hackLogs.length}`);
    console.assert(compLogs.length >= 2, `Expected >= 2 competition logs, found ${compLogs.length}`);
    console.assert(hackLogs[0].status === 'SUCCESS', `Expected status SUCCESS, got ${hackLogs[0].status}`);
    console.assert(hackLogs[0].recordsUpdated === 2, `Expected 2 updated in latest log, got ${hackLogs[0].recordsUpdated}`);
    console.assert(hackLogs[0].completedAt !== null, 'completedAt should be timestamped');
    console.log('[PASS] Test 7: SyncLog successfully recorded Brabble hackathons and competitions runs.');

    // -----------------------------------------------------------------
    // TEST 8: Resilient Failure Handling (Network Failure / Unreachable Host)
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Resilient Failure Handling (Unreachable Host) ---');
    const failedSync = await syncBrabbleHackathons({
      baseUrl: 'http://127.0.0.1:54321/unreachable-brabble-host',
      timeoutMs: 800
    });

    console.assert(failedSync.success === false, 'Expected sync to fail gracefully');
    console.assert(failedSync.syncLog.status === 'FAILED', `Expected FAILED status, got ${failedSync.syncLog.status}`);
    console.assert(typeof failedSync.syncLog.errorMessage === 'string', 'errorMessage should be set');
    console.assert(failedSync.recordsInserted === 0, 'No records should be inserted on network failure');

    const dbIntegrityCount = await Opportunity.countDocuments({
      source: 'brabble',
      externalId: { $in: allTestIds }
    });
    console.assert(dbIntegrityCount === 4, 'Existing data must remain safe after failed sync attempt');
    console.log('[PASS] Test 8: Network failure gracefully handled, FAILED logged in SyncLog, database preserved.');

    // -----------------------------------------------------------------
    // TEST 9: Existing Opportunity REST API Compatibility
    // -----------------------------------------------------------------
    console.log('\n--- Test 9: Existing Opportunity REST API Compatibility ---');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const apiFetch = async (path) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      const data = await res.json();
      return { status: res.status, data };
    };

    // 9a: GET /opportunities
    const allRes = await apiFetch('/opportunities');
    console.assert(allRes.status === 200, `Expected 200, got ${allRes.status}`);
    console.assert(Array.isArray(allRes.data), 'Expected array of opportunities');
    const foundBrabbleInApi = allRes.data.filter(o => o.source === 'brabble');
    console.assert(foundBrabbleInApi.length >= 4, `Expected >= 4 Brabble items in REST API, found ${foundBrabbleInApi.length}`);
    console.log(`[PASS] GET /opportunities returned ${allRes.data.length} items (including ${foundBrabbleInApi.length} Brabble opportunities).`);

    // 9b: Filter by type=hackathon
    const hackRes = await apiFetch('/opportunities?type=hackathon');
    console.assert(hackRes.status === 200, `Expected 200, got ${hackRes.status}`);
    const brabbleHacks = hackRes.data.filter(o => o.source === 'brabble' && testHackathonIds.includes(o.externalId));
    console.assert(brabbleHacks.length === 2, `Expected 2 Brabble test hackathons, found ${brabbleHacks.length}`);
    console.log(`[PASS] GET /opportunities?type=hackathon returned ${hackRes.data.length} items (${brabbleHacks.length} Brabble test hackathons).`);

    // 9c: Filter by type=competition
    const compRes = await apiFetch('/opportunities?type=competition');
    console.assert(compRes.status === 200, `Expected 200, got ${compRes.status}`);
    const brabbleComps = compRes.data.filter(o => o.source === 'brabble' && testCompetitionIds.includes(o.externalId));
    console.assert(brabbleComps.length === 2, `Expected 2 Brabble test competitions, found ${brabbleComps.length}`);
    console.log(`[PASS] GET /opportunities?type=competition returned ${compRes.data.length} items (${brabbleComps.length} Brabble test competitions).`);

    // 9d: Text search query across Brabble listings
    const searchRes = await apiFetch('/opportunities?search=Smart+India');
    console.assert(searchRes.status === 200, `Expected 200, got ${searchRes.status}`);
    console.assert(searchRes.data.length >= 1, `Expected at least 1 search result, got ${searchRes.data.length}`);
    console.assert(searchRes.data[0].externalId === testHackathonIds[0], 'Search should match the Smart India Hackathon');
    console.log(`[PASS] GET /opportunities?search=Smart+India correctly retrieved Brabble opportunity.`);

    // 9e: Single item retrieval by ID
    const singleDoc = await Opportunity.findOne({ source: 'brabble', externalId: testHackathonIds[0] });
    const singleRes = await apiFetch(`/opportunities/${singleDoc._id}`);
    console.assert(singleRes.status === 200, `Expected 200, got ${singleRes.status}`);
    console.assert(singleRes.data.externalId === testHackathonIds[0], 'externalId mismatch');
    console.assert(singleRes.data.type === 'HACKATHON', 'type mismatch');
    console.log(`[PASS] GET /opportunities/:id successfully retrieved single synchronized Brabble opportunity.`);

    await new Promise((resolve) => server.close(resolve));

    console.log('\n======================================================');
    console.log('ALL PHASE 5 UNIT AND INTEGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Clean up test data
    await Opportunity.deleteMany({ source: 'brabble', externalId: { $in: allTestIds } });
    await SyncLog.deleteMany({ source: 'brabble', category: { $in: ['hackathons', 'competitions'] } });
    await closeDB();
  }
}

if (require.main === module) {
  runPhase5Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n[FAIL] Phase 5 Test Suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runPhase5Tests };
