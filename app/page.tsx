'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { NeuralField } from '@/components/NeuralField';

export default function HomePage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  // PIN supplied by a scanned QR deep-link (?pin=NNNNNN)
  const [deepLinkPin, setDeepLinkPin] = useState('');
  const autoJoinedRef = useRef(false);

  const handleJoin = useCallback(
    async (pinValue?: string) => {
      const p = pinValue ?? pin;
      if (p.length !== 6) {
        setError('Enter a 6-digit PIN');
        return;
      }

      setError('');
      setChecking(true);

      try {
        const data = await api.get<{ session: { id: string; status: string } }>(
          `/api/session/pin/${p}`
        );
        router.push(`/join/${data.session.id}?pin=${p}`);
      } catch (err: any) {
        setError(err.message || 'Session not found');
        setChecking(false);
      }
    },
    [pin, router]
  );

  // Read the QR deep-link PIN once on mount and pre-fill it
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('pin') || '';
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    if (digits) {
      setDeepLinkPin(digits);
      setPin(digits);
    }
  }, []);

  // Redirect hosts to dashboard
  useEffect(() => {
    if (!loading && user?.role === 'HOST') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // A signed-in participant arriving via QR auto-joins with the pre-filled PIN
  useEffect(() => {
    if (loading || !user || user.role === 'HOST') return;
    if (!deepLinkPin || autoJoinedRef.current) return;
    autoJoinedRef.current = true;
    handleJoin(deepLinkPin);
  }, [loading, user, deepLinkPin, handleJoin]);

  // Preserve the PIN across the auth gate so not-signed-in scanners land back here
  const nextParam = deepLinkPin
    ? `?next=${encodeURIComponent(`/?pin=${deepLinkPin}`)}`
    : '';

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    setError('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 relative z-10">
        <Logo size={40} />
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-ink/50">Hi, {user.name}</span>
              {user.role === 'HOST' && (
                <Link href="/dashboard" className="btn-secondary text-sm !px-4 !py-2">
                  Dashboard
                </Link>
              )}
              <button onClick={logout} className="btn-danger text-sm !px-4 !py-2">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href={`/login${nextParam}`} className="btn-secondary text-sm !px-4 !py-2">
                Log in
              </Link>
              <Link href={`/signup${nextParam}`} className="btn-primary text-sm !px-4 !py-2">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-16">
        {/* Denser neuron field local to the hero */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <NeuralField className="absolute inset-0 h-full w-full" intensity={1} />
        </div>

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          {/* Four answer synapses — the game's DNA, firing */}
          <div className="flex items-center justify-center gap-3 mb-9 animate-fade-in">
            {[
              { c: 'bg-answer-red', s: '▲', g: 'shadow-glow-red' },
              { c: 'bg-answer-blue', s: '◆', g: 'shadow-glow-blue' },
              { c: 'bg-answer-yellow', s: '●', g: 'shadow-glow-yellow' },
              { c: 'bg-answer-green', s: '■', g: 'shadow-glow-green' },
            ].map((n, i) => (
              <span
                key={i}
                className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg text-white animate-breathe ${n.c} ${n.g}`}
                style={{ animationDelay: `${i * 240}ms` }}
              >
                {n.s}
              </span>
            ))}
          </div>

          <p className="mb-3 text-xs font-mono uppercase tracking-[0.35em] text-brand-600/80 animate-fade-in">
            Live quizzes, wired for the brain
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-semibold leading-[1.05] mb-5 animate-slide-up">
            Make it <span className="text-gradient italic">stick</span>.
          </h1>
          <p className="text-lg sm:text-xl text-ink/55 mb-12 animate-slide-up animate-delay-100 max-w-xl mx-auto">
            Recall beats re-reading. Turn any room into a fast, competitive
            quiz — and watch the learning actually land.
          </p>

          {loading ? (
            <div className="h-32" aria-hidden="true" />
          ) : !user ? (
            /* Gate: must log in or sign up before entering a PIN */
            <div className="animate-slide-up animate-delay-200 flex flex-col items-center gap-5">
              <p className="text-ink/50">
                {deepLinkPin
                  ? `Log in or sign up to join game ${deepLinkPin}`
                  : 'Log in or sign up to join a game'}
              </p>
              <div className="flex items-center gap-4">
                <Link href={`/login${nextParam}`} className="btn-secondary text-lg px-8 py-4">
                  Log in
                </Link>
                <Link href={`/signup${nextParam}`} className="btn-primary text-lg px-8 py-4">
                  Sign up
                </Link>
              </div>
            </div>
          ) : (
            <>
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
                <p className="mt-4 text-red-600 text-sm animate-fade-in" role="alert">
                  {error}
                </p>
              )}

              <button
                onClick={() => handleJoin()}
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
