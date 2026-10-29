import React from 'react';
import { NavLink, Link, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout({ children }) {
  const { studentProfile, currentUser, logoutStudent } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logoutStudent();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    isActive
      ? 'text-accent border-b-2 border-accent pb-1 font-semibold transition-colors'
      : 'text-muted hover:text-ink pb-1 border-b-2 border-transparent transition-colors font-medium';

  const userInitial = studentProfile?.name
    ? studentProfile.name.trim().charAt(0).toUpperCase()
    : currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : 'A';

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* Persistent Admin Header Shell */}
      <header className="border-b border-line bg-canvas/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[896px] mx-auto px-4">
          {/* Desktop Header Layout */}
          <div className="hidden sm:flex items-center justify-between h-16">
            {/* Brand + Portal Label */}
            <div className="flex items-center gap-3 shrink-0 mr-6">
              <Link
                to="/admin"
                className="font-serif text-[22px] font-semibold tracking-tight text-ink hover:text-accent transition-colors"
              >
                EduConnect
              </Link>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
                Admin Portal
              </span>
            </div>

            {/* Admin Persistent Navigation */}
            <nav className="flex items-center gap-7 text-[14px] sm:text-[15px]">
              <NavLink to="/admin" end className={navLinkClass}>
                Overview
              </NavLink>
              <NavLink to="/admin/opportunities" className={navLinkClass}>
                Opportunities
              </NavLink>
              <NavLink to="/admin/import" className={navLinkClass}>
                CSV Import
              </NavLink>
            </nav>

            {/* Portal Switcher & Admin Actions */}
            <div className="flex items-center gap-3 shrink-0 ml-6">
              <Link
                to="/home"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-line hover:border-ink bg-paper text-ink text-xs font-medium transition-colors"
                title="Return to Student Portal"
              >
                <span>← Student Portal</span>
              </Link>

              <div className="h-4 w-px bg-line" />

              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-xs font-semibold text-accent bg-paper"
                  title={currentUser?.email || 'Administrator'}
                >
                  {userInitial}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-muted hover:text-ink transition-colors text-xs font-medium"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Header Layout */}
          <div className="sm:hidden pt-3 pb-2">
            <div className="flex items-center justify-between pb-2.5">
              <div className="flex items-center gap-2">
                <Link
                  to="/admin"
                  className="font-serif text-lg font-semibold tracking-tight text-ink"
                >
                  EduConnect
                </Link>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
                  Admin
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Link
                  to="/home"
                  className="px-2 py-1 rounded border border-line text-xs font-medium text-ink bg-paper"
                >
                  ← Student Portal
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-muted hover:text-ink font-medium"
                >
                  Sign out
                </button>
              </div>
            </div>

            <nav className="flex items-center gap-4 text-xs font-medium pt-2 border-t border-line/60">
              <NavLink to="/admin" end className={navLinkClass}>
                Overview
              </NavLink>
              <NavLink to="/admin/opportunities" className={navLinkClass}>
                Opportunities
              </NavLink>
              <NavLink to="/admin/import" className={navLinkClass}>
                CSV Import
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Admin Page Content */}
      <main className="flex-1 pb-16">
        {children || <Outlet />}
      </main>

      {/* Admin Dedicated Footer */}
      <footer className="border-t border-line bg-canvas py-4 text-xs text-muted">
        <div className="max-w-[896px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>EduConnect Administrative Governance & Operations</span>
          <Link to="/home" className="hover:text-ink underline decoration-line">
            Switch to Student View
          </Link>
        </div>
      </footer>
    </div>
  );
}
