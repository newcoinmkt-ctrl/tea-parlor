/**
 * 炸金花牌型识别与比较 · 完整单元测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCard,
  createDeck52,
  cardText,
  HandType,
  HAND_TYPE_NAME,
  identifyHandType,
  compareHands,
  is235,
  isLeopard,
  hasLeopardAmong,
  displayName,
  rankHands,
} from '../src/index.js';

/** 快捷：r1s1, r2s2, r3s3 — suit 默认不同以免误判同花 */
function C(r1, s1, r2, s2, r3, s3) {
  return [createCard(r1, s1), createCard(r2, s2), createCard(r3, s3)];
}

function typeOf(cards) {
  return identifyHandType(cards).type;
}

function nameOf(cards) {
  return identifyHandType(cards).name;
}

// ═══════════════════════════════════════════
// Card / Deck
// ═══════════════════════════════════════════

test('createCard: rank 2-14 suit 1-4', () => {
  const c = createCard(14, 4);
  assert.equal(c.rank, 14);
  assert.equal(c.suit, 4);
  assert.throws(() => createCard(1, 1));
  assert.throws(() => createCard(15, 1));
  assert.throws(() => createCard(10, 0));
  assert.throws(() => createCard(10, 5));
});

test('createDeck52: 52 unique cards', () => {
  const d = createDeck52();
  assert.equal(d.length, 52);
  const keys = new Set(d.map((c) => `${c.rank}_${c.suit}`));
  assert.equal(keys.size, 52);
});

test('identifyHandType rejects wrong length', () => {
  assert.throws(() => identifyHandType([]));
  assert.throws(() => identifyHandType([createCard(2, 1), createCard(3, 1)]));
});

// ═══════════════════════════════════════════
// 牌型识别
// ═══════════════════════════════════════════

test('豹子：AAA / 222', () => {
  const aaa = C(14, 1, 14, 2, 14, 3);
  const kkk = C(13, 1, 13, 2, 13, 3);
  const t22 = C(2, 1, 2, 2, 2, 3);
  assert.equal(typeOf(aaa), HandType.TRIPLE);
  assert.equal(nameOf(aaa), '豹子');
  assert.equal(typeOf(t22), HandType.TRIPLE);
  assert.ok(compareHands(aaa, kkk) > 0);
  assert.ok(compareHands(kkk, t22) > 0);
  assert.ok(isLeopard(aaa));
});

test('顺金：同花顺 QKA > 910J > A23', () => {
  const qka = C(12, 1, 13, 1, 14, 1);
  const jtj = C(9, 2, 10, 2, 11, 2);
  const a23 = C(14, 3, 2, 3, 3, 3);
  assert.equal(typeOf(qka), HandType.STRAIGHT_FLUSH);
  assert.equal(nameOf(qka), '顺金');
  assert.equal(typeOf(a23), HandType.STRAIGHT_FLUSH);
  assert.ok(identifyHandType(a23).isA23);
  assert.ok(compareHands(qka, jtj) > 0);
  assert.ok(compareHands(jtj, a23) > 0);
  // A23 是最小顺金
  const s234 = C(2, 4, 3, 4, 4, 4);
  assert.ok(compareHands(s234, a23) > 0, '234 顺金 > A23 顺金');
});

test('金花：同花非顺 AKJ > AK10 > QJ9', () => {
  const akj = C(14, 2, 13, 2, 11, 2);
  const akt = C(14, 3, 13, 3, 10, 3);
  const qj9 = C(12, 4, 11, 4, 9, 4);
  assert.equal(typeOf(akj), HandType.FLUSH);
  assert.equal(nameOf(akj), '金花');
  assert.ok(compareHands(akj, akt) > 0, 'AKJ > AK10');
  assert.ok(compareHands(akt, qj9) > 0);
  // 同高牌比第二张
  const aq9 = C(14, 1, 12, 1, 9, 1);
  const aj9 = C(14, 2, 11, 2, 9, 2);
  assert.ok(compareHands(aq9, aj9) > 0, 'AQ9 > AJ9');
});

