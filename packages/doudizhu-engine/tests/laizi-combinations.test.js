/**
 * 癞子组合搜索单元测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { HandType, cardsFromRanks } from '../src/hand-types.js';
import {
  isWildCard,
  getBestLaiziCombinations,
  parseHandLaizi,
  canBeatLaizi,
  estimateLaiziSearchSpace,
  compareLaiziComboPriority,
} from '../src/laizi-combinations.js';

const L = 7; // 本局癞子点数 = 7

/** 构造牌：点数数组；7 视为癞子 */
function hand(ranks) {
  return cardsFromRanks(ranks);
}

test('isWildCard: 仅 laiziPoint 为癞子，王不是癞子', () => {
  const cards = hand([7, 3, 16, 17]);
  assert.equal(isWildCard(cards[0], 7), true);
  assert.equal(isWildCard(cards[1], 7), false);
  assert.equal(isWildCard(cards[2], 7), false);
  assert.equal(isWildCard(cards[3], 7), false);
  assert.equal(isWildCard(cards[0], null), false);
});

test('search space: W≤4 时分配规模可控（≤1820）', () => {
  assert.equal(estimateLaiziSearchSpace(0), 1);
  assert.equal(estimateLaiziSearchSpace(1), 13);
  assert.ok(estimateLaiziSearchSpace(4) <= 2000);
  assert.ok(estimateLaiziSearchSpace(4) >= 1000);
});

test('硬炸弹：四张自然同点（非癞子）', () => {
  const cards = hand([8, 8, 8, 8]);
  const list = getBestLaiziCombinations(cards, L);
  assert.ok(list.length >= 1);
  assert.equal(list[0].type, HandType.BOMB);
  assert.equal(list[0].hardBomb, true);
  assert.equal(list[0].soft, false);
  assert.equal(list[0].weight, 8);
});

test('软炸弹：3 自然 + 1 癞子 / 2+2 癞子 / 4 癞子', () => {
  // 三个 9 + 一个 7(癞子)
  let list = getBestLaiziCombinations(hand([9, 9, 9, 7]), L);
  assert.ok(list.some((c) => c.type === HandType.BOMB && c.soft && c.weight === 9));
  const best = list[0];
  assert.equal(best.type, HandType.BOMB);
  assert.equal(best.soft, true);

  // 两个 5 + 两个癞子 → 软炸 5
  list = getBestLaiziCombinations(hand([5, 5, 7, 7]), L);
  assert.ok(list.some((c) => c.type === HandType.BOMB && c.weight === 5 && c.soft));

  // 四个癞子 → 可变成任意点软炸；最优应是炸弹
  list = getBestLaiziCombinations(hand([7, 7, 7, 7]), L, { preferMaxOnly: true });
  assert.equal(list[0].type, HandType.BOMB);
  assert.equal(list[0].soft, true);
  // 优先高 weight（2=15）
  assert.ok(list[0].weight >= 14);
});

test('癞子凑顺子：填洞，不含 2/王', () => {
  // 3,5,6,7癞,8 → 可变 3-8 顺（缺 4，癞子当 4；但 7 是癞子原位？
  // ranks: 3,5,6,7(wild),8 → normals 3,5,6,8 + 1 wild → 顺 3-8 缺 4 和 7？
  // normals: 3,5,6,8 — 若顺 3,4,5,6,7,8 需要 wild 填 4 和 7，但只有 1 wild
  // 用 3,4,5,6,7癞 → normals 3,4,5,6 + 1 wild → 顺 3-7 缺 7，癞子当 7
  const cards = hand([3, 4, 5, 6, 7]); // 1 癞子
  const list = getBestLaiziCombinations(cards, L);
  assert.ok(
    list.some((c) => c.type === HandType.STRAIGHT && c.length === 5 && c.soft),
    '应能识别癞子顺'
  );
});

test('癞子凑连对', () => {
  // 33 44 5 + 癞子 → 333? no — 33 44 55 with 1 wild as 5
  const cards = hand([3, 3, 4, 4, 5, 7]);
  const list = getBestLaiziCombinations(cards, L);
  assert.ok(
    list.some((c) => c.type === HandType.PAIR_STRAIGHT && c.length === 3 && c.weight === 5),
    '癞子补连对 334455'
  );
});

test('癞子凑飞机优先于低级牌型', () => {
  // 333 444 + 两癞子当翅膀单 → 飞机带单；也可能是别的
  // 3,3,3,4,4,4,7,7 — 两癞子当 5,6? 不是飞机带单
  // 飞机带单: 333444 + 2 singles. 用 3,3,3,4,4,4,8,7(wild)
  const cards = hand([3, 3, 3, 4, 4, 4, 8, 7]);
  const list = getBestLaiziCombinations(cards, L);
  assert.ok(list.some((c) => c.type === HandType.PLANE_ONE && c.length === 2));

  // 含炸弹材料时炸弹优先
  const withBomb = hand([9, 9, 9, 7]);
  const bombsFirst = getBestLaiziCombinations(withBomb, L);
  assert.equal(bombsFirst[0].type, HandType.BOMB);
});

