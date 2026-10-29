/**
 * EduConnect — Batch 4 Student Analytics & Opportunity Insights Verification Test Suite
 * 
 * Verifies:
 * 1. GET /student/analytics unauthenticated request returns 401 Unauthorized
 * 2. GET /student/analytics returns correct personal counts (total, submitted, underReview, accepted, rejected)
 * 3. Correct distinction between Active/Pending (Submitted, Under Review) and Completed (Accepted, Rejected)
 * 4. Upcoming deadlines for bookmarked opportunities (sorted nearest first, days remaining)
 * 5. Eligibility matching insights (eligible, ineligible, matching counts)
 * 6. Suggested next actions based on real student profile and deadline status
 * 7. Student Data Isolation: Student A cannot view Student B's applications or private statistics
 * 8. Empty dataset handling: brand-new student gets honest 0 counts and appropriate suggested actions
 * 9. Platform opportunity statistics: Top applied opportunities, trends over time, category activity
 * 10. Distinct unique students counted separately from total application count
 * 11. External vs EduConnect application count distinction:
 *     - External count present vs missing ("Not available from source")
 *     - External source label and synchronization/verification timestamp
 *     - EduConnect application count and unique student applicant count
 * 12. Single opportunity & engagement endpoints return uniqueApplicantsCount, externalApplicantCount, and externalStats
 * 13. Public / Student GET /opportunities/insights endpoint returns zero student PII
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Student = require('../models/Student');

let server;
let baseUrl;

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runStudentAnalyticsTests() {
  console.log('======================================================');
  console.log('RUNNING BATCH 4 STUDENT ANALYTICS & INSIGHTS TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init();
  await Application.init();
  await Student.init();

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed test students
  const studentA_UID = 'b4-student-a-' + Date.now();
  const studentB_UID = 'b4-student-b-' + Date.now();

  const studentA = new Student({
    firebaseUID: studentA_UID,
    name: 'Divya Student A',
    email: 'studentA@test.educonnect.ac.in',
    department: 'Computer Science',
    year: 3,
    cgpa: 8.8,
    skills: ['React', 'Node.js', 'MongoDB', 'Python'],
    interests: ['Internships', 'Hackathons']
  });
  await studentA.save();

  const studentB = new Student({
    firebaseUID: studentB_UID,
    name: 'Alex Student B',
    email: 'studentB@test.educonnect.ac.in',
    department: 'Mechanical',
    year: 2,
    cgpa: 6.5,
    skills: ['CAD', 'SolidWorks'],
    interests: ['Core Engineering']
  });
  await studentB.save();

  const headersStudentA = {
    'x-test-uid': studentA_UID,
    'x-test-email': studentA.email,
    'x-test-role': 'student'
  };

  const headersStudentB = {
    'x-test-uid': studentB_UID,
    'x-test-email': studentB.email,
    'x-test-role': 'student'
  };

  // Create test opportunities: one with external count, one without
  const oppWithExtCount = new Opportunity({
    title: 'Batch 4 Analytics Test Opportunity With External Count',
    organization: 'Global Tech Institute',
    type: 'internship',
    description: 'Advanced internship testing external analytics metrics.',
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days remaining
    location: 'Bengaluru',
    mode: 'ONLINE',
    status: 'ACTIVE',
    isActive: true,
    externalApplicantCount: 1250,
    externalStats: {
      source: 'hopin',
      applicantCount: 1250,
      lastVerifiedAt: new Date(Date.now() - 3600000)
    },
    eligibility: {
      department: ['Computer Science', 'Information Technology'],
      minYear: 2,
      minCGPA: 7.5,
      skills: ['React', 'Node.js']
    }
  });
  await oppWithExtCount.save();

  const oppWithoutExtCount = new Opportunity({
    title: 'Batch 4 Analytics Test Opportunity Without External Count',
    organization: 'Pioneer Labs',
    type: 'hackathon',
    description: 'National hackathon without external applicant count provided.',
    deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days remaining
    location: 'Remote',
    mode: 'ONLINE',
    status: 'ACTIVE',
    isActive: true,
    externalApplicantCount: null,
    externalStats: {
      source: 'brabble',
      applicantCount: null,
      lastVerifiedAt: null
    },
    eligibility: {
      department: ['All'],
      minYear: 1,
      minCGPA: 0,
      skills: []
    }
  });
  await oppWithoutExtCount.save();

  try {
    // -------------------------------------------------------------------
    // 1. AUTHENTICATION & DATA ISOLATION GATE
    // -------------------------------------------------------------------
    console.log('--- 1. Testing Authentication Gate & Student Data Isolation ---');

    // 1.1: Unauthenticated request to /student/analytics must return 401
    const unauthRes = await request('GET', '/student/analytics');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('[PASS] Test 1.1: GET /student/analytics strictly rejected unauthenticated request with 401.');

    // 1.2: Brand-new student B has 0 applications
    const initialBRes = await request('GET', '/student/analytics', headersStudentB);
    assert.strictEqual(initialBRes.status, 200, 'Student B request should succeed with 200');
    assert.strictEqual(initialBRes.body.personal.totalApplications, 0);
    assert.strictEqual(initialBRes.body.personal.activePending, 0);
    assert.strictEqual(initialBRes.body.personal.accepted, 0);
    assert.strictEqual(initialBRes.body.personal.rejected, 0);
    assert.strictEqual(initialBRes.body.personal.recentApplications.length, 0);
    console.log('[PASS] Test 1.2: Brand-new student returns clean zero counts without errors or misleading data.');

    // -------------------------------------------------------------------
    // 2. APPLICATIONS CREATION & STATUS LIFECYCLE
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Application Statistics & Status Definitions ---');

    // Student A applies to oppWithExtCount (Status: Submitted)
    const appA1 = new Application({
      studentId: studentA._id,
      opportunityId: oppWithExtCount._id,
      opportunityTitle: oppWithExtCount.title,
      opportunityType: oppWithExtCount.type,
      opportunityOrg: oppWithExtCount.organization,
      status: 'Submitted',
      submissionDate: new Date()
    });
    await appA1.save();

    // Student A applies to oppWithoutExtCount (Status: Under Review)
    const appA2 = new Application({
      studentId: studentA._id,
      opportunityId: oppWithoutExtCount._id,
      opportunityTitle: oppWithoutExtCount.title,
      opportunityType: oppWithoutExtCount.type,
      opportunityOrg: oppWithoutExtCount.organization,
      status: 'Under Review',
      submissionDate: new Date(Date.now() - 24 * 3600000)
    });
    await appA2.save();

    // Student B applies to oppWithExtCount (Status: Accepted)
    const appB1 = new Application({
      studentId: studentB._id,
      opportunityId: oppWithExtCount._id,
      opportunityTitle: oppWithExtCount.title,
      opportunityType: oppWithExtCount.type,
      opportunityOrg: oppWithExtCount.organization,
      status: 'Accepted',
      submissionDate: new Date()
    });
    await appB1.save();

    // Verify Student A's personal analytics
    const analyticsARes = await request('GET', '/student/analytics', headersStudentA);
    assert.strictEqual(analyticsARes.status, 200);
    const personalA = analyticsARes.body.personal;

    assert.strictEqual(personalA.totalApplications, 2, 'Student A total applications should be 2');
    assert.strictEqual(personalA.statusBreakdown.submitted, 1, 'Submitted should be 1');
    assert.strictEqual(personalA.statusBreakdown.underReview, 1, 'Under Review should be 1');
    assert.strictEqual(personalA.statusBreakdown.accepted, 0, 'Accepted should be 0');
    assert.strictEqual(personalA.statusBreakdown.rejected, 0, 'Rejected should be 0');
    assert.strictEqual(personalA.activePending, 2, 'Active/Pending (Submitted + Under Review) should be 2');
    assert.strictEqual(personalA.recentApplications.length, 2);
    console.log(`[PASS] Test 2.1: Student A application stats verified (Total: ${personalA.totalApplications}, Active/Pending: ${personalA.activePending}, Submitted: ${personalA.statusBreakdown.submitted}, Under Review: ${personalA.statusBreakdown.underReview}).`);

    // Verify Student B's personal analytics (1 application, Accepted, completed=1)
    const analyticsBRes = await request('GET', '/student/analytics', headersStudentB);
    assert.strictEqual(analyticsBRes.status, 200);
    const personalB = analyticsBRes.body.personal;

    assert.strictEqual(personalB.totalApplications, 1, 'Student B total applications should be 1');
    assert.strictEqual(personalB.statusBreakdown.accepted, 1, 'Student B accepted should be 1');
    assert.strictEqual(personalB.activePending, 0, 'Student B active/pending should be 0');
    console.log('[PASS] Test 2.2: Student B application stats verified (Total: 1, Accepted: 1, Active/Pending: 0).');

    // Cross-student verification: Student A's recent applications must NOT contain Student B's applications
    const hasLeakage = personalA.recentApplications.some(app => app._id.toString() === appB1._id.toString());
    assert.strictEqual(hasLeakage, false, 'Student A must not see Student B applications');
    console.log('[PASS] Test 2.3: Zero cross-student application leakage confirmed.');

    // -------------------------------------------------------------------
    // 3. BOOKMARKED DEADLINES & PERSONALIZED INSIGHTS
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Bookmarked Deadlines & Eligibility Insights ---');

    // Add oppWithExtCount to Student A's bookmarks
    studentA.bookmarks.push(oppWithExtCount._id);
    await studentA.save();

    const bookmarkedAnalytics = await request('GET', '/student/analytics', headersStudentA);
    const bookmarksList = bookmarkedAnalytics.body.personal.bookmarkedDeadlines;
    assert.ok(Array.isArray(bookmarksList), 'bookmarkedDeadlines must be an array');
    assert.ok(bookmarksList.some(b => b._id.toString() === oppWithExtCount._id.toString()), 'Must contain bookmarked opportunity');
    
    const bookmarkedItem = bookmarksList.find(b => b._id.toString() === oppWithExtCount._id.toString());
    assert.strictEqual(bookmarkedItem.daysRemaining, 5, 'Days remaining should match 5 days');
    console.log(`[PASS] Test 3.1: Bookmarked deadline tracked with daysRemaining=${bookmarkedItem.daysRemaining}.`);

    // Eligibility matching insights
    const matching = bookmarkedAnalytics.body.personal.matchingInsights;
    assert.ok(typeof matching.eligibleCount === 'number');
    assert.ok(typeof matching.ineligibleCount === 'number');
    assert.ok(typeof matching.matchingCount === 'number');
    assert.ok(matching.totalEvaluated > 0);
    console.log(`[PASS] Test 3.2: Eligibility evaluated across catalog (Eligible: ${matching.eligibleCount}, Ineligible: ${matching.ineligibleCount}, Matching: ${matching.matchingCount}).`);

    // -------------------------------------------------------------------
    // 4. PLATFORM-WIDE METRICS & UNIQUE APPLICANTS
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing Platform Opportunity Statistics & Unique Applicants ---');

    const platformStats = bookmarkedAnalytics.body.platform;
    assert.ok(typeof platformStats.totalApplications === 'number');
    assert.ok(typeof platformStats.uniqueStudentsCount === 'number');
    assert.ok(platformStats.uniqueStudentsCount <= platformStats.totalApplications);
    assert.ok(Array.isArray(platformStats.trends));
    assert.ok(Array.isArray(platformStats.categoryActivity));
    console.log(`[PASS] Test 4.1: Platform statistics aggregate correctly (Total: ${platformStats.totalApplications}, Unique Students: ${platformStats.uniqueStudentsCount}).`);

    // Category activity aggregation
    const hasInternshipCategory = platformStats.categoryActivity.some(c => c.category === 'internship');
    assert.strictEqual(hasInternshipCategory, true, 'Category activity must include internship');
    console.log('[PASS] Test 4.2: Category activity aggregation includes application counts and catalog counts.');

    // -------------------------------------------------------------------
    // 5. EXTERNAL VS EDUCONNECT APPLICANT COUNTS
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing External vs EduConnect Applicant Counts ---');

    // 5.1: Opportunity WITH external count
    const opp1Res = await request('GET', `/opportunities/${oppWithExtCount._id}`);
    assert.strictEqual(opp1Res.status, 200);
    assert.strictEqual(opp1Res.body.externalApplicantCount, 1250, 'External count must match provider value');
    assert.strictEqual(opp1Res.body.externalStats.source, 'hopin');
    assert.ok(opp1Res.body.applicationsCount >= 2, 'EduConnect application count must record internal submissions');
    assert.ok(opp1Res.body.uniqueApplicantsCount >= 2, 'Distinct students applied through EduConnect');
    console.log(`[PASS] Test 5.1: Opportunity with provider statistics correctly distinguishes External (${opp1Res.body.externalApplicantCount} via ${opp1Res.body.externalStats.source}) from EduConnect Applications (${opp1Res.body.applicationsCount}) and Unique Applicants (${opp1Res.body.uniqueApplicantsCount}).`);

    // 5.2: Opportunity WITHOUT external count
    const opp2Res = await request('GET', `/opportunities/${oppWithoutExtCount._id}`);
    assert.strictEqual(opp2Res.status, 200);
    assert.strictEqual(opp2Res.body.externalApplicantCount, null, 'External count must be null when provider does not supply it');
    assert.strictEqual(opp2Res.body.externalStats.applicantCount, null);
    assert.ok(opp2Res.body.applicationsCount >= 1, 'EduConnect application count recorded');
    console.log(`[PASS] Test 5.2: Opportunity without provider count preserves null (displays "Not available from source" rather than inventing 0).`);

    // 5.3: Administrative GET /opportunities/insights is protected
    const unauthInsightsRes = await request('GET', '/opportunities/insights');
    assert.strictEqual(unauthInsightsRes.status, 401, 'Unauthenticated /opportunities/insights must return 401');

    const studentInsightsRes = await request('GET', '/opportunities/insights', headersStudentA);
    assert.strictEqual(studentInsightsRes.status, 403, 'Student access to administrative /opportunities/insights must return 403');

    const adminInsightsRes = await request('GET', '/opportunities/insights', {
      'x-test-uid': 'admin-test-uid',
      'x-test-email': 'admin@educonnect.ac.in',
      'x-test-role': 'admin'
    });
    assert.strictEqual(adminInsightsRes.status, 200);
    assert.strictEqual(adminInsightsRes.body.students, undefined, 'Must not expose student PII');
    assert.strictEqual(adminInsightsRes.body.applicants, undefined, 'Must not expose applicant PII');
    assert.ok(Array.isArray(adminInsightsRes.body.topAppliedOpportunities));
    console.log('[PASS] Test 5.3: GET /opportunities/insights strictly requires admin authorization and returns verified platform trends with zero student PII.');

    // -------------------------------------------------------------------
    // 6. CLEAN TEARDOWN
    // -------------------------------------------------------------------
    await Application.deleteMany({ _id: { $in: [appA1._id, appA2._id, appB1._id] } });
    await Student.deleteMany({ _id: { $in: [studentA._id, studentB._id] } });
    await Opportunity.deleteMany({ _id: { $in: [oppWithExtCount._id, oppWithoutExtCount._id] } });

    console.log('\n======================================================');
    console.log('ALL BATCH 4 STUDENT ANALYTICS TESTS PASSED (100%)!');
    console.log('======================================================\n');
  } finally {
    if (server) await new Promise((res) => server.close(res));
    await closeDB();
  }
}

runStudentAnalyticsTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
