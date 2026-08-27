/**
 * 斗地主出牌 AI 决策
 *
 * 主接口：
 *   makeAIDecision(handCards, lastPlayedHand, role, context?)
 *
 * 决策原则：
 * 1. 首出：优先减少「手数」的组合（顺子 / 飞机 / 三带等），保留炸弹与王炸。
 * 2. 跟牌：找能压上的最小合法牌；农民遇队友小牌则 Pass；敌方则尽量合适压制。
 */

import {
  parseHand,
  findBeatingHands,
  removeCards,
  HandType,
} from './rules.js';
import { groupByRank } from './card.js';

// ─────────────────────────────────────────────
// 类型说明（JSDoc，便于 TS/IDE）
// ─────────────────────────────────────────────

/**
 * @typedef {{ id?: string, rank: number, suit?: number }} Card
 *
 * @typedef {'landlord'|'farmer'} PlayerRole
 *
 * @typedef {object} ParsedHand
 * @property {string} type
 * @property {number} weight
 * @property {number} length
 * @property {Card[]} cards
 *
 * @typedef {object} AIDecisionContext
 * @property {number} [myIndex]           自己座位 0–2
 * @property {number} [landlordIndex]     地主座位
 * @property {number} [lastPlayerIndex]   打出 lastPlayedHand 的座位
 * @property {number[]} [handCounts]      各家剩余张数 [c0,c1,c2]
 * @property {boolean} [forceBeat]        强制压制（忽略队友过牌策略）
 * @property {number} [teammatePassMaxWeight=13]  队友牌 weight≤此值可过（K=13）
 *
 * @typedef {object} AIDecision
 * @property {'play'|'pass'} action
 * @property {Card[]} [cards]             action=play 时的出牌
 * @property {ParsedHand|null} [parsed]   解析后的牌型
 * @property {string} reason              决策原因（调试/UI）
 * @property {number} [score]             内部评分
 */

/** 非控制牌型（首出可优先用） */
const COMBO_TYPES = new Set([
  HandType.STRAIGHT,
  HandType.PAIR_STRAIGHT,
  HandType.PLANE,
  HandType.PLANE_ONE,
  HandType.PLANE_PAIR,
  HandType.TRIPLE_ONE,
  HandType.TRIPLE_PAIR,
  HandType.TRIPLE,
  HandType.FOUR_TWO,
  HandType.FOUR_PAIR,
  HandType.PAIR,
  HandType.SINGLE,
]);

/**
 * 判断是否炸弹/王炸
 * @param {ParsedHand} p
 */
export function isControlHand(p) {
  return p && (
    p.type === HandType.BOMB
    || p.type === HandType.ROCKET
    || p.type === HandType.CHAIN_BOMB
    || p.type === 'chain_bomb'
  );
}

/**
 * 是否与 last 同阵营（双方都是农民）
 * @param {PlayerRole} role
 * @param {AIDecisionContext} ctx
 */
export function isTeammateLastPlay(role, ctx = {}) {
  if (role !== 'farmer') return false;
  const { lastPlayerIndex, landlordIndex } = ctx;
  if (lastPlayerIndex == null || landlordIndex == null) return false;
  if (lastPlayerIndex === landlordIndex) return false; // 上家是地主
  return true; // 上家也是农民
}

/**
 * 规范化 lastPlayedHand：支持 ParsedHand 或 Card[]
 * @param {ParsedHand|Card[]|null|undefined} last
 * @returns {ParsedHand|null}
 */
export function normalizeLastHand(last) {
  if (last == null) return null;
  if (Array.isArray(last)) {
    if (!last.length) return null;
    return parseHand(last);
  }
  if (last.type && last.cards) return last;
  if (last.hand && last.hand.type) return last.hand; // { player, hand }
  return null;
}

/**
 * 出牌 AI 主入口
 *
 * @param {Card[]} handCards              当前手牌
 * @param {ParsedHand|Card[]|null} lastPlayedHand  上家牌型；null/[] 表示首出
 * @param {PlayerRole} role               'landlord' | 'farmer'
 * @param {AIDecisionContext} [context]
 * @returns {AIDecision}
 */
