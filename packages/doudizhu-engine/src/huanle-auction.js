/**
 * 欢乐斗地主 · 叫/抢地主 + 加倍 + 倍率结算
 *
 * 流程概览：
 *   Auction (叫/抢) → 底牌归地主 → Doubling → (出牌) → calculateFinalMultipliers
 *
 * 拍卖模式 mode:
 *   - 'score'  叫分：不叫 / 1 / 2 / 3 分（3 分秒定）
 *   - 'rob'    叫抢：不叫/叫地主，之后不抢/抢地主（每抢 *2）
 */

import { applyWinLossCap } from './settlement.js';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

export const AuctionMode = Object.freeze({
  SCORE: 'score',
  ROB: 'rob',
});

/** 叫分动作 */
export const ScoreAction = Object.freeze({
  PASS: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
});

/** 叫/抢动作 */
export const RobAction = Object.freeze({
  PASS: 'pass',       // 不叫 / 不抢
  CALL: 'call',       // 叫地主（仅首轮未有地主时）
  ROB: 'rob',         // 抢地主
});

/** 加倍动作 */
export const DoubleAction = Object.freeze({
  NONE: 1,            // 不加倍
  DOUBLE: 2,          // 加倍
  SUPER: 4,           // 超级加倍（仅农民）
  LANDLORD_REDOUBLE: 2, // 地主反加倍
});

export const AuctionPhase = Object.freeze({
  CALLING: 'calling',     // 叫分 或 叫地主阶段
  ROBBING: 'robbing',     // 抢地主阶段（rob 模式）
  FINISHED: 'finished',
});

export const DoublePhase = Object.freeze({
  FARMERS: 'farmers',     // 农民加倍
  LANDLORD: 'landlord',   // 地主反加倍
  FINISHED: 'finished',
});

// ─────────────────────────────────────────────
// 叫/抢地主状态机
// ─────────────────────────────────────────────

/**
 * @typedef {object} AuctionState
 * @property {'score'|'rob'} mode
 * @property {number} playerCount
 * @property {number} starter           首叫座位
 * @property {number} turn
 * @property {string} phase             AuctionPhase
 * @property {number} landlordIndex     -1 未定
 * @property {number} baseScore         基础分（叫分模式 1–3；抢模式默认 1）
 * @property {number} callMultiplier    叫/抢累计倍率（每抢 *2）
 * @property {number} robCount          抢地主次数
 * @property {(number|null)[]} bidScores
 * @property {string[]} actions         动作日志
 * @property {number} actionCount
 * @property {boolean} finished
 * @property {string|null} reason
 * @property {number[]} callOrder       本轮行动顺序缓存
 * @property {Set<number>|number[]} passed  已「不叫」集合
 * @property {number|null} firstCaller  第一个叫地主的人（rob）
 */

/**
 * 创建拍卖状态
 * @param {{ mode?: 'score'|'rob', starter?: number, playerCount?: number, baseScore?: number, random?: () => number }} [options]
 * @returns {AuctionState}
 */
export function createAuctionState(options = {}) {
  const playerCount = options.playerCount ?? 3;
  if (playerCount !== 3) throw new Error('huanle_requires_3_players');

  const mode = options.mode === AuctionMode.SCORE ? AuctionMode.SCORE : AuctionMode.ROB;
  const rnd = typeof options.random === 'function' ? options.random : Math.random;
  const starter = options.starter != null
    ? options.starter
    : Math.floor(rnd() * playerCount);

  if (!isSeat(starter, playerCount)) throw new Error('invalid_auction_starter');

  return {
    mode,
    playerCount,
    starter,
    turn: starter,
    phase: AuctionPhase.CALLING,
    landlordIndex: -1,
    baseScore: options.baseScore ?? 1,
    callMultiplier: 1,
    robCount: 0,
    bidScores: Array(playerCount).fill(null),
    actions: [],
    actionCount: 0,
    finished: false,
    reason: null,
    firstCaller: null,
    /** @type {number[]} 已放弃叫地主的座位（rob 模式） */
    declined: [],
  };
}

