/**
 * 掼蛋牌型识别与逢人配组牌
 *
 * identifyGuanDanHand(cards, currentRank) → HandResult[]
 *   - 无逢人配：判断是否恰好构成一种合法牌型
 *   - 有 1~2 张逢人配：穷举替代，返回所有合法解释，按牌力降序
 */

import {
  isJoker,
  isWild,
  straightChainRanks,
  cardText,
} from './card.js';

/** @typedef {import('./card.js').Card} Card */

/** @enum {number} 类别序（越大越强；同类别再比 primary） */
export const HandType = Object.freeze({
  SINGLE: 1,
  PAIR: 2,
  TRIPLE: 3,
  TRIPLE_PAIR: 4,       // 三带二
  CONSEC_PAIRS: 5,      // 木板/板凳：≥3 连对
  CONSEC_TRIPLES: 6,    // 钢板：≥2 连续三张
  STRAIGHT: 7,          // 五张顺
  STRAIGHT_FLUSH: 8,    // 同花顺（也是特殊炸弹）
  BOMB: 9,              // 4+ 同点炸弹
  JOKER_BOMB: 10,       // 天王炸
});

export const HAND_TYPE_NAME = Object.freeze({
  [HandType.SINGLE]: '单张',
  [HandType.PAIR]: '对子',
  [HandType.TRIPLE]: '三张',
  [HandType.TRIPLE_PAIR]: '三带二',
  [HandType.CONSEC_PAIRS]: '三连对',
  [HandType.CONSEC_TRIPLES]: '钢板',
  [HandType.STRAIGHT]: '顺子',
  [HandType.STRAIGHT_FLUSH]: '同花顺',
  [HandType.BOMB]: '炸弹',
  [HandType.JOKER_BOMB]: '天王炸',
});

/**
 * @typedef {object} HandResult
 * @property {number} type
 * @property {string} name
 * @property {number} primary       主点数 / 连对最高点 / 顺高点 / 炸弹点数
 * @property {number} length        张数或连对数/钢板节数
 * @property {number} bombSize      炸弹张数（非炸弹为 0；同花顺记 5）
 * @property {number} power         可比强度（越大越大，含 currentRank 点序）
 * @property {number[]} pattern     逻辑点数序列（已代入逢人配）
 * @property {Record<number, number>} [wildAs]  逢人配映射到的点数
 * @property {boolean} usesWild
 * @property {Card[]} cards
 */

// ─── 点数序（级牌仅次于王，高于 A） ───

/**
 * 逻辑点数强度（用于同牌型比点）
 * 大王(17) > 小王(16) > 级牌(currentRank) > A(14) > K > … > 3 > 2
 *
 * @param {number} rank
 * @param {number} currentRank 2–14
 * @returns {number} 越大越大
 */
export function rankStrength(rank, currentRank) {
  const r = Number(rank);
  const lv = Number(currentRank);
  if (r === 17) return 100; // 大王
  if (r === 16) return 99;  // 小王
  if (r === lv) return 15;  // 级牌：高于 A(14)
  if (r >= 2 && r <= 14) return r;
  return 0;
}

/**
 * 是否炸弹类（可压普通牌型）
 * @param {HandResult} hand
 */
export function isBombLike(hand) {
  if (!hand) return false;
  return (
    hand.type === HandType.JOKER_BOMB
    || hand.type === HandType.BOMB
    || hand.type === HandType.STRAIGHT_FLUSH
  );
}

/**
 * 炸弹压制层级（越大越强）
 *
 * 天王炸 > 8+炸 > 7炸 > 6炸 > 同花顺 > 5炸 > 4炸 > 0(非炸)
 *
 * 同花顺按「5 张特殊炸弹」处理；与 5 张普通炸同张数时同花顺更高（tier 已保证）。
 *
 * @param {HandResult} hand
 * @returns {number}
 */
