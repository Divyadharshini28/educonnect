import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import ApplyModal from '../components/ApplyModal';
import { trackView, trackClick, trackBookmark, trackUnbookmark } from '../services/interactionTracker';
import { evaluateEligibility } from '../utils/eligibilityUtils';

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, studentProfile } = useAuth();

  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isApplied, setIsApplied] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);

  useEffect(() => {
    loadOpportunity();
  }, [id]);

  const loadOpportunity = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/opportunities/${id}`);
      setOpportunity(res.data);
      trackView(id, { source: 'opportunity-detail-article' });

      // Check application and bookmark status if logged in
      if (currentUser) {
        try {
          const [appsRes, bookRes] = await Promise.allSettled([
            api.get('/student/applications'),
            api.get('/student/bookmarks')
          ]);

          if (appsRes.status === 'fulfilled') {
            const applied = (appsRes.value.data || []).some(
              a => (a.opportunityId?._id || a.opportunityId) === id
            );
            setIsApplied(applied);
          }

          if (bookRes.status === 'fulfilled') {
            const bookmarked = (bookRes.value.data || []).some(
              b => (b._id || b) === id
            );
            setIsBookmarked(bookmarked);
          }
        } catch (e) {
          // Non-blocking
        }
      }
    } catch (err) {
      setError("We couldn't load opportunity details. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const nextState = !isBookmarked;
    setIsBookmarked(nextState);

    if (nextState) {
      trackBookmark(id);
    } else {
      trackUnbookmark(id);
    }

    try {
      await api.post(`/student/bookmarks/${id}`);
    } catch (err) {
      setIsBookmarked(!nextState);
    }
  };

  const handleApplyClick = () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setShowApplyModal(true);
  };

  const handleApplySuccess = () => {
    setIsApplied(true);
  };

  if (loading) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-16 text-center text-xs text-muted">
        Loading opportunity details...
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-16 text-xs text-bad">
        <p>{error || "Opportunity not found."}</p>
        <Link
          to="/browse"
          className="mt-3 inline-block text-ink hover:text-accent underline decoration-line"
        >
          Return to browse
        </Link>
      </div>
    );
  }

  const deadlineDate = opportunity.deadline ? new Date(opportunity.deadline) : null;
  const isExpired = deadlineDate ? deadlineDate < new Date() : false;
  const formattedDeadline = deadlineDate
    ? deadlineDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Rolling admissions';

  const eligibility = opportunity.eligibility || {};
  const departments = (eligibility.department || []).join(', ') || 'Open to all academic disciplines';
  const minYear = eligibility.minYear ? `Year ${eligibility.minYear}+` : 'All academic years';
  const minCGPA = eligibility.minCGPA ? `${eligibility.minCGPA.toFixed(1)} / 10` : 'No minimum requirement';
  const requiredSkills = eligibility.skills || [];
  const evaluation = (currentUser || studentProfile) ? evaluateEligibility(studentProfile, opportunity) : null;

  return (
    <article className="max-w-[768px] mx-auto px-4 py-10 text-ink">
      {/* Editorial navigation link */}
      <div className="mb-8">
        <Link
          to="/recommended"
          className="text-sm text-muted hover:text-ink underline decoration-line underline-offset-2 transition-colors font-medium"
        >
          ← Return to recommendations
        </Link>
      </div>

      {/* Type badge */}
      <div className="inline-block text-xs font-semibold px-2 py-0.5 rounded bg-canvas border border-line text-accent uppercase tracking-wider mb-2">
        {opportunity.type}
      </div>

      {/* Opportunity title: strongest visual element */}
      <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-ink leading-tight">
        {opportunity.title}
      </h1>

      {/* Organization */}
      {opportunity.organization && (
        <p className="text-base text-muted mt-2 font-medium">
          {opportunity.organization}
        </p>
      )}

      {/* Metadata line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted mt-4">
        <span>{opportunity.location || 'Remote'}</span>
        <span aria-hidden="true">·</span>
        <span>{opportunity.stipendOrReward || 'Educational grant'}</span>
        <span aria-hidden="true">·</span>
        <span className={isExpired ? 'text-bad' : ''}>
          Closes {formattedDeadline} {isExpired ? '(Closed)' : ''}
        </span>
        {opportunity.mode && (
          <>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{opportunity.mode}</span>
          </>
        )}
      </div>

      {/* Aggregate Applicant & Source Statistics (Phase 3 Distinction) */}
      <div className="mt-6 p-4 sm:p-5 rounded bg-canvas border border-line">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          <span>Applicant & Verification Statistics</span>
          {(opportunity.bookmarksCount || 0) > 0 && (
            <span className="text-sm text-ink font-medium normal-case">
              {opportunity.bookmarksCount} {opportunity.bookmarksCount === 1 ? 'student saved' : 'students saved'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {/* 1. External Applicant Count */}
          <div className="p-3 rounded bg-paper border border-line/60">
            <span className="text-xs text-muted block">External Provider Count</span>
            <div className="font-serif text-lg font-semibold text-ink mt-0.5">
              {opportunity.externalApplicantCount !== null && opportunity.externalApplicantCount !== undefined
                ? `${opportunity.externalApplicantCount.toLocaleString()} applicants`
                : (
                  <span className="text-xs font-normal text-muted italic">
                    Not available from source
                  </span>
                )}
            </div>
            <span className="text-xs text-muted block mt-1">
              {opportunity.externalStats?.source
                ? `Provider: ${opportunity.externalStats.source}${opportunity.externalStats.lastVerifiedAt ? ` · Verified ${new Date(opportunity.externalStats.lastVerifiedAt).toLocaleDateString()}` : ''}`
                : 'Direct opportunity provider'}
            </span>
          </div>

          {/* 2. EduConnect Applications Count */}
          <div className="p-3 rounded bg-paper border border-line/60">
            <span className="text-xs text-muted block">EduConnect Applications</span>
            <div className="font-serif text-lg font-semibold text-accent mt-0.5">
              {opportunity.applicationsCount || 0} {opportunity.applicationsCount === 1 ? 'application' : 'applications'}
            </div>
            <span className="text-xs text-muted block mt-1">
              Recorded on EduConnect
            </span>
          </div>

          {/* 3. EduConnect Unique Applicants Count */}
          <div className="p-3 rounded bg-paper border border-line/60">
            <span className="text-xs text-muted block">Unique EduConnect Applicants</span>
            <div className="font-serif text-lg font-semibold text-ink mt-0.5">
              {opportunity.uniqueApplicantsCount !== undefined ? opportunity.uniqueApplicantsCount : (opportunity.applicationsCount || 0)} {opportunity.uniqueApplicantsCount === 1 ? 'student' : 'students'}
            </div>
            <span className="text-xs text-muted block mt-1">
              Distinct individual students
            </span>
          </div>
        </div>

        <p className="text-xs text-muted mt-3 leading-relaxed">
          Note: EduConnect application counts record applications submitted directly on this platform. External counts reflect numbers reported by the provider.
        </p>
      </div>

      {/* Action CTA Bar */}
      <div className="my-8 py-4 border-y border-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isApplied ? (
            <span className="text-sm text-ok font-medium">
              Application submitted
            </span>
          ) : (
            <button
              type="button"
              disabled={isExpired}
              onClick={handleApplyClick}
              className={`px-5 py-2.5 text-sm rounded-[4px] font-medium transition-colors ${
                isExpired
                  ? 'border border-line text-muted cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {opportunity.source && opportunity.source !== 'internal' ? 'Apply (External)' : 'Apply'}
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`px-4 py-2.5 text-sm rounded-[4px] border transition-colors ${
              isBookmarked
                ? 'border-accent text-accent font-medium'
                : 'border-line text-ink hover:border-ink'
            }`}
          >
            {isBookmarked ? 'Saved' : 'Save'}
          </button>
        </div>

        {opportunity.officialUrl && (
          <a
            href={opportunity.officialUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              if (currentUser || studentProfile) {
                trackClick(id, {
                  source: 'opportunity-detail-official-link',
                  targetUrl: opportunity.officialUrl,
                  action: 'visit-official-portal'
                });
              }
            }}
            className="text-sm text-muted hover:text-ink underline decoration-line font-medium"
          >
            Visit official portal
          </a>
        )}
      </div>

      {/* Description article */}
      <section className="my-8">
        <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink mb-3">
          Overview
        </h2>
        <div className="text-base text-ink/90 leading-relaxed whitespace-pre-line space-y-4">
          <p>{opportunity.description}</p>
        </div>
      </section>

      {/* Eligibility & Requirements rule */}
      <section className="my-8 pt-6 border-t border-line">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Eligibility & Requirements
          </h2>
          {evaluation && (
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded ${
                evaluation.status === 'eligible'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : evaluation.status === 'incomplete_profile'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {evaluation.status === 'eligible'
                ? 'Eligible'
                : evaluation.status === 'incomplete_profile'
                ? 'Profile Incomplete'
                : 'Not Eligible'}
            </span>
          )}
        </div>

        {/* General Opportunity Parameters */}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
          <div className="p-3 rounded bg-canvas border border-line">
            <dt className="text-muted text-xs font-medium">Department</dt>
            <dd className="font-medium text-ink mt-0.5">{departments}</dd>
          </div>
          <div className="p-3 rounded bg-canvas border border-line">
            <dt className="text-muted text-xs font-medium">Academic year</dt>
            <dd className="font-medium text-ink mt-0.5">{minYear}</dd>
          </div>
          <div className="p-3 rounded bg-canvas border border-line">
            <dt className="text-muted text-xs font-medium">Minimum CGPA</dt>
            <dd className="font-medium text-ink mt-0.5">{minCGPA}</dd>
          </div>
        </dl>

        {/* Personalized Check Result */}
        {evaluation ? (
          <div className="mt-4 space-y-3">
            {/* Banner */}
            <div
              className={`p-4 rounded text-sm leading-relaxed border ${
                evaluation.status === 'eligible'
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : evaluation.status === 'incomplete_profile'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-base">
                    {evaluation.status === 'eligible'
                      ? 'You meet all eligibility criteria for this opportunity!'
                      : evaluation.status === 'incomplete_profile'
                      ? 'Profile verification required'
                      : 'You do not satisfy all criteria for this opportunity'}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {evaluation.summaryMessage}
                  </p>
                </div>
                {evaluation.status === 'incomplete_profile' && (
                  <Link
                    to="/profile"
                    className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded transition-colors"
                  >
                    Complete Profile
                  </Link>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div className="border border-line rounded divide-y divide-line/60 bg-paper">
              {evaluation.checks.map((chk, idx) => (
                <div key={idx} className="p-3.5 text-sm flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {chk.status === 'passed' ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        ✓
                      </span>
                    ) : chk.status === 'unknown' ? (
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                        ?
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">
                        ✕
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{chk.criterion}</span>
                      <span
                        className={`text-xs capitalize font-medium ${
                          chk.status === 'passed'
                            ? 'text-emerald-700'
                            : chk.status === 'unknown'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>
                    <p className="text-ink/80 text-xs sm:text-sm mt-0.5">{chk.message}</p>
                    {chk.details && (
                      <p className="text-muted text-xs mt-0.5">{chk.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3.5 rounded bg-canvas border border-line text-sm text-muted flex items-center justify-between">
            <span>Sign in to verify your personal eligibility against your academic profile.</span>
            <Link to="/login" className="text-accent font-medium hover:underline">
              Sign in →
            </Link>
          </div>
        )}
      </section>

      {/* Requirements / skills */}
      {requiredSkills.length > 0 && (
        <section className="my-8 pt-6 border-t border-line">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink mb-3">
            Requirements
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {requiredSkills.map((skill, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 border border-line rounded-[4px] text-ink bg-paper text-sm"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Benefits / stipend */}
      <section className="my-8 pt-6 border-t border-line">
        <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink mb-3">
          Benefits & Rewards
        </h2>
        <p className="text-sm sm:text-base text-ink/90 leading-relaxed">
          {opportunity.stipendOrReward || 'Academic credentials and certification from host organization.'}
        </p>
      </section>

      {/* Deadline and Application information */}
      <section className="my-8 pt-6 border-t border-line">
        <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink mb-3">
          Application Information
        </h2>
        <p className="text-sm sm:text-base text-ink/90 leading-relaxed">
          Applications close on {formattedDeadline}. Ensure all eligibility criteria are satisfied prior to submission.
        </p>
      </section>

      {/* Footer action bar */}
      <div className="mt-10 pt-6 border-t border-line flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          {!isApplied && (
            <button
              type="button"
              disabled={isExpired}
              onClick={handleApplyClick}
              className={`px-5 py-2.5 text-sm rounded-[4px] font-medium transition-colors ${
                isExpired
                  ? 'border border-line text-muted cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {opportunity.source && opportunity.source !== 'internal' ? 'Apply (External)' : 'Apply'}
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`px-4 py-2.5 text-sm rounded-[4px] border transition-colors ${
              isBookmarked
                ? 'border-accent text-accent font-medium'
                : 'border-line text-ink hover:border-ink'
            }`}
          >
            {isBookmarked ? 'Saved' : 'Save'}
          </button>
        </div>

        <Link
          to="/browse"
          className="text-muted hover:text-ink underline decoration-line font-medium text-sm"
        >
          Browse other opportunities
        </Link>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <ApplyModal
          opportunity={opportunity}
          onClose={() => setShowApplyModal(false)}
          onSuccess={handleApplySuccess}
        />
      )}
    </article>
  );
}
