import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionToken } from '@tea-parlor/session-auth';
import { DdzTable, MATCH_MS } from '../src/ddzLogic.js';
import { verifyRoomJoin } from '../src/rooms/DoudizhuRoom.js';

test('1 human join → injected 10s fills 2 AI, deal, 3 names', async () => {
  const t = new DdzTable({
    roomKey: 'novice',
    currency: 'ingot',
    match: true,
    autoDeal: false,
  });
  await t.ensureReady();
  const seat = t.occupy('u1', '茶馆');
  assert.equal(seat, 0);
  assert.equal(t.phase, 'match');
  assert.equal(t.humanCount, 1);
  assert.ok(t.matchEndsAt - Date.now() <= MATCH_MS + 50);
  const before = t.publicState('u1');
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
