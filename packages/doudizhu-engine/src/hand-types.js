/**
 * 斗地主牌型识别与大小比较（JJ 经典口径）
 *
 * Card:
 *   rank  3-10, 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王
 *   suit  1-4（方/梅/红/黑）；王牌可用 4 或任意
 *
 * API:
 *   identifyHandType(cards) -> HandResult
 *   compareHands(handA, handB) -> boolean  // A 能否压过 B
 */

/** @typedef {{ rank: number, suit?: number, id?: string }} Card */

/** @enum {string} */
export const HandType = Object.freeze({
  INVALID: 'invalid',
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  TRIPLE_ONE: 'triple_one', // 三带一
  TRIPLE_PAIR: 'triple_pair', // 三带对
  STRAIGHT: 'straight', // 单顺 ≥5
  PAIR_STRAIGHT: 'pair_straight', // 双顺 ≥3 对
  PLANE: 'plane', // 飞机不带
  PLANE_ONE: 'plane_one', // 飞机带单
  PLANE_PAIR: 'plane_pair', // 飞机带对
  FOUR_TWO: 'four_two', // 四带两单
  FOUR_PAIR: 'four_pair', // 四带两对
  BOMB: 'bomb',
  ROCKET: 'rocket',
});

/**
 * @typedef {object} HandResult
 * @property {string} type
 * @property {number} weight  主牌比较键（最大主体点数）
 * @property {number} length 结构长度：顺子张数 / 连对对数 / 飞机段数 / 固定牌型张数
 * @property {Card[]} cards
 * @property {boolean} valid
 * @property {number[]} [body] 飞机/顺子主体点数（升序）
 */

const RANK_MIN = 3;
const RANK_ACE = 14;
const RANK_TWO = 15;
const RANK_SJ = 16;
const RANK_BJ = 17;

/** 顺子/连对/飞机主体允许的点数：3–A（不含 2 与王） */
function isChainable(rank) {
  return rank >= RANK_MIN && rank <= RANK_ACE;
}

function isJoker(rank) {
  return rank === RANK_SJ || rank === RANK_BJ;
}

/**
 * 创建 Card
 * @param {number} rank 3–17
 * @param {number} [suit=1] 1–4
 * @returns {Card}
 */
export function createCard(rank, suit = 1) {
  if (!Number.isInteger(rank) || rank < RANK_MIN || rank > RANK_BJ) {
    throw new RangeError(`invalid rank: ${rank}`);
  }
  const s = isJoker(rank) ? 4 : suit;
  if (!isJoker(rank) && (!Number.isInteger(s) || s < 1 || s > 4)) {
    throw new RangeError(`invalid suit: ${suit}`);
  }
  return {
    rank,
    suit: s,
    id: `${rank}_${s}`,
  };
}

/**
 * 便捷：由点数数组构造牌（同点自动递增花色 1–4）
 * @param {number[]} ranks
 * @returns {Card[]}
 */
export function cardsFromRanks(ranks) {
  const used = new Map();
  return ranks.map((rank) => {
    if (isJoker(rank)) return createCard(rank, 4);
    const n = used.get(rank) || 0;
    if (n >= 4) throw new Error(`more than 4 cards of rank ${rank}`);
    used.set(rank, n + 1);
    return createCard(rank, n + 1);
  });
}

/** @param {Card[]} cards */
function groupByRank(cards) {
  /** @type {Map<number, Card[]>} */
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.rank)) map.set(c.rank, []);
    map.get(c.rank).push(c);
  }
  return map;
}

/** @param {number[]} sortedAsc */
function isConsecutive(sortedAsc) {
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] !== sortedAsc[i - 1] + 1) return false;
  }
  return true;
}

/**
 * @param {string} type
 * @param {number} weight
 * @param {number} length
 * @param {Card[]} cards
 * @param {number[]} [body]
 * @returns {HandResult}
 */
function ok(type, weight, length, cards, body) {
  const result = {
    type,
    weight,
    length,
    cards: cards.slice(),
    valid: true,
  };
  if (body) result.body = body.slice();
  return result;
}

/**
 * @param {Card[]} cards
 * @returns {HandResult}
 */
function invalid(cards = []) {
  return {
    type: HandType.INVALID,
    weight: 0,
    length: 0,
    cards: cards ? cards.slice() : [],
    valid: false,
  };
}

/**
 * 识别牌型
 * @param {Card[]} cards
 * @returns {HandResult}
 */