export function makeAIDecision(handCards, lastPlayedHand, role, context = {}) {
  if (!Array.isArray(handCards) || handCards.length === 0) {
    return { action: 'pass', reason: 'empty_hand', parsed: null };
  }

  const roleNorm = role === 'landlord' ? 'landlord' : 'farmer';
  const prev = normalizeLastHand(lastPlayedHand);

  // ── 首出 ──
  if (!prev) {
    return decideLead(handCards, roleNorm, context);
  }

  // ── 跟牌 ──
  return decideFollow(handCards, prev, roleNorm, context);
}

// ─────────────────────────────────────────────
// 首出
// ─────────────────────────────────────────────

/**
 * 首出：优先手数最少的组合，保留炸弹/王炸
 * @param {Card[]} hand
 * @param {PlayerRole} role
 * @param {AIDecisionContext} ctx
 * @returns {AIDecision}
 */
function decideLead(hand, role, ctx) {
  const options = findBeatingHands(hand, null);
  if (!options.length) {
    // 兜底：最小单张
    const sorted = hand.slice().sort((a, b) => a.rank - b.rank || (a.suit || 0) - (b.suit || 0));
    const one = parseHand([sorted[0]]);
    return {
      action: 'play',
      cards: [sorted[0]],
      parsed: one,
      reason: 'lead_fallback_single',
    };
  }

  // 能一次出完必出
  const finishing = options.find((p) => p.cards.length === hand.length);
  if (finishing) {
    return playDecision(finishing, 'lead_finish');
  }

  // 分离控制牌
  const normal = options.filter((p) => !isControlHand(p) && COMBO_TYPES.has(p.type));
  const controls = options.filter((p) => isControlHand(p));
  const pool = normal.length ? normal : controls; // 只剩炸才动炸

  // 评分：剩余手数越少越好；组合长度与类型加权；weight 小更好
  let best = null;
  let bestScore = -Infinity;

  for (const p of pool) {
    const sc = scoreLeadPlay(hand, p, role, ctx);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }

  if (!best) {
    const sorted = hand.slice().sort((a, b) => a.rank - b.rank);
    return playDecision(parseHand([sorted[0]]), 'lead_min_single');
  }

  return playDecision(best, bestScore >= 0 ? 'lead_min_hands_combo' : 'lead_best_available', bestScore);
}

/**
 * 首出评分（越大越优先）
 * - 预估出完后剩余手数 ↓
 * - 顺子/飞机/三带加分
 * - 小 weight 加分
 * - 炸弹重罚（除非 pool 只剩炸）
 */
function scoreLeadPlay(hand, play, _role, _ctx) {
  const left = removeCards(hand, play.cards);
  const remainHands = estimateMinHands(left);

  let score = 0;
  // 剩余手数越少越好（权重最高）
  score += (20 - remainHands) * 10;

  // 走张：一次多出几张
  score += play.cards.length * 1.2;

  // 优先大组合类型
  switch (play.type) {
    case HandType.PLANE_PAIR:
    case HandType.PLANE_ONE:
    case HandType.PLANE:
      score += 18;
      break;
    case HandType.PAIR_STRAIGHT:
      score += 16;
      break;
    case HandType.STRAIGHT:
      score += 15;
      break;
    case HandType.TRIPLE_PAIR:
    case HandType.TRIPLE_ONE:
      score += 12;
      break;
    case HandType.TRIPLE:
      score += 8;
      break;
    case HandType.FOUR_TWO:
    case HandType.FOUR_PAIR:
      score += 6; // 四带拆弹价值低，略优
      break;
    case HandType.PAIR:
      score += 3;
      break;
    case HandType.SINGLE:
      score += 1;
      break;
    default:
      break;
  }

  // 小牌优先
  score -= play.weight * 0.35;

  // 控制牌极重惩罚
  if (isControlHand(play)) {
    score -= 100;
  }

  // 别拆掉即将成型的炸弹（出单/对用掉炸弹里的牌）
  if (breaksBomb(hand, play)) {
    score -= 25;
  }

  return score;
}

/** 出牌是否拆散手中的四张炸弹 */
function breaksBomb(hand, play) {
  const g = groupByRank(hand);
  for (const c of play.cards) {
    const arr = g.get(c.rank) || [];
    if (arr.length === 4 && play.type !== HandType.BOMB && play.type !== HandType.FOUR_TWO && play.type !== HandType.FOUR_PAIR) {
      return true;
    }
  }
  return false;
}

