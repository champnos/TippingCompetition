/**
 * Returns the round multiplier for Margin tipping scoring.
 * R1–R8  → 1×
 * R9–R16 → 1.5×
 * R17–R23 → 2×
 * R24+   → 3×
 *
 * The multiplier applies to win/loss scores only.
 * The -50 no-tip penalty is never multiplied.
 */
export function marginMultiplier(roundNumber: number): number {
  if (roundNumber <= 8) return 1
  if (roundNumber <= 16) return 1.5
  if (roundNumber <= 23) return 2
  return 3
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
