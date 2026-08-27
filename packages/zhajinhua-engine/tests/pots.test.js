/**
 * 主池 / 边池 · settleAllPots 完整单元测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSidePots,
  settleAllPots,
  previewPots,
  canWinPot,
  createCard,
  PlayerStatus,
} from '../src/index.js';

/** 三张牌快捷 */
function hand(r1, s1, r2, s2, r3, s3) {
  return [createCard(r1, s1), createCard(r2, s2), createCard(r3, s3)];
}

const AAA = () => hand(14, 1, 14, 2, 14, 3);
const KKK = () => hand(13, 1, 13, 2, 13, 3);
const PAIR_AA = () => hand(14, 1, 14, 2, 9, 3);
const HIGH = () => hand(14, 1, 13, 2, 11, 3); // AKJ 散
const LOW = () => hand(2, 1, 4, 2, 7, 3);

// ═══════════════════════════════════════════
// buildSidePots
// ═══════════════════════════════════════════

test('buildSidePots: 等额投入 → 仅主池', () => {
  const pots = buildSidePots([
    { id: 'a', betTotal: 100, status: PlayerStatus.LOOKED },
    { id: 'b', betTotal: 100, status: PlayerStatus.LOOKED },
    { id: 'c', betTotal: 100, status: PlayerStatus.FOLDED },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].isMain, true);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].contributorIds.sort(), ['a', 'b', 'c']);
  // 弃牌无资格
  assert.deepEqual(pots[0].eligibleIds.sort(), ['a', 'b']);
});

test('buildSidePots: A30 B50 C100 → 主池+两边池', () => {
  const pots = buildSidePots([
    { id: 'a', betTotal: 30, status: PlayerStatus.ALL_IN },
    { id: 'b', betTotal: 50, status: PlayerStatus.LOOKED },
    { id: 'c', betTotal: 100, status: PlayerStatus.LOOKED },
  ]);
  assert.equal(pots.length, 3);
  // Main: 30×3=90
  assert.equal(pots[0].amount, 90);
  assert.equal(pots[0].isMain, true);
  assert.deepEqual(pots[0].eligibleIds.sort(), ['a', 'b', 'c']);
  // Side1: 20×2=40
  assert.equal(pots[1].amount, 40);
  assert.ok(!pots[1].isMain);
  assert.deepEqual(pots[1].eligibleIds.sort(), ['b', 'c']);
  assert.ok(!pots[1].eligibleIds.includes('a'), 'All-in A 不进更高边池');
  // Side2: 50×1=50
  assert.equal(pots[2].amount, 50);
  assert.deepEqual(pots[2].eligibleIds, ['c']);

  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 180);
});

test('buildSidePots: 两人 All-in 不同额度', () => {
  const pots = buildSidePots([
    { id: 'a', betTotal: 40, status: PlayerStatus.ALL_IN },
    { id: 'b', betTotal: 100, status: PlayerStatus.ALL_IN },
  ]);
  assert.equal(pots[0].amount, 80); // 40*2
  assert.equal(pots[1].amount, 60); // 60*1
  assert.deepEqual(pots[0].eligibleIds.sort(), ['a', 'b']);
  assert.deepEqual(pots[1].eligibleIds, ['b']);
});

test('buildSidePots: 零投入忽略', () => {
  assert.deepEqual(buildSidePots([
    { id: 'a', betTotal: 0, status: PlayerStatus.MEN },
  ]), []);
});

test('previewPots 汇总', () => {
  const prev = previewPots([
    { id: 'a', betTotal: 30, status: PlayerStatus.ALL_IN },
    { id: 'b', betTotal: 50, status: PlayerStatus.LOOKED },
  ]);
  assert.equal(prev.totalPot, 80);
  assert.equal(prev.mainPot, 60);
  assert.equal(prev.sidePotsTotal, 20);
});

// ═══════════════════════════════════════════
// settleAllPots
// ═══════════════════════════════════════════

test('settleAllPots: 单池 · 最大牌通吃', () => {
  const r = settleAllPots([
    { id: 'a', betTotal: 50, status: PlayerStatus.LOOKED, cards: AAA(), seat: 0 },
    { id: 'b', betTotal: 50, status: PlayerStatus.LOOKED, cards: HIGH(), seat: 1 },
    { id: 'c', betTotal: 50, status: PlayerStatus.FOLDED, cards: KKK(), seat: 2 },
  ]);
  assert.equal(r.totalPot, 150);
  assert.equal(r.awards.a, 150);
  assert.equal(r.awards.b, 0);
  assert.equal(r.awards.c, 0);
  // 零和 deltas
  assert.equal(r.deltas.a + r.deltas.b + r.deltas.c, 0);
  assert.equal(r.deltas.a, 100); // +150 -50
});

