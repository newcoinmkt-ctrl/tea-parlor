/**
 * 国标 34 种牌面编码
 * 0–8   万 1–9
 * 9–17  条 1–9
 * 18–26 筒 1–9
 * 27–30 风 东南西北
 * 31–33 箭 中发白
 */

export const TILE = Object.freeze({
  WAN: 0,
  TIAO: 9,
  TONG: 18,
  FENG: 27,
  JIAN: 31,
});

export const NAMES34 = (() => {
  const n = [];
  const rn = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  for (const s of ['万', '条', '筒']) {
    for (const r of rn) n.push(r + s);
  }
  n.push('东', '南', '西', '北', '中', '发', '白');
  return n;
})();

/**
 * Card → 0..33
 * 约定：
 *   suit 0/1/2 + rank 1–9 → 序数
 *   suit 3 + rank 1–4 → 风
 *   suit 4 + rank 1–3 → 中发白
 *   或 card.id34 / card.tile34
 */
export function toId34(card) {
  if (card == null) return -1;
  if (Number.isInteger(card.tile34)) return card.tile34;
  if (Number.isInteger(card.id34)) return card.id34;
  if (Number.isInteger(card) && card >= 0 && card <= 33) return card;

  const suit = Number(card.suit);
  const rank = Number(card.rank);
  if (suit >= 0 && suit <= 2 && rank >= 1 && rank <= 9) {
    return suit * 9 + (rank - 1);
  }
  if (suit === 3 && rank >= 1 && rank <= 4) return 26 + rank; // 27–30
  if (suit === 4 && rank >= 1 && rank <= 3) return 30 + rank; // 31–33
  return -1;
}

export function fromId34(id) {
  if (id < 0 || id > 33) return null;
  if (id < 27) {
    return { suit: Math.floor(id / 9), rank: (id % 9) + 1, tile34: id };
  }
  if (id < 31) return { suit: 3, rank: id - 26, tile34: id };
  return { suit: 4, rank: id - 30, tile34: id };
}

export function isOrdinal(id) {
  return id >= 0 && id < 27;
}
export function isTerminal(id) {
  if (!isOrdinal(id)) return false;
  const r = id % 9;
  return r === 0 || r === 8;
}
export function isHonor(id) {
  return id >= 27 && id <= 33;
}
export function isWind(id) {
  return id >= 27 && id <= 30;
}
export function isDragon(id) {
  return id >= 31 && id <= 33;
}
export function isYaoJiu(id) {
  return isTerminal(id) || isHonor(id);
}
export function isGreenTile(id) {
  // 绿一色：二三四六八条 + 发
  // 条: 9–17 → 二=10,三=11,四=12,六=14,八=16; 发=32
  return id === 10 || id === 11 || id === 12 || id === 14 || id === 16 || id === 32;
}

export function suitOf(id) {
  if (id < 9) return 0;
  if (id < 18) return 1;
  if (id < 27) return 2;
  if (id < 31) return 3;
  return 4;
}

/** 统计 34 维 count */
export function count34(cards) {
  const c = new Int8Array(34);
  for (const t of cards || []) {
    const id = toId34(t);
    if (id >= 0) c[id] += 1;
  }
  return c;
}

export function totalTiles(counts) {
  let n = 0;
  for (let i = 0; i < 34; i++) n += counts[i];
  return n;
}
