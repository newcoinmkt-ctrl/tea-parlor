/**
 * 德州扑克 AI · Equity / Pot Odds / EV + 风格化策略
 *
 * 主接口：
 *   makePokerAIDecision(aiPlayer, gameState) → PokerAIDecision
 *   calculateEquity(holeCards, communityCards, activeOpponentsCount, options?)
 *
 * 风格：
 *   TAG  紧凶（Tight-Aggressive）
 *   LAG  松凶（Loose-Aggressive）
 *   TP   紧弱（Tight-Passive）
 *   LP   松弱（Loose-Passive）
 *   BALANCED 均衡
 */

import { evaluateBest5Of7, HandCategory } from './evaluate.js';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

export const PokerStyle = Object.freeze({
  TAG: 'tag',                 // Tight-Aggressive 紧凶
  LAG: 'lag',                 // Loose-Aggressive 松凶
  TP: 'tight_passive',        // Tight-Passive 紧弱
  LP: 'loose_passive',        // Loose-Passive 松弱
  BALANCED: 'balanced',
});

export const PokerAction = Object.freeze({
  FOLD: 'FOLD',
  CHECK: 'CHECK',
  CALL: 'CALL',
  BET: 'BET',       // 无人下注时主动下注（含 C-Bet）
  RAISE: 'RAISE',   // 加注 / 3-Bet
  ALL_IN: 'ALL_IN',
});

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────

function rand(rng) {
  const r = typeof rng === 'function' ? rng() : Math.random();
  return Math.min(0.999999, Math.max(0, Number(r) || 0));
}

function cardKey(c) {
  return `${Number(c.rank)}_${Number(c.suit)}`;
}

function shuffleInPlace(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * 剩余牌库（52 − known）
 * @param {Array<{rank:number,suit:number}>} known
 */
export function remainingDeck(known = []) {
  const used = new Set((known || []).filter(Boolean).map(cardKey));
  const deck = [];
  for (let suit = 1; suit <= 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      const k = `${rank}_${suit}`;
      if (!used.has(k)) deck.push({ rank, suit });
    }
  }
  return deck;
}

// ─────────────────────────────────────────────
// Equity 蒙特卡洛
// ─────────────────────────────────────────────

/**
 * 计算当前底牌相对 N 个对手的 Equity
 *
 * - communityCards 长度 0–5（Preflop/Flop/Turn/River）
 * - 每次模拟：为对手发 2 张未知底牌，补全公共牌至 5 张，7 选 5 比大小
 * - Equity = (胜场 + 0.5×平局) / 完成场次
 *
 * @param {Array<{rank:number,suit:number}>} holeCards  2
 * @param {Array<{rank:number,suit:number}>} communityCards  0–5
 * @param {number} activeOpponentsCount  ≥1
 * @param {{
 *   simulations?: number,
 *   random?: () => number,
 * }} [options]
 * @returns {{
 *   equity: number,
 *   winRate: number,
 *   tieRate: number,
 *   loseRate: number,
 *   simulations: number,
 *   opponents: number,
 *   boardLen: number,
 * }}
 */
