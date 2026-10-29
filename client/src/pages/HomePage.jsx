import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import OpportunityRow from '../components/OpportunityRow';
import ApplyModal from '../components/ApplyModal';
import { trackBookmark, trackUnbookmark } from '../services/interactionTracker';
import {
  getClosingSoonOpportunities,
  getApplicationLifecycle,
  getApplicationCounts,
  formatDaysRemaining
} from '../utils/dashboardUtils';

const CATEGORIES = [
  { id: 'internship', label: 'Internships' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'certification', label: 'Certifications' },
  { id: 'workshop', label: 'Workshops' },
  { id: 'competition', label: 'Competitions' },
  { id: 'placement', label: 'Placements' }
];

export default function HomePage() {
  const { studentProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [applications, setApplications] = useState([]);
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyModalOpp, setApplyModalOpp] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    loadHomeData();
  }, [currentUser, studentProfile]);

  const loadHomeData = async () => {
    setLoading(true);
    setError('');

    try {
      const [catRes, recRes, appRes, bookRes, analyticsRes] = await Promise.allSettled([
        api.get('/opportunities'),
        currentUser ? api.get('/opportunities/recommended?mode=hybrid') : Promise.resolve({ data: { recommendations: [] } }),
        currentUser ? api.get('/student/applications') : Promise.resolve({ data: [] }),
        currentUser ? api.get('/student/bookmarks') : Promise.resolve({ data: [] }),
        currentUser ? api.get('/student/analytics') : Promise.resolve({ data: null })
      ]);

      const allCatalog = catRes.status === 'fulfilled' ? catRes.value.data || [] : [];
      setCatalog(allCatalog);

      if (recRes.status === 'fulfilled' && recRes.value.data?.recommendations?.length > 0) {
        setRecommendations(recRes.value.data.recommendations);
      } else {
        // Honest empty recommendations if unauthenticated or profile pending
        setRecommendations([]);
      }

      if (appRes.status === 'fulfilled') {
        const apps = appRes.value.data || [];
        setApplications(apps);
        const ids = new Set(apps.map(a => a.opportunityId?._id || a.opportunityId));
        setAppliedIds(ids);
      }

      if (bookRes.status === 'fulfilled') {
        const bookmarks = bookRes.value.data || [];
        const ids = new Set(bookmarks.map(b => b._id || b));
        setBookmarkedIds(ids);
      }

      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value.data);
      }
    } catch (err) {
      setError("We couldn't load your opportunity briefing. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBookmark = async (opp) => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const oppId = opp._id;
    const isBookmarked = bookmarkedIds.has(oppId);
    const updated = new Set(bookmarkedIds);

    if (isBookmarked) {
      updated.delete(oppId);
      trackUnbookmark(oppId);
    } else {
      updated.add(oppId);
      trackBookmark(oppId);
    }
    setBookmarkedIds(updated);

    try {
      await api.post(`/student/bookmarks/${oppId}`);
    } catch (err) {
      setBookmarkedIds(bookmarkedIds);
    }
  };

  const handleApplyClick = (opp) => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setApplyModalOpp(opp);
  };

  const handleApplySuccess = (application) => {
    const oppId = application.opportunityId?._id || application.opportunityId;
    setAppliedIds(new Set([...appliedIds, oppId]));
    setApplications(prev => [application, ...prev]);
  };

  // Determine time-appropriate greeting
  const greetingPrefix = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const studentName = studentProfile?.name
    ? studentProfile.name.trim().split(' ')[0]
    : currentUser?.email
    ? currentUser.email.split('@')[0]
    : null;

  // Calculate profile completion factually
  const profileStatus = useMemo(() => {
    if (!studentProfile) {
      return {
        percent: 40,
        isComplete: false,
        missing: ['Complete student profile', 'Add technical skills', 'Add academic branch']
      };
    }

    const items = [];
    let completed = 0;
    const total = 5;

    if (studentProfile.department) completed++; else items.push('Add your academic department');
    if (studentProfile.year) completed++; else items.push('Add your year of study');
    if (studentProfile.cgpa !== undefined && studentProfile.cgpa > 0) completed++; else items.push('Add your current CGPA');
    if (studentProfile.skills && studentProfile.skills.length > 0) completed++; else items.push('Add your technical skills');
    if (studentProfile.interests && studentProfile.interests.length > 0) completed++; else items.push('Add your opportunity interests');

    const percent = Math.round((completed / total) * 100);
    return {
      percent,
      isComplete: percent === 100,
      missing: items
    };
  }, [studentProfile]);

  // Application counts breakdown (strictly separates in-progress from completed)
  const { total: totalApplicationsCount, inProgress: inProgressCount, completed: completedCount } = useMemo(() => {
    return getApplicationCounts(applications);
  }, [applications]);

  // Urgent opportunities closing in the next 7 days (strictly factual window, sorted nearest deadline first)
  const closingSoonList = useMemo(() => {
    return getClosingSoonOpportunities(catalog);
  }, [catalog]);

  // Saved opportunities list
  const savedOpportunities = useMemo(() => {
    const saved = catalog.filter(opp => bookmarkedIds.has(opp._id));
    return saved.sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  }, [catalog, bookmarkedIds]);

  // Preview top 3 recommended opportunities
  const topRecommendations = useMemo(() => {
    return recommendations.slice(0, 3);
  }, [recommendations]);

  // Snapshot counts
  const recommendedCount = recommendations.length;
  const savedCount = bookmarkedIds.size;
  const closingSoonCount = closingSoonList.length;

  const formatDeadlineDays = (deadline) => {
    return formatDaysRemaining(deadline);
  };

  const getStatusColorClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'text-ok font-medium';
      case 'under review':
        return 'text-warn font-medium';
      case 'rejected':
        return 'text-bad font-medium';
      case 'submitted':
      default:
        return 'text-muted font-medium';
    }
  };

  return (
    <div className="max-w-[768px] mx-auto px-4 py-8 sm:py-12">
      {/* ========================================================
          PAGE HEADER
          Page context label + Fraunces ~40px heading + factual lines
         ======================================================== */}
      <header className="pb-8">
        <span className="text-xs uppercase tracking-wider text-muted font-medium block mb-2">
          Home
        </span>
        <h1 className="font-serif text-3xl sm:text-[40px] font-semibold text-ink leading-tight mb-3">
          {studentName ? `${greetingPrefix}, ${studentName}.` : `${greetingPrefix}.`}
        </h1>
        <div className="text-sm sm:text-base text-muted leading-relaxed space-y-0.5">
          {currentUser ? (
            recommendedCount > 0 ? (
              <p>{recommendedCount} {recommendedCount === 1 ? 'opportunity recommended' : 'opportunities recommended'} for your profile.</p>
            ) : (
              <p>No recommendations available yet. Complete your profile to improve matches.</p>
            )
          ) : (
            <p>{catalog.length} opportunities currently available.</p>
          )}
          <p>
            {closingSoonCount > 0
              ? `${closingSoonCount} ${closingSoonCount === 1 ? 'opportunity closes' : 'opportunities close'} this week.`
              : 'No opportunities are closing this week.'}
          </p>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="py-4 text-xs text-bad">
          <p>{error}</p>
          <button
            onClick={loadHomeData}
            className="mt-1 text-ink underline decoration-line hover:text-accent"
          >
            Try again
          </button>
        </div>
      )}

      {/* ========================================================
          PROFILE COMPLETION (Conditional: New or Incomplete Users)
          Generous vertical spacing (Level 1) + Section Heading (Level 2) + Hairline Divider (Level 3)
         ======================================================== */}
      {currentUser && !profileStatus.isComplete && (
        <section className="mt-12 sm:mt-16">
          <div className="border-b border-line pb-2 mb-4">
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
              Profile completion
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 py-2">
            <div className="sm:w-36 shrink-0">
              <div className="font-serif text-3xl font-semibold text-accent leading-none">
                {profileStatus.percent}%
              </div>
            </div>

            <div className="flex-1 text-sm text-muted space-y-1">
              <p className="font-medium text-ink">
                Complete your profile to refine personalized match rankings:
              </p>
              {profileStatus.missing.map((item, idx) => (
                <p key={idx} className="leading-snug">· {item}</p>
              ))}
            </div>

            <div className="shrink-0 pt-2 sm:pt-0">
              <Link
                to="/profile"
                className="text-xs sm:text-sm font-medium text-accent hover:text-accent-hover underline decoration-line underline-offset-2"
              >
                Complete profile →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION 1: YOUR SNAPSHOT
          Level 1 spacing (48–64px) + Level 2 heading + Level 3 divider
         ======================================================== */}
      <section className="mt-12 sm:mt-16">
        <div className="border-b border-line pb-2 mb-6">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Your snapshot
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-semibold text-ink leading-tight">
              {currentUser ? recommendedCount : catalog.length}
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-snug">
              {currentUser ? (
                <>Recommended<br />opportunities</>
              ) : (
                <>Available<br />opportunities</>
              )}
            </p>
          </div>

          <div>
            <div className="font-serif text-2xl sm:text-3xl font-semibold text-ink leading-tight">
              {savedCount}
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-snug">
              Saved<br />opportunities
            </p>
          </div>

          <div>
            <div className="font-serif text-2xl sm:text-3xl font-semibold text-ink leading-tight">
              {inProgressCount}
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-snug">
              Applications<br />in progress
            </p>
            {completedCount > 0 && (
              <p className="text-xs text-muted mt-0.5">
                {completedCount} completed
              </p>
            )}
          </div>

          <div>
            <div className="font-serif text-2xl sm:text-3xl font-semibold text-accent leading-tight">
              {closingSoonCount}
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1 leading-snug">
              Closing<br />this week
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================
          OPPORTUNITY INSIGHTS (Batch 4 Student Analytics)
          Generous vertical spacing + Level 2 heading + Hairline divider
         ======================================================== */}
      <section className="mt-12 sm:mt-16">
        <div className="flex items-baseline justify-between border-b border-line pb-2 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Opportunity Insights
          </h2>
          <Link
            to="/analytics"
            className="text-xs sm:text-sm text-accent hover:text-accent-hover underline decoration-line font-medium"
          >
            Full analytics dashboard →
          </Link>
        </div>

        <p className="text-sm text-muted mb-6">
          Real-time metrics on your applications, eligibility matching, and popular opportunities across EduConnect.
        </p>

        {/* 4 Analytics Highlight Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="p-3.5 rounded bg-canvas border border-line">
            <span className="text-xs text-muted block">Applications</span>
            <span className="font-serif text-2xl font-semibold text-ink mt-0.5 block">
              {analytics?.personal?.totalApplications ?? totalApplicationsCount}
            </span>
            <span className="text-xs text-muted mt-0.5 block">
              {analytics?.personal?.activePending ?? inProgressCount} active · {analytics?.personal?.accepted ?? 0} accepted
            </span>
          </div>

          <div className="p-3.5 rounded bg-canvas border border-line">
            <span className="text-xs text-muted block">Eligible Matches</span>
            <span className="font-serif text-2xl font-semibold text-emerald-700 mt-0.5 block">
              {analytics?.personal?.matchingInsights?.eligibleCount ?? recommendations.length}
            </span>
            <span className="text-xs text-muted mt-0.5 block">
              Verified criteria met
            </span>
          </div>

          <div className="p-3.5 rounded bg-canvas border border-line">
            <span className="text-xs text-muted block">EduConnect Activity</span>
            <span className="font-serif text-2xl font-semibold text-accent mt-0.5 block">
              {analytics?.platform?.totalApplications ?? 0}
            </span>
            <span className="text-xs text-muted mt-0.5 block">
              Submissions recorded
            </span>
          </div>

          <div className="p-3.5 rounded bg-canvas border border-line">
            <span className="text-xs text-muted block">Active Scholars</span>
            <span className="font-serif text-2xl font-semibold text-ink mt-0.5 block">
              {analytics?.platform?.uniqueStudentsCount ?? 0}
            </span>
            <span className="text-xs text-muted mt-0.5 block">
              Applying students
            </span>
          </div>
        </div>

        {/* Most Applied Opportunities Preview */}
        {analytics?.platform?.topAppliedOpportunities && analytics.platform.topAppliedOpportunities.length > 0 && (
          <div className="p-4 rounded bg-paper border border-line mb-6">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-line/60">
              <h3 className="text-sm font-semibold text-ink">
                Most-Applied Opportunities in EduConnect
              </h3>
              <Link to="/analytics" className="text-xs text-muted hover:text-ink underline decoration-line">
                View all rankings →
              </Link>
            </div>
            <div className="divide-y divide-line/60 text-xs sm:text-sm">
              {analytics.platform.topAppliedOpportunities.slice(0, 3).map((opp, idx) => (
                <div key={opp._id || idx} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <Link to={`/opportunity/${opp._id}`} className="font-medium text-ink hover:text-accent truncate block">
                      {opp.title}
                    </Link>
                    <span className="text-xs text-muted">{opp.organization} · <span className="uppercase text-xs text-accent font-medium">{opp.type}</span></span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded bg-canvas border border-line text-accent font-medium text-xs">
                      {opp.applicationsCount} applied
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Next Action */}
        {analytics?.personal?.suggestedActions && analytics.personal.suggestedActions.length > 0 && (
          <div className="p-4 rounded bg-accent-soft/50 border border-line text-xs sm:text-sm">
            <span className="text-xs uppercase tracking-wider text-accent font-semibold block mb-1">
              Suggested Next Action
            </span>
            <div className="font-medium text-ink text-sm">
              {analytics.personal.suggestedActions[0].action}
            </div>
            <p className="text-muted text-xs sm:text-sm mt-0.5 leading-relaxed">
              {analytics.personal.suggestedActions[0].description}
            </p>
            {analytics.personal.suggestedActions[0].link && (
              <Link
                to={analytics.personal.suggestedActions[0].link}
                className="inline-block mt-2.5 text-xs sm:text-sm font-medium text-accent hover:text-accent-hover underline decoration-line"
              >
                Continue →
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION 2: CLOSING SOON (Primary Actionable Section)
          Level 1 spacing + Level 2 heading + Level 3 divider + Accent-soft visual anchor
         ======================================================== */}
      <section className="mt-12 sm:mt-16">
        <div className="border-b border-line pb-2 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Closing soon
          </h2>
        </div>

        <p className="text-sm text-muted mb-4">
          {closingSoonCount > 0
            ? `${closingSoonCount} ${closingSoonCount === 1 ? 'opportunity closes' : 'opportunities close'} within the next 7 days.`
            : 'No opportunities are closing within the next 7 days.'}
        </p>

        {/* Accent-soft visual anchor (#F6E7DE) for most actionable urgency */}
        <div className="bg-accent-soft border border-line p-4 rounded-[4px] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <span className="text-ink font-medium">
            {closingSoonCount > 0
              ? `${closingSoonCount} ${closingSoonCount === 1 ? 'opportunity closes' : 'opportunities close'} this week`
              : 'No opportunities are closing this week'}
          </span>
          <Link
            to="/browse?deadline=week"
            className="text-accent hover:text-accent-hover font-medium underline decoration-line underline-offset-2 shrink-0 text-xs sm:text-sm"
          >
            View deadlines →
          </Link>
        </div>

        {closingSoonList.length === 0 ? (
          <p className="text-sm text-muted py-4">
            No opportunities are closing this week.
          </p>
        ) : (
          <div className="divide-y-0">
            {closingSoonList.map((opp) => (
              <OpportunityRow
                key={opp._id}
                opportunity={opp}
                showMatch={false}
                isApplied={appliedIds.has(opp._id)}
                isBookmarked={bookmarkedIds.has(opp._id)}
                onApply={handleApplyClick}
                onToggleBookmark={handleToggleBookmark}
              />
            ))}
          </div>
        )}

        <div className="pt-4">
          <Link
            to="/browse?deadline=week"
            className="text-xs sm:text-sm text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
          >
            View all deadlines →
          </Link>
        </div>
      </section>

      {/* ========================================================
          SECTION 3: RECOMMENDED FOR YOU (Secondary Priority)
          Level 1 spacing + Level 2 heading + Level 3 divider
         ======================================================== */}
      <section className="mt-12 sm:mt-16">
        <div className="border-b border-line pb-2 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Recommended for you
          </h2>
        </div>

        <p className="text-sm text-muted mb-4">
          Based on your profile.
        </p>

        {topRecommendations.length === 0 ? (
          <div className="py-6 text-sm text-muted space-y-2">
            <p>No recommendations available yet.</p>
            <p className="text-xs sm:text-sm">
              Complete your profile with your department, year of study, and skills to receive personalized opportunity matches.
            </p>
            <Link
              to="/profile"
              className="inline-block text-xs sm:text-sm font-medium text-accent hover:text-accent-hover underline decoration-line"
            >
              Configure profile →
            </Link>
          </div>
        ) : (
          <div>
            {topRecommendations.map((item) => (
              <OpportunityRow
                key={item.opportunityId || item.opportunity._id}
                opportunity={item.opportunity}
                recommendation={item}
                showMatch={true}
                isApplied={appliedIds.has(item.opportunity._id)}
                isBookmarked={bookmarkedIds.has(item.opportunity._id)}
                onApply={handleApplyClick}
                onToggleBookmark={handleToggleBookmark}
              />
            ))}
          </div>
        )}

        {topRecommendations.length > 0 && (
          <div className="pt-4">
            <Link
              to="/recommended"
              className="text-xs sm:text-sm text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
            >
              View all recommendations →
            </Link>
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION 4: YOUR APPLICATIONS (Secondary Priority)
          Level 1 spacing + Level 2 heading + Level 3 divider + Progress representation
         ======================================================== */}
      {applications.length > 0 && (
        <section className="mt-12 sm:mt-16">
          <div className="border-b border-line pb-2 mb-3">
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
              Your applications
            </h2>
          </div>

          <p className="text-sm text-muted mb-4">
            {totalApplicationsCount} {totalApplicationsCount === 1 ? 'application' : 'applications'} total ({inProgressCount} in progress{completedCount > 0 ? `, ${completedCount} completed` : ''}).
          </p>

          <div className="divide-y divide-line">
            {applications.slice(0, 3).map((app) => {
              const opp = app.opportunityId || {};
              const title = opp.title || app.opportunityTitle || 'Opportunity';
              const org = opp.organization || app.opportunityOrg || '';
              const appliedDate = app.submissionDate
                ? new Date(app.submissionDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })
                : 'Recent';

              const lifecycle = getApplicationLifecycle(app.status);

              return (
                <div
                  key={app._id}
                  className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="font-serif text-base sm:text-lg font-semibold text-ink leading-snug">
                      <Link
                        to={`/opportunity/${opp._id || app.opportunityId}`}
                        className="hover:text-accent transition-colors"
                      >
                        {title}
                      </Link>
                    </h3>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-muted mt-1">
                      {org && <span>{org}</span>}
                      {org && <span>·</span>}
                      <span>Applied {appliedDate}</span>
                    </div>

                    {/* Restrained Application Lifecycle Progress */}
                    <div className="mt-2.5">
                      <div className="text-xs uppercase tracking-wider text-muted font-medium mb-1">
                        Application lifecycle
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-xs text-ink select-none tracking-widest" aria-hidden="true">
                          {lifecycle.stage === 5
                            ? '████████████████'
                            : lifecycle.stage === 4
                            ? '████████████░░░░'
                            : '█████████░░░░░░░'}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          Stage {lifecycle.stage} of {lifecycle.totalStages}
                        </span>
                        <span className="text-xs text-muted">
                          · {lifecycle.progressText}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-left sm:text-right pt-1 sm:pt-0">
                    <span className={`text-xs sm:text-sm ${getStatusColorClass(app.status)}`}>
                      {app.status || 'Submitted'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4">
            <Link
              to="/applications"
              className="text-xs sm:text-sm text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
            >
              View all applications ({totalApplicationsCount}) →
            </Link>
          </div>
        </section>
      )}

      {/* ========================================================
          SECTION 5: SAVED FOR LATER (Supporting Priority)
          Level 1 spacing + Level 2 heading + Level 3 divider
         ======================================================== */}
      <section className="mt-12 sm:mt-16">
        <div className="border-b border-line pb-2 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Saved for later
          </h2>
        </div>

        <p className="text-sm text-muted mb-4">
          Opportunities you&apos;ve bookmarked for later.
        </p>

        {savedOpportunities.length === 0 ? (
          <div className="py-6 text-sm text-muted space-y-2">
            <p>You haven&apos;t saved any opportunities yet.</p>
            <p>Save an opportunity to keep it here for later.</p>
            <p className="pt-1">
              <Link
                to="/browse"
                className="text-accent hover:text-accent-hover underline decoration-line underline-offset-2 font-medium text-xs sm:text-sm"
              >
                Browse opportunities →
              </Link>
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {savedOpportunities.slice(0, 3).map((opp) => (
              <div
                key={opp._id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
              >
                <div>
                  <h3 className="font-serif text-base sm:text-lg font-semibold text-ink">
                    <Link
                      to={`/opportunity/${opp._id}`}
                      className="hover:text-accent transition-colors"
                    >
                      {opp.title}
                    </Link>
                  </h3>
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-muted mt-1">
                    {opp.organization && <span>{opp.organization}</span>}
                    {opp.organization && <span>·</span>}
                    <span className="uppercase text-xs font-medium text-accent">{opp.type}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs sm:text-sm">
                  <span className="text-accent font-medium">
                    {formatDaysRemaining(opp.deadline)}
                  </span>
                  <Link
                    to={`/opportunity/${opp._id}`}
                    className="text-ink hover:text-accent underline decoration-line font-medium"
                  >
                    View details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {savedOpportunities.length > 0 && (
          <div className="pt-4">
            <Link
              to="/browse?saved=true"
              className="text-xs sm:text-sm text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
            >
              View saved opportunities →
            </Link>
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION 6: EXPLORE (Supporting Priority)
          Level 1 spacing + Level 2 heading + Level 3 divider
         ======================================================== */}
      <section className="mt-12 sm:mt-16 pb-8">
        <div className="border-b border-line pb-2 mb-3">
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">
            Explore
          </h2>
        </div>

        <p className="text-sm text-muted mb-5">
          Browse verified opportunities by category.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3.5 gap-x-8 text-sm">
          {CATEGORIES.map(cat => (
            <Link
              key={cat.id}
              to={`/browse?type=${cat.id}`}
              className="py-1 text-ink hover:text-accent underline decoration-line underline-offset-2 transition-colors flex items-center justify-between"
            >
              <span>{cat.label}</span>
              <span className="text-muted text-xs font-mono">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Apply Modal */}
      {applyModalOpp && (
        <ApplyModal
          opportunity={applyModalOpp}
          onClose={() => setApplyModalOpp(null)}
          onSuccess={handleApplySuccess}
        />
      )}
    </div>
  );
}
