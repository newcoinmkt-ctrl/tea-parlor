import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fisherYates,
  riffleShuffle,
  unwashedShuffle,
  dealRoundRobin,
} from '../src/shared/deal.js';

test('fisherYates keeps length and membership', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = fisherYates(src, () => 0.3);
  assert.equal(out.length, 9);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
});

test('dealRoundRobin deals one-by-one from start seat', () => {
  const deck = Array.from({ length: 12 }, (_, i) => i);
  const { hands, rest } = dealRoundRobin(deck, 3, 3, 1);
  assert.deepEqual(hands, [
    [2, 5, 8],
    [0, 3, 6],
    [1, 4, 7],
  ]);
  assert.deepEqual(rest, [9, 10, 11]);
});

test('unwashedShuffle changes order of a sequential deck', () => {
  const src = Array.from({ length: 54 }, (_, i) => i);
  const out = unwashedShuffle(src);
  assert.equal(out.length, 54);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
  const identical = src.every((v, i) => v === out[i]);
  assert.equal(identical, false);
});

test('riffleShuffle is a permutation', () => {
  const src = Array.from({ length: 52 }, (_, i) => i);
  const out = riffleShuffle(src);
  assert.equal(out.length, 52);
  assert.deepEqual([...out].sort((a, b) => a - b), src);
});
