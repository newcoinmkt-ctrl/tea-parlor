/**
 * 掼蛋牌面
 *
 * 两副牌 108 张：52×2 + 小王×2 + 大王×2
 * rank: 2–14(A) · 16=小王 · 17=大王
 * suit: 1–4（1=♦ 2=♣ 3=♥ 4=♠）· 王 suit=0
 *
 * 打级 currentRank（2–14）：红心(3) 同点数为「逢人配」百搭
 */

export const SUIT = Object.freeze({
  JOKER: 0,
  DIAMOND: 1,
  CLUB: 2,
  HEART: 3,
  SPADE: 4,
});

export const SUIT_SYMBOL = Object.freeze({
  0: '',
  1: '♦',
  2: '♣',
  3: '♥',
  4: '♠',
});

export const RANK = Object.freeze({
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  SMALL_JOKER: 16,
  BIG_JOKER: 17,
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
  16: '小王',
  17: '大王',
});

/**
 * @typedef {{ rank: number, suit: number, id?: string }} Card
 */

let _uid = 0;

/**
 * @param {number} rank
 * @param {number} suit
 * @returns {Card}
 */
export function createCard(rank, suit) {
  if (rank === 16 || rank === 17) {
    return { id: `gd_${rank}_${_uid++}`, rank, suit: 0 };
  }
  if (rank < 2 || rank > 14) throw new RangeError(`invalid rank ${rank}`);
  if (suit < 1 || suit > 4) throw new RangeError(`invalid suit ${suit}`);
  return { id: `gd_${suit}_${rank}_${_uid++}`, rank: Number(rank), suit: Number(suit) };
}

export function resetCardIds() {
  _uid = 0;
}

/** 两副 108 张 */
export function createGuanDanDeck() {
  resetCardIds();
  const deck = [];
  for (let copy = 0; copy < 2; copy++) {
    for (let suit = 1; suit <= 4; suit++) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push(createCard(rank, suit));
      }
    }
    deck.push(createCard(16, 0));
    deck.push(createCard(17, 0));
  }
  return deck;
}

export function cardText(c) {
  if (!c) return '';
  if (c.rank === 16) return '小王';
  if (c.rank === 17) return '大王';
  return `${SUIT_SYMBOL[c.suit] || ''}${RANK_LABEL[c.rank] || c.rank}`;
}

export function isJoker(c) {
  return c && (c.rank === 16 || c.rank === 17);
}

/**
 * 是否逢人配：红心 + 当前级牌点数
 * @param {Card} c
 * @param {number} currentRank 2–14
 */
export function isWild(c, currentRank) {
  if (!c || isJoker(c)) return false;
  return Number(c.suit) === SUIT.HEART && Number(c.rank) === Number(currentRank);
}

/**
 * 牌点比较用的逻辑序（打级时级牌仅在炸弹/单张大小有特殊序；组顺子时 2 不参与）
 * 顺子链：A-K-Q-J-10-9-8-7-6-5-4-3，A 可作 1（仅 A2345）
 */
export function straightChainRanks() {
  // 不含 2 与王
  return [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
}
