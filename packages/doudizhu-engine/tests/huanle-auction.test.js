/**
 * 欢乐斗地主 · 叫/抢地主 + 加倍 + 倍率结算 单元测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuctionMode,
  ScoreAction,
  RobAction,
  AuctionPhase,
  DoublePhase,
  createAuctionState,
  getLegalAuctionActions,
  applyAuctionAction,
  assignBottomToLandlord,
  createDoublingState,
  applyDoubleAction,
  finalizeDoublingDefaults,
  calculateFinalMultipliers,
  buildMultiplierInputFromStates,
} from '../src/huanle-auction.js';

// ─────────────────────────────────────────────
// 叫分模式
// ─────────────────────────────────────────────

test('score mode: random starter, bid 3 ends immediately', () => {
  const s0 = createAuctionState({
    mode: AuctionMode.SCORE,
    starter: 1,
    random: () => 0,
  });
  assert.equal(s0.starter, 1);
  assert.equal(s0.turn, 1);
  assert.deepEqual(getLegalAuctionActions(s0), [0, 1, 2, 3]);

  const r = applyAuctionAction(s0, 1, ScoreAction.THREE);
  assert.equal(r.ok, true);
  assert.equal(r.state.finished, true);
  assert.equal(r.state.landlordIndex, 1);
  assert.equal(r.state.baseScore, 3);
  assert.equal(r.state.callMultiplier, 1);
  assert.equal(r.state.reason, 'score_bid_3');
});

test('score mode: highest bid wins after three actions', () => {
  let s = createAuctionState({ mode: AuctionMode.SCORE, starter: 0 });
  s = applyAuctionAction(s, 0, 1).state;
  s = applyAuctionAction(s, 1, 2).state;
  s = applyAuctionAction(s, 2, 0).state;
  assert.equal(s.finished, true);
  assert.equal(s.landlordIndex, 1);
  assert.equal(s.baseScore, 2);
  assert.equal(s.reason, 'score_highest');
});

test('score mode: all pass → starter landlord base 1', () => {
  let s = createAuctionState({ mode: AuctionMode.SCORE, starter: 2 });
  s = applyAuctionAction(s, 2, 0).state;
  s = applyAuctionAction(s, 0, 0).state;
  s = applyAuctionAction(s, 1, 0).state;
  assert.equal(s.finished, true);
  assert.equal(s.landlordIndex, 2);
  assert.equal(s.baseScore, 1);
});

test('score mode: cannot bid lower or equal current', () => {
  let s = createAuctionState({ mode: AuctionMode.SCORE, starter: 0 });
  s = applyAuctionAction(s, 0, 2).state;
  const bad = applyAuctionAction(s, 1, 1);
  assert.equal(bad.ok, false);
  assert.deepEqual(getLegalAuctionActions(s), [0, 3]);
});

// ─────────────────────────────────────────────
// 叫/抢模式
// ─────────────────────────────────────────────

test('rob mode: all pass → no landlord', () => {
  let s = createAuctionState({ mode: AuctionMode.ROB, starter: 0 });
  s = applyAuctionAction(s, 0, RobAction.PASS).state;
  s = applyAuctionAction(s, 1, RobAction.PASS).state;
  s = applyAuctionAction(s, 2, RobAction.PASS).state;
  assert.equal(s.finished, true);
  assert.equal(s.reason, 'rob_all_pass');
  assert.equal(s.landlordIndex, -1);
  assert.equal(s.callMultiplier, 1);
});

test('rob mode: call only, others pass → caller is landlord, mult 1', () => {
  let s = createAuctionState({ mode: AuctionMode.ROB, starter: 0 });
  s = applyAuctionAction(s, 0, RobAction.CALL).state;
  assert.equal(s.phase, AuctionPhase.ROBBING);
  assert.equal(s.landlordIndex, 0);
  s = applyAuctionAction(s, 1, RobAction.PASS).state;
  s = applyAuctionAction(s, 2, RobAction.PASS).state;
  assert.equal(s.finished, true);
  assert.equal(s.landlordIndex, 0);
  assert.equal(s.callMultiplier, 1);
  assert.equal(s.robCount, 0);
});

test('rob mode: each rob doubles callMultiplier', () => {
  let s = createAuctionState({ mode: AuctionMode.ROB, starter: 0 });
  // 0 叫
  s = applyAuctionAction(s, 0, RobAction.CALL).state;
  // 1 抢 → *2
  s = applyAuctionAction(s, 1, RobAction.ROB).state;
  assert.equal(s.landlordIndex, 1);
  assert.equal(s.callMultiplier, 2);
  assert.equal(s.robCount, 1);
  // 2 抢 → *2
  s = applyAuctionAction(s, 2, RobAction.ROB).state;
  assert.equal(s.landlordIndex, 2);
  assert.equal(s.callMultiplier, 4);
  assert.equal(s.robCount, 2);
  // 0 不抢, 1 不抢
  s = applyAuctionAction(s, 0, RobAction.PASS).state;
  s = applyAuctionAction(s, 1, RobAction.PASS).state;
  assert.equal(s.finished, true);
  assert.equal(s.landlordIndex, 2);
  assert.equal(s.callMultiplier, 4);
});

test('rob mode: bottom cards assigned to landlord', () => {
  const hands = [[1], [2], [3]];
  const bottom = ['a', 'b', 'c'];
  const next = assignBottomToLandlord(hands, bottom, 1);
  assert.deepEqual(next[1], [2, 'a', 'b', 'c']);
  assert.deepEqual(next[0], [1]);
  assert.equal(hands[1].length, 1); // 不改原数组
});

// ─────────────────────────────────────────────
// 加倍
// ─────────────────────────────────────────────

test('doubling: farmers double/super, landlord redouble', () => {
  let d = createDoublingState({ landlordIndex: 0, allowSuperDouble: true });
  assert.equal(d.phase, DoublePhase.FARMERS);

  // 地主不能先加倍
  assert.equal(applyDoubleAction(d, 0, 2).ok, false);

  d = applyDoubleAction(d, 1, 2).state; // 农民加倍
  d = applyDoubleAction(d, 2, 4).state; // 超级加倍
  assert.equal(d.phase, DoublePhase.LANDLORD);
  assert.equal(d.factors[1], 2);
  assert.equal(d.factors[2], 4);

  d = applyDoubleAction(d, 0, 2).state; // 反加倍
  assert.equal(d.finished, true);
  assert.equal(d.factors[0], 2);
});

test('doubling: timeout defaults to 1', () => {
  let d = createDoublingState({ landlordIndex: 1 });
  d = applyDoubleAction(d, 0, 2).state;
  d = finalizeDoublingDefaults(d);
  assert.equal(d.finished, true);
  assert.equal(d.factors[0], 2);
  assert.equal(d.factors[1], 1);
  assert.equal(d.factors[2], 1);
});

// ─────────────────────────────────────────────
// calculateFinalMultipliers
// ─────────────────────────────────────────────

test('settlement: base formula shared * personal doubles, landlord wins', () => {
  // base=1, call=2, bomb=1→*2, no ming, no spring, room=1
  // factors: landlord 2, f1=2, f2=1
  // shared = 1*2*2*1*1*1 = 4
  // line f1: 4*2*2=16; line f2: 4*1*2=8
  // landlord +16+8=+24; f1=-16; f2=-8
  const r = calculateFinalMultipliers({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 1,
    callMultiplier: 2,
    bombCount: 1,
    mingPai: false,
    spring: false,
    doubleFactors: [2, 2, 1],
    baseRoomScore: 1,
  });

  assert.equal(r.winnerSide, 'landlord');
  assert.equal(r.sharedMultiplier, 4);
  assert.equal(r.bombMult, 2);
  assert.equal(r.lines.length, 2);
  assert.equal(r.rawScores[0], 24);
  assert.equal(r.rawScores[1], -16);
  assert.equal(r.rawScores[2], -8);
  // 守恒
  assert.equal(r.rawScores[0] + r.rawScores[1] + r.rawScores[2], 0);
});

test('settlement: farmers win, spring and mingPai multiply', () => {
  // shared = 3 * 1 * 2^0 * 2 * 2 * 1 = 12
  // factors all 1 → each line 12; landlord -24, farmers +12 each
  const r = calculateFinalMultipliers({
    landlordIndex: 1,
    winnerIndex: 0, // farmer
    baseScore: 3,
    callMultiplier: 1,
    bombCount: 0,
    mingPai: true,
    spring: true,
    doubleFactors: [1, 1, 1],
  });
  assert.equal(r.winnerSide, 'farmer');
  assert.equal(r.mingMult, 2);
  assert.equal(r.springMult, 2);
  assert.equal(r.sharedMultiplier, 12);
  assert.equal(r.rawScores[1], -24);
  assert.equal(r.rawScores[0], 12);
  assert.equal(r.rawScores[2], 12);
});

test('settlement: rob mult chain 4 with super double', () => {
  // callMult=4 (抢两次), bomb=2→4, farmer super 4, landlord redouble 2
  // shared = 1*4*4*1*1*1 = 16
  // line fA: 16*4*2=128; line fB: 16*1*2=32
  const r = calculateFinalMultipliers({
    landlordIndex: 2,
    winnerIndex: 2,
    baseScore: 1,
    callMultiplier: 4,
    bombCount: 2,
    doubleFactors: [4, 1, 2],
  });
  assert.equal(r.sharedMultiplier, 16);
  assert.equal(r.rawScores[2], 128 + 32);
  assert.equal(r.rawScores[0], -128);
  assert.equal(r.rawScores[1], -32);
});

test('settlement: maxWin/maxLoss cap per line stake', () => {
  const r = calculateFinalMultipliers({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 10,
    callMultiplier: 4,
    bombCount: 3, // *8
    doubleFactors: [2, 4, 4],
    // shared = 10*4*8 = 320; line = 320*4*2 = 2560 → cap 100
    maxWinPerPlayer: 100,
    maxLossPerPlayer: 100,
  });
  // 每条线 stake cap 100，地主两条线最多 +200
  assert.ok(Math.abs(r.rawScores[1]) <= 100);
  assert.ok(Math.abs(r.rawScores[2]) <= 100);
  assert.ok(r.rawScores[0] <= 200);
});

test('settlement: carryScores cap independent lines', () => {
  const r = calculateFinalMultipliers({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 5,
    callMultiplier: 1,
    bombCount: 0,
    doubleFactors: [1, 1, 1],
    // shared=5, each line 5; farmer1 only has 3 carry
    carryScores: [100, 3, 100],
  });
  assert.equal(r.scores[1], -3);
  // 地主从 f1 只拿 3，从 f2 拿 5 → +8
  assert.equal(r.scores[2], -5);
  assert.equal(r.scores[0], 8);
});

test('settlement: landlord carry caps total across both farmer lines', () => {
  const r = calculateFinalMultipliers({
    landlordIndex: 0,
    winnerIndex: 0,
    baseScore: 5,
    callMultiplier: 1,
    bombCount: 0,
    doubleFactors: [1, 1, 1],
    carryScores: [5, 100, 100],
  });
  assert.equal(r.rawScores[0], 10);
  assert.equal(r.scores[0], 5);
  assert.equal(r.scores[1] + r.scores[2], -5);
});

test('integration: auction rob + double + settle', () => {
  let a = createAuctionState({ mode: AuctionMode.ROB, starter: 0 });
  a = applyAuctionAction(a, 0, RobAction.CALL).state;
  a = applyAuctionAction(a, 1, RobAction.ROB).state; // mult 2
  a = applyAuctionAction(a, 2, RobAction.PASS).state;
  a = applyAuctionAction(a, 0, RobAction.PASS).state;
  assert.equal(a.finished, true);
  assert.equal(a.landlordIndex, 1);
  assert.equal(a.callMultiplier, 2);

  let d = createDoublingState({ landlordIndex: 1 });
  d = applyDoubleAction(d, 0, 2).state;
  d = applyDoubleAction(d, 2, 1).state;
  d = applyDoubleAction(d, 1, 2).state; // 反加倍

  const input = buildMultiplierInputFromStates(a, d, {
    winnerIndex: 1,
    bombCount: 1,
    spring: false,
    mingPai: false,
    baseRoomScore: 1,
  });
  const r = calculateFinalMultipliers(input);
  // shared = 1 * 2 * 2 = 4
  // f0: 4*2*2=16; f2: 4*1*2=8; landlord +24
  assert.equal(r.sharedMultiplier, 4);
  assert.equal(r.rawScores[1], 24);
  assert.equal(r.rawScores[0], -16);
  assert.equal(r.rawScores[2], -8);
});

test('illegal: wrong turn / finished', () => {
  let s = createAuctionState({ mode: AuctionMode.SCORE, starter: 0 });
  assert.equal(applyAuctionAction(s, 1, 1).ok, false);
  s = applyAuctionAction(s, 0, 3).state;
  assert.equal(applyAuctionAction(s, 0, 1).ok, false);
});
