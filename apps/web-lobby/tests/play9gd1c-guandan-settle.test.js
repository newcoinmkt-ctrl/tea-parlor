/**
 * play9fin7c — Guandan rank settle + rematch
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const ui = readFileSync(join(root, 'src/games/guandan/ui.js'), 'utf8');
const gd = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/gdLogic.js'), 'utf8');
const room = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/rooms/GuandanRoom.js'), 'utf8');
const client = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');

test('cache play9fin7c', () => {
  assert.equal(CACHE_STAMP, 'play9fin7c');
  assert.equal(BUILD_VERSION, 'play9fin7c');
  assert.match(html, /app\.js\?v=play9fin7c/);
});

test('settle ranks + non-withdrawable deltas', () => {
  assert.match(gd, /头游/);
  assert.match(gd, /deltas/);
  assert.match(gd, /withdrawable: false/);
  assert.match(gd, /settleHand|completeRanking|_settle/);
  assert.match(ui, /头游/);
  assert.match(ui, /二游/);
  assert.match(ui, /三游/);
  assert.match(ui, /末游/);
  assert.match(ui, /gd-score-3d/);
  assert.match(ui, /play9ui2d/); // settle skin
});

test('rematch same-table', () => {
  assert.match(room, /onMessage\('rematch'/);
  assert.match(gd, /async rematch/);
  assert.match(client, /gdRematch/);
  assert.match(ui, /onRematch/);
});

test('docs/qa play9fin7c', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/README.md')), true);
});
