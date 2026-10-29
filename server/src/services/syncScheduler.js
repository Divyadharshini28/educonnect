/**
 * Automated External Opportunity Synchronization Scheduler
 * 
 * Periodically executes the unified opportunity ingestion pipeline across
 * all supported external sources (Hopin, Brabble, and BodhDisha).
 * 
 * Features:
 * - Configurable cron schedule via SYNC_SCHEDULE (default: every 6 hours)
 * - Dynamic enable/disable via SYNC_SCHEDULER_ENABLED
 * - In-process lock preventing overlapping synchronization runs
 * - Automatic safety check: disabled in test environment (NODE_ENV=test)
 * - Complete execution metrics and status inspection
 * - Clean process shutdown handling
 */

const cron = require('node-cron');
const { syncAllSources } = require('./syncService');

const DEFAULT_SCHEDULE = '0 */6 * * *'; // Every 6 hours

// In-process lock and scheduler state
let cronJob = null;
let isSyncInProgress = false;
let scheduledTaskRunning = false;
let activeSchedule = DEFAULT_SCHEDULE;

// Lifecycle and observability metrics
let lastRunStartedAt = null;
let lastRunCompletedAt = null;
let lastRunResult = null;
let totalRuns = 0;
let successfulRuns = 0;
let failedRuns = 0;
let skippedRuns = 0;

/**
 * Execute a synchronization cycle with strict overlap prevention
 * 
 * @param {Object} [options]
 * @param {Object} [options.syncOptions] - Options passed to syncAllSources (e.g. customData)
 * @returns {Promise<{ success: boolean, skipped?: boolean, reason?: string, result?: Object, error?: string }>}
 */
async function runScheduledSync(options = {}) {
  // Overlap prevention: Do not allow concurrent synchronization runs
  if (isSyncInProgress) {
    skippedRuns++;
    console.warn('[SyncScheduler] Overlap detected: previous synchronization is still running. Skipping this trigger.');
    return {
      success: false,
      skipped: true,
      reason: 'Synchronization already in progress'
    };
  }

  isSyncInProgress = true;
  totalRuns++;
  lastRunStartedAt = new Date();
  console.log(`[SyncScheduler] Automated synchronization cycle #${totalRuns} started at ${lastRunStartedAt.toISOString()}`);

  try {
    const syncOptions = options.syncOptions || options;
    const result = await syncAllSources(syncOptions);

    lastRunResult = result;
    if (result && result.success) {
      successfulRuns++;
      console.log(`[SyncScheduler] Automated synchronization cycle #${totalRuns} finished successfully.`);
    } else {
      failedRuns++;
      console.warn(`[SyncScheduler] Automated synchronization cycle #${totalRuns} finished with partial or failed source results.`);
    }

    return {
      success: result ? result.success : false,
      skipped: false,
      result
    };
  } catch (err) {
    failedRuns++;
    lastRunResult = { success: false, error: err.message };
    console.error(`[SyncScheduler] Unexpected error during synchronization cycle #${totalRuns}:`, err);
    return {
      success: false,
      skipped: false,
      error: err.message
    };
  } finally {
    isSyncInProgress = false;
    lastRunCompletedAt = new Date();
  }
}

/**
 * Start the automated synchronization scheduler
 * 
 * @param {Object} [options]
 * @param {string} [options.schedule] - Cron expression (e.g. '0 * * * *')
 * @param {boolean} [options.enabled] - Explicit enable flag
 * @param {boolean} [options.force=false] - Force start even in test environment
 * @param {Object} [options.syncOptions] - Default options to pass to sync cycles
 * @returns {{ started: boolean, schedule?: string, reason?: string, error?: string }}
 */
function startSyncScheduler(options = {}) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isExplicitlyDisabled = process.env.SYNC_SCHEDULER_ENABLED === 'false';

  // Do not start automatically if disabled or running in test mode (unless explicitly forced)
  if (!options.force) {
    if (options.enabled === false || isExplicitlyDisabled) {
      console.log('[SyncScheduler] Scheduler disabled via configuration (SYNC_SCHEDULER_ENABLED=false).');
      return { started: false, reason: 'Scheduler disabled by configuration' };
    }

    if (isTestEnv && options.enabled !== true) {
      console.log('[SyncScheduler] Scheduler not started automatically in test environment.');
      return { started: false, reason: 'Disabled in test environment' };
    }
  }

  const scheduleExpr = options.schedule || process.env.SYNC_SCHEDULE || DEFAULT_SCHEDULE;

  if (!cron.validate(scheduleExpr)) {
    console.error(`[SyncScheduler] Invalid cron schedule expression: "${scheduleExpr}"`);
    return { started: false, error: `Invalid cron schedule expression: "${scheduleExpr}"` };
  }

  // Stop any existing running schedule
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }

  activeSchedule = scheduleExpr;
  cronJob = cron.schedule(scheduleExpr, async () => {
    await runScheduledSync(options.syncOptions || {});
  });

  scheduledTaskRunning = true;
  console.log(`[SyncScheduler] Automated synchronization scheduler started with schedule: "${scheduleExpr}"`);

  return {
    started: true,
    schedule: scheduleExpr
  };
}

/**
 * Stop the automated synchronization scheduler
 * 
 * @returns {{ stopped: boolean }}
 */
function stopSyncScheduler() {
  if (cronJob) {
    try {
      cronJob.stop();
      if (typeof cronJob.destroy === 'function') cronJob.destroy();
      if (typeof cronJob.unref === 'function') cronJob.unref();
    } catch (_) {}
    cronJob = null;
  }
  scheduledTaskRunning = false;
  console.log('[SyncScheduler] Automated synchronization scheduler stopped.');
  return { stopped: true };
}

/**
 * Retrieve current scheduler operational status and metrics
 * 
 * @returns {Object}
 */
function getSchedulerStatus() {
  return {
    isRunning: scheduledTaskRunning,
    isSyncInProgress,
    enabled: process.env.SYNC_SCHEDULER_ENABLED !== 'false' && process.env.NODE_ENV !== 'test',
    schedule: activeSchedule,
    lastRunStartedAt,
    lastRunCompletedAt,
    lastRunResult,
    metrics: {
      totalRuns,
      successfulRuns,
      failedRuns,
      skippedRuns
    }
  };
}

/**
 * Reset scheduler counters and state (useful for test isolation)
 */
function resetSchedulerState() {
  stopSyncScheduler();
  isSyncInProgress = false;
  scheduledTaskRunning = false;
  activeSchedule = DEFAULT_SCHEDULE;
  lastRunStartedAt = null;
  lastRunCompletedAt = null;
  lastRunResult = null;
  totalRuns = 0;
  successfulRuns = 0;
  failedRuns = 0;
  skippedRuns = 0;
}

// Clean shutdown hooks
if (process.env.NODE_ENV !== 'test') {
  const handleShutdown = () => {
    if (scheduledTaskRunning) {
      console.log('[SyncScheduler] Gracefully stopping scheduler on process termination...');
      stopSyncScheduler();
    }
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);
}

module.exports = {
  startSyncScheduler,
  stopSyncScheduler,
  runScheduledSync,
  getSchedulerStatus,
  resetSchedulerState,
  DEFAULT_SCHEDULE
};
