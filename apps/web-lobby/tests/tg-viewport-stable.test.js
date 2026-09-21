import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTelegramViewportHeight } from '../src/net/table-orient.js';

test('resolveTelegramViewportHeight prefers stable over larger innerHeight', () => {
  assert.equal(
    resolveTelegramViewportHeight({
      innerHeight: 844,
      viewportStableHeight: 720,
      viewportHeight: 780,
    }),
    720,
  );
});

test('resolveTelegramViewportHeight falls back to live then inner', () => {
  assert.equal(
    resolveTelegramViewportHeight({
      innerHeight: 844,
      viewportStableHeight: 0,
      viewportHeight: 780,
    }),
    780,
  );
  assert.equal(
    resolveTelegramViewportHeight({
      innerHeight: 844,
      viewportStableHeight: 0,
      viewportHeight: 0,
    }),
    844,
  );
});

test('resolveTelegramViewportHeight floors at minPx', () => {
  assert.equal(
    resolveTelegramViewportHeight({
      innerHeight: 0,
      viewportStableHeight: 0,
      viewportHeight: 0,
      minPx: 240,
    }),
    240,
  );
});
