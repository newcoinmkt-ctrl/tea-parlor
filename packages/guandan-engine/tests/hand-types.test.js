/**
 * 掼蛋牌型 + 逢人配组牌测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCard,
  createGuanDanDeck,
  isWild,
  identifyGuanDanHand,
  bestGuanDanHand,
  HandType,
  compareGuanDanHands,
  describeCards,
} from '../src/index.js';

const C = (r, s) => createCard(r, s);
const H = (r) => createCard(r, 3); // 红心

// ═══════════════════════════════════════════
// 基础
// ═══════════════════════════════════════════

test('两副牌 108 张；逢人配判定', () => {
  assert.equal(createGuanDanDeck().length, 108);
  assert.equal(isWild(H(10), 10), true);
  assert.equal(isWild(C(10, 4), 10), false);
  assert.equal(isWild(H(5), 10), false);
  assert.equal(isWild(createCard(17, 0), 10), false);
});

// ═══════════════════════════════════════════
// 无逢人配硬识别
// ═══════════════════════════════════════════

test('单张 / 对子 / 三张', () => {
  assert.equal(bestGuanDanHand([C(5, 1)], 2).type, HandType.SINGLE);
  assert.equal(bestGuanDanHand([C(5, 1), C(5, 2)], 2).type, HandType.PAIR);
  assert.equal(bestGuanDanHand([C(5, 1), C(5, 2), C(5, 4)], 2).type, HandType.TRIPLE);
});

test('三带二', () => {
  const h = bestGuanDanHand(
    [C(8, 1), C(8, 2), C(8, 3), C(3, 1), C(3, 2)],
    5
  );
  assert.equal(h.type, HandType.TRIPLE_PAIR);
  assert.equal(h.primary, 8);
});

test('三连对（木板）', () => {
  const h = bestGuanDanHand(
    [C(4, 1), C(4, 2), C(5, 1), C(5, 2), C(6, 1), C(6, 2)],
    10
  );
  assert.equal(h.type, HandType.CONSEC_PAIRS);
  assert.equal(h.length, 3);
  assert.equal(h.primary, 6);
});

test('钢板', () => {
  const h = bestGuanDanHand(
    [C(7, 1), C(7, 2), C(7, 3), C(8, 1), C(8, 2), C(8, 4)],
    10
  );
  assert.equal(h.type, HandType.CONSEC_TRIPLES);
  assert.equal(h.length, 2);
  assert.equal(h.primary, 8);
});

test('顺子 / 同花顺 / A2345', () => {
  const st = bestGuanDanHand(
    [C(3, 1), C(4, 2), C(5, 3), C(6, 4), C(7, 1)],
    10
  );
  assert.equal(st.type, HandType.STRAIGHT);

  const sf = bestGuanDanHand(
    [C(9, 1), C(10, 1), C(11, 1), C(12, 1), C(13, 1)],
    5
  );
  assert.equal(sf.type, HandType.STRAIGHT_FLUSH);

  const wheel = bestGuanDanHand(
    [C(14, 2), C(2, 1), C(3, 3), C(4, 4), C(5, 1)],
    10
  );
  assert.equal(wheel.type, HandType.STRAIGHT);
  assert.equal(wheel.primary, 5);
});

test('炸弹与天王炸', () => {
  const b4 = bestGuanDanHand(
    [C(9, 1), C(9, 2), C(9, 3), C(9, 4)],
    2
  );
  assert.equal(b4.type, HandType.BOMB);
  assert.equal(b4.bombSize, 4);

  const b5 = bestGuanDanHand(
    [C(9, 1), C(9, 2), C(9, 3), C(9, 4), C(9, 1)],
    2
  );
  // 两副只有 8 张同点，5 张炸弹
  assert.equal(b5.type, HandType.BOMB);
  assert.equal(b5.bombSize, 5);
  assert.ok(b5.power > b4.power);

  const jokers = [
    createCard(16, 0), createCard(16, 0),
    createCard(17, 0), createCard(17, 0),
  ];
  const tw = bestGuanDanHand(jokers, 10);
  assert.equal(tw.type, HandType.JOKER_BOMB);
  assert.ok(tw.power > b5.power);
});

test('非法组合返回空', () => {
  assert.deepEqual(
    identifyGuanDanHand([C(3, 1), C(5, 2)], 10),
    []
  );
});

// ═══════════════════════════════════════════
// 逢人配组牌
// ═══════════════════════════════════════════

test('逢人配组成 5 张炸弹', () => {
  // 打 10：♥10 百搭 + 四张 8 → 可作 5 个 8
  const cards = [H(10), C(8, 1), C(8, 2), C(8, 3), C(8, 4)];
  const all = identifyGuanDanHand(cards, 10);
  const bomb5 = all.find((h) => h.type === HandType.BOMB && h.bombSize === 5 && h.primary === 8);
  assert.ok(bomb5, `got ${all.map((h) => h.name + h.bombSize).join(',')}`);
  assert.equal(bomb5.usesWild, true);
  const best = bestGuanDanHand(cards, 10);
  // 最大应是 5 炸（强于 4 炸或顺子）
  assert.equal(best.type, HandType.BOMB);
  assert.equal(best.bombSize, 5);
});

test('逢人配组成同花顺', () => {
  // 打 5：♥5 百搭 + ♦6♦7♦8♦9 → 同花顺 5-6-7-8-9 或 6-7-8-9-10
  // 固定牌花色不同则不成同花；改用同花
  const cards = [
    H(5),
    C(6, 1), C(7, 1), C(8, 1), C(9, 1),
  ];
  const all = identifyGuanDanHand(cards, 5);
  const sf = all.find((h) => h.type === HandType.STRAIGHT_FLUSH);
  assert.ok(sf, describeCards(cards, 5) + ' → ' + all.map((h) => h.name).join(','));
  assert.ok(sf.primary === 9 || sf.primary === 10);
});

test('两张逢人配组成同花顺', () => {
  // 打 10：两张 ♥10 + ♥J ♥Q ♥K → 可 10-J-Q-K-A 同花顺
  const cards = [
    H(10), H(10),
    C(11, 3), C(12, 3), C(13, 3),
  ];
  // 两副才有两张红心 10
  const all = identifyGuanDanHand(cards, 10);
  const sf = all.find((h) => h.type === HandType.STRAIGHT_FLUSH);
  assert.ok(sf, all.map((h) => `${h.name}@${h.primary}`).join(' | '));
});

test('逢人配组成钢板', () => {
  // 打 7：♥7 + 三个 5 + 两个 6 → 钢板 555666
  const cards = [
    H(7),
    C(5, 1), C(5, 2), C(5, 3),
    C(6, 1), C(6, 2),
  ];
  const all = identifyGuanDanHand(cards, 7);
  const steel = all.find((h) => h.type === HandType.CONSEC_TRIPLES && h.length === 2);
  assert.ok(steel, all.map((h) => h.name).join(','));
  assert.equal(steel.primary, 6);
});

test('逢人配组成三连对', () => {
  // 打 3：♥3 + 44 55 6 → 445566
  const cards = [
    H(3),
    C(4, 1), C(4, 2),
    C(5, 1), C(5, 2),
    C(6, 1),
  ];
  const all = identifyGuanDanHand(cards, 3);
  const tube = all.find((h) => h.type === HandType.CONSEC_PAIRS && h.length === 3);
  assert.ok(tube, all.map((h) => h.name).join(','));
});

test('逢人配组成三带二', () => {
  // 打 2：♥2 + 三个 K + 一张 A → 可 KKK + AA
  const cards = [
    H(2),
    C(13, 1), C(13, 2), C(13, 3),
    C(14, 1),
  ];
  const all = identifyGuanDanHand(cards, 2);
  const fh = all.find((h) => h.type === HandType.TRIPLE_PAIR && h.primary === 13);
  assert.ok(fh, all.map((h) => h.name).join(','));
});

test('identifyGuanDanHand 返回按 power 降序；优先最大牌型', () => {
  const cards = [H(10), C(8, 1), C(8, 2), C(8, 3), C(8, 4)];
  const all = identifyGuanDanHand(cards, 10);
  assert.ok(all.length >= 1);
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].power >= all[i].power);
  }
  assert.equal(all[0].type, HandType.BOMB);
  assert.equal(all[0].bombSize, 5);
});

test('compareGuanDanHands: 天王炸 > 同花顺 > 5 炸 > 4 炸（掼蛋炸弹序）', () => {
  const jokerBomb = bestGuanDanHand(
    [createCard(16, 0), createCard(16, 0), createCard(17, 0), createCard(17, 0)],
    10
  );
  const b5 = bestGuanDanHand(
    [C(4, 1), C(4, 2), C(4, 3), C(4, 4), H(10)],
    10
  );
  const sf = bestGuanDanHand(
    [C(5, 2), C(6, 2), C(7, 2), C(8, 2), C(9, 2)],
    10
  );
  const b4 = bestGuanDanHand(
    [C(14, 1), C(14, 2), C(14, 3), C(14, 4)],
    10
  );
  // 标准：天王炸 > 同花顺(≈5~6炸之间) > 5炸 > 4炸
  assert.ok(compareGuanDanHands(jokerBomb, sf, 10) > 0);
  assert.ok(compareGuanDanHands(sf, b5, 10) > 0);
  assert.ok(compareGuanDanHands(b5, b4, 10) > 0);
});

test('无百搭时红心级牌可作普通级牌对子', () => {
  // 打 10，♥10 + ♠10 → 对 10（也可百搭玩法，但至少有对子）
  const cards = [H(10), C(10, 4)];
  const all = identifyGuanDanHand(cards, 10);
  assert.ok(all.some((h) => h.type === HandType.PAIR && h.primary === 10));
});
