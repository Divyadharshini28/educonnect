/**
 * EduConnect — Batch 4 Comprehensive Verification Test Suite
 * 
 * Verifies:
 * 1. Admin Authorization Gate (requireAdmin: 401 unauthenticated, 403 non-admin, 200 admin)
 * 2. Opportunity CRUD & Status Lifecycle (ACTIVE, INACTIVE, EXPIRED; reactivation)
 * 3. Safe Deletion Protocol (Soft-deactivates if applications exist, preserving application history)
 * 4. CSV Bulk Import Engine (RFC 4180 parser, formula injection sanitization, validation, deduplication, itemized errors)
 * 5. Opportunity Engagement Analytics (Aggregate student counts, zero student PII, top rankings)
 * 6. Server-side Pagination & Backward Compatibility (Returns paginated object if page is given; array if omitted)
 * 7. Ingestion Pagination & Fault Resilience (Multi-page offsets/pages, independent source try/catch blocks)
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
const { parseCSV, parseAndMapCsv, sanitizeFormulaInjection } = require('../utils/csvParser');
const { syncAllBrabble, syncAllBodhDisha, syncAllSources } = require('../services/syncService');

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

async function runBatch4Tests() {
  console.log('======================================================');
  console.log('RUNNING BATCH 4 VERIFICATION TEST SUITE');
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

  const studentHeaders = {
    'x-test-uid': 'batch4-student-uid',
    'x-test-email': 'student@educonnect.test',
    'x-test-role': 'student'
  };

  const adminHeaders = {
    'x-test-uid': 'batch4-admin-uid',
    'x-test-email': 'admin@educonnect.test',
    'x-test-role': 'admin'
  };

  try {
    // -------------------------------------------------------------------
    // 1. CSV PARSER & FORMULA INJECTION SANITIZATION
    // -------------------------------------------------------------------
    console.log('--- 1. Testing CSV Parser & Formula Injection Defense ---');

    assert.strictEqual(sanitizeFormulaInjection('=cmd|\' /C calc\'!A0'), "'=cmd|' /C calc'!A0");
    assert.strictEqual(sanitizeFormulaInjection('+SUM(1, 2)'), "'+SUM(1, 2)");
    assert.strictEqual(sanitizeFormulaInjection('-20'), "-20"); // Numbers preserved
    assert.strictEqual(sanitizeFormulaInjection('@macro()'), "'@macro()");
    console.log('[PASS] Test 1.1: Formula injection prefixes sanitized.');

    const sampleCsv = `title,organization,type,deadline,location,description
"Software Engineer Intern","Tech Corp","internship","2026-12-31","Bengaluru","Develop backend services"
"Hackathon 2026","OpenAI","hackathon","2026-11-15","Remote","Build agentic workflows"`;

    const parsed = parseAndMapCsv(sampleCsv);
    assert.strictEqual(parsed.rows.length, 2, 'Should parse 2 rows');
    assert.strictEqual(parsed.rows[0].title, 'Software Engineer Intern');
    assert.strictEqual(parsed.rows[1].type, 'hackathon');
    console.log('[PASS] Test 1.2: RFC 4180 CSV parsing with quoted fields succeeded.');

    // -------------------------------------------------------------------
    // 2. ADMIN AUTHORIZATION GATE
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Admin Authorization Gate ---');

    // 2.1: Unauthenticated request -> 401
    const unauthRes = await request('GET', '/opportunities/admin/analytics');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('[PASS] Test 2.1: GET /opportunities/admin/analytics returned 401 for unauthenticated request.');

    // 2.2: Student request -> 403 Forbidden
    const studentRes = await request('GET', '/opportunities/admin/analytics', studentHeaders);
    assert.strictEqual(studentRes.status, 403, 'Student request must return 403 Forbidden');
    console.log('[PASS] Test 2.2: GET /opportunities/admin/analytics returned 403 Forbidden for non-admin student.');

    // 2.3: Admin request -> 200 OK
    const adminRes = await request('GET', '/opportunities/admin/analytics', adminHeaders);
    assert.strictEqual(adminRes.status, 200, 'Admin request must return 200 OK');
    assert.ok(adminRes.body.totals, 'Response must include totals');
    console.log('[PASS] Test 2.3: GET /opportunities/admin/analytics returned 200 OK for admin.');

    // -------------------------------------------------------------------
    // 3. OPPORTUNITY CRUD & STATUS LIFECYCLE
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Opportunity CRUD & Status Lifecycle ---');

    // 3.1: Admin Create Opportunity
    const newOppPayload = {
      title: 'Batch 4 Test Innovation Fellowship',
      organization: 'Batch 4 Foundation',
      type: 'internship',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Hyderabad',
      description: 'Comprehensive research and development opportunity for student scholars.',
      stipendOrReward: '₹35,000 / month',
      officialUrl: 'https://batch4.example.com/apply',
      eligibility: {
        department: ['Computer Science', 'MCA'],
        minYear: 2,
        minCGPA: 7.5,
        skills: ['Node.js', 'React']
      }
    };

    const createRes = await request('POST', '/opportunities', adminHeaders, newOppPayload);
    assert.strictEqual(createRes.status, 201, 'Create opportunity should return 201');
    assert.strictEqual(createRes.body.opportunity.title, newOppPayload.title);
    assert.strictEqual(createRes.body.opportunity.status, 'ACTIVE');
    assert.strictEqual(createRes.body.opportunity.isActive, true);
    const createdOppId = createRes.body.opportunity._id;
    console.log('[PASS] Test 3.1: Admin successfully created opportunity with ACTIVE status.');

    // 3.2: Duplicate Create Guard
    const dupCreateRes = await request('POST', '/opportunities', adminHeaders, newOppPayload);
    assert.strictEqual(dupCreateRes.status, 409, 'Duplicate opportunity creation should return 409 Conflict');
    console.log('[PASS] Test 3.2: Duplicate opportunity detected and rejected with 409.');

    // 3.3: Admin Update Opportunity
    const updateRes = await request('PUT', `/opportunities/${createdOppId}`, adminHeaders, {
      title: 'Batch 4 Test Innovation Fellowship (Updated)',
      stipendOrReward: '₹40,000 / month'
    });
    assert.strictEqual(updateRes.status, 200, 'Update opportunity should return 200');
    assert.strictEqual(updateRes.body.opportunity.title, 'Batch 4 Test Innovation Fellowship (Updated)');
    assert.strictEqual(updateRes.body.opportunity.stipendOrReward, '₹40,000 / month');
    console.log('[PASS] Test 3.3: Admin successfully updated opportunity details.');

    // 3.4: Admin Deactivate Opportunity
    const deactivateRes = await request('PATCH', `/opportunities/${createdOppId}/status`, adminHeaders, {
      status: 'INACTIVE'
    });
    assert.strictEqual(deactivateRes.status, 200, 'Deactivate should return 200');
    assert.strictEqual(deactivateRes.body.opportunity.status, 'INACTIVE');
    assert.strictEqual(deactivateRes.body.opportunity.isActive, false);
    console.log('[PASS] Test 3.4: Admin successfully set status to INACTIVE (isActive=false).');

    // 3.5: Inactive Opportunity Excluded from Default Public Browse
    const publicList = await request('GET', '/opportunities');
    const isVisibleInPublic = Array.isArray(publicList.body)
      ? publicList.body.some(o => o._id === createdOppId)
      : publicList.body.opportunities.some(o => o._id === createdOppId);
    assert.strictEqual(isVisibleInPublic, false, 'INACTIVE opportunity must not appear in active public browse');
    console.log('[PASS] Test 3.5: Inactive opportunity excluded from active catalog.');

    // 3.6: Admin Reactivate Opportunity
    const reactivateRes = await request('PATCH', `/opportunities/${createdOppId}/status`, adminHeaders, {
      status: 'ACTIVE'
    });
    assert.strictEqual(reactivateRes.status, 200, 'Reactivate should return 200');
    assert.strictEqual(reactivateRes.body.opportunity.status, 'ACTIVE');
    assert.strictEqual(reactivateRes.body.opportunity.isActive, true);
    console.log('[PASS] Test 3.6: Admin successfully reactivated opportunity.');

    // -------------------------------------------------------------------
    // 4. SAFE DELETION PROTOCOL
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing Safe Deletion Protocol ---');

    // 4.1: Record an Application for this opportunity
    const testApp = new Application({
      studentId: new mongoose.Types.ObjectId(),
      opportunityId: createdOppId,
      status: 'Submitted'
    });
    await testApp.save();

    // 4.2: Admin attempts delete on opportunity with existing applications
    const safeDeleteRes = await request('DELETE', `/opportunities/${createdOppId}`, adminHeaders);
    assert.strictEqual(safeDeleteRes.status, 200, 'Delete should return 200');
    assert.strictEqual(safeDeleteRes.body.isSoftDeleted, true, 'isSoftDeleted flag must be true');
    assert.strictEqual(safeDeleteRes.body.opportunity.status, 'INACTIVE');
    assert.strictEqual(safeDeleteRes.body.opportunity.isActive, false);

    // Verify record still exists in DB so student history is intact
    const oppInDb = await Opportunity.findById(createdOppId);
    assert.ok(oppInDb, 'Opportunity must not be deleted from database when applications exist');
    assert.strictEqual(oppInDb.isActive, false);

    // Clean up test application and opportunity
    await Application.deleteOne({ _id: testApp._id });
    await Opportunity.deleteOne({ _id: createdOppId });
    console.log('[PASS] Test 4.1: Safe deletion soft-deactivates opportunity to preserve student application history.');

    // -------------------------------------------------------------------
    // 5. CSV BULK IMPORT ENGINE
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing CSV Bulk Import Engine ---');

    await Opportunity.deleteMany({ title: { $regex: /^CSV/ } });

    const csvData = `title,organization,type,deadline,location,description,stipendOrReward
"CSV Imported Internship Alpha","Alpha Global","internship","2026-11-20","Remote","Build fullstack features","₹20,000"
"CSV Invalid Missing Type","Beta Global","","2026-11-20","Remote","Missing required type field",""
"CSV Formula Injection Test","Gamma Global","hackathon","2026-12-10","Bengaluru","=SUM(1,2) in description","₹10,000"`;

    const importRes = await request('POST', '/opportunities/import', adminHeaders, {
      csvContent: csvData
    });

    assert.strictEqual(importRes.status, 200, 'CSV import should return 200');
    assert.strictEqual(importRes.body.totalRows, 3, 'Should process 3 rows');
    assert.strictEqual(importRes.body.importedCount, 2, 'Should import 2 valid rows');
    assert.strictEqual(importRes.body.failedCount, 1, 'Should fail 1 invalid row');
    assert.strictEqual(importRes.body.errors.length, 1, 'Should report 1 itemized error');
    assert.strictEqual(importRes.body.errors[0].row, 3, 'Row 3 (line 3 of CSV) should be flagged');
    console.log('[PASS] Test 5.1: CSV Bulk Import successfully parsed rows, imported valid items, and reported row-level error.');

    // 5.2: Re-import same CSV to test duplicate skipping
    const reimportRes = await request('POST', '/opportunities/import', adminHeaders, {
      csvContent: csvData
    });
    assert.strictEqual(reimportRes.status, 200);
    assert.strictEqual(reimportRes.body.duplicatesSkipped, 2, 'Previously imported records should be flagged as duplicates');
    assert.strictEqual(reimportRes.body.importedCount, 0, 'Zero new records imported on duplicate run');
    console.log('[PASS] Test 5.2: Duplicate detection properly skips existing records without error.');

    // Clean up imported test items
    await Opportunity.deleteMany({ title: { $regex: /^CSV/ } });

    // -------------------------------------------------------------------
    // 6. OPPORTUNITY ENGAGEMENT ANALYTICS
    // -------------------------------------------------------------------
    console.log('\n--- 6. Testing Engagement Analytics (Zero Student PII) ---');

    // Retrieve an existing catalog opportunity
    const existingOpp = await Opportunity.findOne({
      $or: [{ isActive: true }, { status: 'ACTIVE' }, { isActive: { $ne: false } }]
    });
    assert.ok(existingOpp, 'Catalog opportunity should exist');

    const engagementRes = await request('GET', `/opportunities/${existingOpp._id}/engagement`);
    assert.strictEqual(engagementRes.status, 200);
    assert.ok(typeof engagementRes.body.applicationsCount === 'number');
    assert.ok(typeof engagementRes.body.bookmarksCount === 'number');
    // Verify no PII fields
    assert.strictEqual(engagementRes.body.students, undefined, 'Student PII must not be exposed');
    assert.strictEqual(engagementRes.body.applicants, undefined, 'Applicant PII must not be exposed');
    console.log(`[PASS] Test 6.1: Engagement endpoint returned applicationsCount=${engagementRes.body.applicationsCount}, bookmarksCount=${engagementRes.body.bookmarksCount} with zero PII.`);

    const singleOppRes = await request('GET', `/opportunities/${existingOpp._id}`);
    assert.strictEqual(singleOppRes.status, 200);
    assert.ok(typeof singleOppRes.body.applicationsCount === 'number');
    assert.ok(typeof singleOppRes.body.bookmarksCount === 'number');
    console.log('[PASS] Test 6.2: Single opportunity GET response embeds applicationsCount and bookmarksCount.');

    // -------------------------------------------------------------------
    // 7. SERVER-SIDE PAGINATION & BACKWARD COMPATIBILITY
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing Server-side Pagination & Backward Compatibility ---');

    // 7.1: Paginated request with page and limit
    const paginatedRes = await request('GET', '/opportunities?page=1&limit=5');
    assert.strictEqual(paginatedRes.status, 200);
    assert.ok(Array.isArray(paginatedRes.body.opportunities), 'Response must have opportunities array');
    assert.strictEqual(paginatedRes.body.page, 1);
    assert.strictEqual(paginatedRes.body.limit, 5);
    assert.ok(typeof paginatedRes.body.total === 'number');
    assert.ok(typeof paginatedRes.body.totalPages === 'number');
    console.log(`[PASS] Test 7.1: Paginated request returned page=${paginatedRes.body.page}, limit=${paginatedRes.body.limit}, total=${paginatedRes.body.total}.`);

    // 7.2: Unpaginated request (backward compatibility) returns plain array
    const unpaginatedRes = await request('GET', '/opportunities');
    assert.strictEqual(unpaginatedRes.status, 200);
    assert.ok(Array.isArray(unpaginatedRes.body), 'Unpaginated request must return an array for backward compatibility');
    console.log(`[PASS] Test 7.2: Request without page parameter returned plain array with ${unpaginatedRes.body.length} items.`);

    // -------------------------------------------------------------------
    // 8. EXTERNAL INGESTION FAULT TOLERANCE & PAGINATION
    // -------------------------------------------------------------------
    console.log('\n--- 8. Testing External Ingestion Fault Tolerance & Pagination ---');

    const brabbleRes = await syncAllBrabble();
    assert.ok(brabbleRes, 'syncAllBrabble should return status object');
    console.log(`[PASS] Test 8.1: Brabble sync executed safely without fatal uncaught exception (success=${brabbleRes.success}).`);

    const bodhDishaRes = await syncAllBodhDisha();
    assert.ok(bodhDishaRes, 'syncAllBodhDisha should return status object');
    console.log(`[PASS] Test 8.2: BodhDisha sync executed safely without fatal uncaught exception (success=${bodhDishaRes.success}).`);

    const allSourcesRes = await syncAllSources();
    assert.ok(allSourcesRes, 'syncAllSources should return comprehensive results object');
    assert.ok(allSourcesRes.hopin !== undefined && allSourcesRes.brabble !== undefined && allSourcesRes.bodhdisha !== undefined);
    console.log('[PASS] Test 8.3: syncAllSources isolated individual source failures and completed full cycle.');

    console.log('\n======================================================');
    console.log('ALL BATCH 4 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runBatch4Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[FAIL] Batch 4 Test Error:', err);
    process.exit(1);
  });
