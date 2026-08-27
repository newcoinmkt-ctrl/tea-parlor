/**
 * 炸金花 AI 决策 · 心理博弈特征
 *
 * 主接口：
 *   makeAIDecision(aiPlayer, gameState) → AIDecision
 *
 * 性格：
 *   - aggressive  激进：爱闷牌、常加注、弱牌也诈唬
 *   - conservative 保守：早看/早弃，非对子·金花以上少出筹码
 *   - balanced    均衡（默认）
 *
 * 动作：FOLD | LOOK | CALL | RAISE | COMPARE
 */

import { identifyHandType, HandType } from './hand-types.js';
import { PlayerStatus, isContendingStatus, isActingStatus } from './constants.js';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

export const AIPersonality = Object.freeze({
  AGGRESSIVE: 'aggressive',
  CONSERVATIVE: 'conservative',
  BALANCED: 'balanced',
});

export const AIAction = Object.freeze({
  FOLD: 'FOLD',
  LOOK: 'LOOK',
  CALL: 'CALL',
  RAISE: 'RAISE',
  COMPARE: 'COMPARE',
});

/** 牌型基础强度 0–1（经验分位） */
const TYPE_STRENGTH = Object.freeze({
  [HandType.HIGH]: 0.18,
  [HandType.PAIR]: 0.48,
  [HandType.STRAIGHT]: 0.66,
  [HandType.FLUSH]: 0.78,
  [HandType.STRAIGHT_FLUSH]: 0.92,
  [HandType.TRIPLE]: 0.99,
});

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

/**
 * @param {() => number} [rng]
 */
function rand(rng) {
  const r = typeof rng === 'function' ? rng() : Math.random();
  return Math.min(0.999999, Math.max(0, Number(r) || 0));
}

/**
 * @param {string} [personality]
 */
export function normalizePersonality(personality) {
  const p = String(personality || AIPersonality.BALANCED).toLowerCase();
  if (p === 'aggro' || p === 'aggressive' || p === '激进' || p === '激进型') {
    return AIPersonality.AGGRESSIVE;
  }
  if (p === 'tight' || p === 'conservative' || p === '保守' || p === '保守型') {
    return AIPersonality.CONSERVATIVE;
  }
  return AIPersonality.BALANCED;
}

/**
 * 性格数值画像
 * @param {string} personality
 * @param {number} [aggressionOverride] 0–1
 */
export function personalityProfile(personality, aggressionOverride) {
  const kind = normalizePersonality(personality);
  /** @type {{ kind: string, bluff: number, lookEarly: number, foldWeak: number, raiseFreq: number, menLove: number, compareAggro: number, minCallType: number }} */
  let profile;
  if (kind === AIPersonality.AGGRESSIVE) {
    profile = {
      kind,
      bluff: 0.28,
      lookEarly: 0.22,   // 更爱闷
      foldWeak: 0.15,
      raiseFreq: 0.42,
      menLove: 0.72,
      compareAggro: 0.38,
      minCallType: HandType.HIGH, // 弱牌也可能跟
    };
  } else if (kind === AIPersonality.CONSERVATIVE) {
    profile = {
      kind,
      bluff: 0.04,
      lookEarly: 0.78,   // 早看
      foldWeak: 0.72,
      raiseFreq: 0.12,
      menLove: 0.18,
      compareAggro: 0.12,
      minCallType: HandType.PAIR, // 默认至少对子才肯出（金花+更稳）
    };
  } else {
    profile = {
      kind: AIPersonality.BALANCED,
      bluff: 0.12,
      lookEarly: 0.45,
      foldWeak: 0.4,
      raiseFreq: 0.25,
      menLove: 0.45,
      compareAggro: 0.22,
      minCallType: HandType.HIGH,
    };
  }

  if (aggressionOverride != null && Number.isFinite(aggressionOverride)) {
    const a = Math.min(1, Math.max(0, Number(aggressionOverride)));
    profile.bluff = profile.bluff * 0.4 + a * 0.45;
    profile.raiseFreq = profile.raiseFreq * 0.4 + a * 0.5;
    profile.foldWeak = profile.foldWeak * (1 - a * 0.5);
    profile.menLove = profile.menLove * 0.5 + a * 0.5;
    profile.compareAggro = profile.compareAggro * 0.5 + a * 0.4;
  }
  return profile;
}

