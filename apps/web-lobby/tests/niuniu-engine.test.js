import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  toSourceCard,
  fromSourceCard,
  calculate,
  typeResult,
  compare,
  calculateResult,
  createNiuniuTable,
  niuName,
  niuStampIndex,
  pipValue,
  PHASE,
  SEAT_COUNT,
} from '../src/games/niuniu/engine.js';

function H(...pairs) {
  // pairs: [rank, suit0-3]...
  return pairs.map(([r, s]) => createCard(r, s));
}

test('encoding maps tea-parlor {rank,suit0-3} to source ""+rank+suit1-4', () => {
  const c = createCard(13, 3); // K♠ source 134
  assert.equal(toSourceCard(c), '134');
  const back = fromSourceCard('111'); // J♦
  assert.equal(back.rank, 11);
  assert.equal(back.suit, 0);
  assert.equal(pipValue(13), 10);
  assert.equal(pipValue(1), 1);
  assert.equal(pipValue(10), 10);
});

test('calculate: 没牛 – 牛牛 + specials 11–17', () => {
  // 没牛: A,2,3,4,8 mixed suits
  assert.equal(calculate(H([1, 0], [2, 1], [3, 2], [4, 3], [8, 0])), -1);

  // 牛1: 3+7+10 leftover 9+2 = 11 → wait pick known
  // 2,3,5,6,5 → 2+3+5=10, leftover 6+5=11 → 牛1
  assert.equal(calculate(H([2, 0], [3, 1], [5, 2], [6, 3], [5, 0])), 1);

  // 牛7: 10,7,J,3,4 → 10+7+3=20, leftover J+4=14 → 牛4. Better:
  // 7,3,K,A,6 → 7+3+10=20, leftover 1+6=7 → 牛7
  assert.equal(calculate(H([7, 0], [3, 1], [13, 2], [1, 3], [6, 0])), 7);

  // 牛8
  assert.equal(calculate(H([8, 0], [2, 1], [10, 2], [9, 3], [9, 0])), 8);

  // 牛9: 9,10,10,5,4 → 10+10+10 leftover 9+5? 9+10+1 no.
  // 9,1,10,8,2 → 9+1=10, leftover 10+8+2=20 → 牛10. 
  // 9,8,3,7,2 → 9+8+3=20, leftover 7+2=9 → 牛9
  assert.equal(calculate(H([9, 0], [8, 1], [3, 2], [7, 3], [2, 0])), 9);

  // 牛牛: 3,7,10,10,10
  assert.equal(calculate(H([3, 0], [7, 1], [10, 2], [10, 3], [10, 0])), 10);

  // 顺子牛 11: 2,3,4,5,6 mixed
  assert.equal(calculate(H([2, 0], [3, 1], [4, 2], [5, 3], [6, 0])), 11);

  // 同花牛 12: all ♦, not straight, not five-face, not wuxiao
  // 1,3,5,7,9 of suit 0 → not consecutive max-min=8, not tonghua-shun
  assert.equal(calculate(H([1, 0], [3, 0], [5, 0], [7, 0], [9, 0])), 12);

  // 葫芦牛 13: 3+2
  assert.equal(calculate(H([8, 0], [8, 1], [8, 2], [2, 3], [2, 0])), 13);

  // 五小牛 14: ranks sum ≤10
  assert.equal(calculate(H([1, 0], [1, 1], [2, 2], [2, 3], [3, 0])), 14);

  // 五花牛 15: all J/Q/K
  assert.equal(calculate(H([11, 0], [11, 1], [12, 2], [12, 3], [13, 0])), 15);

  // 炸弹牛 16
  assert.equal(calculate(H([9, 0], [9, 1], [9, 2], [9, 3], [4, 0])), 16);

  // 同花顺 17
  assert.equal(calculate(H([1, 2], [2, 2], [3, 2], [4, 2], [5, 2])), 17);
});

test('typeResult multipliers: 7-8×2, 9×3, 10×4, >10×5, else ×1', () => {
  assert.equal(typeResult(-1), 1);
  assert.equal(typeResult(1), 1);
  assert.equal(typeResult(6), 1);
  assert.equal(typeResult(7), 2);
  assert.equal(typeResult(8), 2);
  assert.equal(typeResult(9), 3);
  assert.equal(typeResult(10), 4);
  for (const p of [11, 12, 13, 14, 15, 16, 17]) {
    assert.equal(typeResult(p), 5, `special ${p}`);
  }
});

