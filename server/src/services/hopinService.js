/**
 * Hopin Jobs API Service for EduConnect
 * 
 * Documentation: https://hopinjobs.com/api
 * Base API URL: https://api.hopinjobs.com
 * OpenAPI Specification: https://hopinjobs.com/openapi.json
 */

const DEFAULT_BASE_URL = 'https://api.hopinjobs.com';
const { fetchWithRetry } = require('../utils/fetchWithRetry');
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Generic request helper for Hopin endpoints
 */
async function makeHopinRequest(endpoint, params = {}, options = {}) {
  const baseUrl = options.baseUrl || process.env.HOPIN_API_BASE_URL || DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs || Number(process.env.HOPIN_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const url = new URL(endpoint, baseUrl);
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
    return {
      success: false,
      data: null,
      statusCode: result.status,
      error: `Hopin API responded with status ${result.status}: ${result.error || result.rawText.slice(0, 300)}`,
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
 * Fetch internships from Hopin Public API
 * 
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, internships: Array, statusCode?: number, error?: string }>}
 */
async function fetchInternships(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      internships: options.customData,
      statusCode: 200,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.isUnofficial) params.is_unofficial = 'true';
  if (options.isOnCampus) params.is_on_campus = 'true';
  if (options.workType) params.work_type = options.workType;
  if (options.industry) params.industry = options.industry;
  if (options.location) params.location = options.location;
  if (options.roleType) params.role_type = options.roleType;

  const result = await makeHopinRequest('/api/internships', params, options);

  if (!result.success) {
    return {
      success: false,
      internships: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const internships = Array.isArray(result.data?.internships) ? result.data.internships : [];
  return {
    success: true,
    internships,
    statusCode: result.statusCode,
    totalCount: internships.length
  };
}

/**
 * Fetch jobs from Hopin Public API
 * 
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, jobs: Array, statusCode?: number, error?: string }>}
 */
async function fetchJobs(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      jobs: options.customData,
      statusCode: 200,
      source: 'custom_inject'
    };
  }

  const params = {};
  if (options.isUnofficial) params.is_unofficial = 'true';
  if (options.isOnCampus) params.is_on_campus = 'true';
  if (options.workType) params.work_type = options.workType;
  if (options.industry) params.industry = options.industry;
  if (options.location) params.location = options.location;
  if (options.roleType) params.role_type = options.roleType;

  const result = await makeHopinRequest('/api/jobs', params, options);

  if (!result.success) {
    return {
      success: false,
      jobs: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const jobs = Array.isArray(result.data?.jobs) ? result.data.jobs : [];
  return {
    success: true,
    jobs,
    statusCode: result.statusCode,
    totalCount: jobs.length
  };
}

/**
 * Fetch events from Hopin Public API
 * 
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, events: Array, statusCode?: number, error?: string }>}
 */
async function fetchEvents(options = {}) {
  if (Array.isArray(options.customData)) {
    return {
      success: true,
      events: options.customData,
      statusCode: 200,
      source: 'custom_inject'
    };
  }

  const result = await makeHopinRequest('/api/events', {}, options);

  if (!result.success) {
    return {
      success: false,
      events: [],
      statusCode: result.statusCode,
      error: result.error,
      isTimeout: result.isTimeout
    };
  }

  const events = Array.isArray(result.data?.events) ? result.data.events : [];
  return {
    success: true,
    events,
    statusCode: result.statusCode,
    totalCount: events.length
  };
}

module.exports = {
  fetchInternships,
  fetchJobs,
  fetchEvents,
  DEFAULT_BASE_URL
};
