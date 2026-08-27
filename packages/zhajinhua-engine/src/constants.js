/**
 * 炸金花 · 状态与阶段常量
 */

/** 玩家状态 */
export const PlayerStatus = Object.freeze({
  /** 未看牌（闷牌） */
  MEN: 'men',
  /** 已看牌 */
  LOOKED: 'looked',
  /** 孤注一掷（全押，不再跟注，参与开牌） */
  ALL_IN: 'all_in',
  /** 已弃牌 */
  FOLDED: 'folded',
  /** 比牌输掉（淘汰） */
  LOST: 'lost',
});

/** 局阶段（状态机） */
export const GamePhase = Object.freeze({
  /** 等待开局 */
  WAITING: 'waiting',
  /** 发牌 + 下底注 */
  DEALING: 'dealing',
  /** 多轮下注 / 看牌 / 弃牌 / 比牌 */
  BETTING: 'betting',
  /** 结算 */
  SETTLING: 'settling',
});

/** 可触发的事件（状态机输入） */
export const GameEvent = Object.freeze({
  START: 'start',
  LOOK: 'look',
  BET: 'bet',
  ALL_IN: 'all_in',
  FOLD: 'fold',
  COMPARE: 'compare',
  FORCE_SHOWDOWN: 'force_showdown',
  RESET: 'reset',
});

/** 合法阶段迁移 */
export const PHASE_TRANSITIONS = Object.freeze({
  [GamePhase.WAITING]: [GamePhase.DEALING, GamePhase.WAITING],
  [GamePhase.DEALING]: [GamePhase.BETTING, GamePhase.SETTLING],
  [GamePhase.BETTING]: [GamePhase.BETTING, GamePhase.SETTLING],
  [GamePhase.SETTLING]: [GamePhase.WAITING, GamePhase.DEALING],
});

/**
 * 仍在争胜（可赢池 / 参与开牌）：闷、看、全押
 * @param {string} status
 */
export function isContendingStatus(status) {
  return (
    status === PlayerStatus.MEN
    || status === PlayerStatus.LOOKED
    || status === PlayerStatus.ALL_IN
  );
}

/**
 * 仍需行动下注（不含 All-in）
 * @param {string} status
 */
export function isActingStatus(status) {
  return status === PlayerStatus.MEN || status === PlayerStatus.LOOKED;
}

/**
 * @deprecated 使用 isContendingStatus；保留兼容：旧逻辑「存活可行动」≈ acting
 * @param {string} status
 */
export function isActiveStatus(status) {
  return isActingStatus(status);
}

/**
 * 是否已出局（弃牌或比牌输）
 * @param {string} status
 */
export function isOutStatus(status) {
  return status === PlayerStatus.FOLDED || status === PlayerStatus.LOST;
}
