/**
 * 实时牌型胜率 · 蒙特卡洛模拟
 *
 * getWinProbability(currentHand, activePlayerCount, seenCards, options?)
 *
 * 在剩余未知牌库中随机为其余 activePlayerCount-1 名对手发 3 张，
 * 统计 currentHand 全胜 / 平局 / 落败频率。
 */

import { createDeck52 } from './card.js';
import { compareHands, isLeopard } from './hand-types.js';
import { fisherYatesShuffle } from './fair-shuffle.js';

/**
 * 牌唯一键
 * @param {{ rank: number, suit: number }} c
 */
function keyOf(c) {
  return `${Number(c.rank)}_${Number(c.suit)}`;
}

/**
 * 构造剩余牌库（52 − 手牌 − 已知公开牌）
 * @param {Array<{ rank: number, suit: number }>} currentHand
 * @param {Array<{ rank: number, suit: number }>} [seenCards]
 */
export function buildRemainingDeck(currentHand, seenCards = []) {
  const used = new Set();
  for (const c of currentHand || []) {
    if (c) used.add(keyOf(c));
  }
  for (const c of seenCards || []) {
    if (c) used.add(keyOf(c));
  }
  // 使用无 id 的标准 52 张
  const full = [];
  for (let suit = 1; suit <= 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      full.push({ rank, suit });
    }
  }
  return full.filter((c) => !used.has(keyOf(c)));
}

/**
 * 单次模拟：从 remaining 中发 opponents * 3 张
 * @returns {'win'|'tie'|'lose'|null} null=牌不够
 */
function simulateOnce(myHand, remaining, opponents, random) {
  const need = opponents * 3;
  if (remaining.length < need) return null;

  const shuffled = fisherYatesShuffle(remaining, random);
  const oppHands = [];
  let idx = 0;
  for (let o = 0; o < opponents; o++) {
    oppHands.push([shuffled[idx++], shuffled[idx++], shuffled[idx++]]);
  }

  // 是否存在豹子（我或对手）
  const allHands = [myHand, ...oppHands];
  const hasLeo = allHands.some((h) => isLeopard(h));

  let bestVs = 0; // 相对最强对手：我赢>0
  let anyLose = false;
  let allTieOrWin = true;
  let pureTieAll = true;

  for (const oh of oppHands) {
    const cmp = compareHands(myHand, oh, hasLeo);
    if (cmp < 0) {
      anyLose = true;
      allTieOrWin = false;
      pureTieAll = false;
      break;
    }
    if (cmp > 0) {
      pureTieAll = false;
      bestVs = Math.max(bestVs, cmp);
    }
    // cmp===0 平
  }

  if (anyLose) return 'lose';
  // 对所有对手不败
  if (pureTieAll && opponents > 0) return 'tie';
  // 至少赢一人且无人赢我 → 视为独赢（多人桌「最大」）
  // 若与某人平且赢其他人：炸金花通常平局规则复杂，记为 tie 份额
  const ties = oppHands.filter((oh) => compareHands(myHand, oh, hasLeo) === 0).length;
  const wins = oppHands.filter((oh) => compareHands(myHand, oh, hasLeo) > 0).length;
  if (ties > 0 && wins + ties === opponents) {
    // 无败，有平 → tie（共享）
    if (ties === opponents) return 'tie';
    // 赢部分、平部分：仍算 win（最大之一）
    return 'win';
  }
  if (wins === opponents) return 'win';
  return 'win';
}

/**
 * 蒙特卡洛胜率
 *
 * @param {Array<{ rank: number, suit: number }>} currentHand  自己 3 张
 * @param {number} activePlayerCount  含自己的争胜人数 ≥2
 * @param {Array<{ rank: number, suit: number }>} [seenCards]  已知死牌/亮牌（不含自己手牌亦可）
 * @param {{
 *   simulations?: number,
 *   random?: () => number,
 *   includeTiesAsHalf?: boolean,
 * }} [options]
 * @returns {{
 *   winProbability: number,
 *   tieProbability: number,
 *   loseProbability: number,
 *   equity: number,
 *   simulations: number,
 *   opponents: number,
 *   remainingCards: number,
 *   wins: number,
 *   ties: number,
 *   losses: number,
 *   incomplete: number,
 * }}
 */
export function getWinProbability(
  currentHand,
  activePlayerCount,
  seenCards = [],
  options = {}
) {
  if (!Array.isArray(currentHand) || currentHand.length !== 3) {
    throw new TypeError('currentHand must be 3 cards');
  }
  const n = Math.floor(Number(activePlayerCount));
  if (!Number.isFinite(n) || n < 1) {
    throw new RangeError('activePlayerCount must be >= 1');
  }
  if (n === 1) {
    return {
      winProbability: 1,
      tieProbability: 0,
      loseProbability: 0,
      equity: 1,
      simulations: 0,
      opponents: 0,
      remainingCards: buildRemainingDeck(currentHand, seenCards).length,
      wins: 0,
      ties: 0,
      losses: 0,
      incomplete: 0,
    };
  }

  const opponents = n - 1;
  const sims = Math.max(1, Math.floor(Number(options.simulations) || 2000));
  const random = options.random || Math.random;
  const halfTie = options.includeTiesAsHalf !== false;

  // seen 中若含自己的牌，buildRemainingDeck 会去重
  const remaining = buildRemainingDeck(currentHand, seenCards);
  const myHand = currentHand.map((c) => ({ rank: c.rank, suit: c.suit }));

  let wins = 0;
  let ties = 0;
  let losses = 0;
  let incomplete = 0;

  for (let i = 0; i < sims; i++) {
    const r = simulateOnce(myHand, remaining, opponents, random);
    if (r == null) {
      incomplete += 1;
      continue;
    }
    if (r === 'win') wins += 1;
    else if (r === 'tie') ties += 1;
    else losses += 1;
  }

  const done = wins + ties + losses;
  const denom = Math.max(1, done);
  const winProbability = wins / denom;
  const tieProbability = ties / denom;
  const loseProbability = losses / denom;
  const equity = halfTie
    ? (wins + ties * 0.5) / denom
    : winProbability;

  return {
    winProbability,
    tieProbability,
    loseProbability,
    equity,
    simulations: done,
    opponents,
    remainingCards: remaining.length,
    wins,
    ties,
    losses,
    incomplete,
  };
}

/**
 * 批量：对多手候选牌估算 equity（选牌/提示用）
 * @param {Array<Array<{rank:number,suit:number}>>} hands
 * @param {number} activePlayerCount
 * @param {Array} [seenCards]
 * @param {object} [options]
 */
export function rankHandsByEquity(hands, activePlayerCount, seenCards = [], options = {}) {
  return (hands || []).map((h, i) => {
    const r = getWinProbability(h, activePlayerCount, seenCards, {
      simulations: options.simulations || 800,
      random: options.random,
    });
    return { index: i, hand: h, ...r };
  }).sort((a, b) => b.equity - a.equity);
}
