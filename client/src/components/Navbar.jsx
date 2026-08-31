import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Compass, 
  FileText, 
  User, 
  LogOut, 
  Layers,
  GraduationCap
} from 'lucide-react';

export default function Navbar({ onOpenAuth }) {
  const { studentProfile, logoutStudent } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-lg bg-brand-800 flex items-center justify-center text-white shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold text-slate-900 tracking-tight">EduConnect</span>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:block leading-none">
                  Student Opportunity Platform
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          {studentProfile ? (
            <div className="hidden md:flex items-center space-x-1">
              <Link
                to="/recommendations"
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  isActive('/recommendations')
                    ? 'bg-brand-50 text-brand-800 border border-brand-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-4 h-4 text-brand-700" />
                <span>Recommendations</span>
              </Link>

              <Link
                to="/opportunities"
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  isActive('/opportunities')
                    ? 'bg-brand-50 text-brand-800 border border-brand-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Compass className="w-4 h-4 text-slate-500" />
                <span>Opportunity Catalog</span>
              </Link>

              <Link
                to="/applications"
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  isActive('/applications')
                    ? 'bg-brand-50 text-brand-800 border border-brand-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>My Applications</span>
              </Link>

              <Link
                to="/profile"
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                  isActive('/profile')
                    ? 'bg-brand-50 text-brand-800 border border-brand-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <User className="w-4 h-4 text-slate-500" />
                <span>Profile Setup</span>
              </Link>
            </div>
          ) : (
            <div className="hidden md:flex items-center space-x-4 text-xs font-semibold text-slate-600">
              <Link to="/opportunities" className="hover:text-brand-800 transition-colors">
                Explore Catalog
              </Link>
            </div>
          )}

          {/* User actions */}
          <div className="flex items-center space-x-3">
            {studentProfile ? (
              <div className="flex items-center space-x-3">
                <Link 
                  to="/profile" 
                  className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-800 font-bold text-xs flex items-center justify-center border border-brand-200">
                    {studentProfile.name ? studentProfile.name.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <div className="hidden lg:block text-xs">
                    <p className="font-semibold text-slate-800 leading-tight">{studentProfile.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {studentProfile.department || 'Student'} • CGPA {studentProfile.cgpa ? Number(studentProfile.cgpa).toFixed(2) : '0.00'}
                    </p>
                  </div>
                </Link>

                <button
                  onClick={logoutStudent}
                  title="Sign Out"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 shadow-sm transition-colors"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
