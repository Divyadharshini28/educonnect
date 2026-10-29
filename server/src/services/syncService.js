/**
 * External Opportunity Synchronization Service
 * 
 * Orchestrates:
 * External API Fetch -> Normalization -> Validation -> Deduplication -> MongoDB Upsert -> SyncLog
 * 
 * Supported Opportunity Providers:
 * 1. Hopin (Internships, Jobs, Events)
 * 2. Brabble (Hackathons, Competitions)
 * 3. BodhDisha (Scholarships, Courses)
 * 4. Devpost (Global Student Hackathons & Competitions)
 * 5. Remotive (Remote Tech Internships & Entry-Level Engineering Placements)
 * 6. Arbeitnow (Apprenticeships, Tech Internships & Placements)
 */

const Opportunity = require('../models/Opportunity');
const SyncLog = require('../models/SyncLog');
const { fetchInternships: fetchHopinInternships, fetchJobs: fetchHopinJobs, fetchEvents: fetchHopinEvents } = require('./hopinService');
const { fetchHackathons: fetchBrabbleHackathons, fetchCompetitions: fetchBrabbleCompetitions, fetchListings: fetchBrabbleListings } = require('./brabbleService');
const { fetchScholarships: fetchBodhDishaScholarships, fetchCourses: fetchBodhDishaCourses } = require('./bodhdishaService');
const { fetchHackathons: fetchDevpostHackathons } = require('./devpostService');
const { fetchJobs: fetchRemotiveJobs, fetchInternships: fetchRemotiveInternships } = require('./remotiveService');
const { fetchJobs: fetchArbeitnowJobs } = require('./arbeitnowService');

const {
  normalizeHopinInternship,
  normalizeHopinJob,
  normalizeHopinEvent,
  normalizeBrabbleListing,
  normalizeBodhDishaScholarship,
  normalizeBodhDishaCourse,
  normalizeDevpostHackathon,
  normalizeRemotiveJob,
  normalizeArbeitnowJob,
  validateNormalizedOpportunity
} = require('../utils/normalizeOpportunity');
const { syncToDisk } = require('../config/dbPersistence');

/**
 * Generic external synchronization executor with fault isolation, deduplication, and SyncLog recording
 * 
 * @param {Object} params
 * @param {string} params.source - Provider identifier (e.g. 'hopin', 'devpost')
 * @param {string} params.category - Opportunity stream (e.g. 'internships', 'hackathons')
 * @param {Function} params.fetchFn - Fetch function
 * @param {Function} params.normalizeFn - Normalizer function
 * @param {string} params.dataKey - Key in fetch result
 * @param {Object} [params.options] - Runtime options (customData, timeoutMs, persistToDisk)
 */