export function calculateEquity(
  holeCards,
  communityCards = [],
  activeOpponentsCount = 1,
  options = {}
) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) {
    throw new TypeError('holeCards must be Card[2]');
  }
  const board = Array.isArray(communityCards) ? communityCards.filter(Boolean) : [];
  if (board.length > 5) {
    throw new RangeError('communityCards length must be 0–5');
  }

  const opponents = Math.max(1, Math.floor(Number(activeOpponentsCount) || 1));
  const sims = Math.max(50, Math.min(20000, Math.floor(Number(options.simulations) || 800)));
  const random = options.random || Math.random;

  const known = [...holeCards, ...board];
  const baseRemaining = remainingDeck(known);
  const needOppCards = opponents * 2;
  const needBoard = 5 - board.length;
  const needTotal = needOppCards + needBoard;

  if (baseRemaining.length < needTotal) {
    return {
      equity: 1 / (opponents + 1),
      winRate: 0,
      tieRate: 0,
      loseRate: 0,
      simulations: 0,
      opponents,
      boardLen: board.length,
      error: 'not_enough_cards',
    };
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;
  const myHole = [
    { rank: holeCards[0].rank, suit: holeCards[0].suit },
    { rank: holeCards[1].rank, suit: holeCards[1].suit },
  ];

  // 复用数组减少分配
  const pool = new Array(baseRemaining.length);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < baseRemaining.length; i++) pool[i] = baseRemaining[i];
    // partial shuffle: only need first needTotal cards
    for (let i = 0; i < needTotal; i++) {
      const j = i + Math.floor(random() * (baseRemaining.length - i));
      const t = pool[i];
      pool[i] = pool[j];
      pool[j] = t;
    }

    let idx = 0;
    const oppHoles = [];
    for (let o = 0; o < opponents; o++) {
      oppHoles.push([pool[idx++], pool[idx++]]);
    }
    const fullBoard = board.slice();
    for (let b = 0; b < needBoard; b++) fullBoard.push(pool[idx++]);

    const myBest = evaluateBest5Of7(myHole, fullBoard);
    let lose = false;
    let tieCount = 0;
    let winCount = 0;

    for (const oh of oppHoles) {
      const ob = evaluateBest5Of7(oh, fullBoard);
      const cmp = myBest.value - ob.value;
      if (cmp < 0) {
        lose = true;
        break;
      }
      if (cmp === 0) tieCount += 1;
      else winCount += 1;
    }

    if (lose) losses += 1;
    else if (tieCount === opponents) ties += 1;
    else if (winCount + tieCount === opponents) {
      // 无败：有平局也算共享 equity，记 win（多人桌仍是「最大之一」）
      if (tieCount > 0 && winCount === 0) ties += 1;
      else wins += 1;
    } else {
      wins += 1;
    }
  }

  const done = Math.max(1, wins + ties + losses);
  const winRate = wins / done;
  const tieRate = ties / done;
  const loseRate = losses / done;
  const equity = (wins + ties * 0.5) / done;

  return {
    equity,
    winRate,
    tieRate,
    loseRate,
    simulations: done,
    opponents,
    boardLen: board.length,
  };
}

// ─────────────────────────────────────────────
// Pot Odds / EV
// ─────────────────────────────────────────────

/**
 * Pot Odds = callAmount / (pot + callAmount)
 * @param {number} pot
 * @param {number} callAmount
 * @returns {{ potOdds: number, callAmount: number, pot: number, breakEvenEquity: number }}
 */
export function calculatePotOdds(pot, callAmount) {
  const p = Math.max(0, Number(pot) || 0);
  const c = Math.max(0, Number(callAmount) || 0);
  if (c <= 0) {
    return {
      potOdds: 0,
      callAmount: 0,
      pot: p,
      breakEvenEquity: 0,
    };
  }
  const potOdds = c / (p + c);
  return {
    potOdds,
    callAmount: c,
    pot: p,
    /** 跟注打平所需最低 Equity */
    breakEvenEquity: potOdds,
  };
}

/**
 * 简化 EV：跟注 EV ≈ equity * (pot+call) - call
 * （未建模弃牌赢下的 fold equity）
 *
 * @param {number} equity
 * @param {number} pot
 * @param {number} callAmount
 */
export function calculateCallEV(equity, pot, callAmount) {
  const e = Math.min(1, Math.max(0, Number(equity) || 0));
  const p = Math.max(0, Number(pot) || 0);
  const c = Math.max(0, Number(callAmount) || 0);
  if (c <= 0) {
    return { ev: e * p, potOdds: 0, isPositiveEV: true, edge: e };
  }
  const potOdds = c / (p + c);
  const ev = e * (p + c) - c;
  return {
    ev,
    potOdds,
    breakEvenEquity: potOdds,
    isPositiveEV: ev > 0,
    /** equity - potOdds */
    edge: e - potOdds,
  };
}

/**
 * @param {number} equity
 * @param {number} potOdds
 * @param {number} [threshold=0]  额外边沿要求（风格可抬高）
 */
export function shouldCallByOdds(equity, potOdds, threshold = 0) {
  return equity + 1e-9 >= potOdds + threshold;
}

// ─────────────────────────────────────────────
// 听牌 / 半诈唬
// ─────────────────────────────────────────────

/**
 * 粗略听牌检测（基于当前 board + hole，未补牌）
 * @param {Array} hole
 * @param {Array} board
 * @returns {{ flushDraw: boolean, oesd: boolean, gutshot: boolean, comboDraw: boolean, outs: number }}
 */
