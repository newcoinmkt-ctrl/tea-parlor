/**
 * 单局共享上下文（状态机 data bag）
 * 状态对象只读/改写此上下文，不直接持有 UI
 */

import { GamePhase } from './GamePhase.js';

export const PLAYER_COUNT = 3;

export function createEmptyContext(options = {}) {
  const playerCount = options.playerCount ?? PLAYER_COUNT;
  if (playerCount !== 3) {
    throw new Error('doudizhu_requires_exactly_3_players');
  }

  return {
    phase: GamePhase.WAITING,
    playerCount,
    playerNames: options.playerNames || ['玩家0', '玩家1', '玩家2'],
    /** 座位是否已入座（Waiting 用） */
    seated: [false, false, false],

    /** 手牌 Card[][] */
    hands: [[], [], []],
    /** 三张底牌 */
    bottomCards: [],
    /** 地主座位 0–2，未定时 -1 */
    landlordIndex: -1,

    // —— 叫分 ——
    bidStarter: 0,
    bidTurn: 0,
    currentBid: 0,
    bidScores: [null, null, null],
    bidActionCount: 0,
    /** 叫分倍率 1–3 */
    baseScore: 1,

    // —— 加倍 ——
    /** 每人加倍系数 1 或 2（超级加倍可 4，默认仅 1/2） */
    doubleFactors: [1, 1, 1],
    doubleDecided: [false, false, false],

    // —— 出牌 ——
    /** 当前出牌人索引 */
    currentPlayerIndex: 0,
    /**
     * 上家出的牌型
     * @type {null | { player: number, hand: import('../rules.js').parseHand extends Function ? object : never }}
     */
    lastPlayHand: null,
    passCount: 0,
    bombCount: 0,
    /** 每人有效出牌次数（非 pass，用于春天） */
    turnPlayCount: [0, 0, 0],
    /** 托管标记 */
    autoPlay: [false, false, false],

    // —— 结算 ——
    winnerIndex: -1,
    winnerSide: null,
    spring: false,
    multiplier: 1,
    settlement: null,

    // —— 房间配置 ——
    baseRoomScore: options.baseRoomScore ?? 1,
    playTimeoutMs: options.playTimeoutMs ?? 15000,
    bidTimeoutMs: options.bidTimeoutMs ?? 10000,
    doubleTimeoutMs: options.doubleTimeoutMs ?? 8000,

    /** 事件日志（调试） */
    eventLog: [],
  };
}

export function snapshotContext(ctx) {
  return {
    phase: ctx.phase,
    playerNames: ctx.playerNames.slice(),
    seated: ctx.seated.slice(),
    handCounts: ctx.hands.map((h) => h.length),
    hands: ctx.hands.map((h) => h.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit }))),
    bottomCards: ctx.bottomCards.map((c) => ({ id: c.id, rank: c.rank, suit: c.suit })),
    landlordIndex: ctx.landlordIndex,
    bidTurn: ctx.bidTurn,
    currentBid: ctx.currentBid,
    bidScores: ctx.bidScores.slice(),
    baseScore: ctx.baseScore,
    doubleFactors: ctx.doubleFactors.slice(),
    doubleDecided: ctx.doubleDecided.slice(),
    currentPlayerIndex: ctx.currentPlayerIndex,
    lastPlayHand: ctx.lastPlayHand
      ? {
          player: ctx.lastPlayHand.player,
          type: ctx.lastPlayHand.hand.type,
          weight: ctx.lastPlayHand.hand.weight,
          length: ctx.lastPlayHand.hand.length,
          cards: ctx.lastPlayHand.hand.cards.map((c) => ({
            id: c.id,
            rank: c.rank,
            suit: c.suit,
          })),
        }
      : null,
    passCount: ctx.passCount,
    bombCount: ctx.bombCount,
    turnPlayCount: ctx.turnPlayCount.slice(),
    autoPlay: ctx.autoPlay.slice(),
    winnerIndex: ctx.winnerIndex,
    winnerSide: ctx.winnerSide,
    spring: ctx.spring,
    multiplier: ctx.multiplier,
    settlement: ctx.settlement,
    baseRoomScore: ctx.baseRoomScore,
    playTimeoutMs: ctx.playTimeoutMs,
  };
}
