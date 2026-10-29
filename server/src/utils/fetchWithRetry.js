/**
 * HTTP Request Helper with Bounded Retries, Backoff, and Timeout
 * 
 * Provides resilient, bounded request execution for external API integrations.
 */

/**
 * Perform a fetch request with timeout and exponential backoff retry for transient errors.
 * 
 * @param {string} url - Target URL
 * @param {Object} [options] - Fetch options
 * @param {number} [options.timeoutMs=10000] - Request timeout in ms
 * @param {number} [options.maxRetries=2] - Number of retries on transient errors (429, 500, 502, 503, 504, network error)
 * @param {number} [options.retryDelayMs=1000] - Base delay for exponential backoff
 * @param {Object} [options.headers] - Additional HTTP headers
 * @returns {Promise<{ ok: boolean, status: number, data: any, rawText: string, error?: string, isTimeout?: boolean }>}
 */
async function fetchWithRetry(url, options = {}) {
  const timeoutMs = options.timeoutMs || 10000;
  const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2;
  const retryDelayMs = options.retryDelayMs || 1000;
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'EduConnect-SyncService/1.0 (+https://educonnect.ac.in)',
    ...(options.headers || {})
  };

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timer);

      let rawText = '';
      try {
        rawText = await response.text();
      } catch (_) {}

      let parsedData = null;
      if (rawText && rawText.trim()) {
        try {
          parsedData = JSON.parse(rawText);
        } catch (_) {
          parsedData = null;
        }
      }

      // Check for transient server errors (429 Rate Limit or 5xx Server Error)
      const isTransient = response.status === 429 || (response.status >= 500 && response.status <= 504);
      if (isTransient && attempt < maxRetries) {
        attempt++;
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return {
        ok: response.ok,
        status: response.status,
        data: parsedData,
        rawText,
        error: response.ok ? null : (parsedData?.error?.message || parsedData?.error || parsedData?.message || `HTTP ${response.status}: ${rawText.slice(0, 200)}`)
      };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError';

      if (attempt < maxRetries) {
        attempt++;
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return {
        ok: false,
        status: isTimeout ? 408 : 0,
        data: null,
        rawText: '',
        error: isTimeout ? `Request timed out after ${timeoutMs}ms` : `Network error: ${err.message}`,
        isTimeout
      };
    }
  }
}

module.exports = { fetchWithRetry };
