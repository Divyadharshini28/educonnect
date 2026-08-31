import React, { useState } from 'react';
import { 
  Building2, 
  Calendar, 
  Award, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';

const TYPE_CONFIG = {
  scholarship: { label: 'Scholarship', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  internship: { label: 'Internship', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  hackathon: { label: 'Hackathon', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  certification: { label: 'Certification', badge: 'bg-sky-50 text-sky-800 border-sky-200' }
};

export default function OpportunityCard({ 
  opportunity, 
  recommendation, 
  onApply, 
  isApplied = false
}) {
  const [showExplanation, setShowExplanation] = useState(false);

  const typeInfo = TYPE_CONFIG[opportunity.type] || { 
    label: opportunity.type, 
    badge: 'bg-slate-100 text-slate-700 border-slate-200' 
  };

  const deadlineDate = new Date(opportunity.deadline);
  const isExpired = deadlineDate < new Date();
  const formattedDeadline = deadlineDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const matchScore = recommendation?.score || 0;
  const matchReasons = recommendation?.matchReasons || [];
  const isEligible = recommendation ? recommendation.eligibilityStatus === 'Eligible' : true;

  const getScoreBadge = (score) => {
    if (score >= 75) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    if (score >= 50) return 'bg-brand-50 text-brand-800 border-brand-300';
    if (score >= 30) return 'bg-amber-50 text-amber-800 border-amber-300';
    return 'bg-rose-50 text-rose-800 border-rose-300';
  };

  return (
    <div className={`bg-white rounded-xl border transition-shadow duration-150 hover:shadow-md flex flex-col ${
      recommendation && matchScore >= 65 
        ? 'border-brand-300 shadow-sm' 
        : 'border-slate-200'
    }`}>
      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${typeInfo.badge}`}>
              {typeInfo.label}
            </span>
            {opportunity.organization && (
              <span className="text-xs text-slate-600 font-medium flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {opportunity.organization}
              </span>
            )}
          </div>

          {/* Match Score */}
          {recommendation && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getScoreBadge(matchScore)}`}>
              {matchScore}% Match
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 mb-2 leading-snug">
          {opportunity.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-600 mb-4 line-clamp-2 leading-relaxed">
          {opportunity.description}
        </p>

        {/* Highlights */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <div className="flex items-center gap-1.5 truncate">
            <Award className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span className="truncate font-medium">{opportunity.stipendOrReward || 'Certification / Award'}</span>
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{opportunity.location || 'Remote'}</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className={isExpired ? 'text-rose-600 font-medium' : 'text-slate-600'}>
              Deadline: {formattedDeadline} {isExpired ? '(Expired)' : ''}
            </span>
          </div>
        </div>

        {/* Eligibility Criteria */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Eligibility Requirements
          </p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              Dept: {(opportunity.eligibility?.department || ['All']).join(', ')}
            </span>
            {opportunity.eligibility?.minYear > 1 && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Min Year: {opportunity.eligibility.minYear}
              </span>
            )}
            {opportunity.eligibility?.minCGPA > 0 && (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Min CGPA: {opportunity.eligibility.minCGPA.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Skills */}
        {opportunity.eligibility?.skills?.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Required Skills
            </p>
            <div className="flex flex-wrap gap-1">
              {opportunity.eligibility.skills.map((skill, idx) => (
                <span 
                  key={idx} 
                  className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 text-[11px] font-medium border border-brand-100"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation Breakdown */}
        {recommendation && matchReasons.length > 0 && (
          <div className="mt-auto pt-3 border-t border-slate-100">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="w-full flex items-center justify-between text-xs font-semibold text-brand-800 hover:text-brand-900 transition-colors py-1"
            >
              <span>Match Details & Eligibility</span>
              {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showExplanation && (
              <div className="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold mb-1 text-slate-800">
                  {isEligible ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>{isEligible ? 'Eligible for this opportunity' : 'Eligibility criteria not met'}</span>
                </div>
                {matchReasons.map((reason, idx) => {
                  const isIneligible = reason.toLowerCase().includes('ineligible') || reason.toLowerCase().includes('violation');
                  return (
                    <div 
                      key={idx} 
                      className={`flex items-start gap-1 text-[11px] leading-snug ${
                        isIneligible ? 'text-rose-700 font-medium' : 'text-slate-600'
                      }`}
                    >
                      <span className="text-[9px] mt-0.5">-</span>
                      <span>{reason}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-100 rounded-b-xl flex items-center justify-between">
        {opportunity.officialUrl ? (
          <a
            href={opportunity.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-slate-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
          >
            <span>Official Website</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        ) : (
          <span className="text-xs text-slate-500 capitalize">{opportunity.type}</span>
        )}

        {isApplied ? (
          <span className="px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Applied
          </span>
        ) : (
          <button
            onClick={() => onApply(opportunity)}
            disabled={isExpired}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isExpired
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-brand-800 hover:bg-brand-900 text-white shadow-sm'
            }`}
          >
            <span>Apply</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
