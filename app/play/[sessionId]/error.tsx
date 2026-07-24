'use client';

import { useEffect } from 'react';

export default function PlayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Play page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm animate-fade-in">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-ink/40 mb-6">Lost sync with the game for a moment. Reload to catch up — your score is safe.</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full !py-4 text-lg">
          Reload
        </button>
      </div>
    </div>
  );
}
