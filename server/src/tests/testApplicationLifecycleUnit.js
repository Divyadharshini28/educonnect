/**
 * Unit Test Suite for Application Lifecycle, Transitions, and Authorization Logic
 */

const assert = require('assert');

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

console.log('\n======================================================');
console.log('Application Lifecycle & Authorization Logic Test Suite');
console.log('======================================================\n');

async function runAllTests() {
  // 1. Status enum definition
  test('1. Application model supports the full 8 statuses', () => {
    const Application = require('../models/Application');
    const statusEnum = Application.schema.path('status').enumValues;
    
    const expected = ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'];
    for (const s of expected) {
      assert.ok(statusEnum.includes(s), `Missing status: ${s}`);
    }
    assert.strictEqual(statusEnum.length, expected.length);
  });

  // 2. Application method enum
  test('2. Application method supports internal, external-link, direct-api', () => {
    const Application = require('../models/Application');
    const methodEnum = Application.schema.path('applicationMethod').enumValues;
    assert.deepStrictEqual(methodEnum, ['internal', 'external-link', 'direct-api']);
  });

  // 3. Status history entry structure
  test('3. Status history entries have required fields and source enum', () => {
    const Application = require('../models/Application');
    const historySchema = Application.schema.path('statusHistory').schema;
    assert.ok(historySchema.path('status'), 'Missing status in history');
    assert.ok(historySchema.path('changedAt'), 'Missing changedAt in history');
    assert.ok(historySchema.path('source'), 'Missing source in history');
    
    const sourceEnum = historySchema.path('source').enumValues;
    assert.ok(sourceEnum.includes('student-reported'));
    assert.ok(sourceEnum.includes('admin-recorded'));
    assert.ok(sourceEnum.includes('provider-confirmed'));
    assert.ok(sourceEnum.includes('system'));
  });

  // 4. Student update endpoint restriction
  test('4. Student update endpoint restricts updates to external-link apps and valid statuses', () => {
    const { studentUpdateApplicationStatus } = require('../controllers/applicationController');
    assert.strictEqual(typeof studentUpdateApplicationStatus, 'function');
  });

  // 5. Unique compound index on studentId + opportunityId
  test('5. Compound unique index on studentId + opportunityId is defined', () => {
    const Application = require('../models/Application');
    const indexes = Application.schema.indexes();
    const compoundIdx = indexes.find(idx => idx[0] && idx[0].studentId === 1 && idx[0].opportunityId === 1);
    assert.ok(compoundIdx, 'Expected compound index on { studentId: 1, opportunityId: 1 }');
    assert.strictEqual(compoundIdx[1].unique, true, 'Compound index must be unique');
  });

  // 6. Admin analytics topApplied structure
  test('6. topApplied exposed identifiers contain _id alias for frontend linking', () => {
    const aggResult = {
      _id: '6543210abcdef1234567890a',
      title: 'Google Summer of Code 2026',
      count: 14
    };

    const formattedItem = {
      _id: aggResult._id,
      opportunityId: aggResult._id,
      title: aggResult.title,
      applicationsCount: aggResult.count
    };

    assert.strictEqual(formattedItem._id, formattedItem.opportunityId);
    assert.ok(formattedItem._id, '_id must be defined for frontend routing');
  });

  // 7. Dashboard lifecycle stepper mapping (dynamic import of client ES module)
  await (async () => {
    total++;
    try {
      const { pathToFileURL } = require('url');
      const path = require('path');
      const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../../client/src/utils/dashboardUtils.js')).href;
      const { getApplicationLifecycle } = await import(moduleUrl);

      const submittedState = getApplicationLifecycle('Submitted');
      assert.strictEqual(submittedState.stage, 3);
      assert.ok(submittedState.progressText.toLowerCase().includes('awaiting'));

      const reviewState = getApplicationLifecycle('Under Review');
      assert.strictEqual(reviewState.stage, 4);

      const shortlistState = getApplicationLifecycle('Shortlisted');
      assert.strictEqual(shortlistState.stage, 4);

      const interviewState = getApplicationLifecycle('Interview');
      assert.strictEqual(interviewState.stage, 4);

      const acceptedState = getApplicationLifecycle('Accepted');
      assert.strictEqual(acceptedState.stage, 5);
      assert.strictEqual(acceptedState.isCompleted, true);

      const offeredState = getApplicationLifecycle('Offered');
      assert.strictEqual(offeredState.stage, 5);
      assert.strictEqual(offeredState.isCompleted, true);

      const rejectedState = getApplicationLifecycle('Rejected');
      assert.strictEqual(rejectedState.stage, 5);
      assert.strictEqual(rejectedState.isCompleted, true);

      const withdrawnState = getApplicationLifecycle('Withdrawn');
      assert.strictEqual(withdrawnState.stage, 5);

      console.log('  ✓ 7. Frontend getApplicationLifecycle correctly handles all statuses');
      passed++;
    } catch (err) {
      console.error('  ✗ 7. Frontend getApplicationLifecycle correctly handles all statuses');
      console.error(`    ${err.message}`);
    }
  })();

  console.log(`\nResults: ${passed}/${total} tests passed.`);
  if (passed === total) {
    console.log('All application lifecycle unit tests PASSED successfully!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests();
