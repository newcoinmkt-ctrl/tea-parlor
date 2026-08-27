/**
 * 斗地主 · 癞子（Wildcard）组合搜索
 *
 * API:
 *   getBestLaiziCombinations(cards, laiziPoint, options?)
 *     → 对该手牌中的 N 张癞子做变牌，返回所有合法解释，按牌力优先级排序
 *
 * 性能策略：
 *   - 癞子不可区分，用「各点数分配张数」星形分配，复杂度 C(W+12,W)（W≤4 → ≤1820）
 *   - 迭代 DFS + 剪枝（wild 用尽则跳过剩余点数）
 *   - 结果按 (type,weight,length,soft,subKey) 去重
 *   - 禁止递归拆牌 / 禁止对每张癞子枚举 13 叉树（避免 13^W 爆栈）
 *
 * 优先级（高→低）：
 *   王炸 > 硬炸弹 > 软炸弹 > 飞机带对/带单/不带 > 双顺 > 单顺
 *   > 四带两对/两单 > 三带对/三带一/三张 > 对子 > 单张
 */

import {
  HandType,
  identifyHandType,
  createCard,
} from './hand-types.js';

const RANK_MIN = 3;
const RANK_ACE = 14;
const RANK_TWO = 15;
const RANK_SJ = 16;
const RANK_BJ = 17;

/** 癞子可变的目标点数：3–2（不可变成王，王炸只能由真王组成） */
const SUB_RANKS = [];
for (let r = RANK_MIN; r <= RANK_TWO; r++) SUB_RANKS.push(r);

/**
 * 牌型优先级（越大越好）
 * 硬炸 / 软炸 通过 soft 标志在 comparePriority 中再细分
 */
const TYPE_PRIORITY = Object.freeze({
  [HandType.ROCKET]: 1000,
  [HandType.BOMB]: 900,
  [HandType.PLANE_PAIR]: 800,
  [HandType.PLANE_ONE]: 790,
  [HandType.PLANE]: 780,
  [HandType.PAIR_STRAIGHT]: 700,
  [HandType.STRAIGHT]: 600,
  [HandType.FOUR_PAIR]: 500,
  [HandType.FOUR_TWO]: 490,
  [HandType.TRIPLE_PAIR]: 400,
  [HandType.TRIPLE_ONE]: 390,
  [HandType.TRIPLE]: 380,
  [HandType.PAIR]: 200,
  [HandType.SINGLE]: 100,
  [HandType.INVALID]: 0,
});

/**
 * @param {object} card
 * @param {number|null|undefined} laiziPoint
 */
export function isWildCard(card, laiziPoint) {
  if (!card || laiziPoint == null) return false;
  if (card.rank >= RANK_SJ) return false; // 王永远不是癞子
  return card.rank === laiziPoint;
}

/**
 * @typedef {object} LaiziCombo
 * @property {string} type
 * @property {number} weight
 * @property {number} length
 * @property {boolean} valid
 * @property {boolean} soft          是否使用了癞子变牌
 * @property {boolean} hardBomb      硬炸弹（4 张自然同点，无癞子）
 * @property {number} wildUsed       用掉的癞子数
 * @property {number} wildTotal      手中癞子总数
 * @property {Record<string, number>} substitution  癞子→各点数的张数
 * @property {number[]} effectiveRanks 变牌后的点数多重集（升序）
 * @property {object[]} cards        原始手牌
 * @property {number} priority       排序键
 * @property {number[]} [body]
 */

/**
 * 比较两条组合的牌力（>0 表示 a 更优）
 * @param {LaiziCombo} a
 * @param {LaiziCombo} b
 */
export function compareLaiziComboPriority(a, b) {
  // 1) 大类优先级
  const pa = TYPE_PRIORITY[a.type] || 0;
  const pb = TYPE_PRIORITY[b.type] || 0;
  if (pa !== pb) return pa - pb;

  // 2) 炸弹：硬 > 软
  if (a.type === HandType.BOMB) {
    const ha = a.hardBomb ? 1 : 0;
    const hb = b.hardBomb ? 1 : 0;
    if (ha !== hb) return ha - hb;
  }

  // 3) 同型：更大 weight 更优（作为「最大牌型」导出时偏好高点）
  if (a.weight !== b.weight) return a.weight - b.weight;

  // 4) 更长结构略优（如更长顺子）
  if (a.length !== b.length) return a.length - b.length;

  // 5) 少用癞子更优（硬牌优先）
  if (a.wildUsed !== b.wildUsed) return b.wildUsed - a.wildUsed;

  return 0;
}

/**
 * 核心：对该手牌中的癞子做变牌，枚举所有合法牌型解释，按优先级排序。
 *
 * @param {Array<{rank:number,suit?:number,id?:string}>} cards
 * @param {number} laiziPoint  本局癞子点数 3–15（不可为王）
 * @param {{ maxResults?: number, preferMaxOnly?: boolean }} [options]
 * @returns {LaiziCombo[]}
 */
