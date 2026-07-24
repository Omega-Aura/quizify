'use client';

// Last-resort boundary — catches errors the root layout itself can't survive.
// Deliberately self-contained (inline styles, no Tailwind/component imports):
// if something broke this badly, we don't want the fallback to depend on
// anything that could also be broken.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ opacity: 0.6, marginBottom: '1.5rem' }}>Please reload the page to continue.</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '0.75rem',
                background: '#3d8bff',
                color: 'white',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
