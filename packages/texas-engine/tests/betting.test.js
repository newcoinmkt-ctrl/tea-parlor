/**
 * TexasBettingEngine · 多街下注 + 边池
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TexasBettingEngine,
  Street,
  PlayerStatus,
  ActionType,
  calculatePots,
  distributePots,
  settleTexasPots,
  orderBySbProximity,
} from '../src/index.js';

// ═══════════════════════════════════════════
// calculatePots
// ═══════════════════════════════════════════

test('calculatePots: 等额 → 仅主池', () => {
  const pots = calculatePots([
    { id: 'a', betTotal: 100, seat: 0 },
    { id: 'b', betTotal: 100, seat: 1 },
    { id: 'c', betTotal: 100, folded: true, seat: 2 },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].isMain, true);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligibleIds.map(String).sort(), ['a', 'b']);
  assert.ok(pots[0].contributorIds.map(String).includes('c'));
});

test('calculatePots: 多层 All-in 拆边池', () => {
  // A50 all-in, B100 all-in, C200
  const pots = calculatePots([
    { id: 'a', betTotal: 50, allIn: true, seat: 0 },
    { id: 'b', betTotal: 100, allIn: true, seat: 1 },
    { id: 'c', betTotal: 200, seat: 2 },
  ]);
  assert.equal(pots.length, 3);
  assert.equal(pots[0].amount, 150); // 50*3
  assert.equal(pots[0].name, 'main');
  assert.deepEqual(pots[0].eligibleIds.map(String).sort(), ['a', 'b', 'c']);
  assert.equal(pots[1].amount, 100); // 50*2
  assert.deepEqual(pots[1].eligibleIds.map(String).sort(), ['b', 'c']);
  assert.ok(!pots[1].eligibleIds.map(String).includes('a'));
  assert.equal(pots[2].amount, 100); // 100*1
  assert.deepEqual(pots[2].eligibleIds.map(String), ['c']);
  assert.equal(pots.reduce((s, p) => s + p.amount, 0), 350);
});

test('calculatePots: 弃牌者筹码进池但无资格', () => {
  const pots = calculatePots([
    { id: 'a', betTotal: 40, folded: true, seat: 0 },
    { id: 'b', betTotal: 80, seat: 1 },
  ]);
  assert.equal(pots[0].amount, 80); // 40*2
  assert.deepEqual(pots[0].eligibleIds.map(String), ['b']);
  assert.equal(pots[1].amount, 40);
  assert.deepEqual(pots[1].eligibleIds.map(String), ['b']);
});

// ═══════════════════════════════════════════
// distributePots
// ═══════════════════════════════════════════

test('distributePots: 主池给最优，边池给次优 eligible', () => {
  const pots = calculatePots([
    { id: 'a', betTotal: 50, seat: 0 },
    { id: 'b', betTotal: 100, seat: 1 },
    { id: 'c', betTotal: 100, seat: 2 },
  ]);
  // a rank 1 最好但只进主池；b rank 2；c rank 3
  const r = distributePots(pots, [
    { id: 'a', rank: 1, seat: 0 },
    { id: 'b', rank: 2, seat: 1 },
    { id: 'c', rank: 3, seat: 2 },
  ], { sbSeat: 0, playerCount: 3 });

  assert.equal(r.awards.a, 150); // main 50*3
  assert.equal(r.awards.b, 100); // side 50*2
  assert.equal(r.awards.c, 0);
  assert.equal(r.totalDistributed, 250);
});

test('distributePots: 平局均分 + 奇数筹码靠 SB', () => {
  // 主池 100，两人平局，SB seat=0
  const pots = [{
    index: 0,
    isMain: true,
    name: 'main',
    amount: 100,
    level: 50,
    layer: 50,
    contributorIds: ['a', 'b'],
    eligibleIds: ['a', 'b'],
  }];
  // a seat 1, b seat 0 (SB) — 奇数筹码应先给靠近 SB 的 b
  // 100/2=50 整除
  let r = distributePots(pots, [
    { id: 'a', rank: 1, seat: 1 },
    { id: 'b', rank: 1, seat: 0 },
  ], { sbSeat: 0, playerCount: 2 });
  assert.equal(r.awards.a, 50);
  assert.equal(r.awards.b, 50);

  // 101：各 50，余 1 给 SB 近者 b (seat 0)
  pots[0].amount = 101;
  r = distributePots(pots, [
    { id: 'a', rank: 1, seat: 1 },
    { id: 'b', rank: 1, seat: 0 },
  ], { sbSeat: 0, playerCount: 2 });
  assert.equal(r.awards.a + r.awards.b, 101);
  assert.equal(r.awards.b, 51);
  assert.equal(r.awards.a, 50);
});

test('orderBySbProximity', () => {
  const seats = new Map([['a', 2], ['b', 0], ['c', 1]]);
  // SB=0 → 顺序 b(0), c(1), a(2)
  assert.deepEqual(
    orderBySbProximity(['a', 'b', 'c'], seats, 0, 3),
    ['b', 'c', 'a']
  );
});

test('distributePots: 三人平分 100，余数按 SB 序', () => {
  const pots = [{
    index: 0,
    isMain: true,
    name: 'main',
    amount: 100,
    eligibleIds: ['x', 'y', 'z'],
    contributorIds: ['x', 'y', 'z'],
  }];
  // seats: x=0(SB), y=1, z=2 → 各 33，余 1 给 x
  const r = distributePots(pots, [
    { id: 'x', rank: 1, seat: 0 },
    { id: 'y', rank: 1, seat: 1 },
    { id: 'z', rank: 1, seat: 2 },
  ], { sbSeat: 0, playerCount: 3 });
  assert.equal(r.awards.x + r.awards.y + r.awards.z, 100);
  assert.equal(r.awards.x, 34);
  assert.equal(r.awards.y, 33);
  assert.equal(r.awards.z, 33);
});

test('settleTexasPots 一步到位', () => {
  const r = settleTexasPots(
    [
      { id: 'a', betTotal: 30, seat: 0 },
      { id: 'b', betTotal: 30, seat: 1 },
    ],
    [
      { id: 'a', rank: 2, seat: 0 },
      { id: 'b', rank: 1, seat: 1 },
    ],
    { sbSeat: 0 }
  );
  assert.equal(r.awards.b, 60);
  assert.equal(r.awards.a || 0, 0);
});

// ═══════════════════════════════════════════
// TexasBettingEngine 街道与动作
// ═══════════════════════════════════════════

test('startHand: 下 SB/BB，进入 preflop', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c'],
    chips: [1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  const r = g.startHand();
  assert.equal(r.ok, true);
  assert.equal(g.street, Street.PREFLOP);
  assert.equal(g.sbSeat, 1);
  assert.equal(g.bbSeat, 2);
  assert.equal(g.playerBySeat(1).betTotal, 5);
  assert.equal(g.playerBySeat(2).betTotal, 10);
  assert.equal(g.currentBet, 10);
  // UTG = seat 0 (button left of... BB is 2, next is 0)
  assert.equal(g.currentSeat, 0);
});

test('HU: button 为 SB 且先动', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b'],
    chips: [500, 500],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  assert.equal(g.sbSeat, 0);
  assert.equal(g.bbSeat, 1);
  assert.equal(g.currentSeat, 0);
});

test('preflop: fold/call/raise 流程进入 flop', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c'],
    chips: [1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  // UTG a call
  assert.equal(g.act('a', 'call').ok, true);
  // SB b call 5 more
  assert.equal(g.act('b', 'call').ok, true);
  // BB c check
  const r = g.act('c', 'check');
  assert.equal(r.ok, true);
  assert.equal(r.streetAdvanced, true);
  assert.equal(g.street, Street.FLOP);
  assert.equal(g.currentBet, 0);
});

test('raise / re-raise 提高 currentBet', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c'],
    chips: [1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  // a raise to 30
  let r = g.raise('a', 30);
  assert.equal(r.ok, true);
  assert.equal(g.currentBet, 30);
  // b re-raise to 90
  r = g.raise('b', 90);
  assert.equal(r.ok, true);
  assert.equal(g.currentBet, 90);
  // c fold
  assert.equal(g.fold('c').ok, true);
  // a call
  r = g.call('a');
  assert.equal(r.ok, true);
});

test('check 有 toCall 时拒绝', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b'],
    chips: [500, 500],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  const r = g.check('a');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cannot_check');
});

test('fold 至只剩一人 → 结算', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c'],
    chips: [1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  g.fold('a');
  g.fold('b');
  assert.equal(g.street, Street.FINISHED);
  // c 赢得盲注 15
  assert.equal(g.playerById('c').chips, 1000 - 10 + 15);
});

test('straddle: BB 左手 2×BB', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c', 'd'],
    chips: [1000, 1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    allowStraddle: true,
  });
  g.startHand();
  // seats: btn0, sb1, bb2, straddle3
  assert.equal(g.defaultStraddleSeat, 3);
  const r = g.straddle('d');
  assert.equal(r.ok, true);
  assert.equal(g.currentBet, 20);
  assert.equal(g.playerById('d').betStreet, 20);
});

test('all-in 短码后可进入 showdown 边池', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b', 'c'],
    chips: [40, 200, 200],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 2,
  });
  // btn2, sb0, bb1
  g.startHand();
  assert.equal(g.sbSeat, 0);
  // UTG = next of bb1 = seat 2 (button)
  // 让短筹 a 尽快 all-in：先处理当前行动者直到 a
  let guard = 0;
  while (g.street === Street.PREFLOP && guard++ < 20) {
    const id = g.playerBySeat(g.currentSeat).id;
    if (id === 'a') {
      g.allIn('a');
    } else if (g.toCallAmount(g.playerById(id)) === 0) {
      g.check(id);
    } else {
      g.call(id);
    }
    if (g.street !== Street.PREFLOP && g.street !== Street.SHOWDOWN && g.street !== Street.FINISHED) {
      // postflop: all check or all-in already
      break;
    }
    if (g.street === Street.SHOWDOWN || g.street === Street.FINISHED) break;
  }
  // 推进到摊牌
  guard = 0;
  while (
    g.street !== Street.SHOWDOWN
    && g.street !== Street.FINISHED
    && guard++ < 40
  ) {
    const p = g.playerBySeat(g.currentSeat);
    if (!p || p.status !== PlayerStatus.ACTIVE) break;
    const id = p.id;
    if (g.toCallAmount(p) === 0) g.check(id);
    else g.call(id);
  }

  const pots = g.calculatePots();
  assert.ok(pots.length >= 1);
  assert.equal(pots.reduce((s, x) => s + x.amount, 0), g.getSnapshot().pot);

  // 分配：a 牌力最好但只拿主池
  const dist = g.distributePots([
    { id: 'a', rank: 1, seat: 0 },
    { id: 'b', rank: 2, seat: 1 },
    { id: 'c', rank: 3, seat: 2 },
  ]);
  assert.equal(dist.ok, true);
  assert.ok((dist.awards.a || 0) > 0);
  assert.equal(Object.values(dist.awards).reduce((s, v) => s + v, 0), dist.totalDistributed);
});

test('legalActions 与 snapshot', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b'],
    chips: [500, 500],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  g.startHand();
  const acts = g.legalActions('a');
  assert.ok(acts.includes(ActionType.FOLD));
  assert.ok(acts.includes(ActionType.CALL));
  assert.ok(acts.includes(ActionType.RAISE));
  assert.ok(!acts.includes(ActionType.CHECK));
  const snap = g.getSnapshot();
  assert.equal(snap.street, Street.PREFLOP);
  assert.equal(snap.players.length, 2);
});

test('多街：flop turn river check down', () => {
  const g = new TexasBettingEngine({
    playerIds: ['a', 'b'],
    chips: [1000, 1000],
    smallBlind: 10,
    bigBlind: 20,
    buttonSeat: 0,
  });
  g.startHand();
  g.call('a'); // SB complete
  g.check('b'); // BB
  assert.equal(g.street, Street.FLOP);
  // postflop: first to act is next of button = seat 1 (bb) in HU? 
  // nextSeat(button=0) → seat 1
  const first = g.playerBySeat(g.currentSeat).id;
  g.check(first);
  const second = g.playerBySeat(g.currentSeat).id;
  g.check(second);
  assert.equal(g.street, Street.TURN);
  g.check(g.playerBySeat(g.currentSeat).id);
  g.check(g.playerBySeat(g.currentSeat).id);
  assert.equal(g.street, Street.RIVER);
  g.check(g.playerBySeat(g.currentSeat).id);
  g.check(g.playerBySeat(g.currentSeat).id);
  assert.equal(g.street, Street.SHOWDOWN);
});

test('静态 API 与引擎一致', () => {
  const state = [
    { id: 'p0', betTotal: 25, seat: 0 },
    { id: 'p1', betTotal: 50, seat: 1, folded: true },
    { id: 'p2', betTotal: 50, seat: 2 },
  ];
  const pots = TexasBettingEngine.calculatePots(state);
  const dist = TexasBettingEngine.distributePots(
    pots,
    [{ id: 'p0', rank: 1, seat: 0 }, { id: 'p2', rank: 2, seat: 2 }],
    { sbSeat: 0, playerCount: 3 }
  );
  assert.equal(dist.awards.p0, 75); // main 25*3
  assert.equal(dist.awards.p2, 50); // side 25*2 (p1 folded ineligible but contributed)
});
