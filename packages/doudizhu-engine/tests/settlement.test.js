import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWinLossCap,
  calculateMultiplier,
  calculateSettlement,
  detectSpring,
} from '../src/settlement.js';

test('calculates basic landlord win and farmer win scores', () => {
  assert.deepEqual(
    calculateSettlement({
      landlordIndex: 0,
      winnerIndex: 0,
      baseScore: 2,
      baseRoomScore: 10,
      multiplier: 4,
    }).scores,
    [160, -80, -80]
  );

  assert.deepEqual(
    calculateSettlement({
      landlordIndex: 2,
      winnerIndex: 0,
      baseScore: 3,
      baseRoomScore: 5,
      multiplier: 2,
    }).scores,
    [30, 30, -60]
  );
});

test('detects spring and anti-spring from play counts', () => {
  assert.equal(
    detectSpring({ landlordIndex: 0, winnerIndex: 0, turnPlayCount: [1, 0, 0] }),
    true
  );
  assert.equal(
    detectSpring({ landlordIndex: 0, winnerIndex: 1, turnPlayCount: [1, 1, 0] }),
    true
  );
  assert.equal(
    detectSpring({ landlordIndex: 0, winnerIndex: 1, turnPlayCount: [2, 1, 0] }),
    false
  );
});

test('calculates multiplier from bombs, rocket, and spring doubling events', () => {
  assert.equal(calculateMultiplier({ bombCount: 0, spring: false }), 1);
  assert.equal(calculateMultiplier({ bombCount: 2, spring: false }), 4);
  assert.equal(calculateMultiplier({ bombCount: 2, spring: true }), 8);
});

test('caps settlement by carry scores using win-loss-is-small principle', () => {
  assert.deepEqual(applyWinLossCap([1500, -600, -900], [1000, 300, 750]), [
    1000,
    -285.71428571,
    -714.28571429,
  ]);

  assert.deepEqual(applyWinLossCap([600, 900, -1500], [300, 750, 1000]), [
    285.71428571,
    714.28571429,
    -1000,
  ]);
});

test('returns deterministic idempotency key with settlement result', () => {
  const first = calculateSettlement({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 1,
    multiplier: 2,
    idempotencyKey: 'round-1:settle',
  });
  const second = calculateSettlement({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 1,
    multiplier: 2,
    idempotencyKey: 'round-1:settle',
  });

  assert.equal(first.idempotencyKey, 'round-1:settle');
  assert.deepEqual(second, first);
});