export function bombTier(hand) {
  if (!hand) return 0;
  if (hand.type === HandType.JOKER_BOMB) return 1000;

  if (hand.type === HandType.STRAIGHT_FLUSH) {
    // 位于 6 炸与 5 炸之间；若将来有更长同花顺可用 length
    const n = hand.bombSize || hand.length || 5;
    // 5 张同花顺 = 550；更长则略抬（仍低于 6 炸 600）
    return 500 + Math.min(99, n * 10);
  }

  if (hand.type === HandType.BOMB) {
    const n = hand.bombSize || hand.length || 0;
    if (n >= 8) return 800 + n; // 808, 809, …
    if (n === 7) return 700;
    if (n === 6) return 600;
    if (n === 5) return 500;
    if (n === 4) return 400;
    if (n > 0) return 300 + n;
    return 0;
  }

  return 0;
}

/**
 * 综合牌力（识别排序 / 调试）
 * @param {number} type
 * @param {number} primary
 * @param {number} [length]
 * @param {number} [bombSize]
 * @param {number} [currentRank=2]
 */
export function handPower(type, primary, length = 0, bombSize = 0, currentRank = 2) {
  const probe = { type, primary, length, bombSize };
  const tier = bombTier(probe);
  const rs = rankStrength(primary, currentRank);
  if (tier > 0) {
    // 炸弹链：tier 主序，再比点数
    return tier * 1_000_000 + rs;
  }
  // 普通牌型：type + 张数/连数 + 点数
  return type * 10_000_000 + (length || 1) * 100_000 + rs;
}

/**
 * handA 是否能压过 handB（可出牌压制）
 *
 * @param {HandResult} handA  拟出之牌
 * @param {HandResult} handB  上家牌
 * @param {number} currentRank  当前打级 2–14
 * @returns {boolean}
 */
export function canSuppress(handA, handB, currentRank) {
  if (!handA || !handB) return false;
  if (currentRank < 2 || currentRank > 14) {
    throw new RangeError('currentRank must be 2–14');
  }

  const tierA = bombTier(handA);
  const tierB = bombTier(handB);

  // ── 炸弹 vs 非炸弹 ──
  if (tierA > 0 && tierB === 0) return true;
  if (tierA === 0 && tierB > 0) return false;

  // ── 双方均为炸弹类 ──
  if (tierA > 0 && tierB > 0) {
    if (tierA !== tierB) return tierA > tierB;

    // 同层：比主点数（级牌序）
    // 例：同花顺 vs 同花顺；4 炸 vs 4 炸；8 炸 vs 9 炸已在 tier 区分
    const ra = rankStrength(handA.primary, currentRank);
    const rb = rankStrength(handB.primary, currentRank);
    return ra > rb;
  }

  // ── 双方普通牌型 ──
  // 必须同类型且张数/节数相同
  if (handA.type !== handB.type) return false;

  const lenA = handA.length || handA.cards?.length || 0;
  const lenB = handB.length || handB.cards?.length || 0;
  if (lenA !== lenB) return false;

  // 三连对 / 钢板：length 已是节数；顺子均为 5
  const ra = rankStrength(handA.primary, currentRank);
  const rb = rankStrength(handB.primary, currentRank);
  return ra > rb;
}

/**
 * 比较两手：>0 A 大，<0 B 大，0 相等（均不可互相压制时可能平）
 * @param {HandResult} a
 * @param {HandResult} b
 * @param {number} [currentRank=2]
 */
export function compareGuanDanHands(a, b, currentRank = 2) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (canSuppress(a, b, currentRank)) return 1;
  if (canSuppress(b, a, currentRank)) return -1;
  // 无法互相压制且非同型：用 power 兜底排序
  const pa = a.power ?? handPower(a.type, a.primary, a.length, a.bombSize, currentRank);
  const pb = b.power ?? handPower(b.type, b.primary, b.length, b.bombSize, currentRank);
  if (pa !== pb) return pa > pb ? 1 : -1;
  return 0;
}

function result(type, primary, cards, extra = {}) {
  const length = extra.length ?? cards.length;
  const bombSize = extra.bombSize ?? (type === HandType.STRAIGHT_FLUSH ? 5 : 0);
  const currentRank = extra.currentRank ?? 2;
  return {
    type,
    name: HAND_TYPE_NAME[type],
    primary,
    length,
    bombSize,
    power: handPower(type, primary, length, bombSize, currentRank),
    pattern: extra.pattern || [],
    wildAs: extra.wildAs || null,
    usesWild: !!extra.usesWild,
    cards: cards.map((c) => ({ rank: c.rank, suit: c.suit, id: c.id })),
  };
}

