/**
 * Arbeitnow Jobs & Apprenticeships API Service for EduConnect
 * 
 * Documentation: https://www.arbeitnow.com/api/job-board-api
 * Base API URL: https://www.arbeitnow.com
 * Endpoint: /api/job-board-api
 * 
 * Provides access to structured technology jobs, internships, apprenticeships,
 * and entry-level engineering roles with remote status, skills, and application links.
 */

const { fetchWithRetry } = require('../utils/fetchWithRetry');

const DEFAULT_BASE_URL = 'https://www.arbeitnow.com';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for Arbeitnow endpoints
 * 
 * @param {string} endpoint - Path (e.g. '/api/job-board-api')
 * @param {Object} [params] - Query parameters (page)
 * @param {Object} [options] - Configuration options (baseUrl, timeoutMs)
 */
async function makeArbeitnowRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.ARBEITNOW_API_BASE_URL || DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs || Number(process.env.ARBEITNOW_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

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
      error: `Arbeitnow API responded with status ${result.status}: ${errorMsg}`,
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
 * Fetch jobs and internships from Arbeitnow API
 * 
 * @param {Object} [options]
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{
 *   success: boolean,
 *   jobs: Array,
 *   links?: Object,
 *   meta?: Object,
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
  if (options.page) params.page = options.page;

  const result = await makeArbeitnowRequest('api/job-board-api', params, options);

  if (!result.success) {
    return {
      success: false,
      jobs: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const rawList = Array.isArray(result.data?.data) ? result.data.data : [];
  return {
    success: true,
    jobs: rawList,
    links: result.data?.links || null,
    meta: result.data?.meta || null,
    statusCode: result.statusCode,
    totalCount: rawList.length
  };
}

module.exports = {
  makeArbeitnowRequest,
  fetchJobs,
  DEFAULT_BASE_URL
};
