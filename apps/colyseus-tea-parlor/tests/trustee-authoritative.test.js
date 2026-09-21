/**
 * play9fin3a — server-authoritative full trustee (DDZ + Mahjong)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DdzTable } from '../src/ddzLogic.js';
import { MjTable } from '../src/mjLogic.js';

test('DDZ setFullTrustee drives AI and survives reconnect', async () => {
  const t = new DdzTable({
    roomKey: 'novice',
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.occupy('u1', '甲');
  // force deal with AI fill (solo novice)
  t.matchEndsAt = Date.now() - 1;
  await t.completeMatch();
  assert.ok(['bid', 'play', 'double', 'settle'].includes(t.phase), `phase=${t.phase}`);

  const seat = t.seatOf('u1');
  assert.ok(seat >= 0);
  assert.equal(t.seats[seat].fullTrustee, false);

  const ok = t.setFullTrustee('u1', true);
  assert.equal(ok, true);
  assert.equal(t.seats[seat].fullTrustee, true);
  assert.equal(t.seats[seat].trustee, true);
  assert.equal(t.seats[seat].connected, true);

  const pub = t.publicState('u1');
  assert.equal(pub.myFullTrustee, true);
  assert.equal(pub.myTrustee, true);
  assert.equal(pub.isHumanTurn, false, 'full trustee seat is not waiting human');

  // Soft disconnect then reconnect must keep fullTrustee
  t.disconnect('u1');
  assert.equal(t.seats[seat].connected, false);
  t.reconnect('u1', '甲');
  assert.equal(t.seats[seat].connected, true);
  assert.equal(t.seats[seat].fullTrustee, true);
  assert.equal(t.seats[seat].trustee, true);

  // Cancel
  t.setFullTrustee('u1', false);
  assert.equal(t.seats[seat].fullTrustee, false);
  assert.equal(t.seats[seat].trustee, false);
});

test('DDZ soft applyTrustee clears on reconnect (not fullTrustee)', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
    currency: 'ingot',
    aiThinkMs: 0,
  });
  await t.ensureReady();
  const seat = t.seatOf('u1');
  t.applyTrustee('u1');
  assert.equal(t.seats[seat].trustee, true);
  assert.equal(!!t.seats[seat].fullTrustee, false);
  t.reconnect('u1');
  assert.equal(t.seats[seat].trustee, false, 'soft trustee cleared');
  assert.equal(t.seats[seat].connected, true);
});

test('DDZ fullTrustee auto-plays through human turns toward settle', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
    currency: 'ingot',
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.setFullTrustee('u1', true);
  let guard = 0;
  while (t.phase !== 'settle' && guard++ < 400) {
    t.driveAi();
  }
  assert.equal(t.phase, 'settle', `expected settle under fullTrustee, phase=${t.phase} guard=${guard}`);
});

test('Mahjong setFullTrustee lets server _driveAi discard for human', async () => {
  const t = new MjTable({ roomKey: 'tuidaohu', mode: 'xuezhan', matchMs: 1 });
  await t.ensureReady();
  t.occupy('m1', '雀友1');
  t.occupy('m2', '雀友2');
  t.matchEndsAt = Date.now() - 1;
  await t.completeMatch();
  if (t.phase === 'settle') {
    assert.ok(true, 'already settled');
    return;
  }
  assert.equal(t.phase, 'play');
  assert.equal(t.setFullTrustee('m1', true), true);
  assert.equal(t.setFullTrustee('m2', true), true); // both humans trustee so AI loop can finish
  const seat = t.seatOf('m1');
  assert.equal(t.seats[seat].fullTrustee, true);
  assert.equal(t.publicState('m1').myFullTrustee, true);

  // Reconnect preserves
  t.disconnect('m1');
  t.reconnect('m1');
  assert.equal(t.seats[seat].fullTrustee, true);
  assert.equal(t.seats[seat].trustee, true);

  let guard = 0;
  while (t.phase === 'play' && guard++ < 200) {
    t._driveAi();
  }
  assert.ok(
    t.phase === 'settle' || guard > 0,
    `trustee drive ran; phase=${t.phase} guard=${guard}`,
  );
  // With both humans in fullTrustee, server should reach settle
  assert.equal(t.phase, 'settle', `expected settle under dual fullTrustee, phase=${t.phase}`);
});
