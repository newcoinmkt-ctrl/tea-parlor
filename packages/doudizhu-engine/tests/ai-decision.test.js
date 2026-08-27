/**
 * makeAIDecision 出牌 AI 测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCard } from '../src/card.js';
import { parseHand, HandType } from '../src/rules.js';
import {
  makeAIDecision,
  estimateMinHands,
  isTeammateLastPlay,
  decidePlay,
} from '../src/ai-decision.js';

function cards(ranks) {
  const suitByRank = new Map();
  return ranks.map((rank) => {
    const suit = suitByRank.get(rank) || 0;
    suitByRank.set(rank, suit + 1);
    return createCard(rank, rank >= 16 ? 4 : suit);
  });
}

function parse(ranks) {
  return parseHand(cards(ranks));
}

// ── 接口 / 首出 ──

test('lead: empty lastPlayedHand prefers combo over bomb', () => {
  // 有顺子 + 炸弹，首出应走顺子/组合而非炸
  const hand = cards([3, 4, 5, 6, 7, 9, 9, 9, 9, 11, 12]);
  const d = makeAIDecision(hand, null, 'landlord', { myIndex: 0, landlordIndex: 0 });
  assert.equal(d.action, 'play');
  assert.ok(d.cards?.length);
  assert.notEqual(d.parsed?.type, HandType.BOMB);
  assert.notEqual(d.parsed?.type, HandType.ROCKET);
  // 优先顺子类
  assert.ok(
    [HandType.STRAIGHT, HandType.TRIPLE_ONE, HandType.TRIPLE, HandType.PAIR, HandType.SINGLE]
      .includes(d.parsed.type)
      || d.cards.length >= 5,
    `unexpected lead ${d.parsed?.type}`
  );
});

test('lead: prefers straight when available', () => {
  const hand = cards([3, 4, 5, 6, 7, 8, 10, 12]);
  const d = makeAIDecision(hand, null, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
  });
  assert.equal(d.action, 'play');
  assert.equal(d.parsed.type, HandType.STRAIGHT);
  assert.ok(d.cards.length >= 5);
});

test('lead: can finish in one play', () => {
  const hand = cards([5, 5]);
  const d = makeAIDecision(hand, null, 'landlord');
  assert.equal(d.action, 'play');
  assert.equal(d.cards.length, 2);
  assert.equal(d.reason, 'lead_finish');
});

test('lead: keeps rocket when other plays exist', () => {
  const hand = cards([3, 4, 5, 6, 7, 16, 17]);
  const d = makeAIDecision(hand, null, 'landlord');
  assert.equal(d.action, 'play');
  assert.notEqual(d.parsed.type, HandType.ROCKET);
});

// ── 跟牌 ──

test('follow: plays minimal legal beat', () => {
  const hand = cards([5, 8, 9, 12, 12, 15]);
  const last = parse([7]);
  const d = makeAIDecision(hand, last, 'landlord', {
    myIndex: 0,
    landlordIndex: 0,
    lastPlayerIndex: 1,
  });
  assert.equal(d.action, 'play');
  assert.equal(d.parsed.type, HandType.SINGLE);
  assert.equal(d.parsed.weight, 8); // 最小能压 7 的是 8
});

test('follow: farmer passes teammate low-value play', () => {
  const hand = cards([14, 14, 15, 10, 10, 10]);
  const last = parse([6, 6]); // 队友小对
  const d = makeAIDecision(hand, last, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
    lastPlayerIndex: 2, // 另一农民
    handCounts: [10, 8, 9],
  });
  assert.equal(d.action, 'pass');
  assert.equal(d.reason, 'pass_teammate_low_value');
});

test('follow: farmer beats landlord', () => {
  const hand = cards([9, 11, 13]);
  const last = parse([8]);
  const d = makeAIDecision(hand, last, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
    lastPlayerIndex: 0,
    handCounts: [8, 5, 6],
  });
  assert.equal(d.action, 'play');
  assert.equal(d.parsed.type, HandType.SINGLE);
  assert.ok(d.parsed.weight > 8);
});

test('follow: no legal beat → pass', () => {
  const hand = cards([3, 4, 5]);
  const last = parse([15]); // 2
  const d = makeAIDecision(hand, last, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
    lastPlayerIndex: 0,
  });
  assert.equal(d.action, 'pass');
});

test('follow: finish overrides teammate pass', () => {
  const hand = cards([8, 8]);
  const last = parse([6, 6]);
  const d = makeAIDecision(hand, last, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
    lastPlayerIndex: 2,
  });
  assert.equal(d.action, 'play');
  assert.equal(d.reason, 'follow_finish');
});

test('follow: uses bomb when enemy has ≤2 cards', () => {
  const hand = cards([3, 5, 8, 8, 8, 8]);
  const last = parse([14]); // A，只有炸能压（若无更大单）
  // 手中最大单 5 压不过 A；应考虑炸
  const d = makeAIDecision(hand, last, 'farmer', {
    myIndex: 1,
    landlordIndex: 0,
    lastPlayerIndex: 0,
    handCounts: [2, 6, 8],
  });
  assert.equal(d.action, 'play');
  assert.equal(d.parsed.type, HandType.BOMB);
});

// ── 工具 ──

test('isTeammateLastPlay only for farmer vs farmer', () => {
  assert.equal(
    isTeammateLastPlay('farmer', { lastPlayerIndex: 2, landlordIndex: 0 }),
    true
  );
  assert.equal(
    isTeammateLastPlay('farmer', { lastPlayerIndex: 0, landlordIndex: 0 }),
    false
  );
  assert.equal(
    isTeammateLastPlay('landlord', { lastPlayerIndex: 1, landlordIndex: 0 }),
    false
  );
});

test('estimateMinHands empty is 0', () => {
  assert.equal(estimateMinHands([]), 0);
  assert.ok(estimateMinHands(cards([3, 3, 4, 4, 5, 5, 5])) >= 1);
});

test('accepts lastPlayedHand as raw card array', () => {
  const hand = cards([10, 11]);
  const d = makeAIDecision(hand, cards([8]), 'landlord');
  assert.equal(d.action, 'play');
  assert.equal(d.parsed.weight, 10);
});

test('decidePlay bridge returns null on pass', () => {
  const r = decidePlay({
    hand: cards([3, 4]),
    prevHand: parse([15]),
    isLandlord: false,
    myIndex: 1,
    landlordIndex: 0,
    prevPlayer: 0,
    handCounts: [10, 2, 5],
  });
  // may bomb or pass depending - 3,4 can't beat 2
  assert.equal(r, null);
});
