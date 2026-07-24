'use client';

import { useEffect } from 'react';

export default function HostError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Host page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm animate-fade-in">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-ink/40 mb-6">
          The control screen hit an error. Reload — the live game state is unaffected and players stay connected.
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full !py-4 text-lg">
          Reload
        </button>
      </div>
    </div>
  );
}