// ─── 无百搭时的硬识别 ───

/**
 * 不含逢人配（或已代入）的纯点数多重集是否合法
 * @param {number[]} ranks  每张牌一个点数，已展开；王用 16/17
 * @param {Card[]} cards
 * @param {{ flushSuit?: number|null }} [opts]
 */
export function identifyFixedRanks(ranks, cards, opts = {}) {
  const n = ranks.length;
  if (n === 0) return [];
  const cr = opts.currentRank ?? 2;
  const R = (type, primary, extra = {}) =>
    result(type, primary, cards, { ...extra, currentRank: cr });

  const jokers = ranks.filter((r) => r === 16 || r === 17);
  const normals = ranks.filter((r) => r !== 16 && r !== 17);

  // 天王炸
  if (n === 4 && jokers.length === 4) {
    return [R(HandType.JOKER_BOMB, 17, { pattern: [17, 17, 16, 16], bombSize: 4 })];
  }

  // 仅普通牌
  if (jokers.length && jokers.length !== n) {
    // 王不能进顺子/连对等，只能单独或天王炸
    if (n === 1) {
      return [R(HandType.SINGLE, ranks[0], { pattern: ranks.slice() })];
    }
    return [];
  }

  /** @type {Map<number, number>} */
  const cnt = new Map();
  for (const r of normals) cnt.set(r, (cnt.get(r) || 0) + 1);
  const entries = [...cnt.entries()].sort((a, b) => a[0] - b[0]);
  const distinct = entries.map((e) => e[0]);

  // 炸弹：同一点数 4+
  if (entries.length === 1 && entries[0][1] >= 4) {
    const r = entries[0][0];
    const sz = entries[0][1];
    return [R(HandType.BOMB, r, {
      pattern: Array(sz).fill(r),
      bombSize: sz,
      length: sz,
    })];
  }

  // 单 / 对 / 三
  if (entries.length === 1) {
    const r = entries[0][0];
    const c = entries[0][1];
    if (c === 1) return [R(HandType.SINGLE, r, { pattern: [r] })];
    if (c === 2) return [R(HandType.PAIR, r, { pattern: [r, r] })];
    if (c === 3) return [R(HandType.TRIPLE, r, { pattern: [r, r, r] })];
  }

  // 三带二
  if (n === 5 && entries.length === 2) {
    const [a, b] = entries[0][1] === 3 ? [entries[0], entries[1]] : [entries[1], entries[0]];
    if (a[1] === 3 && b[1] === 2) {
      return [R(HandType.TRIPLE_PAIR, a[0], {
        pattern: [a[0], a[0], a[0], b[0], b[0]],
        length: 5,
      })];
    }
  }

  // 连对：≥3 对，每点恰好 2，连续且不含 2
  if (entries.every((e) => e[1] === 2) && entries.length >= 3) {
    if (isConsecutive(distinct) && !distinct.includes(2)) {
      const hi = distinct[distinct.length - 1];
      return [R(HandType.CONSEC_PAIRS, hi, {
        pattern: expandPairs(distinct, 2),
        length: distinct.length,
      })];
    }
  }

  // 钢板：≥2 个连续三张
  if (entries.every((e) => e[1] === 3) && entries.length >= 2) {
    if (isConsecutive(distinct) && !distinct.includes(2)) {
      const hi = distinct[distinct.length - 1];
      return [R(HandType.CONSEC_TRIPLES, hi, {
        pattern: expandPairs(distinct, 3),
        length: distinct.length,
      })];
    }
  }

  // 顺子 / 同花顺：恰好 5 张，各点 1，连续
  if (n === 5 && entries.length === 5 && entries.every((e) => e[1] === 1)) {
    const seq = isStraightFive(distinct);
    if (seq) {
      const hi = seq[seq.length - 1] === 5 && seq[0] === 14 ? 5 : seq[seq.length - 1];
      // 同花？
      const suits = cards.filter((c) => !isJoker(c)).map((c) => c.suit);
      const flush = suits.length === 5 && suits.every((s) => s === suits[0]);
      // 若百搭已代入，flush 需看真实牌+指定花色 —— 由上层传入
      const isFlush = opts.flushSuit != null
        ? opts.flushSuit > 0
        : flush;
      if (isFlush) {
        return [R(HandType.STRAIGHT_FLUSH, hi, {
          pattern: seq.slice(),
          length: 5,
          bombSize: 5,
        })];
      }
      return [R(HandType.STRAIGHT, hi, {
        pattern: seq.slice(),
        length: 5,
      })];
    }
  }

  return [];
}