// ─────────────────────────────────────────────
// 胜率 / 牌力
// ─────────────────────────────────────────────

/**
 * 单手牌强度 0–1（已看牌）
 * @param {import('./hand-types.js').HandResult|null} hand
 */
export function handStrengthScore(hand) {
  if (!hand || hand.type < 0) return 0.12;
  let s = TYPE_STRENGTH[hand.type] ?? 0.2;

  if (hand.type === HandType.TRIPLE) {
    s = 0.94 + (hand.primary / 14) * 0.06;
  } else if (hand.type === HandType.STRAIGHT_FLUSH || hand.type === HandType.STRAIGHT) {
    s += ((hand.primary || 3) / 14) * 0.06;
  } else if (hand.type === HandType.FLUSH || hand.type === HandType.HIGH) {
    const ranks = hand.ranksDesc || [];
    const hi = ranks[0] || hand.primary || 2;
    s += ((hi - 2) / 12) * 0.12;
    if (ranks[1]) s += ((ranks[1] - 2) / 12) * 0.03;
  } else if (hand.type === HandType.PAIR) {
    s = 0.38 + ((hand.primary || 2) / 14) * 0.28;
    const k = hand.kickers?.[0] || 0;
    s += (k / 14) * 0.04;
  }

  // 235 无豹子场当最小散
  if (hand.is235) s = Math.min(s, 0.08);

  return Math.min(0.995, Math.max(0.02, s));
}

/**
 * 估算胜率（对场上其余争胜者）
 *
 * - 已看牌：用牌力分位 ^ 对手数 近似「全胜概率」
 * - 未看牌：1/n 均分先验，随剩余人数微调
 *
 * @param {object} aiPlayer
 * @param {object} gameState
 * @returns {{ winRate: number, strength: number, looked: boolean, contenders: number, hand: object|null }}
 */
export function estimateWinRate(aiPlayer, gameState) {
  const contenders = getContenders(gameState, aiPlayer?.id);
  const n = Math.max(1, contenders.length);
  const nOpp = Math.max(1, n - 1);
  const looked = isLooked(aiPlayer, gameState);
  const cards = getCards(aiPlayer, gameState);

  if (!looked || !cards || cards.length !== 3) {
    // 未看：人数越少先验越高；底池大时略乐观（位置感）
    let prior = 1 / n;
    const pot = Number(gameState?.pot) || 0;
    const stake = Number(gameState?.currentMenStake) || 10;
    if (pot > stake * n * 4) prior *= 1.05;
    return {
      winRate: Math.min(0.55, Math.max(0.08, prior)),
      strength: prior,
      looked: false,
      contenders: n,
      hand: null,
    };
  }

  const hand = identifyHandType(cards);
  const strength = handStrengthScore(hand);
  // 对 nOpp 个对手同时领先 ≈ strength^nOpp（分位独立假设的保守近似）
  let winRate = strength ** nOpp;
  // 下限：超强牌面对多人仍保留较高胜率
  if (hand.type >= HandType.STRAIGHT_FLUSH) {
    winRate = Math.max(winRate, 0.75 ** nOpp);
  } else if (hand.type === HandType.TRIPLE) {
    winRate = Math.max(winRate, 0.88 ** nOpp);
  }
  winRate = Math.min(0.98, Math.max(0.02, winRate));

  return {
    winRate,
    strength,
    looked: true,
    contenders: n,
    hand,
  };
}

// ─────────────────────────────────────────────
// 局面特征
// ─────────────────────────────────────────────

/**
 * 从 betHistory / 对手 betTotal 推断加注凶度 0–1
 * @param {object} gameState
 * @param {string} selfId
 */
