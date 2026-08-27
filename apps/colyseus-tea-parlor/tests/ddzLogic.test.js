import test from 'node:test';
import assert from 'node:assert/strict';
import { DdzTable } from '../src/ddzLogic.js';

test('colyseus ddz table starts and exposes public state', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
    currency: 'ingot',
  });
  await t.ensureReady();
  const s = t.publicState('u1');
  assert.equal(s.backend, 'colyseus');
  assert.ok(['bid', 'play', 'settle'].includes(s.phase));
  assert.equal(s.myHand.length > 0, true);
  assert.equal(s.names[0], '茶馆');
});

test('colyseus ddz bid then play path', async () => {
  const t = new DdzTable({
    humanUid: 'u1',
    humanName: '茶馆',
    roomKey: 'novice',
    currency: 'ingot',
  });
  await t.ensureReady();

  // 叫分直到进入出牌或结束
  let guard = 0;
  while (t.engine.phase === 'bid' && guard++ < 12) {
    if (t.engine.bidTurn === t.humanIndex) {
      t.bid('u1', 3);
    } else {
      t.driveAi();
    }
  }
  assert.ok(t.engine.phase === 'play' || t.engine.phase === 'settle' || t.engine.phase === 'bid');

  if (t.engine.phase === 'play' && t.engine.currentPlayer === t.humanIndex) {
    const cards = t.hint('u1');
    if (cards?.length) {
      t.play('u1', cards.map((c) => c.id));
      const s = t.publicState('u1');
      assert.ok(s.handsCount[0] < 20);
    }
  }
});