function expandPairs(distinct, mult) {
  const out = [];
  for (const r of distinct) {
    for (let i = 0; i < mult; i++) out.push(r);
  }
  return out;
}

function isConsecutive(sortedAsc) {
  if (sortedAsc.includes(2)) return false; // 2 不进连对/钢板
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] !== sortedAsc[i - 1] + 1) return false;
  }
  return true;
}

/**
 * 五张顺：返回点数序列（A2345 中 A 记 14 在前或 5 高）
 * @param {number[]} distinctAsc
 * @returns {number[]|null}
 */
function isStraightFive(distinctAsc) {
  if (distinctAsc.length !== 5) return null;
  if (distinctAsc.includes(2) && !(distinctAsc.includes(14) && distinctAsc.includes(3))) {
    // 含 2 仅可能 A2345
  }
  // A2345
  const set = new Set(distinctAsc);
  if (set.has(14) && set.has(2) && set.has(3) && set.has(4) && set.has(5)) {
    return [14, 2, 3, 4, 5];
  }
  // 不能含 2
  if (distinctAsc.includes(2)) return null;
  const sorted = distinctAsc.slice().sort((a, b) => a - b);
  for (let i = 1; i < 5; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return null;
  }
  return sorted;
}

// ─── 逢人配穷举 ───

/**
 * 主入口
 * @param {Card[]} cards
 * @param {number} currentRank  当前打的级 2–14
 * @returns {HandResult[]}  所有合法解释，按 power 降序
 */
export function identifyGuanDanHand(cards, currentRank) {
  if (!Array.isArray(cards) || cards.length === 0) return [];
  if (currentRank < 2 || currentRank > 14) {
    throw new RangeError('currentRank must be 2–14');
  }

  const wildCards = cards.filter((c) => isWild(c, currentRank));
  const fixedCards = cards.filter((c) => !isWild(c, currentRank));
  const wildCount = wildCards.length;

  if (wildCount > 2) {
    // 理论上最多 2 张红心级牌（两副）
    // 仍尝试当作普通级牌（不百搭）识别
  }

  // 无逢人配（或超过 2 张按非百搭）
  if (wildCount === 0) {
    const ranks = cards.map((c) => c.rank);
    return sortResults(identifyFixedRanks(ranks, cards, { currentRank }));
  }

  // 将逢人配当普通红心级牌（非百搭）也可尝试
  const asNormal = identifyFixedRanks(cards.map((c) => c.rank), cards, { currentRank });
  /** @type {HandResult[]} */
  const results = [...asNormal];

  if (wildCount >= 1 && wildCount <= 2) {
    const assignments = enumerateWildAssignments(fixedCards, wildCount, currentRank);
    for (const asg of assignments) {
      const ranks = [
        ...fixedCards.map((c) => c.rank),
        ...asg.ranks,
      ];
      // 同花顺：若指定了 flushSuit，需检查固定牌花色兼容
      let flushSuit = asg.flushSuit;
      if (flushSuit != null) {
        for (const c of fixedCards) {
          if (isJoker(c)) {
            flushSuit = null;
            break;
          }
          if (c.suit !== flushSuit) {
            flushSuit = -1; // 矛盾
            break;
          }
        }
        if (flushSuit === -1) continue;
      }
      const found = identifyFixedRanks(ranks, cards, { flushSuit, currentRank });
      for (const f of found) {
        f.usesWild = true;
        f.wildAs = asg.wildAs;
        // 重算 power（同花顺可能新识别）
        f.power = handPower(f.type, f.primary, f.length, f.bombSize, currentRank);
        results.push(f);
      }
    }
  }

  return sortResults(dedupeResults(results));
}

