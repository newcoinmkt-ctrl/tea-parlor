/**
 * 锄大D 简易 AI
 */
import { parsePlay, canBeat, sortHand, HandType } from './engine.js';

function combos(hand) {
  const sorted = sortHand(hand);
  const out = [];
  // 单
  for (const c of sorted) out.push([c]);
  // 对 / 三 / 炸
  const byRank = new Map();
  for (const c of sorted) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c);
  }
  for (const list of byRank.values()) {
    if (list.length >= 2) out.push(list.slice(0, 2));
    if (list.length >= 3) out.push(list.slice(0, 3));
    if (list.length >= 4) out.push(list.slice(0, 4));
  }
  // 顺子（简单扫）
  const ranks = [...new Set(sorted.map((c) => c.rank))].filter((r) => r < 15).sort((a, b) => a - b);
  for (let i = 0; i + 4 < ranks.length; i++) {
    const slice = ranks.slice(i, i + 5);
    let ok = true;
    for (let j = 1; j < 5; j++) if (slice[j] !== slice[j - 1] + 1) ok = false;
    if (!ok) continue;
    const cards = [];
    for (const r of slice) {
      const c = sorted.find((x) => x.rank === r && !cards.includes(x));
      if (!c) { ok = false; break; }
      cards.push(c);
    }
    if (ok && cards.length === 5) out.push(cards);
  }
  return out;
}

export function decideChudadi(snap, seat) {
  const hand = snap.hands[seat];
  if (!hand?.length) return { action: 'pass' };

  if (snap.mustIncludeDiamond3) {
    const d3 = hand.find((c) => c.rank === 3 && c.suit === 0);
    if (d3) return { action: 'play', cardIds: [d3.id] };
  }

  const prev = snap.freeLead || !snap.lastPlay
    ? null
    : { type: snap.lastPlay.type, power: 0, cards: snap.lastPlay.cards };
  // 重建 power
  let prevParsed = null;
  if (snap.lastPlay && !snap.freeLead) {
    prevParsed = parsePlay(snap.lastPlay.cards);
  }

  const options = combos(hand)
    .map((cards) => {
      const p = parsePlay(cards);
      if (!p) return null;
      if (!canBeat(prevParsed, p)) return null;
      return { cards, p };
    })
    .filter(Boolean);

  if (!options.length) {
    if (snap.freeLead || !snap.lastPlay) {
      // 必须出：出最小单张
      const min = sortHand(hand)[0];
      return { action: 'play', cardIds: [min.id] };
    }
    return { action: 'pass' };
  }

  // 优先出最小能压的
  options.sort((a, b) => {
    if (a.p.type !== b.p.type) return a.p.type - b.p.type;
    return a.p.power - b.p.power;
  });
  // 能一把出完优先
  const finish = options.find((o) => o.cards.length === hand.length);
  const pick = finish || options[0];
  return { action: 'play', cardIds: pick.cards.map((c) => c.id) };
}