test('优先级: 硬炸 > 软炸 > 飞机 > 顺子', () => {
  const hard = getBestLaiziCombinations(hand([10, 10, 10, 10]), L)[0];
  const soft = getBestLaiziCombinations(hand([10, 10, 10, 7]), L)[0];
  const plane = getBestLaiziCombinations(hand([3, 3, 3, 4, 4, 4]), L)[0];
  const straight = getBestLaiziCombinations(hand([3, 4, 5, 6, 7]), L).find((c) => c.type === HandType.STRAIGHT)
    || getBestLaiziCombinations(hand([3, 4, 5, 6, 8]), 7).find((c) => c.type === HandType.STRAIGHT);

  assert.equal(hard.type, HandType.BOMB);
  assert.equal(hard.hardBomb, true);
  assert.equal(soft.type, HandType.BOMB);
  assert.equal(soft.soft, true);
  assert.ok(compareLaiziComboPriority(hard, soft) > 0);
  assert.ok(compareLaiziComboPriority(soft, plane) > 0);
  if (straight) {
    assert.ok(compareLaiziComboPriority(plane, straight) > 0);
  }
});

test('王炸不受癞子影响；癞子不能凑火箭', () => {
  const rocket = getBestLaiziCombinations(hand([16, 17]), L);
  assert.equal(rocket[0]?.type, HandType.ROCKET);

  // 小王 + 癞子 ≠ 火箭
  const fake = getBestLaiziCombinations(hand([16, 7]), L);
  assert.ok(!fake.some((c) => c.type === HandType.ROCKET));
});

test('parseHandLaizi 返回最优单解；canBeatLaizi 硬炸压软炸', () => {
  const soft = parseHandLaizi(hand([8, 8, 8, 7]), L);
  const hard = parseHandLaizi(hand([6, 6, 6, 6]), L);
  assert.ok(soft && soft.soft);
  assert.ok(hard && hard.hardBomb);
  assert.equal(canBeatLaizi(soft, hard), true);
  assert.equal(canBeatLaizi(hard, soft), false);

  // 同软炸比点数
  const soft9 = parseHandLaizi(hand([9, 9, 9, 7]), L);
  const soft5 = parseHandLaizi(hand([5, 5, 5, 7]), L);
  assert.equal(canBeatLaizi(soft5, soft9), true);
});

test('非法 / 空输入', () => {
  assert.deepEqual(getBestLaiziCombinations([], L), []);
  assert.deepEqual(getBestLaiziCombinations(null, L), []);
  // 断顺 + 癞子仍不够
  const bad = getBestLaiziCombinations(hand([3, 4, 5, 9]), L);
  // 可能变成别的（三带？只有 4 张 3,4,5,7）— 三带一需要 3+1
  // 3,4,5,7 → 可 三带? 没有三张。对+? 无。单顺长度 4 非法。
  assert.ok(Array.isArray(bad));
});

test('性能: 4 癞子 + 若干牌应在短时完成', () => {
  const cards = hand([7, 7, 7, 7, 3, 4, 5, 6, 8, 9, 10, 11]);
  const t0 = Date.now();
  const list = getBestLaiziCombinations(cards, L, { maxResults: 32 });
  const ms = Date.now() - t0;
  assert.ok(ms < 200, `应 <200ms，实际 ${ms}ms`);
  assert.ok(list.length >= 1);
  // 整手 12 张很难成标准型；但函数应返回（可能空）
  assert.ok(Array.isArray(list));
});

test('substitution 字段记录癞子去向', () => {
  const list = getBestLaiziCombinations(hand([9, 9, 9, 7]), L);
  const bomb = list.find((c) => c.type === HandType.BOMB && c.weight === 9);
  assert.ok(bomb);
  assert.equal(bomb.substitution['9'], 1);
  assert.equal(bomb.wildUsed, 1);
  assert.equal(bomb.effectiveRanks.filter((r) => r === 9).length, 4);
});

test('preferMaxOnly 只保留最大牌型档', () => {
  // 4 癞子可成炸弹 / 顺子等，preferMaxOnly → 仅炸弹
  const list = getBestLaiziCombinations(hand([7, 7, 7, 7]), L, { preferMaxOnly: true });
  assert.ok(list.length >= 1);
  assert.ok(list.every((c) => c.type === HandType.BOMB));
});
