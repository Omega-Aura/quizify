'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'HOST' | 'PARTICIPANT'>('PARTICIPANT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await signup(email, password, name, role);
      router.push(user.role === 'HOST' ? '/dashboard' : '/');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-bold text-xl">
              Q
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-gradient">Create your account</h1>
          <p className="text-white/40 mt-2">Join the fun on Quizify</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5 animate-slide-up">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Role selector */}
          <div>
            <label className="input-label">I want to...</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('PARTICIPANT')}
                className={`p-4 rounded-xl border text-center transition-all duration-200 ${
                  role === 'PARTICIPANT'
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-2xl block mb-1">🎮</span>
                <span className="text-sm font-medium">Play quizzes</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('HOST')}
                className={`p-4 rounded-xl border text-center transition-all duration-200 ${
                  role === 'HOST'
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-2xl block mb-1">🎯</span>
                <span className="text-sm font-medium">Create & host</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="signup-name" className="input-label">Name</label>
            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Your name"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="input-label">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="input-label">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="At least 6 characters"
              minLength={6}
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
                Creating account...
              </span>
            ) : (
              'Create account'
            )}
          </button>

          <p className="text-center text-sm text-white/40">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-400 hover:text-brand-300 underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
