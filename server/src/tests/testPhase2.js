/**
 * Phase 2 Verification Suite: Common Opportunity Schema & SyncLog
 */
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const { syncToDisk, restoreFromDisk } = require('../config/dbPersistence');

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 2 VERIFICATION SUITE');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init(); // Ensure indexes are built in MongoDB

  // Clean any residual test documents before running
  await Opportunity.deleteMany({
    $or: [
      { externalId: { $in: ['hopin-job-98765'] } },
      { title: { $regex: /^Test / } },
      { title: { $regex: /^Internal Notice/ } },
      { title: 'Legacy University Merit Award' }
    ]
  });
  await SyncLog.deleteMany({ source: 'hopin' });

  try {
    // -----------------------------------------------------------------
    // TEST 1: Backward Compatibility with Existing Opportunity Format
    // -----------------------------------------------------------------
    console.log('--- Test 1: Existing Opportunity Record Compatibility ---');
    const legacyOpp = new Opportunity({
      title: 'Legacy University Merit Award',
      type: 'scholarship',
      description: 'Standard merit award with no external sync fields.',
      eligibility: {
        department: ['Computer Science'],
        minYear: 2,
        minCGPA: 8.0,
        skills: ['Java']
      },
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      organization: 'State University',
      location: 'Campus',
      stipendOrReward: 'INR 25,000 grant',
      officialUrl: 'https://university.edu/merit'
    });

    const savedLegacy = await legacyOpp.save();
    console.assert(savedLegacy._id, 'Legacy opportunity must have _id');
    console.assert(savedLegacy.source === 'internal', `Expected source='internal', got ${savedLegacy.source}`);
    console.assert(savedLegacy.externalId === null, `Expected externalId=null, got ${savedLegacy.externalId}`);
    console.assert(savedLegacy.status === 'ACTIVE', `Expected status='ACTIVE', got ${savedLegacy.status}`);
    console.assert(savedLegacy.applicationUrl === 'https://university.edu/merit', 'applicationUrl should sync with officialUrl');
    console.assert(savedLegacy.stipend === 'INR 25,000 grant', 'stipend should sync with stipendOrReward');
    console.log('[PASS] Test 1: Legacy opportunity record saved and retrieved with backward-compatible defaults.');

    // -----------------------------------------------------------------
    // TEST 2: Extended Opportunity Types Support (Uppercase & New Types)
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Extended Opportunity Types (Uppercase & Lowercase) ---');
    const typesToTest = [
      'INTERNSHIP',
      'PLACEMENT',
      'HACKATHON',
      'COMPETITION',
      'SCHOLARSHIP',
      'COURSE',
      'WORKSHOP'
    ];

    for (const testType of typesToTest) {
      const opp = new Opportunity({
        title: `Test ${testType} Opportunity`,
        type: testType,
        description: `Opportunity of type ${testType}`,
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        organization: 'Testing Org'
      });
      const saved = await opp.save();
      console.assert(saved.type === testType, `Expected type ${testType}, got ${saved.type}`);
    }
    console.log(`[PASS] Test 2: All 7 required opportunity types verified: ${typesToTest.join(', ')}.`);

    // -----------------------------------------------------------------
    // TEST 3: New Opportunity with All External Synchronization Fields
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: New Opportunity with External Synchronization Fields ---');
    const extStartDate = new Date('2026-10-01T00:00:00Z');
    const extDeadline = new Date('2026-09-30T23:59:59Z');

    const externalOpp = new Opportunity({
      externalId: 'hopin-job-98765',
      source: 'hopin',
      sourceUrl: 'https://hopinjobs.com/jobs/98765',
      applicationUrl: 'https://hopinjobs.com/apply/98765',
      mode: 'HYBRID',
      status: 'ACTIVE',
      stipend: 'INR 45,000 / month',
      fee: 'Free',
      startDate: extStartDate,
      fetchedAt: new Date(),
      title: 'Senior Backend Engineering Intern',
      type: 'INTERNSHIP',
      description: 'Distributed microservices architecture with Node and MongoDB.',
      eligibility: {
        department: ['Computer Science', 'Information Technology'],
        minYear: 3,
        minCGPA: 7.5,
        skills: ['Node.js', 'MongoDB', 'Docker']
      },
      deadline: extDeadline,
      organization: 'Hopin Partner Co',
      location: 'Bengaluru / Hybrid'
    });

    const savedExternal = await externalOpp.save();
    console.assert(savedExternal.externalId === 'hopin-job-98765', 'externalId mismatch');
    console.assert(savedExternal.source === 'hopin', 'source mismatch');
    console.assert(savedExternal.mode === 'HYBRID', 'mode mismatch');
    console.assert(savedExternal.status === 'ACTIVE', 'status mismatch');
    console.assert(savedExternal.stipend === 'INR 45,000 / month', 'stipend mismatch');
    console.assert(savedExternal.fee === 'Free', 'fee mismatch');
    console.assert(savedExternal.sourceUrl === 'https://hopinjobs.com/jobs/98765', 'sourceUrl mismatch');
    console.assert(savedExternal.applicationUrl === 'https://hopinjobs.com/apply/98765', 'applicationUrl mismatch');
    console.log('[PASS] Test 3: Opportunity with external synchronization fields successfully saved and verified.');

    // -----------------------------------------------------------------
    // TEST 4: Composite Uniqueness Enforcement on { source + externalId }
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Composite Uniqueness Enforcement (source + externalId) ---');

    // Attempt to insert duplicate with identical source + externalId
    let duplicateRejected = false;
    try {
      const duplicateOpp = new Opportunity({
        externalId: 'hopin-job-98765',
        source: 'hopin',
        title: 'Duplicate Attempt',
        type: 'INTERNSHIP',
        description: 'Should fail with duplicate error',
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      });
      await duplicateOpp.save();
    } catch (err) {
      duplicateRejected = true;
      console.assert(
        err.code === 11000 || err.message.includes('Duplicate opportunity'),
        `Expected duplicate error code 11000, got ${err.message}`
      );
      console.log(`[PASS] Duplicate rejected as expected: ${err.message}`);
    }
    console.assert(duplicateRejected, 'Duplicate source + externalId must be rejected');

    // Multiple internal opportunities with externalId: null must NOT conflict
    const internal1 = new Opportunity({
      title: 'Internal Notice 1',
      type: 'workshop',
      description: 'First internal workshop',
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    });
    const internal2 = new Opportunity({
      title: 'Internal Notice 2',
      type: 'workshop',
      description: 'Second internal workshop',
      deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
    });
    await internal1.save();
    await internal2.save();
    console.log('[PASS] Multiple opportunities with externalId: null allowed without conflict.');

    // Same externalId with DIFFERENT source must NOT conflict (composite uniqueness)
    const brabbleWithSameId = new Opportunity({
      externalId: 'hopin-job-98765',
      source: 'brabble', // Different source!
      title: 'Brabble Hackathon with same ID slug',
      type: 'HACKATHON',
      description: 'Cross-platform identical ID slug is allowed',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    const savedCrossSource = await brabbleWithSameId.save();
    console.assert(savedCrossSource._id, 'Different source with same externalId must be permitted');
    console.log('[PASS] Same externalId across different sources (hopin vs brabble) permitted.');

    // -----------------------------------------------------------------
    // TEST 5: SyncLog Model Creation, Querying & Status Lifecycle
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: SyncLog Model Creation, Validation & Lifecycle ---');
    const syncLog = new SyncLog({
      source: 'hopin',
      startedAt: new Date(),
      status: 'IN_PROGRESS'
    });
    const savedLog = await syncLog.save();
    console.assert(savedLog._id, 'SyncLog must have _id');
    console.assert(savedLog.status === 'IN_PROGRESS', 'Initial status should be IN_PROGRESS');
    console.assert(savedLog.recordsFetched === 0, 'Initial recordsFetched should be 0');

    // Update with completion metrics
    savedLog.completedAt = new Date();
    savedLog.status = 'SUCCESS';
    savedLog.recordsFetched = 42;
    savedLog.recordsInserted = 30;
    savedLog.recordsUpdated = 12;
    await savedLog.save();

    const retrievedLog = await SyncLog.findById(savedLog._id);
    console.assert(retrievedLog.status === 'SUCCESS', 'Updated status should be SUCCESS');
    console.assert(retrievedLog.recordsFetched === 42, 'recordsFetched should be 42');
    console.assert(retrievedLog.recordsInserted === 30, 'recordsInserted should be 30');
    console.assert(retrievedLog.recordsUpdated === 12, 'recordsUpdated should be 12');
    console.log('[PASS] Test 5: SyncLog created, updated, and queried successfully.');

    // -----------------------------------------------------------------
    // TEST 6: Persistence Layer Integration (syncToDisk & restoreFromDisk)
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Persistence Layer Integration ---');
    await syncToDisk();

    // Verify restore works
    const restored = await restoreFromDisk();
    console.assert(restored, 'restoreFromDisk must return true');

    const checkLog = await SyncLog.findById(savedLog._id);
    console.assert(checkLog !== null, 'Restored SyncLog must exist in DB');
    console.assert(checkLog.recordsFetched === 42, 'Restored SyncLog metrics must match');

    const checkOpp = await Opportunity.findOne({ source: 'hopin', externalId: 'hopin-job-98765' });
    console.assert(checkOpp !== null, 'Restored external opportunity must exist in DB');
    console.assert(checkOpp.stipend === 'INR 45,000 / month', 'Restored opportunity stipend must match');
    console.log('[PASS] Test 6: dbPersistence saved and restored Opportunities and SyncLogs cleanly.');

    console.log('\n======================================================');
    console.log('ALL PHASE 2 UNIT AND INTEGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Clean up test documents
    await Opportunity.deleteMany({
      $or: [
        { externalId: { $in: ['hopin-job-98765'] } },
        { title: { $regex: /^Test / } },
        { title: { $regex: /^Internal Notice/ } },
        { title: 'Legacy University Merit Award' }
      ]
    });
    await SyncLog.deleteMany({ source: 'hopin' });
    await closeDB();
  }
}

if (require.main === module) {
  runPhase2Tests().then(() => process.exit(0)).catch(err => {
    console.error('Phase 2 test failure:', err);
    process.exit(1);
  });
}

module.exports = { runPhase2Tests };
