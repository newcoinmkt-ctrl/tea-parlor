import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeck,
  createCard,
  riffleShuffle,
  unwashedShuffle,
  dealRoundRobin,
} from '../src/card.js';
import { DoudizhuEngine } from '../src/engine.js';

function cardKey(c) {
  return `${c.rank}_${c.suit}`;
}

test('round-robin deal gives 17 each and 3 bottom from 54 unique cards', () => {
  const deck = riffleShuffle(createDeck());
  const { hands, rest } = dealRoundRobin(deck, 3, 17, 0);
  assert.deepEqual(hands.map((h) => h.length), [17, 17, 17]);
  assert.equal(rest.length, 3);
  const all = [...hands[0], ...hands[1], ...hands[2], ...rest];
  assert.equal(all.length, 54);
  assert.equal(new Set(all.map(cardKey)).size, 54);
});

test('round-robin from a known deck interleaves instead of giving 17 consecutive', () => {
  const deck = [];
  for (let i = 0; i < 54; i++) deck.push(createCard(3 + (i % 13), i % 4));
  const { hands } = dealRoundRobin(deck, 3, 17, 0);
  assert.equal(hands[0][0], deck[0]);
  assert.equal(hands[1][0], deck[1]);
  assert.equal(hands[2][0], deck[2]);
  assert.equal(hands[0][1], deck[3]);
  assert.notEqual(hands[0][1], deck[1]);
});

test('unwashed shuffle is not the factory suit-run order', () => {
  const raw = createDeck();
  const mixed = unwashedShuffle(raw);
  assert.equal(mixed.length, 54);
  const samePrefix = raw.slice(0, 12).every((c, i) => cardKey(c) === cardKey(mixed[i]));
  assert.equal(samePrefix, false);
});

test('engine startGame deals 17/17/17 + 3 without duplicate cards', () => {
  const engine = new DoudizhuEngine({ playerNames: ['A', 'B', 'C'] });
  engine.scheduleAI = () => {};
  engine.startGame();
  const keys = [
    ...engine.hands[0],
    ...engine.hands[1],
    ...engine.hands[2],
    ...engine.bottomCards,
  ].map(cardKey);
  assert.equal(keys.length, 54);
  assert.equal(new Set(keys).size, 54);
  engine.destroy();
});