/**
 * 当前玩家合法动作
 * @param {AuctionState} state
 * @returns {Array<number|string>}
 */
export function getLegalAuctionActions(state) {
  if (!state || state.finished) return [];
  if (state.mode === AuctionMode.SCORE) return getLegalScoreActions(state);
  return getLegalRobActions(state);
}

function getLegalScoreActions(state) {
  const acts = [ScoreAction.PASS];
  let cur = 0;
  for (const v of state.bidScores) {
    if (v != null && v > cur) cur = v;
  }
  for (let s = 1; s <= 3; s++) {
    if (s > cur) acts.push(s);
  }
  return acts;
}

function getLegalRobActions(state) {
  if (state.phase === AuctionPhase.CALLING) {
    // 叫地主阶段：不叫 / 叫地主
    return [RobAction.PASS, RobAction.CALL];
  }
  if (state.phase === AuctionPhase.ROBBING) {
    // 已叫过的人可抢；当前地主自己本轮不再抢（轮到其他人）
    return [RobAction.PASS, RobAction.ROB];
  }
  return [];
}

/**
 * 应用叫/抢动作
 * @param {AuctionState} state
 * @param {number} player
 * @param {number|string} action  ScoreAction 或 RobAction
 * @returns {{ ok: boolean, reason?: string, state: AuctionState }}
 */
export function applyAuctionAction(state, player, action) {
  if (!state || state.finished) {
    return { ok: false, reason: 'auction_finished', state };
  }
  if (!isSeat(player, state.playerCount) || player !== state.turn) {
    return { ok: false, reason: 'not_auction_turn', state };
  }

  if (state.mode === AuctionMode.SCORE) {
    return applyScoreAction(state, player, action);
  }
  return applyRobAction(state, player, action);
}

function applyScoreAction(state, player, action) {
  const score = Number(action);
  const legal = getLegalScoreActions(state);
  if (!legal.includes(score)) {
    return { ok: false, reason: 'invalid_score_action', state };
  }

  const next = cloneAuction(state);
  next.bidScores[player] = score;
  next.actionCount += 1;
  next.actions.push({ player, action: score, phase: next.phase });

  if (score > 0) {
    let cur = 0;
    for (const v of next.bidScores) {
      if (v != null && v > cur) cur = v;
    }
    if (score === cur) {
      next.landlordIndex = player;
      next.baseScore = score;
    }
  }

  if (score === ScoreAction.THREE) {
    next.finished = true;
    next.phase = AuctionPhase.FINISHED;
    next.baseScore = 3;
    next.landlordIndex = player;
    next.reason = 'score_bid_3';
    return { ok: true, state: next };
  }

  if (next.actionCount >= next.playerCount) {
    next.finished = true;
    next.phase = AuctionPhase.FINISHED;
    if (next.landlordIndex < 0 || next.baseScore <= 0) {
      // 全不叫：可重开或首叫当地主 1 分
      next.landlordIndex = next.starter;
      next.baseScore = 1;
      next.reason = 'score_all_pass_starter';
    } else {
      next.reason = 'score_highest';
    }
    return { ok: true, state: next };
  }

  next.turn = (player + 1) % next.playerCount;
  return { ok: true, state: next };
}

/**
 * 欢乐「叫/抢」流程：
 * 1. CALLING：每人可 不叫/叫地主；第一人叫后进入 ROBBING
 * 2. ROBBING：其余人可 不抢/抢；每抢 callMultiplier*=2，地主变更
 * 3. 若全不叫 → finished reason=all_pass（需重新发牌，由上层处理）
 * 4. 无人再抢 → 当前叫/抢者当地主
 */