export function getBestLaiziCombinations(cards, laiziPoint, options = {}) {
  const maxResults = options.maxResults ?? 64;
  const preferMaxOnly = options.preferMaxOnly ?? false;

  if (!Array.isArray(cards) || cards.length === 0) return [];
  if (laiziPoint == null || !Number.isInteger(laiziPoint)
    || laiziPoint < RANK_MIN || laiziPoint > RANK_TWO) {
    // 无癞子：退化为经典识别
    const pure = identifyHandType(cards);
    if (!pure.valid) return [];
    return [toCombo(pure, cards, 0, 0, {}, false, true)];
  }

  const wilds = [];
  const normals = [];
  for (const c of cards) {
    if (isWildCard(c, laiziPoint)) wilds.push(c);
    else normals.push(c);
  }
  const W = wilds.length;
  const n = cards.length;

  // 普通牌计数（不含癞子）
  /** @type {number[]} */
  const base = new Array(18).fill(0);
  for (const c of normals) {
    if (!Number.isInteger(c.rank) || c.rank < RANK_MIN || c.rank > RANK_BJ) return [];
    base[c.rank] += 1;
  }

  /** @type {Map<string, LaiziCombo>} */
  const found = new Map();

  const pushResult = (hand, wildUsed, subMap) => {
    if (!hand || !hand.valid || hand.type === HandType.INVALID) return;
    const soft = wildUsed > 0;
    const hardBomb = hand.type === HandType.BOMB && wildUsed === 0;
    const combo = toCombo(hand, cards, wildUsed, W, subMap, soft, hardBomb);
    const key = `${combo.type}|${combo.weight}|${combo.length}|${combo.soft ? 1 : 0}|${subKey(subMap)}`;
    const prev = found.get(key);
    if (!prev || compareLaiziComboPriority(combo, prev) > 0) {
      found.set(key, combo);
    }
  };

  // ① 0 癞子变牌：癞子牌若按「原点数」参与（部分规则允许硬解）
  //    经典识别把癞子当原 rank；仅当 W===0 时等价经典
  if (W === 0) {
    const pure = identifyHandType(cards);
    if (pure.valid) pushResult(pure, 0, {});
    return sortAndTrim([...found.values()], maxResults, preferMaxOnly);
  }

  // ② 特殊：纯王炸（真王，癞子不参与）
  if (n === 2 && base[RANK_SJ] === 1 && base[RANK_BJ] === 1 && W === 0) {
    /* handled above */
  }

  // ③ 星形分配：把 W 张不可区分癞子分配到 3–2 共 13 个点数
  //    assign[i] = 分给 SUB_RANKS[i] 的癞子数
  const assign = new Array(SUB_RANKS.length).fill(0);
  const counts = base.slice(); // 复用缓冲

  /**
   * @param {number} idx
   * @param {number} left
   */
  function dfsAssign(idx, left) {
    if (left === 0) {
      // 剩余点数分配 0，直接评估
      for (let j = idx; j < SUB_RANKS.length; j++) assign[j] = 0;
      evaluateAssignment(assign, counts, base, W, n, cards, pushResult);
      return;
    }
    if (idx === SUB_RANKS.length) {
      // left>0 但点数用尽 → 非法分配，丢弃
      return;
    }
    // 剪枝：后面还有 slots 个点数可承接
    const slots = SUB_RANKS.length - idx;
    // 当前点数最多接 left（也可为 0）
    for (let use = 0; use <= left; use++) {
      assign[idx] = use;
      dfsAssign(idx + 1, left - use);
    }
    assign[idx] = 0;
  }

  dfsAssign(0, W);

  // ④ 额外：硬炸弹路径 — 若存在 4 张自然同点（不含癞子）
  for (let r = RANK_MIN; r <= RANK_TWO; r++) {
    if (base[r] === 4 && n === 4 && W === 0) {
      /* already via W===0 */
    }
  }

  return sortAndTrim([...found.values()], maxResults, preferMaxOnly);
}

/**
 * 评估一种癞子分配方案
 * @param {number[]} assign
 * @param {number[]} countsBuf
 * @param {number[]} base
 * @param {number} W
 * @param {number} n
 * @param {object[]} cards
 * @param {Function} pushResult
 */
function evaluateAssignment(assign, countsBuf, base, W, n, cards, pushResult) {
  // 构建 effective count
  for (let r = RANK_MIN; r <= RANK_BJ; r++) countsBuf[r] = base[r];
  /** @type {Record<string, number>} */
  const subMap = {};
  let used = 0;
  for (let i = 0; i < SUB_RANKS.length; i++) {
    const u = assign[i];
    if (u > 0) {
      const r = SUB_RANKS[i];
      countsBuf[r] += u;
      subMap[String(r)] = u;
      used += u;
    }
  }
  if (used !== W) return;

  // 任意点数不能超过 4（一副牌上限；癞子补齐后也不应 >4）
  for (let r = RANK_MIN; r <= RANK_TWO; r++) {
    if (countsBuf[r] > 4) return;
  }
  // 王不能被癞子增加
  if (countsBuf[RANK_SJ] > base[RANK_SJ] || countsBuf[RANK_BJ] > base[RANK_BJ]) return;

  const hand = identifyFromCounts(countsBuf, n);
  if (!hand) return;
  pushResult(hand, W, subMap);
}

