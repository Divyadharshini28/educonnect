import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import AdminLayout from './components/AdminLayout';
import HomePage from './pages/HomePage';
import RecommendationsPage from './pages/RecommendationsPage';
import BrowsePage from './pages/BrowsePage';
import OpportunityDetailPage from './pages/OpportunityDetailPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminOpportunitiesPage from './pages/AdminOpportunitiesPage';
import AdminCsvImportPage from './pages/AdminCsvImportPage';
import StudentAnalyticsPage from './pages/StudentAnalyticsPage';

function LoadingScreen() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8">
      <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin mb-4" />
      <p className="text-xs uppercase tracking-widest text-muted font-medium">
        Loading EduConnect...
      </p>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return <LoadingScreen />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { currentUser, isAdmin, loading } = useAuth();
  if (loading) {
    return <LoadingScreen />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return <LoadingScreen />;
  }
  if (currentUser) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function RootRoute() {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return <LoadingScreen />;
  }
  return currentUser ? <Navigate to="/home" replace /> : <Navigate to="/login" replace />;
}

function AppContent() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <Navbar />

      <main className={`flex-1 ${isAdminPath ? '' : 'pb-16'}`}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/recommended" element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>} />
          <Route path="/recommendations" element={<Navigate to="/recommended" replace />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/opportunities" element={<Navigate to="/browse" replace />} />
          <Route path="/opportunity/:id" element={<ProtectedRoute><OpportunityDetailPage /></ProtectedRoute>} />
          <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><StudentAnalyticsPage /></ProtectedRoute>} />
          <Route path="/insights" element={<Navigate to="/analytics" replace />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminLayout><AdminDashboardPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/opportunities" element={<AdminRoute><AdminLayout><AdminOpportunitiesPage /></AdminLayout></AdminRoute>} />
          <Route path="/admin/import" element={<AdminRoute><AdminLayout><AdminCsvImportPage /></AdminLayout></AdminRoute>} />
          <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
          <Route path="/signup" element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
          <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
          <Route path="*" element={<RootRoute />} />
        </Routes>
      </main>

      {!isAdminPath && (
        <footer className="border-t border-line bg-paper py-6 text-xs text-muted">
          <div className="max-w-[768px] mx-auto px-4 flex flex-col sm:flex-row items-baseline justify-between gap-2">
            <span>EduConnect — Unified Student Opportunity Platform</span>
            <span>Academic Opportunity Index</span>
          </div>
        </footer>
      )}
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