export function detectDraws(hole, board) {
  const cards = [...(hole || []), ...(board || [])];
  if (cards.length < 4) {
    return {
      flushDraw: false, oesd: false, gutshot: false, comboDraw: false, outs: 0,
    };
  }

  const suitCount = [0, 0, 0, 0, 0];
  for (const c of cards) suitCount[c.suit] += 1;
  const flushDraw = suitCount.some((n) => n === 4);

  // 点数集合
  const ranks = new Set(cards.map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1); // 轮子

  let oesd = false;
  let gutshot = false;
  // 扫描窗口
  for (let high = 5; high <= 14; high++) {
    const need = [];
    for (let r = high - 4; r <= high; r++) {
      const rr = r === 1 ? 14 : r;
      need.push(rr === 14 && high === 5 ? (r === 1 ? 14 : r) : r);
    }
    // 标准化 A2345
    let window;
    if (high === 5) window = [14, 2, 3, 4, 5];
    else window = [high - 4, high - 3, high - 2, high - 1, high];

    let have = 0;
    const missing = [];
    for (const r of window) {
      if (ranks.has(r) || (r === 14 && ranks.has(14))) have += 1;
      else missing.push(r);
    }
    // 修正 A
    have = 0;
    missing.length = 0;
    for (const r of window) {
      if (ranks.has(r)) have += 1;
      else missing.push(r);
    }
    if (have === 4 && missing.length === 1) {
      // 两端顺听 or 卡顺
      const m = missing[0];
      if (m === window[0] || m === window[4]) oesd = true;
      else gutshot = true;
    }
  }

  let outs = 0;
  if (flushDraw) outs += 9;
  if (oesd) outs += 8;
  else if (gutshot) outs += 4;
  // 组合听牌 outs 重叠粗略：同花+OESD ≈ 15
  if (flushDraw && oesd) outs = 15;
  else if (flushDraw && gutshot) outs = 12;

  return {
    flushDraw,
    oesd,
    gutshot,
    comboDraw: flushDraw && (oesd || gutshot),
    outs: Math.min(20, outs),
    isDraw: flushDraw || oesd || gutshot,
  };
}

/**
 * 听牌 Equity 粗估（剩余牌张）
 * Flop 约 2 张，Turn 约 1 张
 */
export function estimateDrawEquity(outs, boardLen) {
  const o = Math.max(0, outs);
  if (boardLen <= 3) {
    // 近似 1 - ((47-outs)/47)*((46-outs)/46)
    return Math.min(0.9, 1 - (((47 - o) / 47) * ((46 - o) / 46)));
  }
  if (boardLen === 4) {
    return Math.min(0.5, o / 46);
  }
  return 0;
}

// ─────────────────────────────────────────────
// 风格配置
// ─────────────────────────────────────────────

/**
 * @param {string} [style]
 */
export function normalizePokerStyle(style) {
  const s = String(style || PokerStyle.BALANCED).toLowerCase().replace(/[-\s]/g, '_');
  if (s === 'tag' || s === 'tight_aggressive' || s === '紧凶') return PokerStyle.TAG;
  if (s === 'lag' || s === 'loose_aggressive' || s === '松凶') return PokerStyle.LAG;
  if (s === 'tp' || s === 'tight_passive' || s === '紧弱' || s === 'nit') return PokerStyle.TP;
  if (s === 'lp' || s === 'loose_passive' || s === '松弱' || s === 'calling_station') {
    return PokerStyle.LP;
  }
  return PokerStyle.BALANCED;
}

/**
 * @param {string} style
 * @param {number} [aggression] 0–1 覆盖
 */
export function styleProfile(style, aggression) {
  const kind = normalizePokerStyle(style);
  /** @type {object} */
  let p;
  switch (kind) {
    case PokerStyle.TAG:
      p = {
        kind,
        vpip: 0.22,
        pfr: 0.18,
        threeBet: 0.08,
        cbet: 0.72,
        bluff: 0.18,
        callThreshold: 0.02,  // equity 需超过 potOdds 的边沿
        foldToCbet: 0.55,
        semiBluff: 0.55,
        aggression: 0.75,
      };
      break;
    case PokerStyle.LAG:
      p = {
        kind,
        vpip: 0.38,
        pfr: 0.28,
        threeBet: 0.12,
        cbet: 0.78,
        bluff: 0.32,
        callThreshold: -0.02,
        foldToCbet: 0.35,
        semiBluff: 0.7,
        aggression: 0.85,
      };
      break;
    case PokerStyle.TP:
      p = {
        kind,
        vpip: 0.16,
        pfr: 0.06,
        threeBet: 0.03,
        cbet: 0.35,
        bluff: 0.06,
        callThreshold: 0.06,
        foldToCbet: 0.7,
        semiBluff: 0.15,
        aggression: 0.25,
      };
      break;
    case PokerStyle.LP:
      p = {
        kind,
        vpip: 0.4,
        pfr: 0.08,
        threeBet: 0.02,
        cbet: 0.3,
        bluff: 0.05,
        callThreshold: -0.05,
        foldToCbet: 0.25,
        semiBluff: 0.1,
        aggression: 0.2,
      };
      break;
    default:
      p = {
        kind: PokerStyle.BALANCED,
        vpip: 0.26,
        pfr: 0.18,
        threeBet: 0.07,
        cbet: 0.6,
        bluff: 0.15,
        callThreshold: 0.01,
        foldToCbet: 0.45,
        semiBluff: 0.45,
        aggression: 0.55,
      };
  }

  if (aggression != null && Number.isFinite(aggression)) {
    const a = Math.min(1, Math.max(0, Number(aggression)));
    p.aggression = a;
    p.bluff = p.bluff * 0.4 + a * 0.4;
    p.cbet = p.cbet * 0.5 + a * 0.45;
    p.threeBet = p.threeBet * 0.5 + a * 0.15;
    p.callThreshold = 0.05 - a * 0.08;
    p.semiBluff = p.semiBluff * 0.4 + a * 0.55;
  }
  return p;
}