function applyRobAction(state, player, action) {
  const act = String(action);
  const legal = getLegalRobActions(state);
  if (!legal.includes(act)) {
    return { ok: false, reason: 'invalid_rob_action', state };
  }

  const next = cloneAuction(state);
  next.actionCount += 1;
  next.actions.push({ player, action: act, phase: next.phase });

  if (next.phase === AuctionPhase.CALLING) {
    if (act === RobAction.PASS) {
      next.declined = [...next.declined, player];
      next.bidScores[player] = 0;
      // 三人都不叫
      if (next.declined.length >= next.playerCount) {
        next.finished = true;
        next.phase = AuctionPhase.FINISHED;
        next.reason = 'rob_all_pass';
        next.landlordIndex = -1;
        return { ok: true, state: next };
      }
      // 下一位叫
      next.turn = nextCallTurn(next, player);
      if (next.turn < 0) {
        next.finished = true;
        next.phase = AuctionPhase.FINISHED;
        next.reason = 'rob_all_pass';
        next.landlordIndex = -1;
      }
      return { ok: true, state: next };
    }

    // CALL
    next.landlordIndex = player;
    next.firstCaller = player;
    next.baseScore = next.baseScore || 1;
    next.bidScores[player] = 1;
    next.phase = AuctionPhase.ROBBING;
    // 下一位从下家开始抢
    next.turn = (player + 1) % next.playerCount;
    // 记录本轮还需询问的人数（除自己外 2 人，可多轮抢）
    next._robNeedRespond = next.playerCount - 1;
    next._robResponded = 0;
    next._lastRobber = player;
    return { ok: true, state: next };
  }

  // ROBBING
  if (act === RobAction.PASS) {
    next._robResponded = (next._robResponded || 0) + 1;
    if (next._robResponded >= (next._robNeedRespond || 2)) {
      // 无人再抢，结束
      return finishRob(next, 'rob_no_more');
    }
    next.turn = nextRobTurn(next, player);
    return { ok: true, state: next };
  }

  // ROB：倍率 *2，地主易主，开启新一轮询问
  next.robCount += 1;
  next.callMultiplier *= 2;
  next.landlordIndex = player;
  next._lastRobber = player;
  next.bidScores[player] = (next.bidScores[player] || 0) + 1;
  next._robResponded = 0;
  next._robNeedRespond = next.playerCount - 1;
  next.turn = (player + 1) % next.playerCount;
  return { ok: true, state: next };
}

function finishRob(state, reason) {
  state.finished = true;
  state.phase = AuctionPhase.FINISHED;
  state.reason = reason;
  if (state.landlordIndex < 0 && state.firstCaller != null) {
    state.landlordIndex = state.firstCaller;
  }
  return { ok: true, state };
}

function nextCallTurn(state, from) {
  for (let step = 1; step <= state.playerCount; step++) {
    const i = (from + step) % state.playerCount;
    if (!state.declined.includes(i)) return i;
  }
  return -1;
}

function nextRobTurn(state, from) {
  // 跳过刚抢到地主的人，找下一位
  return (from + 1) % state.playerCount;
}

/**
 * 拍卖结束后：底牌给地主
 * @param {Card[][]} hands
 * @param {Card[]} bottomCards
 * @param {number} landlordIndex
 */
export function assignBottomToLandlord(hands, bottomCards, landlordIndex) {
  if (!isSeat(landlordIndex, 3)) throw new Error('invalid_landlord');
  const next = hands.map((h) => h.slice());
  next[landlordIndex] = next[landlordIndex].concat(bottomCards.slice());
  return next;
}

// ─────────────────────────────────────────────
// 加倍阶段
// ─────────────────────────────────────────────

/**
 * @typedef {object} DoublingState
 * @property {number} landlordIndex
 * @property {number[]} farmerFactors   每人系数（地主位也占槽，默认 1）
 * @property {boolean[]} decided
 * @property {string} phase
 * @property {boolean} finished
 * @property {boolean} allowSuperDouble
 * @property {boolean} allowLandlordRedouble
 */

/**
 * @param {{ landlordIndex: number, allowSuperDouble?: boolean, allowLandlordRedouble?: boolean }} options
 */
export function createDoublingState(options) {
  const landlordIndex = options.landlordIndex;
  if (!isSeat(landlordIndex, 3)) throw new Error('invalid_landlord');
  return {
    landlordIndex,
    factors: [1, 1, 1],
    decided: [false, false, false],
    phase: DoublePhase.FARMERS,
    finished: false,
    allowSuperDouble: options.allowSuperDouble !== false,
    allowLandlordRedouble: options.allowLandlordRedouble !== false,
  };
}