export function identifyHandType(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return invalid(cards || []);
  for (const c of cards) {
    if (!c || !Number.isInteger(c.rank) || c.rank < RANK_MIN || c.rank > RANK_BJ) {
      return invalid(cards);
    }
  }

  const n = cards.length;
  const groups = groupByRank(cards);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const countOf = (c) => ranks.filter((r) => groups.get(r).length === c);
  const counts = ranks.map((r) => groups.get(r).length);

  // —— 王炸 ——
  if (n === 2 && groups.has(RANK_SJ) && groups.has(RANK_BJ)
    && groups.get(RANK_SJ).length === 1 && groups.get(RANK_BJ).length === 1) {
    return ok(HandType.ROCKET, RANK_BJ, 2, cards);
  }

  // —— 普通炸弹 ——
  if (n === 4 && countOf(4).length === 1 && ranks.length === 1) {
    return ok(HandType.BOMB, ranks[0], 4, cards);
  }

  // —— 单张 ——
  if (n === 1) {
    return ok(HandType.SINGLE, cards[0].rank, 1, cards);
  }

  // —— 对子 ——
  if (n === 2 && countOf(2).length === 1) {
    return ok(HandType.PAIR, ranks[0], 1, cards);
  }

  // —— 三张 ——
  if (n === 3 && countOf(3).length === 1) {
    return ok(HandType.TRIPLE, ranks[0], 1, cards);
  }

  // —— 三带一 ——
  if (n === 4 && countOf(3).length === 1 && countOf(1).length === 1) {
    return ok(HandType.TRIPLE_ONE, countOf(3)[0], 1, cards);
  }

  // —— 三带对 ——
  if (n === 5 && countOf(3).length === 1 && countOf(2).length === 1) {
    return ok(HandType.TRIPLE_PAIR, countOf(3)[0], 1, cards);
  }

  // —— 四带两单（两张单，可同可不同；张数=6；不可带双王）——
  if (n === 6 && countOf(4).length === 1) {
    const four = countOf(4)[0];
    const kickers = cards.filter((c) => c.rank !== four);
    if (kickers.length === 2) {
      const kickerRanks = new Set(kickers.map((c) => c.rank));
      if (!(kickerRanks.has(RANK_SJ) && kickerRanks.has(RANK_BJ))) {
        return ok(HandType.FOUR_TWO, four, 1, cards);
      }
    }
  }

  // —— 四带两对（8 张：1 个四张 + 2 个对；两对点数须不同且 ≠ 主体）——
  if (n === 8 && countOf(4).length === 1 && countOf(2).length === 2) {
    const four = countOf(4)[0];
    const pairs = countOf(2);
    if (pairs.length === 2 && !pairs.includes(four)) {
      return ok(HandType.FOUR_PAIR, four, 1, cards);
    }
  }
  // 两个四张不能当作「四带两对」
  if (n === 8 && countOf(4).length === 2) {
    return invalid(cards);
  }

  // —— 单顺 ≥5：全单张、连续、仅 3–A ——
  if (n >= 5 && counts.every((c) => c === 1)) {
    if (ranks.every(isChainable) && isConsecutive(ranks)) {
      return ok(HandType.STRAIGHT, ranks[ranks.length - 1], n, cards, ranks);
    }
    return invalid(cards);
  }

  // —— 双顺 ≥3 对：全对、连续、仅 3–A ——
  if (n >= 6 && n % 2 === 0 && counts.every((c) => c === 2)) {
    if (ranks.length >= 3 && ranks.every(isChainable) && isConsecutive(ranks)) {
      return ok(HandType.PAIR_STRAIGHT, ranks[ranks.length - 1], ranks.length, cards, ranks);
    }
    return invalid(cards);
  }

  // —— 飞机 ——
  const plane = identifyPlane(cards, groups, n);
  if (plane) return plane;

  return invalid(cards);
}

/**
 * 飞机识别：
 * - 不带：3k 张，k≥2 连续三张（3–A）
 * - 带单：4k 张，k≥2，翅膀 k 张单（允许对子拆成两单，允许带王）
 * - 带对：5k 张，k≥2，翅膀恰好 k 个对
 *
 * 当存在 ≥3 张的点数可作主体时，枚举最长可行连续段。
 * @param {Card[]} cards
 * @param {Map<number, Card[]>} groups
 * @param {number} n
 * @returns {HandResult|null}
 */
function identifyPlane(cards, groups, n) {
  /** 至少 3 张、可进飞机主体的点数 */
  const tripleCapable = [...groups.keys()]
    .filter((r) => isChainable(r) && groups.get(r).length >= 3)
    .sort((a, b) => a - b);

  if (tripleCapable.length < 2) return null;

  // 所有长度 ≥2 的连续候选段（优先长段、同长优先高点）
  /** @type {number[][]} */
  const segs = [];
  for (let len = tripleCapable.length; len >= 2; len--) {
    for (let i = 0; i + len <= tripleCapable.length; i++) {
      const seg = tripleCapable.slice(i, i + len);
      if (isConsecutive(seg)) segs.push(seg);
    }
  }
  // 长优先已由外层 len 保证；同长高点优先
  segs.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return b[b.length - 1] - a[a.length - 1];
  });

  for (const body of segs) {
    const k = body.length;

    // 不带
    if (n === 3 * k) {
      if (planeUsesExactly(groups, body, 0, 0)) {
        return ok(HandType.PLANE, body[k - 1], k, cards, body);
      }
    }

    // 带单：总张 4k
    if (n === 4 * k) {
      if (planeWingsSinglesOk(groups, body, k)) {
        return ok(HandType.PLANE_ONE, body[k - 1], k, cards, body);
      }
    }

    // 带对：总张 5k
    if (n === 5 * k) {
      if (planeWingsPairsOk(groups, body, k)) {
        return ok(HandType.PLANE_PAIR, body[k - 1], k, cards, body);
      }
    }
  }

  return null;
}

