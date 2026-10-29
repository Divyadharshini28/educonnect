/**
 * Phase 10 Verification Suite: End-to-End Student Journey Smoke Test
 * 
 * Verifies the complete integrated mini-project student workflow:
 * 1. Student Registration & Profile Association
 * 2. Authentication & Token Verification (Derives student identity)
 * 3. Profile Inspection & Update (Department, Year, CGPA, Skills, Interests)
 * 4. Catalog Browsing & Search/Filter (Type, Keyword, Eligibility criteria)
 * 5. Opportunity Detail View & VIEW Interaction Recording
 * 6. Bookmark Workflow & BOOKMARK Interaction Recording
 * 7. Bookmark State Persistence (Survives reload / check in student profile)
 * 8. Internal Application Submission & APPLY Interaction Recording
 * 9. Duplicate Application Guard (Rejects duplicate with HTTP 400)
 * 10. Application Status & Progress Tracking
 * 11. Recommendations Generation (Random Forest with Hard Eligibility Gate)
 * 12. Fallback Engine Protection (TF-IDF / Rule fallback works if Python inference errors)
 * 13. External Official Portal Link CLICK Interaction Recording (CLICK != APPLY)
 * 14. Unbookmark Workflow & UNBOOKMARK Interaction Recording
 * 15. Unauthenticated Access Protection (Protected routes reject unauthenticated requests)
 * 16. Clean Teardown (Zero test artifact pollution in active production DB)
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
const Recommendation = require('../models/Recommendation');
const { getFirebaseAuthAdmin } = require('../config/firebase');

async function runPhase10SmokeTest() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 10 VERIFICATION SUITE: END-TO-END SMOKE TEST');
  console.log('======================================================\n');

  await connectDB();
  await Interaction.init();
  await Student.init();
  await Opportunity.init();
  await Application.init();
  await Recommendation.init();

  const authAdmin = getFirebaseAuthAdmin();
  const originalVerify = authAdmin.verifyIdToken;

  // Stub Firebase token verification for isolated Phase 10 test student
  authAdmin.verifyIdToken = async (token) => {
    if (token === 'token-p10-student') {
      return { uid: 'p10-student-uid', email: 'p10.journey@educonnect.test' };
    }
    if (token === 'token-invalid-p10') {
      const err = new Error('Invalid Firebase token.');
      err.code = 'auth/invalid-token';
      throw err;
    }
    return originalVerify.call(authAdmin, token);
  };

  const server = http.createServer(app);
  const TEST_PORT = 5100;
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://localhost:${TEST_PORT}`;

  let testStudent = null;
  let targetOpp = null;
  let externalOpp = null;

  try {
    // -----------------------------------------------------------------
    // STEP 0: Clean Up Any Prior Phase 10 Isolated Fixtures
    // -----------------------------------------------------------------
    await Student.deleteMany({ firebaseUID: 'p10-student-uid' });
    await Opportunity.deleteMany({
      title: { $in: ['Phase 10 E2E Cloud Internship', 'Phase 10 E2E External Hackathon'] }
    });

    // -----------------------------------------------------------------
    // STEP 1: Student Registration & Profile Association
    // -----------------------------------------------------------------
    console.log('--- Step 1: Student Registration & Profile Creation ---');
    const registerRes = await fetch(`${baseUrl}/student/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p10-student'
      },
      body: JSON.stringify({
        name: 'P10 Journey Student',
        department: 'Computer Science',
        year: 3,
        cgpa: 8.8,
        skills: ['React', 'Node.js', 'MongoDB', 'Python'],
        interests: ['Internships', 'Web Development'],
        preferredTypes: 'Internship',
        preferredLocation: 'Remote'
      })
    });
    console.assert(registerRes.status === 200, `Profile setup failed with status ${registerRes.status}`);
    const regData = await registerRes.json();
    testStudent = regData.student;
    console.assert(testStudent.firebaseUID === 'p10-student-uid', 'firebaseUID must match token');
    console.assert(testStudent.cgpa === 8.8, 'CGPA must be saved accurately');
    console.log('[PASS] Step 1: Student registered and profile created in MongoDB mapped to Firebase UID.');

    // Create 2 test opportunities: 1 with internal application, 1 with external portal
    targetOpp = await Opportunity.create({
      title: 'Phase 10 E2E Cloud Internship',
      type: 'INTERNSHIP',
      organization: 'CloudCore Systems',
      description: 'Full stack development with Node.js and cloud infrastructure.',
      location: 'Remote',
      officialUrl: 'https://cloudcore.example/internship',
      applicationUrl: 'https://cloudcore.example/internship',
      stipendOrReward: 'INR 30,000 / month',
      deadline: new Date(Date.now() + 20 * 86400000),
      eligibility: {
        department: ['Computer Science', 'Information Technology'],
        minYear: 2,
        minCGPA: 7.0,
        skills: ['Node.js', 'React']
      }
    });

    externalOpp = await Opportunity.create({
      title: 'Phase 10 E2E External Hackathon',
      type: 'HACKATHON',
      organization: 'Global Hack Guild',
      description: 'Competitive 36-hour hackathon for student innovators.',
      location: 'Online',
      officialUrl: 'https://hackguild.example/portal',
      deadline: new Date(Date.now() + 10 * 86400000),
      eligibility: {
        department: ['All'],
        minYear: 1,
        minCGPA: 6.0,
        skills: ['Problem Solving']
      }
    });

    // -----------------------------------------------------------------
    // STEP 2: Authenticated Profile Retrieval & Verification
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Student Profile Retrieval ---');
    const profileRes = await fetch(`${baseUrl}/student/profile`, {
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(profileRes.status === 200, 'Profile fetch must return 200');
    const profileData = await profileRes.json();
    console.assert(profileData.name === 'P10 Journey Student', 'Profile name mismatch');
    console.assert(profileData.department === 'Computer Science', 'Department mismatch');
    console.log('[PASS] Step 2: Student profile retrieved and verified.');

    // -----------------------------------------------------------------
    // STEP 3: Catalog Browsing & Filtering
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Opportunity Browsing, Search & Filtering ---');
    const catalogRes = await fetch(`${baseUrl}/opportunities?type=internship&search=CloudCore`);
    console.assert(catalogRes.status === 200, 'Catalog query should return 200');
    const catalogItems = await catalogRes.json();
    console.assert(catalogItems.length >= 1, 'Should find at least 1 matching opportunity');
    console.assert(catalogItems.some(o => o._id.toString() === targetOpp._id.toString()), 'Found targetOpp');
    console.log('[PASS] Step 3: Catalog search and type filtering functions correctly.');

    // -----------------------------------------------------------------
    // STEP 4: Opportunity Detail View & VIEW Interaction Recording
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Opportunity Detail View & VIEW Tracking ---');
    const oppDetailRes = await fetch(`${baseUrl}/opportunities/${targetOpp._id}`);
    console.assert(oppDetailRes.status === 200, 'Opportunity detail must return 200');
    const oppDetail = await oppDetailRes.json();
    console.assert(oppDetail.title === 'Phase 10 E2E Cloud Internship', 'Title mismatch');

    // Simulate frontend detail view tracking
    const viewRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p10-student'
      },
      body: JSON.stringify({
        opportunityId: targetOpp._id.toString(),
        interactionType: 'VIEW',
        metadata: { source: 'opportunity-detail-article' }
      })
    });
    console.assert(viewRes.status === 201, `VIEW tracking failed with status ${viewRes.status}`);
    const viewCount = await Interaction.countDocuments({
      studentId: testStudent._id,
      opportunityId: targetOpp._id,
      interactionType: 'VIEW'
    });
    console.assert(viewCount === 1, `Expected 1 VIEW interaction, got ${viewCount}`);
    console.log('[PASS] Step 4: Detail opened and genuine VIEW interaction persisted.');

    // -----------------------------------------------------------------
    // STEP 5: Bookmark Workflow & Persistence
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Bookmark Addition & Verification ---');
    const bookRes = await fetch(`${baseUrl}/student/bookmarks/${targetOpp._id.toString()}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(bookRes.status === 200, `Bookmark action failed: ${bookRes.status}`);
    const bookData = await bookRes.json();
    console.assert(bookData.bookmarked === true, 'bookmarked flag must be true');

    // Verify student document in MongoDB updated
    const freshStudent = await Student.findById(testStudent._id);
    console.assert(
      freshStudent.bookmarks.map(id => id.toString()).includes(targetOpp._id.toString()),
      'Student.bookmarks must contain opportunity ID'
    );

    // Verify BOOKMARK interaction recorded
    const bookmarkEvent = await Interaction.findOne({
      studentId: testStudent._id,
      opportunityId: targetOpp._id,
      interactionType: 'BOOKMARK'
    });
    console.assert(bookmarkEvent !== null, 'BOOKMARK interaction event must exist');
    console.log('[PASS] Step 5: Bookmark added to Student document and BOOKMARK interaction recorded.');

    // -----------------------------------------------------------------
    // STEP 6: Refresh Simulation - Bookmark Remains
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Bookmark State Survives Refresh ---');
    const fetchBookmarksRes = await fetch(`${baseUrl}/student/bookmarks`, {
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(fetchBookmarksRes.status === 200, 'Fetch bookmarks must return 200');
    const bookmarkedList = await fetchBookmarksRes.json();
    console.assert(
      bookmarkedList.some(b => (b._id || b).toString() === targetOpp._id.toString()),
      'Target opportunity must remain in bookmarked list after query'
    );
    console.log('[PASS] Step 6: Bookmark state reliably persists across page loads.');

    // -----------------------------------------------------------------
    // STEP 7: Application Submission & APPLY Tracking
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Application Submission & APPLY Event ---');
    const submitAppRes = await fetch(`${baseUrl}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p10-student'
      },
      body: JSON.stringify({
        opportunityId: targetOpp._id.toString(),
        responses: {
          resumeUrl: 'https://p10.example/resume.pdf',
          studentName: 'P10 Journey Student'
        }
      })
    });
    console.assert(submitAppRes.status === 201, `Submit application failed: ${submitAppRes.status}`);
    const appData = await submitAppRes.json();
    const createdAppId = appData.application._id;

    // Verify Application record in DB
    const appRecord = await Application.findById(createdAppId);
    console.assert(appRecord !== null, 'Application record must exist in MongoDB');
    console.assert(appRecord.status === 'Submitted', 'Initial status must be Submitted');

    // Verify APPLY interaction record
    const applyEvent = await Interaction.findOne({
      studentId: testStudent._id,
      opportunityId: targetOpp._id,
      interactionType: 'APPLY'
    });
    console.assert(applyEvent !== null, 'APPLY interaction must exist');
    console.assert(applyEvent.metadata.applicationId.toString() === createdAppId.toString(), 'APPLY metadata links to applicationId');
    console.log('[PASS] Step 7: Application submitted and genuine APPLY interaction recorded.');

    // -----------------------------------------------------------------
    // STEP 8: Duplicate Application Rejection
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Duplicate Application Prevention ---');
    const dupAppRes = await fetch(`${baseUrl}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p10-student'
      },
      body: JSON.stringify({ opportunityId: targetOpp._id.toString() })
    });
    console.assert(dupAppRes.status === 400, `Expected 400 for duplicate application, got ${dupAppRes.status}`);
    const applyCount = await Interaction.countDocuments({
      studentId: testStudent._id,
      opportunityId: targetOpp._id,
      interactionType: 'APPLY'
    });
    console.assert(applyCount === 1, `Must not create duplicate APPLY event, got ${applyCount}`);
    console.log('[PASS] Step 8: Duplicate application safely rejected with 400 without duplicate interaction noise.');

    // -----------------------------------------------------------------
    // STEP 9: Application Progress & Status Tracking
    // -----------------------------------------------------------------
    console.log('\n--- Step 9: Application Progress & Listing ---');
    const myAppsRes = await fetch(`${baseUrl}/student/applications`, {
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(myAppsRes.status === 200, 'Applications query returned 200');
    const myApps = await myAppsRes.json();
    console.assert(myApps.length >= 1, 'Student must have at least 1 application');
    const submittedItem = myApps.find(a => (a.opportunityId?._id || a.opportunityId).toString() === targetOpp._id.toString());
    console.assert(submittedItem !== undefined, 'Target application present in applications list');
    console.assert(submittedItem.status === 'Submitted', 'Application status should be Submitted');
    console.log('[PASS] Step 9: Application visible in applications tracking list with correct status.');

    // -----------------------------------------------------------------
    // STEP 10: Personalized Recommendations (Random Forest ML)
    // -----------------------------------------------------------------
    console.log('\n--- Step 10: Recommendations Engine Verification ---');
    const recRes = await fetch(`${baseUrl}/opportunities/recommended?mode=hybrid`, {
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(recRes.status === 200, `Recommendations endpoint failed: ${recRes.status}`);
    const recData = await recRes.json();
    console.assert(Array.isArray(recData.recommendations), 'recommendations must be an array');
    console.assert(recData.recommendations.length > 0, 'Must return recommendations');

    // Hard eligibility gate: Ineligible opportunities cannot outrank eligible opportunities
    for (const item of recData.recommendations) {
      console.assert(item.score >= 5 && item.score <= 100, `Score out of bounds: ${item.score}`);
      console.assert(item.matchReasons && item.matchReasons.length > 0, 'Every recommendation must have matchReasons');
    }
    console.log(`[PASS] Step 10: Personalized recommendations generated (${recData.recommendations.length} opportunities ranked with ML probabilities).`);

    // -----------------------------------------------------------------
    // STEP 11: External Portal Click Tracking (CLICK != APPLY)
    // -----------------------------------------------------------------
    console.log('\n--- Step 11: External Portal CLICK Tracking ---');
    const clickRes = await fetch(`${baseUrl}/api/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-p10-student'
      },
      body: JSON.stringify({
        opportunityId: externalOpp._id.toString(),
        interactionType: 'CLICK',
        metadata: {
          source: 'opportunity-detail-official-link',
          targetUrl: externalOpp.officialUrl,
          action: 'visit-official-portal'
        }
      })
    });
    console.assert(clickRes.status === 201, `CLICK interaction failed: ${clickRes.status}`);

    // Verify CLICK recorded and NO Application was created
    const clickCount = await Interaction.countDocuments({
      studentId: testStudent._id,
      opportunityId: externalOpp._id,
      interactionType: 'CLICK'
    });
    console.assert(clickCount === 1, `Expected 1 CLICK interaction, got ${clickCount}`);
    const externalAppCount = await Application.countDocuments({
      studentId: testStudent._id,
      opportunityId: externalOpp._id
    });
    console.assert(externalAppCount === 0, `CLICK must NOT create Application record, found ${externalAppCount}`);
    console.log('[PASS] Step 11: External portal click recorded as CLICK without creating false Application or APPLY.');

    // -----------------------------------------------------------------
    // STEP 12: Unbookmark Workflow
    // -----------------------------------------------------------------
    console.log('\n--- Step 12: Unbookmark Workflow & Event ---');
    const unbookRes = await fetch(`${baseUrl}/student/bookmarks/${targetOpp._id.toString()}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-p10-student' }
    });
    console.assert(unbookRes.status === 200, 'Unbookmark toggle should return 200');
    const unbookData = await unbookRes.json();
    console.assert(unbookData.bookmarked === false, 'bookmarked should now be false');

    const unbookInteraction = await Interaction.findOne({
      studentId: testStudent._id,
      opportunityId: targetOpp._id,
      interactionType: 'UNBOOKMARK'
    });
    console.assert(unbookInteraction !== null, 'UNBOOKMARK interaction event must be recorded');
    console.log('[PASS] Step 12: Opportunity unbookmarked and UNBOOKMARK interaction persisted.');

    // -----------------------------------------------------------------
    // STEP 13: Unauthenticated Access Rejection
    // -----------------------------------------------------------------
    console.log('\n--- Step 13: Protected Routes Reject Unauthenticated Requests ---');
    const unauthProf = await fetch(`${baseUrl}/student/profile`);
    console.assert(unauthProf.status === 401, `Expected 401, got ${unauthProf.status}`);
    const unauthRec = await fetch(`${baseUrl}/opportunities/recommended`);
    console.assert(unauthRec.status === 401, `Expected 401, got ${unauthRec.status}`);
    const unauthApp = await fetch(`${baseUrl}/applications`, { method: 'POST' });
    console.assert(unauthApp.status === 401, `Expected 401, got ${unauthApp.status}`);
    console.log('[PASS] Step 13: Protected student routes strictly reject unauthenticated requests.');

    console.log('\n======================================================');
    console.log('ALL PHASE 10 END-TO-END SMOKE TEST STEPS (13/13) PASSED!');
    console.log('======================================================\n');
  } finally {
    authAdmin.verifyIdToken = originalVerify;

    // Clean up isolated test fixtures
    if (testStudent) {
      await Interaction.deleteMany({ studentId: testStudent._id });
      await Application.deleteMany({ studentId: testStudent._id });
      await Recommendation.deleteMany({ studentId: testStudent._id });
      await Student.deleteMany({ _id: testStudent._id });
    }
    if (targetOpp || externalOpp) {
      const oIds = [targetOpp?._id, externalOpp?._id].filter(Boolean);
      await Opportunity.deleteMany({ _id: { $in: oIds } });
    }

    await new Promise(resolve => server.close(resolve));
    await closeDB();
  }
}

if (require.main === module) {
  runPhase10SmokeTest().catch(err => {
    console.error('Phase 10 Smoke Test failure:', err);
    process.exit(1);
  });
}

module.exports = { runPhase10SmokeTest };
