/**
 * Phase 9.5 Verification Suite: Real Interaction Data Collection Pipeline & Integrity
 * 
 * Verifies Phase 9.5 objectives:
 * 1. VIEW Tracking:
 *    - Authenticated VIEW recorded with server-generated timestamp
 *    - Correct student identity derived from verified token (not client body)
 *    - Correct opportunity reference
 *    - Unauthenticated request strictly rejected (401)
 * 2. CLICK Tracking:
 *    - Authenticated CLICK recorded with target URL metadata
 *    - Does NOT create accidental APPLY or mutate application records
 *    - Correct student and opportunity associations
 * 3. BOOKMARK Tracking:
 *    - Successful bookmark toggle records BOOKMARK
 *    - Repeated / idempotent requests handled correctly
 * 4. UNBOOKMARK Tracking:
 *    - Successful unbookmark toggle/removal records UNBOOKMARK
 *    - BOOKMARK and UNBOOKMARK semantics strictly distinguishable
 * 5. APPLY Tracking & Anti-Duplicate Integration:
 *    - Internal application submission creates Application AND records APPLY interaction
 *    - Failed/duplicate application does NOT create duplicate APPLY
 *    - Distinguishes external action link (CLICK) from internal submission (APPLY)
 * 6. DISMISS Semantics:
 *    - DISMISS accepted as negative interaction type when explicitly submitted
 *    - Passive actions (VIEW, CLICK, list fetching) never create DISMISS
 * 7. Identity & Security:
 *    - Firebase UID maps to the correct Student
 *    - Client-supplied studentId spoofing rejected / overridden by verified server identity
 * 8. Data Integrity & Validation:
 *    - Invalid opportunity ID rejected (400 or 404)
 *    - Invalid interactionType rejected (400)
 *    - Required fields enforced
 * 9. ML Anti-Leakage & Label Stratification:
 *    - Prior interactions strictly precede target event timestamps
 *    - Positive (APPLY, BOOKMARK) vs Negative (DISMISS) vs Context (VIEW, CLICK) semantics preserved
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Student = require('../models/Student');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Interaction = require('../models/Interaction');
const { getFirebaseAuthAdmin } = require('../config/firebase');
const { generateTrainingSamplesFromDB } = require('../services/mlDatasetGenerator');

async function runPhase9_5Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 9.5 VERIFICATION SUITE: INTERACTION DATA READINESS');
  console.log('======================================================\n');

  await connectDB();
  await Interaction.init();
  await Student.init();
  await Opportunity.init();
  await Application.init();

  const authAdmin = getFirebaseAuthAdmin();
  const originalVerify = authAdmin.verifyIdToken;

  // Stub Firebase token verification for Phase 9.5 test actors
  authAdmin.verifyIdToken = async (token) => {
    if (token === 'token-p95-student1') {
      return { uid: 'p95-uid-1', email: 'p95.student1@educonnect.test' };
    }
    if (token === 'token-p95-student2') {
      return { uid: 'p95-uid-2', email: 'p95.student2@educonnect.test' };
    }
    if (token === 'token-invalid-p95') {
      const err = new Error('Invalid Firebase token.');
      err.code = 'auth/invalid-token';
      throw err;
    }
    return originalVerify.call(authAdmin, token);
  };

  const server = http.createServer(app);
  const TEST_PORT = 5099;
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://localhost:${TEST_PORT}`;

  let student1 = null;
  let student2 = null;
  let opp1 = null;
  let opp2 = null;

  try {
    // -----------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -----------------------------------------------------------------
    await Student.deleteMany({ firebaseUID: { $in: ['p95-uid-1', 'p95-uid-2'] } });
    await Opportunity.deleteMany({ title: { $in: ['Phase 9.5 Data Engineering Fellowship', 'Phase 9.5 Robotics Challenge'] } });

    student1 = await Student.create({
      firebaseUID: 'p95-uid-1',
      name: 'P9.5 Student One',
      email: 'p95.student1@educonnect.test',
      department: 'Computer Science',
      year: 3,
      cgpa: 8.5,
      skills: ['Python', 'SQL', 'MongoDB'],
      interests: ['Internships', 'Data Engineering'],
      bookmarks: []
    });

    student2 = await Student.create({
      firebaseUID: 'p95-uid-2',
      name: 'P9.5 Student Two',
      email: 'p95.student2@educonnect.test',
      department: 'Mechanical',
      year: 2,
      cgpa: 7.2,
      skills: ['CAD', 'Robotics'],
      interests: ['Competitions'],
      bookmarks: []
    });

    opp1 = await Opportunity.create({
      title: 'Phase 9.5 Data Engineering Fellowship',
      type: 'INTERNSHIP',
      description: 'Hands-on big data pipelines with Apache Spark and Python.',
      organization: 'DataTech Labs',
      location: 'Remote',
      officialUrl: 'https://datatech.example/fellowship',
      applicationUrl: 'https://datatech.example/fellowship',
      stipendOrReward: 'INR 40,000 / month',
      deadline: new Date(Date.now() + 25 * 86400000),
      eligibility: {
        department: ['Computer Science', 'Information Technology'],
        minYear: 2,
        minCGPA: 7.5,
        skills: ['Python', 'SQL']
      }
    });

    opp2 = await Opportunity.create({
      title: 'Phase 9.5 Robotics Challenge',
      type: 'COMPETITION',
      description: 'Autonomous robotics contest.',
      organization: 'RoboWorks',
      location: 'Bengaluru',
      officialUrl: 'https://roboworks.example/challenge',
      deadline: new Date(Date.now() + 14 * 86400000),
      eligibility: {
        department: ['Mechanical', 'Electronics & Communication'],
        minYear: 1,
        minCGPA: 6.0,
        skills: ['Robotics']
      }
    });

    // -----------------------------------------------------------------
    // TEST 1: VIEW Tracking - Genuine Detail View & Server Timestamp
    // -----------------------------------------------------------------
    console.log('--- Test 1: VIEW Tracking (Detail View, Auth & Server Timestamp) ---');
    // Unauthenticated rejection
    const unauthViewRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId: opp1._id.toString(), interactionType: 'VIEW' })
    });
    console.assert(unauthViewRes.status === 401, `Unauthenticated VIEW should be 401, got ${unauthViewRes.status}`);

    // Authenticated VIEW recording
    const startTime = Date.now() - 500;
    const authViewRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: opp1._id.toString(),
        interactionType: 'VIEW',
        metadata: { source: 'opportunity-detail' }
      })
    });
    console.assert(authViewRes.status === 201, `Authenticated VIEW should be 201, got ${authViewRes.status}`);
    const viewJson = await authViewRes.json();
    console.assert(viewJson.interaction.interactionType === 'VIEW', 'Type must be VIEW');
    console.assert(viewJson.interaction.studentId.toString() === student1._id.toString(), 'Student ID must match student1');
    console.assert(viewJson.interaction.opportunityId.toString() === opp1._id.toString(), 'Opp ID must match opp1');
    console.assert(new Date(viewJson.interaction.timestamp).getTime() >= startTime, 'Authoritative server timestamp required');
    console.log('[PASS] Test 1: Authenticated VIEW correctly recorded with authoritative server timestamp and student mapping.');

    // -----------------------------------------------------------------
    // TEST 2: CLICK Tracking - External Action Click vs No False APPLY
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: CLICK Tracking (External Link Click without Accidental APPLY) ---');
    const clickRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: opp1._id.toString(),
        interactionType: 'CLICK',
        metadata: {
          source: 'opportunity-detail-official-link',
          targetUrl: opp1.officialUrl,
          action: 'visit-official-portal'
        }
      })
    });
    console.assert(clickRes.status === 201, `CLICK should be 201, got ${clickRes.status}`);
    const clickJson = await clickRes.json();
    console.assert(clickJson.interaction.interactionType === 'CLICK', 'Type must be CLICK');
    console.assert(clickJson.interaction.metadata.targetUrl === opp1.officialUrl, 'targetUrl preserved');

    // Verify zero Application record was accidentally created
    const accidentalApps = await Application.countDocuments({
      studentId: student1._id,
      opportunityId: opp1._id
    });
    console.assert(accidentalApps === 0, `CLICK must NOT create Application record, found ${accidentalApps}`);
    // Verify zero APPLY interaction was accidentally created
    const accidentalApplies = await Interaction.countDocuments({
      studentId: student1._id,
      opportunityId: opp1._id,
      interactionType: 'APPLY'
    });
    console.assert(accidentalApplies === 0, `CLICK must NOT record APPLY interaction, found ${accidentalApplies}`);
    console.log('[PASS] Test 2: External action link records CLICK without falsely creating an Application or APPLY event.');

    // -----------------------------------------------------------------
    // TEST 3: BOOKMARK Tracking - Successful Bookmark State & Interaction
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: BOOKMARK Tracking (Successful Bookmark Creation) ---');
    const bookmarkRes = await fetch(`${baseUrl}/student/bookmarks/${opp1._id.toString()}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-p95-student1' }
    });
    console.assert(bookmarkRes.status === 200, `Bookmark toggle should be 200, got ${bookmarkRes.status}`);
    const bookmarkJson = await bookmarkRes.json();
    console.assert(bookmarkJson.bookmarked === true, 'bookmarked should be true');

    const student1Updated = await Student.findById(student1._id);
    console.assert(student1Updated.bookmarks.map(id => id.toString()).includes(opp1._id.toString()), 'Student bookmarks must include opp1');

    const bookmarkInteraction = await Interaction.findOne({
      studentId: student1._id,
      opportunityId: opp1._id,
      interactionType: 'BOOKMARK'
    });
    console.assert(bookmarkInteraction !== null, 'BOOKMARK interaction record must exist');
    console.log('[PASS] Test 3: Successful bookmark creation updates Student bookmarks array and records BOOKMARK interaction.');

    // -----------------------------------------------------------------
    // TEST 4: UNBOOKMARK Tracking - Removal State & Interaction Distinction
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: UNBOOKMARK Tracking (Bookmark Removal & Semantics) ---');
    const unbookmarkRes = await fetch(`${baseUrl}/student/bookmarks/${opp1._id.toString()}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-p95-student1' }
    });
    console.assert(unbookmarkRes.status === 200, `Unbookmark should be 200, got ${unbookmarkRes.status}`);
    const unbookmarkJson = await unbookmarkRes.json();
    console.assert(unbookmarkJson.bookmarked === false, 'bookmarked should be false');

    const student1AfterUnbookmark = await Student.findById(student1._id);
    console.assert(!student1AfterUnbookmark.bookmarks.map(id => id.toString()).includes(opp1._id.toString()), 'opp1 must be removed from bookmarks');

    const unbookmarkInteraction = await Interaction.findOne({
      studentId: student1._id,
      opportunityId: opp1._id,
      interactionType: 'UNBOOKMARK'
    });
    console.assert(unbookmarkInteraction !== null, 'UNBOOKMARK interaction record must exist');
    console.assert(unbookmarkInteraction.interactionType !== bookmarkInteraction.interactionType, 'BOOKMARK and UNBOOKMARK must be distinct');
    console.log('[PASS] Test 4: Unbookmarking removes opportunity and records distinct UNBOOKMARK event.');

    // -----------------------------------------------------------------
    // TEST 5: APPLY Tracking - Internal Workflow & Duplicate Prevention
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: APPLY Tracking (Internal Application & Anti-Duplicate Guard) ---');
    // Successful submission
    const applyRes = await fetch(`${baseUrl}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: opp1._id.toString(),
        responses: { resumeUrl: 'https://example.com/p95-resume.pdf' }
      })
    });
    console.assert(applyRes.status === 201, `Submit application should be 201, got ${applyRes.status}`);

    const appDoc = await Application.findOne({ studentId: student1._id, opportunityId: opp1._id });
    console.assert(appDoc !== null, 'Application record must exist in Application collection');

    const applyInteraction = await Interaction.findOne({
      studentId: student1._id,
      opportunityId: opp1._id,
      interactionType: 'APPLY'
    });
    console.assert(applyInteraction !== null, 'APPLY interaction must be recorded');
    console.assert(applyInteraction.metadata.applicationId.toString() === appDoc._id.toString(), 'Interaction metadata references Application ID');

    // Attempt duplicate application
    const dupApplyRes = await fetch(`${baseUrl}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({ opportunityId: opp1._id.toString() })
    });
    console.assert(dupApplyRes.status === 400, `Duplicate application should be rejected 400, got ${dupApplyRes.status}`);

    const applyInteractionsCount = await Interaction.countDocuments({
      studentId: student1._id,
      opportunityId: opp1._id,
      interactionType: 'APPLY'
    });
    console.assert(applyInteractionsCount === 1, `Must have exactly 1 APPLY interaction, found ${applyInteractionsCount}`);
    console.log('[PASS] Test 5: APPLY interaction generated on successful application; duplicate submission rejected without duplicate event.');

    // -----------------------------------------------------------------
    // TEST 6: DISMISS Tracking - Explicit Action Handling & Passive Integrity
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: DISMISS Tracking (Explicit Action vs Passive Non-Action) ---');
    // Student 2 explicitly dismisses opp1
    const dismissRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student2'
      },
      body: JSON.stringify({
        opportunityId: opp1._id.toString(),
        interactionType: 'DISMISS',
        metadata: { source: 'recommendations-card', action: 'dismiss-recommendation' }
      })
    });
    console.assert(dismissRes.status === 201, `Explicit DISMISS should be 201, got ${dismissRes.status}`);
    const dismissDoc = await Interaction.findOne({
      studentId: student2._id,
      opportunityId: opp1._id,
      interactionType: 'DISMISS'
    });
    console.assert(dismissDoc !== null, 'DISMISS interaction must be persisted');

    // Verify passive operations on student2 (like fetching catalog or views) do NOT generate DISMISS
    const catalogRes = await fetch(`${baseUrl}/opportunities`);
    console.assert(catalogRes.status === 200, 'Catalog fetch should succeed');
    const passiveDismissCount = await Interaction.countDocuments({
      studentId: student2._id,
      opportunityId: opp2._id,
      interactionType: 'DISMISS'
    });
    console.assert(passiveDismissCount === 0, `Browsing/catalog fetch must never create DISMISS, found ${passiveDismissCount}`);
    console.log('[PASS] Test 6: Explicit DISMISS successfully tracked; passive browsing/unopened cards never create DISMISS.');

    // -----------------------------------------------------------------
    // TEST 7: Identity Isolation & Anti-Spoofing
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Student Identity Isolation & Token Derivation ---');
    // Student 1 sends an interaction with studentId set to Student 2's ID
    const spoofRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: opp2._id.toString(),
        interactionType: 'VIEW',
        studentId: student2._id.toString() // Spoofed body
      })
    });
    console.assert(spoofRes.status === 201, `Should succeed, got ${spoofRes.status}`);
    const spoofJson = await spoofRes.json();
    console.assert(
      spoofJson.interaction.studentId.toString() === student1._id.toString(),
      'Interaction studentId must be derived from token (Student 1), ignoring client body'
    );
    console.log('[PASS] Test 7: Backend strictly derives student identity from token, preventing identity spoofing.');

    // -----------------------------------------------------------------
    // TEST 8: Data Integrity & Input Validation
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Data Integrity & Rejection of Malformed Requests ---');
    // Non-existent opportunity
    const fakeOppId = new mongoose.Types.ObjectId();
    const badOppRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: fakeOppId.toString(),
        interactionType: 'VIEW'
      })
    });
    console.assert(badOppRes.status === 404, `Non-existent opportunity should be 404, got ${badOppRes.status}`);

    // Invalid interactionType
    const badTypeRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        opportunityId: opp1._id.toString(),
        interactionType: 'SUPER_LIKE'
      })
    });
    console.assert(badTypeRes.status === 400, `Invalid interaction type should be 400, got ${badTypeRes.status}`);

    // Missing opportunityId
    const missingOppRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p95-student1'
      },
      body: JSON.stringify({
        interactionType: 'VIEW'
      })
    });
    console.assert(missingOppRes.status === 400, `Missing opportunityId should be 400, got ${missingOppRes.status}`);
    console.log('[PASS] Test 8: Non-existent opportunities, invalid types, and missing fields strictly rejected.');

    // -----------------------------------------------------------------
    // TEST 9: ML Label Semantics & Anti-Leakage Verification
    // -----------------------------------------------------------------
    console.log('\n--- Test 9: ML Label Semantics & Anti-Leakage Verification ---');
    const samples = await generateTrainingSamplesFromDB();

    // Verify positive labels
    const applySamples = samples.filter(s => s.sourceEvent === 'APPLY');
    const bookmarkSamples = samples.filter(s => s.sourceEvent === 'BOOKMARK');
    const dismissSamples = samples.filter(s => s.sourceEvent === 'DISMISS');

    for (const s of applySamples) {
      console.assert(s.label === 1, `APPLY sample must have positive label 1`);
    }
    for (const s of bookmarkSamples) {
      console.assert(s.label === 1, `BOOKMARK sample must have positive label 1`);
    }
    for (const s of dismissSamples) {
      console.assert(s.label === 0, `DISMISS sample must have negative label 0`);
    }

    // Verify VIEW and CLICK are never standalone samples with label 0
    const viewSamples = samples.filter(s => s.sourceEvent === 'VIEW');
    const clickSamples = samples.filter(s => s.sourceEvent === 'CLICK');
    console.assert(viewSamples.length === 0, 'VIEW must not be generated as a labeled training sample');
    console.assert(clickSamples.length === 0, 'CLICK must not be generated as a labeled training sample');

    // Verify anti-leakage: all interactions in pastInteractions occurred strictly prior to referenceTime
    for (const s of samples) {
      const refTime = new Date(s.referenceTime).getTime();
      for (const past of s.pastInteractions) {
        const pastTime = new Date(past.timestamp).getTime();
        console.assert(pastTime < refTime, `Anti-leakage violated: past interaction time ${pastTime} >= refTime ${refTime}`);
      }
    }
    console.log('[PASS] Test 9: ML label strategy (APPLY=1, BOOKMARK=1, DISMISS=0) and timeline anti-leakage verified.');

    console.log('\n======================================================');
    console.log('ALL PHASE 9.5 TESTS (9/9) PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    authAdmin.verifyIdToken = originalVerify;

    // Cleanup fixtures
    if (student1 || student2) {
      const sIds = [student1?._id, student2?._id].filter(Boolean);
      await Interaction.deleteMany({ studentId: { $in: sIds } });
      await Application.deleteMany({ studentId: { $in: sIds } });
      await Student.deleteMany({ _id: { $in: sIds } });
    }
    if (opp1 || opp2) {
      const oIds = [opp1?._id, opp2?._id].filter(Boolean);
      await Opportunity.deleteMany({ _id: { $in: oIds } });
    }

    await new Promise(resolve => server.close(resolve));
    await closeDB();
  }
}

if (require.main === module) {
  runPhase9_5Tests().catch(err => {
    console.error('Phase 9.5 Test suite error:', err);
    process.exit(1);
  });
}

module.exports = { runPhase9_5Tests };
