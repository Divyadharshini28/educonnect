import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const TYPE_OPTIONS = [
  'internship',
  'hackathon',
  'scholarship',
  'certification',
  'workshop',
  'competition',
  'placement'
];

export default function AdminOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    organization: '',
    type: 'internship',
    deadline: '',
    location: '',
    description: '',
    stipendOrReward: '',
    officialUrl: '',
    department: '',
    minYear: 1,
    minCGPA: 0,
    skills: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadOpportunities = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await api.get('/opportunities', { params });
      if (res.data && res.data.opportunities) {
        setOpportunities(res.data.opportunities);
        setPagination({
          page: res.data.page,
          limit: res.data.limit,
          total: res.data.total,
          totalPages: res.data.totalPages
        });
      } else if (Array.isArray(res.data)) {
        setOpportunities(res.data);
        setPagination({ page: 1, limit: res.data.length, total: res.data.length, totalPages: 1 });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load opportunities catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOpportunities();
  }, [page, typeFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadOpportunities();
  };

  const handleStatusToggle = async (opp) => {
    const nextStatus = opp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/opportunities/${opp._id}/status`, { status: nextStatus });
      setSuccessMessage(`Updated status of "${opp.title}" to ${nextStatus}.`);
      loadOpportunities();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update opportunity status.');
    }
  };

  const handleDelete = async (opp) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate "${opp.title}"?`)) {
      return;
    }

    try {
      const res = await api.delete(`/opportunities/${opp._id}`);
      if (res.data?.isSoftDeleted) {
        setSuccessMessage(`Opportunity safely deactivated to preserve existing applications.`);
      } else {
        setSuccessMessage(`Opportunity deleted successfully.`);
      }
      loadOpportunities();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete opportunity.');
    }
  };

  const openCreateModal = () => {
    setEditingOpp(null);
    setFormData({
      title: '',
      organization: '',
      type: 'internship',
      deadline: '',
      location: '',
      description: '',
      stipendOrReward: '',
      officialUrl: '',
      department: '',
      minYear: 1,
      minCGPA: 0,
      skills: ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (opp) => {
    setEditingOpp(opp);
    const elig = opp.eligibility || {};
    const formattedDate = opp.deadline ? new Date(opp.deadline).toISOString().split('T')[0] : '';
    setFormData({
      title: opp.title || '',
      organization: opp.organization || '',
      type: opp.type || 'internship',
      deadline: formattedDate,
      location: opp.location || '',
      description: opp.description || '',
      stipendOrReward: opp.stipendOrReward || '',
      officialUrl: opp.officialUrl || '',
      department: Array.isArray(elig.department) ? elig.department.join(', ') : '',
      minYear: elig.minYear || 1,
      minCGPA: elig.minCGPA || 0,
      skills: Array.isArray(elig.skills) ? elig.skills.join(', ') : ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        title: formData.title.trim(),
        organization: formData.organization.trim(),
        type: formData.type,
        deadline: formData.deadline || null,
        location: formData.location.trim(),
        description: formData.description.trim(),
        stipendOrReward: formData.stipendOrReward.trim(),
        officialUrl: formData.officialUrl.trim(),
        eligibility: {
          department: formData.department
            ? formData.department.split(',').map(s => s.trim()).filter(Boolean)
            : [],
          minYear: Number(formData.minYear) || 1,
          minCGPA: Number(formData.minCGPA) || 0,
          skills: formData.skills
            ? formData.skills.split(',').map(s => s.trim()).filter(Boolean)
            : []
        }
      };

      if (editingOpp) {
        await api.put(`/opportunities/${editingOpp._id}`, payload);
        setSuccessMessage(`Opportunity "${payload.title}" updated successfully.`);
      } else {
        await api.post('/opportunities', payload);
        setSuccessMessage(`Opportunity "${payload.title}" created successfully.`);
      }

      setModalOpen(false);
      loadOpportunities();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save opportunity.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[768px] mx-auto px-4 py-10 text-ink">
      {/* Navigation header */}
      <div className="mb-6">
        <Link
          to="/admin"
          className="text-sm text-muted hover:text-ink underline decoration-line underline-offset-2 font-medium"
        >
          ← Return to administration overview
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <span className="text-xs font-semibold text-accent uppercase tracking-wider">
            Catalog Management
          </span>
          <h1 className="font-serif text-3xl font-semibold text-ink mt-1">
            Opportunities Directory
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent-hover font-medium transition-colors"
          >
            + Create Opportunity
          </button>
          <Link
            to="/admin/import"
            className="px-4 py-2 text-sm rounded border border-line hover:border-ink font-medium transition-colors"
          >
            Import CSV
          </Link>
        </div>
      </div>

      {successMessage && (
        <div className="my-4 p-3.5 rounded text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-emerald-600 hover:text-emerald-900 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="my-4 p-3.5 rounded text-sm bg-rose-50 border border-rose-200 text-rose-800">
          {error}
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="my-6 p-4 rounded bg-canvas border border-line space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Search by title, organization, or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3.5 py-2 text-sm rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="px-5 py-2 text-sm rounded bg-ink text-white font-medium hover:bg-ink/80 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted font-medium">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm rounded border border-line bg-paper text-ink"
            >
              <option value="">All Types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm rounded border border-line bg-paper text-ink"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table view */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted">
          Loading catalog entries...
        </div>
      ) : opportunities.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted border border-dashed border-line rounded">
          No opportunities match the selected criteria.
        </div>
      ) : (
        <div className="border border-line rounded overflow-x-auto bg-paper">
          <table className="w-full text-left text-sm divide-y divide-line">
            <thead className="bg-canvas text-muted text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3.5">Title & Organization</th>
                <th className="py-3 px-3.5">Type</th>
                <th className="py-3 px-3.5">Deadline</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {opportunities.map((opp) => {
                const deadlineDate = opp.deadline ? new Date(opp.deadline) : null;
                const isPast = deadlineDate ? deadlineDate < new Date() : false;
                const statusBadgeClass =
                  opp.status === 'ACTIVE' && !isPast
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : opp.status === 'INACTIVE'
                    ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200';

                return (
                  <tr key={opp._id} className="hover:bg-canvas/50 transition-colors">
                    <td className="py-3.5 px-3.5 min-w-[200px]">
                      <Link
                        to={`/opportunity/${opp._id}`}
                        className="font-medium text-ink hover:text-accent block"
                      >
                        {opp.title}
                      </Link>
                      <span className="text-xs text-muted">
                        {opp.organization || 'General Organization'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3.5 uppercase text-xs font-semibold text-muted">
                      {opp.type}
                    </td>
                    <td className="py-3.5 px-3.5 text-muted text-xs sm:text-sm">
                      {deadlineDate
                        ? deadlineDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Rolling'}
                    </td>
                    <td className="py-3.5 px-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-xs font-medium border ${statusBadgeClass}`}
                      >
                        {isPast && opp.status === 'ACTIVE' ? 'EXPIRED' : opp.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleStatusToggle(opp)}
                        className="text-xs px-2.5 py-1 rounded border border-line hover:border-ink font-medium"
                      >
                        {opp.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(opp)}
                        className="text-xs px-2.5 py-1 rounded bg-canvas border border-line hover:border-ink font-medium"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(opp)}
                        className="text-xs px-2.5 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-muted">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} opportunities)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`px-3.5 py-1.5 text-sm rounded border border-line ${
                pagination.page <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:border-ink'
              }`}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={`px-3.5 py-1.5 text-sm rounded border border-line ${
                pagination.page >= pagination.totalPages
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:border-ink'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-paper border border-line rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h2 className="font-serif text-lg font-semibold text-ink">
                {editingOpp ? 'Edit Opportunity' : 'Create New Opportunity'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 rounded text-xs bg-rose-50 border border-rose-200 text-rose-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-ink mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-ink mb-1">Organization *</label>
                  <input
                    type="text"
                    required
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-medium text-ink mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent uppercase"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-ink mb-1">Deadline</label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-medium text-ink mb-1">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Remote or Bengaluru"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-ink mb-1">Description *</label>
                <textarea
                  required
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-ink mb-1">Stipend or Reward</label>
                  <input
                    type="text"
                    placeholder="e.g. ₹25,000 / month"
                    value={formData.stipendOrReward}
                    onChange={(e) => setFormData({ ...formData, stipendOrReward: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-medium text-ink mb-1">Official Portal URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.officialUrl}
                    onChange={(e) => setFormData({ ...formData, officialUrl: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Eligibility Fields */}
              <div className="pt-3 border-t border-line space-y-3">
                <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block">
                  Eligibility Criteria
                </span>

                <div>
                  <label className="block text-ink mb-1">Eligible Departments (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science, Information Technology, MCA"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ink mb-1">Minimum Year</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={formData.minYear}
                      onChange={(e) => setFormData({ ...formData, minYear: e.target.value })}
                      className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-ink mb-1">Minimum CGPA</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={10}
                      value={formData.minCGPA}
                      onChange={(e) => setFormData({ ...formData, minCGPA: e.target.value })}
                      className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-ink mb-1">Required Skills (comma separated)</label>
                  <input
                    type="text"
                    placeholder="e.g. Python, SQL, React"
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-line bg-paper text-ink"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded border border-line hover:border-ink font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded bg-accent text-white hover:bg-accent-hover font-medium"
                >
                  {submitting ? 'Saving...' : editingOpp ? 'Update Opportunity' : 'Create Opportunity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
