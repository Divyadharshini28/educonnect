import api from '../api.js';

/**
 * Asynchronous, non-blocking student interaction tracker for EduConnect.
 * 
 * Records behavioral interaction events (VIEW, CLICK, BOOKMARK, UNBOOKMARK, APPLY)
 * without ever interrupting or failing primary student UI flows.
 */

export async function recordInteraction(opportunityId, interactionType, metadata = {}) {
  if (!opportunityId || !interactionType) {
    return null;
  }

  try {
    const payload = {
      opportunityId,
      interactionType,
      metadata: {
        ...metadata,
        clientTimestamp: Date.now()
      }
    };

    const res = await api.post('/api/interactions', payload);
    return res.data;
  } catch (err) {
    // Non-blocking: fail gracefully without breaking the user experience
    console.warn(`[Analytics Tracker] Non-blocking tracking failed for ${interactionType}:`, err.message);
    return null;
  }
}

export function trackView(opportunityId, metadata = {}) {
  return recordInteraction(opportunityId, 'VIEW', {
    source: 'opportunity-detail',
    ...metadata
  });
}

export function trackClick(opportunityId, metadata = {}) {
  return recordInteraction(opportunityId, 'CLICK', {
    source: 'external-action-link',
    ...metadata
  });
}

export function trackBookmark(opportunityId, metadata = {}) {
  return recordInteraction(opportunityId, 'BOOKMARK', {
    source: 'opportunity-card',
    ...metadata
  });
}

export function trackUnbookmark(opportunityId, metadata = {}) {
  return recordInteraction(opportunityId, 'UNBOOKMARK', {
    source: 'opportunity-card',
    ...metadata
  });
}

export function trackApply(opportunityId, metadata = {}) {
  return recordInteraction(opportunityId, 'APPLY', {
    source: 'application-modal',
    ...metadata
  });
}

export async function getInteractionSummary() {
  try {
    const res = await api.get('/api/interactions/summary');
    return res.data;
  } catch (err) {
    console.warn('[Analytics Tracker] Failed to retrieve interaction summary:', err.message);
    return null;
  }
}

export async function getInteractionHistory(params = {}) {
  try {
    const res = await api.get('/api/interactions', { params });
    return res.data;
  } catch (err) {
    console.warn('[Analytics Tracker] Failed to retrieve interaction history:', err.message);
    return { data: [], total: 0, page: 1, limit: 20 };
  }
}
