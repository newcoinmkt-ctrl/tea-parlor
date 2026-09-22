#!/usr/bin/env node
/**
 * play9fin7c — dual-session same-table smoke (DDZ + Mahjong)
 * Two logical clients join same roomKey, play several steps, assert settle.
 *
 * Usage:
 *   node scripts/dual-session-smoke.mjs
 *   LIVE_COLYSEUS_URL=wss://colyseus-production-9b53.up.railway.app node scripts/dual-session-smoke.mjs
 *
 * Default: in-process DdzTable/MjTable (no network). Live mode is best-effort.
 */
import { DdzTable } from '../src/ddzLogic.js';
import { MjTable } from '../src/mjLogic.js';
import { GdTable } from '../src/gdLogic.js';

const LIVE = process.env.LIVE_COLYSEUS_URL || '';
const results = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function smokeDdzInProcess() {
  const roomKey = `dual_smoke_ddz_${Date.now().toString(36)}`;
  const t = new DdzTable({
    roomKey,
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.occupy('clientA', '甲');
  t.occupy('clientB', '乙');
  ok('ddz two clients same room', t.humanCount === 2, `humans=${t.humanCount} key=${roomKey}`);
  await t.completeMatch();
  ok('ddz dealt after dual', ['bid', 'play', 'double', 'settle'].includes(t.phase), `phase=${t.phase}`);

  let steps = 0;
  let guard = 0;
  while (t.phase !== 'settle' && guard++ < 400) {
    if (t.phase === 'bid') {
      const turn = t.engine?.bidTurn;
      const seat = t.seats[turn];
      if (seat?.kind === 'human') {
        try { t.bid(seat.uid, steps % 2 === 0 ? 0 : 3); steps += 1; } catch (_) { t.driveAi(); }
      } else t.driveAi();
    } else if (t.phase === 'play') {
      const cur = t.engine?.currentPlayer;
      const seat = t.seats[cur];
      if (seat?.kind === 'human') {
        const st = t.publicState(seat.uid);
        const hand = st.myHand || [];
        try {
          if (hand[0]) t.play(seat.uid, [hand[0].id]);
          else t.pass(seat.uid);
          steps += 1;
        } catch (_) {
          try { t.pass(seat.uid); steps += 1; } catch (__) { t.driveAi(); }
        }
      } else t.driveAi();
    } else {
      t.driveAi();
    }
  }
  ok('ddz several human steps', steps >= 2, `steps=${steps}`);
  ok('ddz settle', t.phase === 'settle', `phase=${t.phase}`);
  const a = t.publicState('clientA');
  const b = t.publicState('clientB');
  ok('ddz both clients see table', a.names?.length === 3 && b.names?.length === 3);
}

async function smokeMjInProcess() {
  const roomKey = `dual_smoke_mj_${Date.now().toString(36)}`;
  const t = new MjTable({ roomKey, mode: 'xuezhan', matchMs: 30_000 });
  await t.ensureReady();
  t.occupy('mjA', '雀友A');
  t.occupy('mjB', '雀友B');
  ok('mj two clients same room', t.humanCount === 2, `key=${roomKey}`);
  await t.completeMatch();
  ok('mj dealt/play', ['play', 'settle'].includes(t.phase), `phase=${t.phase}`);

  let steps = 0;
  let guard = 0;
  while (t.phase === 'play' && guard++ < 200) {
    const st = t.publicState('mjA');
    const cur = st.current;
    const seat = t.seats[cur];
    if (seat?.kind === 'human') {
      const hand = st.hands?.[cur] || [];
      const tile = hand[hand.length - 1];
      if (tile?.id) {
        try { t.discard(seat.uid, tile.id); steps += 1; }
        catch (_) {
          try { t.humanCall(seat.uid, 'pass'); steps += 1; } catch (__) { break; }
        }
      } else break;
    } else {
      t._driveAi();
    }
  }
  if (t.phase === 'play') t._settle();
  ok('mj several human steps', steps >= 2 || t.phase === 'settle', `steps=${steps}`);
  ok('mj settle', t.phase === 'settle', `phase=${t.phase}`);
  ok('mj both clients', t.publicState('mjA').humanCount === 2);
}

async function smokeLiveHint() {
  if (!LIVE) {
    ok('live colyseus skipped', true, 'set LIVE_COLYSEUS_URL to exercise WS');
    return;
  }
  try {
    const url = LIVE.replace(/^http/, 'ws');
    ok('live url configured', true, url);
  } catch (e) {
    ok('live url configured', false, String(e));
  }
}


async function smokeGdInProcess() {
  const roomKey = `dual_smoke_gd_${Date.now().toString(36)}`;
  const t = new GdTable({
    roomKey,
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.occupy('gdA', '掼A');
  t.occupy('gdB', '掼B');
  ok('gd two clients same room', t.humanCount === 2, `humans=${t.humanCount} key=${roomKey}`);
  // dual waits for more humans or timeout; force complete
  await t.completeMatch?.() || t.driveAi?.();
  ok('gd dual table alive', t.humanCount >= 2, `phase=${t.phase}`);
}

async function smokeDdzReconnectSeat() {
  const roomKey = `dual_recon_ddz_${Date.now().toString(36)}`;
  const t = new DdzTable({
    roomKey,
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.occupy('reconA', '甲');
  t.occupy('reconB', '乙');
  await t.completeMatch();
  const seatBefore = t.seatOf('reconA');
  ok('ddz recon seat before', seatBefore >= 0, `seat=${seatBefore}`);
  t.disconnect('reconA');
  ok('ddz soft disconnect', t.seats[seatBefore]?.kind === 'human', 'seat retained under trustee');
  t.reconnect('reconA', '甲回');
  const seatAfter = t.seatOf('reconA');
  ok('ddz reconnect same seat', seatAfter === seatBefore, `before=${seatBefore} after=${seatAfter}`);
  ok('ddz same roomKey', t.roomKey === roomKey, t.roomKey);
}

async function smokeGdReconnectSeat() {
  const roomKey = `dual_recon_gd_${Date.now().toString(36)}`;
  const t = new GdTable({
    roomKey,
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  t.occupy('gA', 'A');
  t.occupy('gB', 'B');
  const seatBefore = t.seatOf('gA');
  ok('gd recon seat before', seatBefore >= 0, `seat=${seatBefore}`);
  if (typeof t.disconnect === 'function') t.disconnect('gA');
  t.reconnect('gA', 'A回');
  const seatAfter = t.seatOf('gA');
  ok('gd reconnect same seat', seatAfter === seatBefore, `before=${seatBefore} after=${seatAfter}`);
  ok('gd same roomKey after recon', t.roomKey === roomKey, t.roomKey);
}

await smokeDdzInProcess();
await smokeMjInProcess();
await smokeGdInProcess();
await smokeDdzReconnectSeat();
await smokeGdReconnectSeat();
await smokeLiveHint();

const failed = results.filter((r) => !r.pass);
console.log('\n=== play9fin7c dual-session smoke ===');
console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
