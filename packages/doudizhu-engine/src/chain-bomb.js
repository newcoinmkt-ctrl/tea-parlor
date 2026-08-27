/**
 * 连炸斗地主 · 特殊牌型识别与倍率
 *
 * 连炸（Chain Bomb）：2 个及以上点数连续的纯四张炸弹。
 *   - 合法点数：3–A（14），不含 2（15）与双王（16/17）
 *   - 例：4444+5555；9999+10101010+JJJJ
 *
 * API：
 *   evaluateChainBomb(cards) → ChainBombResult | null
 *   compareChainBombs(a, b) → -1 | 0 | 1 | null
 *   canBeatWithChainBomb(prev, next) → boolean
 *   chainBombMultiplier(segmentCount, options?) → number
 *   accumulateBombMultiplier(events, options?) → number
 */

import { groupByRank } from './card.js';

/** @typedef {{ id?: string, rank: number, suit?: number }} Card */

export const ChainBombType = Object.freeze({
  CHAIN_BOMB: 'chain_bomb',
  BOMB: 'bomb',
  ROCKET: 'rocket',
  NONE: 'none',
});

/**
 * @typedef {object} ChainBombResult
 * @property {string} type              'chain_bomb'
 * @property {boolean} valid
 * @property {number} length            连炸段数 N（炸弹个数，≥2）
 * @property {number} weight            最大组炸弹点数
 * @property {number[]} body            各段点数升序，如 [4,5] / [9,10,11]
 * @property {number} cardCount         总张数 = 4 * N
 * @property {Card[]} cards
 * @property {number} multiplierFactor  默认 2^N
 */

/**
 * @typedef {object} BombLike
 *  用于比较的统一结构（连炸 / 普通炸 / 王炸）
 * @property {string} type   chain_bomb | bomb | rocket
 * @property {number} [length]
 * @property {number} [weight]
 * @property {boolean} [valid]
 */

const RANK_MIN = 3;
const RANK_ACE = 14;
const RANK_TWO = 15;
const RANK_SJ = 16;
const RANK_BJ = 17;

/** 连炸允许的点数 */
export function isChainBombRank(rank) {
  return Number.isInteger(rank) && rank >= RANK_MIN && rank <= RANK_ACE;
}

/**
 * 识别是否为合法连炸
 *
 * @param {Card[]} cards
 * @returns {ChainBombResult|null}  非连炸返回 null
 */
export function evaluateChainBomb(cards) {
  if (!Array.isArray(cards) || cards.length < 8) return null;
  if (cards.length % 4 !== 0) return null;

  const nSeg = cards.length / 4;
  if (nSeg < 2) return null;

  const groups = groupByRank(cards);
  const ranks = [...groups.keys()].sort((a, b) => a - b);

  // 恰好 nSeg 个不同点数，每点恰好 4 张
  if (ranks.length !== nSeg) return null;
  for (const r of ranks) {
    if ((groups.get(r) || []).length !== 4) return null;
    if (!isChainBombRank(r)) return null; // 禁 2、王
  }

  // 必须连续
  if (!isConsecutive(ranks)) return null;

  const weight = ranks[ranks.length - 1];
  return Object.freeze({
    type: ChainBombType.CHAIN_BOMB,
    valid: true,
    length: nSeg,
    weight,
    body: ranks.slice(),
    cardCount: cards.length,
    cards: cards.slice(),
    multiplierFactor: defaultChainFactor(nSeg),
  });
}

/**
 * 比较两个连炸（或可比较的炸弹结构）
 *
 * 规则：
 * 1. 王炸 > 任意连炸 / 普通炸
 * 2. 连炸段数多 > 段数少（3 连 > 2 连）
 * 3. 段数相同比最大组点数
 * 4. 连炸 vs 普通单炸：连炸更大（length≥2 > 1）
 * 5. 两普通炸比 weight
 *
 * @param {BombLike|ChainBombResult|null} a
 * @param {BombLike|ChainBombResult|null} b
 * @returns {-1|0|1|null}
 *   1: a 压过 b；-1: b 压过 a；0: 相等；null: 不可比（含无效）
 */
export function compareChainBombs(a, b) {
  const A = normalizeBombLike(a);
  const B = normalizeBombLike(b);
  if (!A || !B) return null;

  // 王炸最高
  if (A.type === ChainBombType.ROCKET && B.type === ChainBombType.ROCKET) return 0;
  if (A.type === ChainBombType.ROCKET) return 1;
  if (B.type === ChainBombType.ROCKET) return -1;

  // 统一「段数」：普通炸 length=1，连炸 length=N
  const lenA = bombLength(A);
  const lenB = bombLength(B);

  if (lenA !== lenB) return lenA > lenB ? 1 : -1;

  // 同段数比 weight
  const wA = A.weight ?? 0;
  const wB = B.weight ?? 0;
  if (wA === wB) return 0;
  return wA > wB ? 1 : -1;
}

