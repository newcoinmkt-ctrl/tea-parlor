/**
 * 德州扑克单局状态定义与合法迁移
 *
 * Waiting → DealingHoleCards → PreFlopBetting
 *   → DealingFlop → FlopBetting
 *   → DealingTurn → TurnBetting
 *   → DealingRiver → RiverBetting
 *   → Showdown → Settling → Waiting
 *
 * 任一 *Betting 可因「仅剩 1 人未弃牌」→ Settling（跳过发牌/亮牌）
 */

export const TexasPhase = Object.freeze({
  WAITING: 'Waiting',
  DEALING_HOLE: 'DealingHoleCards',
  PREFLOP_BETTING: 'PreFlopBetting',
  DEALING_FLOP: 'DealingFlop',
  FLOP_BETTING: 'FlopBetting',
  DEALING_TURN: 'DealingTurn',
  TURN_BETTING: 'TurnBetting',
  DEALING_RIVER: 'DealingRiver',
  RIVER_BETTING: 'RiverBetting',
  SHOWDOWN: 'Showdown',
  SETTLING: 'Settling',
});

/** 下注阶段集合 */
export const BETTING_PHASES = Object.freeze([
  TexasPhase.PREFLOP_BETTING,
  TexasPhase.FLOP_BETTING,
  TexasPhase.TURN_BETTING,
  TexasPhase.RIVER_BETTING,
]);

/** 发牌阶段集合 */
export const DEALING_PHASES = Object.freeze([
  TexasPhase.DEALING_HOLE,
  TexasPhase.DEALING_FLOP,
  TexasPhase.DEALING_TURN,
  TexasPhase.DEALING_RIVER,
]);

/**
 * 合法迁移表（from → to[]）
 */
export const PHASE_TRANSITIONS = Object.freeze({
  [TexasPhase.WAITING]: [TexasPhase.DEALING_HOLE, TexasPhase.WAITING],
  [TexasPhase.DEALING_HOLE]: [TexasPhase.PREFLOP_BETTING, TexasPhase.SETTLING],
  [TexasPhase.PREFLOP_BETTING]: [
    TexasPhase.DEALING_FLOP,
    TexasPhase.SHOWDOWN,
    TexasPhase.SETTLING,
    TexasPhase.PREFLOP_BETTING,
  ],
  [TexasPhase.DEALING_FLOP]: [TexasPhase.FLOP_BETTING, TexasPhase.SETTLING],
  [TexasPhase.FLOP_BETTING]: [
    TexasPhase.DEALING_TURN,
    TexasPhase.SHOWDOWN,
    TexasPhase.SETTLING,
    TexasPhase.FLOP_BETTING,
  ],
  [TexasPhase.DEALING_TURN]: [TexasPhase.TURN_BETTING, TexasPhase.SETTLING],
  [TexasPhase.TURN_BETTING]: [
    TexasPhase.DEALING_RIVER,
    TexasPhase.SHOWDOWN,
    TexasPhase.SETTLING,
    TexasPhase.TURN_BETTING,
  ],
  [TexasPhase.DEALING_RIVER]: [TexasPhase.RIVER_BETTING, TexasPhase.SETTLING],
  [TexasPhase.RIVER_BETTING]: [
    TexasPhase.SHOWDOWN,
    TexasPhase.SETTLING,
    TexasPhase.RIVER_BETTING,
  ],
  [TexasPhase.SHOWDOWN]: [TexasPhase.SETTLING],
  [TexasPhase.SETTLING]: [TexasPhase.WAITING, TexasPhase.DEALING_HOLE],
});

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransition(from, to) {
  const allowed = PHASE_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * 下注阶段 → 下一发牌阶段（河牌后为 Showdown）
 * @param {string} bettingPhase
 */
export function nextDealingAfterBetting(bettingPhase) {
  switch (bettingPhase) {
    case TexasPhase.PREFLOP_BETTING:
      return TexasPhase.DEALING_FLOP;
    case TexasPhase.FLOP_BETTING:
      return TexasPhase.DEALING_TURN;
    case TexasPhase.TURN_BETTING:
      return TexasPhase.DEALING_RIVER;
    case TexasPhase.RIVER_BETTING:
      return TexasPhase.SHOWDOWN;
    default:
      return null;
  }
}

/**
 * 发牌阶段 → 对应下注阶段
 * @param {string} dealingPhase
 */
export function bettingAfterDealing(dealingPhase) {
  switch (dealingPhase) {
    case TexasPhase.DEALING_HOLE:
      return TexasPhase.PREFLOP_BETTING;
    case TexasPhase.DEALING_FLOP:
      return TexasPhase.FLOP_BETTING;
    case TexasPhase.DEALING_TURN:
      return TexasPhase.TURN_BETTING;
    case TexasPhase.DEALING_RIVER:
      return TexasPhase.RIVER_BETTING;
    default:
      return null;
  }
}

export function isBettingPhase(phase) {
  return BETTING_PHASES.includes(phase);
}

export function isDealingPhase(phase) {
  return DEALING_PHASES.includes(phase);
}