// ─────────────────────────────────────────────
// Preflop 手牌强度粗分（Chen 简化）
// ─────────────────────────────────────────────

/**
 * 0–1 preflop 强度
 * @param {Array<{rank:number,suit:number}>} hole
 */
export function preflopStrength(hole) {
  if (!hole || hole.length !== 2) return 0.15;
  const r1 = hole[0].rank;
  const r2 = hole[1].rank;
  const suited = hole[0].suit === hole[1].suit;
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const pair = r1 === r2;

  if (pair) {
    // 22=0.45 … AA=0.98
    return 0.42 + ((hi - 2) / 12) * 0.56;
  }
  let s = ((hi - 2) / 12) * 0.55 + ((lo - 2) / 12) * 0.15;
  if (suited) s += 0.08;
  const gap = hi - lo;
  if (gap === 1) s += 0.06; // 连张
  else if (gap === 2) s += 0.03;
  else if (gap >= 5) s -= 0.08;
  // Axs / KQs 提升
  if (hi === 14 && lo >= 10) s += 0.12;
  if (hi === 14 && lo >= 5 && suited) s += 0.05;
  return Math.min(0.95, Math.max(0.08, s));
}

// ─────────────────────────────────────────────
// 主决策
// ─────────────────────────────────────────────

/**
 * @typedef {object} PokerAIDecision
 * @property {string} action
 * @property {number} [amount]       call 金额或 raiseTo（本街总投入）
 * @property {number} [raiseTo]
 * @property {number} [betSize]      建议下注额（相对底池比例另见 potFraction）
 * @property {number} [potFraction]  下注占底池比例
 * @property {number} equity
 * @property {number} potOdds
 * @property {number} [ev]
 * @property {boolean} [isPositiveEV]
 * @property {string} style
 * @property {string} reason
 * @property {object} [debug]
 */

/**
 * AI 决策入口
 *
 * @param {object} aiPlayer
 *   {
 *     id, holeCards: Card[2], style?: string, aggression?: number,
 *     chips?: number, seat?: number, betStreet?: number
 *   }
 * @param {object} gameState
 *   {
 *     communityCards?: Card[],
 *     pot: number,
 *     callAmount?: number,     // 跟注还需
 *     currentBet?: number,     // 本街最高注
 *     minRaiseTo?: number,
 *     bb?: number,
 *     street?: 'preflop'|'flop'|'turn'|'river',
 *     activeOpponentsCount?: number,
 *     players?: Array,         // 用于推断对手数
 *     toAct?: string,          // 当前行动者，可选校验
 *     isPreflopAggressor?: boolean,  // 自己是否前位加注者（C-Bet）
 *     faceRaise?: boolean,     // 是否面对加注（可 3-Bet）
 *     raisesThisStreet?: number,
 *     random?: () => number,
 *     equitySimulations?: number,
 *   }
 * @returns {PokerAIDecision}
 */
