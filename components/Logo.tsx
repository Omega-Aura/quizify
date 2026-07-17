import Link from 'next/link';

/**
 * The Quizify mark: a single neuron — a soma (cell body) with a coral nucleus,
 * radiating dendrites that terminate in synaptic boutons. This replaces the
 * generic rounded "Q" tile that appeared across the app.
 */
export function NeuronMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ filter: 'drop-shadow(0 0 5px rgba(61,139,255,0.35))' }}
    >
      {/* Dendrites */}
      <g stroke="#3d8bff" strokeWidth="1.5" strokeLinecap="round">
        <path d="M20 20 L7 7" />
        <path d="M20 20 L34 9" />
        <path d="M20 20 L6 24" />
        <path d="M20 20 L33 30" />
        <path d="M20 20 L18 35" />
      </g>

      {/* Synaptic boutons — the primary trio */}
      <g>
        <circle cx="7" cy="7" r="2" fill="#f4586a" />
        <circle cx="34" cy="9" r="2" fill="#f7b53b" />
        <circle cx="6" cy="24" r="2" fill="#f7b53b" />
        <circle cx="33" cy="30" r="2" fill="#f4586a" />
        <circle cx="18" cy="35" r="2" fill="#3d8bff" />
      </g>

      {/* Soma + nucleus */}
      <circle cx="20" cy="20" r="7.5" fill="#3d8bff" />
      <circle cx="20" cy="20" r="2.6" fill="#f4586a" />
    </svg>
  );
}

export function Logo({
  size = 38,
  withWordmark = true,
  href = '/',
  className = '',
}: {
  size?: number;
  withWordmark?: boolean;
  href?: string | null;
  className?: string;
}) {
  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <NeuronMark size={size} />
      {withWordmark && (
        <span
          className="text-gradient text-xl font-semibold tracking-tight"
          style={{ fontSize: size * 0.5 }}
        >
          Quizify
        </span>
      )}
    </span>
  );

  if (href === null) return inner;
  return (
    <Link href={href} className="inline-flex items-center">
      {inner}
    </Link>
  );
}
