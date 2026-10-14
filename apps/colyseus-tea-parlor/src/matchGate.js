/**
 * Early-deal threshold for a match window.
 * Public (quick-match) rooms: minHumansBeforeAi = 1 → wait the full match window
 * (≤3s) unless the table is full; the client expects to see phase 'match' first.
 * Friend/dual rooms (minHumansBeforeAi ≥ 2): deal as soon as that many humans sit.
 */
export function earlyDealHumans(minHumansBeforeAi, seats) {
  const need = Number(minHumansBeforeAi) || 1;
  return need > 1 ? Math.min(need, seats) : seats;
}
