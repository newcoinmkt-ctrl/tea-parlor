/**
 * 炸金花牌型识别与比较
 *
 * 强度（高→低）：
 *   豹子 > 顺金(同花顺) > 金花(同花) > 顺子 > 对子 > 单张(散牌)
 *
 * 特殊规则 · 235（豹子杀手）：
 *   - 有豹子在场（hasLeopardInGame=true）：任意花色 2·3·5 **仅大于豹子**，
 *     对其它牌型仍为最小
 *   - 无豹子在场：2·3·5 视为最小散牌
 *
 * 顺子：A-K-Q 最大；A-2-3 为最小顺（轮子）；其余按最高点
 */

/**
 * @typedef {import('./card.js').Card} Card
 */

/** @enum {number} */
export const HandType = Object.freeze({
  HIGH: 0,            // 散牌 / 单张
  PAIR: 1,            // 对子
  STRAIGHT: 2,        // 顺子
  FLUSH: 3,           // 金花（同花）
  STRAIGHT_FLUSH: 4,  // 顺金（同花顺）
  TRIPLE: 5,          // 豹子
  SPECIAL_235: 6,     // 仅比较时启用：有豹子场上的 235
});

export const HAND_TYPE_NAME = Object.freeze({
  [HandType.HIGH]: '散牌',
  [HandType.PAIR]: '对子',
  [HandType.STRAIGHT]: '顺子',
  [HandType.FLUSH]: '金花',
  [HandType.STRAIGHT_FLUSH]: '顺金',
  [HandType.TRIPLE]: '豹子',
  [HandType.SPECIAL_235]: '235杀手',
});

/**
 * @typedef {object} HandResult
 * @property {number} type           HandType
 * @property {string} name           中文名
 * @property {number[]} ranksDesc    点数降序（对子时对子点在前）
 * @property {number} primary        主比较键（对子=对子点，顺=顺高，豹子=点…）
 * @property {number[]} kickers      副比较键序列（高→低）
 * @property {number} power          可直接数值比较的强度（不含 235 特殊）
 * @property {boolean} isFlush
 * @property {boolean} isStraight
 * @property {boolean} isA23         是否 A23 轮子顺
 * @property {boolean} is235         是否 2·3·5（任意花色）
 * @property {Card[]} cards          原牌副本
 */

/**
 * 是否为 2、3、5 各一张（花色不限）
 * @param {Card[]} cards
 */
export function is235(cards) {
  if (!cards || cards.length !== 3) return false;
  const set = new Set(cards.map((c) => Number(c.rank)));
  return set.size === 3 && set.has(2) && set.has(3) && set.has(5);
}

/**
 * 是否豹子
 * @param {Card[]} cards
 */
export function isLeopard(cards) {
  if (!cards || cards.length !== 3) return false;
  const r = cards[0].rank;
  return cards.every((c) => c.rank === r);
}

/**
 * 场上是否存在豹子（用于 235 规则）
 * @param {Card[][]} hands  各家三张
 */
export function hasLeopardAmong(hands) {
  return (hands || []).some((h) => h && isLeopard(h));
}

/**
 * 顺子高点：A23 → 3（最小）；QKA → 14；其余 → 最大点
 * @param {number[]} ranksAsc  升序 3 点
 * @returns {{ high: number, isA23: boolean, straight: boolean }}
 */
function analyzeStraight(ranksAsc) {
  const [a, b, c] = ranksAsc;
  // A-2-3
  if (a === 2 && b === 3 && c === 14) {
    return { high: 3, isA23: true, straight: true };
  }
  // 普通连续
  if (b === a + 1 && c === b + 1) {
    return { high: c, isA23: false, straight: true };
  }
  return { high: 0, isA23: false, straight: false };
}

/**
 * 识别三张牌型（静态，不含 235 动态升格）
 *
 * @param {Card[]} cards  长度须为 3
 * @returns {HandResult}
 */
export function identifyHandType(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) {
    throw new TypeError('identifyHandType requires exactly 3 cards');
  }
  for (const c of cards) {
    if (!c || c.rank < 2 || c.rank > 14 || c.suit < 1 || c.suit > 4) {
      throw new RangeError(`invalid card: rank=${c?.rank} suit=${c?.suit}`);
    }
  }

  const copy = cards.map((c) => ({ rank: c.rank, suit: c.suit, id: c.id }));
  const ranksAsc = copy.map((c) => c.rank).sort((x, y) => x - y);
  const ranksDesc = ranksAsc.slice().reverse();
  const flush = copy[0].suit === copy[1].suit && copy[1].suit === copy[2].suit;
  const special235 = is235(copy);
  const { high: straightHigh, isA23, straight } = analyzeStraight(ranksAsc);

  const allSame = ranksAsc[0] === ranksAsc[2];
  const pairMid = ranksAsc[0] === ranksAsc[1] || ranksAsc[1] === ranksAsc[2];

  /** @type {number} */
  let type;
  /** @type {number} */
  let primary;
  /** @type {number[]} */
  let kickers;
  /** @type {number[]} */
  let orderedRanks = ranksDesc;

  if (allSame) {
    type = HandType.TRIPLE;
    primary = ranksAsc[0];
    kickers = [];
    orderedRanks = [primary, primary, primary];
  } else if (straight && flush) {
    type = HandType.STRAIGHT_FLUSH;
    primary = straightHigh;
    kickers = [];
    orderedRanks = isA23 ? [3, 2, 14] : ranksDesc;
  } else if (flush) {
    type = HandType.FLUSH;
    primary = ranksDesc[0];
    kickers = ranksDesc.slice(1);
    orderedRanks = ranksDesc;
  } else if (straight) {
    type = HandType.STRAIGHT;
    primary = straightHigh;
    kickers = [];
    orderedRanks = isA23 ? [3, 2, 14] : ranksDesc;
  } else if (pairMid) {
    type = HandType.PAIR;
    let pairRank;
    let kicker;
    if (ranksAsc[0] === ranksAsc[1]) {
      pairRank = ranksAsc[0];
      kicker = ranksAsc[2];
    } else {
      pairRank = ranksAsc[1];
      kicker = ranksAsc[0];
    }
    primary = pairRank;
    kickers = [kicker];
    orderedRanks = [pairRank, pairRank, kicker];
  } else {
    type = HandType.HIGH;
    primary = ranksDesc[0];
    kickers = ranksDesc.slice(1);
    orderedRanks = ranksDesc;
    // 无豹子场时 235 为最小散牌：primary/kickers 压到最低
    // 此处静态识别仍标 is235；数值在 compare 时处理
  }

  // power：type 主序 + primary + kickers（不含 SPECIAL_235）
  // 位宽足够区分：type * 1e8 + primary * 1e4 + k0 * 100 + k1
  const k0 = kickers[0] || 0;
  const k1 = kickers[1] || 0;
  const power = type * 100_000_000 + primary * 10_000 + k0 * 100 + k1;

  return {
    type,
    name: HAND_TYPE_NAME[type],
    ranksDesc: orderedRanks,
    primary,
    kickers,
    power,
    isFlush: flush,
    isStraight: straight,
    isA23,
    is235: special235,
    cards: copy,
  };
}

