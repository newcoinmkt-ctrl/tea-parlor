/**
 * play9ui2a — DDZ cruise settle thicken
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
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9ui2a', () => {
  assert.equal(CACHE_STAMP, 'play9ui2a');
  assert.equal(BUILD_VERSION, 'play9ui2a');
  assert.match(html, /app\.js\?v=play9ui2a/);
  assert.match(html, /jj-table\.css\?v=play9ui2a/);
});

test('3D ± score + 总分 + circular 胜 stamp', () => {
  assert.match(css, /--jj-score-gold-1/);
  assert.match(css, /--jj-score-silver-1/);
  assert.match(css, /jj-settle-score\.pos/);
  assert.match(css, /jj-settle-score\.neg/);
  assert.match(css, /perspective\(240px\)/);
  assert.match(css, /#tableView\.is-settle \.jj-win-stamp[\s\S]{0,200}border-radius:\s*50%/);
  assert.match(app, /jj-settle-total/);
  assert.match(app, /jj-win-stamp/);
  assert.match(html, /id="jjSettleSeat0"/);
  assert.match(html, /id="jjSettleSeat1"/);
  assert.match(html, /id="jjSettleSeat2"/);
});

test('top pill progress + multiplier icons', () => {
  assert.match(html, /jj-pill-progress/);
  assert.match(html, /jj-pill-mult/);
  assert.match(html, /id="jjSettleXp"/);
  assert.match(html, /id="jjSettleMult"/);
  assert.match(app, /jj-pill-progress/);
  assert.match(css, /jj-pill-progress/);
  assert.match(css, /jj-settle-topbar/);
});

test('day/night atmosphere CSS vars (no huge bg hard-dep)', () => {
  assert.match(css, /--jj-atm-sky-top/);
  assert.match(css, /jj-atm-night/);
  assert.match(css, /jj-atm-day/);
  assert.match(html, /jj-atm-night/);
  assert.match(html, /data-jj-atm/);
  assert.match(app, /jj-atm-day/);
  assert.match(html, /data-jj-settle="play9ui2a"/);
});

test('再来一局 + 回大厅 preserved', () => {
  assert.match(html, /id="againButton"[^>]*>再来一局</);
  assert.match(html, /id="settleBackButton"[^>]*>回大厅</);
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="ddzResultLobby"[^>]*>回大厅</);
});

test('no whole-page rotate; ship3b tg-vh', () => {
  assert.doesNotMatch(css, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*viewportStableHeight[^)]*innerHeight/);
});

test('no Stars/TON/USDT/withdraw in settle chrome', () => {
  const start = html.indexOf('id="jjSettleHud"');
  const end = html.indexOf('id="ddzResultModal"');
  assert.ok(start >= 0 && end > start);
  const chunk = html.slice(start, end);
  assert.doesNotMatch(chunk, /\bStars\b|\bTON\b|\bUSDT\b|提现|withdraw/i);
});

test('docs/qa play9ui2a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui2a/report.json')), true);
});
