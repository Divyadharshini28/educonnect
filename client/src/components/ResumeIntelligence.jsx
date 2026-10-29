import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function ResumeIntelligence({ onSkillsUpdated }) {
  const { refreshStudentProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [resumeData, setResumeData] = useState(null);
  const [cooldown, setCooldown] = useState(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Skill confirmation state
  const [selectedSkillsToConfirm, setSelectedSkillsToConfirm] = useState(new Set());
  const [newSkillInput, setNewSkillInput] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // Re-parsing state
  const [reparsing, setReparsing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Active accordion tabs
  const [expandedSection, setExpandedSection] = useState('skills');

  useEffect(() => {
    fetchResumeStatus();
  }, []);

  const fetchResumeStatus = async () => {
    setLoading(true);
    setUploadError('');
    try {
      const res = await api.get('/student/resume');
      if (res.data) {
        setResumeData(res.data.resume);
        setCooldown(res.data.cooldown);

        // Pre-select all extracted skills by default for easy confirmation
        const skills = res.data.resume?.extractedData?.skills || [];
        setSelectedSkillsToConfirm(new Set(skills));
      }
    } catch (err) {
      console.warn('Could not load resume data:', err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    setUploadError('');
    setUploadSuccess('');
    const file = e.target.files[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
      setUploadError('Only PDF (.pdf) and Microsoft Word (.docx) documents are accepted.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size exceeds the 5 MB limit. Please upload a smaller file.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a PDF or DOCX file to upload.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    formData.append('resume', selectedFile);

    try {
      const res = await api.post('/student/resume/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUploadSuccess('Resume uploaded and processed successfully.');
      setSelectedFile(null);
      // Reset input element
      const inputEl = document.getElementById('resume-file-input');
      if (inputEl) inputEl.value = '';

      // Reload resume details
      await fetchResumeStatus();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload resume. Please check file format and try again.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/student/resume/download', {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', resumeData?.filename || 'EduConnect_Resume.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to download resume file.');
    } finally {
      setDownloading(false);
    }
  };

  const handleRetryParse = async () => {
    setReparsing(true);
    setConfirmError('');
    try {
      const res = await api.post('/student/resume/retry-parse');
      await fetchResumeStatus();
      alert('Resume re-parsed successfully!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to re-parse resume.');
    } finally {
      setReparsing(false);
    }
  };

  const toggleSkillSelection = (skill) => {
    setSelectedSkillsToConfirm(prev => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const handleAddCustomSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (!trimmed) return;
    setSelectedSkillsToConfirm(prev => new Set([...prev, trimmed]));
    setNewSkillInput('');
  };

  const handleConfirmSkills = async () => {
    setConfirming(true);
    setConfirmSuccess('');
    setConfirmError('');

    const skillsArray = Array.from(selectedSkillsToConfirm);

    try {
      const res = await api.post('/student/resume/confirm-skills', {
        confirmedSkills: skillsArray
      });

      setConfirmSuccess(`Successfully confirmed ${skillsArray.length} skills! Your profile and recommendations have been updated.`);
      
      // Refresh AuthContext profile so navbar/profile page reflects newly confirmed skills
      if (refreshStudentProfile) {
        await refreshStudentProfile();
      }
      if (onSkillsUpdated) {
        onSkillsUpdated(res.data.allStudentSkills);
      }

      await fetchResumeStatus();
    } catch (err) {
      setConfirmError(err.response?.data?.message || 'Failed to confirm skills. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="border border-line rounded-[4px] p-6 bg-paper mt-6 text-center">
        <p className="text-sm text-muted">Loading resume details...</p>
      </div>
    );
  }

  const hasResume = Boolean(resumeData);
  const isInCooldown = cooldown?.inCooldown;
  const daysLeft = cooldown?.daysRemaining || 0;
  const nextDate = cooldown?.nextEligibleDate ? formatDate(cooldown.nextEligibleDate) : '';

  const extracted = resumeData?.extractedData || {};
  const extractedSkills = extracted.skills || [];
  const confirmedSkills = resumeData?.confirmedSkills || [];

  return (
    <div className="border border-line rounded-[4px] p-6 bg-paper mt-6">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-semibold text-ink">My Resume</h2>
          <p className="text-sm text-muted mt-1">
            Upload and manage your resume.
          </p>
        </div>
        {hasResume && (
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-[3px] uppercase tracking-wider ${
              resumeData.extractionStatus === 'SUCCESS'
                ? 'bg-ok/10 text-ok border border-ok/20'
                : resumeData.extractionStatus === 'PARSED_EMPTY'
                ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                : 'bg-bad/10 text-bad border border-bad/20'
            }`}
          >
            {resumeData.extractionStatus === 'SUCCESS'
              ? 'Processed'
              : resumeData.extractionStatus === 'PARSED_EMPTY'
              ? 'Review Needed'
              : 'Notice'}
          </span>
        )}
      </div>

      {/* Replacement Restriction Notice */}
      {isInCooldown && (
        <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-[4px] flex items-start gap-3">
          <div className="text-amber-600 text-base mt-0.5 font-bold">🔒</div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-800">Resume replacement period active</h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              You can upload a new resume after your current replacement period ends.
              You have <strong>{daysLeft} days remaining</strong>. Next eligible upload:{' '}
              <span className="font-medium underline">{nextDate}</span>.
            </p>
            <p className="text-xs text-amber-700 mt-1.5 italic">
              Tip: You can update your confirmed skills below anytime without uploading a new document.
            </p>
          </div>
        </div>
      )}

      {/* Current Resume Metadata Card */}
      {hasResume ? (
        <div className="mb-5 bg-paper-2 border border-line rounded-[4px] p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">📄</span>
                <span className="text-sm font-semibold text-ink break-all">{resumeData.filename}</span>
              </div>
              <div className="text-xs text-muted mt-1 space-x-3">
                <span>Size: {formatFileSize(resumeData.size)}</span>
                <span>•</span>
                <span>Uploaded: {formatDate(resumeData.uploadedAt)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-medium border border-line rounded-[4px] bg-paper text-ink hover:bg-paper-2 transition-colors disabled:opacity-50"
              >
                {downloading ? 'Downloading...' : '📥 Download File'}
              </button>

              <button
                type="button"
                onClick={handleRetryParse}
                disabled={reparsing}
                title="Re-scan your current resume to refresh identified skills"
                className="px-3.5 py-1.5 text-xs sm:text-sm font-medium border border-line rounded-[4px] bg-paper text-ink hover:bg-paper-2 transition-colors disabled:opacity-50"
              >
                {reparsing ? 'Analyzing...' : '🔄 Re-scan Resume'}
              </button>
            </div>
          </div>

          {resumeData.extractionStatus === 'PARSED_EMPTY' && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-[4px] text-xs text-amber-800 leading-relaxed">
              ⚠️ <strong>Scanned document notice:</strong> We couldn&apos;t detect selectable text from this document. If this is an image-based scan, please consider uploading a text-searchable PDF or DOCX file.
            </div>
          )}

          {resumeData.extractionError && resumeData.extractionStatus === 'FAILED' && (
            <div className="mt-3 p-3 bg-bad/10 border border-bad/20 rounded-[4px] text-xs text-bad leading-relaxed">
              ❌ Notice: {resumeData.extractionError}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-5 p-5 border border-dashed border-line rounded-[4px] text-center bg-paper-2">
          <p className="text-sm text-muted">No resume uploaded yet. Upload your PDF or DOCX resume to extract skills and enhance your recommendations.</p>
        </div>
      )}

      {/* Upload Box (Disabled during replacement period) */}
      <form onSubmit={handleUploadSubmit} className="mb-6">
        <label className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5">
          {hasResume ? 'Replace Resume (PDF or DOCX)' : 'Upload Resume (PDF or DOCX)'}
        </label>

        {uploadSuccess && (
          <p className="text-sm text-ok mb-3" role="status">
            {uploadSuccess}
          </p>
        )}
        {uploadError && (
          <p className="text-sm text-bad mb-3" role="alert">
            {uploadError}
          </p>
        )}

        <div className={`p-4 border border-line rounded-[4px] bg-paper flex flex-col sm:flex-row items-center gap-3 ${isInCooldown ? 'opacity-50 bg-paper-2 cursor-not-allowed' : ''}`}>
          <input
            id="resume-file-input"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={isInCooldown || uploading}
            onChange={handleFileChange}
            className="w-full text-xs sm:text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-[4px] file:border file:border-line file:text-xs sm:file:text-sm file:font-medium file:bg-paper-2 file:text-ink hover:file:bg-paper file:cursor-pointer disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={isInCooldown || uploading || !selectedFile}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-[4px] bg-accent text-white hover:bg-accent-hover transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Processing Resume...' : hasResume ? 'Replace Resume' : 'Upload Resume'}
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          Supported formats: <strong>.pdf</strong>, <strong>.docx</strong> (maximum size: 5 MB). Your resume is stored securely and linked to your account.
        </p>
      </form>

      {/* Extracted Intelligence & Skill Confirmation Section */}
      {hasResume && (
        <div className="pt-5 border-t border-line">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-serif text-lg sm:text-xl font-semibold text-ink">
              Skills from Your Resume
            </h3>
            <span className="text-xs text-muted font-medium">
              {selectedSkillsToConfirm.size} skills selected
            </span>
          </div>

          <p className="text-sm text-muted mb-4 leading-relaxed">
            Review the skills identified in your resume. Check or uncheck skills below, or add any missing ones. Click <strong>Confirm & Save Skills</strong> to update your profile and improve your recommendations.
          </p>

          {confirmSuccess && (
            <p className="text-sm text-ok mb-3" role="status">
              {confirmSuccess}
            </p>
          )}
          {confirmError && (
            <p className="text-sm text-bad mb-3" role="alert">
              {confirmError}
            </p>
          )}

          {/* Skill Tag Pills */}
          <div className="p-3.5 border border-line rounded-[4px] bg-paper-2 mb-4">
            <div className="text-xs font-semibold text-ink mb-2">Identified & Suggested Skills:</div>
            {extractedSkills.length === 0 ? (
              <p className="text-xs text-muted italic">
                No technical skills could be detected automatically. You can add your skills below.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {extractedSkills.map(skill => {
                  const isSelected = selectedSkillsToConfirm.has(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkillSelection(skill)}
                      className={`text-xs sm:text-sm px-3 py-1 rounded-[3px] border transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-accent text-white border-accent'
                          : 'bg-paper text-muted border-line hover:text-ink hover:border-ink'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{skill}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add Custom Skill Field */}
            <div className="mt-3 pt-3 border-t border-line flex items-center gap-2">
              <input
                type="text"
                placeholder="Add missing skill (e.g. Next.js, Docker)..."
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomSkill(e); }}
                className="flex-1 text-sm px-3 py-1.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomSkill}
                className="px-3.5 py-1.5 text-xs sm:text-sm font-medium border border-line rounded-[4px] bg-paper text-ink hover:bg-paper-2"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Action to Confirm */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
            <div className="text-xs text-muted">
              {confirmedSkills.length > 0 ? (
                <span>
                  Currently saved in profile: <strong>{confirmedSkills.join(', ')}</strong>
                </span>
              ) : (
                <span>No resume skills confirmed yet.</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirmSkills}
              disabled={confirming || selectedSkillsToConfirm.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-[4px] bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {confirming ? 'Saving to Profile...' : `Confirm & Save ${selectedSkillsToConfirm.size} Skills`}
            </button>
          </div>

          {/* Collapsible Intelligence Insights (Education, Experience, Projects) */}
          <div className="border border-line rounded-[4px] divide-y divide-line">
            {/* Education Snippets */}
            {extracted.education && extracted.education.length > 0 && (
              <div className="p-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === 'edu' ? '' : 'edu')}
                  className="w-full flex items-center justify-between text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span>🎓 Education ({extracted.education.length})</span>
                  <span className="text-xs">{expandedSection === 'edu' ? '▲' : '▼'}</span>
                </button>
                {expandedSection === 'edu' && (
                  <ul className="mt-2 text-xs sm:text-sm text-muted list-disc list-inside space-y-1">
                    {extracted.education.map((item, idx) => (
                      <li key={idx} className="break-words">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Experience Snippets */}
            {extracted.experience && extracted.experience.length > 0 && (
              <div className="p-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === 'exp' ? '' : 'exp')}
                  className="w-full flex items-center justify-between text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span>💼 Experience & Internships ({extracted.experience.length})</span>
                  <span className="text-xs">{expandedSection === 'exp' ? '▲' : '▼'}</span>
                </button>
                {expandedSection === 'exp' && (
                  <ul className="mt-2 text-xs sm:text-sm text-muted list-disc list-inside space-y-1">
                    {extracted.experience.map((item, idx) => (
                      <li key={idx} className="break-words">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Projects Snippets */}
            {extracted.projects && extracted.projects.length > 0 && (
              <div className="p-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === 'proj' ? '' : 'proj')}
                  className="w-full flex items-center justify-between text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span>🚀 Projects ({extracted.projects.length})</span>
                  <span className="text-xs">{expandedSection === 'proj' ? '▲' : '▼'}</span>
                </button>
                {expandedSection === 'proj' && (
                  <ul className="mt-2 text-xs sm:text-sm text-muted list-disc list-inside space-y-1">
                    {extracted.projects.map((item, idx) => (
                      <li key={idx} className="break-words">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Certifications */}
            {extracted.certifications && extracted.certifications.length > 0 && (
              <div className="p-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === 'cert' ? '' : 'cert')}
                  className="w-full flex items-center justify-between text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span>📜 Certifications ({extracted.certifications.length})</span>
                  <span className="text-xs">{expandedSection === 'cert' ? '▲' : '▼'}</span>
                </button>
                {expandedSection === 'cert' && (
                  <ul className="mt-2 text-xs sm:text-sm text-muted list-disc list-inside space-y-1">
                    {extracted.certifications.map((item, idx) => (
                      <li key={idx} className="break-words">{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Keywords */}
            {extracted.keywords && extracted.keywords.length > 0 && (
              <div className="p-3.5">
                <button
                  type="button"
                  onClick={() => setExpandedSection(expandedSection === 'keywords' ? '' : 'keywords')}
                  className="w-full flex items-center justify-between text-left text-sm font-medium text-ink hover:text-accent"
                >
                  <span>🔑 Key Highlights ({extracted.keywords.length})</span>
                  <span className="text-xs">{expandedSection === 'keywords' ? '▲' : '▼'}</span>
                </button>
                {expandedSection === 'keywords' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {extracted.keywords.map((kw, idx) => (
                      <span key={idx} className="text-xs px-2.5 py-1 rounded-[3px] bg-paper-2 border border-line text-ink font-medium">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
