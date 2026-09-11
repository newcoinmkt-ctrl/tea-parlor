/**
 * 日麻本地 AI：可自摸则自摸；可立直则倾向立直；否则打孤张/字牌
 */
import { tileKey, isTenpai, canWinHand } from './riichi-engine.js';

export function decideRiichiAction(table, seat) {
  const snap = table.snapshot();
  if (snap.phase === 'settle') return null;
  if (snap.phase === 'call' && snap.canRon && seat === 0) {
    return { action: 'ron' };
  }
  if (snap.current !== seat || snap.phase !== 'discard') return null;

  // AI uses internal hand via aiDiscard path; for seat 0 we use snap
  if (seat === 0) {
    if (snap.canTsumo) return { action: 'tsumo' };
    if (snap.canRiichi) return { action: 'riichi' };
    const hand = snap.hands[0] || [];
    return { action: 'discard', tileId: pickDiscard(hand, snap) };
  }
  return { action: 'ai' };
}

function pickDiscard(hand, snap) {
  if (snap.riichi?.[0] && snap.drawn) return snap.drawn.id;
  const counts = new Map();
  for (const c of hand) {
    const k = tileKey(c);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Prefer discard that keeps tenpai if already close
  for (let i = 0; i < hand.length; i++) {
    const left = hand.slice(0, i).concat(hand.slice(i + 1));
    if (isTenpai(left, 0)) return hand[i].id;
  }
  const scored = hand.map((c) => {
    const n = counts.get(tileKey(c)) || 0;
    let score = n; // keep sets
    if (c.suit >= 3) score -= 0.5;
    if (c.suit <= 2 && (c.rank === 1 || c.rank === 9)) score -= 0.3;
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].c.id;
}

export function riichiAiStep(table, seat) {
  return table.aiDiscard(seat);
}
