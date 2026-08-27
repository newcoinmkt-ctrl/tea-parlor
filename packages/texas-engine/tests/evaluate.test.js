/**
 * 德州 7 选 5 · 牌型 / 踢脚 / 平局 / 性能冒烟
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCard,
  createDeck52,
  cardText,
  HandCategory,
  evaluateFive,
  evaluateBest5Of7,
  compareHands,
  comparePlayers,
  packHandValue,
  unpackHandValue,
  COMBOS_7C5,
} from '../src/index.js';

/** 快捷：rank+suit */
const C = (r, s) => createCard(r, s);

// ═══════════════════════════════════════════
// Card / 基础
// ═══════════════════════════════════════════

test('createCard: rank 2-14 suit 1-4', () => {
  assert.equal(C(14, 4).rank, 14);
  assert.throws(() => createCard(1, 1));
  assert.throws(() => createCard(14, 0));
  assert.equal(createDeck52().length, 52);
  assert.equal(COMBOS_7C5.length, 21);
});

// ═══════════════════════════════════════════
// evaluateFive 各牌型
// ═══════════════════════════════════════════

test('皇家同花顺', () => {
  const h = evaluateFive([
    C(14, 1), C(13, 1), C(12, 1), C(11, 1), C(10, 1),
  ]);
  assert.equal(h.category, HandCategory.ROYAL_FLUSH);
  assert.equal(h.name, '皇家同花顺');
  assert.equal(h.isRoyal, true);
});

test('同花顺（含轮子 A2345）', () => {
  const h = evaluateFive([
    C(14, 2), C(2, 2), C(3, 2), C(4, 2), C(5, 2),
  ]);
  assert.equal(h.category, HandCategory.STRAIGHT_FLUSH);
  assert.equal(h.ranks[0], 5);
  const h2 = evaluateFive([
    C(9, 3), C(8, 3), C(7, 3), C(6, 3), C(5, 3),
  ]);
  assert.equal(h2.category, HandCategory.STRAIGHT_FLUSH);
  assert.ok(compareHands(h2, h) > 0, '9-high SF > wheel SF');
});

test('四条 + 踢脚', () => {
  const a = evaluateFive([C(9, 1), C(9, 2), C(9, 3), C(9, 4), C(14, 1)]);
  const b = evaluateFive([C(9, 1), C(9, 2), C(9, 3), C(9, 4), C(13, 1)]);
  assert.equal(a.category, HandCategory.FOUR_OF_A_KIND);
  assert.ok(compareHands(a, b) > 0, 'quads 9 + A > quads 9 + K');
});

test('葫芦', () => {
  const a = evaluateFive([C(8, 1), C(8, 2), C(8, 3), C(3, 1), C(3, 2)]);
  const b = evaluateFive([C(7, 1), C(7, 2), C(7, 3), C(14, 1), C(14, 2)]);
  assert.equal(a.category, HandCategory.FULL_HOUSE);
  assert.ok(compareHands(a, b) > 0, '8s full > 7s full even with A pair');
});

test('同花踢脚逐张比', () => {
  const a = evaluateFive([C(14, 1), C(12, 1), C(9, 1), C(6, 1), C(2, 1)]);
  const b = evaluateFive([C(14, 2), C(12, 2), C(9, 2), C(5, 2), C(3, 2)]);
  assert.equal(a.category, HandCategory.FLUSH);
  assert.ok(compareHands(a, b) > 0, 'A-Q-9-6-2 > A-Q-9-5-3');
});

test('顺子：A 高与轮子', () => {
  const broadway = evaluateFive([C(14, 1), C(13, 2), C(12, 3), C(11, 4), C(10, 1)]);
  const wheel = evaluateFive([C(14, 1), C(2, 2), C(3, 3), C(4, 4), C(5, 1)]);
  const mid = evaluateFive([C(9, 1), C(8, 2), C(7, 3), C(6, 4), C(5, 1)]);
  assert.equal(broadway.category, HandCategory.STRAIGHT);
  assert.equal(wheel.category, HandCategory.STRAIGHT);
  assert.ok(compareHands(broadway, mid) > 0);
  assert.ok(compareHands(mid, wheel) > 0, '9-high straight > wheel');
});

test('三条 + 两踢脚', () => {
  const a = evaluateFive([C(7, 1), C(7, 2), C(7, 3), C(14, 1), C(12, 2)]);
  const b = evaluateFive([C(7, 1), C(7, 2), C(7, 3), C(14, 1), C(11, 2)]);
  assert.equal(a.category, HandCategory.THREE_OF_A_KIND);
  assert.ok(compareHands(a, b) > 0, 'trips 7 A-Q > trips 7 A-J');
});

