import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import LandingPage from './pages/LandingPage';
import RecommendationsPage from './pages/RecommendationsPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ProfilePage from './pages/ProfilePage';
import { GraduationCap } from 'lucide-react';

function AppContent() {
  const [authModalState, setAuthModalState] = useState({ isOpen: false, tab: 'login' });
  const { studentProfile } = useAuth();

  const handleOpenAuth = (tab = 'login') => {
    setAuthModalState({ isOpen: true, tab });
  };

  const handleCloseAuth = () => {
    setAuthModalState({ isOpen: false, tab: 'login' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar onOpenAuth={handleOpenAuth} />

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage onOpenAuth={handleOpenAuth} />} />
          <Route path="/recommendations" element={<RecommendationsPage onOpenAuth={handleOpenAuth} />} />
          <Route path="/opportunities" element={<OpportunitiesPage onOpenAuth={handleOpenAuth} />} />
          <Route path="/applications" element={<ApplicationsPage onOpenAuth={handleOpenAuth} />} />
          <Route path="/profile" element={<ProfilePage onOpenAuth={handleOpenAuth} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <AuthModal 
        isOpen={authModalState.isOpen} 
        initialTab={authModalState.tab} 
        onClose={handleCloseAuth} 
      />

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-brand-800" />
            <span className="font-semibold text-slate-800">EduConnect</span>
            <span>- Unified Student Opportunity Platform</span>
          </div>

          <div className="text-slate-400">
            <span>&copy; {new Date().getFullYear()} EduConnect. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}