async function executeGenericSync({ source, category, fetchFn, normalizeFn, dataKey, options = {} }) {
  const startedAt = new Date();
  const syncLog = new SyncLog({
    source,
    category,
    startedAt,
    status: 'IN_PROGRESS'
  });
  await syncLog.save();

  try {
    const fetchResult = await fetchFn(options);

    // Handle configuration required (e.g. missing API key)
    if (fetchResult.isConfigRequired) {
      syncLog.status = 'CONFIG_REQUIRED';
      syncLog.errorMessage = fetchResult.error || `Configuration required for source "${source}".`;
      syncLog.completedAt = new Date();
      await syncLog.save();

      return {
        success: false,
        isConfigRequired: true,
        syncLog,
        recordsFetched: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: [{ error: syncLog.errorMessage }]
      };
    }

    if (!fetchResult.success) {
      syncLog.status = 'FAILED';
      syncLog.errorMessage = fetchResult.error || `Failed to fetch ${category} from ${source}`;
      syncLog.completedAt = new Date();
      await syncLog.save();

      return {
        success: false,
        syncLog,
        recordsFetched: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: [{ error: syncLog.errorMessage }]
      };
    }

    const rawListings = Array.isArray(fetchResult[dataKey]) ? fetchResult[dataKey] : [];
    syncLog.recordsFetched = rawListings.length;

    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    const errors = [];

    // Process each record through normalization, validation, and deduplication
    for (const raw of rawListings) {
      try {
        const normalized = normalizeFn(raw);
        const validation = validateNormalizedOpportunity(normalized);

        if (!validation.isValid) {
          recordsSkipped++;
          errors.push({
            externalId: normalized.externalId || raw.id || 'unknown',
            reasons: validation.errors
          });
          continue;
        }

        // Deduplication & Identification by source + externalId
        const existing = await Opportunity.findOne({
          source: normalized.source,
          externalId: normalized.externalId
        });

        if (existing) {
          // Update existing external opportunity while strictly preserving document _id
          await Opportunity.updateOne(
            { _id: existing._id },
            { $set: normalized }
          );
          recordsUpdated++;
        } else {
          // Insert new external opportunity
          await Opportunity.create(normalized);
          recordsInserted++;
        }
      } catch (itemErr) {
        recordsSkipped++;
        errors.push({
          externalId: raw?.id || raw?.slug || 'unknown',
          error: itemErr.message
        });
      }
    }

    syncLog.recordsInserted = recordsInserted;
    syncLog.recordsUpdated = recordsUpdated;
    syncLog.recordsSkipped = recordsSkipped;
    syncLog.errors = errors;
    syncLog.completedAt = new Date();

    // Determine final status
    if (errors.length === 0) {
      syncLog.status = 'SUCCESS';
    } else if (recordsInserted > 0 || recordsUpdated > 0) {
      syncLog.status = 'PARTIAL_SUCCESS';
    } else {
      syncLog.status = rawListings.length === 0 ? 'SUCCESS' : 'FAILED';
    }

    await syncLog.save();

    if (options.persistToDisk !== false) {
      await syncToDisk();
    }

    return {
      success: syncLog.status !== 'FAILED',
      syncLog,
      recordsFetched: rawListings.length,
      recordsInserted,
      recordsUpdated,
      recordsSkipped,
      recordsFailed: errors.length,
      errors
    };
  } catch (err) {
    syncLog.status = 'FAILED';
    syncLog.errorMessage = err.message;
    syncLog.completedAt = new Date();
    await syncLog.save();

    return {
      success: false,
      syncLog,
      recordsFetched: syncLog.recordsFetched || 0,
      recordsInserted: syncLog.recordsInserted || 0,
      recordsUpdated: syncLog.recordsUpdated || 0,
      recordsSkipped: 0,
      recordsFailed: 1,
      errors: [{ error: err.message }]
    };
  }
}

// =========================================================================
// 1. HOPIN SYNCHRONIZATION
// =========================================================================

async function syncHopinInternships(options = {}) {
  return executeGenericSync({
    source: 'hopin',
    category: 'internships',
    fetchFn: fetchHopinInternships,
    normalizeFn: normalizeHopinInternship,
    dataKey: 'internships',
    options
  });
}

async function syncHopinJobs(options = {}) {
  return executeGenericSync({
    source: 'hopin',
    category: 'jobs',
    fetchFn: fetchHopinJobs,
    normalizeFn: normalizeHopinJob,
    dataKey: 'jobs',
    options
  });
}

async function syncHopinEvents(options = {}) {
  return executeGenericSync({
    source: 'hopin',
    category: 'events',
    fetchFn: fetchHopinEvents,
    normalizeFn: normalizeHopinEvent,
    dataKey: 'events',
    options
  });
}

async function syncAllHopin(options = {}) {
  const internships = await syncHopinInternships(options);
  const jobs = await syncHopinJobs(options);
  const events = await syncHopinEvents(options);

  return {
    success: Boolean(internships.success && jobs.success && events.success),
    internships,
    jobs,
    events
  };
}