test('两对 + 踢脚', () => {
  const a = evaluateFive([C(13, 1), C(13, 2), C(9, 1), C(9, 2), C(14, 3)]);
  const b = evaluateFive([C(13, 1), C(13, 2), C(9, 1), C(9, 2), C(12, 3)]);
  assert.equal(a.category, HandCategory.TWO_PAIR);
  assert.ok(compareHands(a, b) > 0, 'K-K-9-9-A > K-K-9-9-Q');
  const c = evaluateFive([C(13, 1), C(13, 2), C(10, 1), C(10, 2), C(2, 3)]);
  assert.ok(compareHands(c, a) > 0, 'K-K-10-10 > K-K-9-9');
});

test('一对 + 三踢脚（需求例：AAKJ8 > AAK109）', () => {
  const a = evaluateFive([C(14, 1), C(14, 2), C(13, 1), C(11, 2), C(8, 3)]);
  const b = evaluateFive([C(14, 3), C(14, 4), C(13, 2), C(10, 1), C(9, 2)]);
  assert.equal(a.category, HandCategory.ONE_PAIR);
  assert.ok(compareHands(a, b) > 0, 'A-A-K-J-8 > A-A-K-10-9');
});

test('高牌踢脚', () => {
  const a = evaluateFive([C(14, 1), C(12, 2), C(9, 3), C(7, 4), C(3, 1)]);
  const b = evaluateFive([C(14, 2), C(12, 3), C(9, 4), C(7, 1), C(2, 2)]);
  assert.equal(a.category, HandCategory.HIGH_CARD);
  assert.ok(compareHands(a, b) > 0, 'A-Q-9-7-3 > A-Q-9-7-2');
});

// ═══════════════════════════════════════════
// 平局 / Tie
// ═══════════════════════════════════════════

test('完全相同牌型点数 → 0（分池）', () => {
  const a = evaluateFive([C(10, 1), C(10, 2), C(8, 1), C(8, 2), C(4, 3)]);
  const b = evaluateFive([C(10, 3), C(10, 4), C(8, 3), C(8, 4), C(4, 1)]);
  assert.equal(compareHands(a, b), 0);
});

test('同花顺同高点平局', () => {
  const a = evaluateFive([C(9, 1), C(8, 1), C(7, 1), C(6, 1), C(5, 1)]);
  const b = evaluateFive([C(9, 2), C(8, 2), C(7, 2), C(6, 2), C(5, 2)]);
  assert.equal(compareHands(a, b), 0);
});

// ═══════════════════════════════════════════
// evaluateBest5Of7
// ═══════════════════════════════════════════

test('7 选 5：底牌成皇家同花顺', () => {
  const hole = [C(14, 4), C(13, 4)];
  const board = [C(12, 4), C(11, 4), C(10, 4), C(2, 1), C(3, 2)];
  const h = evaluateBest5Of7(hole, board);
  assert.equal(h.category, HandCategory.ROYAL_FLUSH);
  assert.equal(h.cards.length, 5);
});

test('7 选 5：公共牌同花时正确取最高 5 张', () => {
  // 7 张同花：A K Q J 9 8 2 → 最好 AKQJ9
  const hole = [C(14, 1), C(2, 1)];
  const board = [C(13, 1), C(12, 1), C(11, 1), C(9, 1), C(8, 1)];
  const h = evaluateBest5Of7(hole, board);
  assert.equal(h.category, HandCategory.FLUSH);
  assert.deepEqual(h.ranks.slice(0, 5), [14, 13, 12, 11, 9]);
});

test('7 选 5：两对选更高的两对', () => {
  // hole AA, board KK QQ 2 3 4 → AAKKQ 两对
  const hole = [C(14, 1), C(14, 2)];
  const board = [C(13, 1), C(13, 2), C(12, 1), C(12, 2), C(2, 3)];
  const h = evaluateBest5Of7(hole, board);
  assert.equal(h.category, HandCategory.TWO_PAIR);
  assert.equal(h.ranks[0], 14);
  assert.equal(h.ranks[1], 13);
});

test('7 选 5：葫芦优先于两条/三条', () => {
  const hole = [C(8, 1), C(8, 2)];
  const board = [C(8, 3), C(3, 1), C(3, 2), C(14, 1), C(13, 2)];
  const h = evaluateBest5Of7(hole, board);
  assert.equal(h.category, HandCategory.FULL_HOUSE);
  assert.deepEqual(h.ranks.slice(0, 2), [8, 3]);
});

test('7 选 5：使用公共牌顺子忽略更差底牌', () => {
  // board 已有 9-8-7-6-5，hole 22 → 顺子
  const hole = [C(2, 1), C(2, 2)];
  const board = [C(9, 1), C(8, 2), C(7, 3), C(6, 4), C(5, 1)];
  const h = evaluateBest5Of7(hole, board);
  assert.equal(h.category, HandCategory.STRAIGHT);
  assert.equal(h.ranks[0], 9);
});

