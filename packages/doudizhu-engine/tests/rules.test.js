import test from 'node:test';
import assert from 'node:assert/strict';

import { createCard } from '../src/card.js';
import {
  canBeat,
  findBeatingHands,
  getHint,
  HandType,
  parseHand,
} from '../src/rules.js';

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

test('parses core JJ doudizhu hand types', () => {
  assert.equal(parse([3]).type, HandType.SINGLE);
  assert.equal(parse([8, 8]).type, HandType.PAIR);
  assert.equal(parse([7, 7, 7]).type, HandType.TRIPLE);
  assert.equal(parse([3, 3, 3, 6]).type, HandType.TRIPLE_ONE);
  assert.equal(parse([4, 4, 4, 9, 9]).type, HandType.TRIPLE_PAIR);
  assert.equal(parse([3, 4, 5, 6, 7]).type, HandType.STRAIGHT);
  assert.equal(parse([7, 7, 8, 8, 9, 9]).type, HandType.PAIR_STRAIGHT);
  assert.equal(parse([5, 5, 5, 6, 6, 6]).type, HandType.PLANE);
  assert.equal(parse([4, 4, 4, 5, 5, 5, 7, 9]).type, HandType.PLANE_ONE);
  assert.equal(parse([3, 3, 3, 4, 4, 4, 7, 7, 9, 9]).type, HandType.PLANE_PAIR);
  assert.equal(parse([5, 5, 5, 5, 3, 8]).type, HandType.FOUR_TWO);
  assert.equal(parse([4, 4, 4, 4, 5, 5, 7, 7]).type, HandType.FOUR_PAIR);
  assert.equal(parse([10, 10, 10, 10]).type, HandType.BOMB);
  assert.equal(parse([16, 17]).type, HandType.ROCKET);
});

test('rejects straights and connected pairs containing 2 or jokers', () => {
  assert.equal(parse([10, 11, 12, 13, 14, 15]), null);
  assert.equal(parse([12, 13, 14, 15, 16]), null);
  assert.equal(parse([13, 13, 14, 14, 15, 15]), null);
});

test('rejects planes containing 2 or jokers in the body', () => {
  assert.equal(parse([13, 13, 13, 14, 14, 14, 15, 15, 15]), null);
  assert.equal(parse([14, 14, 14, 15, 15, 15, 3, 4]), null);
  assert.equal(parse([14, 14, 14, 16, 16, 16]), null);
});

test('rejects malformed wing and four-with-two shapes', () => {
  assert.equal(parse([3, 3, 3, 4, 4, 4, 7]), null);
  assert.equal(parse([3, 3, 3, 4, 4, 4, 7, 7, 8]), null);
  assert.equal(parse([5, 5, 5, 5, 6]), null);
  assert.equal(parse([4, 4, 4, 4, 5, 5, 6, 7]), null);
  assert.equal(parse([8, 8, 8, 8, 16, 17]), null);
});

test('compares hands using same type, bombs, and rocket rules', () => {
  assert.equal(canBeat(parse([8]), parse([9])), true);
  assert.equal(canBeat(parse([9]), parse([8])), false);
  assert.equal(canBeat(parse([6, 6]), parse([7, 7])), true);
  assert.equal(canBeat(parse([3, 4, 5, 6, 7]), parse([4, 5, 6, 7, 8])), true);
  assert.equal(canBeat(parse([3, 4, 5, 6, 7]), parse([4, 5, 6, 7, 8, 9])), false);
  assert.equal(canBeat(parse([14, 14]), parse([6, 6, 6, 6])), true);
  assert.equal(canBeat(parse([10, 10, 10, 10]), parse([16, 17])), true);
  assert.equal(canBeat(parse([16, 17]), parse([15, 15, 15, 15])), false);
  assert.equal(canBeat(parse([16, 17]), parse([16, 17])), false);
});

test('only same type and same main length can beat regular hands', () => {
  assert.equal(canBeat(parse([3, 3, 3]), parse([4, 4, 4, 7])), false);
  assert.equal(canBeat(parse([3, 4, 5, 6, 7]), parse([4, 5, 6, 7, 8, 9])), false);
  assert.equal(
    canBeat(
      parse([3, 3, 4, 4, 5, 5]),
      parse([4, 4, 5, 5, 6, 6])
    ),
    true
  );
  assert.equal(
    canBeat(
      parse([3, 3, 3, 4, 4, 4, 7, 8]),
      parse([4, 4, 4, 5, 5, 5, 7, 8])
    ),
    true
  );
});

test('finds legal beating hands and hints without using bombs first', () => {
  const hand = cards([3, 4, 4, 5, 5, 5, 9, 9, 9, 9, 16, 17]);
  const options = findBeatingHands(hand, parse([8, 8]));
  assert.equal(options.some((item) => item.type === HandType.BOMB), true);
  assert.equal(options.some((item) => item.type === HandType.ROCKET), true);
  assert.equal(options.some((item) => item.type === HandType.PAIR && item.weight === 9), true);

  const hint = getHint(hand, parse([8, 8]));
  assert.equal(hint.type, HandType.PAIR);
  assert.equal(hint.weight, 9);
});
