/**
 * 德州扑克 · 5 张牌力评估 + 7 选 5
 *
 * 性能要点：
 *   - 5 张：rank 位图判顺、花色计数判同花、计数桶判对/三条/四条（无大 LUT）
 *   - 7 张：固定 C(7,5)=21 组合表，无动态分配 DFS
 *   - HandResult.value 为 32-bit 可比较整数（类别 + 踢脚），compare 为 O(1)
 *
 * 牌型强度（高→低）：
 *   皇家同花顺 > 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌
 */

/**
 * @typedef {import('./card.js').Card} Card
 */

/** @enum {number} */
export const HandCategory = Object.freeze({
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9,
});

export const HAND_CATEGORY_NAME = Object.freeze({
  [HandCategory.HIGH_CARD]: '高牌',
  [HandCategory.ONE_PAIR]: '一对',
  [HandCategory.TWO_PAIR]: '两对',
  [HandCategory.THREE_OF_A_KIND]: '三条',
  [HandCategory.STRAIGHT]: '顺子',
  [HandCategory.FLUSH]: '同花',
  [HandCategory.FULL_HOUSE]: '葫芦',
  [HandCategory.FOUR_OF_A_KIND]: '四条',
  [HandCategory.STRAIGHT_FLUSH]: '同花顺',
  [HandCategory.ROYAL_FLUSH]: '皇家同花顺',
});

/**
 * @typedef {object} HandResult
 * @property {number} category     HandCategory 0–9
 * @property {string} name         中文名
 * @property {number} value        32-bit 可比整数（越大越强）
 * @property {number[]} ranks      用于展示/踢脚的关键点数（降序语义）
 * @property {Card[]} cards        构成该牌型的 5 张牌
 * @property {boolean} isRoyal
 */

// ─── 预计算：C(7,5) 下标 ─────────────────────────────────

/** @type {readonly number[][]} */
export const COMBOS_7C5 = Object.freeze(buildCombos7c5());

function buildCombos7c5() {
  /** @type {number[][]} */
  const out = [];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      for (let c = b + 1; c < 7; c++) {
        for (let d = c + 1; d < 7; d++) {
          for (let e = d + 1; e < 7; e++) {
            out.push([a, b, c, d, e]);
          }
        }
      }
    }
  }
  return out; // 21
}

// 顺子高点查找：13 位 mask（bit0=rank2 … bit12=rank14）
// 预生成「恰好 5 连」的 (mask, highRank) 表；含轮子 A2345
/** @type {Map<number, number>} mask → straight high (5–14) */
const STRAIGHT_MASK_HIGH = buildStraightTable();

function buildStraightTable() {
  const m = new Map();
  // 高牌 6–14 的五连：rank r-4..r → bits (r-2)…  令 r 为 high
  // bit index = rank - 2
  for (let high = 6; high <= 14; high++) {
    let mask = 0;
    for (let r = high - 4; r <= high; r++) {
      mask |= 1 << (r - 2);
    }
    m.set(mask, high);
  }
  // A-2-3-4-5 轮子：bits for 2,3,4,5,A(14) → high=5
  const wheel = (1 << (2 - 2)) | (1 << (3 - 2)) | (1 << (4 - 2)) | (1 << (5 - 2)) | (1 << (14 - 2));
  m.set(wheel, 5);
  return m;
}

/**
 * 从 rank 位图取顺子高点；支持「多于 5 张唯一点」时的子串
 * 对恰好 5 张牌，unique 位图 popcount ≤ 5
 * @param {number} rankBits
 * @returns {number} high 或 0
 */
function straightHighFromBits(rankBits) {
  // 恰好 5 张不同点
  if (STRAIGHT_MASK_HIGH.has(rankBits)) {
    return STRAIGHT_MASK_HIGH.get(rankBits);
  }
  // 若有重复牌型不会走到这里的 5 不同点；高牌评估用 unique bits
  // 扫描所有 5-连子 mask
  for (const [mask, high] of STRAIGHT_MASK_HIGH) {
    if ((rankBits & mask) === mask) return high;
  }
  return 0;
}

