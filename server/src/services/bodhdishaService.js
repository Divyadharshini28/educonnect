/**
 * BodhDisha API Service for EduConnect
 * 
 * Documentation: https://bodhdisha.com/api/docs
 * Base API URL: https://bodhdisha.com/api/v1
 * Endpoints:
 *   - GET /scholarships (and /scholarships/{slug})
 *   - GET /courses (and /courses/{slug})
 * 
 * Provides access to structured information regarding scholarships and academic/coaching courses.
 */

const DEFAULT_BASE_URL = 'https://bodhdisha.com/api/v1';
const { fetchWithRetry } = require('../utils/fetchWithRetry');
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for BodhDisha endpoints
 * 
 * @param {string} endpoint - Path relative to base URL (e.g. '/scholarships')
 * @param {Object} [params] - Query parameters (page, per_page, search, etc.)
 * @param {Object} [options] - Configuration options (baseUrl, apiKey, timeoutMs)
 */
async function makeBodhDishaRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.BODHDISHA_API_BASE_URL || DEFAULT_BASE_URL;
  const apiKey = options.apiKey || process.env.BODHDISHA_API_KEY || '';
  const timeoutMs = options.timeoutMs || Number(process.env.BODHDISHA_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  // If no API key is provided and no mock/custom data is injected, report configuration requirement
  if (!apiKey && !options.customData) {
    return {
      success: false,
      data: null,
      statusCode: 401,
      isConfigRequired: true,
      error: 'BODHDISHA_API_KEY is not configured in environment variables. Obtain an API key from https://bodhdisha.com/api/register for live synchronization.'
    };
  }

  const url = new URL(endpoint.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
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
    headers['X-API-Key'] = apiKey;
  }

  const result = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers,
    timeoutMs
  });

  if (!result.ok) {
    const errorMsg = result.data?.error?.message || result.data?.message || result.error || result.rawText.slice(0, 300);
    return {
      success: false,
      data: null,
      statusCode: result.status,
      error: `BodhDisha API responded with status ${result.status}: ${errorMsg}`,
      isTimeout: result.isTimeout,
      isConfigRequired: result.status === 401
    };
  }

  const parsedJson = result.data;
  if (parsedJson && parsedJson.success === false) {
    return {
      success: false,
      data: null,
      statusCode: result.status,
      error: parsedJson.error?.message || 'BodhDisha API returned unsuccessful response'
    };
  }

  // BodhDisha wraps collection responses in { success: true, data: [...], pagination: {...} }
  const responseData = parsedJson?.data !== undefined ? parsedJson.data : parsedJson;

  return {
    success: true,
    data: responseData,
    pagination: parsedJson?.pagination || null,
    statusCode: result.status
  };
}

/**
 * Fetch scholarships from BodhDisha API
 * 
 * @param {Object} [options]
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {number} [options.perPage=20] - Records per page
 * @param {string} [options.search] - Search term across name, provider, education_level, state
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{ success: boolean, scholarships: Array, pagination?: Object, statusCode?: number, error?: string }>}
 */
async function fetchScholarships(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      scholarships: options.customData,
      statusCode: 200,
      totalCount: options.customData.length,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.page) params.page = options.page;
  if (options.perPage || options.per_page) params.per_page = options.perPage || options.per_page;
  if (options.search) params.search = options.search;

  const result = await makeBodhDishaRequest('scholarships', params, options);

  if (!result.success) {
    return {
      success: false,
      scholarships: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout,
      isConfigRequired: result.isConfigRequired
    };
  }

  const rawList = Array.isArray(result.data) ? result.data : [];
  return {
    success: true,
    scholarships: rawList,
    pagination: result.pagination,
    statusCode: result.statusCode,
    totalCount: result.pagination?.total || rawList.length
  };
}

/**
 * Fetch courses from BodhDisha API
 * 
 * @param {Object} [options]
 * @param {number} [options.page=1] - Page number (1-indexed)
 * @param {number} [options.perPage=20] - Records per page
 * @param {string} [options.search] - Search term across name, provider, level, duration
 * @param {Array} [options.customData] - Direct dataset injection (for testing/mocking)
 * @returns {Promise<{ success: boolean, courses: Array, pagination?: Object, statusCode?: number, error?: string }>}
 */
async function fetchCourses(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      courses: options.customData,
      statusCode: 200,
      totalCount: options.customData.length,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.page) params.page = options.page;
  if (options.perPage || options.per_page) params.per_page = options.perPage || options.per_page;
  if (options.search) params.search = options.search;

  const result = await makeBodhDishaRequest('courses', params, options);

  if (!result.success) {
    return {
      success: false,
      courses: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout,
      isConfigRequired: result.isConfigRequired
    };
  }

  const rawList = Array.isArray(result.data) ? result.data : [];
  return {
    success: true,
    courses: rawList,
    pagination: result.pagination,
    statusCode: result.statusCode,
    totalCount: result.pagination?.total || rawList.length
  };
}

module.exports = {
  makeBodhDishaRequest,
  fetchScholarships,
  fetchCourses,
  DEFAULT_BASE_URL
};
