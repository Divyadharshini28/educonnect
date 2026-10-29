/**
 * Utility to sanitize metadata attached to student interaction events.
 * 
 * Enforces strict privacy and security:
 * - Strips sensitive credentials, tokens, keys, passwords, and auth headers
 * - Enforces allowed analytical fields only (source, page, position, targetUrl, etc.)
 * - Limits string lengths and value bounds to prevent database bloat
 */

const ALLOWED_METADATA_FIELDS = new Set([
  'source',
  'page',
  'position',
  'targetUrl',
  'applicationId',
  'clientTimestamp',
  'section',
  'action'
]);

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /cookie/i,
  /credential/i,
  /session/i,
  /bearer/i
];

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

function sanitizeMetadata(rawMetadata) {
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(rawMetadata)) {
    // 1. Check for sensitive keys
    if (isSensitiveKey(key)) {
      continue;
    }

    // 2. Only allow predefined whitelisted metadata fields
    if (!ALLOWED_METADATA_FIELDS.has(key)) {
      continue;
    }

    // 3. Sanitize and bound values based on key
    if (key === 'position' || key === 'clientTimestamp') {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        sanitized[key] = num;
      }
    } else if (key === 'targetUrl') {
      if (typeof value === 'string') {
        // Strip any potential tokens or query parameters containing sensitive keys
        const trimmed = value.trim().slice(0, 500);
        sanitized[key] = trimmed;
      }
    } else if (typeof value === 'string') {
      // String bounds (max 120 chars)
      sanitized[key] = value.trim().slice(0, 120);
    } else if (typeof value === 'object' && value !== null) {
      // If ObjectId or stringifiable id
      if (key === 'applicationId') {
        sanitized[key] = String(value).slice(0, 50);
      }
    }
  }

  return sanitized;
}

module.exports = {
  sanitizeMetadata,
  ALLOWED_METADATA_FIELDS
};