test('顺子：非同花 QKA > 910J > 234 > A23', () => {
  const qka = C(12, 1, 13, 2, 14, 3);
  const jtj = C(9, 1, 10, 2, 11, 3);
  const s234 = C(2, 1, 3, 2, 4, 3);
  const a23 = C(14, 1, 2, 2, 3, 3);
  assert.equal(typeOf(qka), HandType.STRAIGHT);
  assert.equal(typeOf(a23), HandType.STRAIGHT);
  assert.ok(identifyHandType(a23).isA23);
  assert.ok(compareHands(qka, jtj) > 0);
  assert.ok(compareHands(jtj, s234) > 0);
  assert.ok(compareHands(s234, a23) > 0, '234 > A23（A23 最小顺）');
});

test('对子：AAK > AAQ > KK2；同对比踢脚', () => {
  const aak = C(14, 1, 14, 2, 13, 3);
  const aaq = C(14, 1, 14, 3, 12, 2);
  const kk2 = C(13, 1, 13, 2, 2, 3);
  const qq9 = C(12, 1, 12, 2, 9, 3);
  assert.equal(typeOf(aak), HandType.PAIR);
  assert.equal(nameOf(aak), '对子');
  assert.ok(compareHands(aak, aaq) > 0);
  assert.ok(compareHands(aaq, kk2) > 0);
  assert.ok(compareHands(kk2, qq9) > 0);
  // 对子在中间：KAA
  const kaa = C(13, 4, 14, 1, 14, 2);
  assert.equal(typeOf(kaa), HandType.PAIR);
  assert.equal(identifyHandType(kaa).primary, 14);
  assert.deepEqual(identifyHandType(kaa).kickers, [13]);
});

test('散牌：AKJ > AK10 > QJ9；无连续无同花无对', () => {
  const akj = C(14, 1, 13, 2, 11, 3);
  const akt = C(14, 1, 13, 2, 10, 3);
  const qj9 = C(12, 1, 11, 2, 9, 3);
  assert.equal(typeOf(akj), HandType.HIGH);
  assert.equal(nameOf(akj), '散牌');
  assert.ok(compareHands(akj, akt) > 0);
  assert.ok(compareHands(akt, qj9) > 0);
});

// ═══════════════════════════════════════════
// 跨牌型强度
// ═══════════════════════════════════════════

test('牌型层级：豹子 > 顺金 > 金花 > 顺子 > 对子 > 散牌', () => {
  const leo = C(2, 1, 2, 2, 2, 3); // 最小豹子
  const sf = C(14, 1, 2, 1, 3, 1); // 最小顺金 A23
  const fl = C(14, 2, 13, 2, 11, 2); // 大金花
  const st = C(12, 1, 13, 2, 14, 3); // 最大顺
  const pr = C(14, 1, 14, 2, 13, 3); // 大对
  const hi = C(14, 1, 13, 2, 12, 3); // AKQ 非同花非顺？ 12-13-14 是顺！
  // 散牌用 AKJ
  const high = C(14, 1, 13, 2, 11, 3);

  assert.ok(compareHands(leo, sf) > 0);
  assert.ok(compareHands(sf, fl) > 0);
  assert.ok(compareHands(fl, st) > 0);
  assert.ok(compareHands(st, pr) > 0);
  assert.ok(compareHands(pr, high) > 0);
});

// ═══════════════════════════════════════════
// 235 特殊规则
// ═══════════════════════════════════════════

test('is235: 任意花色 2·3·5', () => {
  assert.ok(is235(C(2, 1, 3, 2, 5, 3)));
  assert.ok(is235(C(5, 4, 2, 4, 3, 4))); // 同花 235 也是 235
  assert.equal(is235(C(2, 1, 3, 2, 4, 3)), false);
  assert.equal(is235(C(2, 1, 2, 2, 5, 3)), false);
});

test('无豹子时：235 为最小散牌', () => {
  const s235 = C(2, 1, 3, 2, 5, 3);
  const r = identifyHandType(s235);
  assert.equal(r.is235, true);
  // 静态类型：235 若非同花则为 HIGH（2,3,5 非连续）
  assert.equal(r.type, HandType.HIGH);

  const lowHigh = C(2, 1, 3, 2, 4, 3); // 234 是顺子，用 2,3,6
  const tiny = C(2, 1, 3, 2, 6, 3);
  const mid = C(7, 1, 8, 2, 10, 3);

  assert.ok(compareHands(tiny, s235, false) > 0, '任意散牌 > 无豹子场 235');
  assert.ok(compareHands(mid, s235, false) > 0);
  // 最小对子也大于 235
  const pair22 = C(2, 1, 2, 2, 3, 3);
  assert.ok(compareHands(pair22, s235, false) > 0);
  // 豹子完胜无场 235
  const aaa = C(14, 1, 14, 2, 14, 3);
  assert.ok(compareHands(aaa, s235, false) > 0);
});

