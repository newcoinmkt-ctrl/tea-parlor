import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHandMode, canBeatMode } from '../src/jj/laizi-rules.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('online lastPlay is fully parsed (weight/length) so 出牌 can beat it', () => {
  assert.match(app, /onlineLastPlayParsed\(safeLastCards, room\)/);
  const prev = parseHandMode([{ id: '4_1', rank: 4, suit: 1 }], null);
  const next = parseHandMode([{ id: '5_0', rank: 5, suit: 0 }], null);
  assert.equal(canBeatMode(prev, next, null), true);
  // the old bare shape could never be beaten — guard against regressing to it
  assert.equal(canBeatMode({ type: prev.type, cards: prev.cards }, next, null), false);
});
