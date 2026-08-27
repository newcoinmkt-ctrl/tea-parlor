/**
 * 扑克牌基础模型
 * rank: 3-15(2), 16(小王), 17(大王)
 * suit: 0方块 1梅花 2红桃 3黑桃 4王牌
 */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const SUIT_NAMES = ['diamond', 'club', 'heart', 'spade'];

/** 显示用点数 */
export const RANK_LABEL = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2',
  16: '小王', 17: '大王',
};

let _uid = 0;

export function createCard(rank, suit) {
  return {
    id: `${rank}_${suit}_${_uid++}`,
    rank,
    suit,
    isJoker: rank >= 16,
    isRed: suit === 0 || suit === 2 || rank === 17,
  };
}

/** 一副 54 张 */
export function createDeck() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 3; rank <= 15; rank++) {
      deck.push(createCard(rank, suit));
    }
  }
  deck.push(createCard(16, 4)); // 小王
  deck.push(createCard(17, 4)); // 大王
  return deck;
}

function randomFloat() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function shuffle(arr, random = randomFloat) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cutDeck(arr, random = randomFloat) {
  if (!arr || arr.length < 8) return (arr || []).slice();
  const lo = Math.max(1, Math.floor(arr.length * 0.18));
  const hi = Math.min(arr.length - 1, Math.floor(arr.length * 0.82));
  const cut = lo + Math.floor(random() * (hi - lo + 1));
  return arr.slice(cut).concat(arr.slice(0, cut));
}

/** 真人洗牌：多洗几遍再切 */
export function riffleShuffle(arr, random = randomFloat, times) {
  const n = times == null ? 2 + Math.floor(random() * 3) : times;
  let d = arr.slice();
  for (let t = 0; t < n; t++) d = shuffle(d, random);
  return cutDeck(d, random);
}

/** 不洗牌：先打乱再收墩，避免厂牌顺序整段发给同一人 */
export function unwashedShuffle(arr, random = randomFloat) {
  let cards = shuffle(arr, random);
  const piles = [];
  let i = 0;
  while (i < cards.length) {
    const remain = cards.length - i;
    const size = remain <= 4 ? remain : Math.min(remain, 3 + Math.floor(random() * 6));
    piles.push(cards.slice(i, i + size));
    i += size;
  }
  for (let a = piles.length - 1; a > 0; a--) {
    const b = Math.floor(random() * (a + 1));
    [piles[a], piles[b]] = [piles[b], piles[a]];
  }
  return cutDeck(piles.flat(), random);
}

/** 一张一张顺时针轮发 */
export function dealRoundRobin(deck, playerCount, cardsEach, startSeat = 0) {
  const n = Math.max(1, Number(playerCount) || 1);
  const each = Math.max(0, Number(cardsEach) || 0);
  const start = ((Number(startSeat) || 0) % n + n) % n;
  const hands = Array.from({ length: n }, () => []);
  let i = 0;
  for (let r = 0; r < each; r++) {
    for (let p = 0; p < n; p++) {
      if (i >= deck.length) break;
      hands[(start + p) % n].push(deck[i++]);
    }
  }
  return { hands, rest: deck.slice(i), dealt: i };
}

/** 斗地主排序：大牌在右（或左），默认大→小 */
export function sortCards(cards, asc = false) {
  return cards.slice().sort((a, b) => {
    if (a.rank !== b.rank) return asc ? a.rank - b.rank : b.rank - a.rank;
    return a.suit - b.suit;
  });
}

export function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

export function cardKey(card) {
  return `${card.rank}_${card.suit}`;
}

/** 按点数分组 { rank: cards[] } */
export function groupByRank(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.rank)) map.set(c.rank, []);
    map.get(c.rank).push(c);
  }
  return map;
}

/** 点数从大到小的列表 */
export function ranksDesc(cards) {
  return [...new Set(cards.map((c) => c.rank))].sort((a, b) => b - a);
}