/**
 * 打包：category(4bit) + 5×rank(4bit each) = 24 bit 有效
 * rank 存 2–14，直接放 4 bit
 * @param {number} category
 * @param {number[]} ordered  长度 ≤5，高位优先
 */
export function packHandValue(category, ordered) {
  let v = category & 0xf;
  for (let i = 0; i < 5; i++) {
    v = (v << 4) | ((ordered[i] || 0) & 0xf);
  }
  return v >>> 0;
}

/**
 * 评估恰好 5 张牌
 * @param {Card[]} five  length 5
 * @returns {HandResult}
 */
export function evaluateFive(five) {
  if (!Array.isArray(five) || five.length !== 5) {
    throw new TypeError('evaluateFive requires exactly 5 cards');
  }

  // rank 计数 + 位图 + 花色
  const rankCount = new Int8Array(15); // index by rank 2–14
  let rankBits = 0;
  let suitBits = 0;
  /** 同花候选：按花色累计 */
  const suitCount = new Int8Array(5);
  for (let i = 0; i < 5; i++) {
    const r = five[i].rank | 0;
    const s = five[i].suit | 0;
    rankCount[r] += 1;
    rankBits |= 1 << (r - 2);
    suitCount[s] += 1;
    suitBits |= 1 << s;
  }

  let isFlush = false;
  for (let s = 1; s <= 4; s++) {
    if (suitCount[s] === 5) {
      isFlush = true;
      break;
    }
  }

  // 按出现次数分组
  /** @type {number[]} */
  const quads = [];
  /** @type {number[]} */
  const trips = [];
  /** @type {number[]} */
  const pairs = [];
  /** @type {number[]} */
  const singles = [];
  for (let r = 14; r >= 2; r--) {
    const c = rankCount[r];
    if (c === 4) quads.push(r);
    else if (c === 3) trips.push(r);
    else if (c === 2) pairs.push(r);
    else if (c === 1) singles.push(r);
  }

  const sHigh = straightHighFromBits(rankBits);
  const isStraight = sHigh > 0;

  /** @type {number} */
  let category;
  /** @type {number[]} */
  let ranks;

  if (isFlush && isStraight) {
    if (sHigh === 14) {
      category = HandCategory.ROYAL_FLUSH;
      ranks = [14, 13, 12, 11, 10];
    } else {
      category = HandCategory.STRAIGHT_FLUSH;
      ranks = sHigh === 5 ? [5, 4, 3, 2, 14] : [sHigh, sHigh - 1, sHigh - 2, sHigh - 3, sHigh - 4];
    }
  } else if (quads.length) {
    category = HandCategory.FOUR_OF_A_KIND;
    ranks = [quads[0], singles[0] || pairs[0] || trips[0]];
  } else if (trips.length && pairs.length) {
    category = HandCategory.FULL_HOUSE;
    ranks = [trips[0], pairs[0]];
  } else if (trips.length >= 2) {
    // 五张里两个三条不可能；若 7 选 5 拆出，此处 trips[1] 当对
    category = HandCategory.FULL_HOUSE;
    ranks = [trips[0], trips[1]];
  } else if (isFlush) {
    category = HandCategory.FLUSH;
    ranks = singles.length === 5
      ? singles.slice()
      : collectRanksDesc(rankCount);
  } else if (isStraight) {
    category = HandCategory.STRAIGHT;
    ranks = [sHigh];
  } else if (trips.length) {
    category = HandCategory.THREE_OF_A_KIND;
    ranks = [trips[0], ...singles];
  } else if (pairs.length >= 2) {
    category = HandCategory.TWO_PAIR;
    // pairs 已按 rank 降序
    const kicker = singles[0] || pairs[2] || 0;
    ranks = [pairs[0], pairs[1], kicker];
  } else if (pairs.length === 1) {
    category = HandCategory.ONE_PAIR;
    ranks = [pairs[0], ...singles];
  } else {
    category = HandCategory.HIGH_CARD;
    ranks = singles.slice();
  }

  const value = packHandValue(category, ranks);
  const cards = five.map((c) => ({ rank: c.rank, suit: c.suit, id: c.id }));

  return {
    category,
    name: HAND_CATEGORY_NAME[category],
    value,
    ranks,
    cards,
    isRoyal: category === HandCategory.ROYAL_FLUSH,
  };
}

