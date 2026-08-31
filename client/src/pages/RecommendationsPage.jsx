import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  RefreshCw, 
  AlertCircle, 
  Sliders
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import OpportunityCard from '../components/OpportunityCard';
import ApplyModal from '../components/ApplyModal';

export default function RecommendationsPage({ onOpenAuth }) {
  const { studentProfile } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOppForApply, setSelectedOppForApply] = useState(null);
  const [filterEligibleOnly, setFilterEligibleOnly] = useState(true);

  useEffect(() => {
    if (studentProfile) {
      fetchRecommendations();
      fetchAppliedOpportunities();
    } else {
      setLoading(false);
    }
  }, [studentProfile]);

  const fetchRecommendations = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/opportunities/recommended?mode=hybrid');
      setRecommendations(res.data.recommendations || []);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      setError(err.response?.data?.message || 'Unable to fetch recommendations.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppliedOpportunities = async () => {
    try {
      const res = await api.get('/student/applications');
      const ids = new Set((res.data || []).map(a => a.opportunityId?._id || a.opportunityId));
      setAppliedIds(ids);
    } catch (err) {
      console.warn('Could not fetch applied list:', err.message);
    }
  };

  const handleApplySuccess = (application) => {
    setAppliedIds(new Set([...appliedIds, application.opportunityId._id]));
  };

  if (!studentProfile) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center">
        <div className="w-12 h-12 bg-brand-50 text-brand-800 rounded-lg flex items-center justify-center mx-auto mb-3 border border-brand-200">
          <Layers className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Student Authentication Required</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
          Please sign in or register your student profile to access personalized opportunity matches.
        </p>
        <button
          onClick={() => onOpenAuth('login')}
          className="px-5 py-2.5 rounded-md bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs shadow-sm transition-colors"
        >
          Sign In
        </button>
      </div>
    );
  }

  const displayedRecommendations = filterEligibleOnly
    ? recommendations.filter(r => r.eligibilityStatus === 'Eligible')
    : recommendations;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Overview Banner */}
      <div className="bg-brand-900 rounded-xl p-6 text-white shadow-sm mb-6 border border-brand-950">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            Recommended Opportunities
          </h1>
          <p className="text-xs text-brand-100/80 leading-relaxed mb-4">
            Curated opportunities matched directly to your academic discipline, year of study, current CGPA, and registered technical skill set.
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs bg-brand-950/60 p-3 rounded-lg border border-brand-800">
            <span className="font-semibold text-brand-200">Your Profile:</span>
            <span className="bg-brand-900 px-2 py-0.5 rounded border border-brand-700 text-brand-100">{studentProfile.name}</span>
            <span className="bg-brand-900 px-2 py-0.5 rounded border border-brand-700 text-brand-100">{studentProfile.department || 'Not set'}</span>
            <span className="bg-brand-900 px-2 py-0.5 rounded border border-brand-700 text-brand-100">Year {studentProfile.year || 1}</span>
            <span className="bg-brand-900 px-2 py-0.5 rounded border border-brand-700 text-brand-100">CGPA: {studentProfile.cgpa ? Number(studentProfile.cgpa).toFixed(2) : '0.00'}</span>
            <span className="bg-brand-900 px-2 py-0.5 rounded border border-brand-700 text-brand-100">{studentProfile.skills?.length || 0} Skills</span>
          </div>
        </div>
      </div>

      {/* Filter and stats controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterEligibleOnly(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              filterEligibleOnly
                ? 'bg-brand-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Eligible Opportunities Only ({recommendations.filter(r => r.eligibilityStatus === 'Eligible').length})
          </button>
          <button
            onClick={() => setFilterEligibleOnly(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              !filterEligibleOnly
                ? 'bg-brand-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Show All with Eligibility Status ({recommendations.length})
          </button>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Showing {displayedRecommendations.length} opportunities sorted by match score
        </p>
      </div>

      {/* Opportunities Grid */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-6 h-6 text-brand-800 animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">Loading personalized recommendations...</p>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : displayedRecommendations.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-200">
          <p className="text-sm font-bold text-slate-800 mb-1">No matching opportunities found</p>
          <p className="text-xs text-slate-500">
            Consider updating your department or technical skills in Profile Setup to expand matches.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedRecommendations.map((rec) => (
            <OpportunityCard
              key={rec.opportunityId}
              opportunity={rec.opportunity}
              recommendation={rec}
              onApply={(opp) => setSelectedOppForApply(opp)}
              isApplied={appliedIds.has(rec.opportunityId)}
            />
          ))}
        </div>
      )}

      {/* Application Modal */}
      {selectedOppForApply && (
        <ApplyModal
          opportunity={selectedOppForApply}
          onClose={() => setSelectedOppForApply(null)}
          onSuccess={handleApplySuccess}
        />
      )}
    </div>
  );
}
