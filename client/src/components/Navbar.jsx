import React from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';

export default function Navbar() {
  const { studentProfile, currentUser, isAdmin, logoutStudent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If in the Admin Portal, suppress the student Navbar in favor of AdminLayout
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  const handleSignOut = async () => {
    await logoutStudent();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    isActive
      ? 'text-accent border-b-2 border-accent pb-1 font-medium transition-colors'
      : 'text-muted hover:text-ink pb-1 border-b-2 border-transparent transition-colors';

  const userInitial = studentProfile?.name
    ? studentProfile.name.trim().charAt(0).toUpperCase()
    : currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'S';

  return (
    <header className="border-b border-line bg-paper sticky top-0 z-30">
      <div className="max-w-[768px] mx-auto px-4">
        {/* Desktop Header Layout */}
        <div className="hidden sm:flex items-center justify-between h-16">
          {/* Brand Wordmark */}
          <Link
            to="/home"
            className="font-serif text-[22px] font-semibold tracking-tight text-ink hover:text-accent transition-colors shrink-0 mr-8"
          >
            EduConnect
          </Link>

          {/* Primary Navigation — 14–15px, comfortable 24–28px spacing */}
          <nav className="flex items-center gap-6 sm:gap-7 text-[14px] sm:text-[15px] font-medium">
            <NavLink to="/home" className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/recommended" className={navLinkClass}>
              Recommended
            </NavLink>
            <NavLink to="/browse" className={navLinkClass}>
              Browse
            </NavLink>
            <NavLink to="/applications" className={navLinkClass}>
              Applications
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              Analytics
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>

          {/* Profile & Account Actions */}
          <div className="flex items-center gap-3.5 shrink-0 ml-8">
            {currentUser ? (
              <>
                <NotificationCenter />
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-muted hover:text-ink transition-colors text-[14px] sm:text-[15px] font-medium"
                  title="View student profile"
                >
                  <span className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-xs font-semibold text-ink bg-paper">
                    {userInitial}
                  </span>
                  <span>Profile</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-muted hover:text-ink transition-colors text-sm font-medium ml-1"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3 text-[14px] sm:text-[15px] font-medium">
                <Link
                  to="/login"
                  className="text-muted hover:text-ink transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="text-accent hover:text-accent-hover font-medium transition-colors"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Header Layout — Clean 2-Row Editorial Navigation */}
        <div className="sm:hidden pt-3 pb-2">
          {/* Top Row: Wordmark + Profile / Sign in */}
          <div className="flex items-center justify-between pb-2.5">
            <Link
              to="/home"
              className="font-serif text-xl font-semibold tracking-tight text-ink hover:text-accent transition-colors"
            >
              EduConnect
            </Link>

            <div className="flex items-center gap-3 text-sm">
              {currentUser ? (
                <>
                  <NotificationCenter />
                  <Link
                    to="/profile"
                    className="flex items-center gap-1.5 text-muted hover:text-ink font-medium"
                  >
                    <span className="w-6 h-6 rounded-full border border-line flex items-center justify-center text-xs font-medium text-ink bg-paper">
                      {userInitial}
                    </span>
                    <span>Profile</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-muted hover:text-ink text-sm font-medium"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm font-medium">
                  <Link to="/login" className="text-muted hover:text-ink">
                    Sign in
                  </Link>
                  <Link to="/signup" className="text-accent font-medium">
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Row: Full 14px Readable Navigation Links with active underline */}
          <nav className="flex items-center justify-between text-[14px] font-medium pt-2 border-t border-line/60 overflow-x-auto gap-4">
            <NavLink to="/home" className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/recommended" className={navLinkClass}>
              Recommended
            </NavLink>
            <NavLink to="/browse" className={navLinkClass}>
              Browse
            </NavLink>
            <NavLink to="/applications" className={navLinkClass}>
              Applications
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass}>
              Analytics
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