/**
 * 农民加倍 / 地主反加倍
 * @param {DoublingState} state
 * @param {number} player
 * @param {number} factor  农民: 1|2|4；地主反加倍: 1|2
 */
export function applyDoubleAction(state, player, factor) {
  if (!state || state.finished) {
    return { ok: false, reason: 'double_finished', state };
  }
  if (!isSeat(player, 3)) {
    return { ok: false, reason: 'invalid_player', state };
  }
  if (state.decided[player]) {
    return { ok: false, reason: 'already_decided', state };
  }

  const next = cloneDouble(state);
  const isLandlord = player === next.landlordIndex;

  if (next.phase === DoublePhase.FARMERS) {
    if (isLandlord) {
      return { ok: false, reason: 'landlord_wait_farmers', state };
    }
    const legal = next.allowSuperDouble ? [1, 2, 4] : [1, 2];
    if (!legal.includes(factor)) {
      return { ok: false, reason: 'invalid_farmer_factor', state };
    }
    next.factors[player] = factor;
    next.decided[player] = true;

    // 两个农民都决定后 → 地主反加倍
    const farmersDone = [0, 1, 2]
      .filter((i) => i !== next.landlordIndex)
      .every((i) => next.decided[i]);

    if (farmersDone) {
      if (next.allowLandlordRedouble) {
        next.phase = DoublePhase.LANDLORD;
      } else {
        next.factors[next.landlordIndex] = 1;
        next.decided[next.landlordIndex] = true;
        next.phase = DoublePhase.FINISHED;
        next.finished = true;
      }
    }
    return { ok: true, state: next };
  }

  if (next.phase === DoublePhase.LANDLORD) {
    if (!isLandlord) {
      return { ok: false, reason: 'only_landlord_redouble', state };
    }
    if (![1, 2].includes(factor)) {
      return { ok: false, reason: 'invalid_landlord_factor', state };
    }
    next.factors[player] = factor;
    next.decided[player] = true;
    next.phase = DoublePhase.FINISHED;
    next.finished = true;
    return { ok: true, state: next };
  }

  return { ok: false, reason: 'bad_double_phase', state };
}

/**
 * 跳过未决定者（超时默认不加倍）
 * @param {DoublingState} state
 */
export function finalizeDoublingDefaults(state) {
  const next = cloneDouble(state);
  for (let i = 0; i < 3; i++) {
    if (!next.decided[i]) {
      next.factors[i] = 1;
      next.decided[i] = true;
    }
  }
  next.phase = DoublePhase.FINISHED;
  next.finished = true;
  return next;
}

// ─────────────────────────────────────────────
// 结算倍率计算器
// ─────────────────────────────────────────────

/**
 * @typedef {object} MultiplierInput
 * @property {number} landlordIndex
 * @property {number} winnerIndex          出完牌的玩家
 * @property {number} [baseScore=1]        基础分（叫分或底注）
 * @property {number} [callMultiplier=1]   叫/抢地主倍率
 * @property {number} [bombCount=0]        炸弹+王炸次数
 * @property {boolean} [mingPai=false]     明牌 *2
 * @property {number[]} [doubleFactors]    三人个人加倍 [f0,f1,f2]
 * @property {boolean} [spring=false]      春天/反春
 * @property {number} [baseRoomScore=1]    房间底分
 * @property {number} [maxWinPerPlayer]    单人封顶赢分（绝对值）
 * @property {number} [maxLossPerPlayer]   单人封顶输分（绝对值）
 * @property {number[]} [carryScores]      携带积分上限（可选，与封顶叠加）
 * @property {string} [idempotencyKey]
 */

