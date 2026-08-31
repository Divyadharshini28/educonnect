import React, { useState, useEffect } from 'react';
import { User, Save, CheckCircle2, AlertCircle, Plus, BookOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics & Communication',
  'Data Science',
  'Artificial Intelligence',
  'Software Engineering',
  'Mechanical',
  'Civil',
  'Electrical'
];

const SUGGESTED_SKILLS = [
  'React', 'Node.js', 'Express', 'MongoDB', 'Python', 'JavaScript',
  'Java', 'C++', 'SQL', 'Git', 'Machine Learning', 'Docker', 'AWS',
  'Data Structures', 'Algorithms', 'Tailwind CSS', 'Next.js'
];

const SUGGESTED_INTERESTS = [
  'Internships', 'Scholarships', 'Hackathons', 'Certifications',
  'Web Development', 'AI/ML', 'Cloud Computing', 'Competitive Programming',
  'Data Science', 'Open Source', 'Cybersecurity'
];

export default function ProfilePage({ onOpenAuth }) {
  const { currentUser, studentProfile, updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'Computer Science',
    year: 3,
    cgpa: 8.5,
    skills: [],
    interests: []
  });

  const [customSkill, setCustomSkill] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (studentProfile) {
      setFormData({
        name: studentProfile.name || '',
        email: studentProfile.email || currentUser?.email || '',
        department: studentProfile.department || 'Computer Science',
        year: studentProfile.year || 1,
        cgpa: studentProfile.cgpa !== undefined ? studentProfile.cgpa : 0,
        skills: studentProfile.skills || [],
        interests: studentProfile.interests || []
      });
    } else if (currentUser) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email || ''
      }));
    }
  }, [studentProfile, currentUser]);

  if (!currentUser && !studentProfile) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center">
        <div className="w-12 h-12 bg-brand-50 text-brand-800 rounded-lg flex items-center justify-center mx-auto mb-3 border border-brand-200">
          <User className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Student Authentication Required</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
          Sign in to configure your academic profile parameters and view matching opportunities.
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

  const handleToggleSkill = (skill) => {
    if (formData.skills.includes(skill)) {
      setFormData({ ...formData, skills: formData.skills.filter(s => s !== skill) });
    } else {
      setFormData({ ...formData, skills: [...formData.skills, skill] });
    }
  };

  const handleAddCustomSkill = (e) => {
    e.preventDefault();
    if (customSkill.trim() && !formData.skills.includes(customSkill.trim())) {
      setFormData({ ...formData, skills: [...formData.skills, customSkill.trim()] });
      setCustomSkill('');
    }
  };

  const handleToggleInterest = (interest) => {
    if (formData.interests.includes(interest)) {
      setFormData({ ...formData, interests: formData.interests.filter(i => i !== interest) });
    } else {
      setFormData({ ...formData, interests: [...formData.interests, interest] });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const res = await updateProfile({
        name: formData.name,
        department: formData.department,
        year: Number(formData.year),
        cgpa: Number(formData.cgpa),
        skills: formData.skills,
        interests: formData.interests
      });

      if (res.success) {
        setSuccessMsg('Academic profile updated successfully. Recommendation rankings have been refreshed.');
      } else {
        setErrorMsg(res.message);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update student profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-800 mb-1">
          <BookOpen className="w-4 h-4" />
          <span>Student Profile Configuration</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Academic Credentials & Recommendation Parameters
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          These attributes serve as hard criteria (Department, Year, CGPA) and feature vectors for Content-Based ML ranking.
        </p>
      </div>

      {successMsg && (
        <div className="mb-5 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-5">
        {/* Section 1: Academic Info */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 border-b border-slate-100 pb-1.5">
            1. Academic Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                disabled
                value={formData.email}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Branch</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
              >
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Year of Study</label>
                <select
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current CGPA</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={formData.cgpa}
                  onChange={(e) => setFormData({ ...formData, cgpa: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Technical Skills */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <span>2. Technical Skills</span>
            <span className="text-[11px] text-brand-800 font-semibold lowercase">
              {formData.skills.length} selected
            </span>
          </h3>
          <p className="text-[11px] text-slate-500 mb-2.5">
            Select technical skills. Term overlaps directly determine TF-IDF feature weights and rule matching scores.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {SUGGESTED_SKILLS.map((skill) => {
              const selected = formData.skills.includes(skill);
              return (
                <button
                  type="button"
                  key={skill}
                  onClick={() => handleToggleSkill(skill)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-brand-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {skill} {selected ? '✓' : '+'}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add other skill (e.g. Flutter, Kotlin)..."
              value={customSkill}
              onChange={(e) => setCustomSkill(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 flex-1 focus:outline-none focus:ring-1 focus:ring-brand-800"
            />
            <button
              type="button"
              onClick={handleAddCustomSkill}
              className="px-3.5 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-900 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
        </div>

        {/* Section 3: Opportunity Interests */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <span>3. Opportunity Interests</span>
            <span className="text-[11px] text-brand-800 font-semibold lowercase">
              {formData.interests.length} selected
            </span>
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_INTERESTS.map((interest) => {
              const selected = formData.interests.includes(interest);
              return (
                <button
                  type="button"
                  key={interest}
                  onClick={() => handleToggleInterest(interest)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-brand-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {interest} {selected ? '✓' : '+'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save Action */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-md bg-brand-800 hover:bg-brand-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{loading ? 'Saving Profile...' : 'Save Profile and Refresh Models'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