/**
 * 从计数数组识别牌型（不分配真实 Card 对象，更快）
 * @param {number[]} cnt
 * @param {number} n
 */
function identifyFromCounts(cnt, n) {
  // 构造最小 fake cards 供 identifyHandType 使用
  // 仅用于正确性；热点路径可再内联
  /** @type {ReturnType<typeof createCard>[]} */
  const fake = [];
  for (let r = RANK_MIN; r <= RANK_BJ; r++) {
    const c = cnt[r] || 0;
    for (let i = 0; i < c; i++) {
      fake.push(createCard(r, Math.min(4, i + 1)));
    }
  }
  if (fake.length !== n) return null;
  const hand = identifyHandType(fake);
  return hand.valid ? hand : null;
}

/**
 * @param {import('./hand-types.js').HandResult} hand
 * @param {object[]} cards
 * @param {number} wildUsed
 * @param {number} wildTotal
 * @param {Record<string, number>} subMap
 * @param {boolean} soft
 * @param {boolean} hardBomb
 * @returns {LaiziCombo}
 */
function toCombo(hand, cards, wildUsed, wildTotal, subMap, soft, hardBomb) {
  const effectiveRanks = [];
  for (const c of hand.cards || []) effectiveRanks.push(c.rank);
  effectiveRanks.sort((a, b) => a - b);

  const combo = {
    type: hand.type,
    weight: hand.weight,
    length: hand.length,
    valid: true,
    soft: !!soft,
    hardBomb: !!(hardBomb && hand.type === HandType.BOMB && wildUsed === 0),
    wildUsed,
    wildTotal,
    substitution: { ...subMap },
    effectiveRanks,
    cards: cards.slice(),
    priority: 0,
  };
  if (hand.body) combo.body = hand.body.slice();
  combo.priority = scorePriority(combo);
  return combo;
}

/** @param {LaiziCombo} c */
function scorePriority(c) {
  let s = (TYPE_PRIORITY[c.type] || 0) * 1e6;
  if (c.type === HandType.BOMB) s += (c.hardBomb ? 5e5 : 0);
  s += c.weight * 1e3;
  s += c.length * 10;
  s -= c.wildUsed; // 少用癞子略加分
  return s;
}

function subKey(subMap) {
  return Object.keys(subMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => `${k}:${subMap[k]}`)
    .join(',');
}

/**
 * @param {LaiziCombo[]} list
 * @param {number} maxResults
 * @param {boolean} preferMaxOnly  若 true，只保留最高优先级档的全部方案
 */
function sortAndTrim(list, maxResults, preferMaxOnly) {
  list.sort((a, b) => compareLaiziComboPriority(b, a));
  if (preferMaxOnly && list.length) {
    const topType = list[0].type;
    const topHard = list[0].hardBomb;
    const same = list.filter(
      (x) => x.type === topType && (topType !== HandType.BOMB || x.hardBomb === topHard)
    );
    return same.slice(0, maxResults);
  }
  return list.slice(0, maxResults);
}

/**
 * 解析一手癞子牌：取最优解释
 * @param {object[]} cards
 * @param {number} laiziPoint
 * @returns {LaiziCombo|null}
 */
export function parseHandLaizi(cards, laiziPoint) {
  const list = getBestLaiziCombinations(cards, laiziPoint, { maxResults: 1 });
  return list[0] || null;
}

/**
 * 癞子压制：王炸 > 硬炸 > 软炸 > 同型同长比 weight
 * @param {LaiziCombo|null|undefined} prev
 * @param {LaiziCombo|null|undefined} next
 */
export function canBeatLaizi(prev, next) {
  if (!next || !next.valid) return false;
  if (!prev || !prev.valid) return true;

  if (prev.type === HandType.ROCKET) return false;
  if (next.type === HandType.ROCKET) return true;

  if (next.type === HandType.BOMB && prev.type !== HandType.BOMB) return true;
  if (prev.type === HandType.BOMB && next.type !== HandType.BOMB) return false;

  if (next.type === HandType.BOMB && prev.type === HandType.BOMB) {
    const ns = !!next.soft;
    const ps = !!prev.soft;
    if (ns !== ps) return ps && !ns; // next 硬压 prev 软
    return next.weight > prev.weight;
  }

  if (next.type !== prev.type || next.length !== prev.length) return false;
  return next.weight > prev.weight;
}

/**
 * 统计搜索空间规模（调试用）
 * @param {number} wildCount
 */
export function estimateLaiziSearchSpace(wildCount) {
  // 不可区分癞子分配到 13 个点数：C(W+13-1, W)
  const W = Math.max(0, wildCount | 0);
  const bins = 13;
  return binomial(W + bins - 1, W);
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export default {
  isWildCard,
  getBestLaiziCombinations,
  parseHandLaizi,
  canBeatLaizi,
  compareLaiziComboPriority,
  estimateLaiziSearchSpace,
  TYPE_PRIORITY,
};
