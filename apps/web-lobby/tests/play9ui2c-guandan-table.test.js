/**
 * play9gd1d — Guandan 4-seat yard table shell
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
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9gd1d', () => {
  assert.equal(CACHE_STAMP, 'play9gd1d');
  assert.equal(BUILD_VERSION, 'play9gd1d');
  assert.match(html, /app\.js\?v=play9gd1d/);
});

test('existing Guandan module only — no new engine package', () => {
  assert.equal(existsSync(join(root, 'src/games/guandan/ui.js')), true);
  assert.equal(existsSync(join(root, 'src/games/guandan/engine.js')), true);
  assert.equal(existsSync(join(repo, 'packages/guandan-engine')), true);
  // must not invent a second engine path
  assert.equal(existsSync(join(root, 'src/games/guandan2')), false);
  assert.equal(existsSync(join(root, 'src/games/guandan-new')), false);
});

test('4-seat diamond + avatar/chip/remain chrome', () => {
  assert.match(html, /data-mg-seat="0"/);
  assert.match(html, /data-mg-seat="1"/);
  assert.match(html, /data-mg-seat="2"/);
  assert.match(html, /data-mg-seat="3"/);
  assert.match(ui, /gd-active/);
  assert.match(ui, /gd-4p/);
  assert.match(ui, /gd-yard/);
  assert.match(ui, /play9gd1d/);
  assert.match(css, /data-mg-seat="1"/);
  assert.match(css, /data-mg-seat="2"/);
  assert.match(css, /data-mg-seat="3"/);
  assert.match(css, /data-mg-seat="0"/);
  assert.match(css, /\.gd-gold/);
  assert.match(css, /\.mg-count/);
});

test('级牌 + 记牌器 HUD; 恢复 + 一键理牌; suit filters', () => {
  assert.match(ui, /gd-level-chip/);
  assert.match(ui, /级牌/);
  assert.match(ui, /gd-remain-meter|data-gd-meter/);
  assert.match(ui, /data-gd-restore/);
  assert.match(ui, /data-gd-sort/);
  assert.match(ui, /恢复/);
  assert.match(ui, /一键理牌/);
  assert.match(ui, /data-gd-suit/);
  assert.match(css, /gd-level-chip/);
  assert.match(css, /gd-remain-meter/);
  assert.match(css, /gd-tool-restore/);
  assert.match(css, /gd-tool-sort/);
});

test('vertical bomb stacks with 「四炸」', () => {
  assert.match(ui, /「四炸」|四炸/);
  assert.match(ui, /gd-bomb-tag/);
  assert.match(css, /gd-bomb-tag/);
  assert.match(ui, /gd-col/);
});

test('letterbox landscape; no page rotate; ship3b tg-vh', () => {
  assert.match(ui, /table-stage-gd/);
  assert.doesNotMatch(css, /#multiGameView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
});

test('docs/qa play9gd1d present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1d/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1d/report.json')), true);
});
