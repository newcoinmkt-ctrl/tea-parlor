/**
 * play9ui2d — Guandan settle + full wave regression
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
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const ui = readFileSync(join(root, 'src/games/guandan/ui.js'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');
const nn = readFileSync(join(root, 'src/niuniu.css'), 'utf8');
const mj = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9ui2d', () => {
  assert.equal(CACHE_STAMP, 'play9ui2d');
  assert.equal(BUILD_VERSION, 'play9ui2d');
  assert.match(html, /app\.js\?v=play9ui2d/);
});

test('Guandan settle: 头游..末游 + 3D scores + 再来一局', () => {
  assert.match(ui, /头游/);
  assert.match(ui, /二游/);
  assert.match(ui, /三游/);
  assert.match(ui, /末游/);
  assert.match(ui, /gd-score-3d/);
  assert.match(ui, /再来一局/);
  assert.match(css, /gd-score-3d/);
  assert.match(css, /\.gd-place\.p0/);
  assert.match(html, /id="mgAgainBtn"[^>]*>再来一局</);
  assert.match(html, /id="mgLobbyBtn"[^>]*>回大厅</);
});

test('连胜/活跃 placeholder chips', () => {
  assert.match(ui, /gd-streak-chip/);
  assert.match(ui, /连胜/);
  assert.match(ui, /gd-active-chip/);
  assert.match(ui, /活跃/);
  assert.match(css, /gd-streak-chip/);
  assert.match(css, /gd-active-chip/);
});

test('regression: DDZ ui2a settle + ui2b play bar', () => {
  assert.match(jj, /--jj-score-gold-1|jj-settle-score/);
  assert.match(jj, /jj-play-clock|jj-play-bar/);
  assert.match(html, /jj-play-bar|jj-play-clock/);
  assert.match(html, /id="passButton"[^>]*>不出</);
  assert.match(html, /id="hintButton"[^>]*>提示</);
  assert.match(html, /id="playButton"[^>]*>出牌</);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2b/README.md')), true);
});

test('regression: Guandan ui2c shell + no new engine', () => {
  assert.match(ui, /gd-yard/);
  assert.match(ui, /「四炸」|四炸/);
  assert.match(ui, /一键理牌/);
  assert.equal(existsSync(join(root, 'src/games/guandan/engine.js')), true);
  assert.equal(existsSync(join(repo, 'packages/guandan-engine')), true);
  assert.equal(existsSync(join(root, 'src/games/guandan2')), false);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2c/README.md')), true);
});

test('regression: NN green felt ui1c + MJ ui1d/e patterns', () => {
  assert.match(nn, /nn-felt|green-felt|felt/);
  assert.match(mj, /mj-compass|mj-wall|table-stage-mj/);
  assert.match(mj, /mj-hu-settle|胡/);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1c/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1d/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1e/README.md')), true);
});

test('no chain / Stars / TON / USDT / withdraw; no page rotate; ship3b tg-vh', () => {
  assert.doesNotMatch(ui, /\bStars\b|\bTON\b|\bUSDT\b|提现|withdraw/i);
  assert.doesNotMatch(jj, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.doesNotMatch(css, /#multiGameView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*viewportStableHeight[^)]*innerHeight/);
  // ad logo slots still present
  assert.match(html, /brand-slot|data-ad-slot/);
});

test('docs/qa play9ui2d present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2d/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2d/report.json')), true);
});
