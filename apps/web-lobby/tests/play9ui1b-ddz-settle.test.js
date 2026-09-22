/**
 * play9fin7c — DDZ JJ settle triangle + 再来一局/回大厅
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
const css = readFileSync(join(root, 'src/jj-table.css'), 'utf8');

test('cache play9fin7c', () => {
  assert.equal(CACHE_STAMP, 'play9fin7c');
  assert.equal(BUILD_VERSION, 'play9fin7c');
  assert.match(html, /app\.js\?v=play9fin7c/);
});

test('JJ settle HUD triangle seats + score/total/stamp', () => {
  assert.match(html, /id="jjSettleHud"/);
  assert.match(html, /id="jjSettleSeat0"/);
  assert.match(html, /id="jjSettleSeat1"/);
  assert.match(html, /id="jjSettleSeat2"/);
  assert.match(app, /renderJjSettleHud/);
  assert.match(app, /jj-settle-total/);
  assert.match(app, /jj-win-stamp/);
  assert.match(app, /jj-lose-stamp|loseStamp/);
  assert.match(css, /jj-settle-score/);
  assert.match(css, /jj-win-stamp/);
});

test('再来一局 + 回大厅 preserved on settle', () => {
  assert.match(html, /id="againButton"[^>]*>再来一局</);
  assert.match(html, /id="settleBackButton"[^>]*>回大厅</);
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="ddzResultLobby"[^>]*>回大厅</);
  assert.match(css, /#settleControls/);
});

test('docs/qa play9fin7c present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/report.json')), true);
});
