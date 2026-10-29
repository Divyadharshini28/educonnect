import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { trackApply, trackClick } from '../services/interactionTracker';

export default function ApplyModal({ opportunity, onClose, onSuccess }) {
  const { studentProfile } = useAuth();
  const [resumeUrl, setResumeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!opportunity) return null;

  const isExternal = Boolean(opportunity.source && opportunity.source !== 'internal');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/applications', {
        opportunityId: opportunity._id,
        applicationMethod: isExternal ? 'external-link' : 'internal',
        responses: {
          resumeUrl: resumeUrl.trim(),
          studentName: studentProfile?.name || '',
          department: studentProfile?.department || '',
          cgpa: studentProfile?.cgpa || 0
        }
      });

      const app = res.data.application;
      trackApply(opportunity._id, { source: isExternal ? 'apply-modal-external' : 'apply-modal-internal' });
      setSubmitted(true);
      if (onSuccess) {
        onSuccess(app);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'We could not submit your application. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40"
    >
      <div className="w-full max-w-[480px] border border-line bg-paper rounded-[4px] p-6 text-ink">
        {submitted ? (
          <div className="space-y-4">
            <h2 id="apply-modal-title" className="font-serif text-xl sm:text-2xl font-semibold">
              {isExternal ? 'External application recorded' : 'Application submitted'}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {isExternal
                ? `Your application for ${opportunity.title} is now recorded in your tracker as student-reported. You can update your progress on the Applications page.`
                : `Your application for ${opportunity.title} is now submitted and listed under Applications.`}
            </p>

            {opportunity.officialUrl && (
              <div className="pt-3 border-t border-line text-sm">
                <p className="text-muted mb-2">
                  {isExternal
                    ? 'Important: Complete your submission on the provider’s portal if you have not already done so:'
                    : 'External portal submission link:'}
                </p>
                <a
                  href={opportunity.officialUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    trackClick(opportunity._id, {
                      source: 'apply-modal-external-link',
                      targetUrl: opportunity.officialUrl,
                      action: 'open-external-application-portal'
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-line bg-canvas hover:border-ink text-accent hover:text-accent-hover font-medium transition-colors text-xs sm:text-sm"
                >
                  <span>Open official application page</span>
                  <span>↗</span>
                </a>
              </div>
            )}

            <div className="pt-4 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-[4px] bg-ink text-paper hover:opacity-90 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4 mb-4">
              <div>
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                  {opportunity.type}
                </span>
                <h2 id="apply-modal-title" className="font-serif text-xl font-semibold mt-1">
                  {isExternal ? 'Record external application' : 'Submit application'}
                </h2>
                <p className="text-sm text-muted mt-0.5">
                  {opportunity.title} · {opportunity.organization || opportunity.source}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:text-ink text-sm font-medium"
                aria-label="Close dialog"
              >
                Cancel
              </button>
            </div>

            {isExternal && (
              <div className="mb-4 p-3 rounded bg-canvas border border-line text-xs text-muted leading-relaxed">
                <span className="font-semibold text-ink block mb-1">External Opportunity Notice</span>
                This opportunity is hosted externally by <span className="font-medium text-ink">{opportunity.organization || opportunity.source}</span>.
                Recording your application here logs it in your EduConnect tracker as student-reported.
                {opportunity.officialUrl && (
                  <div className="mt-2 pt-2 border-t border-line/60">
                    <a
                      href={opportunity.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline font-medium hover:text-accent-hover"
                    >
                      Visit official portal first ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-bad mb-4" role="alert">
                {error}
              </p>
            )}

            <div className="text-sm text-muted mb-4 border-b border-line pb-4">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted mb-1">
                Applicant details
              </p>
              <p className="text-ink font-medium">
                {studentProfile?.name || 'Student'} ({studentProfile?.department || 'General'}, Year {studentProfile?.year || 1})
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="resumeUrl"
                  className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
                >
                  Portfolio or resume link (optional)
                </label>
                <input
                  id="resumeUrl"
                  type="url"
                  placeholder="https://..."
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                  className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors disabled:opacity-50"
                >
                  {loading
                    ? (isExternal ? 'Recording...' : 'Submitting...')
                    : (isExternal ? 'Record external application' : 'Submit application')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
