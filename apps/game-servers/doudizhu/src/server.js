import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  DoudizhuEngine,
  Phase,
  createDeck,
  createCard,
  sortCards,
  decideBid,
  decidePlay,
} from '@tea-parlor/doudizhu-engine';
import {
  createSettlementIntent,
  GameIds,
} from '@tea-parlor/game-adapter';
import {
  createWalletService,
} from '@tea-parlor/wallet-service';
import {
  createAvatarRepository,
} from '@tea-parlor/avatar-system';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

export function createDoudizhuRealtimeServer(options = {}) {
  const walletService = options.walletService || createWalletService();
  const avatarRepository = options.avatarRepository || createAvatarRepository(options.avatarOptions || {});
  const rooms = new Map();
  const socketsByUserId = new Map();
  const config = {
    host: options.host || '127.0.0.1',
    initialPoints: options.initialPoints ?? 1000,
    initialGrantScope: options.initialGrantScope || 'daily',
    initialGrantDate: options.initialGrantDate || (() => new Date().toISOString().slice(0, 10)),
    buyIn: options.buyIn ?? 100,
    baseRoomScore: options.baseRoomScore ?? 1,
    actionTimeoutMs: options.actionTimeoutMs ?? 15000,
    bidStarter: options.bidStarter ?? 0,
    deckFactory: options.deckFactory || (() => createDeck()),
    shortRound: Boolean(options.shortRound),
    enableTestControls: Boolean(options.enableTestControls),
    // 默认不自动补 AI（三人联机测试）；H5 测试桌 URL 加 fillBots=1 可单人交互
    fillBots: options.fillBots === true,
    adPlacements: options.adPlacements || defaultGameTableAds(),
  };

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/' || url.pathname === '/test-client.html') {
      await serveFile(res, join(PUBLIC_DIR, 'test-client.html'), 'text/html; charset=utf-8');
      return;
    }
    if (url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        gameId: GameIds.DOUDIZHU,
        rooms: rooms.size,
      });
      return;
    }
    if (url.pathname === '/rooms') {
      sendJson(res, 200, {
        ok: true,
        rooms: [...rooms.values()].map((room) => makePublicRoom(room)),
      });
      return;
    }
    if (url.pathname === '/ad-slots') {
      sendJson(res, 200, {
        ok: true,
        placements: config.adPlacements.filter((placement) => placement.enabled !== false),
      });
      return;
    }
    sendJson(res, 404, { ok: false, reason: 'not_found' });
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const roomId = sanitizeId(url.searchParams.get('roomId') || 'room-1', 'room-1');
    const userId = sanitizeId(url.searchParams.get('userId'), null);
    if (!userId) {
      send(ws, { type: 'error', reason: 'user_id_required' });
      ws.close(1008, 'user_id_required');
      return;
    }

    const name = sanitizeName(url.searchParams.get('name') || userId);
    const fillParam = url.searchParams.get('fillBots');
    const fillBots = fillParam === '1' || (fillParam !== '0' && config.fillBots);
    attachSocket({ ws, roomId, userId, name, fillBots });
  });

  function attachSocket({ ws, roomId, userId, name, fillBots = config.fillBots }) {
    const room = getOrCreateRoom(roomId);
    const existing = socketsByUserId.get(userId);
    if (existing && existing !== ws) existing.close(1000, 'replaced_by_reconnect');
    socketsByUserId.set(userId, ws);

    ws.userId = userId;
    ws.roomId = roomId;
    ws.isAlive = true;

    const joinResult = joinRoom(room, { id: userId, name, isBot: false });
    if (!joinResult.ok && joinResult.reason !== 'player_already_joined') {
      send(ws, { type: 'error', reason: joinResult.reason });
      ws.close(1008, joinResult.reason);
      return;
    }

    room.connectedUserIds.add(userId);
    room.events.push({ type: joinResult.reason === 'player_already_joined' ? 'reconnect' : 'join', userId, at: now() });
    send(ws, { type: 'connected', roomId, userId, seatIndex: findSeatIndex(room, userId) });

    if (fillBots) fillAiSeats(room);

    broadcastState(room, 'player_connected');

    if (room.players.length === 3 && !room.engine) {
      const start = startRound(room);
      if (!start.ok) broadcast(room, { type: 'error', reason: start.reason });
      else queueBotTurns(room);
    } else if (room.engine) {
      queueBotTurns(room);
    }

    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        send(ws, { type: 'error', reason: 'invalid_json' });
        return;
      }
      const result = applyClientMessage(room, userId, message);
      if (!result.ok) send(ws, { type: 'action_result', ok: false, reason: result.reason });
      else queueBotTurns(room);
    });

    ws.on('close', () => {
      if (socketsByUserId.get(userId) === ws) socketsByUserId.delete(userId);
      room.connectedUserIds.delete(userId);
      room.events.push({ type: 'disconnect', userId, at: now() });
      broadcastState(room, 'player_disconnected');
    });
  }

  function fillAiSeats(room) {
    let index = 1;
    while (room.players.length < 3) {
      const botId = sanitizeId(`bot-${room.roomId}-${index}`, `bot-${index}`);
      if (findSeatIndex(room, botId) >= 0) {
        index += 1;
        continue;
      }
      const result = joinRoom(room, { id: botId, name: `茶友AI${index}`, isBot: true });
      if (!result.ok) break;
      room.connectedUserIds.add(botId);
      room.botIds.add(botId);
      room.events.push({ type: 'bot_join', userId: botId, at: now() });
      index += 1;
    }
  }

  function isBotSeat(room, seatIndex) {
    const player = room.players[seatIndex];
    return Boolean(player && (player.isBot || room.botIds.has(player.id)));
  }

  function queueBotTurns(room) {
    if (!room?.engine || room.engine.phase === Phase.SETTLE) return;
    if (room.botTimer) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      driveBotTurns(room);
    }, 280);
  }

  function driveBotTurns(room) {
    if (!room.engine || room.engine.phase === Phase.SETTLE) return;
    let guard = 0;
    while (guard++ < 12) {
      const engine = room.engine;
      if (!engine || engine.phase === Phase.SETTLE) break;
      const seat = engine.phase === Phase.BID ? engine.bidTurn : engine.currentPlayer;
      if (!isBotSeat(room, seat)) break;

      let action;
      if (engine.phase === Phase.BID) {
        action = { type: 'bid', score: decideBid(engine.hands[seat], engine.currentBid) };
      } else {
        const prev = engine.lastPlay && engine.lastPlay.player !== seat ? engine.lastPlay.hand : null;
        const decision = decidePlay({
          hand: engine.hands[seat],
          prevHand: prev,
          isLandlord: engine.landlordIndex === seat,
          myIndex: seat,
          landlordIndex: engine.landlordIndex,
          handCounts: engine.hands.map((hand) => hand.length),
          prevPlayer: engine.lastPlay?.player,
        });
        if (!decision) action = { type: 'pass' };
        else action = { type: 'play', cardIds: decision.cards.map((card) => card.id) };
      }

      const result = applySeatAction(room, seat, action, true);
      if (!result.ok) {
        room.events.push({ type: 'bot_action_failed', seatIndex: seat, reason: result.reason, at: now() });
        break;
      }
      broadcastState(room, 'bot_action');
      if (room.engine?.phase === Phase.SETTLE) break;
    }
    scheduleTimeout(room);
  }

  function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        roomId,
        gameId: GameIds.DOUDIZHU,
        roundSeq: 0,
        roundId: null,
        status: 'waiting',
        players: [],
        connectedUserIds: new Set(),
        engine: null,
        locked: false,
        settled: false,
        settlementIntent: null,
        settlementResult: null,
        events: [],
        timer: null,
        botTimer: null,
        botIds: new Set(),
        shortRoundApplied: false,
      });
    }
    return rooms.get(roomId);
  }

  function joinRoom(room, player) {
    if (!player.id) return { ok: false, reason: 'player_id_required' };
    const existingSeat = findSeatIndex(room, player.id);
    if (existingSeat >= 0) return { ok: true, reason: 'player_already_joined', seatIndex: existingSeat };
    if (room.players.length >= 3) return { ok: false, reason: 'room_full' };
    if (room.engine) return { ok: false, reason: 'round_already_started' };

    issueInitialPoints(player.id, room.roomId);

    const seatIndex = room.players.length;
    room.players.push({
      id: player.id,
      name: player.name,
      seatIndex,
      isBot: Boolean(player.isBot),
      avatar: avatarRepository.getEquipment(player.id),
    });
    if (player.isBot) room.botIds.add(player.id);
    return { ok: true, seatIndex };
  }

  function issueInitialPoints(userId, roomId) {
    const grantBucket = typeof config.initialGrantDate === 'function'
      ? config.initialGrantDate()
      : config.initialGrantDate;
    return walletService.issuePoints({
      userId,
      amount: config.initialPoints,
      idempotencyKey: `doudizhu:issue:${config.initialGrantScope}:${grantBucket}:${userId}`,
      reason: 'doudizhu_realtime_daily_test_grant',
      metadata: {
        roomId,
        grantScope: config.initialGrantScope,
        grantBucket,
        policy: 'shadow_points_only',
      },
    });
  }

  function startRound(room) {
    if (room.players.length !== 3) return { ok: false, reason: 'requires_3_players' };
    if (room.engine) return { ok: false, reason: 'round_already_started' };
    room.roundSeq += 1;
    room.roundId = `${room.roomId}:round-${room.roundSeq}`;

    for (const player of room.players) {
      const lockResult = walletService.lockPoints({
        userId: player.id,
        amount: config.buyIn,
        referenceId: room.roundId,
        idempotencyKey: `doudizhu:lock:${room.roundId}:${player.id}`,
        metadata: { roomId: room.roomId, gameId: GameIds.DOUDIZHU },
      });
      if (!lockResult.ok) return lockResult;
    }
    room.locked = true;

    const engine = new DoudizhuEngine({
      playerNames: room.players.map((player) => player.name),
      humanIndex: -1,
      baseRoomScore: config.baseRoomScore,
    });
    engine.startGame({
      deck: config.deckFactory().slice(),
      bidStarter: config.bidStarter,
    });
    room.engine = engine;
    room.status = 'playing';
    room.events.push({ type: 'start_round', roundId: room.roundId, at: now() });
    broadcastState(room, 'round_started');
    scheduleTimeout(room);
    return { ok: true, room };
  }

  function applyClientMessage(room, userId, message) {
    if (message?.type === 'ping') {
      sendToUser(userId, { type: 'pong', at: now() });
      return { ok: true };
    }
    if (config.enableTestControls && message?.type === 'debug_set_short_round') {
      applyShortRound(room);
      broadcastState(room, 'debug_short_round');
      scheduleTimeout(room);
      return { ok: true };
    }
    if (message?.type === 'avatar:update') {
      const result = updatePlayerAvatar(room.roomId, userId, message.avatar || message);
      if (!result.ok) return result;
      broadcast(room, {
        type: 'PLAYER_AVATAR_UPDATED',
        userId,
        avatar: result.avatar,
        at: now(),
      });
      broadcastState(room, 'player_avatar_updated');
      return { ok: true };
    }
    if (message?.type !== 'action') return { ok: false, reason: 'unsupported_message' };
    return applyAction(room, userId, message.action || {});
  }

  function updatePlayerAvatar(roomId, userId, avatar) {
    const room = rooms.get(roomId);
    if (!room) return { ok: false, reason: 'room_not_found' };
    const seatIndex = findSeatIndex(room, userId);
    if (seatIndex < 0) return { ok: false, reason: 'player_not_in_room' };
    const result = avatarRepository.saveEquipment(userId, avatar?.equipment || avatar);
    if (!result.ok) return result;
    room.players[seatIndex].avatar = result;
    room.events.push({ type: 'player_avatar_updated', userId, seatIndex, at: now() });
    return { ok: true, avatar: result };
  }

  function applyAction(room, userId, action) {
    if (!room.engine) return { ok: false, reason: 'round_not_started' };
    if (room.engine.phase === Phase.SETTLE) return { ok: false, reason: 'round_settled' };
    const seatIndex = findSeatIndex(room, userId);
    if (seatIndex < 0) return { ok: false, reason: 'player_not_in_room' };
    const result = applySeatAction(room, seatIndex, action, false);
    if (!result.ok) return result;
    broadcastState(room, 'action_applied');
    scheduleTimeout(room);
    return { ok: true };
  }

  function applySeatAction(room, seatIndex, action, auto) {
    const engine = room.engine;
    if (!engine) return { ok: false, reason: 'round_not_started' };
    let ok;
    let actionForEvent = action;
    if (engine.phase === Phase.BID) {
      if (seatIndex !== engine.bidTurn) return { ok: false, reason: 'not_your_turn' };
      if (action.type !== 'bid') return { ok: false, reason: 'bid_required' };
      ok = engine.bid(seatIndex, Number(action.score || 0));
      if (!ok) return { ok: false, reason: 'invalid_bid' };
      if (engine.phase === Phase.PLAY && config.shortRound) applyShortRound(room);
    } else if (engine.phase === Phase.PLAY) {
      if (seatIndex !== engine.currentPlayer) return { ok: false, reason: 'not_your_turn' };
      if (action.type === 'pass') {
        ok = engine.pass(seatIndex);
        if (!ok) return { ok: false, reason: 'invalid_pass' };
      } else if (action.type === 'play' || action.type === 'play_first') {
        const cardIds = action.type === 'play_first'
          ? [sortCards(engine.hands[seatIndex], true)[0]?.id].filter(Boolean)
          : action.cardIds;
        const cards = resolveCards(engine.hands[seatIndex], cardIds);
        const playResult = engine.play(seatIndex, cards);
        if (!playResult.ok) return playResult;
        actionForEvent = { type: 'play', cardIds: cards.map((card) => card.id) };
      } else {
        return { ok: false, reason: 'play_or_pass_required' };
      }
    } else {
      return { ok: false, reason: 'invalid_phase' };
    }

    const event = {
      type: auto ? 'auto_action' : 'action',
      userId: room.players[seatIndex]?.id,
      seatIndex,
      phase: engine.phase,
      action: sanitizeAction(actionForEvent),
      at: now(),
    };
    room.events.push(event);
    if (auto) broadcast(room, { type: 'auto_action', event });
    if (engine.phase === Phase.SETTLE) submitSettlementIntent(room);
    return { ok: true };
  }

  function scheduleTimeout(room) {
    clearRoomTimer(room);
    if (!room.engine || room.engine.phase === Phase.SETTLE || config.actionTimeoutMs <= 0) return;
    room.timer = setTimeout(() => {
      room.timer = null;
      applyAutoAction(room);
    }, config.actionTimeoutMs);
  }

  function applyAutoAction(room) {
    if (!room.engine || room.engine.phase === Phase.SETTLE) return;
    const engine = room.engine;
    const seatIndex = engine.phase === Phase.BID ? engine.bidTurn : engine.currentPlayer;
    let action;
    if (engine.phase === Phase.BID) {
      action = { type: 'bid', score: 0 };
    } else if (engine.lastPlay && engine.lastPlay.player !== seatIndex) {
      action = { type: 'pass' };
    } else {
      action = { type: 'play_first' };
    }
    const result = applySeatAction(room, seatIndex, action, true);
    if (!result.ok) {
      room.events.push({ type: 'auto_action_failed', seatIndex, reason: result.reason, at: now() });
      broadcast(room, { type: 'error', reason: result.reason });
      return;
    }
    broadcastState(room, 'auto_action_applied');
    scheduleTimeout(room);
  }

  function clearRoomTimer(room) {
    if (room?.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    if (room?.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
  }

  function applyShortRound(room) {
    if (!room.engine || room.engine.phase !== Phase.PLAY || room.shortRoundApplied) return;
    const landlord = room.engine.landlordIndex;
    const left = (landlord + 1) % 3;
    const right = (landlord + 2) % 3;
    room.engine.hands[landlord] = sortCards([testCard(3, 0), testCard(9, 1)]);
    room.engine.hands[left] = sortCards([testCard(4, 0)]);
    room.engine.hands[right] = sortCards([testCard(5, 0)]);
    room.engine.currentPlayer = landlord;
    room.engine.lastPlay = null;
    room.engine.passCount = 0;
    room.shortRoundApplied = true;
  }

  function submitSettlementIntent(room) {
    if (!room.engine?.settlement || room.settled) return room.settlementResult;
    clearRoomTimer(room);
    room.settlementIntent = createSettlementIntent({
      gameId: GameIds.DOUDIZHU,
      roomId: room.roomId,
      roundId: room.roundId,
      settlement: room.engine.settlement,
    });
    room.settlementResult = walletService.applySettlementIntent(room.settlementIntent, {
      participants: room.players.map((player) => player.id),
    });
    room.settled = Boolean(room.settlementResult?.ok);
    room.status = 'settled';
    room.events.push({
      type: 'settlement_intent_submitted',
      idempotencyKey: room.settlementIntent.idempotencyKey,
      at: now(),
    });
    broadcast(room, {
      type: 'settlement',
      roomId: room.roomId,
      roundId: room.roundId,
      settlementIntent: room.settlementIntent,
      walletResult: room.settlementResult,
    });
    return room.settlementResult;
  }

  function broadcastState(room, reason) {
    for (const player of room.players) {
      sendToUser(player.id, {
        type: 'state',
        reason,
        state: getPublicState(room.roomId, player.id),
      });
    }
  }

  function broadcast(room, message) {
    for (const player of room.players) sendToUser(player.id, message);
  }

  function sendToUser(userId, message) {
    const ws = socketsByUserId.get(userId);
    if (ws) send(ws, message);
  }

  function getPublicState(roomId, viewerId = null) {
    const room = rooms.get(roomId);
    if (!room) return { ok: false, reason: 'room_not_found' };
    const engineState = room.engine?.getState();
    const viewerSeat = viewerId ? findSeatIndex(room, viewerId) : -1;
    const account = viewerId ? walletService.getAccount(viewerId) : null;
    return {
      ok: true,
      gameId: GameIds.DOUDIZHU,
      roomId: room.roomId,
      roundId: room.roundId,
      status: room.status,
      phase: engineState?.phase || 'waiting',
      viewerId,
      viewerSeat,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        seatIndex: player.seatIndex,
        connected: room.connectedUserIds.has(player.id),
        isBot: Boolean(player.isBot || room.botIds.has(player.id)),
        avatar: player.avatar || avatarRepository.getEquipment(player.id),
      })),
      currentSeat: engineState?.phase === Phase.BID ? engineState.bidTurn : engineState?.currentPlayer ?? -1,
      bidScores: engineState?.bidScores || [0, 0, 0],
      currentBid: engineState?.currentBid ?? 0,
      handCounts: engineState?.handCounts || room.players.map(() => 0),
      hand: engineState && viewerSeat >= 0 ? engineState.hands[viewerSeat].slice() : [],
      bottomCards: engineState?.bottomRevealed ? engineState.bottomCards.slice() : [],
      bottomRevealed: Boolean(engineState?.bottomRevealed),
      landlordIndex: engineState?.landlordIndex ?? -1,
      lastPlay: engineState?.lastPlay || null,
      passCount: engineState?.passCount ?? 0,
      baseScore: engineState?.baseScore ?? config.baseRoomScore,
      multiplier: engineState?.multiplier ?? 1,
      canPass: Boolean(engineState?.lastPlay && engineState.lastPlay.player !== viewerSeat && engineState.currentPlayer === viewerSeat),
      wallet: account,
      ledgerCount: viewerId ? walletService.queryLedger({ userId: viewerId }).length : walletService.queryLedger().length,
      settlementIntent: room.settlementIntent,
      settlementResult: room.settlementResult,
      recentEvents: room.events.slice(-12).map(publicEvent),
    };
  }

  function listen(port = 0, host = config.host) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        const address = httpServer.address();
        resolve({
          port: address.port,
          host: address.address,
          url: `http://${address.address}:${address.port}`,
          wsUrl: `ws://${address.address}:${address.port}/ws`,
        });
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, host);
    });
  }

  function close() {
    for (const room of rooms.values()) clearRoomTimer(room);
    for (const ws of socketsByUserId.values()) ws.close(1000, 'server_close');
    return new Promise((resolve, reject) => {
      wss.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    });
  }

  return {
    httpServer,
    wss,
    rooms,
    walletService,
    avatarRepository,
    listen,
    close,
    getPublicState,
    applyAction,
    startRound,
    submitSettlementIntent,
    updatePlayerAvatar,
  };
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function findSeatIndex(room, userId) {
  return room.players.findIndex((player) => player.id === userId);
}

