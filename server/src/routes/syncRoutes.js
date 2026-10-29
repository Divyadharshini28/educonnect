const express = require('express');
const router = express.Router();
const SyncLog = require('../models/SyncLog');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { getSchedulerStatus, runScheduledSync } = require('../services/syncScheduler');
const {
  syncAllHopin,
  syncAllBrabble,
  syncAllBodhDisha,
  syncAllDevpost,
  syncAllRemotive,
  syncAllArbeitnow
} = require('../services/syncService');

const KNOWN_PROVIDERS = [
  {
    source: 'devpost',
    name: 'Devpost',
    category: 'hackathons',
    description: 'Global Student Hackathons & Coding Competitions',
    requiresConfig: false,
    endpointDoc: 'https://devpost.com/api/hackathons',
    syncFn: syncAllDevpost
  },
  {
    source: 'hopin',
    name: 'Hopin',
    category: 'events',
    description: 'Internships, Placement Drives & Academic Events',
    requiresConfig: false,
    endpointDoc: 'https://api.hopinjobs.com',
    syncFn: syncAllHopin
  },
  {
    source: 'remotive',
    name: 'Remotive',
    category: 'internships',
    description: 'Remote Software Engineering Roles & Student Internships',
    requiresConfig: false,
    endpointDoc: 'https://remotive.com/api/remote-jobs',
    syncFn: syncAllRemotive
  },
  {
    source: 'arbeitnow',
    name: 'Arbeitnow',
    category: 'jobs',
    description: 'Apprenticeships, Tech Internships & Junior Roles',
    requiresConfig: false,
    endpointDoc: 'https://www.arbeitnow.com/api/job-board-api',
    syncFn: syncAllArbeitnow
  },
  {
    source: 'brabble',
    name: 'Brabble.ai',
    category: 'hackathons',
    description: 'Competitive Programming & Multi-Platform Hub',
    requiresConfig: !process.env.BRABBLE_API_KEY,
    configInstructions: 'Set BRABBLE_API_KEY from https://brabble.ai/dashboard in server .env',
    endpointDoc: 'https://brabble.ai/api/listings',
    syncFn: syncAllBrabble
  },
  {
    source: 'bodhdisha',
    name: 'BodhDisha',
    category: 'scholarships',
    description: 'Scholarships, Educational Grants & Academic Programs',
    requiresConfig: !process.env.BODHDISHA_API_KEY,
    configInstructions: 'Set BODHDISHA_API_KEY from https://bodhdisha.com/api/register in server .env',
    endpointDoc: 'https://bodhdisha.com/api/v1',
    syncFn: syncAllBodhDisha
  }
];

/**
 * GET /api/sync/status
 * Get the current operational status of the scheduler, provider status cards, and recent sync execution logs.
 * Protected: Requires verified administrator authorization.
 */
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduler = getSchedulerStatus();
    const recentLogs = await SyncLog.find({})
      .sort({ startedAt: -1 })
      .limit(15)
      .lean();

    // Aggregate latest status for each known provider
    const providersStatus = await Promise.all(
      KNOWN_PROVIDERS.map(async (provider) => {
        const latestLog = await SyncLog.findOne({ source: provider.source })
          .sort({ startedAt: -1 })
          .lean();

        const latestSuccessLog = await SyncLog.findOne({
          source: provider.source,
          status: { $in: ['SUCCESS', 'PARTIAL_SUCCESS'] }
        })
          .sort({ startedAt: -1 })
          .lean();

        let status = 'NOT_RUN';
        if (latestLog) {
          status = latestLog.status;
        } else if (provider.requiresConfig) {
          status = 'CONFIG_REQUIRED';
        }

        return {
          source: provider.source,
          name: provider.name,
          category: provider.category,
          description: provider.description,
          requiresConfig: provider.requiresConfig,
          configInstructions: provider.configInstructions || null,
          endpointDoc: provider.endpointDoc,
          status,
          lastRunAt: latestLog ? latestLog.completedAt || latestLog.startedAt : null,
          lastSuccessfulAt: latestSuccessLog ? latestSuccessLog.completedAt || latestSuccessLog.startedAt : null,
          recordsFetched: latestLog?.recordsFetched || 0,
          recordsInserted: latestLog?.recordsInserted || 0,
          recordsUpdated: latestLog?.recordsUpdated || 0,
          recordsSkipped: latestLog?.recordsSkipped || 0,
          errorMessage: latestLog?.errorMessage || (provider.requiresConfig ? provider.configInstructions : null)
        };
      })
    );

    return res.status(200).json({
      scheduler,
      providers: providersStatus,
      recentLogs
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return res.status(500).json({ message: 'Error fetching sync status', error: error.message });
  }
});

/**
 * GET /api/sync/history
 * Fetch paginated synchronization logs with filtering by source and status.
 * Protected: Requires verified administrator authorization.
 */
router.get('/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.source && req.query.source !== 'all') {
      filter.source = String(req.query.source).toLowerCase().trim();
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.status = String(req.query.status).trim();
    }

    const [total, logs] = await Promise.all([
      SyncLog.countDocuments(filter),
      SyncLog.find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching sync history:', error);
    return res.status(500).json({ message: 'Error fetching sync history', error: error.message });
  }
});

/**
 * POST /api/sync/trigger
 * Manually trigger synchronization. Supports full cycle or targeted provider sync.
 * Protected: Requires verified administrator authorization.
 */
router.post('/trigger', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetProvider = req.body?.provider ? String(req.body.provider).toLowerCase().trim() : 'all';

    // If a specific provider was requested
    if (targetProvider && targetProvider !== 'all') {
      const providerConfig = KNOWN_PROVIDERS.find(p => p.source === targetProvider);
      if (!providerConfig) {
        return res.status(400).json({
          message: `Unknown opportunity provider: "${targetProvider}". Supported providers: ${KNOWN_PROVIDERS.map(p => p.source).join(', ')}`
        });
      }

      const syncResult = await providerConfig.syncFn(req.body || {});
      return res.status(200).json({
        message: `Synchronization completed for provider "${providerConfig.name}".`,
        provider: targetProvider,
        result: syncResult
      });
    }

    // Full multi-source synchronization run
    const syncResult = await runScheduledSync(req.body || {});

    if (syncResult.skipped) {
      return res.status(409).json({
        message: 'Synchronization already in progress. Trigger skipped.',
        status: syncResult
      });
    }

    return res.status(200).json({
      message: 'Full synchronization cycle across all providers completed.',
      status: syncResult
    });
  } catch (error) {
    console.error('Error executing manual sync trigger:', error);
    return res.status(500).json({ message: 'Error executing synchronization trigger', error: error.message });
  }
});

module.exports = router;
