import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionToken } from '@tea-parlor/session-auth';
import {
  DdzTable,
  MATCH_MS,
  EMPTY_ROOM_MS,
  FRESH_JOIN_MIN_REMAIN_MS,
} from '../src/ddzLogic.js';
import { verifyRoomJoin } from '../src/rooms/DoudizhuRoom.js';

test('1 human join → injected 10s fills 2 AI, deal, 3 names', async () => {
  const t = new DdzTable({
    roomKey: 'novice',
    currency: 'ingot',
    match: true,
    autoDeal: false,
  });
  await t.ensureReady();
  assert.equal(t.matchEndsAt, 0, 'empty create must not start match clock');
  const seat = t.occupy('u1', '茶馆');
  assert.equal(seat, 0);
  assert.equal(t.phase, 'match');
  assert.equal(t.humanCount, 1);
  assert.equal(MATCH_MS, 10_000);
  const remain = t.matchEndsAt - Date.now();
  assert.ok(remain <= MATCH_MS + 50, `remain=${remain}`);
  assert.ok(remain >= MATCH_MS - 200, `remain=${remain} (expected ~10s)`);
  const before = t.publicState('u1');
  assert.ok(before.matchEndsAt - Date.now() >= MATCH_MS - 200);
  assert.equal(before.phase, 'match');
  assert.equal(before.status, '匹配中，超时 AI 补位');
  assert.equal(before.humanCount, 1);
  assert.equal(before.myHand.length, 0);

  await t.onMatchTimeout();
  assert.ok(['bid', 'play'].includes(t.phase));
  assert.equal(t.humanCount, 1);
  assert.equal(t.seats.filter((s) => s && s.kind === 'ai').length, 2);
  assert.equal(t.names.length, 3);
  assert.ok(t.names.every((n) => n && n !== '空位' && n !== '匹配中'));
  const s = t.publicState('u1');
  assert.ok(['bid', 'play'].includes(s.phase));
  assert.equal(s.names.length, 3);
  assert.ok(s.myHand.length > 0);
  assert.equal(s.humanCount, 1);
});

test('3 humans join before timeout → 0 AI, deal immediately', async () => {
  const t = new DdzTable({
    roomKey: 'novice',
    match: true,
    autoDeal: false,
  });
  await t.ensureReady();
  t.occupy('u1', '甲');
  t.occupy('u2', '乙');
  t.occupy('u3', '丙');
  assert.equal(t.humanCount, 3);
  assert.equal(t.phase, 'match');
  await t.completeMatch();
  assert.ok(['bid', 'play'].includes(t.phase));
  assert.equal(t.humanCount, 3);
  assert.equal(t.seats.filter((s) => s && s.kind === 'ai').length, 0);
  assert.deepEqual(t.names, ['甲', '乙', '丙']);
  const s1 = t.publicState('u1');
  const s2 = t.publicState('u2');
  assert.ok(s1.myHand.length > 0);
  assert.ok(s2.myHand.length > 0);
  assert.notEqual(s1.myHand.map((c) => c.id).join(), s2.myHand.map((c) => c.id).join());
});

test('verifyRoomJoin still rejects bad token when secret set', () => {
  const SECRET = 'colyseus-test-secret';
  const missing = verifyRoomJoin({ uid: '42' }, { sessionSecret: SECRET });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'auth_failed');

  const NOW = Math.floor(Date.now() / 1000);
  const forged = createSessionToken(
    { user: { id: 42 }, authDate: NOW },
    { sessionSecret: 'attacker-secret', issuedAt: NOW },
  );
  const bad = verifyRoomJoin({ uid: '42', token: forged }, { sessionSecret: SECRET });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'auth_failed');
});

test('mid-quit after deal: quitter score = -stake, others non-negative, no rake', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
  });
  await t.ensureReady();
  assert.ok(t.phase !== 'match');
  const scores = t.forfeit('u1');
  assert.ok(scores);
  assert.equal(scores[0], -t.stake);
  assert.ok(scores[1] >= 0);
  assert.ok(scores[2] >= 0);
  assert.equal(scores[0] + scores[1] + scores[2], 0);
  const s = t.publicState('u1');
  assert.equal(s.phase, 'settle');
  assert.equal(s.scores[0], -t.stake);
  assert.ok(s.scores[1] >= 0);
  assert.ok(s.scores[2] >= 0);
  assert.equal(s.rake, undefined);
  assert.equal('rake' in s, false);
  assert.equal(s.humanScore, -t.stake);
});

test('trustee: disconnected human seat is played by AI (injected flag)', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
  });
  await t.ensureReady();
  t.disconnect('u1');
  assert.equal(t.seats[0].connected, false);
  assert.equal(t.seats[0].trustee, false);
  t.applyTrustee('u1');
  assert.equal(t.seats[0].trustee, true);
  assert.equal(t.isWaitingHuman(0), false);
  const beforePhase = t.engine.phase;
  const beforeBid = t.engine.bidTurn;
  const beforePlayer = t.engine.currentPlayer;
  t.driveAi();
  if (beforePhase === 'bid' && beforeBid === 0) {
    assert.ok(t.engine.phase !== 'bid' || t.engine.bidTurn !== 0 || t.engine.phase === 'settle');
  }
  if (beforePhase === 'play' && beforePlayer === 0) {
    assert.ok(
      t.engine.phase === 'settle'
      || t.engine.currentPlayer !== 0
      || (t.engine.hands[0].length < 17),
    );
  }
  assert.equal(t.seats[0].trustee, true);
});