export function estimateTableAggression(gameState, selfId) {
  const history = gameState?.betHistory || gameState?.actionLog || [];
  let raises = 0;
  let acts = 0;
  for (const h of history) {
    if (!h || h.playerId === selfId) continue;
    acts += 1;
    const t = String(h.type || h.action || '').toLowerCase();
    if (t === 'raise' || t === 'all_in' || t === 'allin' || h.isRaise) raises += 1;
    if (Number(h.amount) > Number(h.minUnit || 0) * 1.01) raises += 0.5;
  }

  // 无历史时看对手本局投入相对底注
  if (acts === 0) {
    const players = gameState?.players || [];
    const ante = Number(gameState?.ante) || Number(gameState?.currentMenStake) || 10;
    let hot = 0;
    let n = 0;
    for (const p of players) {
      if (String(p.id) === String(selfId)) continue;
      if (!isContendingLike(p)) continue;
      n += 1;
      const bt = Number(p.betTotal) || 0;
      if (bt > ante * 3) hot += 1;
      if (bt > ante * 6) hot += 1;
    }
    return n ? Math.min(1, hot / (n * 2)) : 0.3;
  }

  return Math.min(1, raises / Math.max(1, acts));
}

/**
 * 池赔率粗略：跟注成本 / (池+跟注)
 * @param {object} aiPlayer
 * @param {object} gameState
 */
export function potOdds(aiPlayer, gameState) {
  const unit = getCallAmount(aiPlayer, gameState);
  const pot = Number(gameState?.pot) || 0;
  if (unit <= 0) return 1;
  return pot / (pot + unit);
}

function getCallAmount(aiPlayer, gameState) {
  if (gameState?.callAmount != null) return Math.max(0, Number(gameState.callAmount));
  if (aiPlayer?.callAmount != null) return Math.max(0, Number(aiPlayer.callAmount));
  const men = Number(gameState?.currentMenStake) || 10;
  const looked = isLooked(aiPlayer, gameState);
  return looked ? men * 2 : men;
}

function getRaiseAmount(aiPlayer, gameState) {
  const men = Number(gameState?.currentMenStake) || 10;
  const maxMen = Number(gameState?.maxMenStake) || men * 10;
  const looked = isLooked(aiPlayer, gameState);
  // 加注：闷注抬到 min(当前×2 或 +档位, 上限)
  const nextMen = Math.min(maxMen, Math.max(men + Math.max(1, Math.floor(men * 0.5)), men * 2));
  const amt = looked ? nextMen * 2 : nextMen;
  return { amount: amt, nextMenStake: nextMen };
}

function isLooked(aiPlayer, gameState) {
  if (aiPlayer?.looked != null) return !!aiPlayer.looked;
  if (aiPlayer?.status === PlayerStatus.LOOKED || aiPlayer?.status === PlayerStatus.ALL_IN) {
    return true;
  }
  const me = findSelf(aiPlayer, gameState);
  return !!(me?.looked || me?.status === PlayerStatus.LOOKED || me?.status === PlayerStatus.ALL_IN);
}

function getCards(aiPlayer, gameState) {
  if (Array.isArray(aiPlayer?.cards) && aiPlayer.cards.length === 3) return aiPlayer.cards;
  const me = findSelf(aiPlayer, gameState);
  if (Array.isArray(me?.cards) && me.cards.length === 3) return me.cards;
  if (Array.isArray(me?.rawCards) && me.rawCards.length === 3) return me.rawCards;
  return null;
}

function findSelf(aiPlayer, gameState) {
  const id = aiPlayer?.id ?? aiPlayer?.playerId;
  if (id == null) return null;
  return (gameState?.players || []).find((p) => String(p.id) === String(id)) || null;
}

function isContendingLike(p) {
  if (!p) return false;
  if (p.status) return isContendingStatus(p.status);
  if (p.folded || p.status === PlayerStatus.FOLDED || p.status === PlayerStatus.LOST) return false;
  return true;
}

