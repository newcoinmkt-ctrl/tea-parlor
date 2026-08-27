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

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
