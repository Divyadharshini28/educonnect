import React, { useState, useEffect } from 'react';
import { Search, Compass, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../api';
import OpportunityCard from '../components/OpportunityCard';
import ApplyModal from '../components/ApplyModal';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  { id: 'all', label: 'All Opportunities' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'internship', label: 'Internships' },
  { id: 'hackathon', label: 'Hackathons' },
  { id: 'certification', label: 'Certifications' }
];

const DEPARTMENTS = [
  'All',
  'Computer Science',
  'Information Technology',
  'Electronics & Communication',
  'Data Science',
  'Mechanical',
  'Civil'
];

export default function OpportunitiesPage({ onOpenAuth }) {
  const { studentProfile } = useAuth();
  const [opportunities, setOpportunities] = useState([]);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDept, setSelectedDept] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOppForApply, setSelectedOppForApply] = useState(null);

  useEffect(() => {
    fetchOpportunities();
    if (studentProfile) {
      fetchAppliedOpportunities();
    }
  }, [selectedCategory, selectedDept]);

  const fetchOpportunities = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (selectedCategory !== 'all') params.type = selectedCategory;
      if (selectedDept !== 'All') params.department = selectedDept;
      if (searchTerm) params.search = searchTerm;

      const res = await api.get('/opportunities', { params });
      setOpportunities(res.data || []);
    } catch (err) {
      console.error('Failed to fetch catalog:', err);
      setError('Unable to load opportunities catalog.');
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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchOpportunities();
  };

  const handleApplyClick = (opp) => {
    if (!studentProfile) {
      onOpenAuth('login');
      return;
    }
    setSelectedOppForApply(opp);
  };

  const handleApplySuccess = (application) => {
    setAppliedIds(new Set([...appliedIds, application.opportunityId._id]));
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-800 mb-1">
          <Compass className="w-4 h-4" />
          <span>Opportunity Directory</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Explore Student Opportunities
        </h1>
        <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
          Browse vetted scholarships, technical internships, national hackathons, and accredited industry certifications.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6 space-y-3">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Bar + Branch Filter */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by opportunity title, technical skills, or organization..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-20 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800 focus:border-brand-800"
            />
            <button
              type="submit"
              className="absolute right-1 top-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition-colors"
            >
              Search
            </button>
          </form>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">Branch:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-md border border-slate-300 bg-white text-slate-700"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Catalog Grid */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-6 h-6 text-brand-800 animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">Loading catalog opportunities...</p>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-200">
          <p className="text-sm font-bold text-slate-800 mb-1">No opportunities match the selected criteria</p>
          <p className="text-xs text-slate-500">Please refine search keywords or adjust branch filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {opportunities.map((opp) => (
            <OpportunityCard
              key={opp._id}
              opportunity={opp}
              onApply={handleApplyClick}
              isApplied={appliedIds.has(opp._id)}
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
