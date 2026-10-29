/**
 * Devpost Hackathons API Service for EduConnect
 * 
 * Documentation: https://devpost.com/api/hackathons
 * Base API URL: https://devpost.com
 * Endpoint: /api/hackathons
 * 
 * Provides access to real-world global student hackathons, coding challenges,
 * machine learning sprints, and competitive programming events with verified
 * prizes, deadlines, themes, and external participant counts.
 */

const { fetchWithRetry } = require('../utils/fetchWithRetry');

const DEFAULT_BASE_URL = 'https://devpost.com';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for Devpost endpoints
 * 
 * @param {string} endpoint - Path (e.g. '/api/hackathons')
 * @param {Object} [params] - Query parameters (page, challenge_type, sort_by)
 * @param {Object} [options] - Configuration options (baseUrl, timeoutMs)
 */
async function makeDevpostRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.DEVPOST_API_BASE_URL || DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs || Number(process.env.DEVPOST_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const url = new URL(endpoint.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const result = await fetchWithRetry(url.toString(), {
    method: 'GET',
    timeoutMs,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'EduConnect-SyncService/1.0 (+https://educonnect.ac.in)'
    }
  });

  if (!result.ok) {
    const errorMsg = result.data?.error || result.error || result.rawText.slice(0, 300);
    return {
      success: false,
      data: null,
      statusCode: result.status,
      error: `Devpost API responded with status ${result.status}: ${errorMsg}`,
      isTimeout: result.isTimeout
    };
  }

  return {
    success: true,
    data: result.data,
    statusCode: result.status
  };
}

/**
 * Fetch hackathons from Devpost API
 * 
 * @param {Object} [options]
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {string} [options.challengeType] - 'online' | 'in-person'
 * @param {string} [options.sortBy] - 'recently-added' | 'submission-deadline'
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{
 *   success: boolean,
 *   hackathons: Array,
 *   meta?: Object,
 *   statusCode?: number,
 *   totalCount?: number,
 *   error?: string
 * }>}
 */
async function fetchHackathons(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      hackathons: options.customData,
      statusCode: 200,
      totalCount: options.customData.length,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.page) params.page = options.page;
  if (options.challengeType) params.challenge_type = options.challengeType;
  if (options.sortBy) params.sort_by = options.sortBy;

  const result = await makeDevpostRequest('api/hackathons', params, options);

  if (!result.success) {
    return {
      success: false,
      hackathons: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const rawList = Array.isArray(result.data?.hackathons) ? result.data.hackathons : [];
  return {
    success: true,
    hackathons: rawList,
    meta: result.data?.meta || null,
    statusCode: result.statusCode,
    totalCount: result.data?.meta?.total_count || rawList.length
  };
}

module.exports = {
  makeDevpostRequest,
  fetchHackathons,
  DEFAULT_BASE_URL
};
