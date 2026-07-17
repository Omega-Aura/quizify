'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'HOST' | 'PARTICIPANT'>('PARTICIPANT');
  const [hostKey, setHostKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await signup(email, password, name, role, role === 'HOST' ? hostKey : undefined);
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
          <div className="flex justify-center mb-6">
            <Logo size={54} withWordmark={false} />
          </div>
          <h1 className="text-3xl font-display font-semibold">Create your account</h1>
          <p className="text-ink/45 mt-2">Build quizzes people actually remember</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-5 animate-slide-up">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm" role="alert">
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
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-600'
                    : 'bg-ink/[0.04] border-ink/[0.08] text-ink/50 hover:bg-ink/[0.06]'
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
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-600'
                    : 'bg-ink/[0.04] border-ink/[0.08] text-ink/50 hover:bg-ink/[0.06]'
                }`}
              >
                <span className="text-2xl block mb-1">🎯</span>
                <span className="text-sm font-medium">Create & host</span>
              </button>
            </div>
          </div>

          {role === 'HOST' && (
            <div>
              <label htmlFor="signup-host-key" className="input-label">Host key</label>
              <input
                id="signup-host-key"
                type="password"
                value={hostKey}
                onChange={(e) => setHostKey(e.target.value)}
                className="input-field"
                placeholder="Enter the host access key"
                required
              />
            </div>
          )}

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

          <p className="text-center text-sm text-ink/40">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-600 hover:text-brand-600 underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
