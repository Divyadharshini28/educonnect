import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Award, 
  Briefcase, 
  Code, 
  BookOpen, 
  ArrowRight, 
  Compass,
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage({ onOpenAuth }) {
  const { studentProfile } = useAuth();

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200 py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight sm:leading-tight">
            Unified Student Opportunity Platform
          </h1>

          <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Discover verified scholarships, technical internships, national hackathons, and accredited industry certifications tailored to your academic profile and technical skills.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {studentProfile ? (
              <Link
                to="/recommendations"
                className="px-5 py-2.5 rounded-md bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Layers className="w-4 h-4" />
                <span>View Recommended Opportunities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/opportunities"
                className="px-5 py-2.5 rounded-md bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Compass className="w-4 h-4" />
                <span>Explore Opportunities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4 Opportunity Streams */}
      <section className="py-14 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Explore By Category
            </h2>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              Four Core Opportunity Streams
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/opportunities" className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-colors block">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center mb-3 border border-blue-200">
                <Award className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Scholarships</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                National portal schemes, corporate foundations, and merit-based academic grants.
              </p>
            </Link>

            <Link to="/opportunities" className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-colors block">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-800 flex items-center justify-center mb-3 border border-indigo-200">
                <Briefcase className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Internships</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Technical internships across software engineering, data science, cloud, and AI/ML.
              </p>
            </Link>

            <Link to="/opportunities" className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-colors block">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-3 border border-slate-300">
                <Code className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Hackathons</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                National innovation challenges, corporate hackathons, and global sprint competitions.
              </p>
            </Link>

            <Link to="/opportunities" className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs hover:border-brand-300 transition-colors block">
              <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-800 flex items-center justify-center mb-3 border border-sky-200">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Certifications</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cloud practitioner vouchers, university credit courses, and technical accreditations.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
