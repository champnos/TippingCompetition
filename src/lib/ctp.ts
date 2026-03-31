/**
 * Returns the accuracy factor multiplier for Closest to Pin scoring.
 * Rounds 1–4 → 1, 5–9 → 2, 10–14 → 3, 15–19 → 4, 20+ → 5
 */
export function ctpAccuracyFactor(roundNumber: number): number {
  if (roundNumber <= 4) return 1
  if (roundNumber <= 9) return 2
  if (roundNumber <= 14) return 3
  if (roundNumber <= 19) return 4
  return 5
}
