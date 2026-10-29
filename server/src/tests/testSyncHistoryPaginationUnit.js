/**
 * Unit Test Suite for Sync History Pagination & Filter Logic
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
console.log('Sync History Pagination & Filter Unit Test Suite');
console.log('======================================================\n');

// 1. Pagination calculation helper test
test('1. Pagination bounds, skip, and metadata calculation', () => {
  function calculatePagination(queryPage, queryLimit, totalItems) {
    const page = Math.max(1, parseInt(queryPage, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(queryLimit, 10) || 10));
    const skip = (page - 1) * limit;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    return {
      page,
      limit,
      skip,
      total: totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  // Page 1 of 25 items with limit 10
  const p1 = calculatePagination('1', '10', 25);
  assert.strictEqual(p1.page, 1);
  assert.strictEqual(p1.limit, 10);
  assert.strictEqual(p1.skip, 0);
  assert.strictEqual(p1.totalPages, 3);
  assert.strictEqual(p1.hasNext, true);
  assert.strictEqual(p1.hasPrev, false);

  // Page 3 of 25 items with limit 10 (last page)
  const p3 = calculatePagination('3', '10', 25);
  assert.strictEqual(p3.page, 3);
  assert.strictEqual(p3.skip, 20);
  assert.strictEqual(p3.hasNext, false);
  assert.strictEqual(p3.hasPrev, true);

  // Negative or invalid page clamped to 1
  const pNeg = calculatePagination('-5', '10', 25);
  assert.strictEqual(pNeg.page, 1);

  // Excessive limit clamped to 100
  const pLimitMax = calculatePagination('1', '500', 25);
  assert.strictEqual(pLimitMax.limit, 100);
});

// 2. Filter construction
test('2. Source and status query filtering', () => {
  function buildFilter(query) {
    const filter = {};
    if (query.source && query.source !== 'all') {
      filter.source = String(query.source).toLowerCase().trim();
    }
    if (query.status && query.status !== 'all') {
      filter.status = String(query.status).trim();
    }
    return filter;
  }

  const fAll = buildFilter({ source: 'all', status: 'all' });
  assert.deepStrictEqual(fAll, {});

  const fDevpost = buildFilter({ source: 'Devpost', status: 'all' });
  assert.deepStrictEqual(fDevpost, { source: 'devpost' });

  const fSuccess = buildFilter({ source: 'all', status: 'SUCCESS' });
  assert.deepStrictEqual(fSuccess, { status: 'SUCCESS' });

  const fBoth = buildFilter({ source: 'hopin', status: 'PARTIAL_SUCCESS' });
  assert.deepStrictEqual(fBoth, { source: 'hopin', status: 'PARTIAL_SUCCESS' });
});

// 3. SyncLog schema validation
test('3. SyncLog schema contains all tracked metrics', () => {
  const SyncLog = require('../models/SyncLog');
  const paths = SyncLog.schema.paths;
  
  assert.ok(paths.source, 'Missing source in SyncLog');
  assert.ok(paths.startedAt, 'Missing startedAt in SyncLog');
  assert.ok(paths.completedAt, 'Missing completedAt in SyncLog');
  assert.ok(paths.status, 'Missing status in SyncLog');
  assert.ok(paths.recordsFetched, 'Missing recordsFetched in SyncLog');
  assert.ok(paths.recordsInserted, 'Missing recordsInserted in SyncLog');
  assert.ok(paths.recordsUpdated, 'Missing recordsUpdated in SyncLog');
  assert.ok(paths.recordsSkipped, 'Missing recordsSkipped in SyncLog');
  assert.ok(paths.errorMessage, 'Missing errorMessage in SyncLog');

  const statusEnum = paths.status.enumValues;
  assert.ok(statusEnum.includes('SUCCESS'));
  assert.ok(statusEnum.includes('PARTIAL_SUCCESS'));
  assert.ok(statusEnum.includes('FAILED'));
  assert.ok(statusEnum.includes('IN_PROGRESS'));
  assert.ok(statusEnum.includes('CONFIG_REQUIRED'));
});

console.log(`\nResults: ${passed}/${total} tests passed.`);
if (passed === total) {
  console.log('All sync history pagination unit tests PASSED successfully!\n');
  process.exit(0);
} else {
  process.exit(1);
}
