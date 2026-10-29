import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function OpportunityRow({
  opportunity,
  recommendation,
  showMatch = true,
  isApplied = false,
  isBookmarked = false,
  onApply,
  onToggleBookmark
}) {
  const [showWhy, setShowWhy] = useState(false);
  const navigate = useNavigate();

  if (!opportunity) return null;

  const deadlineDate = opportunity.deadline ? new Date(opportunity.deadline) : null;
  const isExpired = deadlineDate ? deadlineDate < new Date() : false;
  const formattedDeadline = deadlineDate
    ? deadlineDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Rolling';

  const matchPercentage = recommendation ? Math.round(recommendation.score || 0) : null;

  // Generate plain, factual explanation for "Why recommended?"
  const getPlainRecommendationReason = () => {
    if (recommendation?.matchReasons && recommendation.matchReasons.length > 0) {
      // Filter out raw debugging tags and clean up into factual text
      const cleanReasons = recommendation.matchReasons
        .map(r => r.replace(/^(Department filter|Year filter|CGPA filter|Skills match|Interest match|ML semantic match):\s*/i, ''))
        .filter(r => !r.toLowerCase().includes('ineligible'));

      if (cleanReasons.length > 0) {
        return cleanReasons.join('. ') + '.';
      }
    }

    const dept = (opportunity.eligibility?.department || []).join(', ') || 'All departments';
    const skills = (opportunity.eligibility?.skills || []).slice(0, 3).join(', ');
    const parts = [];
    if (dept) parts.push(`Matches ${dept} curriculum criteria`);
    if (skills) parts.push(`relevant to ${skills}`);
    return parts.length > 0
      ? parts.join(' and ') + '.'
      : 'Matches your profile preferences and requirements.';
  };

  return (
    <article className="border-b border-line py-6 text-ink">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        {/* Left / Main content column */}
        <div className="flex-1 min-w-0 pr-0 md:pr-4">
          {/* TYPE & ELIGIBILITY BADGES */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              {opportunity.type}
            </span>
            {recommendation?.eligibilityStatus === 'Eligible' && (
              <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                Eligible
              </span>
            )}
            {isApplied && (
              <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Applied
              </span>
            )}
            {opportunity.applicationsCount !== undefined && opportunity.applicationsCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-canvas text-muted border border-line" title={`${opportunity.applicationsCount} recorded applications on EduConnect`}>
                <span className="font-semibold text-accent">{opportunity.applicationsCount}</span> applied
              </span>
            )}
            {opportunity.externalApplicantCount !== null && opportunity.externalApplicantCount !== undefined && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50/70 text-blue-800 border border-blue-200" title={`Reported by ${opportunity.externalStats?.source || 'provider'}`}>
                {opportunity.externalApplicantCount.toLocaleString()} on {opportunity.externalStats?.source || 'source'}
              </span>
            )}
          </div>

          {/* Opportunity Title */}
          <h2 className="font-serif text-xl sm:text-[22px] font-semibold text-ink mt-1.5 leading-snug">
            <Link
              to={`/opportunity/${opportunity._id}`}
              className="hover:text-accent transition-colors"
            >
              {opportunity.title}
            </Link>
          </h2>

          {/* Organization */}
          {opportunity.organization && (
            <p className="text-sm text-muted mt-0.5">
              {opportunity.organization}
            </p>
          )}

          {/* Short factual description */}
          {opportunity.description && (
            <p className="text-sm text-ink/85 mt-2.5 leading-relaxed line-clamp-2 max-w-xl">
              {opportunity.description}
            </p>
          )}

          {/* Metadata line: Location · Stipend · Closes DATE */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted mt-3">
            <span>{opportunity.location || 'Remote'}</span>
            <span aria-hidden="true">·</span>
            <span>{opportunity.stipendOrReward || 'Educational grant'}</span>
            <span aria-hidden="true">·</span>
            <span className={isExpired ? 'text-bad' : 'text-accent font-medium'}>
              Closes {formattedDeadline} {isExpired ? '(Closed)' : ''}
            </span>
          </div>

          {/* Optional expandable: Why recommended? */}
          {showMatch && recommendation && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowWhy(!showWhy)}
                className="text-xs sm:text-sm text-muted hover:text-ink transition-colors underline decoration-line underline-offset-2"
                aria-expanded={showWhy}
              >
                {showWhy ? 'Hide match details' : 'Why recommended?'}
              </button>

              {showWhy && (
                <div className="mt-2 pl-3 border-l border-line text-xs sm:text-sm text-muted leading-relaxed max-w-xl">
                  <p>{getPlainRecommendationReason()}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: Match % & Actions */}
        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-4 shrink-0 pt-2 md:pt-0">
          {/* Match percentage (only in recommended view) */}
          {showMatch && matchPercentage !== null && (
            <div className="text-left md:text-right">
              <div className="font-serif text-2xl sm:text-3xl font-semibold text-accent leading-none">
                {matchPercentage}%
              </div>
              <div className="text-xs text-muted mt-1">match</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center md:flex-col md:items-end gap-2.5">
            <Link
              to={`/opportunity/${opportunity._id}`}
              className="text-sm font-medium text-ink hover:text-accent underline decoration-line underline-offset-2 transition-colors"
            >
              View details
            </Link>

            <div className="flex items-center gap-2">
              {onToggleBookmark && (
                <button
                  type="button"
                  onClick={() => onToggleBookmark(opportunity)}
                  className="text-sm font-medium text-muted hover:text-ink transition-colors"
                >
                  {isBookmarked ? 'Saved' : 'Save'}
                </button>
              )}

              {isApplied ? (
                <span className="text-sm text-ok font-medium">Applied</span>
              ) : (
                <button
                  type="button"
                  disabled={isExpired}
                  onClick={() => onApply && onApply(opportunity)}
                  className={`px-3.5 py-1.5 text-sm rounded-[4px] font-medium transition-colors ${
                    isExpired
                      ? 'border border-line text-muted cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }`}
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