test('settleAllPots: All-in 短码只赢主池，边池归长码', () => {
  // A all-in 30 持 AAA；B 50 持散牌；C 100 持 KKK
  // 主池 90：A 最大 → A 得 90
  // 边池 40：B vs C，C 的 KKK > B → C 得 40
  // 边池 50：仅 C → C 得 50
  // A awards=90, C=90, B=0
  const r = settleAllPots([
    { id: 'a', betTotal: 30, status: PlayerStatus.ALL_IN, cards: AAA(), seat: 0 },
    { id: 'b', betTotal: 50, status: PlayerStatus.LOOKED, cards: HIGH(), seat: 1 },
    { id: 'c', betTotal: 100, status: PlayerStatus.LOOKED, cards: KKK(), seat: 2 },
  ]);
  assert.equal(r.pots.length, 3);
  assert.equal(r.awards.a, 90);
  assert.equal(r.awards.b, 0);
  assert.equal(r.awards.c, 90);
  assert.equal(r.mainPot, 90);
  assert.equal(r.sidePotsTotal, 90);
  assert.equal(r.awards.a + r.awards.b + r.awards.c, 180);
  assert.equal(Object.values(r.deltas).reduce((a, b) => a + b, 0), 0);
  // A 不能拿到边池
  assert.ok(r.pots[1].winnerIds.every((id) => id !== 'a'));
  assert.ok(r.pots[2].winnerIds.every((id) => id !== 'a'));
});

test('settleAllPots: All-in 短码牌力最大仍只拿主池', () => {
  // A all-in 20 AAA；B 100 HIGH — 主池 40 给 A；边池 80 给 B
  const r = settleAllPots([
    { id: 'a', betTotal: 20, status: PlayerStatus.ALL_IN, cards: AAA(), seat: 0 },
    { id: 'b', betTotal: 100, status: PlayerStatus.LOOKED, cards: HIGH(), seat: 1 },
  ]);
  assert.equal(r.awards.a, 40);
  assert.equal(r.awards.b, 80);
  assert.equal(r.deltas.a, 20); // +40-20
  assert.equal(r.deltas.b, -20); // +80-100
});

test('settleAllPots: 同牌力均分主池', () => {
  const r = settleAllPots([
    { id: 'a', betTotal: 30, status: PlayerStatus.LOOKED, cards: PAIR_AA(), seat: 0 },
    { id: 'b', betTotal: 30, status: PlayerStatus.LOOKED, cards: PAIR_AA(), seat: 1 },
  ]);
  // 同对 AA+9，平分 60
  assert.equal(r.awards.a, 30);
  assert.equal(r.awards.b, 30);
});

test('settleAllPots: 弃牌筹码进池但不可赢', () => {
  const r = settleAllPots([
    { id: 'a', betTotal: 40, status: PlayerStatus.FOLDED, cards: AAA(), seat: 0 },
    { id: 'b', betTotal: 40, status: PlayerStatus.LOOKED, cards: LOW(), seat: 1 },
  ]);
  assert.equal(r.awards.a, 0);
  assert.equal(r.awards.b, 80);
});

test('settleAllPots: 比牌淘汰 LOST 不可赢池', () => {
  const r = settleAllPots([
    { id: 'a', betTotal: 50, status: PlayerStatus.LOST, cards: AAA(), seat: 0 },
    { id: 'b', betTotal: 50, status: PlayerStatus.LOOKED, cards: LOW(), seat: 1 },
  ]);
  assert.equal(r.awards.a, 0);
  assert.equal(r.awards.b, 100);
});

test('settleAllPots: 三层边池 · 中间 All-in 赢主池+第一边池', () => {
  // A:20 HIGH, B:60 AAA all-in, C:100 KKK
  // Main 20*3=60: B AAA 最大
  // Side 40*2=80: B vs C → B
  // Side 40*1=40: C only
  const r = settleAllPots([
    { id: 'a', betTotal: 20, status: PlayerStatus.LOOKED, cards: HIGH(), seat: 0 },
    { id: 'b', betTotal: 60, status: PlayerStatus.ALL_IN, cards: AAA(), seat: 1 },
    { id: 'c', betTotal: 100, status: PlayerStatus.LOOKED, cards: KKK(), seat: 2 },
  ]);
  assert.equal(r.awards.b, 60 + 80); // 140
  assert.equal(r.awards.c, 40);
  assert.equal(r.awards.a, 0);
  assert.equal(r.awards.a + r.awards.b + r.awards.c, 180);
});

test('canWinPot 状态', () => {
  assert.equal(canWinPot({ status: PlayerStatus.ALL_IN }), true);
  assert.equal(canWinPot({ status: PlayerStatus.MEN }), true);
  assert.equal(canWinPot({ status: PlayerStatus.FOLDED }), false);
  assert.equal(canWinPot({ status: PlayerStatus.LOST }), false);
});

test('settleAllPots: awards 之和等于 totalPot', () => {
  const cases = [
    [
      { id: 'a', betTotal: 15, status: PlayerStatus.ALL_IN, cards: LOW() },
      { id: 'b', betTotal: 45, status: PlayerStatus.LOOKED, cards: HIGH() },
      { id: 'c', betTotal: 45, status: PlayerStatus.LOOKED, cards: PAIR_AA() },
      { id: 'd', betTotal: 90, status: PlayerStatus.LOOKED, cards: KKK() },
    ],
    [
      { id: 'x', betTotal: 7, status: PlayerStatus.ALL_IN, cards: AAA() },
      { id: 'y', betTotal: 7, status: PlayerStatus.ALL_IN, cards: KKK() },
      { id: 'z', betTotal: 100, status: PlayerStatus.LOOKED, cards: HIGH() },
    ],
  ];
  for (const players of cases) {
    const r = settleAllPots(players);
    const sumAwards = Object.values(r.awards).reduce((a, b) => a + b, 0);
    assert.equal(sumAwards, r.totalPot);
    assert.equal(Object.values(r.deltas).reduce((a, b) => a + b, 0), 0);
  }
});
