import test from 'node:test';
import assert from 'node:assert/strict';
import { createTexasTable, Phase } from '../src/texas/engine.js';
import { createCard } from '../src/texas/cards.js';

test('short all-in with best hand only wins the main pot', () => {
  const t = createTexasTable({
    names: ['A', 'B', 'C'],
    buyIn: 1000,
    smallBlind: 10,
    bigBlind: 20,
    button: 0,
  });
  t.startHand();
  const st = t.state;
  st.stacks[0] = 30;
  st.holes = [
    [createCard(14, 0), createCard(14, 1)],
    [createCard(2, 2), createCard(7, 3)],
    [createCard(3, 2), createCard(8, 3)],
  ];
  // pop() 从末尾发牌：flop 3 + turn + river
  st.deck = [
    createCard(12, 0),
    createCard(10, 1),
    createCard(9, 2),
    createCard(6, 3),
    createCard(5, 0),
    createCard(4, 1),
  ];

  assert.equal(t.applyAction(0, { type: 'allin' }).ok, true);
  assert.equal(t.applyAction(1, { type: 'call' }).ok, true);
  assert.equal(t.applyAction(2, { type: 'raise', amount: 200 }).ok, true);
  assert.equal(t.applyAction(1, { type: 'call' }).ok, true);

  let guard = 0;
  while (st.phase !== Phase.SETTLE && guard++ < 20) {
    const seat = st.current;
    if (st.phase === Phase.SETTLE || st.phase === Phase.SHOWDOWN) break;
    if (st.folded[seat] || st.allIn[seat]) break;
    const r = t.applyAction(seat, { type: 'check' });
    if (!r.ok) {
      const call = t.applyAction(seat, { type: 'call' });
      assert.equal(call.ok, true, call.reason);
    }
  }

  assert.equal(st.phase, Phase.SETTLE);
  // 主池 30×3=90 归短筹 AA；边池 170×2=340 归 8 高的长筹
  assert.equal(st.stacks[0], 90);
  assert.ok(st.stacks[2] > st.stacks[1]);
  assert.equal(st.stacks[0] + st.stacks[1] + st.stacks[2], 2030);
});