/**
 * 不带飞机：除主体每点恰好 3 张外，不能有其他牌
 * @param {Map<number, Card[]>} groups
 * @param {number[]} body
 * @param {number} _extraSingles
 * @param {number} _extraPairs
 */
function planeUsesExactly(groups, body, _extraSingles, _extraPairs) {
  const bodySet = new Set(body);
  for (const [r, cs] of groups) {
    if (bodySet.has(r)) {
      if (cs.length !== 3) return false;
    } else if (cs.length > 0) {
      return false;
    }
  }
  return true;
}

/**
 * 飞机带单：主体各取 3 张，剩余恰好 k 张（任意组成）
 * 主体点数若有 4 张，可留 1 张作翅膀
 * @param {Map<number, Card[]>} groups
 * @param {number[]} body
 * @param {number} k
 */
function planeWingsSinglesOk(groups, body, k) {
  const bodySet = new Set(body);
  let wingCards = 0;
  for (const [r, cs] of groups) {
    if (bodySet.has(r)) {
      if (cs.length < 3) return false;
      wingCards += cs.length - 3;
    } else {
      wingCards += cs.length;
    }
  }
  return wingCards === k;
}

/**
 * 飞机带对：剩余牌必须恰好组成 k 个对（每对 2 张同点）
 * 主体点剩牌须为偶数且并入翅膀对
 * @param {Map<number, Card[]>} groups
 * @param {number[]} body
 * @param {number} k
 */
function planeWingsPairsOk(groups, body, k) {
  const bodySet = new Set(body);
  let pairs = 0;
  for (const [r, cs] of groups) {
    let rest = cs.length;
    if (bodySet.has(r)) {
      if (rest < 3) return false;
      rest -= 3;
    }
    if (rest % 2 !== 0) return false;
    pairs += rest / 2;
  }
  return pairs === k;
}

/**
 * 判断 handA 是否能压过 handB
 * 规则：
 * 1. 王炸最大
 * 2. 炸弹压非炸弹；炸弹比炸弹看 weight
 * 3. 其余必须同 type 且同 length，且 weight 更大
 * 4. 非法牌型不可压人，也不可被非炸弹/火箭以外方式压
 *
 * @param {HandResult} handA
 * @param {HandResult} handB
 * @returns {boolean}
 */
export function compareHands(handA, handB) {
  if (!handA || !handA.valid || handA.type === HandType.INVALID) return false;
  // 自由出：B 无效/空时，任意合法 A 可出
  if (!handB || !handB.valid || handB.type === HandType.INVALID) return true;

  // B 是王炸：无人可压
  if (handB.type === HandType.ROCKET) return false;
  // A 是王炸：压一切
  if (handA.type === HandType.ROCKET) return true;

  // A 炸弹压非炸弹
  if (handA.type === HandType.BOMB && handB.type !== HandType.BOMB) return true;
  // B 炸弹，A 非炸弹：压不过
  if (handB.type === HandType.BOMB && handA.type !== HandType.BOMB) return false;

  // 同型炸弹比点数
  if (handA.type === HandType.BOMB && handB.type === HandType.BOMB) {
    return handA.weight > handB.weight;
  }

  // 同牌型 + 同结构长度 + 更大 weight
  if (handA.type === handB.type && handA.length === handB.length) {
    return handA.weight > handB.weight;
  }

  return false;
}

/**
 * 兼容旧 API：parseHand 返回 null 表示非法
 * @param {Card[]} cards
 * @returns {HandResult|null}
 */
export function parseHand(cards) {
  const r = identifyHandType(cards);
  return r.valid ? r : null;
}

/**
 * 兼容旧 API：next 能否压过 prev
 * @param {HandResult|null} prev
 * @param {HandResult|null} next
 */
export function canBeat(prev, next) {
  if (!next || !next.valid) return false;
  if (!prev || !prev.valid) return true;
  return compareHands(next, prev);
}

export default {
  HandType,
  createCard,
  cardsFromRanks,
  identifyHandType,
  compareHands,
  parseHand,
  canBeat,
};