function resolveCards(hand, cardIds) {
  const ids = new Set(cardIds || []);
  return hand.filter((card) => ids.has(card.id));
}

function sanitizeAction(action) {
  if (!action) return null;
  if (action.type === 'play') return { type: 'play', cardIds: (action.cardIds || []).slice() };
  if (action.type === 'play_first') return { type: 'play_first' };
  if (action.type === 'bid') return { type: 'bid', score: Number(action.score || 0) };
  if (action.type === 'pass') return { type: 'pass' };
  return { type: action.type };
}

function publicEvent(event) {
  if (!event) return event;
  if (event.action) return { ...event, action: sanitizeAction(event.action) };
  return { ...event };
}

function makePublicRoom(room) {
  return {
    roomId: room.roomId,
    gameId: room.gameId,
    status: room.status,
    roundId: room.roundId,
    playerCount: room.players.length,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      seatIndex: player.seatIndex,
      connected: room.connectedUserIds.has(player.id),
    })),
  };
}

function sanitizeId(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 64) || fallback;
}

function sanitizeName(value) {
  return String(value || '').replace(/[<>]/g, '').slice(0, 24) || 'Player';
}

function now() {
  return new Date().toISOString();
}

function testCard(rank, suit) {
  return createCard(rank, suit);
}

function defaultGameTableAds() {
  return [
    {
      slotId: 'doudizhu-table-center',
      surface: 'game-table',
      slotType: 'table-surface',
      advertiserName: 'TeaSwap',
      campaignTitle: '桌面冠名',
      copy: '链游积分季',
      assetTheme: 'dex',
      enabled: true,
    },
    {
      slotId: 'doudizhu-table-rail-left',
      surface: 'game-table',
      slotType: 'table-rail',
      advertiserName: 'BitBridge',
      campaignTitle: '牌桌边栏',
      copy: '平台活动入口',
      assetTheme: 'platform',
      enabled: true,
    },
    {
      slotId: 'doudizhu-table-rail-right',
      surface: 'game-table',
      slotType: 'table-rail',
      advertiserName: 'MintPad',
      campaignTitle: '牌桌边栏',
      copy: '项目日历',
      assetTheme: 'launchpad',
      enabled: true,
    },
    {
      slotId: 'doudizhu-costume-seat-0',
      surface: 'game-table',
      slotType: 'character-costume',
      advertiserName: 'ChainQuest',
      campaignTitle: '地主披风',
      copy: '赛季任务',
      assetTheme: 'quest',
      enabled: true,
    },
    {
      slotId: 'doudizhu-costume-seat-1',
      surface: 'game-table',
      slotType: 'character-costume',
      advertiserName: 'CEXOne',
      campaignTitle: '农民背心',
      copy: '积分榜',
      assetTheme: 'exchange',
      enabled: true,
    },
    {
      slotId: 'doudizhu-costume-seat-2',
      surface: 'game-table',
      slotType: 'character-costume',
      advertiserName: 'BlockHarbor',
      campaignTitle: '农民肩章',
      copy: '平台活动',
      assetTheme: 'platform',
      enabled: true,
    },
  ];
}

async function serveFile(res, filePath, contentType) {
  try {
    const html = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType });
    res.end(html);
  } catch {
    sendJson(res, 404, { ok: false, reason: 'file_not_found' });
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 5180);
  const server = createDoudizhuRealtimeServer();
  server.listen(port).then(({ url }) => {
    console.log(`Doudizhu realtime server listening on ${url}`);
  });
}
