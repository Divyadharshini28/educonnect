import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage() {
  const { loginStudent } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await loginStudent(email.trim(), password);
      if (res.success) {
        navigate('/home');
      } else {
        setError(res.message || 'Invalid email or password.');
      }
    } catch (err) {
      setError(err.message || 'Authentication error occurred.');
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
          Sign in
        </h1>
      </div>

      <div className="border border-line rounded-[4px] p-6 sm:p-8 bg-paper">
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm sm:text-base px-3.5 py-2.5 border border-line rounded-[4px] bg-paper text-ink focus:border-ink focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs sm:text-sm font-medium text-ink"
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs sm:text-sm text-accent hover:text-accent-hover underline decoration-line font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm rounded-[4px] bg-accent text-white hover:bg-accent-hover font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link
          to="/signup"
          className="text-accent hover:text-accent-hover underline decoration-line font-medium"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