function collectRanksDesc(rankCount) {
  /** @type {number[]} */
  const out = [];
  for (let r = 14; r >= 2; r--) {
    for (let k = 0; k < rankCount[r]; k++) out.push(r);
  }
  return out;
}

/**
 * 从 2 底牌 + 5 公共牌选出最强 5 张
 *
 * @param {Card[]} holeCards     长度 2
 * @param {Card[]} communityCards 长度 5
 * @returns {HandResult}
 */
export function evaluateBest5Of7(holeCards, communityCards) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) {
    throw new TypeError('holeCards must be Card[2]');
  }
  if (!Array.isArray(communityCards) || communityCards.length !== 5) {
    throw new TypeError('communityCards must be Card[5]');
  }

  const seven = [
    holeCards[0],
    holeCards[1],
    communityCards[0],
    communityCards[1],
    communityCards[2],
    communityCards[3],
    communityCards[4],
  ];

  // 校验点数花色
  for (let i = 0; i < 7; i++) {
    const c = seven[i];
    if (!c || c.rank < 2 || c.rank > 14 || c.suit < 1 || c.suit > 4) {
      throw new RangeError(`invalid card at ${i}`);
    }
  }

  /** @type {HandResult|null} */
  let best = null;
  /** @type {Card[]} */
  const buf = new Array(5);

  for (let ci = 0; ci < COMBOS_7C5.length; ci++) {
    const idx = COMBOS_7C5[ci];
    buf[0] = seven[idx[0]];
    buf[1] = seven[idx[1]];
    buf[2] = seven[idx[2]];
    buf[3] = seven[idx[3]];
    buf[4] = seven[idx[4]];
    const hr = evaluateFive(buf);
    if (!best || hr.value > best.value) {
      best = {
        category: hr.category,
        name: hr.name,
        value: hr.value,
        ranks: hr.ranks.slice(),
        cards: hr.cards.slice(),
        isRoyal: hr.isRoyal,
      };
    }
  }

  return /** @type {HandResult} */ (best);
}

/**
 * 比较两手牌
 * @param {HandResult} handA
 * @param {HandResult} handB
 * @returns {number}  >0 A 大；<0 B 大；0 平局（可分池）
 */
export function compareHands(handA, handB) {
  if (!handA || !handB) throw new TypeError('compareHands requires two HandResults');
  const va = handA.value | 0;
  const vb = handB.value | 0;
  if (va > vb) return 1;
  if (va < vb) return -1;
  return 0;
}

/**
 * 便捷：直接比两组 7 张来源
 * @param {Card[]} holeA
 * @param {Card[]} holeB
 * @param {Card[]} board  5
 */
export function comparePlayers(holeA, holeB, board) {
  const a = evaluateBest5Of7(holeA, board);
  const b = evaluateBest5Of7(holeB, board);
  return { cmp: compareHands(a, b), handA: a, handB: b };
}

/**
 * 解码 pack 值（调试）
 * @param {number} value
 */
export function unpackHandValue(value) {
  const v = value >>> 0;
  const ranks = [];
  let x = v;
  for (let i = 0; i < 5; i++) {
    ranks.push(x & 0xf);
    x >>>= 4;
  }
  ranks.reverse();
  const category = x & 0xf;
  return { category, ranks, name: HAND_CATEGORY_NAME[category] };
}