function getContenders(gameState, selfId) {
  const players = gameState?.players || [];
  if (!players.length) {
    const n = Number(gameState?.contenderCount) || Number(gameState?.playerCount) || 3;
    return Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
  }
  return players.filter((p) => isContendingLike(p));
}

function getCompareTargets(aiPlayer, gameState) {
  const selfId = String(aiPlayer?.id ?? aiPlayer?.playerId ?? '');
  const list = gameState?.compareTargets
    || getContenders(gameState, selfId)
      .filter((p) => String(p.id) !== selfId)
      .map((p) => p.id);
  return (list || []).map(String).filter((id) => id && id !== selfId);
}

function canCompareNow(gameState) {
  if (gameState?.canCompare === false) return false;
  if (gameState?.canCompare === true) return true;
  // 默认：第 1 轮且行动不足时不可比
  const round = Number(gameState?.round) || 1;
  const actionCount = Number(gameState?.actionCount) || 0;
  const n = getContenders(gameState).length;
  if (round <= 1 && actionCount < n) return false;
  return true;
}

function canAfford(aiPlayer, gameState, amount) {
  const chips = Number(aiPlayer?.chips ?? findSelf(aiPlayer, gameState)?.chips ?? Infinity);
  return chips >= amount;
}

// ─────────────────────────────────────────────
// 主决策
// ─────────────────────────────────────────────

/**
 * @typedef {object} AIDecision
 * @property {string} action          FOLD|LOOK|CALL|RAISE|COMPARE
 * @property {number} [amount]        CALL/RAISE 金额
 * @property {string} [targetId]      COMPARE 目标
 * @property {number} [nextMenStake]  RAISE 后闷注
 * @property {number} winRate
 * @property {number} strength
 * @property {string} personality
 * @property {string} reason
 * @property {object} [debug]
 */

/**
 * AI 决策入口
 *
 * @param {object} aiPlayer
 *   { id, personality?, aggression?, looked?, cards?, chips?, status?, callAmount? }
 * @param {object} gameState
 *   { pot, currentMenStake, maxMenStake, round, maxRounds, players[],
 *     betHistory?, canCompare?, actionCount?, callAmount?, random? }
 * @returns {AIDecision}
 */
