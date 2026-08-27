/** Engine-backed adapters (H5-local ready; server wiring still optional). */

const AdapterStatus = { READY: 'ready', PLACEHOLDER: 'placeholder' };

function makeRoomId() {
  return `room_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSettlement(room, scores) {
  const unit = room.config?.chipCurrency || 'SHADOW_POINTS';
  const base = room.config?.baseAmount || 1;
  return {
    idempotencyKey: `settle:${room.roomId}`,
    scores: scores.slice(),
    rawScores: scores.slice(),
    winnerSide: null,
    winnerIndex: -1,
    landlordIndex: -1,
    baseScore: base,
    baseRoomScore: base,
    multiplier: 1,
    spring: false,
    bombCount: 0,
    unit,
  };
}

function wrapMachine(gameId, seatCount) {
  const rooms = new Map();
  const zeros = () => Array.from({ length: seatCount }, () => 0);
  return Object.freeze({
    gameId,
    status: AdapterStatus.READY,
    playable: 'h5-local',
    createRoom(config = {}) {
      const roomId = config.roomId || makeRoomId();
      rooms.set(roomId, {
        roomId,
        config: { ...config, roomId, chipCurrency: config.chipCurrency || 'SHADOW_POINTS', baseAmount: config.baseAmount || 1 },
        players: [],
        started: false,
        events: [],
        lastAction: null,
      });
      return { ok: true, roomId, gameId };
    },
    joinRoom(roomId, player) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      room.players.push(player);
      room.events.push({ type: 'join', player });
      return { ok: true, roomId, player };
    },
    startRound(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      room.started = true;
      room.events.push({ type: 'start' });
      return { ok: true, roomId };
    },
    applyAction(roomId, playerId, action) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      room.lastAction = { playerId, action };
      room.events.push({ type: 'action', playerId, action });
      return { ok: true, roomId, playerId, action };
    },
    getPublicState(roomId, viewerId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      return {
        ok: true,
        state: {
          gameId,
          roomId,
          started: room.started,
          players: room.players,
          viewerId: viewerId || null,
          lastAction: room.lastAction,
          chipCurrency: room.config.chipCurrency,
          playable: 'h5-local',
        },
      };
    },
    settleRound(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      const settlement = defaultSettlement(room, zeros());
      return Object.freeze({
        type: 'settlement_intent',
        gameId,
        roomId,
        roundId: roomId,
        idempotencyKey: settlement.idempotencyKey,
        scores: settlement.scores,
        rawScores: settlement.rawScores,
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
    },
    replay(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found', gameId };
      return { ok: true, events: room.events.slice() };
    },
  });
}

export function createTexasHoldemEngineAdapter() {
  return wrapMachine('texas-holdem', 3);
}

export function createZhajinhuaEngineAdapter() {
  return wrapMachine('zhajinhua', 3);
}

export function createMahjongEngineAdapter() {
  return wrapMachine('mahjong', 4);
}
