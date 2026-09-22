/**
 * play9gd1c — DDZ JJ table: bid bar + autoplay hint + layout guards
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

test('cache play9gd1c', () => {
  assert.equal(CACHE_STAMP, 'play9gd1c');
  assert.equal(BUILD_VERSION, 'play9gd1c');
  assert.match(html, /app\.js\?v=play9gd1c/);
  assert.match(html, /jj-table\.css\?v=play9gd1c/);
});

test('bid bar: 不叫 + countdown + 1/2/3', () => {
  assert.match(html, /id="bidControls"[^>]*jj-bid-bar/);
  assert.match(html, /data-bid="0"[^>]*>不叫</);
  assert.match(html, /id="bidTimer"/);
  assert.match(html, /data-bid="1"[^>]*>1</);
  assert.match(html, /data-bid="2"[^>]*>2</);
  assert.match(html, /data-bid="3"[^>]*>3</);
  assert.match(css, /jj-bid-bar|jj-bid-clock|#bidTimer/);
});

test('autoplay hint 自动出牌中', () => {
  assert.match(html, /id="ddzAutoplayHint"[^>]*>自动出牌中</);
  assert.match(app, /ddzAutoplayHint/);
  assert.match(app, /自动出牌中/);
  assert.match(css, /jj-autoplay-hint|#ddzAutoplayHint/);
});

test('记牌器 ranks + landlord cards + remain chips present', () => {
  assert.match(html, /aria-label="记牌器 · 王\/2\/A\/K\/Q\/J\/炸"/);
  assert.match(html, /id="bottomCards"/);
  assert.match(html, /id="remain1"/);
  assert.match(html, /id="remain2"/);
});

test('no whole-page rotate; ship3b tg-vh', () => {
  assert.doesNotMatch(css, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*viewportStableHeight[^)]*innerHeight/);
});

test('no Stars/TON/USDT/withdraw in DDZ table chrome', () => {
  const tableChunk = html.slice(html.indexOf('id="tableView"'), html.indexOf('id="jjSettleHud"'));
  assert.doesNotMatch(tableChunk, /\bStars\b|\bTON\b|\bUSDT\b|提现|withdraw/i);
});

test('docs/qa play9gd1c present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1c/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1c/report.json')), true);
});
