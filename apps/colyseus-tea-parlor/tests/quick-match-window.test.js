import test from 'node:test';
import assert from 'node:assert/strict';
import { earlyDealHumans } from '../src/matchGate.js';
import { DdzTable } from '../src/ddzLogic.js';

test('public rooms wait for full table or timeout; friend/dual deal at need', () => {
  assert.equal(earlyDealHumans(1, 3), 3);
  assert.equal(earlyDealHumans(undefined, 4), 4);
  assert.equal(earlyDealHumans(2, 3), 2);
  assert.equal(earlyDealHumans(2, 4), 2);
});

test('quick-match: one human keeps phase=match until window ends (client expects match first)', async () => {
  let now = 1_700_000_000_000;
  const t = new DdzTable({ roomKey: 'novice', match: true, autoDeal: false, now: () => now });
  await t.ensureReady();
  t.occupy('u1', '甲');
  await t.completeMatch();
  assert.equal(t.phase, 'match');
  now = t.matchEndsAt;
  await t.completeMatch();
  assert.ok(['bid', 'play'].includes(t.phase));
});
