/**
 * Returns the round multiplier for Mancini's Margin 2026 scoring.
 * Opening Round – Round 8  → 1.0×
 * Round 9 – Round 16       → 1.5×
 * Round 17 – Round 23      → 2.0×
 * Round 24                 → 3.0×
 */
export function marginMultiplier(roundNumber: number): number {
  if (roundNumber <= 8) return 1.0
  if (roundNumber <= 16) return 1.5
  if (roundNumber <= 23) return 2.0
  return 3.0
}

/**
 * Calculates prize distribution for a Margin competition.
 * - $40 flat entry fee (configurable via entryFee param)
 * - 3rd last place: entry fee back
 * - 1st: 65% of remainder, rounded up to nearest $10
 * - 2nd: balance
 */
export function marginPrizes(
  entrantCount: number,
  entryFee: number = 40
): { thirdLast: number; first: number; second: number } {
  const total = entrantCount * entryFee
  const thirdLast = entryFee
  const remainder = total - thirdLast
  const firstRaw = remainder * 0.65
  const first = Math.ceil(firstRaw / 10) * 10
  const second = remainder - first
  return { thirdLast, first, second }
}
