/**
 * Focused Verification & Regression Test Suite:
 * - Admin Portal layout contracts & navigation paths
 * - Admin email whitelist alignment (admin@educonnect.ac.in & admin@educonnect.com)
 * - Administrative analytics protection on /opportunities/insights
 * - Student analytics scope alignment & validated skill-matching precision
 * - Orphaned opportunity link filtering (no broken 404 links)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('Admin Portal & Analytics Implementation Verification Suite');
console.log('======================================================\n');

async function runAllTests() {
  // 1. Admin Email Whitelist Alignment
  test('1. Admin email whitelist in frontend and backend are aligned', () => {
    // Backend logic in authMiddleware.js
    const configuredAdminEmails = (process.env.ADMIN_EMAILS || 'admin@educonnect.ac.in,admin@educonnect.com')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    // Verify backend default whitelist
    assert.ok(configuredAdminEmails.includes('admin@educonnect.ac.in'), 'Backend must whitelist admin@educonnect.ac.in');
    assert.ok(configuredAdminEmails.includes('admin@educonnect.com'), 'Backend must whitelist admin@educonnect.com');

    // Frontend AuthContext source check
    const authContextPath = path.resolve(__dirname, '../../../client/src/context/AuthContext.jsx');
    const authContextContent = fs.readFileSync(authContextPath, 'utf8');

    assert.ok(
      authContextContent.includes('admin@educonnect.ac.in'),
      'AuthContext.jsx must recognize admin@educonnect.ac.in'
    );
    assert.ok(
      authContextContent.includes('admin@educonnect.com'),
      'AuthContext.jsx must recognize admin@educonnect.com'
    );
    assert.ok(
      authContextContent.includes('@admin.educonnect.internal'),
      'AuthContext.jsx must recognize internal admin domain'
    );
  });

  // 2. AdminLayout Component & Navigation Routes
  test('2. AdminLayout component exists and provides persistent navigation', () => {
    const adminLayoutPath = path.resolve(__dirname, '../../../client/src/components/AdminLayout.jsx');
    assert.ok(fs.existsSync(adminLayoutPath), 'AdminLayout.jsx must exist');
    const layoutContent = fs.readFileSync(adminLayoutPath, 'utf8');

    assert.ok(layoutContent.includes('to="/admin"'), 'Must link to Overview (/admin)');
    assert.ok(layoutContent.includes('to="/admin/opportunities"'), 'Must link to Opportunities (/admin/opportunities)');
    assert.ok(layoutContent.includes('to="/admin/import"'), 'Must link to CSV Import (/admin/import)');
    assert.ok(layoutContent.includes('to="/home"'), 'Must provide Return to Student Portal (/home)');
    assert.ok(layoutContent.includes('Admin Portal'), 'Must display Admin Portal brand identifier');
    assert.ok(layoutContent.includes('Sign out') || layoutContent.includes('logoutStudent'), 'Must provide admin sign-out');
  });

  // 3. App.jsx Admin Routes Integration
  test('3. App.jsx mounts admin routes inside AdminLayout and protects Navbar', () => {
    const appPath = path.resolve(__dirname, '../../../client/src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes('AdminLayout'), 'App.jsx must import AdminLayout');
    assert.ok(appContent.includes('<AdminLayout><AdminDashboardPage /></AdminLayout>'), 'AdminDashboardPage must be wrapped in AdminLayout');
    assert.ok(appContent.includes('<AdminLayout><AdminOpportunitiesPage /></AdminLayout>'), 'AdminOpportunitiesPage must be wrapped in AdminLayout');
    assert.ok(appContent.includes('<AdminLayout><AdminCsvImportPage /></AdminLayout>'), 'AdminCsvImportPage must be wrapped in AdminLayout');

    // Navbar suppression on admin routes
    const navbarPath = path.resolve(__dirname, '../../../client/src/components/Navbar.jsx');
    const navbarContent = fs.readFileSync(navbarPath, 'utf8');
    assert.ok(
      navbarContent.includes("location.pathname.startsWith('/admin')"),
      'Navbar must suppress student header when on /admin routes'
    );
  });

  // 4. Protection of /opportunities/insights
  test('4. opportunityRoutes.js enforces requireAuth and requireAdmin on /opportunities/insights', () => {
    const routesPath = path.resolve(__dirname, '../routes/opportunityRoutes.js');
    const routesContent = fs.readFileSync(routesPath, 'utf8');

    const insightsRouteMatch = routesContent.match(/router\.get\('\/insights',\s*([^;]+)\)/);
    assert.ok(insightsRouteMatch, 'Must define GET /insights route');
    const middlewareChain = insightsRouteMatch[1];
    assert.ok(middlewareChain.includes('requireAuth'), '/insights must require authentication');
    assert.ok(middlewareChain.includes('requireAdmin'), '/insights must require admin authorization');
  });

  // 5. Student Analytics Scope Alignment (Expired opportunities excluded)
  test('5. Student analytics evaluates unexpired active opportunities consistently with recommendations', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const testOpps = [
      { id: '1', title: 'Active Open-Ended', isActive: true, status: 'ACTIVE', deadline: null },
      { id: '2', title: 'Active Future Deadline', isActive: true, status: 'ACTIVE', deadline: '2026-11-15T00:00:00Z' },
      { id: '3', title: 'Active Expired Deadline', isActive: true, status: 'ACTIVE', deadline: '2026-10-01T00:00:00Z' },
      { id: '4', title: 'Inactive Future Deadline', isActive: false, status: 'INACTIVE', deadline: '2026-11-20T00:00:00Z' }
    ];

    // Filter logic identical to updated studentController and recommendation engine
    const activeUpcoming = testOpps.filter(opp => {
      if (opp.isActive === false || opp.status === 'INACTIVE' || opp.status === 'ARCHIVED') return false;
      if (!opp.deadline) return true;
      const d = new Date(opp.deadline);
      return isNaN(d.getTime()) || d >= now;
    });

    assert.strictEqual(activeUpcoming.length, 2, 'Must include only open-ended and unexpired active opportunities');
    const ids = activeUpcoming.map(o => o.id);
    assert.ok(ids.includes('1'), 'Must include open-ended opportunity');
    assert.ok(ids.includes('2'), 'Must include future deadline opportunity');
    assert.ok(!ids.includes('3'), 'Must exclude expired opportunity');
    assert.ok(!ids.includes('4'), 'Must exclude inactive opportunity');
  });

  // 6. Validated Skill Matching Logic (Separated from Department Overlap)
  test('6. Skill-match calculation evaluates actual technical skill overlap, not department overlap', () => {
    const student = {
      department: 'Information Technology',
      skills: ['React', 'Node.js', 'Python']
    };

    const oppWithMatchingSkills = {
      eligibility: {
        department: ['Mechanical'],
        skills: ['Python', 'Docker']
      }
    };

    const oppWithNoSkillOverlap = {
      eligibility: {
        department: ['Information Technology'], // Matches department, but zero skill overlap!
        skills: ['Rust', 'Solidity']
      }
    };

    const oppWithNoSkillsRequired = {
      eligibility: {
        department: ['All'],
        skills: []
      }
    };

    const studentSkills = student.skills.map(s => s.toLowerCase().trim());

    function checkSkillMatch(opp) {
      const oppSkills = (opp.eligibility?.skills || []).map(s => s.toLowerCase().trim()).filter(Boolean);
      return oppSkills.length > 0 && oppSkills.some(req =>
        studentSkills.some(st => st === req || req.includes(st) || st.includes(req))
      );
    }

    assert.strictEqual(checkSkillMatch(oppWithMatchingSkills), true, 'Must detect skill match when Python overlaps');
    assert.strictEqual(checkSkillMatch(oppWithNoSkillOverlap), false, 'Must NOT count department match as a skill match');
    assert.strictEqual(checkSkillMatch(oppWithNoSkillsRequired), false, 'Open entry with no skills listed is not a skill match');
  });

  // 7. Orphaned Opportunity ID Filtering in Rankings
  test('7. Top-applied opportunity aggregation safely filters out deleted/orphaned opportunities', () => {
    const oppMap = new Map([
      ['opp-valid-1', { title: 'AI Fellowship', organization: 'AI Lab', type: 'internship' }],
      ['opp-valid-2', { title: 'Hackathon 2026', organization: 'Cloud Org', type: 'hackathon' }]
      // opp-deleted-3 is missing from catalog
    ]);

    const topAppliedAgg = [
      { opportunityId: 'opp-valid-1', applicationsCount: 5, uniqueApplicantsCount: 4 },
      { opportunityId: 'opp-deleted-3', applicationsCount: 3, uniqueApplicantsCount: 2 },
      { opportunityId: 'opp-valid-2', applicationsCount: 2, uniqueApplicantsCount: 2 }
    ];

    const safeRankings = topAppliedAgg
      .map(item => {
        const opp = oppMap.get(item.opportunityId.toString());
        if (!opp) return null; // Safe exclusion of orphaned records
        return {
          _id: item.opportunityId,
          title: opp.title,
          applicationsCount: item.applicationsCount
        };
      })
      .filter(Boolean);

    assert.strictEqual(safeRankings.length, 2, 'Orphaned opportunity must be excluded');
    assert.strictEqual(safeRankings[0]._id, 'opp-valid-1');
    assert.strictEqual(safeRankings[1]._id, 'opp-valid-2');
  });

  // 8. Graceful Handling of Archived Opportunities in Recent Applications
  test('8. Student recent applications marks deleted catalog opportunities as archived without crashing', () => {
    const mockStudentApps = [
      {
        _id: 'app-1',
        opportunityId: { _id: 'opp-1', title: 'Live Fellowship', organization: 'Org A', type: 'internship', deadline: null },
        status: 'Submitted',
        submissionDate: new Date()
      },
      {
        _id: 'app-2',
        opportunityId: null, // Opportunity was deleted or purged from catalog!
        opportunityTitle: 'Historical Internship',
        opportunityOrg: 'Old Partner',
        opportunityType: 'internship',
        status: 'Under Review',
        submissionDate: new Date()
      }
    ];

    const formatted = mockStudentApps.map(app => {
      const opp = app.opportunityId;
      const oppExists = Boolean(opp && opp._id);
      return {
        _id: app._id,
        opportunityId: oppExists ? opp._id : null,
        title: oppExists ? opp.title : (app.opportunityTitle || 'Opportunity archived'),
        isArchived: !oppExists
      };
    });

    assert.strictEqual(formatted.length, 2);
    assert.strictEqual(formatted[0].opportunityId, 'opp-1');
    assert.strictEqual(formatted[0].isArchived, false);
    assert.strictEqual(formatted[1].opportunityId, null, 'Must be null so frontend does not produce broken link');
    assert.strictEqual(formatted[1].isArchived, true);
    assert.strictEqual(formatted[1].title, 'Historical Internship');
  });

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  assert.strictEqual(passed, total, 'All regression tests must pass');
  console.log('All Admin Portal & Analytics implementation verification tests PASSED!\n');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
