import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createAvatarRepository, equipItem, initializeDefaultAvatar } from '@tea-parlor/avatar-system';
import { LedgerEntryType } from '@tea-parlor/wallet-service';
import { createDoudizhuRealtimeServer } from '../src/server.js';

test('saved avatar equipment is exposed in public state without starting a round', () => {
  const avatarRepository = createAvatarRepository({ devGrantAll: true });
  const server = createDoudizhuRealtimeServer({ avatarRepository });
  const room = {
    roomId: 'avatar-room',
    gameId: 'doudizhu',
    roundSeq: 0,
    roundId: null,
    status: 'waiting',
    players: [
      { id: 'p1', name: 'p1', seatIndex: 0, isBot: false, avatar: avatarRepository.getEquipment('p1') },
    ],
    connectedUserIds: new Set(['p1']),
    issuedUserIds: new Set(),
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
  };
  server.rooms.set('avatar-room', room);

  const savedAvatar = equipItem(initializeDefaultAvatar().equipment, 'top_black');
  const update = server.updatePlayerAvatar('avatar-room', 'p1', savedAvatar);
  assert.equal(update.ok, true);

  const publicState = server.getPublicState('avatar-room', 'p1');
  assert.equal(publicState.ok, true);
  assert.equal(publicState.players[0].avatar.equipment.top, 'top_black');
  assert.ok(publicState.recentEvents.some((event) => event.type === 'player_avatar_updated'));
});

test('three websocket players complete one round and wallet records settlement ledger', async () => {
  const server = createDoudizhuRealtimeServer({
    actionTimeoutMs: 0,
    shortRound: true,
    bidStarter: 0,
    initialPoints: 1000,
    buyIn: 100,
  });
  const address = await server.listen(0);

  try {
    const clients = await connectPlayers(address.wsUrl, 'manual-room');
    await waitForState(clients.p3, (state) => state.phase === 'bid' && state.players.length === 3);

    clients.p1.sendAction({ type: 'bid', score: 0 });
    await waitForState(clients.p2, (state) => state.currentSeat === 1);
    clients.p2.sendAction({ type: 'bid', score: 0 });
    await waitForState(clients.p3, (state) => state.currentSeat === 2);
    clients.p3.sendAction({ type: 'bid', score: 0 });
    await waitForState(clients.p1, (state) => state.phase === 'play' && state.currentSeat === 0);

    clients.p1.sendAction({ type: 'play_first' });
    await waitForState(clients.p2, (state) => state.phase === 'play' && state.currentSeat === 1);
    clients.p2.sendAction({ type: 'pass' });
    await waitForState(clients.p3, (state) => state.phase === 'play' && state.currentSeat === 2);
    clients.p3.sendAction({ type: 'pass' });
    await waitForState(clients.p1, (state) => state.phase === 'play' && state.currentSeat === 0);
    clients.p1.sendAction({ type: 'play_first' });

    const settled = await waitForState(clients.p1, (state) => state.phase === 'settle');
    assert.equal(settled.settlementIntent.ledgerPolicy, 'adapter_returns_intent_only');
    assert.deepEqual(settled.settlementIntent.scores, [4, -2, -2]);

    const ledger = server.walletService.queryLedger();
    assert.equal(ledger.filter((entry) => entry.type === LedgerEntryType.ISSUE).length, 3);
    assert.equal(ledger.filter((entry) => entry.type === LedgerEntryType.LOCK).length, 3);
    assert.equal(ledger.filter((entry) => entry.type === LedgerEntryType.SETTLEMENT).length, 3);
    assert.equal(server.walletService.getAccount('p1').available, 1004);
    assert.equal(server.walletService.getAccount('p2').available, 998);
    assert.equal(server.walletService.getAccount('p3').available, 998);

    const room = server.rooms.get('manual-room');
    const beforeRepeat = server.walletService.queryLedger().length;
    const repeated = server.submitSettlementIntent(room);
    assert.equal(repeated.ok, true);
    assert.equal(server.walletService.queryLedger().length, beforeRepeat);

    closeClients(clients);
  } finally {
    await server.close();
  }
});

