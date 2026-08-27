/**
 * 连炸斗地主 · 识别 / 比较 / 倍率 测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCard } from '../src/card.js';
import { parseHand, canBeat, HandType } from '../src/rules.js';
import {
  ChainBombType,
  evaluateChainBomb,
  compareChainBombs,
  canBeatWithChainBomb,
  chainBombMultiplier,
  accumulateBombMultiplier,
  bombEventFromPlay,
  parseHandWithChainBomb,
  canBeatWithChainBombRules,
  isChainBombRank,
} from '../src/chain-bomb.js';

/** ranks 中每个点数生成 4 张 */
function bombOf(rank) {
  return [0, 1, 2, 3].map((s) => createCard(rank, s));
}

function chainOf(...ranks) {
  return ranks.flatMap((r) => bombOf(r));
}

function rocket() {
  return [createCard(16, 4), createCard(17, 4)];
}

// ── 识别 ──

test('evaluateChainBomb: 2-chain 4444+5555', () => {
  const cards = chainOf(4, 5);
  const r = evaluateChainBomb(cards);
  assert.ok(r);
  assert.equal(r.type, ChainBombType.CHAIN_BOMB);
  assert.equal(r.length, 2);
  assert.equal(r.weight, 5);
  assert.deepEqual(r.body, [4, 5]);
  assert.equal(r.cardCount, 8);
  assert.equal(r.multiplierFactor, 4); // 2^2
});

test('evaluateChainBomb: 3-chain 9-10-J', () => {
  const cards = chainOf(9, 10, 11);
  const r = evaluateChainBomb(cards);
  assert.ok(r);
  assert.equal(r.length, 3);
  assert.equal(r.weight, 11);
  assert.deepEqual(r.body, [9, 10, 11]);
  assert.equal(r.multiplierFactor, 8); // 2^3
});

test('evaluateChainBomb: rejects single bomb / non-consecutive / 2 / jokers', () => {
  assert.equal(evaluateChainBomb(bombOf(8)), null);
  assert.equal(evaluateChainBomb(chainOf(3, 5)), null); // 断档
  assert.equal(evaluateChainBomb(chainOf(14, 15)), null); // A+2
  assert.equal(evaluateChainBomb(chainOf(13, 14, 15)), null);
  // 混入王
  const withJoker = [...bombOf(5), ...bombOf(6).slice(0, 3), createCard(16, 4)];
  assert.equal(evaluateChainBomb(withJoker), null);
  // 某点不足 4 张
  assert.equal(evaluateChainBomb([...bombOf(7), createCard(8, 0), createCard(8, 1), createCard(8, 2)]), null);
});

test('evaluateChainBomb: A 结尾合法，2 不合法', () => {
  assert.ok(evaluateChainBomb(chainOf(13, 14))); // K+A
  assert.equal(evaluateChainBomb(chainOf(14, 15)), null);
  assert.equal(isChainBombRank(14), true);
  assert.equal(isChainBombRank(15), false);
  assert.equal(isChainBombRank(16), false);
});

// ── 比较 ──

test('compareChainBombs: longer chain beats shorter', () => {
  const two = evaluateChainBomb(chainOf(3, 4));
  const three = evaluateChainBomb(chainOf(5, 6, 7));
  assert.equal(compareChainBombs(three, two), 1);
  assert.equal(compareChainBombs(two, three), -1);
  assert.equal(canBeatWithChainBomb(two, three), true);
  assert.equal(canBeatWithChainBomb(three, two), false);
});

test('compareChainBombs: same length compares max rank', () => {
  const low = evaluateChainBomb(chainOf(3, 4));
  const high = evaluateChainBomb(chainOf(8, 9));
  assert.equal(compareChainBombs(high, low), 1);
  assert.equal(compareChainBombs(low, high), -1);
  assert.equal(compareChainBombs(low, evaluateChainBomb(chainOf(3, 4))), 0);
});

