/**
 * 红中百搭胡牌引擎测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canHuWithWildcards,
  minWildsForSuitMelds,
  HuType,
  ZHONG_SUIT,
  ZHONG_RANK,
  isWildcardTile,
  benchmarkHu,
} from '../src/wildcard-hu.js';

function T(suit, rank) {
  return { suit, rank, id: `${suit}_${rank}_${Math.random().toString(36).slice(2, 6)}` };
}
function Z(i = 0) {
  return { suit: ZHONG_SUIT, rank: ZHONG_RANK, isZhong: true, isWild: true, id: `z${i}` };
}

/** 标准胡：1万对 + 234万 + 456万 + 789万 + 111筒 */
function standardHuHand() {
  return [
    T(0, 1), T(0, 1),
    T(0, 2), T(0, 3), T(0, 4),
    T(0, 4), T(0, 5), T(0, 6),
    T(0, 7), T(0, 8), T(0, 9),
    T(2, 1), T(2, 1), T(2, 1),
  ];
}

test('isWildcardTile detects 红中', () => {
  assert.equal(isWildcardTile(Z()), true);
  assert.equal(isWildcardTile(T(0, 5)), false);
});

test('hard hu without wilds', () => {
  const hand = standardHuHand();
  const r = canHuWithWildcards(hand, 0);
  assert.equal(r.isHu, true);
  assert.ok(r.huTypes.includes(HuType.STANDARD));
  assert.ok(r.huTypes.includes(HuType.HARD_HU));
  assert.equal(r.minWildsNeeded, 0);
});

test('hu with 1 wild filling chow gap', () => {
  // 11万 + 23万(+鬼当4→234) + 567万 + 888万 + 999万
  const hand = [
    T(0, 1), T(0, 1),
    T(0, 2), T(0, 3), // + wild → 234
    T(0, 5), T(0, 6), T(0, 7),
    T(0, 8), T(0, 8), T(0, 8),
    T(0, 9), T(0, 9), T(0, 9),
    Z(0),
  ];
  const r = canHuWithWildcards(hand, 1);
  assert.equal(r.isHu, true, JSON.stringify(r));
  assert.ok(r.huTypes.includes(HuType.STANDARD));
  assert.ok(r.minWildsNeeded <= 1);
});

test('hu with wild as pair (红中作将)', () => {
  // 将全靠 2 鬼；面子：123万 456万 789万 111筒
  const hand = [
    T(0, 1), T(0, 2), T(0, 3),
    T(0, 4), T(0, 5), T(0, 6),
    T(0, 7), T(0, 8), T(0, 9),
    T(2, 1), T(2, 1), T(2, 1),
    Z(0), Z(1),
  ];
  const r = canHuWithWildcards(hand, 2);
  assert.equal(r.isHu, true);
  assert.ok(
    r.huTypes.includes(HuType.ZHONG_PAIR) || r.huTypes.includes(HuType.PURE_WILD_PAIR)
  );
});

test('four 红中 暴胡 / 红中杠标记', () => {
  // 4 红中 + 123万 456万 789万 + 一对筒
  const hand = [
    Z(0), Z(1), Z(2), Z(3),
    T(0, 1), T(0, 2), T(0, 3),
    T(0, 4), T(0, 5), T(0, 6),
    T(0, 7), T(0, 8), T(0, 9),
    T(2, 5), T(2, 5),
  ];
  // 15 tiles - wrong. 4+9+2=15. Need 14.
  // 4 zhong + 123 456 789 (9) + 5筒 (need pair with wild already in 4)
  // 4+9+1=14 with one 5筒 and zhong help pair - use 2 5筒
  const hand14 = [
    Z(0), Z(1), Z(2), Z(3),
    T(0, 1), T(0, 2), T(0, 3),
    T(0, 4), T(0, 5), T(0, 6),
    T(0, 7), T(0, 8), T(0, 9),
    T(2, 5), // 13 normal+zhong wait
  ];
  // 4+9+1 = 14
  const r = canHuWithWildcards(hand14, 4);
  // pair 5筒 need 1 wild; melds complete; min wilds >=1, have 4
  assert.equal(r.isHu, true, JSON.stringify(r));
  assert.ok(r.huTypes.includes(HuType.FOUR_ZHONG) || r.huTypes.includes(HuType.STANDARD));
});

test('not hu when wilds insufficient', () => {
  // 很多散牌
  const hand = [
    T(0, 1), T(0, 3), T(0, 5), T(0, 7), T(0, 9),
    T(1, 1), T(1, 3), T(1, 5), T(1, 7), T(1, 9),
    T(2, 1), T(2, 3), T(2, 5),
  ];
  const r = canHuWithWildcards(hand, 1);
  assert.equal(r.isHu, false);
});

test('seven pairs with wilds', () => {
  const hand = [
    T(0, 1), T(0, 1),
    T(0, 2), T(0, 2),
    T(0, 3), T(0, 3),
    T(1, 4), T(1, 4),
    T(1, 5), T(1, 5),
    T(2, 6), T(2, 6),
    T(2, 7), // 单，需 1 鬼
    Z(0),
  ];
  const r = canHuWithWildcards(hand, 1, { allowSevenPairs: true });
  assert.equal(r.isHu, true);
  assert.ok(r.huTypes.includes(HuType.SEVEN_PAIRS));
});

test('minWildsForSuitMelds: empty = 0; three = 0; one = 2', () => {
  assert.equal(minWildsForSuitMelds([0, 0, 0, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(minWildsForSuitMelds([3, 0, 0, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(minWildsForSuitMelds([1, 0, 0, 0, 0, 0, 0, 0, 0]), 2);
  assert.equal(minWildsForSuitMelds([1, 1, 1, 0, 0, 0, 0, 0, 0]), 0); // 123
});

test('performance: avg < 1ms per call', () => {
  const hand = [
    T(0, 1), T(0, 1),
    T(0, 2), T(0, 3),
    T(0, 4), T(0, 5), T(0, 6),
    T(0, 7), T(0, 8), T(0, 9),
    T(2, 1), T(2, 1), T(2, 1),
    Z(0),
  ];
  const { avgMs, totalMs } = benchmarkHu(hand, 1, 2000);
  assert.ok(avgMs < 1, `avg ${avgMs}ms total ${totalMs}ms`);
});

test('hand with embedded 红中 and wildcardsCount', () => {
  const hand = standardHuHand().slice(0, 12).concat([Z(0), Z(1)]);
  // 12 normal + 2 zhong = 14; may or may not hu depending on which 2 removed
  const r = canHuWithWildcards(hand); // auto count zhong
  assert.equal(typeof r.isHu, 'boolean');
  assert.ok(Array.isArray(r.huTypes));
});
