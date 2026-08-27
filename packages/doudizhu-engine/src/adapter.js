import {
  AdapterStatus,
  createSettlementIntent,
  GameIds,
} from '@tea-parlor/game-adapter';
import { DoudizhuEngine, Phase } from './engine.js';

export function createDoudizhuAdapter(options = {}) {
  const rooms = new Map();
  const makeRoomId = options.roomIdFactory || defaultRoomIdFactory();

  return {
    gameId: GameIds.DOUDIZHU,
    status: AdapterStatus.READY,

    createRoom(config = {}) {
      const roomId = config.roomId || makeRoomId();
      if (rooms.has(roomId)) return { ok: false, reason: 'room_exists', roomId };

      const room = {
        roomId,
        gameId: GameIds.DOUDIZHU,
        config: {
          baseRoomScore: config.baseRoomScore ?? 1,
          bidStarter: config.bidStarter,
          deck: config.deck,
        },
        players: [],
        roundId: null,
        engine: null,
        events: [],
        settlementIntent: null,
      };
      rooms.set(roomId, room);
      return { ok: true, room: publicRoom(room) };
    },

    joinRoom(roomId, player) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      if (room.engine) return { ok: false, reason: 'round_already_started' };
      if (!player?.id) return { ok: false, reason: 'player_id_required' };
      if (room.players.some((seat) => seat.id === player.id)) {
        return { ok: false, reason: 'player_already_joined' };
      }
      if (room.players.length >= 3) return { ok: false, reason: 'room_full' };

      const seatIndex = room.players.length;
      room.players.push({
        id: player.id,
        name: String(player.name || player.id).slice(0, 24),
        seatIndex,
      });
      room.events.push({ type: 'join', playerId: player.id, seatIndex });
      return { ok: true, seatIndex, room: publicRoom(room) };
    },

    startRound(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      if (room.players.length !== 3) return { ok: false, reason: 'requires_3_players' };
      if (room.engine) return { ok: false, reason: 'round_already_started' };

      const engine = new DoudizhuEngine({
        playerNames: room.players.map((player) => player.name),
        humanIndex: -1,
        baseRoomScore: room.config.baseRoomScore,
      });
      engine.startGame({
        deck: room.config.deck,
        bidStarter: room.config.bidStarter,
      });
      room.engine = engine;
      room.roundId = `${room.roomId}:round-1`;
      room.events.push({ type: 'start_round', roundId: room.roundId });

      return { ok: true, roundId: room.roundId, state: this.getPublicState(roomId) };
    },

    applyAction(roomId, playerId, action) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      if (!room.engine) return { ok: false, reason: 'round_not_started' };

      const seatIndex = findSeatIndex(room, playerId);
      if (seatIndex < 0) return { ok: false, reason: 'player_not_in_room' };

      const engine = room.engine;
      let result;
      if (action?.type === 'bid') {
        result = engine.bid(seatIndex, action.score);
        if (!result) return { ok: false, reason: 'invalid_bid' };
      } else if (action?.type === 'play') {
        const cards = resolveCards(engine.hands[seatIndex], action.cardIds);
        result = engine.play(seatIndex, cards);
        if (!result.ok) return result;
      } else if (action?.type === 'pass') {
        result = engine.pass(seatIndex);
        if (!result) return { ok: false, reason: 'invalid_pass' };
      } else {
        return { ok: false, reason: 'unsupported_action' };
      }

      room.events.push({
        type: 'action',
        playerId,
        seatIndex,
        action: sanitizeAction(action),
      });

      if (engine.phase === Phase.SETTLE) {
        room.settlementIntent = createSettlementIntent({
          gameId: GameIds.DOUDIZHU,
          roomId,
          roundId: room.roundId,
          settlement: engine.settlement,
        });
      }

      return {
        ok: true,
        phase: engine.phase,
        state: this.getPublicState(roomId, playerId),
        settlementIntent: room.settlementIntent,
      };
    },

    getPublicState(roomId, viewerId = null) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      const viewerSeat = viewerId ? findSeatIndex(room, viewerId) : -1;
      const state = room.engine ? room.engine.getState() : null;

      return {
        ok: true,
        roomId,
        gameId: GameIds.DOUDIZHU,
        roundId: room.roundId,
        players: room.players.map((player) => ({ ...player })),
        phase: state?.phase || 'waiting',
        viewerSeat,
        handCounts: state?.handCounts || room.players.map(() => 0),
        hands: state ? state.hands.map((hand, idx) => idx === viewerSeat ? hand.slice() : null) : [],
        bottomCards: state?.bottomRevealed ? state.bottomCards.slice() : [],
        bottomRevealed: Boolean(state?.bottomRevealed),
        landlordIndex: state?.landlordIndex ?? -1,
        bidScores: state?.bidScores || [0, 0, 0],
        currentBid: state?.currentBid ?? 0,
        bidTurn: state?.bidTurn ?? -1,
        currentPlayer: state?.currentPlayer ?? -1,
        lastPlay: state?.lastPlay || null,
        passCount: state?.passCount ?? 0,
        baseScore: state?.baseScore ?? room.config.baseRoomScore,
        multiplier: state?.multiplier ?? 1,
        settlementIntent: room.settlementIntent,
      };
    },

    settleRound(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      if (!room.engine) return { ok: false, reason: 'round_not_started' };
      if (room.engine.phase !== Phase.SETTLE || !room.engine.settlement) {
        return { ok: false, reason: 'round_not_settled' };
      }
      if (!room.settlementIntent) {
        room.settlementIntent = createSettlementIntent({
          gameId: GameIds.DOUDIZHU,
          roomId,
          roundId: room.roundId,
          settlement: room.engine.settlement,
        });
      }
      return { ok: true, settlementIntent: room.settlementIntent };
    },

    replay(roomId) {
      const room = rooms.get(roomId);
      if (!room) return { ok: false, reason: 'room_not_found' };
      return { ok: true, events: room.events.slice() };
    },

    _getRoomForTest(roomId) {
      return rooms.get(roomId);
    },
  };
}

export const doudizhuAdapter = createDoudizhuAdapter();

function defaultRoomIdFactory() {
  let nextId = 1;
  return () => `doudizhu-room-${nextId++}`;
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    gameId: room.gameId,
    playerCount: room.players.length,
    players: room.players.map((player) => ({ ...player })),
    status: room.engine ? 'playing' : 'waiting',
  };
}

function findSeatIndex(room, playerId) {
  return room.players.findIndex((player) => player.id === playerId);
}

function resolveCards(hand, cardIds) {
  const ids = cardIds || [];
  if (new Set(ids).size !== ids.length) return [];
  return ids.map((id) => hand.find((card) => card.id === id)).filter(Boolean);
}

function sanitizeAction(action) {
  if (!action) return null;
  if (action.type === 'play') {
    return { type: 'play', cardIds: (action.cardIds || []).slice() };
  }
  if (action.type === 'bid') return { type: 'bid', score: action.score };
  if (action.type === 'pass') return { type: 'pass' };
  return { type: action.type };
}