/**
 * 判断 next 能否在「炸弹体系」内压过 prev
 * （仅处理炸/连炸/王炸；非炸返回 false）
 *
 * @param {BombLike|ChainBombResult|object|null} prev
 * @param {BombLike|ChainBombResult|object|null} next
 * @returns {boolean}
 */
export function canBeatWithChainBomb(prev, next) {
  const cmp = compareChainBombs(next, prev);
  return cmp === 1;
}

/**
 * N 连炸倍率：默认 2^N；可自定义暴击系数
 *
 * options:
 *   - mode: 'pow2' | 'linear' | 'custom'
 *   - base: 底数，默认 2（pow2: base^N；linear: base*N）
 *   - customFn: (N) => number
 *   - minSegments: 少于该段数时按普通炸处理（默认 2）
 *
 * @param {number} segmentCount  连炸段数 N；1 表示普通炸
 * @param {{ mode?: string, base?: number, customFn?: (n:number)=>number }} [options]
 * @returns {number}  乘到总倍率上的系数（≥1）
 */
export function chainBombMultiplier(segmentCount, options = {}) {
  const n = Math.max(0, segmentCount | 0);
  if (n <= 0) return 1;

  const mode = options.mode || 'pow2';
  const base = options.base != null ? Number(options.base) : 2;

  if (typeof options.customFn === 'function') {
    const v = Number(options.customFn(n));
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  if (mode === 'linear') {
    // 普通炸 *base，N 连炸 * (base * N) — 例如 base=2 → 2炸=2, 3连=6
    return Math.max(1, base * n);
  }

  // 默认：普通炸 2^1=2，N 连炸 2^N
  return base ** n;
}

/**
 * 累计一局中所有炸弹事件的倍率
 *
 * @param {Array<{ type: string, length?: number }>} events
 *   type: 'bomb' | 'chain_bomb' | 'rocket'
 *   length: 连炸段数；普通炸/王炸可省略
 * @param {{ chainOptions?: object, rocketFactor?: number }} [options]
 * @returns {{ totalFactor: number, details: object[] }}
 *
 * 规则：
 *   - 普通炸弹：* 2
 *   - N 连炸：* (2^N) 或 chainOptions
 *   - 王炸：默认 * 2（可 rocketFactor 覆盖；有的规则王炸 *4）
 */
export function accumulateBombMultiplier(events, options = {}) {
  const rocketFactor = options.rocketFactor != null ? Number(options.rocketFactor) : 2;
  const chainOpts = options.chainOptions || {};
  let total = 1;
  const details = [];

  for (const ev of events || []) {
    let factor = 1;
    const t = ev?.type;
    if (t === ChainBombType.ROCKET || t === 'rocket') {
      factor = rocketFactor > 0 ? rocketFactor : 2;
    } else if (t === ChainBombType.CHAIN_BOMB || t === 'chain_bomb') {
      const n = ev.length ?? ev.segmentCount ?? 2;
      factor = chainBombMultiplier(n, chainOpts);
    } else if (t === ChainBombType.BOMB || t === 'bomb') {
      factor = chainBombMultiplier(1, { mode: 'pow2', base: 2 }); // *2
    } else {
      continue;
    }
    total *= factor;
    details.push({ type: t, length: ev.length ?? 1, factor });
  }

  return { totalFactor: total, details };
}

/**
 * 从出牌解析结果中提取炸弹事件（供结算使用）
 * @param {object} parsed  parseHand / evaluateChainBomb 结果
 * @returns {{ type: string, length: number }|null}
 */
export function bombEventFromPlay(parsed) {
  if (!parsed) return null;
  if (parsed.type === 'rocket' || parsed.type === ChainBombType.ROCKET) {
    return { type: ChainBombType.ROCKET, length: 1 };
  }
  if (parsed.type === ChainBombType.CHAIN_BOMB || parsed.type === 'chain_bomb') {
    return { type: ChainBombType.CHAIN_BOMB, length: parsed.length || 2 };
  }
  if (parsed.type === 'bomb' || parsed.type === ChainBombType.BOMB) {
    return { type: ChainBombType.BOMB, length: 1 };
  }
  // 尝试对 cards 再识别连炸
  if (parsed.cards) {
    const ch = evaluateChainBomb(parsed.cards);
    if (ch) return { type: ChainBombType.CHAIN_BOMB, length: ch.length };
  }
  return null;
}

/**
 * 扩展识别：优先连炸 → 再交给 classicParser
 * @param {Card[]} cards
 * @param {(cards: Card[]) => object|null} [classicParse]
 */
export function parseHandWithChainBomb(cards, classicParse) {
  const chain = evaluateChainBomb(cards);
  if (chain) {
    return {
      type: ChainBombType.CHAIN_BOMB,
      weight: chain.weight,
      length: chain.length,
      cards: chain.cards,
      valid: true,
      body: chain.body,
      multiplierFactor: chain.multiplierFactor,
    };
  }
  if (typeof classicParse === 'function') {
    const p = classicParse(cards);
    if (p) return { ...p, valid: p.valid !== false };
  }
  return null;
}

/**
 * 扩展 canBeat：王炸 > 连炸 > 普通炸 > 同型非炸
 * @param {object|null} prev
 * @param {object|null} next
 * @param {(a,b)=>boolean} [classicCanBeat]
 */
export function canBeatWithChainBombRules(prev, next, classicCanBeat) {
  if (!next) return false;
  if (!prev) return true;

  const nextBomb = toBombLikeFromPlay(next);
  const prevBomb = toBombLikeFromPlay(prev);

  // 双方都是炸体系
  if (nextBomb && prevBomb) {
    return canBeatWithChainBomb(prevBomb, nextBomb);
  }
  // next 是炸/连炸/王炸，prev 不是 → 压过
  if (nextBomb && !prevBomb) return true;
  // prev 是炸体系，next 不是 → 压不过
  if (prevBomb && !nextBomb) return false;

  if (typeof classicCanBeat === 'function') {
    return classicCanBeat(prev, next);
  }
  // 同型同长比 weight
  if (next.type === prev.type && next.length === prev.length) {
    return next.weight > prev.weight;
  }
  return false;
}

// ─── helpers ───

function isConsecutive(sortedAsc) {
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] !== sortedAsc[i - 1] + 1) return false;
  }
  return true;
}