test('compare: high rank wins; same rank smaller suit wins; 13/15 special not 16', () => {
  const a = H([13, 0], [5, 1], [4, 2], [3, 3], [2, 0]); // K♦
  const b = H([12, 0], [5, 1], [4, 2], [3, 3], [2, 1]); // Q
  assert.ok(compare(a, b, 1) > 0);

  const c1 = H([13, 0], [8, 1], [7, 2], [6, 3], [2, 0]); // K♦ suit src 1
  const c2 = H([13, 3], [8, 1], [7, 2], [6, 0], [2, 1]); // K♠ suit src 4
  // smaller source suit wins
  assert.ok(compare(c1, c2, 1) > 0);

  // 葫芦: compare trip rank (point 13)
  const huluK = H([13, 0], [13, 1], [13, 2], [2, 3], [2, 0]);
  const huluQ = H([12, 0], [12, 1], [12, 2], [9, 3], [9, 0]);
  assert.ok(compare(huluK, huluQ, 13) > 0);

  // 炸弹 16 is NOT the special branch — high card / suit, not quad rank
  const bomb9 = H([9, 0], [9, 1], [9, 2], [9, 3], [13, 0]); // kicker K
  const bombA = H([1, 0], [1, 1], [1, 2], [1, 3], [5, 0]); // kicker 5
  // maxValue K=13 vs 5 → bomb9 wins via generic compare (quirk vs 炸弹16)
  assert.ok(compare(bomb9, bombA, 16) > 0);
});

test('calculateResult pay = score1 × score2 × difen × winner typeResult', () => {
  const banker = {
    holds: H([3, 0], [7, 1], [10, 2], [10, 3], [10, 0]), // 牛牛
    score1: 2,
    score2: 0,
    score: 0,
    sit: 1,
  };
  const xian = {
    holds: H([1, 0], [2, 1], [3, 2], [4, 3], [8, 0]), // 没牛
    score1: 0,
    score2: 3,
    score: 0,
    sit: 1,
  };
  calculateResult([banker, xian], 0, 5);
  // banker 牛牛 typeResult 4; 2*3*5*4 = 120
  assert.equal(banker.niu, 10);
  assert.equal(xian.niu, -1);
  assert.equal(banker.score, 120);
  assert.equal(xian.score, -120);
});

test('niu stamps: 没牛→0, 1–17 identity; names', () => {
  assert.equal(niuStampIndex(-1), 0);
  assert.equal(niuStampIndex(10), 10);
  assert.equal(niuStampIndex(17), 17);
  assert.equal(niuName(-1), '没牛');
  assert.equal(niuName(10), '牛牛');
  assert.equal(niuName(17), '同花顺牛');
});

test('table: 6 seats deal 5, 抢庄→下注→开牌→settle', () => {
  const t = createNiuniuTable({ difen: 5, chips: 2000 });
  assert.equal(SEAT_COUNT, 6);
  t.deal();
  let s = t.snapshot(0);
  assert.equal(s.phase, PHASE.qiangzhuang);
  assert.equal(s.seats.length, 6);
  assert.equal(s.seats[0].holds.filter(Boolean).length, 4, '看牌抢庄 hides 5th');
  assert.equal(s.seats[1].holds.filter(Boolean).length, 0, 'opponents hidden');

  for (let i = 0; i < 6; i++) t.qiangzhuang(i, i === 0 ? 2 : 1);
  s = t.snapshot(0);
  assert.ok(s.phase === PHASE.xiazhu || s.phase === PHASE.dingzhuang);
  if (s.phase === PHASE.dingzhuang) t.finishDingzhuang();
  s = t.snapshot(0);
  assert.equal(s.phase, PHASE.xiazhu);
  assert.ok(s.button >= 0);
  assert.equal(s.seats[s.button].score1 >= 1, true);

  for (let i = 0; i < 6; i++) {
    if (i !== s.button) t.xiazhu(i, 2);
  }
  s = t.snapshot(0);
  assert.equal(s.phase, PHASE.cuopai);
  assert.equal(s.seats[0].holds.filter(Boolean).length, 5);

  for (let i = 0; i < 6; i++) t.liangpai(i);
  s = t.snapshot(0);
  assert.equal(s.phase, PHASE.settle);
  assert.equal(s.deltas.length, 6);
  const sum = s.deltas.reduce((a, b) => a + b, 0);
  assert.equal(sum, 0, 'zero-sum shadow chips');
  for (const seat of s.seats) {
    assert.ok(seat.niu === -1 || (seat.niu >= 1 && seat.niu <= 17));
  }
});

test('timeout defaults: 不抢 → random banker score1=1; 闲注 default 2', () => {
  const t = createNiuniuTable({ difen: 10 });
  t.deal();
  t.timeoutQiang();
  let s = t.snapshot(0);
  if (s.phase === PHASE.dingzhuang) t.finishDingzhuang();
  s = t.snapshot(0);
  assert.equal(s.phase, PHASE.xiazhu);
  assert.equal(s.seats[s.button].score1, 1);
  t.timeoutXia();
  s = t.snapshot(0);
  assert.equal(s.phase, PHASE.cuopai);
  for (let i = 0; i < 6; i++) {
    if (i !== s.button) assert.equal(s.seats[i].score2, 2);
  }
});
