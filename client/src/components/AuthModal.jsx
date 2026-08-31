import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User } from 'lucide-react';
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

const COMMON_SKILLS = [
  'React', 'Node.js', 'Python', 'JavaScript', 'MongoDB', 'SQL',
  'Git', 'C++', 'Java', 'Machine Learning', 'Docker', 'AWS'
];

const INTEREST_AREAS = [
  'Internships', 'Hackathons', 'Scholarships', 'Certifications',
  'Web Development', 'AI/ML', 'Cloud Computing', 'Competitive Programming'
];

export default function AuthModal({ isOpen, onClose, initialTab = 'login' }) {
  const { loginStudent, registerStudent } = useAuth();
  const [isRegister, setIsRegister] = useState(initialTab === 'register');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [year, setYear] = useState('3');
  const [cgpa, setCgpa] = useState('8.5');
  const [skills, setSkills] = useState(['React', 'Node.js', 'JavaScript']);
  const [interests, setInterests] = useState(['Internships', 'Web Development', 'Hackathons']);

  useEffect(() => {
    setIsRegister(initialTab === 'register');
    setError('');
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const toggleSkill = (skill) => {
    if (skills.includes(skill)) {
      setSkills(skills.filter(s => s !== skill));
    } else {
      setSkills([...skills, skill]);
    }
  };

  const toggleInterest = (interest) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter(i => i !== interest));
    } else {
      setInterests([...interests, interest]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await registerStudent({
          name,
          email,
          password,
          department,
          year: Number(year),
          cgpa: Number(cgpa),
          skills,
          interests
        });
        if (res.success) {
          onClose();
        } else {
          setError(res.message);
        }
      } else {
        const res = await loginStudent(email, password);
        if (res.success) {
          onClose();
        } else {
          setError(res.message);
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab switch */}
        <div className="flex bg-slate-100 p-1 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              !isRegister ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              isRegister ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register Student
          </button>
        </div>

        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">
            {isRegister ? 'Create Student Profile' : 'Student Portal Authentication'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isRegister 
              ? 'Complete registration to initialize your personalized recommendation parameters.'
              : 'Enter your credentials to access your opportunities dashboard.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="Student Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800 focus:border-brand-800"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              University / Student Email *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                placeholder="student@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800 focus:border-brand-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-800 focus:border-brand-800"
              />
            </div>
          </div>

          {/* Academic credentials for registration */}
          {isRegister && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full text-xs py-2 px-2 rounded-lg border border-slate-300 bg-white"
                  >
                    {DEPARTMENTS.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Year of Study
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full text-xs py-2 px-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    CGPA (0 - 10)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={cgpa}
                    onChange={(e) => setCgpa(e.target.value)}
                    className="w-full text-xs py-2 px-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Select Technical Skills
                </label>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  {COMMON_SKILLS.map(skill => {
                    const selected = skills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={skill}
                        onClick={() => toggleSkill(skill)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          selected
                            ? 'bg-brand-800 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interests */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Opportunity Interests
                </label>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  {INTEREST_AREAS.map(interest => {
                    const selected = interests.includes(interest);
                    return (
                      <button
                        type="button"
                        key={interest}
                        onClick={() => toggleInterest(interest)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          selected
                            ? 'bg-brand-800 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {interest}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50 mt-3"
          >
            {loading ? 'Processing...' : isRegister ? 'Register and Initialize Profile' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
