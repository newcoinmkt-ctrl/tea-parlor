/**
 * 麻将 AI：定缺优先打缺；可自摸则胡；暗杠优先；否则打孤张
 */
import {
  canHu,
  chooseMissingSuit,
  suggestExchangeTiles,
  findAnGangCandidates,
  findBuGangCandidates,
  PlayerStatus,
} from './engine.js';

function tileKey(c) {
  return Number(c.suit) * 10 + Number(c.rank);
}

/**
 * @param {object} snap snapshot
 * @param {number} seat
 * @returns {{ action: string, tileId?: string, suit?: number, type?: string }|null}
 */
export function decideMahjongDiscard(snap, seat) {
  if (snap.status?.[seat] === PlayerStatus.HU_OUT) return null;

  // 换三张（仅 AI 座位；UI 侧会用 suggest）
  if (snap.phase === 'exchange') {
    const set = suggestExchangeTiles(snap.hands[seat] || []);
    return {
      action: 'exchange',
      tileIds: set.map((t) => t.id),
    };
  }

  if (snap.phase === 'dingque') {
    return {
      action: 'dingque',
      suit: chooseMissingSuit(snap.hands[seat] || []),
    };
  }

  const hand = snap.hands[seat];
  if (!hand?.length) return null;
  if (snap.phase !== 'discard' && snap.phase !== 'draw') return null;

  const missing = snap.missingSuits?.[seat];
  const meldsLen = (snap.melds[seat] || []).length;

  if (canHu(hand, meldsLen, missing)) {
    return { action: 'hu' };
  }

  // 暗杠
  const an = findAnGangCandidates(hand);
  if (an.length) {
    return { action: 'gang', type: 'an', tile: { suit: an[0].suit, rank: an[0].rank } };
  }

  // 补杠
  const pengs = (snap.melds[seat] || []).filter((m) => m.type === 'peng');
  const bu = findBuGangCandidates(hand, pengs);
  if (bu.length) {
    return { action: 'gang', type: 'ming_bu', tile: { suit: bu[0].suit, rank: bu[0].rank } };
  }

  const counts = new Map();
  for (const c of hand) {
    const k = tileKey(c);
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const scored = hand.map((c) => {
    const k = tileKey(c);
    const n = counts.get(k) || 0;
    let score = 0;
    if (n === 1) score = 0;
    else if (n === 2) score = 2;
    else if (n === 3) score = 4;
    else score = 5;

    // 定缺花色优先打出
    if (missing != null && missing >= 0 && missing <= 2 && c.suit === missing) {
      score -= 10;
    }
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score || Math.random() - 0.5);
  return { action: 'discard', tileId: scored[0].c.id };
}
