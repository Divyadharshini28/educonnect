import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({
  id = 'password',
  name = 'password',
  value,
  onChange,
  required = false,
  autoComplete = 'current-password',
  placeholder = '',
  className = '',
  disabled = false
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full text-sm sm:text-base px-3 py-2 pr-10 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none transition-colors ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible(prev => !prev)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={0}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors p-1 flex items-center justify-center focus:outline-none focus:text-ink"
      >
        {visible ? (
          <EyeOff className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Eye className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
