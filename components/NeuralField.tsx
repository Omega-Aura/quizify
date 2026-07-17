'use client';

import { useMemo } from 'react';

/**
 * A deterministic neuron network rendered as SVG — nodes (cell bodies) joined
 * to their nearest neighbours by dendrites, with signals travelling down a few
 * of them. Deterministic positions => no hydration mismatch. Replaces the
 * generic floating-blur-blob background with something that actually means
 * something for a brain-based quiz app.
 */

// Node positions in a 0–100 space (percentage-like, resolution independent).
const NODES: [number, number][] = [
  [6, 16], [18, 40], [12, 72], [28, 26], [34, 58],
  [45, 13], [49, 43], [53, 71], [62, 30], [67, 56],
  [78, 18], [83, 46], [74, 75], [91, 33], [94, 64],
  [58, 87], [24, 88], [40, 79], [70, 7], [4, 52],
];

function buildEdges(): [number, number][] {
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  NODES.forEach((a, i) => {
    NODES.map((b, j) => ({ j, d: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push(i < j ? [i, j] : [j, i]);
        }
      });
  });
  return edges;
}

export function NeuralField({
  className = '',
  intensity = 1,
}: {
  className?: string;
  intensity?: number;
}) {
  const edges = useMemo(buildEdges, []);
  // Every third edge carries a travelling signal.
  const signals = edges.filter((_, i) => i % 3 === 0);
  // Primary trio, cycled deterministically across nodes and signals.
  const NODE_COLORS = ['#3d8bff', '#f4586a', '#f7b53b'];

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ opacity: 0.5 * intensity }}
    >
      {/* Dendrites */}
      <g stroke="#171a2e" strokeOpacity="0.1" strokeWidth="0.25" vectorEffect="non-scaling-stroke">
        {edges.map(([a, b], i) => (
          <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
        ))}
      </g>

      {/* Travelling signals */}
      <g strokeWidth="0.6" strokeLinecap="round" vectorEffect="non-scaling-stroke">
        {signals.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
            stroke={NODE_COLORS[i % 3]}
            pathLength={100}
            className="synapse-signal"
            style={{ animationDelay: `${(i * 0.6).toFixed(2)}s` }}
          />
        ))}
      </g>

      {/* Cell bodies */}
      <g>
        {NODES.map(([x, y], i) => {
          const r = 0.5 + (i % 4) * 0.28;
          const color = NODE_COLORS[i % 3];
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r * 2.4} fill={color} fillOpacity="0.1" />
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                fillOpacity="0.85"
                className="animate-breathe"
                style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${(i * 0.3).toFixed(2)}s` }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
