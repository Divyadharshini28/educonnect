/**
 * Brabble.ai API Service for EduConnect
 * 
 * Documentation: https://brabble.ai/developers
 * Base API URL: https://brabble.ai
 * Endpoint: /api/listings
 * 
 * Aggregates hackathons, competitions, and coding challenges from 22 platforms
 * (Unstop, Devpost, Devfolio, MLH, HackerEarth, etc.).
 */

const DEFAULT_BASE_URL = 'https://brabble.ai';
const { fetchWithRetry } = require('../utils/fetchWithRetry');
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for Brabble endpoints
 * 
 * @param {string} endpoint - Path (e.g. '/api/listings')
 * @param {Object} [params] - Query parameters (hub, limit, offset, city, etc.)
 * @param {Object} [options] - Configuration options (baseUrl, apiKey, timeoutMs)
 */
async function makeBrabbleRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.BRABBLE_API_BASE_URL || DEFAULT_BASE_URL;
  const apiKey = options.apiKey || process.env.BRABBLE_API_KEY || '';
  const timeoutMs = options.timeoutMs || Number(process.env.BRABBLE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // If no API key is provided and no mock/custom data is injected, report configuration requirement
  if (!apiKey && !options.customData) {
    return {
      success: false,
      data: null,
      statusCode: 401,
      isConfigRequired: true,
      error: 'BRABBLE_API_KEY is not configured in environment variables. Obtain an API key from https://brabble.ai/dashboard for live synchronization.'
    };
  }

  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'EduConnect-SyncService/1.0 (+https://educonnect.ac.in)'
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
  }

  const result = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers,
    timeoutMs
  });

  if (!result.ok) {
    const errorMsg = result.data?.error || result.error || result.rawText.slice(0, 300);
    return {
      success: false,
      data: null,
      statusCode: result.status,
      error: `Brabble API responded with status ${result.status}: ${errorMsg}`,
      isTimeout: result.isTimeout,
      isConfigRequired: result.status === 401
    };
  }

  return {
    success: true,
    data: result.data,
    statusCode: result.status
  };
}

/**
 * Fetch raw listings from Brabble API
 * 
 * @param {Object} [options]
 * @param {string} [options.hub] - 'hackathons' | 'competitions'
 * @param {number} [options.limit] - Max items to retrieve
 * @param {number} [options.offset] - Pagination offset
 * @param {string} [options.city] - Filter by city
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{ success: boolean, listings: Array, statusCode?: number, total?: number, error?: string }>}
 */
async function fetchListings(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      listings: options.customData,
      statusCode: 200,
      totalCount: options.customData.length,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.hub) params.hub = options.hub;
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;
  if (options.city) params.city = options.city;

  const result = await makeBrabbleRequest('/api/listings', params, options);

  if (!result.success) {
    return {
      success: false,
      listings: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout,
      isConfigRequired: result.isConfigRequired
    };
  }

  const listings = Array.isArray(result.data?.listings) ? result.data.listings : [];
  return {
    success: true,
    listings,
    statusCode: result.statusCode,
    totalCount: result.data?.total || listings.length,
    origin: result.data?.origin,
    refreshedAt: result.data?.refreshedAt
  };
}

/**
 * Fetch hackathons from Brabble API
 * 
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, listings: Array, statusCode?: number, totalCount?: number, error?: string }>}
 */
async function fetchHackathons(options = {}) {
  return fetchListings({
    ...options,
    hub: options.hub || 'hackathons'
  });
}

/**
 * Fetch competitions and contests from Brabble API
 * 
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, listings: Array, statusCode?: number, totalCount?: number, error?: string }>}
 */
async function fetchCompetitions(options = {}) {
  return fetchListings({
    ...options,
    hub: options.hub || 'competitions'
  });
}

module.exports = {
  makeBrabbleRequest,
  fetchListings,
  fetchHackathons,
  fetchCompetitions,
  DEFAULT_BASE_URL
};
