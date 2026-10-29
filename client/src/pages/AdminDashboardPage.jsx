import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

export default function AdminDashboardPage() {
  const [analytics, setAnalytics] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  // Paginated Sync History State
  const [syncHistory, setSyncHistory] = useState({ logs: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [analyticsRes, syncRes] = await Promise.allSettled([
        api.get('/opportunities/admin/analytics'),
        api.get('/sync/status')
      ]);

      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value.data);
      } else {
        console.warn('Analytics fetch error:', analyticsRes.reason?.message);
        setError('Failed to load analytics metrics.');
      }

      if (syncRes.status === 'fulfilled') {
        setSyncStatus(syncRes.value.data);
      }
    } catch (err) {
      setError('Failed to load administration dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const loadSyncHistory = async (page = 1, source = filterSource, status = filterStatus) => {
    setHistoryLoading(true);
    try {
      const params = { page, limit: 10 };
      if (source !== 'all') params.source = source;
      if (status !== 'all') params.status = status;
      const res = await api.get('/sync/history', { params });
      setSyncHistory(res.data);
    } catch (err) {
      console.warn('Failed to load sync history:', err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadSyncHistory(historyPage, filterSource, filterStatus);
  }, [historyPage, filterSource, filterStatus]);

  const handleTriggerSync = async (provider = 'all') => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await api.post('/sync/trigger', { provider });
      setSyncMessage(res.data.message || 'Synchronization cycle triggered successfully.');
      await loadData();
      await loadSyncHistory(historyPage, filterSource, filterStatus);
    } catch (err) {
      setSyncMessage(err.response?.data?.message || 'Error executing manual synchronization.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[768px] mx-auto px-4 py-16 text-center text-xs text-muted">
        Loading administration dashboard...
      </div>
    );
  }

  const totals = analytics?.totals || {};
  const scheduler = syncStatus?.scheduler || {};

  return (
    <div className="max-w-[768px] mx-auto px-4 py-10 text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <span className="text-xs font-semibold text-accent uppercase tracking-wider">
            Administration
          </span>
          <h1 className="font-serif text-3xl font-semibold text-ink mt-1">
            Opportunity Governance & Operations
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/admin/opportunities"
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent-hover font-medium transition-colors"
          >
            Manage Opportunities
          </Link>
          <Link
            to="/admin/import"
            className="px-4 py-2 text-sm rounded border border-line hover:border-ink font-medium transition-colors"
          >
            Import CSV
          </Link>
        </div>
      </div>

      {error && (
        <div className="my-4 p-3.5 rounded text-sm bg-rose-50 border border-rose-200 text-rose-800">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 my-6">
        <div className="p-4 rounded bg-canvas border border-line">
          <span className="text-xs font-medium text-muted block">Total Students</span>
          <span className="font-serif text-3xl font-semibold text-ink mt-1 block">
            {totals.totalStudents ?? 0}
          </span>
          <span className="text-xs text-muted mt-1 block">Registered accounts</span>
        </div>

        <div className="p-4 rounded bg-canvas border border-line">
          <span className="text-xs font-medium text-muted block">Total Catalog</span>
          <span className="font-serif text-3xl font-semibold text-ink mt-1 block">
            {totals.totalOpportunities || 0}
          </span>
          <span className="text-xs text-muted mt-1 block">
            {totals.activeOpportunities || 0} active · {totals.inactiveOpportunities || 0} inactive
          </span>
        </div>

        <div className="p-4 rounded bg-canvas border border-line">
          <span className="text-xs font-medium text-muted block">Expired Items</span>
          <span className="font-serif text-3xl font-semibold text-ink mt-1 block">
            {totals.expiredOpportunities || 0}
          </span>
          <span className="text-xs text-muted mt-1 block">Past application deadline</span>
        </div>

        <div className="p-4 rounded bg-canvas border border-line">
          <span className="text-xs font-medium text-muted block">Total Applications</span>
          <span className="font-serif text-3xl font-semibold text-ink mt-1 block">
            {totals.totalApplications || 0}
          </span>
          <span className="text-xs text-muted mt-1 block">Cumulative submissions</span>
        </div>
      </div>

      {/* Sync Service Operations */}
      <div className="my-8 p-4 sm:p-5 rounded bg-paper border border-line">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
          <div>
            <h2 className="font-serif text-xl font-semibold text-ink">
              Catalog Synchronization & Verified Sources
            </h2>
            <p className="text-sm text-muted mt-1">
              Automated catalog synchronization from verified opportunity sources including Devpost, Hopin, Remotive, Arbeitnow, and BodhDisha.
            </p>
          </div>

          <button
            type="button"
            disabled={syncing}
            onClick={() => handleTriggerSync('all')}
            className={`px-4 py-2 text-sm rounded font-medium transition-colors shrink-0 ${
              syncing
                ? 'bg-line text-muted cursor-not-allowed'
                : 'bg-ink text-white hover:bg-ink/80'
            }`}
          >
            {syncing ? 'Updating Sources...' : 'Update All Sources'}
          </button>
        </div>

        {syncMessage && (
          <div className="mt-3 p-3 rounded text-sm bg-canvas border border-line text-ink">
            {syncMessage}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div>
            <span className="text-muted text-xs font-medium block">Scheduler Status:</span>
            <span className="font-medium text-ink flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  scheduler.isRunning ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {scheduler.isRunning ? 'Active (Scheduled)' : 'Idle'}
            </span>
          </div>

          <div>
            <span className="text-muted text-xs font-medium block">Last Sync Execution:</span>
            <span className="font-medium text-ink mt-0.5 block text-xs sm:text-sm">
              {scheduler.lastRunStartedAt ? new Date(scheduler.lastRunStartedAt).toLocaleString() : (scheduler.lastRunAt ? new Date(scheduler.lastRunAt).toLocaleString() : 'No recent run recorded')}
            </span>
          </div>

          <div>
            <span className="text-muted text-xs font-medium block">Schedule Frequency:</span>
            <span className="font-medium text-ink mt-0.5 block">
              {scheduler.schedule || 'Every 6 hours'}
            </span>
          </div>
        </div>

        {/* Individual Provider Health Cards */}
        {syncStatus?.providers && syncStatus.providers.length > 0 && (
          <div className="mt-6 pt-4 border-t border-line/60">
            <h3 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">
              Configured Opportunity Providers ({syncStatus.providers.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {syncStatus.providers.map((p) => {
                const isSuccess = p.status === 'SUCCESS' || p.status === 'PARTIAL_SUCCESS';
                const isConfig = p.status === 'CONFIG_REQUIRED' || p.requiresConfig;
                const isFailed = p.status === 'FAILED';

                let badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
                let badgeText = p.status || 'NOT RUN';
                if (isSuccess) {
                  badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  badgeText = 'HEALTHY';
                } else if (isConfig) {
                  badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                  badgeText = 'CONFIG REQUIRED';
                } else if (isFailed) {
                  badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                  badgeText = 'FAILED';
                }

                return (
                  <div
                    key={p.source}
                    className="p-3.5 rounded bg-canvas border border-line text-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink text-sm sm:text-base">{p.name}</span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${badgeColor}`}>
                          {badgeText}
                        </span>
                      </div>

                      <p className="text-xs text-muted mt-1">{p.description}</p>

                      <div className="mt-2.5 pt-2 border-t border-line/40 space-y-1 text-xs">
                        <div className="flex justify-between text-muted">
                          <span>Last Success:</span>
                          <span className="font-medium text-ink">
                            {p.lastSuccessfulAt ? new Date(p.lastSuccessfulAt).toLocaleDateString() : 'Never'}
                          </span>
                        </div>

                        <div className="flex justify-between text-muted">
                          <span>Recent Ingested:</span>
                          <span className="font-medium text-ink">
                            {p.recordsInserted || 0} new · {p.recordsUpdated || 0} updated
                          </span>
                        </div>
                      </div>

                      {p.errorMessage && (
                        <div className={`mt-2 p-2 rounded text-xs border ${
                          isConfig
                            ? 'bg-amber-50/60 border-amber-200/80 text-amber-900'
                            : 'bg-rose-50/60 border-rose-200/80 text-rose-900'
                        }`}>
                          {p.errorMessage}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-line/40 flex items-center justify-between">
                      <span className="text-xs text-muted uppercase font-medium">Stream: {p.category}</span>
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={() => handleTriggerSync(p.source)}
                        className={`px-3 py-1 text-xs rounded border font-medium transition-colors ${
                          syncing
                            ? 'bg-line text-muted cursor-not-allowed border-line'
                            : 'border-line text-ink hover:border-ink hover:bg-paper'
                        }`}
                      >
                        {syncing ? 'Syncing...' : 'Sync Provider'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Paginated Synchronization History Section */}
        <div className="mt-8 pt-5 border-t border-line/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink uppercase tracking-wider">
                Synchronization History & Audit Logs
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Audit trail of scheduled and manual opportunity synchronization cycles.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="Filter sync logs by provider"
                value={filterSource}
                onChange={(e) => {
                  setFilterSource(e.target.value);
                  setHistoryPage(1);
                }}
                className="text-xs px-2.5 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none"
              >
                <option value="all">All Sources</option>
                <option value="devpost">Devpost</option>
                <option value="hopin">Hopin</option>
                <option value="remotive">Remotive</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="brabble">Brabble.ai</option>
                <option value="bodhdisha">BodhDisha</option>
                <option value="manual">Manual</option>
              </select>

              <select
                aria-label="Filter sync logs by execution status"
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setHistoryPage(1);
                }}
                className="text-xs px-2.5 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="PARTIAL_SUCCESS">Partial Success</option>
                <option value="FAILED">Failed</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="CONFIG_REQUIRED">Config Required</option>
              </select>
            </div>
          </div>

          {/* Sync History Table */}
          {historyLoading ? (
            <div className="py-8 text-center text-xs text-muted">
              Loading synchronization logs...
            </div>
          ) : !syncHistory?.logs || syncHistory.logs.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted border border-dashed border-line rounded">
              No synchronization logs found matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-canvas border-y border-line text-muted uppercase font-medium">
                  <tr>
                    <th className="py-2 px-2.5">Source</th>
                    <th className="py-2 px-2.5">Status</th>
                    <th className="py-2 px-2.5">Started</th>
                    <th className="py-2 px-2.5">Duration</th>
                    <th className="py-2 px-2.5">Fetched / Ingested</th>
                    <th className="py-2 px-2.5">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {syncHistory.logs.map((log) => {
                    const started = log.startedAt ? new Date(log.startedAt) : null;
                    const completed = log.completedAt ? new Date(log.completedAt) : null;
                    const durationSec = started && completed
                      ? ((completed - started) / 1000).toFixed(1)
                      : null;

                    let statusBadge = 'bg-gray-100 text-gray-700 border-gray-200';
                    if (log.status === 'SUCCESS') statusBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    else if (log.status === 'PARTIAL_SUCCESS') statusBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                    else if (log.status === 'FAILED') statusBadge = 'bg-rose-50 text-rose-800 border-rose-200';
                    else if (log.status === 'CONFIG_REQUIRED') statusBadge = 'bg-amber-50 text-amber-800 border-amber-200';

                    return (
                      <tr key={log._id || `${log.source}-${log.startedAt}`} className="hover:bg-canvas/50">
                        <td className="py-2 px-2.5 font-medium text-ink capitalize">
                          {log.source}
                          {log.category && <span className="text-[10px] text-muted block capitalize">{log.category}</span>}
                        </td>
                        <td className="py-2 px-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusBadge}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-muted whitespace-nowrap">
                          {started ? started.toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-2 px-2.5 text-muted">
                          {durationSec !== null ? `${durationSec}s` : 'Active'}
                        </td>
                        <td className="py-2 px-2.5 text-ink">
                          <span className="font-medium">{log.recordsFetched || 0}</span> fetched
                          <span className="text-muted block text-[10px]">
                            +{log.recordsInserted || 0} new · ~{log.recordsUpdated || 0} upd · {log.recordsSkipped || 0} skip
                          </span>
                        </td>
                        <td className="py-2 px-2.5 max-w-[200px] truncate text-muted" title={log.errorMessage || 'Completed normally'}>
                          {log.errorMessage ? (
                            <span className="text-rose-700 font-medium">{log.errorMessage}</span>
                          ) : (
                            <span className="text-ok">Completed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination bar */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-line/60 text-xs">
                <span className="text-muted">
                  Showing {((historyPage - 1) * 10) + 1}–{Math.min(historyPage * 10, syncHistory.pagination?.total || 0)} of {syncHistory.pagination?.total || 0} logs
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!syncHistory.pagination?.hasPrev || historyLoading}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-line hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    Previous
                  </button>
                  <span className="px-2 text-muted">
                    Page {historyPage} of {syncHistory.pagination?.totalPages || 1}
                  </span>
                  <button
                    type="button"
                    disabled={!syncHistory.pagination?.hasNext || historyLoading}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className="px-2.5 py-1 rounded border border-line hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Engagement Analytics Top Rankings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
        {/* Most Applied */}
        <div className="p-4 sm:p-5 rounded border border-line bg-paper">
          <h2 className="font-serif text-lg font-semibold text-ink mb-3 pb-2 border-b border-line/60">
            Top Applied Opportunities
          </h2>
          {(!analytics?.topApplied || analytics.topApplied.length === 0) ? (
            <p className="text-sm text-muted py-4">No student applications recorded yet.</p>
          ) : (
            <div className="divide-y divide-line/60">
              {analytics.topApplied.map((item, idx) => {
                // Backend now returns both _id and opportunityId — use whichever is available
                const oppId = item._id || item.opportunityId;
                return (
                  <div key={String(oppId) || idx} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="pr-2 min-w-0">
                      <Link
                        to={`/opportunity/${oppId}`}
                        className="font-medium text-ink hover:text-accent truncate block"
                      >
                        {item.title}
                      </Link>
                      <span className="text-xs text-muted">{item.organization || 'General'}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded bg-canvas border border-line font-medium text-accent shrink-0 text-xs">
                      {item.applicationsCount} applied
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Most Saved */}
        <div className="p-4 sm:p-5 rounded border border-line bg-paper">
          <h2 className="font-serif text-lg font-semibold text-ink mb-3 pb-2 border-b border-line/60">
            Top Bookmarked Opportunities
          </h2>
          {(!analytics?.topBookmarked || analytics.topBookmarked.length === 0) ? (
            <p className="text-sm text-muted py-4">No bookmarks recorded yet.</p>
          ) : (
            <div className="divide-y divide-line/60">
              {analytics.topBookmarked.map((item, idx) => {
                const oppId = item._id || item.opportunityId;
                return (
                  <div key={String(oppId) || idx} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="pr-2 min-w-0">
                      <Link
                        to={`/opportunity/${oppId}`}
                        className="font-medium text-ink hover:text-accent truncate block"
                      >
                        {item.title}
                      </Link>
                      <span className="text-xs text-muted">{item.organization || 'General'}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded bg-canvas border border-line font-medium text-ink shrink-0 text-xs">
                      {item.bookmarksCount} saved
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Application Status Distribution */}
      {analytics?.applicationStatusDistribution && Object.keys(analytics.applicationStatusDistribution).length > 0 && (
        <div className="my-8 p-4 sm:p-5 rounded border border-line bg-paper">
          <h2 className="font-serif text-lg font-semibold text-ink mb-3 pb-2 border-b border-line/60">
            Application Status Distribution
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(analytics.applicationStatusDistribution).map(([status, count]) => (
              <div key={status} className="p-3 rounded bg-canvas border border-line text-center">
                <span className="text-xs font-medium text-muted block mb-1">{status}</span>
                <span className="font-serif text-2xl font-semibold text-ink">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform-Wide Application Trends Timeline */}
      {analytics?.trends && analytics.trends.length > 0 && (
        <div className="my-8 p-4 sm:p-5 rounded border border-line bg-paper">
          <div className="pb-3 border-b border-line/60 mb-4">
            <h2 className="font-serif text-lg font-semibold text-ink">
              Platform-Wide Application Trends Over Time
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Monthly student submission volumes and distinct applicant scholars across EduConnect.
            </p>
          </div>

          <div className="space-y-3">
            {analytics.trends.map((trend) => {
              const maxTrendCount = Math.max(...analytics.trends.map(t => t.applicationCount), 1);
              const percent = Math.min(100, Math.round((trend.applicationCount / maxTrendCount) * 100));
              return (
                <div key={trend.period} className="text-xs sm:text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-ink font-medium">
                      {trend.period}
                    </span>
                    <span className="text-xs text-muted">
                      <span className="font-semibold text-accent">{trend.applicationCount}</span> {trend.applicationCount === 1 ? 'submission' : 'submissions'}
                      <span className="text-muted/70 ml-1.5">({trend.uniqueStudentsCount} unique {trend.uniqueStudentsCount === 1 ? 'student' : 'students'})</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-canvas rounded-full overflow-hidden border border-line/60">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-accent rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-muted mt-4 pt-3 border-t border-line/60 flex items-center justify-between">
            <span>Cumulative submissions: {totals.totalApplications || 0}</span>
            <span>Registered students: {totals.totalStudents || 0}</span>
          </div>
        </div>
      )}

      {/* Category Activity & Ingestion Breakdown */}
      {analytics?.categoryActivity && analytics.categoryActivity.length > 0 && (
        <div className="my-8 p-4 sm:p-5 rounded border border-line bg-paper">
          <div className="pb-3 border-b border-line/60 mb-4">
            <h2 className="font-serif text-lg font-semibold text-ink">
              Opportunity Stream Activity & Inventory
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Cumulative student submissions compared to available catalog listings by stream.
            </p>
          </div>

          <div className="space-y-3">
            {analytics.categoryActivity.map((cat) => {
              const maxCatCount = Math.max(...analytics.categoryActivity.map(c => c.applicationCount), 1);
              const percent = Math.min(100, Math.round((cat.applicationCount / maxCatCount) * 100));
              return (
                <div key={cat.category} className="text-xs sm:text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium capitalize text-ink">
                      {cat.category}
                    </span>
                    <span className="text-xs text-muted">
                      <span className="font-medium text-accent">{cat.applicationCount}</span> apps ({cat.uniqueStudentsCount} unique) · <span className="text-ink font-medium">{cat.availableOpportunitiesCount || 0}</span> in catalog
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-canvas rounded-full overflow-hidden border border-line/60">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-stone-700 rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform Summary */}
      <div className="my-8 p-4 sm:p-5 rounded border border-line bg-paper">
        <h2 className="font-serif text-lg font-semibold text-ink mb-3 pb-2 border-b border-line/60">
          Platform Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted">Registered Students:</span>
            <span className="font-semibold text-ink">{totals.totalStudents ?? 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Total Opportunities:</span>
            <span className="font-semibold text-ink">{totals.totalOpportunities || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Active Opportunities:</span>
            <span className="font-semibold text-ink">{totals.activeOpportunities || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Total Applications:</span>
            <span className="font-semibold text-ink">{totals.totalApplications || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Expired Opportunities:</span>
            <span className="font-semibold text-ink">{totals.expiredOpportunities || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">Total Bookmarks:</span>
            <span className="font-semibold text-ink">{totals.totalBookmarks || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
