import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { formatDaysRemaining } from '../utils/dashboardUtils';

export default function StudentAnalyticsPage() {
  const { currentUser, studentProfile } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'applications', 'market', 'personalized'

  useEffect(() => {
    loadAnalytics();
  }, [currentUser]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      // Authenticated student analytics endpoint
      const res = await api.get('/student/analytics');
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load student analytics:', err);
      setError('We could not load your student analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const personal = analytics?.personal || {
    totalApplications: 0,
    activePending: 0,
    accepted: 0,
    rejected: 0,
    statusBreakdown: { submitted: 0, underReview: 0, accepted: 0, rejected: 0 },
    recentApplications: [],
    bookmarkedDeadlines: [],
    matchingInsights: { matchingCount: 0, skillMatchCount: 0, eligibleCount: 0, ineligibleCount: 0, incompleteProfileCount: 0, totalEvaluated: 0 },
    suggestedActions: []
  };

  const platform = analytics?.platform || {
    topAppliedOpportunities: [],
    popularOpportunities: [],
    categoryActivity: []
  };

  // Status badge styling
  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase().trim();
    if (s === 'accepted') {
      return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Accepted</span>;
    }
    if (s === 'under review' || s === 'under_review') {
      return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Under Review</span>;
    }
    if (s === 'rejected') {
      return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">Rejected</span>;
    }
    return <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-200">Submitted</span>;
  };

  // Calculate percentages for status distribution bar
  const statusPercentages = useMemo(() => {
    const total = personal.totalApplications || 0;
    if (total === 0) return { submitted: 0, underReview: 0, accepted: 0, rejected: 0 };
    const sb = personal.statusBreakdown || {};
    return {
      submitted: Math.round(((sb.submitted || 0) / total) * 100),
      underReview: Math.round(((sb.underReview || 0) / total) * 100),
      accepted: Math.round(((sb.accepted || 0) / total) * 100),
      rejected: Math.round(((sb.rejected || 0) / total) * 100)
    };
  }, [personal]);

  // Max catalog opportunities count across categories for proportional chart scaling
  const maxCategoryCatalogCount = useMemo(() => {
    if (!platform.categoryActivity || platform.categoryActivity.length === 0) return 1;
    return Math.max(...platform.categoryActivity.map(c => c.availableOpportunitiesCount || 1), 1);
  }, [platform.categoryActivity]);

  if (loading) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-16 text-center text-sm text-muted">
        <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin mx-auto mb-3" />
        Loading your opportunity insights and analytics...
      </div>
    );
  }

  return (
    <div className="max-w-[768px] mx-auto px-4 py-8 sm:py-12 text-ink">
      {/* Header */}
      <header className="pb-8 border-b border-line">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider text-muted font-medium block mb-1">
              Analytics & Intelligence
            </span>
            <h1 className="font-serif text-3xl sm:text-[38px] font-semibold text-ink leading-tight">
              Opportunity Insights
            </h1>
          </div>
          <button
            type="button"
            onClick={loadAnalytics}
            className="text-sm text-muted hover:text-ink underline decoration-line transition-colors shrink-0 font-medium"
          >
            Refresh data
          </button>
        </div>
        <p className="text-sm sm:text-base text-muted mt-2 max-w-2xl leading-relaxed">
          Personalized analytics tracking your application lifecycle, eligibility criteria, matching skills, and upcoming deadlines.
        </p>

        {/* View Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-2">
          {[
            { id: 'all', label: 'Overview' },
            { id: 'applications', label: 'My Applications' },
            { id: 'market', label: 'Explore & Trending' },
            { id: 'personalized', label: 'Eligibility & Actions' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 text-sm rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent text-white font-medium'
                  : 'bg-canvas text-muted hover:text-ink border border-line'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="my-6 p-4 rounded bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadAnalytics}
            className="font-medium underline hover:text-rose-950"
          >
            Try again
          </button>
        </div>
      )}

      {/* ========================================================
          SECTION A: PERSONAL APPLICATION STATISTICS
         ======================================================== */}
      {(activeTab === 'all' || activeTab === 'applications') && (
        <section className="mt-10 sm:mt-12">
          <div className="flex items-baseline justify-between border-b border-line pb-2 mb-6">
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
              Your Application Statistics
            </h2>
            <Link
              to="/applications"
              className="text-xs sm:text-sm text-accent hover:text-accent-hover underline decoration-line font-medium"
            >
              View application tracker →
            </Link>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            <div className="p-4 rounded bg-canvas border border-line">
              <span className="text-xs text-muted block font-medium">Total Applications</span>
              <span className="font-serif text-3xl font-semibold text-ink mt-1 block">
                {personal.totalApplications}
              </span>
              <span className="text-xs text-muted mt-1 block">Lifetime submissions</span>
            </div>

            <div className="p-4 rounded bg-canvas border border-line">
              <span className="text-xs text-muted block font-medium">Active & Pending</span>
              <span className="font-serif text-3xl font-semibold text-accent mt-1 block">
                {personal.activePending}
              </span>
              <span className="text-xs text-muted mt-1 block">
                {personal.statusBreakdown?.submitted || 0} submitted · {personal.statusBreakdown?.underReview || 0} under review
              </span>
            </div>

            <div className="p-4 rounded bg-canvas border border-line">
              <span className="text-xs text-muted block font-medium">Accepted</span>
              <span className="font-serif text-3xl font-semibold text-emerald-700 mt-1 block">
                {personal.accepted}
              </span>
              <span className="text-xs text-muted mt-1 block">Offers & qualifications</span>
            </div>

            <div className="p-4 rounded bg-canvas border border-line">
              <span className="text-xs text-muted block font-medium">Rejected</span>
              <span className="font-serif text-3xl font-semibold text-ink/70 mt-1 block">
                {personal.rejected}
              </span>
              <span className="text-xs text-muted mt-1 block">Completed reviews</span>
            </div>
          </div>

          {/* Status Breakdown Proportional Bar */}
          <div className="mt-6 p-4 rounded bg-paper border border-line">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-ink">Application Status Distribution</span>
              <span className="text-muted text-[11px]">
                {personal.totalApplications > 0
                  ? `${personal.totalApplications} total submissions`
                  : 'No applications submitted yet'}
              </span>
            </div>

            {personal.totalApplications === 0 ? (
              <div className="py-4 text-xs text-muted text-center bg-canvas rounded border border-dashed border-line">
                No applications submitted yet. Once you apply to opportunities, your status progression will appear here.
              </div>
            ) : (
              <div>
                {/* Multi-segment distribution bar */}
                <div className="w-full h-3.5 bg-canvas rounded-full overflow-hidden flex border border-line">
                  {statusPercentages.submitted > 0 && (
                    <div
                      style={{ width: `${statusPercentages.submitted}%` }}
                      className="bg-stone-400 transition-all duration-300"
                      title={`Submitted: ${personal.statusBreakdown.submitted} (${statusPercentages.submitted}%)`}
                    />
                  )}
                  {statusPercentages.underReview > 0 && (
                    <div
                      style={{ width: `${statusPercentages.underReview}%` }}
                      className="bg-amber-500 transition-all duration-300"
                      title={`Under Review: ${personal.statusBreakdown.underReview} (${statusPercentages.underReview}%)`}
                    />
                  )}
                  {statusPercentages.accepted > 0 && (
                    <div
                      style={{ width: `${statusPercentages.accepted}%` }}
                      className="bg-emerald-600 transition-all duration-300"
                      title={`Accepted: ${personal.accepted} (${statusPercentages.accepted}%)`}
                    />
                  )}
                  {statusPercentages.rejected > 0 && (
                    <div
                      style={{ width: `${statusPercentages.rejected}%` }}
                      className="bg-rose-500 transition-all duration-300"
                      title={`Rejected: ${personal.rejected} (${statusPercentages.rejected}%)`}
                    />
                  )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted mt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-stone-400" />
                    <span>Submitted: {personal.statusBreakdown?.submitted || 0} ({statusPercentages.submitted}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Under Review: {personal.statusBreakdown?.underReview || 0} ({statusPercentages.underReview}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span>Accepted: {personal.accepted} ({statusPercentages.accepted}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span>Rejected: {personal.rejected} ({statusPercentages.rejected}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recent Application History */}
          {personal.recentApplications.length > 0 && (
            <div className="mt-6 border border-line rounded bg-paper overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-canvas">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
                  Recent Application History
                </h3>
              </div>
              <div className="divide-y divide-line text-xs">
                {personal.recentApplications.map((app) => (
                  <div key={app._id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-canvas/50 transition-colors">
                    <div className="min-w-0 pr-2">
                      {app.opportunityId ? (
                        <Link
                          to={`/opportunity/${app.opportunityId}`}
                          className="font-medium text-ink hover:text-accent truncate block"
                        >
                          {app.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink/75 truncate block">
                          {app.title} <span className="text-[10px] text-muted font-normal uppercase tracking-wider">(archived)</span>
                        </span>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                        <span>{app.organization}</span>
                        <span>·</span>
                        <span className="uppercase text-[10px] text-accent font-medium">{app.type}</span>
                        <span>·</span>
                        <span>Applied {new Date(app.submissionDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {getStatusBadge(app.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ========================================================
          SECTION B: OPPORTUNITY DISCOVERY & TRENDING STREAMS
         ======================================================== */}
      {(activeTab === 'all' || activeTab === 'market') && (
        <section className="mt-12 sm:mt-16">
          <div className="border-b border-line pb-2 mb-6">
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
              Opportunity Discovery & Streams
            </h2>
          </div>

          {/* Catalog Streams Distribution for Student Discovery */}
          <div className="p-4 sm:p-5 rounded bg-paper border border-line">
            <h3 className="text-sm font-semibold text-ink mb-1">
              Active Catalog Inventory by Stream
            </h3>
            <p className="text-xs text-muted mb-4">
              Explore open opportunities across internships, hackathons, scholarships, and academic competitions.
            </p>

            {(!platform.categoryActivity || platform.categoryActivity.length === 0) ? (
              <div className="py-8 text-sm text-muted text-center bg-canvas rounded border border-dashed border-line">
                No catalog categories available yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {platform.categoryActivity.map((cat) => {
                  const percent = Math.min(100, Math.round(((cat.availableOpportunitiesCount || 0) / maxCategoryCatalogCount) * 100));
                  return (
                    <div key={cat.category} className="p-3 rounded bg-canvas border border-line/70 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium capitalize text-ink text-sm">
                            {cat.category}
                          </span>
                          <span className="text-xs font-semibold text-accent">
                            {cat.availableOpportunitiesCount || 0} active
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-paper rounded-full overflow-hidden border border-line/60">
                          <div
                            style={{ width: `${percent}%` }}
                            className="h-full bg-accent rounded-full transition-all duration-300"
                          />
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-line/40 flex justify-end">
                        <Link
                          to={`/browse?type=${cat.category}`}
                          className="text-xs text-accent hover:text-accent-hover font-medium underline decoration-line"
                        >
                          Browse {cat.category} →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Trending & Popular Opportunities (Discovery-Focused) */}
          <div className="mt-8 p-4 sm:p-5 rounded bg-paper border border-line">
            <h3 className="text-sm font-semibold text-ink mb-1">
              Trending Opportunities
            </h3>
            <p className="text-xs text-muted mb-4">
              High-interest opportunities ranked by student interest and verified provider community size.
            </p>

            {(!platform.topAppliedOpportunities || platform.topAppliedOpportunities.length === 0) ? (
              <p className="text-sm text-muted py-6 text-center">No trending opportunities to display yet.</p>
            ) : (
              <div className="divide-y divide-line/60">
                {platform.topAppliedOpportunities.map((opp, idx) => {
                  const hasExternalCount = opp.externalApplicantCount !== null && opp.externalApplicantCount !== undefined;
                  return (
                    <div key={opp._id || idx} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted font-medium">#{idx + 1}</span>
                          <Link
                            to={`/opportunity/${opp._id}`}
                            className="font-medium text-ink hover:text-accent truncate block"
                          >
                            {opp.title}
                          </Link>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1 ml-5">
                          <span>{opp.organization}</span>
                          <span>·</span>
                          <span className="uppercase text-xs text-accent font-medium">{opp.type}</span>
                          {opp.deadline && (
                            <>
                              <span>·</span>
                              <span>Closes {new Date(opp.deadline).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Provider Community & Trending Badges */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-canvas border border-line text-accent">
                          Trending
                        </span>

                        {hasExternalCount && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs bg-blue-50/60 border-blue-200 text-blue-800"
                            title={`Reported by external provider ${opp.externalStats?.source || ''}`}
                          >
                            <span className="text-muted">Source size:</span>
                            <span className="font-semibold">{opp.externalApplicantCount.toLocaleString()}</span>
                            <span>({opp.externalStats?.source || 'external'})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION C: PERSONALIZED INSIGHTS, ELIGIBILITY & NEXT ACTIONS
         ======================================================== */}
      {(activeTab === 'all' || activeTab === 'personalized') && (
        <section className="mt-12 sm:mt-16 pb-8">
          <div className="border-b border-line pb-2 mb-6">
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
              Personalized Insights & Next Actions
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Eligibility Evaluation Breakdown */}
            <div className="p-4 sm:p-5 rounded bg-paper border border-line">
              <h3 className="text-sm font-semibold text-ink mb-1">
                Profile Eligibility Breakdown
              </h3>
              <p className="text-xs text-muted mb-4">
                Structured criteria evaluation matching your academic department, CGPA, and technical skills.
              </p>

              <div className="grid grid-cols-3 gap-2 py-3 border-y border-line/60 text-center">
                <div>
                  <span className="font-serif text-2xl font-semibold text-emerald-700 block">
                    {personal.matchingInsights?.eligibleCount || 0}
                  </span>
                  <span className="text-xs uppercase font-medium tracking-wide text-emerald-800 block mt-0.5">
                    Eligible
                  </span>
                </div>
                <div>
                  <span className="font-serif text-2xl font-semibold text-rose-700 block">
                    {personal.matchingInsights?.ineligibleCount || 0}
                  </span>
                  <span className="text-xs uppercase font-medium tracking-wide text-rose-800 block mt-0.5">
                    Ineligible
                  </span>
                </div>
                <div>
                  <span className="font-serif text-2xl font-semibold text-accent block">
                    {personal.matchingInsights?.skillMatchCount ?? personal.matchingInsights?.matchingCount ?? 0}
                  </span>
                  <span className="text-xs uppercase font-medium tracking-wide text-muted block mt-0.5">
                    Skill Match
                  </span>
                </div>
              </div>

              <div className="mt-4 text-xs sm:text-sm text-muted space-y-1.5">
                <p>
                  Evaluated across <span className="font-medium text-ink">{personal.matchingInsights?.totalEvaluated || 0}</span> active upcoming catalog opportunities.
                </p>
                {studentProfile?.department ? (
                  <p className="text-xs">
                    Department: <span className="text-ink font-medium">{studentProfile.department}</span> · CGPA: <span className="text-ink font-medium">{studentProfile.cgpa ? studentProfile.cgpa.toFixed(1) : 'Not specified'}</span>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 font-medium">
                    Profile incomplete. Update your department and skills to ensure accurate eligibility evaluations.
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-line/60">
                <Link
                  to="/profile"
                  className="text-xs sm:text-sm text-accent hover:text-accent-hover underline decoration-line font-medium"
                >
                  Edit academic profile →
                </Link>
              </div>
            </div>

            {/* Suggested Next Actions Card */}
            <div className="p-4 sm:p-5 rounded bg-paper border border-line flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink mb-1">
                  Suggested Next Actions
                </h3>
                <p className="text-xs text-muted mb-4">
                  Actionable recommendations based on your deadlines, application statuses, and profile.
                </p>

                {(!personal.suggestedActions || personal.suggestedActions.length === 0) ? (
                  <div className="py-6 text-sm text-muted text-center bg-canvas rounded border border-dashed border-line">
                    You're all caught up! No urgent actions required right now.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {personal.suggestedActions.map((action) => (
                      <div key={action.id} className="p-3.5 rounded bg-canvas border border-line text-xs sm:text-sm">
                        <div className="font-semibold text-ink flex items-center justify-between">
                          <span>{action.action}</span>
                          <span className="text-accent font-mono text-xs">→</span>
                        </div>
                        <p className="text-xs text-muted mt-1 leading-relaxed">
                          {action.description}
                        </p>
                        {action.link && (
                          <Link
                            to={action.link}
                            className="inline-block mt-2 text-xs text-accent hover:text-accent-hover font-medium underline decoration-line"
                          >
                            Take action →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-muted mt-4 pt-3 border-t border-line/60">
                Updated in real-time as you interact with opportunities and meet deadlines.
              </div>
            </div>
          </div>

          {/* Bookmarked Deadlines Alert */}
          {personal.bookmarkedDeadlines && personal.bookmarkedDeadlines.length > 0 && (
            <div className="mt-6 p-4 sm:p-5 rounded bg-paper border border-line">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-line/60">
                <h3 className="text-sm font-semibold text-ink">
                  Upcoming Deadlines for Saved Opportunities ({personal.bookmarkedDeadlines.length})
                </h3>
                <Link
                  to="/browse?saved=true"
                  className="text-xs sm:text-sm text-accent hover:text-accent-hover underline decoration-line font-medium"
                >
                  View all saved →
                </Link>
              </div>

              <div className="divide-y divide-line/60 text-xs sm:text-sm">
                {personal.bookmarkedDeadlines.map((opp) => (
                  <div key={opp._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 pr-3">
                      <Link
                        to={`/opportunity/${opp._id}`}
                        className="font-medium text-ink hover:text-accent truncate block"
                      >
                        {opp.title}
                      </Link>
                      <span className="text-xs text-muted">{opp.organization} · <span className="uppercase text-xs text-accent font-medium">{opp.type}</span></span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`font-medium ${opp.daysRemaining <= 7 ? 'text-accent' : 'text-ink'}`}>
                        {formatDaysRemaining(opp.deadline)}
                      </span>
                      <span className="block text-xs text-muted">
                        Due {new Date(opp.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