// =========================================================================
// 2. BRABBLE SYNCHRONIZATION
// =========================================================================

async function executeBrabbleSync({ category, fetchFn, normalizeFn = normalizeBrabbleListing, dataKey = 'listings', options = {} }) {
  const startedAt = new Date();
  const syncLog = new SyncLog({
    source: 'brabble',
    category,
    startedAt,
    status: 'IN_PROGRESS'
  });
  await syncLog.save();

  try {
    const rawListings = [];
    const limit = options.limit || 20;
    let offset = options.offset || 0;
    const maxBatches = options.maxBatches || 10;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const fetchResult = await fetchFn({ ...options, limit, offset });

      if (fetchResult.isConfigRequired) {
        syncLog.status = 'CONFIG_REQUIRED';
        syncLog.errorMessage = fetchResult.error || 'BRABBLE_API_KEY required for live synchronization.';
        syncLog.completedAt = new Date();
        await syncLog.save();

        return {
          success: false,
          isConfigRequired: true,
          syncLog,
          recordsFetched: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          errors: [{ error: syncLog.errorMessage }]
        };
      }

      if (!fetchResult.success) {
        if (batchCount === 0) {
          syncLog.status = 'FAILED';
          syncLog.errorMessage = fetchResult.error || `Failed to fetch ${category} from Brabble`;
          syncLog.completedAt = new Date();
          await syncLog.save();

          return {
            success: false,
            syncLog,
            recordsFetched: 0,
            recordsInserted: 0,
            recordsUpdated: 0,
            recordsSkipped: 0,
            errors: [{ error: syncLog.errorMessage }]
          };
        }
        break;
      }

      const pageItems = fetchResult[dataKey] || [];
      if (pageItems.length === 0) break;

      rawListings.push(...pageItems);
      offset += pageItems.length;

      const totalCount = fetchResult.totalCount || fetchResult.total;
      if (totalCount && offset >= totalCount) break;
      if (pageItems.length < limit) break;
      batchCount++;
    }

    syncLog.recordsFetched = rawListings.length;

    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    const errors = [];

    for (const raw of rawListings) {
      try {
        const normalized = normalizeFn(raw);
        const validation = validateNormalizedOpportunity(normalized);

        if (!validation.isValid) {
          recordsSkipped++;
          errors.push({
            externalId: raw.id || 'unknown',
            reasons: validation.errors
          });
          continue;
        }

        const existing = await Opportunity.findOne({
          source: 'brabble',
          externalId: normalized.externalId
        });

        if (existing) {
          await Opportunity.updateOne(
            { _id: existing._id },
            { $set: normalized }
          );
          recordsUpdated++;
        } else {
          await Opportunity.create(normalized);
          recordsInserted++;
        }
      } catch (itemErr) {
        recordsSkipped++;
        errors.push({
          externalId: raw.id || 'unknown',
          error: itemErr.message
        });
      }
    }

    syncLog.recordsInserted = recordsInserted;
    syncLog.recordsUpdated = recordsUpdated;
    syncLog.recordsSkipped = recordsSkipped;
    syncLog.errors = errors;
    syncLog.completedAt = new Date();

    if (errors.length === 0) {
      syncLog.status = 'SUCCESS';
    } else if (recordsInserted > 0 || recordsUpdated > 0) {
      syncLog.status = 'PARTIAL_SUCCESS';
    } else {
      syncLog.status = rawListings.length === 0 ? 'SUCCESS' : 'FAILED';
    }

    await syncLog.save();

    if (options.persistToDisk !== false) {
      await syncToDisk();
    }

    return {
      success: syncLog.status !== 'FAILED',
      syncLog,
      recordsFetched: rawListings.length,
      recordsInserted,
      recordsUpdated,
      recordsSkipped,
      errors
    };
  } catch (err) {
    syncLog.status = 'FAILED';
    syncLog.errorMessage = err.message;
    syncLog.completedAt = new Date();
    await syncLog.save();

    return {
      success: false,
      syncLog,
      recordsFetched: syncLog.recordsFetched || 0,
      recordsInserted: syncLog.recordsInserted || 0,
      recordsUpdated: syncLog.recordsUpdated || 0,
      recordsSkipped: 0,
      errors: [{ error: err.message }]
    };
  }
}

