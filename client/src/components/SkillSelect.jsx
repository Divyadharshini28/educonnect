import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search, Check } from 'lucide-react';

export const SKILL_CATALOG = [
  'Algorithms',
  'API Integration',
  'AWS',
  'C++',
  'Cloud Computing',
  'Data Science',
  'Data Structures',
  'Docker',
  'Express',
  'Git',
  'IoT',
  'Java',
  'JavaScript',
  'Linear Algebra',
  'Linux',
  'Machine Learning',
  'MongoDB',
  'Networking Basics',
  'Node.js',
  'Problem Solving',
  'PyTorch',
  'Python',
  'React',
  'SQL',
  'Team Collaboration',
  'TensorFlow',
  'Web Development'
];

export default function SkillSelect({
  selectedSkills = [],
  onChange,
  label = 'Technical skills',
  helperText = 'Select technical skills to refine opportunity matches (optional).'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleSkill = (skill) => {
    if (selectedSkills.includes(skill)) {
      onChange(selectedSkills.filter(s => s !== skill));
    } else {
      onChange([...selectedSkills, skill]);
    }
  };

  const removeSkill = (skill, e) => {
    e.stopPropagation();
    onChange(selectedSkills.filter(s => s !== skill));
  };

  const clearAll = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const filteredSkills = SKILL_CATALOG.filter(skill =>
    skill.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="block text-xs sm:text-sm uppercase tracking-wider text-muted font-medium mb-1">
          {label}
        </label>
        {selectedSkills.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted hover:text-bad transition-colors font-medium"
          >
            Clear all ({selectedSkills.length})
          </button>
        )}
      </div>

      {/* Selected skill chips display */}
      {selectedSkills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border border-line rounded-[4px] bg-paper">
          {selectedSkills.map(skill => (
            <span
              key={skill}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] bg-accent-soft text-accent text-xs sm:text-sm font-medium border border-line/60"
            >
              <span>{skill}</span>
              <button
                type="button"
                onClick={(e) => removeSkill(skill, e)}
                aria-label={`Remove ${skill}`}
                className="text-accent/70 hover:text-accent rounded-sm p-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted/70 italic p-2.5 border border-line/60 rounded-[4px] bg-paper/50">
          No skills selected. You can select skills below or add them later.
        </div>
      )}

      {/* Dropdown toggle button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between text-sm px-3 py-2 border border-line rounded-[4px] bg-paper text-ink hover:border-ink/50 focus:border-ink focus:outline-none transition-colors"
        >
          <span className="text-muted">
            {selectedSkills.length === 0
              ? 'Select skills from catalog...'
              : `Add or edit skills (${selectedSkills.length} selected)...`}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {/* Dropdown Popover */}
        {isOpen && (
          <div
            className="absolute left-0 right-0 z-40 mt-1 border border-line rounded-[4px] bg-paper shadow-lg max-h-64 flex flex-col"
            role="listbox"
            aria-multiselectable="true"
          >
            {/* Search filter input */}
            <div className="p-2 border-b border-line bg-paper sticky top-0 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Filter catalog skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm bg-transparent text-ink placeholder:text-muted/60 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear filter search"
                  className="text-muted hover:text-ink text-xs p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Scrollable list of skills */}
            <div className="overflow-y-auto p-1 divide-y divide-line/30 flex-1">
              {filteredSkills.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted">
                  No catalog skills match &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredSkills.map(skill => {
                  const isSelected = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggleSkill(skill)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-[3px] flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-accent-soft text-accent font-medium'
                          : 'text-ink hover:bg-line/30'
                      }`}
                    >
                      <span>{skill}</span>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-accent" aria-hidden="true" />
                      ) : (
                        <span className="w-3.5 h-3.5 border border-line rounded-sm" aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer actions */}
            <div className="p-2.5 border-t border-line bg-paper/80 flex items-center justify-between text-xs sm:text-sm">
              <span className="text-xs text-muted font-medium">
                {selectedSkills.length} selected
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-1.5 bg-ink text-paper rounded-[3px] text-xs sm:text-sm font-medium hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {helperText && (
        <p className="text-xs text-muted leading-relaxed">
          {helperText}
        </p>
      )}
    </div>
  );
}
