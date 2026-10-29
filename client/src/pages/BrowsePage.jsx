import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

export default function BrowsePage() {
  const { studentProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [opportunities, setOpportunities] = useState([]);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Initial filter values from URL search params
  const initialType = searchParams.get('type') || 'all';
  const initialDeadline = searchParams.get('deadline') || 'all';
  const initialSavedOnly = searchParams.get('saved') === 'true';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState(initialType);
  const [selectedDeadline, setSelectedDeadline] = useState(initialDeadline);
  const [savedOnly, setSavedOnly] = useState(initialSavedOnly);

  const [applyModalOpp, setApplyModalOpp] = useState(null);

  // Sync state if search params change
  useEffect(() => {
    const typeParam = searchParams.get('type') || 'all';
    const deadlineParam = searchParams.get('deadline') || 'all';
    const savedParam = searchParams.get('saved') === 'true';

    setSelectedType(typeParam);
    setSelectedDeadline(deadlineParam);
    setSavedOnly(savedParam);
  }, [searchParams]);

  useEffect(() => {
    loadCatalog();
    if (currentUser) {
      loadUserData();
    } else {
      setAppliedIds(new Set());
      setBookmarkedIds(new Set());
    }
  }, [currentUser]);

  const loadCatalog = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/opportunities');
      setOpportunities(res.data || []);
    } catch (err) {
      setError("We couldn't load opportunities. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async () => {
    try {
      const [appRes, bookRes] = await Promise.allSettled([
        api.get('/student/applications'),
        api.get('/student/bookmarks')
      ]);

      if (appRes.status === 'fulfilled') {
        const ids = new Set((appRes.value.data || []).map(a => a.opportunityId?._id || a.opportunityId));
        setAppliedIds(ids);
      }
      if (bookRes.status === 'fulfilled') {
        const ids = new Set((bookRes.value.data || []).map(b => b._id || b));
        setBookmarkedIds(ids);
      }
    } catch (err) {
      // Non-blocking
    }
  };

  const updateFilters = (newType, newDeadline, newSavedOnly) => {
    const params = {};
    if (newType && newType !== 'all') params.type = newType;
    if (newDeadline && newDeadline !== 'all') params.deadline = newDeadline;
    if (newSavedOnly) params.saved = 'true';
    setSearchParams(params);
  };

  const handleTypeChange = (val) => {
    setSelectedType(val);
    updateFilters(val, selectedDeadline, savedOnly);
  };

  const handleDeadlineChange = (val) => {
    setSelectedDeadline(val);
    updateFilters(selectedType, val, savedOnly);
  };

  const handleToggleSavedOnly = () => {
    const nextSaved = !savedOnly;
    setSavedOnly(nextSaved);
    updateFilters(selectedType, selectedDeadline, nextSaved);
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
  };

  // Filter opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter(opp => {
      // Saved filter
      if (savedOnly && !bookmarkedIds.has(opp._id)) {
        return false;
      }

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

      // Search keyword
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
  }, [opportunities, selectedType, selectedDeadline, savedOnly, bookmarkedIds, searchQuery]);

  return (
    <div className="max-w-[768px] mx-auto px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">Browse Opportunities</h1>
        <p className="text-sm text-muted mt-1.5">
          {loading
            ? 'Loading opportunities...'
            : `${filteredOpportunities.length} opportunities available.`}
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
              onChange={(e) => handleTypeChange(e.target.value)}
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
              onChange={(e) => handleDeadlineChange(e.target.value)}
              aria-label="Filter by deadline"
              className="w-full text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            >
              {DEADLINE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Saved only toggle button */}
          {(currentUser || studentProfile) && (
            <button
              type="button"
              onClick={handleToggleSavedOnly}
              className={`px-3.5 py-2 text-sm rounded-[4px] border transition-colors shrink-0 ${
                savedOnly
                  ? 'border-accent text-accent font-medium bg-accent-soft/30'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {savedOnly ? `Saved only (${bookmarkedIds.size})` : `Saved (${bookmarkedIds.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Editorial list without match percentages */}
      <div className="mt-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted">
            Loading opportunities...
          </div>
        ) : error ? (
          <div className="py-8 text-sm text-bad">
            <p>{error}</p>
            <button
              onClick={loadCatalog}
              className="mt-2 text-ink hover:text-accent underline decoration-line font-medium"
            >
              Try again
            </button>
          </div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted space-y-2">
            <p>No opportunities match these filters yet.</p>
            {savedOnly ? (
              <p>
                <button
                  type="button"
                  onClick={() => handleToggleSavedOnly()}
                  className="text-accent hover:text-accent-hover underline decoration-line"
                >
                  Show all opportunities instead of saved only.
                </button>
              </p>
            ) : selectedDeadline !== 'all' ? (
              <p>
                <button
                  type="button"
                  onClick={() => handleDeadlineChange('all')}
                  className="text-accent hover:text-accent-hover underline decoration-line"
                >
                  Try removing the deadline filter.
                </button>
              </p>
            ) : selectedType !== 'all' ? (
              <p>
                <button
                  type="button"
                  onClick={() => handleTypeChange('all')}
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
          </div>
        ) : (
          <div>
            {filteredOpportunities.map((opp) => (
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