async function syncBrabbleHackathons(options = {}) {
  return executeBrabbleSync({
    category: 'hackathons',
    fetchFn: fetchBrabbleHackathons,
    normalizeFn: normalizeBrabbleListing,
    dataKey: 'listings',
    options
  });
}

async function syncBrabbleCompetitions(options = {}) {
  return executeBrabbleSync({
    category: 'competitions',
    fetchFn: fetchBrabbleCompetitions,
    normalizeFn: normalizeBrabbleListing,
    dataKey: 'listings',
    options
  });
}

async function syncAllBrabble(options = {}) {
  const hackathons = await syncBrabbleHackathons(options);
  const competitions = await syncBrabbleCompetitions(options);

  return {
    success: Boolean(hackathons.success && competitions.success),
    isConfigRequired: Boolean(hackathons.isConfigRequired || competitions.isConfigRequired),
    hackathons,
    competitions
  };
}

// =========================================================================
// 3. BODHDISHA SYNCHRONIZATION
// =========================================================================

async function executeBodhDishaSync({ category, fetchFn, normalizeFn, dataKey, options = {} }) {
  const startedAt = new Date();
  const syncLog = new SyncLog({
    source: 'bodhdisha',
    category,
    startedAt,
    status: 'IN_PROGRESS'
  });
  await syncLog.save();

  try {
    const rawListings = [];
    let currentPage = options.page || 1;
    const perPage = options.perPage || 20;
    const maxPages = options.maxPages || 10;

    while (currentPage <= maxPages) {
      const fetchResult = await fetchFn({ ...options, page: currentPage, perPage });

      if (fetchResult.isConfigRequired) {
        syncLog.status = 'CONFIG_REQUIRED';
        syncLog.errorMessage = fetchResult.error || 'BODHDISHA_API_KEY required for live synchronization.';
        syncLog.completedAt = new Date();
        await syncLog.save();

        return {
          success: false,
          isConfigRequired: true,
          syncLog,
          recordsFetched: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          errors: [{ error: syncLog.errorMessage }]
        };
      }

      if (!fetchResult.success) {
        if (currentPage === 1) {
          syncLog.status = 'FAILED';
          syncLog.errorMessage = fetchResult.error || `Failed to fetch ${category} from BodhDisha`;
          syncLog.completedAt = new Date();
          await syncLog.save();

          return {
            success: false,
            syncLog,
            recordsFetched: 0,
            recordsInserted: 0,
            recordsUpdated: 0,
            recordsSkipped: 0,
            errors: [{ error: syncLog.errorMessage }]
          };
        }
        break;
      }

      const pageItems = fetchResult[dataKey] || [];
      if (pageItems.length === 0) break;

      rawListings.push(...pageItems);

      const totalPages = fetchResult.pagination?.total_pages || fetchResult.pagination?.totalPages;
      if (totalPages && currentPage >= totalPages) break;
      if (pageItems.length < perPage) break;
      currentPage++;
    }

    syncLog.recordsFetched = rawListings.length;

    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    const errors = [];

    for (const raw of rawListings) {
      try {
        const normalized = normalizeFn(raw);
        const validation = validateNormalizedOpportunity(normalized);

        if (!validation.isValid) {
          recordsSkipped++;
          errors.push({
            externalId: raw.id || 'unknown',
            reasons: validation.errors
          });
          continue;
        }

        const existing = await Opportunity.findOne({
          source: 'bodhdisha',
          externalId: normalized.externalId
        });

        if (existing) {
          await Opportunity.updateOne(
            { _id: existing._id },
            { $set: normalized }
          );
          recordsUpdated++;
        } else {
          await Opportunity.create(normalized);
          recordsInserted++;
        }
      } catch (itemErr) {
        recordsSkipped++;
        errors.push({
          externalId: raw.id || 'unknown',
          error: itemErr.message
        });
      }
    }

    syncLog.recordsInserted = recordsInserted;
    syncLog.recordsUpdated = recordsUpdated;
    syncLog.recordsSkipped = recordsSkipped;
    syncLog.errors = errors;
    syncLog.completedAt = new Date();

    if (errors.length === 0) {
      syncLog.status = 'SUCCESS';
    } else if (recordsInserted > 0 || recordsUpdated > 0) {
      syncLog.status = 'PARTIAL_SUCCESS';
    } else {
      syncLog.status = rawListings.length === 0 ? 'SUCCESS' : 'FAILED';
    }

    await syncLog.save();

    if (options.persistToDisk !== false) {
      await syncToDisk();
    }

    return {
      success: syncLog.status !== 'FAILED',
      syncLog,
      recordsFetched: rawListings.length,
      recordsInserted,
      recordsUpdated,
      recordsSkipped,
      errors
    };
  } catch (err) {
    syncLog.status = 'FAILED';
    syncLog.errorMessage = err.message;
    syncLog.completedAt = new Date();
    await syncLog.save();

    return {
      success: false,
      syncLog,
      recordsFetched: syncLog.recordsFetched || 0,
      recordsInserted: syncLog.recordsInserted || 0,
      recordsUpdated: syncLog.recordsUpdated || 0,
      recordsSkipped: 0,
      errors: [{ error: err.message }]
    };
  }
}