export function makeAIDecision(aiPlayer, gameState = {}) {
  const rng = gameState.random || aiPlayer?.random || Math.random;
  const profile = personalityProfile(
    aiPlayer?.personality ?? gameState?.aiPersonality,
    aiPlayer?.aggression ?? aiPlayer?.aggressionLevel
  );
  const selfId = String(aiPlayer?.id ?? aiPlayer?.playerId ?? '');
  const me = findSelf(aiPlayer, gameState);
  const status = aiPlayer?.status || me?.status || PlayerStatus.MEN;

  // 已出局 / 全押：无操作（引擎层应跳过）
  if (status === PlayerStatus.FOLDED || status === PlayerStatus.LOST) {
    return decide(AIAction.FOLD, {
      winRate: 0,
      strength: 0,
      profile,
      reason: 'already_out',
    });
  }
  if (status === PlayerStatus.ALL_IN) {
    return decide(AIAction.CALL, {
      winRate: estimateWinRate(aiPlayer, gameState).winRate,
      strength: 0,
      profile,
      reason: 'all_in_wait_showdown',
      amount: 0,
    });
  }

  const est = estimateWinRate(aiPlayer, gameState);
  const { winRate, strength, looked, hand } = est;
  const tableAggro = estimateTableAggression(gameState, selfId);
  const odds = potOdds(aiPlayer, gameState);
  const round = Number(gameState?.round) || 1;
  const maxRounds = Number(gameState?.maxRounds) || 20;
  const roundPressure = Math.min(1, round / Math.max(1, maxRounds));
  const pot = Number(gameState?.pot) || 0;
  const men = Number(gameState?.currentMenStake) || 10;
  const callAmt = getCallAmount(aiPlayer, gameState);
  const potHeat = Math.min(1, pot / Math.max(1, men * getContenders(gameState).length * 8));

  // 综合「继续」倾向 0–1
  let continueScore =
    winRate * 0.55
    + odds * 0.2
    + (1 - tableAggro) * 0.1
    + (looked ? strength * 0.15 : 0.08);

  // 激进：抬高诈唬与闷牌容忍
  if (profile.kind === AIPersonality.AGGRESSIVE) {
    continueScore += 0.12 + profile.bluff * 0.15;
    if (!looked) continueScore += profile.menLove * 0.08;
  }
  // 保守：桌面凶 / 轮次后段 / 弱牌 → 显著降分
  if (profile.kind === AIPersonality.CONSERVATIVE) {
    continueScore -= tableAggro * 0.18;
    continueScore -= potHeat * 0.12;
    if (looked && hand) {
      if (hand.type < HandType.PAIR) continueScore -= 0.35;
      else if (hand.type === HandType.PAIR && hand.primary < 10) continueScore -= 0.12;
      // 非金花以上（type < FLUSH）且非优质对：再压
      if (hand.type < HandType.FLUSH && !(hand.type === HandType.PAIR && hand.primary >= 12)) {
        continueScore -= 0.08;
      }
    }
  }

  // 猛加注桌：非强牌减分
  if (tableAggro > 0.55 && strength < 0.6) {
    continueScore -= (tableAggro - 0.55) * 0.35;
  }
  // 后段轮次：有牌力则更愿比牌/跟到底
  continueScore += roundPressure * (looked ? strength * 0.1 : -0.05);

  const r = () => rand(rng);
  const debug = {
    continueScore,
    tableAggro,
    odds,
    potHeat,
    roundPressure,
    callAmt,
    looked,
    handType: hand?.type,
    handName: hand?.name,
  };

  // ── 1) 未看牌 ──
  if (!looked) {
    return decideUnseen({
      aiPlayer,
      gameState,
      profile,
      winRate,
      strength,
      continueScore,
      tableAggro,
      potHeat,
      round,
      callAmt,
      r,
      debug,
    });
  }

  // ── 2) 已看牌 ──
  return decideSeen({
    aiPlayer,
    gameState,
    profile,
    winRate,
    strength,
    hand,
    continueScore,
    tableAggro,
    potHeat,
    roundPressure,
    callAmt,
    r,
    debug,
  });
}

function decideUnseen(ctx) {
  const {
    aiPlayer, gameState, profile, winRate, strength,
    continueScore, tableAggro, potHeat, round, callAmt, r, debug,
  } = ctx;

  // 保守：早段或凶桌优先看牌
  const lookNeed =
    profile.lookEarly
    + potHeat * 0.25
    + tableAggro * 0.2
    + (round >= 2 ? 0.15 : 0)
    - profile.menLove * 0.35;

  if (r() < Math.min(0.92, Math.max(0.05, lookNeed))) {
    return decide(AIAction.LOOK, {
      winRate,
      strength,
      profile,
      reason: profile.kind === AIPersonality.CONSERVATIVE
        ? 'conservative_peek'
        : 'info_look',
      debug,
    });
  }

  // 激进爱闷：可能闷加注诈唬
  if (profile.kind === AIPersonality.AGGRESSIVE && r() < profile.raiseFreq * 0.7) {
    const { amount, nextMenStake } = getRaiseAmount(aiPlayer, gameState);
    if (canAfford(aiPlayer, gameState, amount)) {
      return decide(AIAction.RAISE, {
        winRate,
        strength,
        profile,
        reason: 'aggressive_men_raise',
        amount,
        nextMenStake,
        debug: { ...debug, bluff: true },
      });
    }
  }

  // 保守未看：凶桌 / 高池 → 弃
  if (profile.kind === AIPersonality.CONSERVATIVE) {
    if ((tableAggro > 0.5 || potHeat > 0.55) && r() < profile.foldWeak) {
      return decide(AIAction.FOLD, {
        winRate,
        strength,
        profile,
        reason: 'conservative_men_fold_pressure',
        debug,
      });
    }
  }

  // 闷弃：继续分过低
  if (continueScore < 0.28 && r() < profile.foldWeak * 0.8) {
    return decide(AIAction.FOLD, {
      winRate,
      strength,
      profile,
      reason: 'men_fold_low_ev',
      debug,
    });
  }

  // 闷比（激进）
  if (
    canCompareNow(gameState)
    && profile.kind === AIPersonality.AGGRESSIVE
    && r() < profile.compareAggro * 0.35
  ) {
    const targets = getCompareTargets(aiPlayer, gameState);
    if (targets.length) {
      return decide(AIAction.COMPARE, {
        winRate,
        strength,
        profile,
        reason: 'aggressive_men_compare',
        targetId: targets[Math.floor(r() * targets.length)],
        debug,
      });
    }
  }

  // 默认闷跟
  if (!canAfford(aiPlayer, gameState, callAmt)) {
    // 筹码不够跟 → 放弃（引擎可再转 all-in）
    return decide(AIAction.FOLD, {
      winRate,
      strength,
      profile,
      reason: 'cannot_afford_call',
      debug,
    });
  }

  return decide(AIAction.CALL, {
    winRate,
    strength,
    profile,
    reason: profile.kind === AIPersonality.AGGRESSIVE ? 'men_call' : 'call',
    amount: callAmt,
    debug,
  });
}