function defaultChainFactor(n) {
  return 2 ** n;
}

/**
 * @param {BombLike|ChainBombResult|object|null} x
 * @returns {BombLike|null}
 */
function normalizeBombLike(x) {
  if (!x) return null;
  if (x.valid === false) return null;

  // 已是标准
  if (x.type === ChainBombType.CHAIN_BOMB || x.type === 'chain_bomb') {
    if ((x.length ?? 0) < 2) return null;
    return {
      type: ChainBombType.CHAIN_BOMB,
      length: x.length,
      weight: x.weight,
      valid: true,
    };
  }
  if (x.type === ChainBombType.BOMB || x.type === 'bomb') {
    return { type: ChainBombType.BOMB, length: 1, weight: x.weight, valid: true };
  }
  if (x.type === ChainBombType.ROCKET || x.type === 'rocket') {
    return { type: ChainBombType.ROCKET, length: 1, weight: 17, valid: true };
  }

  // 尝试从 cards 识别
  if (Array.isArray(x.cards)) {
    const ch = evaluateChainBomb(x.cards);
    if (ch) return ch;
    // 单炸
    if (x.cards.length === 4) {
      const g = groupByRank(x.cards);
      if (g.size === 1) {
        const r = [...g.keys()][0];
        return { type: ChainBombType.BOMB, length: 1, weight: r, valid: true };
      }
    }
    if (x.cards.length === 2) {
      const ranks = x.cards.map((c) => c.rank).sort((a, b) => a - b);
      if (ranks[0] === RANK_SJ && ranks[1] === RANK_BJ) {
        return { type: ChainBombType.ROCKET, length: 1, weight: RANK_BJ, valid: true };
      }
    }
  }

  return null;
}

function bombLength(b) {
  if (b.type === ChainBombType.CHAIN_BOMB) return b.length || 2;
  if (b.type === ChainBombType.BOMB) return 1;
  if (b.type === ChainBombType.ROCKET) return 100; // 仅用于内部；王炸已在 compare 前置
  return 0;
}

function toBombLikeFromPlay(p) {
  if (!p) return null;
  if (p.type === 'chain_bomb' || p.type === ChainBombType.CHAIN_BOMB) {
    return normalizeBombLike(p);
  }
  if (p.type === 'bomb' || p.type === 'rocket') return normalizeBombLike(p);
  if (p.cards) {
    const ch = evaluateChainBomb(p.cards);
    if (ch) return ch;
    return normalizeBombLike(p);
  }
  return null;
}

export default {
  ChainBombType,
  evaluateChainBomb,
  compareChainBombs,
  canBeatWithChainBomb,
  chainBombMultiplier,
  accumulateBombMultiplier,
  bombEventFromPlay,
  parseHandWithChainBomb,
  canBeatWithChainBombRules,
  isChainBombRank,
};
