/**
 * play9gd1d — Guandan playable rules + level HUD
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
const gdLogic = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/gdLogic.js'), 'utf8');
const coly = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');

test('cache play9gd1d', () => {
  assert.equal(CACHE_STAMP, 'play9gd1d');
  assert.equal(BUILD_VERSION, 'play9gd1d');
  assert.match(html, /app\.js\?v=play9gd1d/);
  assert.match(coly, /play9gd1d/);
});

test('server validates hand types via guandan-engine', () => {
  assert.match(gdLogic, /bestGuanDanHand/);
  assert.match(gdLogic, /canSuppress/);
  assert.match(gdLogic, /SUPPORTED_HAND_TYPES/);
  assert.match(gdLogic, /单张/);
  assert.match(gdLogic, /天王炸/);
  assert.match(gdLogic, /invalid_hand|cannot_beat/);
});

test('级牌 HUD uses server currentRank', () => {
  assert.match(ui, /currentRank/);
  assert.match(ui, /data-gd-level/);
  assert.match(ui, /applyServerSnap/);
  assert.match(ui, /play9gd1d/);
});

test('ui2c 四炸 / 理牌 display-only preserved', () => {
  assert.match(ui, /四炸|「四炸」/);
  assert.match(ui, /一键理牌|arrangeMode/);
  assert.match(ui, /gd-yard/);
});

test('docs/qa play9gd1d present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1d/README.md')), true);
  assert.equal(existsSync(join(repo, 'packages/guandan-engine')), true);
});