function decideSeen(ctx) {
  const {
    aiPlayer, gameState, profile, winRate, strength, hand,
    continueScore, tableAggro, potHeat, roundPressure, callAmt, r, debug,
  } = ctx;

  const type = hand?.type ?? HandType.HIGH;
  const isMonster = type >= HandType.STRAIGHT_FLUSH;
  const isStrong = type >= HandType.FLUSH || (type === HandType.STRAIGHT && (hand?.primary || 0) >= 10);
  const isPairPlus = type >= HandType.PAIR;
  const isPremiumPair = type === HandType.PAIR && (hand?.primary || 0) >= 11;
  const isWeak = type === HandType.HIGH || (type === HandType.PAIR && (hand?.primary || 0) < 8);

  // ── 保守硬门槛：非对子/金花以上（顺子算可打，纯散弃）──
  // 需求：非对子/金花以上不出筹码 → 散牌弃；小对谨慎；金花+积极
  if (profile.kind === AIPersonality.CONSERVATIVE) {
    if (type === HandType.HIGH) {
      return decide(AIAction.FOLD, {
        winRate,
        strength,
        profile,
        reason: 'conservative_no_pair_plus',
        debug,
      });
    }
    // 顺子：保守可跟，少加注
    // 小对 + 凶桌 → 弃
    if (type === HandType.PAIR && (hand?.primary || 0) < 9 && tableAggro > 0.45) {
      return decide(AIAction.FOLD, {
        winRate,
        strength,
        profile,
        reason: 'conservative_small_pair_vs_aggro',
        debug,
      });
    }
    // 金花以下且非优质对：仅跟注，不比不抬（后面逻辑）
  }

  // ── 强牌：比牌 / 加注 ──
  if (isMonster || isStrong) {
    if (canCompareNow(gameState) && r() < (isMonster ? 0.65 : 0.4) + profile.compareAggro * 0.2) {
      const targets = getCompareTargets(aiPlayer, gameState);
      if (targets.length) {
        // 优先点「投入最多」的对手（像真人针对激进者）
        const targetId = pickCompareTarget(targets, gameState, r);
        return decide(AIAction.COMPARE, {
          winRate,
          strength,
          profile,
          reason: isMonster ? 'value_compare_monster' : 'value_compare_strong',
          targetId,
          debug,
        });
      }
    }
    if (r() < profile.raiseFreq + 0.25) {
      const { amount, nextMenStake } = getRaiseAmount(aiPlayer, gameState);
      if (canAfford(aiPlayer, gameState, amount)) {
        return decide(AIAction.RAISE, {
          winRate,
          strength,
          profile,
          reason: 'value_raise',
          amount,
          nextMenStake,
          debug,
        });
      }
    }
    return decide(AIAction.CALL, {
      winRate,
      strength,
      profile,
      reason: 'value_call',
      amount: callAmt,
      debug,
    });
  }

  // ── 对子 ──
  if (isPairPlus && type === HandType.PAIR) {
    if (isPremiumPair && canCompareNow(gameState) && r() < 0.3 + profile.compareAggro) {
      const targets = getCompareTargets(aiPlayer, gameState);
      if (targets.length) {
        return decide(AIAction.COMPARE, {
          winRate,
          strength,
          profile,
          reason: 'pair_compare',
          targetId: pickCompareTarget(targets, gameState, r),
          debug,
        });
      }
    }
    if (
      profile.kind === AIPersonality.AGGRESSIVE
      && isPremiumPair
      && r() < profile.raiseFreq
    ) {
      const { amount, nextMenStake } = getRaiseAmount(aiPlayer, gameState);
      if (canAfford(aiPlayer, gameState, amount)) {
        return decide(AIAction.RAISE, {
          winRate,
          strength,
          profile,
          reason: 'pair_raise',
          amount,
          nextMenStake,
          debug,
        });
      }
    }
    if (continueScore < 0.32 && !isPremiumPair) {
      return decide(AIAction.FOLD, {
        winRate,
        strength,
        profile,
        reason: 'pair_fold_pressure',
        debug,
      });
    }
    return decide(AIAction.CALL, {
      winRate,
      strength,
      profile,
      reason: 'pair_call',
      amount: callAmt,
      debug,
    });
  }

  // ── 顺子（非同花） ──
  if (type === HandType.STRAIGHT) {
    if (canCompareNow(gameState) && r() < 0.35 + profile.compareAggro * 0.3) {
      const targets = getCompareTargets(aiPlayer, gameState);
      if (targets.length) {
        return decide(AIAction.COMPARE, {
          winRate,
          strength,
          profile,
          reason: 'straight_compare',
          targetId: pickCompareTarget(targets, gameState, r),
          debug,
        });
      }
    }
    if (profile.kind !== AIPersonality.CONSERVATIVE && r() < profile.raiseFreq * 0.8) {
      const { amount, nextMenStake } = getRaiseAmount(aiPlayer, gameState);
      if (canAfford(aiPlayer, gameState, amount)) {
        return decide(AIAction.RAISE, {
          winRate,
          strength,
          profile,
          reason: 'straight_raise',
          amount,
          nextMenStake,
          debug,
        });
      }
    }
    return decide(AIAction.CALL, {
      winRate,
      strength,
      profile,
      reason: 'straight_call',
      amount: callAmt,
      debug,
    });
  }

  // ── 弱牌 / 散牌 ──
  // 诈唬（激进）
  const bluffRoll = r();
  if (
    profile.kind === AIPersonality.AGGRESSIVE
    && isWeak
    && bluffRoll < profile.bluff * (1 + (1 - tableAggro) * 0.5)
  ) {
    if (r() < 0.55) {
      const { amount, nextMenStake } = getRaiseAmount(aiPlayer, gameState);
      if (canAfford(aiPlayer, gameState, amount)) {
        return decide(AIAction.RAISE, {
          winRate,
          strength,
          profile,
          reason: 'bluff_raise',
          amount,
          nextMenStake,
          debug: { ...debug, bluff: true },
        });
      }
    }
    // 假比
    if (canCompareNow(gameState) && r() < 0.25) {
      const targets = getCompareTargets(aiPlayer, gameState);
      if (targets.length) {
        return decide(AIAction.COMPARE, {
          winRate,
          strength,
          profile,
          reason: 'bluff_compare',
          targetId: targets[Math.floor(r() * targets.length)],
          debug: { ...debug, bluff: true },
        });
      }
    }
  }

  // 弱牌弃牌
  const foldThresh =
    0.38
    + profile.foldWeak * 0.25
    + tableAggro * 0.2
    + potHeat * 0.15
    - roundPressure * 0.05;

  if (continueScore < foldThresh || (isWeak && r() < profile.foldWeak)) {
    return decide(AIAction.FOLD, {
      winRate,
      strength,
      profile,
      reason: 'weak_fold',
      debug,
    });
  }

  // 漂池跟注
  if (!canAfford(aiPlayer, gameState, callAmt)) {
    return decide(AIAction.FOLD, {
      winRate,
      strength,
      profile,
      reason: 'cannot_afford_call',
      debug,
    });
  }

  return decide(AIAction.CALL, {
    winRate,
    strength,
    profile,
    reason: 'float_call',
    amount: callAmt,
    debug,
  });
}