/**
 * 计算最终倍率与三人独立输赢分
 *
 * 总倍数（对局展示）=
 *   baseScore * callMultiplier * 2^bombCount * (mingPai?2:1) * springMult(2)
 *   （个人加倍在各自对局线单独乘）
 *
 * 农民与地主独立结算：
 *   线 A: 地主 ↔ 农民0
 *   线 B: 地主 ↔ 农民1
 *   每条线 stake = roomBase * sharedMult * farmerFactor * landlordFactor
 *   地主赢：农民 -stake，地主 +stake
 *   农民赢：地主 -stake，农民 +stake
 *   地主总分为两条线之和
 *
 * @param {MultiplierInput} input
 */
export function calculateFinalMultipliers(input) {
  const landlordIndex = input.landlordIndex;
  const winnerIndex = input.winnerIndex;
  validateSeat(landlordIndex, 'landlordIndex');
  validateSeat(winnerIndex, 'winnerIndex');

  const baseScore = num(input.baseScore, 1);
  const callMultiplier = num(input.callMultiplier, 1);
  const bombCount = Math.max(0, input.bombCount | 0);
  const mingPai = !!input.mingPai;
  const spring = !!input.spring;
  const baseRoomScore = num(input.baseRoomScore, 1);
  const factors = normalizeFactors(input.doubleFactors);

  const bombMult = 2 ** bombCount;
  const mingMult = mingPai ? 2 : 1;
  const springMult = spring ? 2 : 1;

  /** 对局公共倍率（不含个人加倍） */
  const sharedMultiplier =
    baseScore * callMultiplier * bombMult * mingMult * springMult * baseRoomScore;

  const winnerSide = winnerIndex === landlordIndex ? 'landlord' : 'farmer';
  const landlordWin = winnerSide === 'landlord';

  const farmers = [0, 1, 2].filter((i) => i !== landlordIndex);
  /** @type {{ farmerIndex: number, stake: number, landlordDelta: number, farmerDelta: number }[]} */
  const lines = [];

  const rawScores = [0, 0, 0];

  for (const fi of farmers) {
    const personal = factors[fi] * factors[landlordIndex];
    let stake = sharedMultiplier * personal;
    stake = applyAbsCap(stake, input.maxWinPerPlayer, input.maxLossPerPlayer);

    let landlordDelta;
    let farmerDelta;
    if (landlordWin) {
      landlordDelta = stake;
      farmerDelta = -stake;
    } else {
      landlordDelta = -stake;
      farmerDelta = stake;
    }

    rawScores[landlordIndex] += landlordDelta;
    rawScores[fi] += farmerDelta;

    lines.push({
      farmerIndex: fi,
      stake,
      personalFactor: personal,
      landlordDelta,
      farmerDelta,
    });
  }

  // 携带积分封顶（可选）
  let scores = rawScores.slice();
  if (input.carryScores) {
    scores = applyCarryCapIndependent(rawScores, input.carryScores, landlordIndex, farmers);
  }

  // 再按单人 max 封顶裁剪（保持地主= -农民之和 尽量守恒）
  if (input.maxWinPerPlayer != null || input.maxLossPerPlayer != null) {
    scores = applyPerPlayerCap(scores, input.maxWinPerPlayer, input.maxLossPerPlayer);
  }

  const totalMultiplierDisplay = sharedMultiplier; // 公共展示
  const playerMultipliers = [0, 1, 2].map((i) => {
    if (i === landlordIndex) {
      // 地主有效倍率：对两条线 stake 之和 / room 单位
      return factors[i] * sharedMultiplier;
    }
    return factors[i] * factors[landlordIndex] * sharedMultiplier;
  });

  return Object.freeze({
    idempotencyKey: input.idempotencyKey ?? null,
    winnerSide,
    winnerIndex,
    landlordIndex,
    farmers,
    baseScore,
    callMultiplier,
    bombCount,
    bombMult,
    mingPai,
    mingMult,
    spring,
    springMult,
    doubleFactors: factors.slice(),
    sharedMultiplier,
    totalMultiplier: totalMultiplierDisplay,
    playerMultipliers,
    lines: Object.freeze(lines.map((l) => Object.freeze({ ...l }))),
    rawScores: Object.freeze(rawScores.slice()),
    scores: Object.freeze(scores.slice()),
    formula: Object.freeze({
      expression:
        'shared = baseScore * callMult * 2^bombs * ming * spring * room; '
        + 'lineStake = shared * farmerDouble * landlordDouble',
      sharedMultiplier,
    }),
  });
}