export function makePokerAIDecision(aiPlayer, gameState = {}) {
  const rng = gameState.random || aiPlayer?.random || Math.random;
  const profile = styleProfile(
    aiPlayer?.style ?? gameState?.style ?? gameState?.aiStyle,
    aiPlayer?.aggression ?? gameState?.aggression
  );

  const hole = aiPlayer?.holeCards || aiPlayer?.cards || [];
  const board = gameState.communityCards || gameState.board || [];
  const boardLen = board.length;
  const street = detectStreet(gameState.street, boardLen);

  const opponents = Math.max(
    1,
    Number(gameState.activeOpponentsCount)
      || countOpponents(gameState, aiPlayer?.id)
      || 1
  );

  const pot = Math.max(0, Number(gameState.pot) || 0);
  const callAmount = Math.max(0, Number(
    gameState.callAmount ?? gameState.toCall ?? 0
  ));
  const currentBet = Math.max(0, Number(gameState.currentBet) || 0);
  const minRaiseTo = Number(gameState.minRaiseTo)
    || (currentBet + (gameState.bb || currentBet || 10));
  const bb = Math.max(1, Number(gameState.bb) || 10);
  const chips = Math.max(0, Number(aiPlayer?.chips ?? Infinity));
  const myBetStreet = Math.max(0, Number(aiPlayer?.betStreet) || 0);

  const faceBet = callAmount > 0;
  const faceRaise = !!(gameState.faceRaise || (gameState.raisesThisStreet || 0) >= 1);
  const canCheck = !faceBet;

  // Equity
  let equityInfo;
  try {
    equityInfo = calculateEquity(hole, board, opponents, {
      simulations: gameState.equitySimulations
        || (street === 'preflop' ? 400 : street === 'flop' ? 600 : 500),
      random: rng,
    });
  } catch {
    equityInfo = {
      equity: preflopStrength(hole) ** opponents,
      winRate: 0,
      tieRate: 0,
      loseRate: 0,
      simulations: 0,
      opponents,
      boardLen,
    };
  }

  // Preflop 可混合 chen 强度
  let equity = equityInfo.equity;
  if (street === 'preflop') {
    const pf = preflopStrength(hole);
    equity = equity * 0.55 + (pf ** Math.max(1, opponents * 0.85)) * 0.45;
  }

  const odds = calculatePotOdds(pot, callAmount);
  const callEv = calculateCallEV(equity, pot, callAmount);
  const draws = boardLen >= 3 && boardLen < 5
    ? detectDraws(hole, board)
    : {
      flushDraw: false, oesd: false, gutshot: false, comboDraw: false, outs: 0, isDraw: false,
    };

  // 听牌时用 outs 提升有效 equity（半诈唬）
  let effectiveEquity = equity;
  if (draws.isDraw && boardLen < 5) {
    const de = estimateDrawEquity(draws.outs, boardLen);
    effectiveEquity = Math.max(equity, equity * 0.5 + de * 0.55);
  }

  const debug = {
    street,
    equity,
    effectiveEquity,
    potOdds: odds.potOdds,
    callEV: callEv.ev,
    isPositiveEV: callEv.isPositiveEV,
    draws,
    opponents,
    faceBet,
    faceRaise,
    profile: profile.kind,
    sims: equityInfo.simulations,
  };

  // ── Preflop ──
  if (street === 'preflop') {
    return decidePreflop({
      profile,
      equity: effectiveEquity,
      pf: preflopStrength(hole),
      callAmount,
      pot,
      odds,
      callEv,
      faceBet,
      faceRaise,
      canCheck,
      minRaiseTo,
      currentBet,
      myBetStreet,
      chips,
      bb,
      potTotal: pot,
      rng,
      debug,
    });
  }

  // ── Postflop ──
  return decidePostflop({
    profile,
    equity: effectiveEquity,
    rawEquity: equity,
    callAmount,
    pot,
    odds,
    callEv,
    faceBet,
    faceRaise,
    canCheck,
    minRaiseTo,
    currentBet,
    myBetStreet,
    chips,
    bb,
    draws,
    boardLen,
    isPreflopAggressor: !!gameState.isPreflopAggressor,
    rng,
    debug,
  });
}

function detectStreet(street, boardLen) {
  if (street) {
    const s = String(street).toLowerCase();
    if (s.includes('pre')) return 'preflop';
    if (s.includes('flop')) return 'flop';
    if (s.includes('turn')) return 'turn';
    if (s.includes('river')) return 'river';
  }
  if (boardLen <= 0) return 'preflop';
  if (boardLen === 3) return 'flop';
  if (boardLen === 4) return 'turn';
  return 'river';
}

function countOpponents(gameState, selfId) {
  const players = gameState?.players || [];
  if (!players.length) return Number(gameState?.activeOpponentsCount) || 1;
  return players.filter((p) => {
    if (selfId && String(p.id) === String(selfId)) return false;
    const st = String(p.status || '').toLowerCase();
    return st !== 'folded' && st !== 'sitting_out' && !p.folded;
  }).length || 1;
}