function pickCompareTarget(targets, gameState, r) {
  const players = gameState?.players || [];
  let best = targets[0];
  let bestBet = -1;
  for (const id of targets) {
    const p = players.find((x) => String(x.id) === String(id));
    const bt = Number(p?.betTotal) || 0;
    if (bt > bestBet) {
      bestBet = bt;
      best = id;
    }
  }
  // 70% 点火力最大者，30% 随机
  if (r() < 0.7) return best;
  return targets[Math.floor(r() * targets.length)] || best;
}

function decide(action, opts) {
  /** @type {AIDecision} */
  const out = {
    action,
    winRate: opts.winRate ?? 0,
    strength: opts.strength ?? 0,
    personality: opts.profile?.kind || AIPersonality.BALANCED,
    reason: opts.reason || '',
  };
  if (opts.amount != null) out.amount = opts.amount;
  if (opts.targetId != null) out.targetId = opts.targetId;
  if (opts.nextMenStake != null) out.nextMenStake = opts.nextMenStake;
  if (opts.debug) out.debug = opts.debug;
  return out;
}

/**
 * 把决策映射到 ZajinhuaGameEngine 调用（可选辅助）
 * @param {import('./engine.js').ZajinhuaGameEngine} engine
 * @param {string} playerId
 * @param {AIDecision} decision
 */
