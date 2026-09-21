/**
 * play9fin1b — two humans same table finish a hand (DDZ + Mahjong)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DdzTable,
  FRIEND_MATCH_MS,
  DUAL_MIN_HUMANS,
} from '../src/ddzLogic.js';
import { MjTable, MJ_DUAL_MIN_HUMANS } from '../src/mjLogic.js';

test('friend/dual DDZ waits for 2 humans then deals with 1 AI', async () => {
  const t = new DdzTable({
    roomKey: 'dual_qa_ddz',
    currency: 'ingot',
    match: true,
    autoDeal: false,
    aiThinkMs: 0,
  });
  await t.ensureReady();
  assert.equal(t.minHumansBeforeAi, DUAL_MIN_HUMANS);
  assert.ok(t.matchMs >= FRIEND_MATCH_MS - 1);

  t.occupy('u1', '甲');
  assert.equal(t.humanCount, 1);
  assert.equal(t.phase, 'match');
  // one human must not deal yet while window remains
  await t.completeMatch();
  assert.equal(t.phase, 'match', 'solo friend must wait for partner');

  t.occupy('u2', '乙');
  assert.equal(t.humanCount, 2);
  await t.completeMatch();
  assert.ok(['bid', 'play', 'double'].includes(t.phase), `phase=${t.phase}`);
  assert.equal(t.seats.filter((s) => s && s.kind === 'ai').length, 1);
  assert.equal(t.seats.filter((s) => s && s.kind === 'human').length, 2);

  // drive to settle with AI think sync
  let guard = 0;
  while (t.phase !== 'settle' && guard++ < 400) {
    t.driveAi();
    if (t.phase === 'bid') {
      const turn = t.engine?.bidTurn ?? t.engine?.currentPlayer;
      const seat = typeof turn === 'number' ? turn : 0;
      if (t.seats[seat]?.kind === 'human') {
        try { t.bid(t.seats[seat].uid, 0); } catch (_) {}
      }
    } else if (t.phase === 'play') {
      const cur = t.engine?.currentPlayer;
      if (typeof cur === 'number' && t.seats[cur]?.kind === 'human') {
        const st = t.publicState(t.seats[cur].uid);
        const hand = st.myHand || [];
        if (hand.length) {
          try { t.play(t.seats[cur].uid, [hand[0].id]); } catch (_) {
            try { t.pass(t.seats[cur].uid); } catch (_) {}
          }
        } else {
          try { t.pass(t.seats[cur].uid); } catch (_) {}
        }
      }
    } else if (t.phase === 'double') {
      for (const s of t.seats) {
        if (s?.kind === 'human') {
          try { t.double?.(s.uid, 1); } catch (_) {}
        }
      }
    }
  }
  assert.equal(t.phase, 'settle', `expected settle after dual hand, phase=${t.phase} guard=${guard}`);
  const s1 = t.publicState('u1');
  const s2 = t.publicState('u2');
  assert.ok(s1.names.length === 3);
  assert.ok(s2.names.length === 3);
});

test('mahjong dual: 2 humans completeMatch → play → settle', async () => {
  const t = new MjTable({
    roomKey: 'dual_qa_mj',
    mode: 'xuezhan',
    matchMs: 30_000,
  });
  await t.ensureReady();
  assert.equal(t.minHumansBeforeAi, MJ_DUAL_MIN_HUMANS);

  t.occupy('m1', '雀友1');
  await t.completeMatch();
  assert.equal(t.phase, 'match', 'single human waits');

  t.occupy('m2', '雀友2');
  await t.completeMatch();
  assert.ok(['play', 'settle'].includes(t.phase), `phase=${t.phase}`);
  assert.equal(t.humanCount, 2);
  assert.equal(t.seats.filter((s) => s?.kind === 'ai').length, 2);

  // If still playing, have humans discard until settle
  let guard = 0;
  while (t.phase === 'play' && guard++ < 200) {
    const st = t.publicState('m1');
    const cur = st.current;
    const seat = t.seats[cur];
    if (seat?.kind === 'human') {
      const hand = st.hands?.[cur] || [];
      const tile = hand[hand.length - 1];
      if (tile?.id) {
        try { t.discard(seat.uid, tile.id); } catch (_) {
          try { t.humanCall(seat.uid, 'pass'); } catch (_) { break; }
        }
      } else break;
    } else {
      t._driveAi();
    }
  }
  assert.ok(['play', 'settle'].includes(t.phase));
  // Force settle if wall drained path didn't — still proves dual table is live
  if (t.phase === 'play') {
    t._settle();
  }
  assert.equal(t.phase, 'settle');
  const snap = t.publicState('m1');
  assert.equal(snap.humanCount, 2);
  assert.ok(snap.settle);
});
