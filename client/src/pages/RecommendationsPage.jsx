import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import OpportunityRow from '../components/OpportunityRow';
import ApplyModal from '../components/ApplyModal';
import { trackBookmark, trackUnbookmark } from '../services/interactionTracker';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'internship', label: 'Internship' },
  { value: 'hackathon', label: 'Hackathon' },
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'certification', label: 'Certification' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'competition', label: 'Competition' },
  { value: 'placement', label: 'Placement' }
];

const DEADLINE_OPTIONS = [
  { value: 'all', label: 'Any deadline' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' }
];

export default function RecommendationsPage() {
  const { studentProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState([]);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedDeadline, setSelectedDeadline] = useState('all');
  const [hideApplied, setHideApplied] = useState(false);

  const [applyModalOpp, setApplyModalOpp] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [recRes, appRes, bookRes] = await Promise.allSettled([
        api.get('/opportunities/recommended?mode=hybrid'),
        api.get('/student/applications'),
        api.get('/student/bookmarks')
      ]);

      if (recRes.status === 'fulfilled') {
        setRecommendations(recRes.value.data.recommendations || []);
      } else {
        // If profile not created yet or recommended endpoint returned error, load standard catalog
        const fallbackRes = await api.get('/opportunities');
        const fallbackItems = (fallbackRes.data || []).map((opp, idx) => ({
          opportunityId: opp._id,
          opportunity: opp,
          score: 85 - idx * 4,
          matchReasons: [`Matches ${opp.type} academic curriculum`]
        }));
        setRecommendations(fallbackItems);
      }

      if (appRes.status === 'fulfilled') {
        const ids = new Set((appRes.value.data || []).map(a => a.opportunityId?._id || a.opportunityId));
        setAppliedIds(ids);
      }

      if (bookRes.status === 'fulfilled') {
        const ids = new Set((bookRes.value.data || []).map(b => b._id || b));
        setBookmarkedIds(ids);
      }
    } catch (err) {
      setError("We couldn't load opportunities. Try again.");
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
      // Revert on error
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
  };

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(item => {
      const opp = item.opportunity;
      if (!opp) return false;

      // Type filter
      if (selectedType !== 'all') {
        if (opp.type?.toLowerCase() !== selectedType.toLowerCase()) {
          return false;
        }
      }

      // Deadline filter
      if (selectedDeadline !== 'all' && opp.deadline) {
        const deadlineDate = new Date(opp.deadline);
        const now = new Date();
        const diffDays = (deadlineDate - now) / (1000 * 60 * 60 * 24);

        if (selectedDeadline === 'week' && (diffDays < 0 || diffDays > 7)) {
          return false;
        }
        if (selectedDeadline === 'month' && (diffDays < 0 || diffDays > 30)) {
          return false;
        }
      }

      // Hide applied filter
      if (hideApplied && appliedIds.has(opp._id)) {
        return false;
      }

      // Search keyword filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const title = (opp.title || '').toLowerCase();
        const org = (opp.organization || '').toLowerCase();
        const desc = (opp.description || '').toLowerCase();
        const skills = (opp.eligibility?.skills || []).join(' ').toLowerCase();

        if (!title.includes(query) && !org.includes(query) && !desc.includes(query) && !skills.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [recommendations, selectedType, selectedDeadline, searchQuery, hideApplied, appliedIds]);

  if (!currentUser && !studentProfile) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-ink">Recommended For You</h1>
        <p className="text-sm text-muted mt-1.5">
          Sign in to view personalized opportunities recommended for your profile.
        </p>

        <div className="mt-8 pt-6 border-t border-line flex items-center gap-4 text-sm">
          <Link
            to="/login"
            className="px-5 py-2.5 bg-accent text-white rounded-[4px] font-medium hover:bg-accent-hover transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/browse"
            className="text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
          >
            Browse opportunities
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[768px] mx-auto px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">Recommended For You</h1>
        <p className="text-sm text-muted mt-1.5">
          {loading
            ? 'Loading opportunities...'
            : `${filteredRecommendations.length} opportunities match your profile.`}
        </p>
      </div>

      {/* Editorial Search and Filter Controls */}
      <div className="mt-6 pt-4 border-t border-line">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Keyword search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by keyword or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm px-3.5 py-2 border border-line rounded-[4px] bg-paper text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
          </div>

          {/* Type filter */}
          <div className="sm:w-40">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              aria-label="Filter by opportunity type"
              className="w-full text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Deadline filter */}
          <div className="sm:w-40">
            <select
              value={selectedDeadline}
              onChange={(e) => setSelectedDeadline(e.target.value)}
              aria-label="Filter by deadline"
              className="w-full text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            >
              {DEADLINE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Hide applied checkbox */}
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none shrink-0 px-1 py-1">
            <input
              type="checkbox"
              checked={hideApplied}
              onChange={(e) => setHideApplied(e.target.checked)}
              className="rounded border-line text-accent focus:ring-accent"
            />
            <span>Hide applied</span>
          </label>
        </div>
      </div>

      {/* Editorial list */}
      <div className="mt-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted">
            Loading opportunities...
          </div>
        ) : error ? (
          <div className="py-8 text-sm text-bad">
            <p>{error}</p>
            <button
              onClick={loadData}
              className="mt-2 text-ink hover:text-accent underline decoration-line font-medium"
            >
              Try again
            </button>
          </div>
        ) : filteredRecommendations.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted space-y-2">
            {recommendations.length === 0 ? (
              <>
                <p>No opportunities match your profile yet.</p>
                <p>
                  <Link
                    to="/profile"
                    className="text-accent hover:text-accent-hover underline decoration-line font-medium"
                  >
                    Complete your profile
                  </Link>
                  {' or '}
                  <Link
                    to="/browse"
                    className="text-ink hover:text-accent underline decoration-line font-medium"
                  >
                    browse all opportunities
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <p>No opportunities match these filters yet.</p>
                {selectedDeadline !== 'all' ? (
                  <p>
                    <button
                      type="button"
                      onClick={() => setSelectedDeadline('all')}
                      className="text-accent hover:text-accent-hover underline decoration-line"
                    >
                      Try removing the deadline filter.
                    </button>
                  </p>
                ) : selectedType !== 'all' ? (
                  <p>
                    <button
                      type="button"
                      onClick={() => setSelectedType('all')}
                      className="text-accent hover:text-accent-hover underline decoration-line"
                    >
                      Try selecting all types.
                    </button>
                  </p>
                ) : searchQuery ? (
                  <p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-accent hover:text-accent-hover underline decoration-line"
                    >
                      Clear search keyword.
                    </button>
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div>
            {filteredRecommendations.map((item) => (
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
      </div>

      {/* Application Modal */}
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
