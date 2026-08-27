/**
 * 德州扑克牌面
 *
 * rank: 2–14（11=J, 12=Q, 13=K, 14=A）
 * suit: 1–4（1=♦, 2=♣, 3=♥, 4=♠）
 */

export const SUIT = Object.freeze({
  DIAMOND: 1,
  CLUB: 2,
  HEART: 3,
  SPADE: 4,
});

export const SUIT_SYMBOL = Object.freeze({
  1: '♦',
  2: '♣',
  3: '♥',
  4: '♠',
});

export const RANK_LABEL = Object.freeze({
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
});

/**
 * @typedef {{ rank: number, suit: number, id?: string }} Card
 */

let _uid = 0;

/**
 * @param {number} rank 2–14
 * @param {number} suit 1–4
 * @returns {Card}
 */
export function createCard(rank, suit) {
  if (rank < 2 || rank > 14) {
    throw new RangeError(`invalid rank ${rank}, expect 2–14`);
  }
  if (suit < 1 || suit > 4) {
    throw new RangeError(`invalid suit ${suit}, expect 1–4`);
  }
  return {
    id: `tx_${rank}_${suit}_${_uid++}`,
    rank: Number(rank),
    suit: Number(suit),
  };
}

export function resetCardIds() {
  _uid = 0;
}

/** 52 张标准牌（无王） */
export function createDeck52() {
  resetCardIds();
  const deck = [];
  for (let suit = 1; suit <= 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

/**
 * @param {Card} c
 */
export function cardText(c) {
  if (!c) return '';
  return `${SUIT_SYMBOL[c.suit] || '?'}${RANK_LABEL[c.rank] || c.rank}`;
}

/**
 * @param {Card[]} cards
 */
export function cardsText(cards) {
  return (cards || []).map(cardText).join(' ');
}

/**
 * 规范化比较键
 * @param {Card} c
 */
export function cardKey(c) {
  return (Number(c.rank) << 3) | Number(c.suit);
}
