import test from 'node:test';
import assert from 'node:assert/strict';

import { createCard } from '../src/card.js';
import { DoudizhuEngine, Phase } from '../src/engine.js';

function c(rank, suit = 0) {
  return createCard(rank, rank >= 16 ? 4 : suit);
}

function makeEngine() {
  const engine = new DoudizhuEngine({
    playerNames: ['A', 'B', 'C'],
    humanIndex: 0,
    baseRoomScore: 1,
  });
  engine.scheduleAI = () => {};
  return engine;
}

test('deals 17 cards to each player and keeps 3 bottom cards hidden during bidding', () => {
  const engine = makeEngine();
  engine.startGame();

  const state = engine.getState();
  assert.equal(state.phase, Phase.BID);
  assert.deepEqual(state.handCounts, [17, 17, 17]);
  assert.equal(state.bottomCards.length, 3);
  assert.equal(state.bottomRevealed, false);

  engine.destroy();
});

test('all players passing bid makes starter landlord with base score 1', () => {
  const engine = makeEngine();
  engine.startGame();

  const starter = engine.bidStarter;
  for (let i = 0; i < 3; i++) {
    assert.equal(engine.bid(engine.bidTurn, 0), true);
  }

  assert.equal(engine.phase, Phase.PLAY);
  assert.equal(engine.landlordIndex, starter);
  assert.equal(engine.baseScore, 1);
  assert.equal(engine.hands[starter].length, 20);
  assert.equal(engine.getState().bottomRevealed, true);

  engine.destroy();
});

test('bid score 3 immediately ends bidding and gives landlord first play', () => {
  const engine = makeEngine();
  engine.startGame();

  const bidder = engine.bidTurn;
  assert.equal(engine.bid(bidder, 3), true);

  assert.equal(engine.phase, Phase.PLAY);
  assert.equal(engine.landlordIndex, bidder);
  assert.equal(engine.currentPlayer, bidder);
  assert.equal(engine.baseScore, 3);

  engine.destroy();
});

test('rejects bids that do not exceed current bid', () => {
  const engine = makeEngine();
  engine.startGame();
  engine.bidStarter = 0;
  engine.bidTurn = 0;
  engine.biddingState = {
    playerCount: 3,
    starter: 0,
    turn: 0,
    currentBid: 0,
    landlordIndex: -1,
    bidScores: [null, null, null],
    actionCount: 0,
    finished: false,
    baseScore: 0,
    reason: null,
  };

  assert.equal(engine.bid(0, 1), true);
  assert.equal(engine.bid(1, 1), false);
  assert.equal(engine.bid(1, 2), true);

  engine.destroy();
});

test('single-card landlord win settles with farmer losses and spring multiplier', () => {
  const engine = makeEngine();
  engine.phase = Phase.PLAY;
  engine.landlordIndex = 0;
  engine.currentPlayer = 0;
  engine.baseScore = 2;
  engine.multiplier = 1;
  engine.hands = [[c(3)], [c(4)], [c(5)]];

  const result = engine.play(0, engine.hands[0]);

  assert.deepEqual(result, { ok: true });
  assert.equal(engine.phase, Phase.SETTLE);
  assert.equal(engine.settlement.winnerSide, 'landlord');
  assert.equal(engine.settlement.spring, true);
  assert.deepEqual(engine.settlement.scores, [8, -4, -4]);

  engine.destroy();
});

test('farmer win can trigger anti-spring and finishGame is idempotent', () => {
  const engine = makeEngine();
  engine.phase = Phase.PLAY;
  engine.landlordIndex = 0;
  engine.currentPlayer = 1;
  engine.baseScore = 3;
  engine.multiplier = 2;
  engine.turnPlayCount = [1, 0, 0];
  engine.hands = [[c(3), c(4)], [c(5)], [c(6)]];

  assert.deepEqual(engine.play(1, engine.hands[1]), { ok: true });
  const first = engine.settlement;
  const second = engine.finishGame(1);

  assert.equal(first.spring, true);
  assert.equal(first.multiplier, 4);
  assert.deepEqual(first.scores, [-24, 12, 12]);
  assert.strictEqual(second, first);

  engine.destroy();
});

test('rejects playing the same card twice as a fake pair', () => {
  const engine = makeEngine();
  engine.phase = Phase.PLAY;
  engine.landlordIndex = 0;
  engine.currentPlayer = 0;
  engine.hands = [[c(3), c(4)], [c(5)], [c(6)]];
  const dup = engine.hands[0][0];

  const result = engine.play(0, [dup, dup]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_in_hand');
  assert.equal(engine.hands[0].length, 2);

  engine.destroy();
});

test('two passes return lead to the last player who played', () => {
  const engine = makeEngine();
  engine.phase = Phase.PLAY;
  engine.landlordIndex = 0;
  engine.currentPlayer = 0;
  engine.hands = [[c(3), c(9)], [c(4)], [c(5)]];

  assert.deepEqual(engine.play(0, [engine.hands[0][0]]), { ok: true });
  assert.equal(engine.pass(1), true);
  assert.equal(engine.pass(2), true);

  assert.equal(engine.currentPlayer, 0);
  assert.equal(engine.lastPlay, null);
  assert.equal(engine.passCount, 0);

  engine.destroy();
});