function decidePreflop(ctx) {
  const {
    profile, equity, pf, callAmount, pot, odds, callEv,
    faceBet, faceRaise, canCheck, minRaiseTo, currentBet,
    chips, bb, rng, debug,
  } = ctx;

  const r = () => rand(rng);
  const openSize = Math.max(minRaiseTo, Math.floor(bb * (profile.kind === PokerStyle.LAG ? 3 : 2.5)));
  const threeBetSize = Math.max(
    minRaiseTo,
    Math.floor((currentBet || bb) * (profile.kind === PokerStyle.LAG ? 3.2 : 2.8))
  );

  // 面对加注 → 3-Bet / Call / Fold
  if (faceRaise || (faceBet && currentBet > bb)) {
    // 强牌 3-Bet 价值
    if (pf >= 0.82 || equity >= 0.55) {
      if (r() < 0.75 + profile.threeBet) {
        return decide(PokerAction.RAISE, {
          ...baseMeta(ctx, profile),
          raiseTo: Math.min(chips, threeBetSize),
          potFraction: threeBetSize / Math.max(1, pot + callAmount),
          reason: 'value_3bet',
          debug,
        });
      }
    }
    // 半诈唬 3-Bet（LAG/TAG 适中）
    if (
      pf >= 0.55
      && r() < profile.threeBet * (profile.kind === PokerStyle.LAG ? 1.4 : 1)
    ) {
      return decide(PokerAction.RAISE, {
        ...baseMeta(ctx, profile),
        raiseTo: Math.min(chips, threeBetSize),
        reason: 'bluff_3bet',
        debug: { ...debug, bluff: true },
      });
    }
    // Call by odds + 风格
    if (shouldCallByOdds(equity, odds.potOdds, profile.callThreshold)
      || (profile.kind === PokerStyle.LP && pf >= 0.35)
      || (pf >= 0.5 && callEv.edge >= -0.05)) {
      if (callAmount >= chips) {
        return decide(PokerAction.ALL_IN, {
          ...baseMeta(ctx, profile),
          amount: chips,
          reason: 'call_all_in',
          debug,
        });
      }
      return decide(PokerAction.CALL, {
        ...baseMeta(ctx, profile),
        amount: callAmount,
        reason: callEv.isPositiveEV ? 'call_plus_ev' : 'call_playable',
        debug,
      });
    }
    return decide(PokerAction.FOLD, {
      ...baseMeta(ctx, profile),
      reason: 'fold_vs_raise',
      debug,
    });
  }

  // 无人加注 / limped：开池或跟盲
  if (canCheck) {
    // BB option
    if (pf >= 0.45 && r() < profile.pfr + 0.15) {
      return decide(PokerAction.RAISE, {
        ...baseMeta(ctx, profile),
        raiseTo: Math.min(chips, openSize),
        reason: 'bb_option_raise',
        debug,
      });
    }
    return decide(PokerAction.CHECK, {
      ...baseMeta(ctx, profile),
      reason: 'bb_check',
      debug,
    });
  }

  // 面对盲注：Open-raise / Call / Fold
  const openThresh = 1 - profile.vpip; // vpip 高 → 门槛低
  if (pf >= 0.55 || equity >= 0.35) {
    if (r() < profile.pfr / Math.max(0.05, profile.vpip) * 0.7 + 0.25) {
      return decide(PokerAction.RAISE, {
        ...baseMeta(ctx, profile),
        raiseTo: Math.min(chips, openSize),
        reason: 'open_raise',
        debug,
      });
    }
  }
  if (pf >= openThresh * 0.5 || shouldCallByOdds(equity, odds.potOdds, profile.callThreshold)) {
    // limper / complete SB
    if (profile.kind === PokerStyle.TAG && pf < 0.48 && r() > 0.35) {
      return decide(PokerAction.FOLD, {
        ...baseMeta(ctx, profile),
        reason: 'tag_fold_weak',
        debug,
      });
    }
    return decide(PokerAction.CALL, {
      ...baseMeta(ctx, profile),
      amount: Math.min(callAmount, chips),
      reason: 'limp_or_complete',
      debug,
    });
  }

  // LAG 偶尔偷盲
  if (profile.kind === PokerStyle.LAG && r() < profile.bluff * 0.8) {
    return decide(PokerAction.RAISE, {
      ...baseMeta(ctx, profile),
      raiseTo: Math.min(chips, openSize),
      reason: 'steal_bluff',
      debug: { ...debug, bluff: true },
    });
  }

  return decide(PokerAction.FOLD, {
    ...baseMeta(ctx, profile),
    reason: 'fold_preflop',
    debug,
  });
}

