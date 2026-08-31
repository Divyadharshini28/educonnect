import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Building2, 
  Calendar, 
  ExternalLink, 
  RefreshCw, 
  AlertCircle
} from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_CONFIG = {
  'Submitted': { bg: 'bg-blue-50 text-blue-800 border-blue-200' },
  'Under Review': { bg: 'bg-amber-50 text-amber-800 border-amber-200' },
  'Accepted': { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  'Rejected': { bg: 'bg-rose-50 text-rose-800 border-rose-200' }
};

export default function ApplicationsPage({ onOpenAuth }) {
  const { studentProfile } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (studentProfile) {
      fetchApplications();
    } else {
      setLoading(false);
    }
  }, [studentProfile]);

  const fetchApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/student/applications');
      setApplications(res.data || []);
    } catch (err) {
      console.error('Failed to fetch applications:', err);
      setError('Unable to load application history.');
    } finally {
      setLoading(false);
    }
  };

  if (!studentProfile) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center">
        <div className="w-12 h-12 bg-brand-50 text-brand-800 rounded-lg flex items-center justify-center mx-auto mb-3 border border-brand-200">
          <FileText className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Student Authentication Required</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
          Sign in to view your application submission history and review statuses.
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

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-800 mb-1">
          <FileText className="w-4 h-4" />
          <span>Application Tracker</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Application Tracking Dashboard
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Monitor your submitted applications across scholarships, internships, hackathons, and certifications.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Submissions</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{applications.length}</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Under Review</p>
          <p className="text-xl font-bold text-amber-700 mt-0.5">
            {applications.filter(a => a.status === 'Under Review').length}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Accepted</p>
          <p className="text-xl font-bold text-emerald-700 mt-0.5">
            {applications.filter(a => a.status === 'Accepted').length}
          </p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Rejected</p>
          <p className="text-xl font-bold text-rose-700 mt-0.5">
            {applications.filter(a => a.status === 'Rejected').length}
          </p>
        </div>
      </div>

      {/* Application List */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-6 h-6 text-brand-800 animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">Loading submitted applications...</p>
        </div>
      ) : error ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-200 shadow-sm">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800 mb-1">No Applications Recorded</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            Discover opportunities suited to your profile and submit your applications.
          </p>
          <a
            href="/recommendations"
            className="inline-flex items-center px-4 py-2 rounded-md text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 shadow-sm transition-colors"
          >
            Explore Recommendations
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const opp = app.opportunityId || {};
            const title = opp.title || app.opportunityTitle || 'Opportunity';
            const type = opp.type || app.opportunityType || 'Opportunity';
            const org = opp.organization || app.opportunityOrg || 'Partner Institution';
            const officialUrl = opp.officialUrl || app.opportunityUrl;
            const statusStyle = STATUS_CONFIG[app.status] || STATUS_CONFIG['Submitted'];
            const subDate = new Date(app.submissionDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });

            return (
              <div 
                key={app._id} 
                className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Info */}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      {type}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {org}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Submitted: {subDate}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                    {title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    {app.responses?.resumeUrl && (
                      <a 
                        href={app.responses.resumeUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-brand-800 hover:underline flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Attached Resume Document
                      </a>
                    )}
                    {officialUrl && (
                      <a
                        href={officialUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Host Portal
                      </a>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${statusStyle.bg}`}>
                    Status: {app.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