test('initial shadow point grant is idempotent by user and date, not room id', async () => {
  const server = createDoudizhuRealtimeServer({
    actionTimeoutMs: 0,
    initialPoints: 1000,
    initialGrantDate: () => '2026-08-22',
  });
  const address = await server.listen(0);

  try {
    const first = await connectClient(address.wsUrl, 'grant-room-a', 'p1');
    await waitForState(first, (state) => state.players.some((player) => player.id === 'p1'));
    first.close();

    const second = await connectClient(address.wsUrl, 'grant-room-b', 'p1');
    await waitForState(second, (state) => state.players.some((player) => player.id === 'p1'));

    const issues = server.walletService
      .queryLedger({ userId: 'p1', type: LedgerEntryType.ISSUE });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].idempotencyKey, 'doudizhu:issue:daily:2026-08-22:p1');
    assert.equal(server.walletService.getAccount('p1').available, 1000);

    closeClients({ second });
  } finally {
    await server.close();
  }
});

test('disconnect and reconnect preserves seat, hand view, and current room state', async () => {
  const server = createDoudizhuRealtimeServer({
    actionTimeoutMs: 0,
    shortRound: true,
    bidStarter: 0,
  });
  const address = await server.listen(0);

  try {
    const clients = await connectPlayers(address.wsUrl, 'reconnect-room');
    await waitForState(clients.p1, (state) => state.phase === 'bid');
    clients.p1.sendAction({ type: 'bid', score: 3 });
    await waitForState(clients.p1, (state) => state.phase === 'play' && state.currentSeat === 0);

    clients.p2.close();
    const disconnected = await waitForState(clients.p1, (state) => state.players[1]?.connected === false);
    assert.equal(disconnected.players[1].id, 'p2');

    const replacement = await connectClient(address.wsUrl, 'reconnect-room', 'p2');
    const reconnected = await waitForState(replacement, (state) => state.viewerSeat === 1 && state.players[1]?.connected);
    assert.equal(reconnected.phase, 'play');
    assert.equal(reconnected.hand.length, 1);
    assert.equal(reconnected.currentSeat, 0);

    closeClients({ p1: clients.p1, p2: replacement, p3: clients.p3 });
  } finally {
    await server.close();
  }
});

test('timeout trustee advances bidding, play, pass, and settlement', async () => {
  const server = createDoudizhuRealtimeServer({
    actionTimeoutMs: 35,
    shortRound: true,
    bidStarter: 0,
  });
  const address = await server.listen(0);

  try {
    const clients = await connectPlayers(address.wsUrl, 'timeout-room');
    const settled = await waitForState(clients.p1, (state) => state.phase === 'settle', 2500);
    assert.ok(settled.recentEvents.some((event) => event.type === 'auto_action'));
    assert.ok(settled.settlementIntent);
    assert.equal(server.walletService.queryLedger({ type: LedgerEntryType.SETTLEMENT }).length, 3);
    closeClients(clients);
  } finally {
    await server.close();
  }
});

async function connectPlayers(wsUrl, roomId) {
  const p1 = await connectClient(wsUrl, roomId, 'p1');
  const p2 = await connectClient(wsUrl, roomId, 'p2');
  const p3 = await connectClient(wsUrl, roomId, 'p3');
  return { p1, p2, p3 };
}

function connectClient(wsUrl, roomId, userId) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`${wsUrl}?roomId=${roomId}&userId=${userId}&name=${userId}`);
    client.messages = [];
    client.states = [];
    client.waiters = [];
    client.sendAction = (action) => {
      client.send(JSON.stringify({ type: 'action', action }));
    };
    client.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      client.messages.push(message);
      if (message.type === 'state') client.states.push(message.state);
      for (const waiter of client.waiters.slice()) waiter();
    });
    client.once('open', () => resolve(client));
    client.once('error', reject);
  });
}

function waitForState(client, predicate, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const state = client.states.find(predicate);
      if (state) {
        cleanup();
        resolve(state);
        return;
      }
      if (Date.now() > deadline) {
        cleanup();
        reject(new Error(`timed_out_waiting_for_state:${client.url}`));
      }
    };
    const interval = setInterval(check, 10);
    const cleanup = () => {
      clearInterval(interval);
      const index = client.waiters.indexOf(check);
      if (index >= 0) client.waiters.splice(index, 1);
    };
    client.waiters.push(check);
    check();
  });
}

function closeClients(clients) {
  for (const client of Object.values(clients)) {
    if (client.readyState < WebSocket.CLOSING) client.close();
  }
}
