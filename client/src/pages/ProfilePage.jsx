import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SkillSelect from '../components/SkillSelect';
import ResumeIntelligence from '../components/ResumeIntelligence';

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

export default function ProfilePage() {
  const { currentUser, studentProfile, updateProfile } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'Computer Science',
    year: 1,
    cgpa: 8.0,
    skills: [],
    interests: '',
    preferredTypes: '',
    preferredLocation: ''
  });

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
        cgpa: studentProfile.cgpa !== undefined ? studentProfile.cgpa : 8.0,
        skills: Array.isArray(studentProfile.skills) ? studentProfile.skills : [],
        interests: Array.isArray(studentProfile.interests) ? studentProfile.interests.join(', ') : (studentProfile.interests || ''),
        preferredTypes: studentProfile.preferredTypes || '',
        preferredLocation: studentProfile.preferredLocation || ''
      });
    } else if (currentUser) {
      setFormData(prev => ({
        ...prev,
        email: currentUser.email || ''
      }));
    }
  }, [studentProfile, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    const parsedInterests = typeof formData.interests === 'string'
      ? formData.interests
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : (Array.isArray(formData.interests) ? formData.interests : []);

    try {
      const res = await updateProfile({
        name: formData.name.trim(),
        department: formData.department,
        year: Number(formData.year),
        cgpa: Number(formData.cgpa),
        skills: Array.isArray(formData.skills) ? formData.skills : [],
        interests: parsedInterests,
        preferredTypes: formData.preferredTypes,
        preferredLocation: formData.preferredLocation ? formData.preferredLocation.trim() : ''
      });

      if (res.success) {
        setSuccessMsg('Profile saved.');
      } else {
        setErrorMsg(res.message || "We couldn't save your profile. Try again.");
      }
    } catch (err) {
      setErrorMsg("We couldn't save your profile. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-[448px] mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-semibold text-ink">Profile</h1>
        <p className="text-sm text-muted mt-1">
          Sign in to update your profile details and opportunity preferences.
        </p>

        <div className="mt-6 pt-4 border-t border-line">
          <Link
            to="/login"
            className="px-4 py-2 bg-accent text-white rounded-[4px] text-sm font-medium hover:bg-accent-hover transition-colors inline-block"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold text-ink">Profile & Resume</h1>
        <p className="text-sm text-muted mt-1">
          Manage your profile details, resume, and opportunity preferences.
        </p>
      </div>

      {/* Contained boxed form */}
      <div className="border border-line rounded-[4px] p-6 bg-paper">
        {successMsg && (
          <p className="text-sm text-ok mb-4" role="status">
            {successMsg}
          </p>
        )}

        {errorMsg && (
          <p className="text-sm text-bad mb-4" role="alert">
            {errorMsg}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              disabled
              value={formData.email}
              className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-muted cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="department"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Department
            </label>
            <select
              id="department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full text-sm sm:text-base px-2.5 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            >
              {DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="year"
                className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
              >
                Year of study
              </label>
              <select
                id="year"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                className="w-full text-sm sm:text-base px-2.5 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
              >
                <option value={1}>Year 1</option>
                <option value={2}>Year 2</option>
                <option value={3}>Year 3</option>
                <option value={4}>Year 4</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="cgpa"
                className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
              >
                CGPA
              </label>
              <input
                id="cgpa"
                type="number"
                step="0.01"
                min="0"
                max="10"
                required
                value={formData.cgpa}
                onChange={(e) => setFormData({ ...formData, cgpa: e.target.value })}
                className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>

          <div>
            <SkillSelect
              selectedSkills={formData.skills}
              onChange={(skills) => setFormData(prev => ({ ...prev, skills }))}
              label="Skills"
              helperText="Select or update your technical skills from the catalog."
            />
          </div>

          <div>
            <label
              htmlFor="interests"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Interests
            </label>
            <input
              id="interests"
              type="text"
              placeholder="Web Development, Machine Learning, Cloud"
              value={formData.interests}
              onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
              className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="preferredTypes"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Preferred opportunity types
            </label>
            <input
              id="preferredTypes"
              type="text"
              placeholder="Internship, Hackathon, Scholarship"
              value={formData.preferredTypes}
              onChange={(e) => setFormData({ ...formData, preferredTypes: e.target.value })}
              className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="preferredLocation"
              className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1.5"
            >
              Preferred location
            </label>
            <input
              id="preferredLocation"
              type="text"
              placeholder="Remote, Bengaluru, Hybrid"
              value={formData.preferredLocation}
              onChange={(e) => setFormData({ ...formData, preferredLocation: e.target.value })}
              className="w-full text-sm sm:text-base px-3 py-2 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div className="pt-3 border-t border-line flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Resume Management Section */}
      <ResumeIntelligence
        onSkillsUpdated={(newSkills) => {
          setFormData(prev => ({ ...prev, skills: newSkills }));
        }}
      />
    </div>
  );
}
