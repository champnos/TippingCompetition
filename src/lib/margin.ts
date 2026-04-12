/**
 * Minimum number of correct tips required for a player to be eligible for prizes.
 */
export const MARGIN_ELIGIBILITY_THRESHOLD = 15

/**
 * Returns the accuracy factor for Margin ("Closest to Pin") scoring.
 * OR + R1-R4  -> 1x
 * R5-R9       -> 2x
 * R10-R14     -> 3x
 * R15-R19     -> 4x
 * R20-R24     -> 5x
 *
 * "OR" (Opening Round) is treated as round 0 or any round_number <= 4.
 */
export function marginMultiplier(roundNumber: number): number {
  if (roundNumber <= 4) return 1
  if (roundNumber <= 9) return 2
  if (roundNumber <= 14) return 3
  if (roundNumber <= 19) return 4
  return 5
}

/**
 * Calculates prize distribution for a Margin competition.
 * - $30 flat entry fee (configurable via entryFee param)
 * - 3rd last place: entry fee back
 * - 1st: 70% of remainder, rounded to nearest $10
 * - 2nd: balance
 */
export function marginPrizes(
  entrantCount: number,
  entryFee: number = 30
): { thirdLast: number; first: number; second: number } {
  const total = entrantCount * entryFee
  const thirdLast = entryFee
  const remainder = total - thirdLast
  const firstRaw = remainder * 0.70
  const first = Math.round(firstRaw / 10) * 10
  const second = remainder - first
  return { thirdLast, first, second }
}