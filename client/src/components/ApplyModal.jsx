import React, { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle2, Building2, ExternalLink, User } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function ApplyModal({ opportunity, onClose, onSuccess }) {
  const { studentProfile } = useAuth();
  const [resumeUrl, setResumeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedApp, setSubmittedApp] = useState(null);

  if (!opportunity) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/applications', {
        opportunityId: opportunity._id,
        responses: {
          resumeUrl: resumeUrl.trim(),
          studentName: studentProfile?.name || '',
          department: studentProfile?.department || '',
          cgpa: studentProfile?.cgpa || 0
        }
      });

      const app = res.data.application;
      setSubmittedApp(app);
      if (onSuccess) {
        onSuccess(app);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative animate-scaleUp">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {submittedApp ? (
          <div className="py-3 text-center">
            <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Application Submitted</h3>
            <p className="text-xs text-slate-600 mb-5 max-w-sm mx-auto leading-relaxed">
              Your application has been registered in your tracking dashboard.
            </p>

            {opportunity.officialUrl && (
              <div className="mb-5 p-3.5 bg-brand-50 border border-brand-200 rounded-lg text-left">
                <p className="text-xs font-semibold text-brand-900 mb-0.5">Official Portal Link</p>
                <p className="text-[11px] text-slate-600 mb-2.5">
                  Complete any external registration requirements directly on the official host website.
                </p>
                <a
                  href={opportunity.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-800 hover:bg-brand-900 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  <span>Open Official Application Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Return to Opportunities
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-brand-50 text-brand-800 border border-brand-200">
                {opportunity.type}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-2">
                {opportunity.title}
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
                {opportunity.organization} • {opportunity.stipendOrReward || 'Eligible'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Student Verified Profile Preview */}
            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                Applicant Details
              </p>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                <p><span className="font-semibold text-slate-700">Name:</span> {studentProfile?.name || 'Student'}</p>
                <p><span className="font-semibold text-slate-700">Email:</span> {studentProfile?.email || 'N/A'}</p>
                <p><span className="font-semibold text-slate-700">Branch:</span> {studentProfile?.department || 'N/A'}</p>
                <p><span className="font-semibold text-slate-700">CGPA:</span> {studentProfile?.cgpa ? Number(studentProfile?.cgpa).toFixed(2) : 'N/A'}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resume / Portfolio Document URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/... or portfolio link"
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800 focus:border-brand-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{loading ? 'Submitting...' : 'Confirm and Submit Application'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