function decidePostflop(ctx) {
  const {
    profile, equity, callAmount, pot, odds, callEv,
    faceBet, canCheck, minRaiseTo, currentBet,
    chips, bb, draws, boardLen, isPreflopAggressor, rng, debug,
  } = ctx;

  const r = () => rand(rng);
  const potBet = (frac) => Math.max(
    bb,
    Math.min(chips, Math.floor(pot * frac) + (canCheck ? 0 : callAmount))
  );
  // raiseTo 绝对本街：简化用 currentBet + pot*frac
  const raiseToByFrac = (frac) => Math.max(
    minRaiseTo,
    Math.min(
      (ctx.myBetStreet || 0) + chips,
      currentBet + Math.max(bb, Math.floor(pot * frac))
    )
  );

  const strong = equity >= 0.65;
  const medium = equity >= 0.42 && equity < 0.65;
  const weak = equity < 0.42;
  const semi = draws.isDraw && equity < 0.55;

  // ── 可过牌（无人下注）──
  if (canCheck) {
    // C-Bet：前位进攻者（以 cbet 频率直接持续下注）
    if (isPreflopAggressor && r() < profile.cbet) {
      const frac = strong ? 0.66 : (semi ? 0.55 : (medium ? 0.5 : 0.42));
      const raiseTo = Math.min(chips, Math.max(minRaiseTo, potBet(frac)));
      return decide(PokerAction.BET, {
        ...baseMeta(ctx, profile),
        raiseTo,
        amount: raiseTo,
        potFraction: frac,
        reason: strong ? 'cbet_value' : (semi ? 'cbet_semi_bluff' : 'cbet_range'),
        debug: { ...debug, semiBluff: semi },
      });
    }

    // 价值下注
    if (strong && r() < 0.55 + profile.aggression * 0.3) {
      const frac = boardLen === 5 ? 0.7 : 0.6;
      const raiseTo = Math.min(chips, Math.max(minRaiseTo, potBet(frac)));
      return decide(PokerAction.BET, {
        ...baseMeta(ctx, profile),
        raiseTo,
        amount: raiseTo,
        potFraction: frac,
        reason: 'value_bet',
        debug,
      });
    }

    // 半诈唬进攻
    if (semi && r() < profile.semiBluff) {
      const raiseTo = Math.min(chips, Math.max(minRaiseTo, potBet(0.55)));
      return decide(PokerAction.BET, {
        ...baseMeta(ctx, profile),
        raiseTo,
        amount: raiseTo,
        potFraction: 0.55,
        reason: 'semi_bluff_bet',
        debug: { ...debug, outs: draws.outs },
      });
    }

    // 纯诈唬（LAG）
    if (weak && profile.kind === PokerStyle.LAG && r() < profile.bluff * 0.5) {
      const raiseTo = Math.min(chips, Math.max(minRaiseTo, potBet(0.4)));
      return decide(PokerAction.BET, {
        ...baseMeta(ctx, profile),
        raiseTo,
        amount: raiseTo,
        potFraction: 0.4,
        reason: 'pure_bluff',
        debug: { ...debug, bluff: true },
      });
    }

    return decide(PokerAction.CHECK, {
      ...baseMeta(ctx, profile),
      reason: 'check_control',
      debug,
    });
  }

  // ── 面对下注 ──
  // 强牌：加注或跟注
  if (strong) {
    if (r() < 0.45 + profile.aggression * 0.35) {
      return decide(PokerAction.RAISE, {
        ...baseMeta(ctx, profile),
        raiseTo: raiseToByFrac(0.75),
        reason: 'value_raise',
        debug,
      });
    }
    return decide(PokerAction.CALL, {
      ...baseMeta(ctx, profile),
      amount: Math.min(callAmount, chips),
      reason: 'value_call',
      debug,
    });
  }

  // 半诈唬加注
  if (semi && r() < profile.semiBluff * 0.85) {
    return decide(PokerAction.RAISE, {
      ...baseMeta(ctx, profile),
      raiseTo: raiseToByFrac(0.7),
      reason: 'semi_bluff_raise',
      debug: { ...debug, outs: draws.outs },
    });
  }

  // +EV 跟注
  const thr = profile.callThreshold;
  if (shouldCallByOdds(equity, odds.potOdds, thr) || (medium && callEv.edge >= -0.03)) {
    if (callAmount >= chips) {
      return decide(PokerAction.ALL_IN, {
        ...baseMeta(ctx, profile),
        amount: chips,
        reason: 'call_all_in_ev',
        debug,
      });
    }
    // TP 面对大注更易弃
    const potFrac = callAmount / Math.max(1, pot);
    if (profile.kind === PokerStyle.TP && potFrac > 0.5 && equity < 0.48 && r() < 0.55) {
      return decide(PokerAction.FOLD, {
        ...baseMeta(ctx, profile),
        reason: 'tp_fold_pressure',
        debug,
      });
    }
    return decide(PokerAction.CALL, {
      ...baseMeta(ctx, profile),
      amount: Math.min(callAmount, chips),
      reason: callEv.isPositiveEV ? 'call_plus_ev' : 'call_odds_close',
      debug,
    });
  }

  // LP 偏跟
  if (profile.kind === PokerStyle.LP && equity >= 0.28 && r() < 0.55) {
    return decide(PokerAction.CALL, {
      ...baseMeta(ctx, profile),
      amount: Math.min(callAmount, chips),
      reason: 'lp_sticky_call',
      debug,
    });
  }

  // 诈唬加注（LAG 稀有）
  if (profile.kind === PokerStyle.LAG && weak && r() < profile.bluff * 0.25) {
    return decide(PokerAction.RAISE, {
      ...baseMeta(ctx, profile),
      raiseTo: raiseToByFrac(0.65),
      reason: 'bluff_raise',
      debug: { ...debug, bluff: true },
    });
  }

  return decide(PokerAction.FOLD, {
    ...baseMeta(ctx, profile),
    reason: 'fold_minus_ev',
    debug,
  });
}