test('compareChainBombs: rocket beats any chain; chain beats single bomb', () => {
  const chain = evaluateChainBomb(chainOf(10, 11, 12));
  const singleBomb = { type: 'bomb', weight: 15, length: 1 };
  const rk = { type: 'rocket', weight: 17 };

  assert.equal(compareChainBombs(rk, chain), 1);
  assert.equal(compareChainBombs(chain, rk), -1);
  assert.equal(compareChainBombs(chain, singleBomb), 1);
  assert.equal(compareChainBombs(singleBomb, chain), -1);
  assert.equal(canBeatWithChainBomb(chain, rk), true);
});

test('compareChainBombs: two single bombs by weight', () => {
  assert.equal(
    compareChainBombs({ type: 'bomb', weight: 10 }, { type: 'bomb', weight: 8 }),
    1
  );
});

// ── 倍率 ──

test('chainBombMultiplier: normal bomb *2, N-chain 2^N', () => {
  assert.equal(chainBombMultiplier(1), 2);
  assert.equal(chainBombMultiplier(2), 4);
  assert.equal(chainBombMultiplier(3), 8);
  assert.equal(chainBombMultiplier(4), 16);
});

test('chainBombMultiplier: custom linear and customFn', () => {
  assert.equal(chainBombMultiplier(3, { mode: 'linear', base: 2 }), 6);
  assert.equal(
    chainBombMultiplier(3, { customFn: (n) => 10 * n }),
    30
  );
});

test('accumulateBombMultiplier: mixes bomb + chain + rocket', () => {
  const { totalFactor, details } = accumulateBombMultiplier([
    { type: 'bomb' },           // *2
    { type: 'chain_bomb', length: 2 }, // *4
    { type: 'rocket' },         // *2
  ]);
  assert.equal(totalFactor, 2 * 4 * 2);
  assert.equal(details.length, 3);
});

test('bombEventFromPlay extracts chain from cards', () => {
  const cards = chainOf(6, 7);
  const ev = bombEventFromPlay({ type: 'unknown', cards });
  assert.equal(ev.type, ChainBombType.CHAIN_BOMB);
  assert.equal(ev.length, 2);
});

// ── 与经典引擎集成 ──

test('parseHandWithChainBomb prefers chain over classic invalid', () => {
  const cards = chainOf(4, 5);
  // 经典 parseHand 会把 8 张当非法（或四带两对等）
  const classic = parseHand(cards);
  // 8 张两个四张 → 经典里可能是 invalid null，或四带两对不匹配
  const withChain = parseHandWithChainBomb(cards, parseHand);
  assert.equal(withChain.type, ChainBombType.CHAIN_BOMB);
  assert.equal(withChain.length, 2);
});

test('canBeatWithChainBombRules: rocket > chain > bomb > single', () => {
  const chain = parseHandWithChainBomb(chainOf(3, 4), parseHand);
  const bomb = parseHand(bombOf(15));
  const single = parseHand([createCard(14, 0)]);
  const rk = parseHand(rocket());

  assert.equal(canBeatWithChainBombRules(single, bomb, canBeat), true);
  assert.equal(canBeatWithChainBombRules(bomb, chain, canBeat), true);
  assert.equal(canBeatWithChainBombRules(chain, rk, canBeat), true);
  assert.equal(canBeatWithChainBombRules(rk, chain, canBeat), false);
  assert.equal(canBeatWithChainBombRules(chain, bomb, canBeat), false);

  // 同型非炸仍走经典
  assert.equal(
    canBeatWithChainBombRules(
      parseHand([createCard(5, 0)]),
      parseHand([createCard(8, 0)]),
      canBeat
    ),
    true
  );
});

test('settlement-style: bombCount from chain uses 2^N not N', () => {
  // 一局打出：普通炸 + 2连炸 → 倍率 2 * 4 = 8
  const plays = [
    { type: HandType.BOMB, length: 1 },
    evaluateChainBomb(chainOf(8, 9)),
  ];
  const events = plays.map((p) => bombEventFromPlay(p)).filter(Boolean);
  const { totalFactor } = accumulateBombMultiplier(events);
  assert.equal(totalFactor, 8);
});
