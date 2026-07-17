/**
 * Scoring rule (from spec):
 * Correct answer base = 1000 points, scaled by response speed:
 *   round(1000 * (1 - (responseMs / timeLimitMs) / 2))
 * Floored at 0, multiplied by the question's points setting.
 * Incorrect = 0. Computed server-side only.
 */
export function calculateScore(
  responseMs: number,
  timeLimitMs: number,
  pointsMode: 'STANDARD' | 'DOUBLE' | 'NONE',
  isCorrect: boolean
): number {
  if (!isCorrect || pointsMode === 'NONE') return 0;

  const base = Math.round(1000 * (1 - (responseMs / timeLimitMs) / 2));
  const clamped = Math.max(0, base);
  return pointsMode === 'DOUBLE' ? clamped * 2 : clamped;
}

/**
 * Generate a unique 6-digit PIN for a session.
 */
export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