test('MATCH_MS is 10000 ms (Colyseus clock uses ms)', () => {
  assert.equal(MATCH_MS, 10_000);
  assert.equal(EMPTY_ROOM_MS, 45_000);
  assert.equal(FRESH_JOIN_MIN_REMAIN_MS, 9_000);
  assert.ok(EMPTY_ROOM_MS > MATCH_MS, 'empty dispose must outlive match window');
  assert.ok(FRESH_JOIN_MIN_REMAIN_MS < MATCH_MS);
  assert.equal(MATCH_MS - FRESH_JOIN_MIN_REMAIN_MS, 1_000);
});

test('empty create: matchEndsAt is 0 until first human', async () => {
  let now = 1_700_000_000_000;
  const t = new DdzTable({
    roomKey: 'novice',
    match: true,
    autoDeal: false,
    now: () => now,
    matchMs: MATCH_MS,
  });
  await t.ensureReady();
  assert.equal(t.phase, 'match');
  assert.equal(t.matchEndsAt, 0);
  assert.equal(t.humanCount, 0);
  assert.equal(t.canAcceptNewHuman(), true);
  assert.equal(t.remainingMatchMs(), 0);
  const snap = t.publicState('ghost');
  assert.equal(snap.matchEndsAt, 0);
  assert.equal(snap.phase, 'match');
});

test('empty waits 8s then first join → endsAt full 10s', async () => {
  let now = 1_700_000_000_000;
  const t = new DdzTable({
    roomKey: 'novice',
    currency: 'ingot',
    match: true,
    autoDeal: false,
    now: () => now,
    matchMs: MATCH_MS,
  });
  await t.ensureReady();
  assert.equal(t.matchEndsAt, 0);
  // Stale empty room sits 8s (empty dispose is 45s — match clock never started)
  now += 8_000;
  assert.equal(t.matchEndsAt, 0);
  assert.equal(t.canAcceptNewHuman(), true);
  const seat = t.occupy('u_new', '新茶客');
  assert.equal(seat, 0);
  assert.equal(t.humanCount, 1);
  assert.equal(t.matchEndsAt, now + MATCH_MS, 'first human must start full 10s window');
  const snap = t.publicState('u_new');
  assert.equal(snap.phase, 'match');
  assert.equal(snap.matchEndsAt - now, MATCH_MS);
  assert.equal(t.phase, 'match');
  assert.equal(snap.myHand.length, 0);
  now += MATCH_MS;
  await t.onMatchTimeout();
  assert.ok(['bid', 'play'].includes(t.phase));
  assert.equal(t.seats.filter((s) => s && s.kind === 'ai').length, 2);
});

test('stale multi-human room rejects new humans when remain < 9000', async () => {
  let now = 1_700_000_000_000;
  const t = new DdzTable({
    roomKey: 'novice',
    match: true,
    autoDeal: false,
    now: () => now,
    matchMs: MATCH_MS,
  });
  await t.ensureReady();
  t.occupy('u1', '甲');
  assert.equal(t.matchEndsAt, now + MATCH_MS);
  assert.equal(t.canAcceptNewHuman(), true); // remain 10s ≥ 9s
  // Second human within the fresh second is OK
  now += 500;
  assert.ok(t.remainingMatchMs() >= FRESH_JOIN_MIN_REMAIN_MS);
  assert.equal(t.canAcceptNewHuman(), true);
  t.occupy('u2', '乙');
  assert.equal(t.humanCount, 2);
  // After >1s, remain < 9000 → new humans must be refused / room locked
  now += 600; // total +1100 from first human → remain 8900
  assert.ok(t.remainingMatchMs() < FRESH_JOIN_MIN_REMAIN_MS);
  assert.equal(t.canAcceptNewHuman(), false);
  // Nearly expired (~1s left) must also refuse
  now = t.matchEndsAt - 1_000;
  assert.equal(t.canAcceptNewHuman(), false);
});

test('deal only after timeout or 3 humans (not on first join)', async () => {
  const t = new DdzTable({
    roomKey: 'novice',
    match: true,
    autoDeal: false,
  });
  await t.ensureReady();
  t.occupy('u1', '甲');
  assert.equal(t.phase, 'match');
  assert.equal(t.humanCount, 1);
  t.occupy('u2', '乙');
  assert.equal(t.phase, 'match');
  assert.equal(t.humanCount, 2);
  assert.ok(t.matchEndsAt - Date.now() > 0);
  await t.completeMatch();
  assert.ok(['bid', 'play'].includes(t.phase));
});

test('clearMatchWindow restores empty-room clock semantics', async () => {
  let now = 1_700_000_000_000;
  const t = new DdzTable({
    roomKey: 'novice',
    match: true,
    autoDeal: false,
    now: () => now,
  });
  await t.ensureReady();
  t.occupy('u1', '甲');
  assert.ok(t.matchEndsAt > 0);
  t.disconnect('u1');
  assert.equal(t.humanCount, 0);
  t.clearMatchWindow();
  assert.equal(t.matchEndsAt, 0);
  assert.equal(t.canAcceptNewHuman(), true);
  now += 20_000;
  t.occupy('u2', '乙');
  assert.equal(t.matchEndsAt, now + MATCH_MS);
});