/**
 * 快捷：从拍卖+加倍状态组装结算输入
 */
export function buildMultiplierInputFromStates(auction, doubling, playResult) {
  return {
    landlordIndex: auction.landlordIndex,
    winnerIndex: playResult.winnerIndex,
    baseScore: auction.baseScore,
    callMultiplier: auction.callMultiplier,
    bombCount: playResult.bombCount ?? 0,
    mingPai: !!playResult.mingPai,
    doubleFactors: doubling?.factors || [1, 1, 1],
    spring: !!playResult.spring,
    baseRoomScore: playResult.baseRoomScore ?? 1,
    maxWinPerPlayer: playResult.maxWinPerPlayer,
    maxLossPerPlayer: playResult.maxLossPerPlayer,
    carryScores: playResult.carryScores,
    idempotencyKey: playResult.idempotencyKey,
  };
}

// ─────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────

function cloneAuction(s) {
  return {
    mode: s.mode,
    playerCount: s.playerCount,
    starter: s.starter,
    turn: s.turn,
    phase: s.phase,
    landlordIndex: s.landlordIndex,
    baseScore: s.baseScore,
    callMultiplier: s.callMultiplier,
    robCount: s.robCount,
    bidScores: s.bidScores.slice(),
    actions: s.actions.slice(),
    actionCount: s.actionCount,
    finished: s.finished,
    reason: s.reason,
    firstCaller: s.firstCaller,
    declined: (s.declined || []).slice(),
    _robNeedRespond: s._robNeedRespond,
    _robResponded: s._robResponded,
    _lastRobber: s._lastRobber,
  };
}

function cloneDouble(s) {
  return {
    landlordIndex: s.landlordIndex,
    factors: s.factors.slice(),
    decided: s.decided.slice(),
    phase: s.phase,
    finished: s.finished,
    allowSuperDouble: s.allowSuperDouble,
    allowLandlordRedouble: s.allowLandlordRedouble,
  };
}

function isSeat(v, n = 3) {
  return Number.isInteger(v) && v >= 0 && v < n;
}

function validateSeat(v, label) {
  if (!isSeat(v)) throw new Error(`invalid_${label}`);
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function normalizeFactors(arr) {
  const f = [1, 1, 1];
  if (!Array.isArray(arr)) return f;
  for (let i = 0; i < 3; i++) {
    const v = Number(arr[i]);
    f[i] = Number.isFinite(v) && v > 0 ? v : 1;
  }
  return f;
}

function applyAbsCap(stake, maxWin, maxLoss) {
  let s = Math.abs(stake);
  const cap = maxWin != null || maxLoss != null
    ? Math.min(
      maxWin != null ? Math.abs(maxWin) : Infinity,
      maxLoss != null ? Math.abs(maxLoss) : Infinity
    )
    : Infinity;
  if (Number.isFinite(cap)) s = Math.min(s, cap);
  return s;
}

/**
 * 农民独立结算后按 JJ「输赢以小」封顶：地主总赢/输不超过携带分，两农民按比例分摊。
 */
function applyCarryCapIndependent(rawScores, carryScores, _landlordIndex, _farmers) {
  return applyWinLossCap(rawScores, carryScores);
}

function applyPerPlayerCap(scores, maxWin, maxLoss) {
  return scores.map((s) => {
    if (s > 0 && maxWin != null) return Math.min(s, Math.abs(maxWin));
    if (s < 0 && maxLoss != null) return -Math.min(Math.abs(s), Math.abs(maxLoss));
    return s;
  });
}

export default {
  AuctionMode,
  ScoreAction,
  RobAction,
  DoubleAction,
  AuctionPhase,
  DoublePhase,
  createAuctionState,
  getLegalAuctionActions,
  applyAuctionAction,
  assignBottomToLandlord,
  createDoublingState,
  applyDoubleAction,
  finalizeDoublingDefaults,
  calculateFinalMultipliers,
  buildMultiplierInputFromStates,
};
