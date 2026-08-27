/**
 * 斗地主牌型识别 / 比较 — 完整单元测试
 * 覆盖：基础牌型、2/王不能连顺、飞机翅膀合法性、炸弹层级等
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HandType,
  createCard,
  cardsFromRanks,
  identifyHandType,
  compareHands,
  parseHand,
  canBeat,
} from '../src/hand-types.js';

const R = cardsFromRanks;
const id = (ranks) => identifyHandType(R(ranks));
const t = (ranks) => id(ranks).type;

// ─────────────────────────────────────────────
// Card 结构
// ─────────────────────────────────────────────
test('Card: rank 3-15 / jokers 16-17, suit 1-4', () => {
  const c3 = createCard(3, 1);
  assert.equal(c3.rank, 3);
  assert.equal(c3.suit, 1);

  const c2 = createCard(15, 4);
  assert.equal(c2.rank, 15);

  const sj = createCard(16);
  const bj = createCard(17);
  assert.equal(sj.rank, 16);
  assert.equal(bj.rank, 17);
  assert.equal(sj.suit, 4);

  assert.throws(() => createCard(2, 1));
  assert.throws(() => createCard(18, 1));
  assert.throws(() => createCard(5, 0));
  assert.throws(() => createCard(5, 5));
});

// ─────────────────────────────────────────────
// 基础牌型识别
// ─────────────────────────────────────────────
test('identify: 单张 / 对子 / 三张 / 三带一 / 三带对', () => {
  assert.equal(t([7]), HandType.SINGLE);
  assert.equal(t([9, 9]), HandType.PAIR);
  assert.equal(t([5, 5, 5]), HandType.TRIPLE);
  assert.equal(t([6, 6, 6, 3]), HandType.TRIPLE_ONE);
  assert.equal(t([8, 8, 8, 10, 10]), HandType.TRIPLE_PAIR);

  assert.equal(id([14]).weight, 14);
  assert.equal(id([15, 15]).weight, 15);
  assert.equal(id([4, 4, 4, 7]).weight, 4);
  assert.equal(id([11, 11, 11, 12, 12]).weight, 11);
});

test('identify: 单顺 ≥5，双顺 ≥3 对', () => {
  const s = id([3, 4, 5, 6, 7]);
  assert.equal(s.type, HandType.STRAIGHT);
  assert.equal(s.length, 5);
  assert.equal(s.weight, 7);

  const long = id([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.equal(long.type, HandType.STRAIGHT);
  assert.equal(long.length, 12);
  assert.equal(long.weight, 14);

  const ps = id([3, 3, 4, 4, 5, 5]);
  assert.equal(ps.type, HandType.PAIR_STRAIGHT);
  assert.equal(ps.length, 3);
  assert.equal(ps.weight, 5);

  const ps4 = id([7, 7, 8, 8, 9, 9, 10, 10]);
  assert.equal(ps4.type, HandType.PAIR_STRAIGHT);
  assert.equal(ps4.length, 4);
});

test('identify: 飞机不带 / 带单 / 带对', () => {
  assert.equal(t([3, 3, 3, 4, 4, 4]), HandType.PLANE);
  assert.equal(id([5, 5, 5, 6, 6, 6]).weight, 6);
  assert.equal(id([5, 5, 5, 6, 6, 6]).length, 2);

  const p1 = id([3, 3, 3, 4, 4, 4, 7, 9]);
  assert.equal(p1.type, HandType.PLANE_ONE);
  assert.equal(p1.length, 2);
  assert.equal(p1.weight, 4);

  const p2 = id([3, 3, 3, 4, 4, 4, 7, 7, 9, 9]);
  assert.equal(p2.type, HandType.PLANE_PAIR);
  assert.equal(p2.length, 2);

  // 三段飞机
  const p3 = id([7, 7, 7, 8, 8, 8, 9, 9, 9]);
  assert.equal(p3.type, HandType.PLANE);
  assert.equal(p3.length, 3);
  assert.equal(p3.weight, 9);
});

test('identify: 四带二单 / 四带两对 / 炸弹 / 王炸', () => {
  assert.equal(t([9, 9, 9, 9, 3, 5]), HandType.FOUR_TWO);
  assert.equal(t([9, 9, 9, 9, 3, 3]), HandType.FOUR_TWO); // 两单可同点
  assert.equal(t([8, 8, 8, 8, 5, 5, 6, 6]), HandType.FOUR_PAIR);
  assert.equal(t([10, 10, 10, 10]), HandType.BOMB);
  assert.equal(t([15, 15, 15, 15]), HandType.BOMB);
  assert.equal(t([16, 17]), HandType.ROCKET);

  assert.equal(id([16, 17]).weight, 17);
  assert.equal(id([12, 12, 12, 12]).weight, 12);
});

// ─────────────────────────────────────────────
// 边界：2 与双王不能进顺 / 连对 / 飞机主体
// ─────────────────────────────────────────────
test('edge: 单顺不能含 2 或王', () => {
  assert.equal(id([10, 11, 12, 13, 14, 15]).valid, false); // …A 2
  assert.equal(id([12, 13, 14, 15, 16]).valid, false);
  assert.equal(id([13, 14, 15, 16, 17]).valid, false);
  assert.equal(id([15, 3, 4, 5, 6]).valid, false); // 2 夹杂不连续也不行
  // A 结尾合法
  assert.equal(id([10, 11, 12, 13, 14]).type, HandType.STRAIGHT);
});

test('edge: 双顺不能含 2 或王', () => {
  assert.equal(id([13, 13, 14, 14, 15, 15]).valid, false); // K K A A 2 2
  assert.equal(id([14, 14, 15, 15, 16, 16]).valid, false);
  assert.equal(id([3, 3, 4, 4, 15, 15]).valid, false);
  assert.equal(id([10, 10, 11, 11, 12, 12]).type, HandType.PAIR_STRAIGHT);
});

test('edge: 飞机主体不能含 2 或王', () => {
  // KKK AAA 222
  assert.equal(id([13, 13, 13, 14, 14, 14, 15, 15, 15]).valid, false);
  // AAA 222 + 翅膀
  assert.equal(id([14, 14, 14, 15, 15, 15, 3, 4]).valid, false);
  // 伪三王
  assert.equal(id([14, 14, 14, 16, 16, 16]).valid, false);
  // QQQ KKK AAA 合法
  assert.equal(id([12, 12, 12, 13, 13, 13, 14, 14, 14]).type, HandType.PLANE);
});

test('edge: 顺子长度与连续性', () => {
  assert.equal(id([3, 4, 5, 6]).valid, false); // 仅 4 张
  assert.equal(id([3, 3, 4, 4]).valid, false); // 仅 2 对
  assert.equal(id([3, 4, 5, 6, 8]).valid, false); // 断档
  assert.equal(id([3, 3, 4, 4, 6, 6]).valid, false); // 连对断档
});

// ─────────────────────────────────────────────
// 飞机带牌合法性
// ─────────────────────────────────────────────
test('edge: 飞机带牌数量必须合法', () => {
  // 带单缺一张
  assert.equal(id([3, 3, 3, 4, 4, 4, 7]).valid, false);
  // 带单多一张
  assert.equal(id([3, 3, 3, 4, 4, 4, 7, 8, 9]).valid, false);
  // 带对不完整
  assert.equal(id([3, 3, 3, 4, 4, 4, 7, 7, 8]).valid, false);
  // 带对用三张当翅膀不合法（7 有 3 张 → 翅膀不成整对集合）
  assert.equal(id([3, 3, 3, 4, 4, 4, 7, 7, 7, 8]).valid, false);

  // 合法：主体 4 张拆 1 张作翅膀
  const split = id([5, 5, 5, 5, 6, 6, 6, 9]);
  assert.equal(split.type, HandType.PLANE_ONE);
  assert.equal(split.weight, 6);

  // 合法：带两张王作单翅膀
  assert.equal(id([3, 3, 3, 4, 4, 4, 16, 17]).type, HandType.PLANE_ONE);
});

test('edge: 四带二 / 四带两对 非法形态', () => {
  assert.equal(id([5, 5, 5, 5, 6]).valid, false); // 只带一张
  assert.equal(id([5, 5, 5, 5, 6, 7, 8]).valid, false); // 带三张
  // 四带两对：一对 + 两单 不合法
  assert.equal(id([4, 4, 4, 4, 5, 5, 6, 7]).valid, false);
  // 两个炸弹不能当四带两对
  assert.equal(id([3, 3, 3, 3, 8, 8, 8, 8]).valid, false);
  // 四带二不可带双王
  assert.equal(id([9, 9, 9, 9, 16, 17]).valid, false);
});

test('edge: 空牌 / 非法 rank', () => {
  assert.equal(identifyHandType([]).valid, false);
  assert.equal(identifyHandType(null).valid, false);
  assert.equal(identifyHandType([{ rank: 1, suit: 1 }]).valid, false);
});

// ─────────────────────────────────────────────
// 大小比较 compareHands(A, B) = A 能否压 B
// ─────────────────────────────────────────────
test('compare: 同型比 weight，长度必须一致', () => {
  assert.equal(compareHands(id([9]), id([8])), true);
  assert.equal(compareHands(id([8]), id([9])), false);
  assert.equal(compareHands(id([7, 7]), id([6, 6])), true);
  assert.equal(compareHands(id([5, 5, 5]), id([4, 4, 4])), true);

  // 顺子同长才可比
  assert.equal(
    compareHands(id([4, 5, 6, 7, 8]), id([3, 4, 5, 6, 7])),
    true
  );
  assert.equal(
    compareHands(id([4, 5, 6, 7, 8, 9]), id([3, 4, 5, 6, 7])),
    false
  );

  // 连对
  assert.equal(
    compareHands(id([4, 4, 5, 5, 6, 6]), id([3, 3, 4, 4, 5, 5])),
    true
  );
});

test('compare: 不同牌型不能互压（炸弹/王炸除外）', () => {
  assert.equal(compareHands(id([4, 4, 4, 7]), id([3, 3, 3])), false);
  assert.equal(compareHands(id([5, 5]), id([4])), false);
  assert.equal(compareHands(id([3, 3, 3]), id([4, 4])), false);
});

test('compare: 炸弹压非炸弹；炸弹比炸弹；王炸最大', () => {
  const bomb6 = id([6, 6, 6, 6]);
  const bomb10 = id([10, 10, 10, 10]);
  const rocket = id([16, 17]);
  const pair = id([14, 14]);
  const plane = id([3, 3, 3, 4, 4, 4]);

  assert.equal(compareHands(bomb6, pair), true);
  assert.equal(compareHands(bomb6, plane), true);
  assert.equal(compareHands(pair, bomb6), false);

  assert.equal(compareHands(bomb10, bomb6), true);
  assert.equal(compareHands(bomb6, bomb10), false);

  assert.equal(compareHands(rocket, bomb10), true);
  assert.equal(compareHands(rocket, pair), true);
  assert.equal(compareHands(bomb10, rocket), false);
  assert.equal(compareHands(rocket, rocket), false);
});

test('compare: 三带 / 飞机 / 四带 同型可比', () => {
  assert.equal(
    compareHands(id([8, 8, 8, 3]), id([7, 7, 7, 5])),
    true
  );
  assert.equal(
    compareHands(id([9, 9, 9, 10, 10]), id([6, 6, 6, 3, 3])),
    true
  );
  assert.equal(
    compareHands(
      id([5, 5, 5, 6, 6, 6, 3, 4]),
      id([3, 3, 3, 4, 4, 4, 7, 8])
    ),
    true
  );
  assert.equal(
    compareHands(id([9, 9, 9, 9, 15, 3]), id([8, 8, 8, 8, 4, 5])),
    true
  );
});

test('compare: 非法牌型不能压人', () => {
  const bad = id([3, 4, 5, 6]); // 非法顺
  const single = id([3]);
  assert.equal(bad.valid, false);
  assert.equal(compareHands(bad, single), false);
  assert.equal(compareHands(single, bad), true); // B 非法视为可出
});

// ─────────────────────────────────────────────
// 兼容 API
// ─────────────────────────────────────────────
test('compat: parseHand / canBeat 与旧引擎语义一致', () => {
  assert.equal(parseHand(R([3, 4, 5, 6, 7])).type, HandType.STRAIGHT);
  assert.equal(parseHand(R([3, 4, 5, 6])), null);

  assert.equal(canBeat(parseHand(R([8])), parseHand(R([9]))), true);
  assert.equal(canBeat(parseHand(R([9])), parseHand(R([8]))), false);
  assert.equal(canBeat(parseHand(R([14, 14])), parseHand(R([6, 6, 6, 6]))), true);
  assert.equal(canBeat(parseHand(R([10, 10, 10, 10])), parseHand(R([16, 17]))), true);
});

// ─────────────────────────────────────────────
// weight / length 字段完整性
// ─────────────────────────────────────────────
test('HandResult 字段完整且 valid=true 时 type≠invalid', () => {
  const samples = [
    [3],
    [4, 4],
    [5, 5, 5],
    [6, 6, 6, 7],
    [8, 8, 8, 9, 9],
    [3, 4, 5, 6, 7],
    [3, 3, 4, 4, 5, 5],
    [3, 3, 3, 4, 4, 4],
    [3, 3, 3, 4, 4, 4, 5, 6],
    [3, 3, 3, 4, 4, 4, 5, 5, 6, 6],
    [7, 7, 7, 7, 3, 8],
    [7, 7, 7, 7, 3, 3, 8, 8],
    [10, 10, 10, 10],
    [16, 17],
  ];
  for (const ranks of samples) {
    const h = id(ranks);
    assert.equal(h.valid, true, `expected valid: ${ranks}`);
    assert.notEqual(h.type, HandType.INVALID);
    assert.ok(typeof h.weight === 'number');
    assert.ok(typeof h.length === 'number');
    assert.ok(Array.isArray(h.cards));
    assert.equal(h.cards.length, ranks.length);
  }
});
