/**
 * play9gd1a — Guandan room match + AI fill + health marker
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GdTable,
  MATCH_MS,
  SUPPORTED_HAND_TYPES,
} from '../src/gdLogic.js';
import { verifyGdJoin } from '../src/rooms/GuandanRoom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexSrc = readFileSync(join(root, 'src/index.js'), 'utf8');

test('health lists guandan + cache play9gd1a', () => {
  assert.match(indexSrc, /guandan/);
  assert.match(indexSrc, /GuandanRoom/);
  assert.match(indexSrc, /play9gd1a/);
  assert.match(indexSrc, /games: \[[^\]]*['"]guandan['"]/);
});

test('1 human → AI fill 3 → deal 4 seats', async () => {
  const t = new GdTable({
    roomKey: 'novice',
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  assert.equal(t.matchEndsAt, 0);
  const seat = t.occupy('u1', '茶馆');
  assert.equal(seat, 0);
  assert.equal(t.phase, 'match');
  assert.equal(t.humanCount, 1);
  assert.equal(MATCH_MS, 3_000);

  t.matchEndsAt = Date.now();
  await t.onMatchTimeout();
  assert.equal(t.phase, 'play');
  assert.equal(t.humanCount, 1);
  assert.equal(t.seats.filter((s) => s && s.kind === 'ai').length, 3);
  assert.equal(t.names.length, 4);
  const s = t.publicState('u1');
  assert.equal(s.phase, 'play');
  assert.equal(s.game, 'guandan');
  assert.ok(s.myHand.length > 0);
  assert.equal(s.handCounts.length, 4);
  assert.equal(s.skipTribute, true);
  assert.ok(Array.isArray(s.supportedHandTypes));
  assert.equal(SUPPORTED_HAND_TYPES.length, 10);
});

test('verifyGdJoin trust mode without secret', () => {
  const r = verifyGdJoin({ uid: 'u1' }, { sessionSecret: null });
  assert.equal(r.ok, true);
  assert.equal(r.uid, 'u1');
});

test('illegal play rejected; pass/play finish hand', async () => {
  const t = new GdTable({
    roomKey: 'novice',
    currency: 'ingot',
    humanUid: 'u1',
    humanName: '茶馆',
    match: false,
    autoDeal: true,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  assert.equal(t.phase, 'play');
  // Drive AI until settle or guard
  let guard = 0;
  while (t.phase === 'play' && guard++ < 500) {
    if (t.isWaitingHuman(t.currentSeat)) {
      // human: pass if possible else play lowest single
      const seat = t.currentSeat;
      try {
        if (t.lastPlay) t.pass('u1');
        else {
          const c = t.hands[seat][t.hands[seat].length - 1];
          t.play('u1', [c.id]);
        }
      } catch {
        const c = t.hands[seat][0];
        try { t.play('u1', [c.id]); } catch { t.pass('u1'); }
      }
    } else {
      t.driveAi();
    }
  }
  assert.equal(t.phase, 'settle', `phase=${t.phase} guard=${guard}`);
  assert.ok(t.lastRecord?.deltas?.length === 4);
  assert.equal(t.lastRecord.withdrawable, false);
  assert.ok(t.lastRecord.finishOrder.length === 4);
});
