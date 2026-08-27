/**
 * 四川麻将牌面（血战/血流标准 108 张：万/条/筒）
 * suit: 0 万 · 1 条 · 2 筒
 * rank: 1–9
 */

export const SUIT = Object.freeze({
  WAN: 0,
  TIAO: 1,
  TONG: 2,
});

export const SUIT_NAMES = Object.freeze(['万', '条', '筒']);
export const RANK_NAMES = Object.freeze(['', '一', '二', '三', '四', '五', '六', '七', '八', '九']);

let _uid = 0;

/**
 * @param {number} suit 0–2
 * @param {number} rank 1–9
 * @returns {{ id: string, suit: number, rank: number }}
 */
export function createTile(suit, rank) {
  if (suit < 0 || suit > 2 || rank < 1 || rank > 9) {
    throw new RangeError(`invalid tile ${suit}-${rank}`);
  }
  return { id: `sc_${suit}_${rank}_${_uid++}`, suit, rank };
}

export function resetTileIds() {
  _uid = 0;
}

export function tileKey(t) {
  return Number(t.suit) * 10 + Number(t.rank);
}

export function tileName(t) {
  if (!t) return '';
  return `${RANK_NAMES[t.rank] || t.rank}${SUIT_NAMES[t.suit] || ''}`;
}

export function sameTile(a, b) {
  return a && b && Number(a.suit) === Number(b.suit) && Number(a.rank) === Number(b.rank);
}

/** 108 张：每种花色 1–9 × 4 */
export function createSichuanDeck() {
  resetTileIds();
  const deck = [];
  for (let suit = 0; suit < 3; suit++) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) deck.push(createTile(suit, rank));
    }
  }
  return deck;
}

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(tiles) {
  return tiles.slice().sort((a, b) => {
    if (a.suit !== b.suit) return a.suit - b.suit;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function countBySuit(hand) {
  const c = [0, 0, 0];
  for (const t of hand) {
    if (t.suit >= 0 && t.suit <= 2) c[t.suit] += 1;
  }
  return c;
}

export function groupByKey(tiles) {
  const m = new Map();
  for (const t of tiles) {
    const k = tileKey(t);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}
