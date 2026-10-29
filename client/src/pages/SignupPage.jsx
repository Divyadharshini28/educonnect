import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import SkillSelect from '../components/SkillSelect';

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

export default function SignupPage() {
  const { registerStudent } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: 'Computer Science',
    year: 1,
    cgpa: 8.0,
    skills: [],
    interests: '',
    preferredLocation: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.password) {
      setError('Password is required.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const parsedInterests = formData.interests
      ? formData.interests
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    try {
      const res = await registerStudent({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        department: formData.department,
        year: Number(formData.year),
        cgpa: Number(formData.cgpa),
        skills: Array.isArray(formData.skills) ? formData.skills : [],
        interests: parsedInterests,
        preferredLocation: formData.preferredLocation ? formData.preferredLocation.trim() : ''
      });

      if (res.success) {
        navigate('/home');
      } else {
        setError(res.message || 'Registration failed. Please verify the information entered.');
      }
    } catch (err) {
      setError(err.message || 'Registration error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[448px] mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <span className="text-xs uppercase tracking-widest text-muted font-medium block mb-1">
          EduConnect
        </span>
        <h1 className="font-serif text-3xl font-semibold text-ink">
          Create account
        </h1>
      </div>

      <div className="border border-line rounded-[4px] p-6 sm:p-8 bg-paper">
        {error && (
          <p className="text-sm text-bad mb-4" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Confirm password
            </label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              required
              autoComplete="new-password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            />
          </div>

          <div>
            <label
              htmlFor="department"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Department
            </label>
            <select
              id="department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
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
                className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
              >
                Year of study
              </label>
              <select
                id="year"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
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
                className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
              >
                CGPA (0–10)
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
                className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>

          <div>
            <SkillSelect
              selectedSkills={formData.skills}
              onChange={(skills) => setFormData({ ...formData, skills })}
              label="Technical skills (optional)"
              helperText="Select skills you know. You can always change these later in your profile."
            />
          </div>

          <div>
            <label
              htmlFor="interests"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Interests (Optional)
            </label>
            <input
              id="interests"
              type="text"
              placeholder="e.g. Internships, Hackathons, Research"
              value={formData.interests}
              onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="preferredLocation"
              className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
            >
              Preferred location (Optional)
            </label>
            <input
              id="preferredLocation"
              type="text"
              placeholder="e.g. Remote, Bengaluru, Hybrid"
              value={formData.preferredLocation}
              onChange={(e) => setFormData({ ...formData, preferredLocation: e.target.value })}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover underline decoration-line font-medium"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