test('有豹子时：235 大于豹子（杀手）', () => {
  const s235 = C(2, 1, 3, 2, 5, 3);
  const aaa = C(14, 1, 14, 2, 14, 3);
  const t22 = C(2, 1, 2, 2, 2, 4);

  assert.ok(compareHands(s235, aaa, true) > 0, '235 > AAA when leopard in game');
  assert.ok(compareHands(s235, t22, true) > 0, '235 > 222');
  assert.ok(compareHands(aaa, s235, false) > 0, '无豹子标记时豹子仍大');
});

test('有豹子时：235 只杀豹子，仍小于其它非豹子牌型', () => {
  const s235 = C(2, 1, 3, 2, 5, 4);
  const sf = C(12, 1, 13, 1, 14, 1); // 顺金
  const fl = C(14, 2, 13, 2, 11, 2); // 金花
  const st = C(12, 1, 13, 2, 14, 3); // 顺子
  const pr = C(3, 1, 3, 2, 2, 3); // 对 3
  const hi = C(7, 1, 8, 2, 10, 3); // 散牌

  assert.ok(compareHands(sf, s235, true) > 0, '顺金 > 235');
  assert.ok(compareHands(fl, s235, true) > 0, '金花 > 235');
  assert.ok(compareHands(st, s235, true) > 0, '顺子 > 235');
  assert.ok(compareHands(pr, s235, true) > 0, '对子 > 235');
  assert.ok(compareHands(hi, s235, true) > 0, '散牌 > 235');
  // 仍杀豹子
  assert.ok(compareHands(s235, C(14, 1, 14, 2, 14, 3), true) > 0);
});

test('同花 235：无豹子时按金花比较；有豹子时仍是杀手', () => {
  // 2,3,5 同花 → 金花（非顺）
  const flush235 = C(2, 1, 3, 1, 5, 1);
  const r = identifyHandType(flush235);
  assert.equal(r.is235, true);
  assert.equal(r.type, HandType.FLUSH, '静态识别为金花');

  // 无豹子：235 强制最小，即使是金花形态
  const lowFlush = C(2, 2, 3, 2, 6, 2); // 同花 236
  assert.ok(compareHands(lowFlush, flush235, false) > 0, '无豹子时同花235仍最小');

  // 有豹子：杀手
  const aaa = C(14, 1, 14, 2, 14, 3);
  assert.ok(compareHands(flush235, aaa, true) > 0);
});

test('hasLeopardAmong + rankHands', () => {
  const hands = [
    C(14, 1, 13, 2, 11, 3), // 散牌 AKJ
    C(14, 1, 14, 2, 14, 3), // 豹子 AAA
    C(2, 1, 3, 2, 5, 3),    // 235
  ];
  assert.equal(hasLeopardAmong(hands), true);
  // 1v1：235 > 豹子
  assert.ok(compareHands(hands[2], hands[1], true) > 0);
  // 多人亮牌可传递序：散牌 > 235 > 豹子（豹子被杀手压制垫底）
  const order = rankHands(hands);
  assert.equal(order[0], 0, 'high first in multi-way');
  assert.equal(order[1], 2, '235 above leopards only');
  assert.equal(order[2], 1, 'leopard last');
});

test('displayName for 235', () => {
  const h = identifyHandType(C(2, 1, 3, 2, 5, 3));
  assert.equal(displayName(h, true), '235杀手');
  assert.match(displayName(h, false), /235|散牌/);
});

// ═══════════════════════════════════════════
// 平局 / 完全相同
// ═══════════════════════════════════════════

test('完全相同牌型点数 → 0', () => {
  // 注意：不同花色的同点数组合 power 相同（不比花色）
  const a = C(14, 1, 13, 2, 11, 3);
  const b = C(14, 2, 13, 3, 11, 4);
  assert.equal(compareHands(a, b), 0);

  const p1 = C(9, 1, 9, 2, 5, 3);
  const p2 = C(9, 3, 9, 4, 5, 1);
  assert.equal(compareHands(p1, p2), 0);

  const t1 = C(8, 1, 8, 2, 8, 3);
  const t2 = C(8, 2, 8, 3, 8, 4);
  assert.equal(compareHands(t1, t2), 0);
});

