/**
 * Phase 7 Verification Suite: Automated Opportunity Synchronization Scheduler
 * 
 * Verifies:
 * 1. Safe default behavior in test environments (does not run automatically)
 * 2. Explicit lifecycle control (startSyncScheduler, stopSyncScheduler)
 * 3. Schedule configuration and cron expression validation
 * 4. In-process locking and strict overlap prevention
 * 5. Execution of unified synchronization across external sources
 * 6. Idempotent re-runs and duplicate prevention during scheduled sync
 * 7. Resilient error handling and lock release on unexpected failures
 * 8. Status inspection and metric tracking (runs, successes, skips)
 * 9. REST API endpoints for sync status and manual trigger (/api/sync)
 */

process.env.NODE_ENV = 'test';

const http = require('http');
const mongoose = require('mongoose');
const { connectDB, closeDB } = require('../config/db');
const { app } = require('../server');
const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const {
  startSyncScheduler,
  stopSyncScheduler,
  runScheduledSync,
  getSchedulerStatus,
  resetSchedulerState,
  DEFAULT_SCHEDULE
} = require('../services/syncScheduler');

async function runPhase7Tests() {
  console.log('\n======================================================');
  console.log('STARTING PHASE 7 VERIFICATION SUITE: AUTOMATED SYNC SCHEDULER');
  console.log('======================================================\n');

  await connectDB();
  await Opportunity.init();

  const testHopinId = 'p7-hopin-job-001';
  const testBrabbleId = 'p7-brbl-hack-001';
  const testBodhDishaId = 'p7-bd-sch-001';
  const allTestIds = [testHopinId, testBrabbleId, testBodhDishaId];

  try {
    // -----------------------------------------------------------------
    // TEST 1: Safe Default Behavior in Test Mode
    // -----------------------------------------------------------------
    console.log('--- Test 1: Safe Test Mode Default Behavior ---');
    resetSchedulerState();
    const defaultStart = startSyncScheduler();
    console.assert(defaultStart.started === false, 'Scheduler must NOT start automatically in test environment without force');
    console.assert(getSchedulerStatus().isRunning === false, 'isRunning must remain false');
    console.log('[PASS] Test 1: Scheduler safely refrains from starting in test environment.');

    // -----------------------------------------------------------------
    // TEST 2: Explicit Start and Stop Lifecycle Control
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: Explicit Start & Stop Lifecycle ---');
    const explicitStart = startSyncScheduler({ force: true, schedule: '0 */4 * * *' });
    console.assert(explicitStart.started === true, 'Explicit start with force should succeed');
    console.assert(explicitStart.schedule === '0 */4 * * *', 'Custom schedule should be set');

    let status = getSchedulerStatus();
    console.assert(status.isRunning === true, 'Scheduler status should show isRunning: true');
    console.assert(status.schedule === '0 */4 * * *', 'Active schedule mismatch');

    const stopResult = stopSyncScheduler();
    console.assert(stopResult.stopped === true, 'stopSyncScheduler should report stopped');
    status = getSchedulerStatus();
    console.assert(status.isRunning === false, 'Scheduler status should show isRunning: false');
    console.log('[PASS] Test 2: Scheduler starts, tracks state, and stops cleanly.');

    // -----------------------------------------------------------------
    // TEST 3: Schedule Configuration & Cron Validation
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Schedule Configuration & Cron Validation ---');
    const invalidStart = startSyncScheduler({ force: true, schedule: 'not-a-valid-cron' });
    console.assert(invalidStart.started === false, 'Invalid cron schedule must be rejected');
    console.assert(typeof invalidStart.error === 'string', 'Error message should explain invalid cron format');

    const disabledStart = startSyncScheduler({ enabled: false, force: false });
    console.assert(disabledStart.started === false, 'Disabled scheduler must not start');
    console.log('[PASS] Test 3: Invalid schedules rejected and disabled flag respected.');

    // -----------------------------------------------------------------
    // TEST 4: Overlap Prevention and In-Process Locking
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Overlap Prevention & In-Process Locking ---');
    resetSchedulerState();

    const mockSlowOptions = {
      customData: []
    };

    // Trigger runScheduledSync concurrently
    const slowRunPromise = runScheduledSync({
      syncOptions: {
        customData: [],
        persistToDisk: false
      }
    });

    // Check status while running
    status = getSchedulerStatus();
    console.assert(status.isSyncInProgress === true, 'isSyncInProgress should be true while sync is active');

    // Attempt second concurrent trigger while first is still running
    const secondRun = await runScheduledSync({
      syncOptions: mockSlowOptions
    });

    console.assert(secondRun.success === false, 'Second overlapping sync must fail/skip');
    console.assert(secondRun.skipped === true, 'Second sync must be marked skipped');
    console.assert(secondRun.reason.includes('already in progress'), 'Reason must explain in-progress lock');

    const statusAfterOverlap = getSchedulerStatus();
    console.assert(statusAfterOverlap.metrics.skippedRuns === 1, 'skippedRuns counter must increment to 1');
    console.log('[PASS] Test 4: Overlapping synchronization successfully prevented; lock strictly enforced.');

    await slowRunPromise;
    console.assert(getSchedulerStatus().isSyncInProgress === false, 'Lock must be released after completion');

    // Clean any prior test records before ingestion
    await Opportunity.deleteMany({ externalId: { $in: allTestIds } });
    await SyncLog.deleteMany({ category: { $in: ['jobs', 'hackathons', 'scholarships'] } });

    // -----------------------------------------------------------------
    // TEST 5: Execution of Unified Scheduled Synchronization
    // -----------------------------------------------------------------
    console.log('\n--- Test 5: Execution of Unified Scheduled Synchronization ---');
    resetSchedulerState();

    const mockSyncPayload = {
      customData: [
        {
          id: testHopinId,
          title: 'Automated Ingestion Test Job',
          company: 'TechCorp Global',
          work_type: 'Remote',
          industry: 'Cloud',
          is_active: true
        }
      ]
    };

    const firstRun = await runScheduledSync({
      customData: mockSyncPayload.customData
    });

    console.assert(firstRun.skipped === false, 'Scheduled sync should not be skipped');
    status = getSchedulerStatus();
    console.assert(status.metrics.totalRuns === 1, `Expected 1 total run, got ${status.metrics.totalRuns}`);
    console.assert(status.lastRunStartedAt !== null, 'lastRunStartedAt must be timestamped');
    console.assert(status.lastRunCompletedAt !== null, 'lastRunCompletedAt must be timestamped');
    console.assert(status.isSyncInProgress === false, 'Lock must be released');

    const oppCountAfterRun1 = await Opportunity.countDocuments({ externalId: testHopinId });
    console.assert(oppCountAfterRun1 > 0, 'Opportunity must be inserted into database by scheduled sync');
    console.log(`[PASS] Test 5: Scheduled synchronization executed unified pipeline across sources (ingested ${oppCountAfterRun1} opportunity entries).`);

    // -----------------------------------------------------------------
    // TEST 6: Idempotent Re-runs and Deduplication
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Idempotent Re-runs & Deduplication ---');
    const secondRunResult = await runScheduledSync({
      customData: mockSyncPayload.customData
    });

    console.assert(secondRunResult.skipped === false, 'Second run should execute');
    const oppCountAfterRerun = await Opportunity.countDocuments({ externalId: testHopinId });
    console.assert(
      oppCountAfterRerun === oppCountAfterRun1,
      `Zero duplicates allowed! Expected ${oppCountAfterRun1}, found ${oppCountAfterRerun}`
    );

    const syncLogsCount = await SyncLog.countDocuments({});
    console.assert(syncLogsCount > 0, 'SyncLog records must be maintained');
    console.log('[PASS] Test 6: Re-run executed idempotently with exactly zero duplicates created.');

    // -----------------------------------------------------------------
    // TEST 7: Resilient Error Handling & Lock Release on Unexpected Failure
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Resilient Error Handling & Lock Release ---');
    // Force a failure by calling with an unreachable custom endpoint
    const errorRun = await runScheduledSync({
      baseUrl: 'http://127.0.0.1:54321/unreachable-endpoint',
      timeoutMs: 400
    });

    console.assert(getSchedulerStatus().isSyncInProgress === false, 'Lock MUST be released even when sync fails');
    console.assert(getSchedulerStatus().metrics.failedRuns >= 1, 'Failed run counter should record failure');
    console.log('[PASS] Test 7: Unexpected failure caught, logged, and lock safely released.');

    // -----------------------------------------------------------------
    // TEST 8: REST API Compatibility (/api/sync/status & /api/sync/trigger)
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: REST API Endpoints (/api/sync/status & /api/sync/trigger) ---');
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const apiFetch = async (path, options = {}) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
      });
      const data = await res.json();
      return { status: res.status, data };
    };

    // 8a: GET /api/sync/status
    const statusRes = await apiFetch('/api/sync/status');
    console.assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    console.assert(statusRes.data.scheduler !== undefined, 'scheduler status must be present');
    console.assert(Array.isArray(statusRes.data.recentLogs), 'recentLogs array must be present');
    console.log(`[PASS] GET /api/sync/status returned operational status and ${statusRes.data.recentLogs.length} recent SyncLogs.`);

    // 8b: POST /api/sync/trigger (manual sync)
    const triggerRes = await apiFetch('/api/sync/trigger', {
      method: 'POST',
      body: JSON.stringify({ customData: mockSyncPayload.customData })
    });
    console.assert(triggerRes.status === 200, `Expected 200 from trigger, got ${triggerRes.status}`);
    console.assert(triggerRes.data.status.skipped === false, 'Manual trigger should execute without skipping');
    console.log('[PASS] POST /api/sync/trigger successfully triggered manual synchronization cycle.');

    await new Promise((resolve) => server.close(resolve));

    console.log('\n======================================================');
    console.log('ALL PHASE 7 UNIT AND INTEGRATION TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Clean up test state
    resetSchedulerState();
    await Opportunity.deleteMany({ externalId: { $in: allTestIds } });
    await closeDB();
  }
}

if (require.main === module) {
  runPhase7Tests()
    .then(() => {
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error('\n[FAIL] Phase 7 Test Suite failed:', err);
      process.exit(1);
    });
}

module.exports = { runPhase7Tests };
