'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      router.push(user.role === 'HOST' ? '/dashboard' : '/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-bold text-xl">
              Q
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-gradient">Welcome back</h1>
          <p className="text-white/40 mt-2">Sign in to your Quizify account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5 animate-slide-up">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="input-label">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="login-password" className="input-label">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 text-base">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>

          <p className="text-center text-sm text-white/40">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-brand-400 hover:text-brand-300 underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </form>

        {/* Demo credentials */}
        <div className="mt-6 glass-card p-4 animate-slide-up animate-delay-200">
          <p className="text-xs text-white/30 text-center mb-2">Demo credentials</p>
          <div className="flex gap-4 text-xs text-white/50">
            <div className="flex-1 text-center">
              <p className="font-medium text-brand-400">Host</p>
              <p>host@quizify.dev</p>
              <p>password123</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex-1 text-center">
              <p className="font-medium text-brand-400">Player</p>
              <p>player@quizify.dev</p>
              <p>password123</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
