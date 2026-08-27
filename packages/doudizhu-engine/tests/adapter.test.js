import test from 'node:test';
import assert from 'node:assert/strict';

import { createCard } from '../src/card.js';
import { createDoudizhuAdapter } from '../src/adapter.js';
import { Phase } from '../src/engine.js';

function c(rank, suit = 0) {
  return createCard(rank, rank >= 16 ? 4 : suit);
}

function joinThree(adapter, roomId) {
  assert.equal(adapter.joinRoom(roomId, { id: 'p1', name: 'Alice' }).ok, true);
  assert.equal(adapter.joinRoom(roomId, { id: 'p2', name: 'Bob' }).ok, true);
  assert.equal(adapter.joinRoom(roomId, { id: 'p3', name: 'Carol' }).ok, true);
}

test('doudizhu adapter creates a room and seats three players', () => {
  const adapter = createDoudizhuAdapter({ roomIdFactory: () => 'room-a' });

  const created = adapter.createRoom({ baseRoomScore: 2, bidStarter: 0 });
  assert.equal(created.ok, true);
  assert.equal(created.room.roomId, 'room-a');
  assert.equal(created.room.status, 'waiting');

  joinThree(adapter, 'room-a');
  assert.equal(adapter.joinRoom('room-a', { id: 'p4', name: 'Dan' }).ok, false);

  const state = adapter.getPublicState('room-a', 'p1');
  assert.equal(state.ok, true);
  assert.equal(state.phase, 'waiting');
  assert.equal(state.players.length, 3);
});

test('doudizhu adapter starts a round and hides private hands from other players', () => {
  const adapter = createDoudizhuAdapter({ roomIdFactory: () => 'room-b' });
  adapter.createRoom({ bidStarter: 0 });
  joinThree(adapter, 'room-b');

  const started = adapter.startRound('room-b');
  assert.equal(started.ok, true);
  assert.equal(started.roundId, 'room-b:round-1');

  const p1State = adapter.getPublicState('room-b', 'p1');
  assert.equal(p1State.phase, Phase.BID);
  assert.equal(p1State.viewerSeat, 0);
  assert.equal(p1State.hands[0].length, 17);
  assert.equal(p1State.hands[1], null);
  assert.equal(p1State.hands[2], null);
  assert.equal(p1State.bottomCards.length, 0);
  assert.equal(p1State.bottomRevealed, false);
});

test('doudizhu adapter applies bid actions through unified adapter surface', () => {
  const adapter = createDoudizhuAdapter({ roomIdFactory: () => 'room-c' });
  adapter.createRoom({ bidStarter: 0 });
  joinThree(adapter, 'room-c');
  adapter.startRound('room-c');

  assert.equal(adapter.applyAction('room-c', 'p1', { type: 'bid', score: 1 }).ok, true);
  assert.equal(adapter.applyAction('room-c', 'p2', { type: 'bid', score: 1 }).ok, false);
  assert.equal(adapter.applyAction('room-c', 'p2', { type: 'bid', score: 2 }).ok, true);
  const result = adapter.applyAction('room-c', 'p3', { type: 'bid', score: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.phase, Phase.PLAY);
  assert.equal(result.state.landlordIndex, 1);
  assert.equal(result.state.currentPlayer, 1);
  assert.equal(result.state.bottomRevealed, true);
});

test('doudizhu adapter applies play/pass and returns settlement intent only', () => {
  const adapter = createDoudizhuAdapter({ roomIdFactory: () => 'room-d' });
  adapter.createRoom({ bidStarter: 0 });
  joinThree(adapter, 'room-d');
  adapter.startRound('room-d');

  for (const playerId of ['p1', 'p2', 'p3']) {
    assert.equal(adapter.applyAction('room-d', playerId, { type: 'bid', score: 0 }).ok, true);
  }

  const room = adapter._getRoomForTest('room-d');
  room.engine.baseScore = 2;
  room.engine.hands = [[c(3), c(9)], [c(4)], [c(5)]];
  room.engine.currentPlayer = 0;

  const firstCardId = room.engine.hands[0][0].id;
  assert.equal(
    adapter.applyAction('room-d', 'p1', { type: 'play', cardIds: [firstCardId] }).ok,
    true
  );
  assert.equal(adapter.applyAction('room-d', 'p2', { type: 'pass' }).ok, true);
  assert.equal(adapter.applyAction('room-d', 'p3', { type: 'pass' }).ok, true);

  const winningCardId = room.engine.hands[0][0].id;
  const playResult = adapter.applyAction('room-d', 'p1', {
    type: 'play',
    cardIds: [winningCardId],
  });

  assert.equal(playResult.ok, true);
  assert.equal(playResult.phase, Phase.SETTLE);
  assert.equal(playResult.settlementIntent.type, 'settlement_intent');
  assert.equal(playResult.settlementIntent.gameId, 'doudizhu');
  assert.equal(playResult.settlementIntent.roomId, 'room-d');
  assert.equal(playResult.settlementIntent.ledgerPolicy, 'adapter_returns_intent_only');
  assert.equal(playResult.settlementIntent.spring, true);
  assert.deepEqual(playResult.settlementIntent.scores, [8, -4, -4]);
  assert.equal('balance' in playResult.settlementIntent, false);

  const settled = adapter.settleRound('room-d');
  assert.equal(settled.ok, true);
  assert.strictEqual(settled.settlementIntent, playResult.settlementIntent);
});

test('settleRound refuses unsettled rounds', () => {
  const adapter = createDoudizhuAdapter({ roomIdFactory: () => 'room-e' });
  adapter.createRoom({ bidStarter: 0 });
  joinThree(adapter, 'room-e');
  adapter.startRound('room-e');

  const result = adapter.settleRound('room-e');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'round_not_settled');
});
