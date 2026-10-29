import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const res = await sendPasswordReset(trimmedEmail);
      if (res.success) {
        setSuccess(res.message || 'Password reset email sent. Please check your inbox.');
      } else {
        setError(res.message || 'Unable to send password reset email. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred while sending the reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[448px] mx-auto px-4 py-16">
      <div className="text-center mb-6">
        <span className="text-xs uppercase tracking-widest text-muted font-medium block mb-1">
          EduConnect
        </span>
        <h1 className="font-serif text-3xl font-semibold text-ink">
          Reset password
        </h1>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          Enter your registered email address to receive password reset instructions.
        </p>
      </div>

      <div className="border border-line rounded-[4px] p-6 sm:p-8 bg-paper">
        {success ? (
          <div className="space-y-4">
            <div className="p-4 bg-accent-soft/40 border border-line rounded-[4px] text-sm text-ink leading-relaxed">
              <p className="font-medium text-ok mb-1">Reset email sent</p>
              <p className="text-muted">{success}</p>
            </div>
            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="w-full inline-block py-2.5 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors text-center"
              >
                Return to sign in
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {error && (
              <p className="text-sm text-bad mb-4" role="alert">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs sm:text-sm font-medium text-ink mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="student@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending reset link...' : 'Send reset link'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        Remember your password?{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover underline decoration-line font-medium"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
