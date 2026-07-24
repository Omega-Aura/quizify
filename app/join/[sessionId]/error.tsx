'use client';

import { useEffect } from 'react';

export default function JoinError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Join page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm animate-fade-in">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-ink/40 mb-6">Lost the connection for a moment. Reload to rejoin.</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full !py-4 text-lg">
          Reload
        </button>
      </div>
    </div>
  );
}
