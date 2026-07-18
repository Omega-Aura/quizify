/**
 * Full-screen loading state shared across pages. Shows the Quizify loading
 * animation (public/loading.gif) with an optional status label, replacing the
 * per-page inline SVG spinners.
 */
export function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 text-ink/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/loading.gif"
          alt=""
          aria-hidden="true"
          className="w-40 h-40 object-contain select-none"
          draggable={false}
        />
        <span className="text-sm" role="status" aria-live="polite">
          {label}
        </span>
      </div>
    </div>
  );
}