test('对子同点不同踢脚', () => {
  const a = C(10, 1, 10, 2, 14, 3); // 对10踢A
  const b = C(10, 1, 10, 3, 13, 2); // 对10踢K
  assert.ok(compareHands(a, b) > 0);
});

test('金花同最大点比第二、第三', () => {
  const a = C(14, 1, 12, 1, 9, 1); // A Q 9
  const b = C(14, 2, 12, 2, 8, 2); // A Q 8
  assert.ok(compareHands(a, b) > 0);
  const c = C(14, 3, 11, 3, 10, 3); // A J 10
  assert.ok(compareHands(a, c) > 0, 'AQ9 > AJ10');
});

// ═══════════════════════════════════════════
// 边缘：接受 HandResult 入参
// ═══════════════════════════════════════════

test('compareHands accepts HandResult objects', () => {
  const a = identifyHandType(C(14, 1, 14, 2, 14, 3));
  const b = identifyHandType(C(13, 1, 13, 2, 13, 3));
  assert.ok(compareHands(a, b) > 0);
});

// ═══════════════════════════════════════════
// 非顺连续 / 非对
// ═══════════════════════════════════════════

test('A24 不是顺子；KQA 是顺', () => {
  const a24 = C(14, 1, 2, 2, 4, 3);
  assert.equal(typeOf(a24), HandType.HIGH);
  const kqa = C(13, 1, 12, 2, 14, 3);
  assert.equal(typeOf(kqa), HandType.STRAIGHT);
});

test('JQK 顺子 vs 同花 JQK', () => {
  const st = C(11, 1, 12, 2, 13, 3);
  const sf = C(11, 4, 12, 4, 13, 4);
  assert.equal(typeOf(st), HandType.STRAIGHT);
  assert.equal(typeOf(sf), HandType.STRAIGHT_FLUSH);
  assert.ok(compareHands(sf, st) > 0);
});

// ═══════════════════════════════════════════
// 综合矩阵抽样
// ═══════════════════════════════════════════

test('综合：典型桌面比牌矩阵', () => {
  const samples = {
    AAA: C(14, 1, 14, 2, 14, 3),
    KKK: C(13, 1, 13, 2, 13, 3),
    sfQKA: C(12, 1, 13, 1, 14, 1),
    flushAKJ: C(14, 2, 13, 2, 11, 2),
    stQKA: C(12, 1, 13, 2, 14, 3),
    pairAAK: C(14, 1, 14, 2, 13, 3),
    highAKJ: C(14, 1, 13, 2, 11, 3),
    s235: C(2, 1, 3, 2, 5, 4),
  };

  // 无豹子上下文（但牌里有 AAA —— 比牌函数需显式传 hasLeopard）
  assert.ok(compareHands(samples.AAA, samples.KKK, false) > 0);
  assert.ok(compareHands(samples.sfQKA, samples.flushAKJ, false) > 0);
  assert.ok(compareHands(samples.flushAKJ, samples.stQKA, false) > 0);
  assert.ok(compareHands(samples.stQKA, samples.pairAAK, false) > 0);
  assert.ok(compareHands(samples.pairAAK, samples.highAKJ, false) > 0);

  // 有豹子时 235 只杀豹子，不压顺金
  assert.ok(compareHands(samples.s235, samples.AAA, true) > 0);
  assert.ok(compareHands(samples.sfQKA, samples.s235, true) > 0);

  // 无豹子时 235 最小
  assert.ok(compareHands(samples.highAKJ, samples.s235, false) > 0);
  assert.ok(compareHands(samples.pairAAK, samples.s235, false) > 0);
  assert.ok(compareHands(samples.AAA, samples.s235, false) > 0);
});

test('cardText smoke', () => {
  const c = createCard(14, 3);
  assert.equal(cardText(c), '♥A');
});

test('HAND_TYPE_NAME covers all', () => {
  for (const t of Object.values(HandType)) {
    assert.ok(HAND_TYPE_NAME[t]);
  }
});