/**
 * 同类型精细比较（power 已涵盖；此处作双保险 + 返回语义）
 * @param {HandResult} a
 * @param {HandResult} b
 * @returns {number}  a>b → >0；a<b → <0；相等 → 0
 */
function compareSameType(a, b) {
  if (a.primary !== b.primary) return a.primary - b.primary;
  const n = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < n; i++) {
    const ka = a.kickers[i] || 0;
    const kb = b.kickers[i] || 0;
    if (ka !== kb) return ka - kb;
  }
  return 0;
}

/**
 * 比较两手牌
 *
 * 235 规则（豹子杀手）：
 *   - 双方皆 235 → 平
 *   - hasLeopardInGame 且一方 235、另一方豹子 → 235 胜
 *   - 其余凡涉及 235 → 235 恒为最小（小于任何非 235）
 *   - 非 235 双方 → 按牌型 power / 同型踢脚比较
 *
 * @param {Card[]|HandResult} handA
 * @param {Card[]|HandResult} handB
 * @param {boolean} [hasLeopardInGame=false]  场上是否有豹子
 * @returns {number}  >0 A大；<0 B大；0 完全相同（比牌常见处理：发起方负）
 */
export function compareHands(handA, handB, hasLeopardInGame = false) {
  const a = isHandResult(handA) ? handA : identifyHandType(handA);
  const b = isHandResult(handB) ? handB : identifyHandType(handB);
  const hasLeo = !!hasLeopardInGame;

  // 双方 235
  if (a.is235 && b.is235) return 0;

  // 豹子杀手：仅当场上有豹子时，235 克豹子
  if (hasLeo) {
    if (a.is235 && b.type === HandType.TRIPLE) return 1;
    if (b.is235 && a.type === HandType.TRIPLE) return -1;
  }

  // 其余情况 235 为最小散牌（无论有无豹子、是否同花形态）
  if (a.is235 && !b.is235) return -1;
  if (b.is235 && !a.is235) return 1;

  // 常规：先比 type/power，再比 primary/kickers
  if (a.power !== b.power) return a.power > b.power ? 1 : -1;
  if (a.type !== b.type) return a.type - b.type;
  return compareSameType(a, b);
}

/**
 * @param {unknown} x
 * @returns {x is HandResult}
 */
function isHandResult(x) {
  return (
    x != null
    && typeof x === 'object'
    && 'type' in x
    && 'power' in x
    && 'is235' in x
    && 'primary' in x
  );
}

/**
 * 从已识别结果 + 场上豹子标记，得到展示用名称
 * @param {HandResult} hand
 * @param {boolean} hasLeopardInGame
 */
export function displayName(hand, hasLeopardInGame = false) {
  if (hand.is235 && hasLeopardInGame) return HAND_TYPE_NAME[HandType.SPECIAL_235];
  if (hand.is235 && !hasLeopardInGame) return '散牌(235最小)';
  return hand.name;
}

/**
 * 多人亮牌排序（从大到小座位号）
 *
 * 注意：1v1 的 235 杀手在三人以上时可能与常规序构成非传递关系。
 * 多人结算采用可传递规则：
 *   - 桌面同时有 235 与豹子时：豹子垫底，235 仅高于豹子，其余按常规 power
 *   - 否则 235 为最小；其余按 power
 *
 * 1v1 比牌请用 compareHands。
 *
 * @param {Card[][]} hands
 * @param {boolean} [hasLeopardInGame]
 * @returns {number[]}
 */
export function rankHands(hands, hasLeopardInGame) {
  const identified = (hands || []).map((h) => identifyHandType(h));
  const hasLeo =
    hasLeopardInGame != null
      ? !!hasLeopardInGame
      : identified.some((h) => h.type === HandType.TRIPLE);
  const has235 = identified.some((h) => h.is235);

  function multiScore(h) {
    if (hasLeo && has235) {
      if (h.type === HandType.TRIPLE) return -2; // 被杀手压制
      if (h.is235) return -1; // 仅压豹子
    } else if (h.is235) {
      return -1;
    }
    return h.power;
  }

  const idx = identified.map((_, i) => i);
  idx.sort((i, j) => {
    const si = multiScore(identified[i]);
    const sj = multiScore(identified[j]);
    if (si !== sj) return sj - si; // 大的在前
    return i - j;
  });
  return idx;
}
