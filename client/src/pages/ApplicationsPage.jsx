import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { trackClick } from '../services/interactionTracker';
import {
  APPLICATION_LIFECYCLE_STAGES,
  getApplicationLifecycle,
  getApplicationCounts
} from '../utils/dashboardUtils';

// Statuses that external applicants may self-report
const STUDENT_REPORTABLE_STATUSES = ['Submitted', 'Under Review', 'Shortlisted', 'Interview', 'Offered', 'Accepted', 'Rejected', 'Withdrawn'];

export default function ApplicationsPage() {
  const { studentProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);

  // Student-reported status update state
  const [reportingStatus, setReportingStatus] = useState(false);
  const [reportedStatus, setReportedStatus] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadApplications();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  const loadApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/student/applications');
      setApplications(res.data || []);
    } catch (err) {
      setError("We couldn't load your applications. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColorClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
      case 'offered':
        return 'text-ok font-medium';
      case 'under review':
      case 'shortlisted':
      case 'interview':
        return 'text-warn font-medium';
      case 'rejected':
      case 'withdrawn':
        return 'text-bad font-medium';
      case 'submitted':
      default:
        return 'text-muted font-medium';
    }
  };

  const handleReportStatus = async (appId) => {
    if (!reportedStatus) {
      setReportError('Please select a status to report.');
      return;
    }
    setReportingStatus(true);
    setReportError('');
    setReportSuccess('');
    try {
      await api.patch(`/applications/${appId}/student-update`, {
        status: reportedStatus,
        note: reportNote || undefined
      });
      setReportSuccess(`Status reported as "${reportedStatus}". This is a student-reported update, not verified by the provider.`);
      setReportedStatus('');
      setReportNote('');
      // Reload applications to reflect the new status
      await loadApplications();
      // Update the selected app in the modal
      if (selectedApp && selectedApp._id === appId) {
        const updated = (await api.get(`/applications/${appId}`)).data;
        setSelectedApp(updated);
      }
    } catch (err) {
      setReportError(err.response?.data?.message || 'Failed to report status. Please try again.');
    } finally {
      setReportingStatus(false);
    }
  };

  const openAppDetail = (app) => {
    setSelectedApp(app);
    setReportedStatus('');
    setReportNote('');
    setReportError('');
    setReportSuccess('');
  };

  if (!currentUser) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-ink">My Applications</h1>
        <p className="text-sm text-muted mt-1.5">
          Sign in to view and track your submitted applications.
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

  const { total: appCount, inProgress: inProgressCount, completed: completedCount } = getApplicationCounts(applications);
  const subtitle = loading
    ? 'Loading applications...'
    : appCount === 0
    ? 'No applications are currently being tracked.'
    : `${appCount} ${appCount === 1 ? 'application is' : 'applications are'} currently being tracked (${inProgressCount} in progress${completedCount > 0 ? `, ${completedCount} completed` : ''}).`;

  return (
    <div className="max-w-[768px] mx-auto px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-semibold text-ink">My Applications</h1>
        <p className="text-sm text-muted mt-1.5">{subtitle}</p>
      </div>

      {/* Editorial vertical list */}
      <div className="mt-6 pt-4 border-t border-line">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted">
            Loading applications...
          </div>
        ) : error ? (
          <div className="py-8 text-sm text-bad">
            <p>{error}</p>
            <button
              onClick={loadApplications}
              className="mt-2 text-ink hover:text-accent underline decoration-line font-medium"
            >
              Try again
            </button>
          </div>
        ) : applications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted space-y-2">
            <p>You haven&apos;t applied to any opportunities yet.</p>
            <p>
              <Link
                to="/browse"
                className="text-accent hover:text-accent-hover underline decoration-line font-medium"
              >
                Browse opportunities to get started.
              </Link>
            </p>
          </div>
        ) : (
          <div>
            {applications.map((app) => {
              const opp = app.opportunityId || {};
              const title = opp.title || app.opportunityTitle || 'Opportunity';
              const org = opp.organization || app.opportunityOrg || '';
              const appliedDate = app.submissionDate
                ? new Date(app.submissionDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : 'Recent';

              const deadlineDate = opp.deadline ? new Date(opp.deadline) : null;
              const formattedDeadline = deadlineDate
                ? deadlineDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })
                : null;

              const lifecycle = getApplicationLifecycle(app.status);

              return (
                <div
                  key={app._id}
                  className="border-b border-line py-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="min-w-0 pr-4 flex-1">
                    <h2 className="font-serif text-lg font-semibold text-ink">
                      <button
                        type="button"
                        onClick={() => openAppDetail(app)}
                        className="text-left hover:text-accent transition-colors"
                      >
                        {title}
                      </button>
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted mt-1.5">
                      {org && <span>{org}</span>}
                      {org && <span aria-hidden="true">·</span>}
                      <span>Applied {appliedDate}</span>
                      {formattedDeadline && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Deadline: {formattedDeadline}</span>
                        </>
                      )}
                      {app.applicationMethod && app.applicationMethod !== 'internal' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-xs italic">External application</span>
                        </>
                      )}
                      {app.isStudentReported && (
                        <span className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                          Self-reported
                        </span>
                      )}
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wider text-muted font-medium mb-1">
                        Application lifecycle
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="font-mono text-xs sm:text-sm text-ink select-none tracking-widest" aria-hidden="true">
                          {lifecycle.stage === 5
                            ? '████████████████'
                            : lifecycle.stage === 4
                            ? '████████████░░░░'
                            : '█████████░░░░░░░'}
                        </span>
                        <span className="font-mono text-xs text-muted">
                          Stage {lifecycle.stage} of {lifecycle.totalStages}
                        </span>
                        <span className="text-xs sm:text-sm text-muted">
                          · {lifecycle.progressText}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-start sm:items-end gap-2.5 pt-1 sm:pt-0">
                    <span className={`text-sm ${getStatusColorClass(app.status)}`}>
                      {app.status || 'Submitted'}
                    </span>

                    <button
                      type="button"
                      onClick={() => openAppDetail(app)}
                      className="text-sm text-ink hover:text-accent underline decoration-line underline-offset-2 font-medium"
                    >
                      View tracking details →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Application Detail Tracking View Modal */}
      {selectedApp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40"
        >
          <div className="w-full max-w-[512px] border border-line bg-paper rounded-[4px] p-6 text-ink max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4 mb-4">
              <div>
                <h2 id="app-detail-title" className="font-serif text-xl font-semibold leading-snug">
                  {selectedApp.opportunityId?.title || selectedApp.opportunityTitle || 'Application Details'}
                </h2>
                <p className="text-sm text-muted mt-1 font-medium">
                  {selectedApp.opportunityId?.organization || selectedApp.opportunityOrg || ''}
                </p>
                {selectedApp.applicationMethod && selectedApp.applicationMethod !== 'internal' && (
                  <span className="inline-block mt-1 text-xs bg-canvas border border-line text-muted px-2 py-0.5 rounded">
                    External application
                    {selectedApp.isStudentReported ? ' · Self-reported status' : ''}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="text-muted hover:text-ink text-sm shrink-0 font-medium"
              >
                Close
              </button>
            </div>

            {/* Application Progress Vertical Stepper */}
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
                Application lifecycle
              </h3>

              {(() => {
                const lifecycle = getApplicationLifecycle(selectedApp.status);
                return (
                  <div>
                    <div className="space-y-0 text-sm">
                      {APPLICATION_LIFECYCLE_STAGES.map((stage, idx) => {
                        const isDone = stage.id < lifecycle.stage || (stage.id === 5 && lifecycle.isCompleted);
                        const isCurrent = stage.id === lifecycle.stage;
                        const isLast = idx === APPLICATION_LIFECYCLE_STAGES.length - 1;

                        return (
                          <div key={stage.id} className="relative flex items-start gap-3">
                            {/* Vertical Line */}
                            {!isLast && (
                              <div
                                className={`absolute left-[5px] top-4 w-[1px] h-6 ${
                                  isDone ? 'bg-ink' : 'bg-line'
                                }`}
                              />
                            )}

                            {/* Node Dot */}
                            <div className="pt-0.5 z-10">
                              {isDone ? (
                                <span className="text-accent text-sm leading-none">●</span>
                              ) : isCurrent ? (
                                <span className="text-accent text-sm leading-none font-bold">●</span>
                              ) : (
                                <span className="text-muted text-sm leading-none">○</span>
                              )}
                            </div>

                            {/* Label */}
                            <div className="pb-4">
                              <span
                                className={`${
                                  isCurrent
                                    ? 'text-ink font-semibold'
                                    : isDone
                                    ? 'text-ink font-medium'
                                    : 'text-muted'
                                }`}
                              >
                                {stage.id === 5 && lifecycle.isCompleted ? lifecycle.stageLabel : stage.label}
                              </span>
                              {isCurrent && (
                                <span className="ml-2 text-xs uppercase font-mono text-accent">
                                  [Current Stage {stage.id}/5]
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs sm:text-sm text-muted pt-2 border-t border-line/60">
                      Current lifecycle status: {lifecycle.progressText}
                      {!lifecycle.isCompleted && !selectedApp.statusHistory?.length && (
                        <span className="block text-xs text-muted mt-1 italic">No update received yet from the provider.</span>
                      )}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Status History Timeline */}
            {selectedApp.statusHistory && selectedApp.statusHistory.length > 0 && (
              <div className="mb-6 pt-4 border-t border-line">
                <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-3">
                  Status history
                </h3>
                <div className="space-y-2">
                  {[...selectedApp.statusHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm">
                      <div className="shrink-0 w-2 h-2 rounded-full bg-accent mt-1.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-medium text-ink">{entry.status}</span>
                          <span className="text-xs text-muted">
                            {new Date(entry.changedAt).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          {entry.source && (
                            <span className="text-xs italic text-muted">
                              ({entry.source === 'student-reported' ? 'self-reported' : entry.source})
                            </span>
                          )}
                        </div>
                        {entry.note && (
                          <p className="text-xs text-muted mt-0.5">{entry.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Student-Reported Status Update (for external applications) */}
            {selectedApp.applicationMethod && selectedApp.applicationMethod !== 'internal' && !selectedApp.status?.match(/^(Accepted|Rejected|Withdrawn|Offered)$/i) && (
              <div className="mb-6 pt-4 border-t border-line">
                <h3 className="text-xs uppercase tracking-wider text-muted font-semibold mb-2">
                  Update your application status
                </h3>
                <p className="text-xs text-muted mb-3 leading-relaxed">
                  For externally applied opportunities, you can self-report your current status. This is not verified by the provider.
                </p>

                {reportError && (
                  <p className="text-xs text-bad mb-2">{reportError}</p>
                )}
                {reportSuccess && (
                  <p className="text-xs text-ok mb-2">{reportSuccess}</p>
                )}

                <div className="flex flex-col gap-2">
                  <select
                    value={reportedStatus}
                    onChange={(e) => setReportedStatus(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
                  >
                    <option value="">Select status to report…</option>
                    {STUDENT_REPORTABLE_STATUSES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="Optional note (e.g., Received interview invite)"
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
                  />

                  <button
                    type="button"
                    disabled={reportingStatus || !reportedStatus}
                    onClick={() => handleReportStatus(selectedApp._id)}
                    className="px-4 py-2 text-sm font-medium rounded-[4px] bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {reportingStatus ? 'Reporting…' : 'Report Status'}
                  </button>
                </div>
              </div>
            )}

            {/* Metadata & Submissions */}
            <div className="space-y-3 pt-4 border-t border-line text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Submission date:</span>
                <span className="text-ink font-medium">
                  {selectedApp.submissionDate
                    ? new Date(selectedApp.submissionDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : 'N/A'}
                </span>
              </div>

              {selectedApp.opportunityId?.deadline && (
                <div className="flex justify-between">
                  <span className="text-muted">Opportunity deadline:</span>
                  <span className="text-ink font-medium">
                    {new Date(selectedApp.opportunityId.deadline).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-muted">Review status:</span>
                <span className={getStatusColorClass(selectedApp.status)}>
                  {selectedApp.status || 'Submitted'}
                </span>
              </div>

              {selectedApp.externalReference && (
                <div className="flex justify-between">
                  <span className="text-muted">Reference/Confirmation:</span>
                  <span className="text-ink font-medium text-xs font-mono">{selectedApp.externalReference}</span>
                </div>
              )}

              {selectedApp.responses?.resumeUrl && (
                <div className="pt-2 border-t border-line/60">
                  <span className="text-muted block mb-1">Attached resume or portfolio:</span>
                  <a
                    href={selectedApp.responses.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:text-accent-hover underline decoration-line break-all text-xs"
                  >
                    {selectedApp.responses.resumeUrl}
                  </a>
                </div>
              )}

              {selectedApp.opportunityId?._id && (
                <div className="pt-2 border-t border-line/60 flex justify-between items-center text-sm">
                  <Link
                    to={`/opportunity/${selectedApp.opportunityId._id}`}
                    onClick={() => setSelectedApp(null)}
                    className="text-ink hover:text-accent underline decoration-line font-medium"
                  >
                    View opportunity details →
                  </Link>

                  {selectedApp.opportunityId.officialUrl && (
                    <a
                      href={selectedApp.opportunityId.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        const oppId = selectedApp.opportunityId?._id || selectedApp.opportunityId;
                        trackClick(oppId, {
                          source: 'applications-page-official-link',
                          targetUrl: selectedApp.opportunityId.officialUrl,
                          action: 'visit-official-portal'
                        });
                      }}
                      className="text-muted hover:text-ink underline decoration-line font-medium"
                    >
                      Official portal
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="pt-5 border-t border-line mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="px-5 py-2 text-sm rounded-[4px] bg-ink text-paper font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