async function syncBodhDishaScholarships(options = {}) {
  return executeBodhDishaSync({
    category: 'scholarships',
    fetchFn: fetchBodhDishaScholarships,
    normalizeFn: normalizeBodhDishaScholarship,
    dataKey: 'scholarships',
    options
  });
}

async function syncBodhDishaCourses(options = {}) {
  return executeBodhDishaSync({
    category: 'courses',
    fetchFn: fetchBodhDishaCourses,
    normalizeFn: normalizeBodhDishaCourse,
    dataKey: 'courses',
    options
  });
}

async function syncAllBodhDisha(options = {}) {
  const scholarships = await syncBodhDishaScholarships(options);
  const courses = await syncBodhDishaCourses(options);

  return {
    success: Boolean(scholarships.success && courses.success),
    isConfigRequired: Boolean(scholarships.isConfigRequired || courses.isConfigRequired),
    scholarships,
    courses
  };
}

// =========================================================================
// 4. DEVPOST SYNCHRONIZATION
// =========================================================================

async function syncDevpostHackathons(options = {}) {
  return executeGenericSync({
    source: 'devpost',
    category: 'hackathons',
    fetchFn: fetchDevpostHackathons,
    normalizeFn: normalizeDevpostHackathon,
    dataKey: 'hackathons',
    options
  });
}

async function syncAllDevpost(options = {}) {
  const hackathons = await syncDevpostHackathons(options);

  return {
    success: Boolean(hackathons.success),
    hackathons
  };
}

// =========================================================================
// 5. REMOTIVE SYNCHRONIZATION
// =========================================================================

async function syncRemotiveJobs(options = {}) {
  return executeGenericSync({
    source: 'remotive',
    category: 'jobs',
    fetchFn: fetchRemotiveJobs,
    normalizeFn: normalizeRemotiveJob,
    dataKey: 'jobs',
    options
  });
}

async function syncRemotiveInternships(options = {}) {
  return executeGenericSync({
    source: 'remotive',
    category: 'internships',
    fetchFn: fetchRemotiveInternships,
    normalizeFn: normalizeRemotiveJob,
    dataKey: 'jobs',
    options
  });
}

