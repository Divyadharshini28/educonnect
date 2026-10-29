/**
 * Remotive Remote Jobs & Internships API Service for EduConnect
 * 
 * Documentation: https://remotive.com/api/remote-jobs
 * Base API URL: https://remotive.com
 * Endpoint: /api/remote-jobs
 * 
 * Provides access to structured remote tech opportunities, software development
 * roles, and internships with skill tags, company metadata, and application URLs.
 */

const { fetchWithRetry } = require('../utils/fetchWithRetry');

const DEFAULT_BASE_URL = 'https://remotive.com';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for Remotive endpoints
 * 
 * @param {string} endpoint - Path (e.g. '/api/remote-jobs')
 * @param {Object} [params] - Query parameters (category, search, limit)
 * @param {Object} [options] - Configuration options (baseUrl, timeoutMs)
 */
async function makeRemotiveRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.REMOTIVE_API_BASE_URL || DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs || Number(process.env.REMOTIVE_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

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
      error: `Remotive API responded with status ${result.status}: ${errorMsg}`,
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
 * Fetch remote jobs and internships from Remotive API
 * 
 * @param {Object} [options]
 * @param {string} [options.category] - Category filter (e.g. 'software-dev')
 * @param {string} [options.search] - Search keyword (e.g. 'intern', 'junior')
 * @param {number} [options.limit] - Limit count
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{
 *   success: boolean,
 *   jobs: Array,
 *   statusCode?: number,
 *   totalCount?: number,
 *   error?: string
 * }>}
 */
async function fetchJobs(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      jobs: options.customData,
      statusCode: 200,
      totalCount: options.customData.length,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.category) params.category = options.category;
  if (options.search) params.search = options.search;
  if (options.limit) params.limit = options.limit;

  const result = await makeRemotiveRequest('api/remote-jobs', params, options);

  if (!result.success) {
    return {
      success: false,
      jobs: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const rawList = Array.isArray(result.data?.jobs) ? result.data.jobs : [];
  return {
    success: true,
    jobs: rawList,
    statusCode: result.statusCode,
    totalCount: rawList.length
  };
}

/**
 * Fetch internships specifically from Remotive API
 * 
 * @param {Object} [options]
 */
async function fetchInternships(options = {}) {
  return fetchJobs({
    ...options,
    search: options.search || 'intern'
  });
}

module.exports = {
  makeRemotiveRequest,
  fetchJobs,
  fetchInternships,
  DEFAULT_BASE_URL
};
