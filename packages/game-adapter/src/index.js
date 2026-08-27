/** 首发游戏入口（AGENTS.md 承诺的三个游戏） */
export const GameIds = {
  DOUDIZHU: 'doudizhu',
  TEXAS_HOLDEM: 'texas-holdem',
  MAHJONG: 'mahjong',
};

/** 规划中游戏（暂不开放入口，避免承诺未实现能力） */
export const FutureGameIds = {
  CHUDADI: 'chudadi',
  ZHAJINHUA: 'zhajinhua',
  GUANDAN: 'guandan',
  ER_MAHJONG: 'er-mahjong',
  XUELIU_MAHJONG: 'xueliu-mahjong',
  XUEZHAN_MAHJONG: 'xuezhan-mahjong',
  OPENINGGAME_QP: 'openinggame-qp',
};

/** 引擎实现状态：用于运营后台和大厅展示，区分"已实现"与"规划中" */
export const EngineAvailability = Object.freeze({
  [GameIds.DOUDIZHU]: { engine: '@tea-parlor/doudizhu-engine', adapter: true, status: 'ready' },
  [GameIds.TEXAS_HOLDEM]: { engine: '@tea-parlor/texas-engine', adapter: true, status: 'h5-local' },
  [GameIds.MAHJONG]: { engine: '@tea-parlor/mahjong-engine', adapter: true, status: 'h5-local' },
  [FutureGameIds.ZHAJINHUA]: { engine: '@tea-parlor/zhajinhua-engine', adapter: true, status: 'h5-local' },
  [FutureGameIds.GUANDAN]: { engine: '@tea-parlor/guandan-engine', adapter: false, status: 'h5-local' },
});

export const AdapterStatus = {
  READY: 'ready',
  PLACEHOLDER: 'placeholder',
};

export function createSettlementIntent({
  gameId,
  roomId,
  roundId,
  settlement,
}) {
  return Object.freeze({
    type: 'settlement_intent',
    gameId,
    roomId,
    roundId,
    idempotencyKey: settlement.idempotencyKey,
    scores: settlement.scores.slice(),
    rawScores: settlement.rawScores.slice(),
    winnerSide: settlement.winnerSide,
    winnerIndex: settlement.winnerIndex,
    landlordIndex: settlement.landlordIndex,
    baseScore: settlement.baseScore,
    baseRoomScore: settlement.baseRoomScore,
    multiplier: settlement.multiplier,
    spring: settlement.spring,
    bombCount: settlement.bombCount,
    unit: settlement.unit,
    ledgerPolicy: 'adapter_returns_intent_only',
  });
}

export function createUnavailableGameAdapter(gameId, reason) {
  const error = () => ({
    ok: false,
    reason: reason || 'rules_not_implemented',
    gameId,
  });

  return Object.freeze({
    gameId,
    status: AdapterStatus.PLACEHOLDER,
    createRoom: error,
    joinRoom: error,
    startRound: error,
    applyAction: error,
    getPublicState: error,
    settleRound: error,
    replay: error,
  });
}

export const texasHoldemAdapter = createUnavailableGameAdapter(
  GameIds.TEXAS_HOLDEM,
  'texas_holdem_rules_not_implemented'
);

export const mahjongAdapter = createUnavailableGameAdapter(
  GameIds.MAHJONG,
  'mahjong_rules_not_implemented'
);

export const futureGameAdapters = Object.freeze({
  [FutureGameIds.OPENINGGAME_QP]: createUnavailableGameAdapter(
    FutureGameIds.OPENINGGAME_QP,
    'candidate_quarantined_no_runtime_import'
  ),
  [FutureGameIds.CHUDADI]: createUnavailableGameAdapter(
    FutureGameIds.CHUDADI,
    'candidate_playable_in_h5_only_adapter_not_implemented'
  ),
  [FutureGameIds.ZHAJINHUA]: createUnavailableGameAdapter(
    FutureGameIds.ZHAJINHUA,
    'engine_exists_at_@tea-parlor/zhajinhua-engine_adapter_pending'
  ),
  [FutureGameIds.ER_MAHJONG]: createUnavailableGameAdapter(
    FutureGameIds.ER_MAHJONG,
    'er_mahjong_rules_not_implemented'
  ),
  [FutureGameIds.XUELIU_MAHJONG]: createUnavailableGameAdapter(
    FutureGameIds.XUELIU_MAHJONG,
    'xueliu_mahjong_rules_not_implemented'
  ),
  [FutureGameIds.XUEZHAN_MAHJONG]: createUnavailableGameAdapter(
    FutureGameIds.XUEZHAN_MAHJONG,
    'xuezhan_mahjong_rules_not_implemented'
  ),
});

/** @deprecated 改用 futureGameAdapters，保留向后兼容 */
export const clonedGameAdapters = futureGameAdapters;

const gameRegistry = new Map();

export function registerGame(entry) {
  if (!entry?.id) throw new Error("registerGame requires id");
  gameRegistry.set(entry.id, Object.freeze({ ...entry }));
  return getGame(entry.id);
}

export function getGame(gameId) {
  return gameRegistry.get(gameId) || null;
}

export function listGames() {
  return [...gameRegistry.values()];
}

function lazyDoudizhuAdapter() {
  return async () => {
    const mod = await import("@tea-parlor/doudizhu-engine/adapter").catch(() => import("@tea-parlor/doudizhu-engine"));
    const factory = mod.createDoudizhuAdapter || mod.createAdapter;
    if (typeof factory !== "function") {
      return createUnavailableGameAdapter(GameIds.DOUDIZHU, "doudizhu_adapter_export_missing");
    }
    return factory();
  };
}

registerGame({
  id: GameIds.DOUDIZHU,
  engine: "@tea-parlor/doudizhu-engine",
  status: "ready",
  playable: "net-or-h5",
  createAdapter: lazyDoudizhuAdapter(),
});
registerGame({
  id: GameIds.TEXAS_HOLDEM,
  engine: "@tea-parlor/texas-engine",
  status: "h5-local",
  playable: "h5-local",
  createAdapter: async () => texasHoldemAdapter,
});
registerGame({
  id: GameIds.MAHJONG,
  engine: "@tea-parlor/mahjong-engine",
  status: "h5-local",
  playable: "h5-local",
  createAdapter: async () => mahjongAdapter,
});
registerGame({
  id: FutureGameIds.ZHAJINHUA,
  engine: "@tea-parlor/zhajinhua-engine",
  status: "h5-local",
  playable: "h5-local",
  createAdapter: async () => futureGameAdapters[FutureGameIds.ZHAJINHUA],
});
registerGame({
  id: FutureGameIds.GUANDAN,
  engine: "@tea-parlor/guandan-engine",
  status: "h5-local",
  playable: "h5-local",
  createAdapter: async () => createUnavailableGameAdapter(FutureGameIds.GUANDAN, "guandan_table_state_machine_pending"),
});

export {
  createTexasHoldemEngineAdapter,
  createZhajinhuaEngineAdapter,
  createMahjongEngineAdapter,
} from './engine-wrappers.js';

import {
  createTexasHoldemEngineAdapter as _createTexas,
  createZhajinhuaEngineAdapter as _createZjh,
  createMahjongEngineAdapter as _createMj,
} from './engine-wrappers.js';

export const texasHoldemEngineAdapter = _createTexas();
export const zhajinhuaEngineAdapter = _createZjh();
export const mahjongEngineAdapter = _createMj();