async function syncAllRemotive(options = {}) {
  const internships = await syncRemotiveInternships(options);
  const jobs = await syncRemotiveJobs(options);

  return {
    success: Boolean(internships.success && jobs.success),
    internships,
    jobs
  };
}

// =========================================================================
// 6. ARBEITNOW SYNCHRONIZATION
// =========================================================================

async function syncArbeitnowJobs(options = {}) {
  return executeGenericSync({
    source: 'arbeitnow',
    category: 'jobs',
    fetchFn: fetchArbeitnowJobs,
    normalizeFn: normalizeArbeitnowJob,
    dataKey: 'jobs',
    options
  });
}

async function syncAllArbeitnow(options = {}) {
  const jobs = await syncArbeitnowJobs(options);

  return {
    success: Boolean(jobs.success),
    jobs
  };
}

// =========================================================================
// UNIFIED MULTI-SOURCE SYNCHRONIZATION
// =========================================================================

/**
 * Synchronize external opportunities across all configured sources with fault isolation
 * 
 * @param {Object} [options]
 * @returns {Promise<{
 *   success: boolean,
 *   allSucceeded: boolean,
 *   hopin: Object,
 *   brabble: Object,
 *   bodhdisha: Object,
 *   devpost: Object,
 *   remotive: Object,
 *   arbeitnow: Object,
 *   providers: Object,
 *   summary: Object
 * }>}
 */
async function syncAllSources(options = {}) {
  let hopin = { success: false, error: 'Not run' };
  let brabble = { success: false, error: 'Not run' };
  let bodhdisha = { success: false, error: 'Not run' };
  let devpost = { success: false, error: 'Not run' };
  let remotive = { success: false, error: 'Not run' };
  let arbeitnow = { success: false, error: 'Not run' };

  // Provider isolation: execute each independently without failing others
  try {
    hopin = await syncAllHopin(options);
  } catch (hErr) {
    hopin = { success: false, error: hErr.message };
  }

  try {
    brabble = await syncAllBrabble(options);
  } catch (bErr) {
    brabble = { success: false, error: bErr.message };
  }

  try {
    bodhdisha = await syncAllBodhDisha(options);
  } catch (bdErr) {
    bodhdisha = { success: false, error: bdErr.message };
  }

  try {
    devpost = await syncAllDevpost(options);
  } catch (dpErr) {
    devpost = { success: false, error: dpErr.message };
  }

  try {
    remotive = await syncAllRemotive(options);
  } catch (remErr) {
    remotive = { success: false, error: remErr.message };
  }

  try {
    arbeitnow = await syncAllArbeitnow(options);
  } catch (arbErr) {
    arbeitnow = { success: false, error: arbErr.message };
  }

  const providers = {
    hopin,
    brabble,
    bodhdisha,
    devpost,
    remotive,
    arbeitnow
  };

  const successfulCount = Object.values(providers).filter(p => p.success).length;

  return {
    success: successfulCount > 0,
    allSucceeded: successfulCount === Object.keys(providers).length,
    hopin,
    brabble,
    bodhdisha,
    devpost,
    remotive,
    arbeitnow,
    providers,
    summary: {
      totalProviders: Object.keys(providers).length,
      successfulProviders: successfulCount,
      timestamp: new Date()
    }
  };
}

module.exports = {
  syncHopinInternships,
  syncHopinJobs,
  syncHopinEvents,
  syncAllHopin,
  syncBrabbleHackathons,
  syncBrabbleCompetitions,
  syncAllBrabble,
  syncBodhDishaScholarships,
  syncBodhDishaCourses,
  syncAllBodhDisha,
  syncDevpostHackathons,
  syncAllDevpost,
  syncRemotiveJobs,
  syncRemotiveInternships,
  syncAllRemotive,
  syncArbeitnowJobs,
  syncAllArbeitnow,
  syncAllSources
};