function sortResults(arr) {
  return arr.slice().sort((a, b) => b.power - a.power || b.type - a.type);
}

function dedupeResults(arr) {
  const seen = new Set();
  const out = [];
  for (const r of arr) {
    const key = `${r.type}|${r.primary}|${r.length}|${r.bombSize}|${(r.pattern || []).join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * 枚举逢人配可替代的点数（不可替王）
 * 并对同花顺尝试指定花色
 *
 * @param {Card[]} fixedCards
 * @param {number} wildCount 1|2
 * @param {number} currentRank
 */
function enumerateWildAssignments(fixedCards, wildCount, currentRank) {
  /** @type {Array<{ ranks: number[], wildAs: Record<number, number>, flushSuit?: number|null }>} */
  const out = [];
  const candidates = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  if (wildCount === 1) {
    for (const r of candidates) {
      out.push({ ranks: [r], wildAs: { 0: r }, flushSuit: null });
    }
    // 同花顺专用：若固定牌同花，百搭跟花
    const suits = fixedCards.filter((c) => !isJoker(c)).map((c) => c.suit);
    if (suits.length && suits.every((s) => s === suits[0])) {
      const s0 = suits[0];
      for (const r of candidates) {
        out.push({ ranks: [r], wildAs: { 0: r }, flushSuit: s0 });
      }
    } else {
      // 固定牌多种花色：对每个可能花色也试（用于 4 张同花+1 百搭）
      const suitSet = [...new Set(suits)];
      if (suitSet.length === 1) {
        /* already handled */
      } else {
        // 多数花色
        const sc = new Map();
        for (const s of suits) sc.set(s, (sc.get(s) || 0) + 1);
        for (const [s, n] of sc) {
          if (n >= fixedCards.length - 0) {
            for (const r of candidates) {
              out.push({ ranks: [r], wildAs: { 0: r }, flushSuit: s });
            }
          }
        }
      }
    }
  } else if (wildCount === 2) {
    for (const r1 of candidates) {
      for (const r2 of candidates) {
        out.push({
          ranks: [r1, r2],
          wildAs: { 0: r1, 1: r2 },
          flushSuit: null,
        });
      }
    }
    const suits = fixedCards.filter((c) => !isJoker(c)).map((c) => c.suit);
    if (suits.length === 0 || suits.every((s) => s === suits[0])) {
      const s0 = suits[0] || 3; // 默认可红心
      // 仅当固定牌为空或全同花
      if (suits.length === 0 || suits.every((s) => s === suits[0])) {
        for (const r1 of candidates) {
          for (const r2 of candidates) {
            out.push({
              ranks: [r1, r2],
              wildAs: { 0: r1, 1: r2 },
              flushSuit: suits[0] || s0,
            });
          }
        }
      }
    } else {
      const sc = new Map();
      for (const s of suits) sc.set(s, (sc.get(s) || 0) + 1);
      for (const [s, n] of sc) {
        if (n >= fixedCards.filter((c) => !isJoker(c)).length - 0) {
          for (const r1 of candidates) {
            for (const r2 of candidates) {
              out.push({
                ranks: [r1, r2],
                wildAs: { 0: r1, 1: r2 },
                flushSuit: s,
              });
            }
          }
        }
      }
    }
  }

  return out;
}

/**
 * 取最大牌型解释
 * @param {Card[]} cards
 * @param {number} currentRank
 * @returns {HandResult|null}
 */
export function bestGuanDanHand(cards, currentRank) {
  const all = identifyGuanDanHand(cards, currentRank);
  return all[0] || null;
}

/**
 * 调试：牌组描述
 */
export function describeCards(cards, currentRank) {
  return (cards || []).map((c) => {
    const t = cardText(c);
    return isWild(c, currentRank) ? `${t}*` : t;
  }).join(' ');
}
