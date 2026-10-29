/**
 * Application lifecycle stages and status mapping
 * 
 * Stages represent the progression from profile setup through decision.
 * Opportunity status ('Closed', 'Expired') is independent of application status.
 */
export const APPLICATION_LIFECYCLE_STAGES = [
  { id: 1, label: 'Profile' },
  { id: 2, label: 'Resume' },
  { id: 3, label: 'Application submitted' },
  { id: 4, label: 'Under review' },
  { id: 5, label: 'Decision' }
];

/**
 * Maps backend application status to a UI lifecycle stage.
 * Supports statuses: 'Submitted', 'Under Review', 'Shortlisted', 'Interview',
 * 'Offered', 'Accepted', 'Rejected', 'Withdrawn'.
 *
 * Opportunity status ('Closed', 'Expired') must NOT be passed as application status.
 *
 * @param {string} status
 * @returns {object} Lifecycle details
 */
export function getApplicationLifecycle(status) {
  const norm = (status || '').toLowerCase().trim();

  if (norm === 'accepted' || norm === 'offered') {
    return {
      status: norm === 'accepted' ? 'Accepted' : 'Offered',
      stage: 5,
      totalStages: 5,
      stageLabel: norm === 'accepted' ? 'Decision: Accepted' : 'Decision: Offered',
      progressText: norm === 'accepted' ? 'Completed · Accepted' : 'Completed · Offered',
      isCompleted: true,
      isInProgress: false,
      badgeText: norm === 'accepted' ? 'Accepted' : 'Offered'
    };
  }

  if (norm === 'rejected') {
    return {
      status: 'Rejected',
      stage: 5,
      totalStages: 5,
      stageLabel: 'Decision: Rejected',
      progressText: 'Completed · Rejected',
      isCompleted: true,
      isInProgress: false,
      badgeText: 'Rejected'
    };
  }

  if (norm === 'withdrawn') {
    return {
      status: 'Withdrawn',
      stage: 5,
      totalStages: 5,
      stageLabel: 'Withdrawn',
      progressText: 'Withdrawn by applicant',
      isCompleted: true,
      isInProgress: false,
      badgeText: 'Withdrawn'
    };
  }

  if (norm === 'interview' || norm === 'assessment') {
    return {
      status: 'Interview',
      stage: 4,
      totalStages: 5,
      stageLabel: 'Interview / Assessment',
      progressText: 'Stage 4 of 5 · Interview / Assessment stage',
      isCompleted: false,
      isInProgress: true,
      badgeText: 'Interview'
    };
  }

  if (norm === 'shortlisted') {
    return {
      status: 'Shortlisted',
      stage: 4,
      totalStages: 5,
      stageLabel: 'Shortlisted',
      progressText: 'Stage 4 of 5 · Shortlisted for further evaluation',
      isCompleted: false,
      isInProgress: true,
      badgeText: 'Shortlisted'
    };
  }

  if (norm === 'under review') {
    return {
      status: 'Under Review',
      stage: 4,
      totalStages: 5,
      stageLabel: 'Under review',
      progressText: 'Stage 4 of 5 · Under review',
      isCompleted: false,
      isInProgress: true,
      badgeText: 'Under Review'
    };
  }

  // Default: 'Submitted' or unknown
  return {
    status: 'Submitted',
    stage: 3,
    totalStages: 5,
    stageLabel: 'Application submitted',
    progressText: 'Stage 3 of 5 · Application submitted — awaiting update',
    isCompleted: false,
    isInProgress: true,
    badgeText: 'Submitted'
  };
}

/**
 * Calculates application counts: total, in-progress, completed.
 *
 * In Progress: Submitted, Under Review
 * Completed: Accepted, Rejected
 *
 * @param {Array} applications
 * @returns {{ total: number, inProgress: number, completed: number }}
 */
export function getApplicationCounts(applications = []) {
  if (!Array.isArray(applications)) {
    return { total: 0, inProgress: 0, completed: 0 };
  }

  let inProgress = 0;
  let completed = 0;

  for (const app of applications) {
    const lifecycle = getApplicationLifecycle(app?.status);
    if (lifecycle.isCompleted) {
      completed++;
    } else {
      inProgress++;
    }
  }

  return {
    total: applications.length,
    inProgress,
    completed
  };
}

/**
 * Filters opportunities closing within the defined 7-day window from the reference date.
 * Excludes expired opportunities.
 * Sorts by nearest deadline first.
 *
 * Window rule:
 * - Uses UTC calendar day boundaries for consistent handling of ISO dates across timezones.
 * - Start: Start of current day (00:00:00 UTC). Expired before today = excluded.
 * - End: End of 7th day (day + 7).
 * - Today's deadlines through the next 7 days are included.
 *
 * @param {Array} catalog - List of opportunities
 * @param {Date|string} [referenceDate=new Date()]
 * @returns {Array} Sorted list of closing soon opportunities
 */
export function getClosingSoonOpportunities(catalog = [], referenceDate = new Date()) {
  if (!Array.isArray(catalog)) return [];

  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refUTC = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const maxUTC = refUTC + 7 * 24 * 60 * 60 * 1000;

  return catalog
    .filter(opp => {
      if (!opp || !opp.deadline) return false;
      const d = new Date(opp.deadline);
      if (isNaN(d.getTime())) return false;
      
      const oppUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      return oppUTC >= refUTC && oppUTC <= maxUTC;
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

/**
 * Formats remaining days until deadline with human-readable text.
 * Uses UTC calendar date comparison for consistent date representation.
 *
 * @param {Date|string} deadline
 * @param {Date} [referenceDate=new Date()]
 * @returns {string}
 */
export function formatDaysRemaining(deadline, referenceDate = new Date()) {
  if (!deadline) return 'Rolling deadline';
  const target = new Date(deadline);
  if (isNaN(target.getTime())) return 'Rolling deadline';

  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refUTC = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const targetUTC = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());

  const diffDays = Math.round((targetUTC - refUTC) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Closed';
  if (diffDays === 0) return 'Closes today';
  if (diffDays === 1) return 'Closes tomorrow';
  return `Closes in ${diffDays} days`;
}