export function applyAIDecision(engine, playerId, decision) {
  if (!engine || !decision) return { ok: false, reason: 'bad_args' };
  switch (decision.action) {
    case AIAction.LOOK:
      return engine.lookCards(playerId);
    case AIAction.FOLD:
      return engine.fold(playerId);
    case AIAction.CALL: {
      const unit = engine.getBetUnit(playerId);
      return engine.bet(playerId, decision.amount ?? unit);
    }
    case AIAction.RAISE: {
      if (decision.amount != null) return engine.bet(playerId, decision.amount);
      const unit = engine.getBetUnit(playerId);
      const men = engine.currentMenStake;
      const next = Math.min(engine.options.maxMenStake, men * 2);
      const looked = engine.findPlayer(playerId)?.player?.looked;
      return engine.bet(playerId, looked ? next * 2 : next);
    }
    case AIAction.COMPARE:
      if (!decision.targetId) return { ok: false, reason: 'no_target' };
      return engine.comparePlayerCards(playerId, decision.targetId);
    default:
      return { ok: false, reason: 'unknown_action' };
  }
}

/**
 * 从引擎快照构造 AI 用 gameState
 * @param {object} snap  engine.getSnapshot()
 * @param {string} aiId
 * @param {object} [extra]
 */
export function gameStateFromSnapshot(snap, aiId, extra = {}) {
  const me = (snap.players || []).find((p) => String(p.id) === String(aiId));
  return {
    pot: snap.pot,
    currentMenStake: snap.currentMenStake,
    maxMenStake: snap.maxMenStake,
    round: snap.round,
    maxRounds: snap.maxRounds,
    actionCount: snap.actionCount,
    canCompare: (snap.round > 1 || (snap.actionCount || 0) >= (snap.contendingIds || []).length),
    players: (snap.players || []).map((p) => ({
      id: p.id,
      status: p.status,
      looked: p.looked,
      betTotal: p.betTotal,
      chips: p.chips,
      cards: p.id === aiId ? p.cards : null,
      allIn: p.allIn,
    })),
    callAmount: me?.betUnit,
    betHistory: extra.betHistory || [],
    random: extra.random,
    ...extra,
  };
}