/**
 * 粗估剩余手牌最少出完手数（启发式，非精确 DFS）
 * 用于比较首出方案，不要求最优拆解
 * @param {Card[]} cards
 * @returns {number}
 */
export function estimateMinHands(cards) {
  if (!cards.length) return 0;
  const g = groupByRank(cards);
  let hands = 0;
  let singles = 0;
  let pairs = 0;
  let triples = 0;
  let bombs = 0;
  let jokers = 0;

  for (const [r, cs] of g) {
    const n = cs.length;
    if (r >= 16) {
      jokers += n;
      continue;
    }
    if (n >= 4) {
      bombs += 1;
      const rem = n - 4;
      if (rem === 1) singles += 1;
      if (rem === 2) pairs += 1;
      if (rem === 3) triples += 1;
    } else if (n === 3) triples += 1;
    else if (n === 2) pairs += 1;
    else singles += 1;
  }

  // 王炸 / 单王
  if (jokers >= 2) bombs += 1;
  else singles += jokers;

  // 三带一 / 三带对 消耗
  const takePair = Math.min(triples, pairs);
  hands += takePair;
  triples -= takePair;
  pairs -= takePair;

  const takeSingle = Math.min(triples, singles);
  hands += takeSingle;
  triples -= takeSingle;
  singles -= takeSingle;

  hands += triples; // 裸三
  hands += pairs;
  hands += singles;
  hands += bombs;

  // 顺子/连对可再压缩：按牌张数给一点折扣
  const chainBonus = Math.floor(cards.length / 8);
  return Math.max(1, hands - chainBonus);
}

// ─────────────────────────────────────────────
// 跟牌
// ─────────────────────────────────────────────

/**
 * @param {Card[]} hand
 * @param {ParsedHand} prev
 * @param {PlayerRole} role
 * @param {AIDecisionContext} ctx
 * @returns {AIDecision}
 */
function decideFollow(hand, prev, role, ctx) {
  const options = findBeatingHands(hand, prev);

  // 能一次出完必出
  const finishing = options.find((p) => p.cards.length === hand.length);
  if (finishing) {
    return playDecision(finishing, 'follow_finish');
  }

  // 队友策略：农民 + 上家农民 + 分值不大 → Pass
  if (!ctx.forceBeat && shouldPassTeammate(prev, role, ctx)) {
    return {
      action: 'pass',
      reason: 'pass_teammate_low_value',
      parsed: null,
    };
  }

  if (!options.length) {
    return { action: 'pass', reason: 'no_legal_beat', parsed: null };
  }

  const normal = options.filter((p) => !isControlHand(p));
  const bombs = options.filter((p) => isControlHand(p));

  // 优先最小非炸压制
  if (normal.length) {
    normal.sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
      return typeRank(a.type) - typeRank(b.type);
    });

    const pick = pickAppropriateBeat(normal, prev, hand, role, ctx);
    return playDecision(pick, 'follow_min_legal');
  }

  // 仅炸弹可压：看是否值得
  if (bombs.length && shouldUseBomb(hand, prev, role, ctx)) {
    bombs.sort((a, b) => {
      // 小炸弹优先，王炸最后
      if (a.type === HandType.ROCKET) return 1;
      if (b.type === HandType.ROCKET) return -1;
      return a.weight - b.weight;
    });
    return playDecision(bombs[0], 'follow_bomb');
  }

  return { action: 'pass', reason: 'hold_control_cards', parsed: null };
}

/**
 * 队友出小牌则过
 */
function shouldPassTeammate(prev, role, ctx) {
  if (!isTeammateLastPlay(role, ctx)) return false;
  if (isControlHand(prev)) return false; // 队友炸了？一般不会，仍不压

  const maxW = ctx.teammatePassMaxWeight ?? 13; // ≤K 视为不大
  // 大牌型（长顺大点、飞机）也可能 weight 高
  if (prev.weight > maxW) return false;

  // 敌方（地主）牌很少时，农民应抢权，不轻易过
  if (Array.isArray(ctx.handCounts) && ctx.landlordIndex != null) {
    const enemyLeft = ctx.handCounts[ctx.landlordIndex];
    if (enemyLeft != null && enemyLeft <= 2) return false;
  }

  return true;
}