test('comparePlayers 平局分池', () => {
  const board = [C(14, 1), C(13, 2), C(12, 3), C(5, 4), C(5, 1)];
  // 双方都是 A-K 高牌带公共对 5？ 实际双方 hole 不同但最佳同为 board 顶
  const holeA = [C(2, 1), C(3, 2)];
  const holeB = [C(2, 3), C(3, 4)];
  // 最佳可能是 A-K-Q-5-5 两人都用公共
  const { cmp, handA, handB } = comparePlayers(holeA, holeB, board);
  assert.equal(cmp, 0);
  assert.equal(handA.value, handB.value);
});

test('comparePlayers：一方四条胜', () => {
  const board = [C(9, 1), C(9, 2), C(9, 3), C(2, 1), C(3, 2)];
  const holeA = [C(9, 4), C(14, 1)]; // quads 9
  const holeB = [C(14, 2), C(13, 1)]; // pair 9? trips 9 + A K
  const { cmp } = comparePlayers(holeA, holeB, board);
  assert.ok(cmp > 0);
});

// ═══════════════════════════════════════════
// 跨类别强度
// ═══════════════════════════════════════════

test('牌型层级全序', () => {
  const samples = [
    evaluateFive([C(14, 1), C(13, 1), C(12, 1), C(11, 1), C(10, 1)]), // RF
    evaluateFive([C(9, 1), C(8, 1), C(7, 1), C(6, 1), C(5, 1)]), // SF
    evaluateFive([C(4, 1), C(4, 2), C(4, 3), C(4, 4), C(14, 1)]), // quads
    evaluateFive([C(3, 1), C(3, 2), C(3, 3), C(2, 1), C(2, 2)]), // boat
    evaluateFive([C(14, 2), C(10, 2), C(8, 2), C(6, 2), C(3, 2)]), // flush
    evaluateFive([C(14, 1), C(13, 2), C(12, 3), C(11, 4), C(10, 1)]), // straight
    evaluateFive([C(7, 1), C(7, 2), C(7, 3), C(14, 2), C(2, 1)]), // trips
    evaluateFive([C(13, 1), C(13, 2), C(5, 1), C(5, 2), C(9, 1)]), // two pair
    evaluateFive([C(12, 1), C(12, 2), C(14, 3), C(9, 1), C(2, 2)]), // pair
    evaluateFive([C(14, 1), C(12, 2), C(9, 3), C(7, 4), C(3, 1)]), // high
  ];
  for (let i = 0; i < samples.length - 1; i++) {
    assert.ok(
      compareHands(samples[i], samples[i + 1]) > 0,
      `${samples[i].name} should beat ${samples[i + 1].name}`
    );
  }
});

// ═══════════════════════════════════════════
// pack / 非法入参
// ═══════════════════════════════════════════

test('packHandValue / unpack 往返类别', () => {
  const v = packHandValue(HandCategory.ONE_PAIR, [14, 13, 12, 11]);
  const u = unpackHandValue(v);
  assert.equal(u.category, HandCategory.ONE_PAIR);
  assert.equal(u.ranks[0], 14);
});

test('evaluateBest5Of7 非法长度抛错', () => {
  assert.throws(() => evaluateBest5Of7([C(2, 1)], [C(3, 1), C(4, 1), C(5, 1), C(6, 1), C(7, 1)]));
  assert.throws(() => evaluateBest5Of7([C(2, 1), C(3, 1)], [C(4, 1)]));
});

// ═══════════════════════════════════════════
// 性能冒烟：随机 2 万次 7 选 5
// ═══════════════════════════════════════════

test('性能：20000 次 evaluateBest5Of7 < 2s', () => {
  const deck = createDeck52();
  const t0 = performance.now();
  let checksum = 0;
  for (let i = 0; i < 20000; i++) {
    // 伪洗：旋转切牌
    const off = (i * 17) % 45;
    const cards = [];
    for (let k = 0; k < 7; k++) cards.push(deck[(off + k) % 52]);
    // 避免重复牌
    const used = new Set();
    const unique = [];
    for (let d = 0; d < 52 && unique.length < 7; d++) {
      const c = deck[(off + d * 3) % 52];
      const key = `${c.rank}_${c.suit}`;
      if (!used.has(key)) {
        used.add(key);
        unique.push(c);
      }
    }
    const h = evaluateBest5Of7(unique.slice(0, 2), unique.slice(2, 7));
    checksum ^= h.value;
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `too slow: ${ms}ms checksum=${checksum}`);
});

test('cardText smoke', () => {
  assert.equal(cardText(C(14, 3)), '♥A');
});