function baseMeta(ctx, profile) {
  return {
    equity: ctx.equity,
    potOdds: ctx.odds?.potOdds ?? 0,
    ev: ctx.callEv?.ev,
    isPositiveEV: ctx.callEv?.isPositiveEV,
    style: profile.kind,
  };
}

function decide(action, opts) {
  /** @type {PokerAIDecision} */
  const out = {
    action,
    equity: opts.equity ?? 0,
    potOdds: opts.potOdds ?? 0,
    style: opts.style || PokerStyle.BALANCED,
    reason: opts.reason || '',
  };
  if (opts.amount != null) out.amount = opts.amount;
  if (opts.raiseTo != null) {
    out.raiseTo = opts.raiseTo;
    out.amount = opts.raiseTo;
  }
  if (opts.betSize != null) out.betSize = opts.betSize;
  if (opts.potFraction != null) out.potFraction = opts.potFraction;
  if (opts.ev != null) out.ev = opts.ev;
  if (opts.isPositiveEV != null) out.isPositiveEV = opts.isPositiveEV;
  if (opts.debug) out.debug = opts.debug;
  return out;
}

/**
 * 将决策映射到 TexasGameStateMachine / BettingEngine
 * @param {object} engine  需有 act/fold/check/call/raise/allIn
 * @param {string} playerId
 * @param {PokerAIDecision} decision
 */
export function applyPokerAIDecision(engine, playerId, decision) {
  if (!engine || !decision) return { ok: false, reason: 'bad_args' };
  switch (decision.action) {
    case PokerAction.FOLD:
      return engine.fold?.(playerId) ?? engine.act?.(playerId, 'fold');
    case PokerAction.CHECK:
      return engine.check?.(playerId) ?? engine.act?.(playerId, 'check');
    case PokerAction.CALL:
      return engine.call?.(playerId) ?? engine.act?.(playerId, 'call');
    case PokerAction.BET:
    case PokerAction.RAISE: {
      const to = decision.raiseTo ?? decision.amount;
      if (engine.raise) return engine.raise(playerId, to);
      return engine.act?.(playerId, 'raise', { raiseTo: to });
    }
    case PokerAction.ALL_IN:
      return engine.allIn?.(playerId) ?? engine.act?.(playerId, 'all_in');
    default:
      return { ok: false, reason: 'unknown_action' };
  }
}

/**
 * 从状态机快照构造 AI gameState
 * @param {object} snap  TexasGameStateMachine.getSnapshot(aiId)
 * @param {string} aiId
 * @param {object} [extra]
 */
export function pokerGameStateFromSnapshot(snap, aiId, extra = {}) {
  const me = (snap.players || []).find((p) => String(p.id) === String(aiId));
  const opponents = (snap.players || []).filter((p) => {
    if (String(p.id) === String(aiId)) return false;
    const st = String(p.status || '').toLowerCase();
    return st !== 'folded' && st !== 'sitting_out';
  }).length;

  return {
    communityCards: snap.board || [],
    pot: snap.pot,
    callAmount: me?.toCall ?? 0,
    currentBet: snap.currentBet,
    minRaiseTo: snap.minRaiseTo,
    bb: snap.bigBlind,
    street: snap.bettingStreet || snap.phase,
    activeOpponentsCount: Math.max(1, opponents),
    players: snap.players,
    raisesThisStreet: extra.raisesThisStreet,
    isPreflopAggressor: extra.isPreflopAggressor,
    faceRaise: extra.faceRaise,
    random: extra.random,
    equitySimulations: extra.equitySimulations,
    ...extra,
  };
}