/**
 * 在多个可压方案中选「合适」大小：默认最小；
 * 若地主剩牌极少且自己是农民，可用稍大非炸牌确保压住。
 * @param {ParsedHand[]} sortedNormal weight 升序
 */
function pickAppropriateBeat(sortedNormal, prev, hand, role, ctx) {
  const smallest = sortedNormal[0];

  // 地主残牌 ≤2：农民尽量压死，可用稍大牌（仍非炸）
  if (role === 'farmer' && Array.isArray(ctx.handCounts) && ctx.landlordIndex != null) {
    const enemyLeft = ctx.handCounts[ctx.landlordIndex];
    if (enemyLeft != null && enemyLeft <= 2) {
      // 仍取最小，保证能压即可
      return smallest;
    }
  }

  // 避免用 2/王 去压很小的牌（手牌还多时）
  if (
    smallest.weight >= 15
    && prev.weight <= 10
    && hand.length > 10
    && sortedNormal.length > 1
  ) {
    // 若存在 weight < 15 的可选，用最小；否则还是 smallest
    const modest = sortedNormal.find((p) => p.weight < 15);
    if (modest) return modest;
  }

  return smallest;
}

function shouldUseBomb(hand, prev, role, ctx) {
  // 上家已是炸，只能更大炸/王炸
  if (prev.type === HandType.BOMB || prev.type === HandType.ROCKET) {
    return true;
  }

  // 敌方剩牌很少
  if (Array.isArray(ctx.handCounts)) {
    const enemies = enemyIndices(role, ctx);
    for (const i of enemies) {
      if (ctx.handCounts[i] != null && ctx.handCounts[i] <= 2) return true;
    }
  }

  // 自己牌不多，抢收
  if (hand.length <= 6) return true;

  // 强制
  if (ctx.forceBeat) return true;

  return false;
}

function enemyIndices(role, ctx) {
  const { myIndex, landlordIndex } = ctx;
  if (myIndex == null || landlordIndex == null) return [];
  if (role === 'landlord') {
    return [0, 1, 2].filter((i) => i !== myIndex);
  }
  return [landlordIndex];
}

function typeRank(type) {
  const order = [
    HandType.SINGLE,
    HandType.PAIR,
    HandType.TRIPLE,
    HandType.TRIPLE_ONE,
    HandType.TRIPLE_PAIR,
    HandType.STRAIGHT,
    HandType.PAIR_STRAIGHT,
    HandType.PLANE,
    HandType.PLANE_ONE,
    HandType.PLANE_PAIR,
    HandType.FOUR_TWO,
    HandType.FOUR_PAIR,
    HandType.BOMB,
    HandType.ROCKET,
  ];
  const i = order.indexOf(type);
  return i < 0 ? 99 : i;
}

/**
 * @param {ParsedHand} parsed
 * @param {string} reason
 * @param {number} [score]
 * @returns {AIDecision}
 */
function playDecision(parsed, reason, score) {
  if (!parsed || !parsed.cards?.length) {
    return { action: 'pass', reason: 'invalid_parsed', parsed: null };
  }
  return {
    action: 'play',
    cards: parsed.cards.slice(),
    parsed,
    reason,
    score,
  };
}

// ─────────────────────────────────────────────
// 兼容旧 decidePlay
// ─────────────────────────────────────────────

/**
 * 桥接旧 ctx 风格 → makeAIDecision
 * @param {object} ctx
 * @returns {ParsedHand|null}  出牌解析结果；null=pass
 */
export function decidePlay(ctx) {
  const {
    hand,
    prevHand,
    isLandlord,
    myIndex,
    landlordIndex,
    handCounts,
    prevPlayer,
    forceBeat,
  } = ctx;

  const role = isLandlord ? 'landlord' : 'farmer';
  const decision = makeAIDecision(hand, prevHand || null, role, {
    myIndex,
    landlordIndex,
    lastPlayerIndex: prevPlayer,
    handCounts,
    forceBeat,
  });

  if (decision.action === 'pass') return null;
  return decision.parsed || parseHand(decision.cards);
}

export default {
  makeAIDecision,
  decidePlay,
  estimateMinHands,
  isControlHand,
  isTeammateLastPlay,
  normalizeLastHand,
};
