'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  // Redirect hosts to dashboard
  useEffect(() => {
    if (!loading && user?.role === 'HOST') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleJoin = async () => {
    if (pin.length !== 6) {
      setError('Enter a 6-digit PIN');
      return;
    }

    setError('');
    setChecking(true);

    try {
      const data = await api.get<{ session: { id: string; status: string } }>(
        `/api/session/pin/${pin}`
      );
      router.push(`/join/${data.session.id}?pin=${pin}`);
    } catch (err: any) {
      setError(err.message || 'Session not found');
    } finally {
      setChecking(false);
    }
  };

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center font-bold text-lg">
            Q
          </div>
          <span className="text-xl font-bold text-gradient">Quizify</span>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/50">Hi, {user.name}</span>
              {user.role === 'HOST' && (
                <Link href="/dashboard" className="btn-secondary text-sm !px-4 !py-2">
                  Dashboard
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="/login" className="btn-secondary text-sm !px-4 !py-2">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary text-sm !px-4 !py-2">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
        {/* Floating decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-[10%] w-20 h-20 bg-answer-red/20 rounded-full blur-xl animate-float" />
          <div className="absolute top-40 right-[15%] w-16 h-16 bg-answer-blue/20 rounded-full blur-xl animate-float animate-delay-200" />
          <div className="absolute bottom-32 left-[20%] w-24 h-24 bg-answer-yellow/15 rounded-full blur-xl animate-float animate-delay-400" />
          <div className="absolute bottom-48 right-[25%] w-14 h-14 bg-answer-green/20 rounded-full blur-xl animate-float animate-delay-300" />
        </div>

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          {/* Shapes row */}
          <div className="flex items-center justify-center gap-4 mb-8 animate-fade-in">
            <span className="text-3xl text-answer-red animate-float">▲</span>
            <span className="text-3xl text-answer-blue animate-float animate-delay-100">◆</span>
            <span className="text-3xl text-answer-yellow animate-float animate-delay-200">●</span>
            <span className="text-3xl text-answer-green animate-float animate-delay-300">■</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold mb-4 animate-slide-up">
            <span className="text-gradient">Quizify</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/50 mb-12 animate-slide-up animate-delay-100">
            Join a live quiz and compete in real time
          </p>

          {/* PIN Input */}
          <div className="animate-slide-up animate-delay-200">
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="000000"
              className="pin-input"
              aria-label="Enter 6-digit game PIN"
              autoFocus
            />
          </div>

          {error && (
            <p className="mt-4 text-red-400 text-sm animate-fade-in" role="alert">
              {error}
            </p>
          )}

          <button
            onClick={handleJoin}
            disabled={pin.length !== 6 || checking}
            className="btn-primary text-lg px-12 py-4 mt-6 animate-slide-up animate-delay-300"
          >
            {checking ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </span>
            ) : (
              'Enter'
            )}
          </button>

          <p className="mt-8 text-sm text-white/30 animate-fade-in animate-delay-400">
            Want to create quizzes?{' '}
            <Link href="/signup" className="text-brand-400 hover:text-brand-300 underline underline-offset-4">
              Sign up as a host
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-white/20">
        Quizify — Real-time interactive quizzes
      </footer>
    </div>
  );
}
