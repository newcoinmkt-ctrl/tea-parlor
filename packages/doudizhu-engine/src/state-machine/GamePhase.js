/**
 * 斗地主单局状态枚举
 *
 * Waiting → Dealing → Bidding → Doubling → Playing → Settling
 *                                              ↑ 手牌清空
 * Settling → Waiting（可选 requeue）
 */
export const GamePhase = Object.freeze({
  WAITING: 'Waiting',
  DEALING: 'Dealing',
  BIDDING: 'Bidding',
  DOUBLING: 'Doubling',
  PLAYING: 'Playing',
  SETTLING: 'Settling',
});

/** 合法迁移表（用于校验） */
export const PHASE_TRANSITIONS = Object.freeze({
  [GamePhase.WAITING]: [GamePhase.DEALING],
  [GamePhase.DEALING]: [GamePhase.BIDDING],
  [GamePhase.BIDDING]: [GamePhase.DOUBLING, GamePhase.WAITING], // 异常重开
  [GamePhase.DOUBLING]: [GamePhase.PLAYING],
  [GamePhase.PLAYING]: [GamePhase.SETTLING],
  [GamePhase.SETTLING]: [GamePhase.WAITING],
});

export function canTransition(from, to) {
  return (PHASE_TRANSITIONS[from] || []).includes(to);
}
