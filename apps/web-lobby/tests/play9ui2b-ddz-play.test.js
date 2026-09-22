/**
 * play9gd1b — DDZ play controls align
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

test('cache play9gd1b', () => {
  assert.equal(CACHE_STAMP, 'play9gd1b');
  assert.equal(BUILD_VERSION, 'play9gd1b');
  assert.match(html, /app\.js\?v=play9gd1b/);
  assert.match(html, /jj-table\.css\?v=play9gd1b/);
});

test('play bar: 不出 | clock | 提示 | 出牌', () => {
  assert.match(html, /id="playControls"/);
  assert.match(html, /jj-play-bar/);
  assert.match(html, /id="passButton"[^>]*>不出</);
  assert.match(html, /id="hintButton"[^>]*>提示</);
  assert.match(html, /id="playButton"[^>]*>出牌</);
  assert.match(html, /id="turnTimer"/);
  assert.match(html, /jj-play-clock/);
  // clock sits between pass and hint in markup
  const start = html.indexOf('id="playControls"');
  const end = html.indexOf('id="settleControls"', start);
  const chunk = html.slice(start, end > start ? end : start + 1200);
  const iPass = chunk.indexOf('id="passButton"');
  const iClock = chunk.indexOf('id="turnTimer"');
  const iHint = chunk.indexOf('id="hintButton"');
  const iPlay = chunk.indexOf('id="playButton"');
  assert.ok(iPass >= 0 && iClock >= 0 && iHint >= 0 && iPlay >= 0);
  assert.ok(iPass < iClock && iClock < iHint && iHint < iPlay, `order pass=${iPass} clock=${iClock} hint=${iHint} play=${iPlay}`);
  assert.match(css, /\.jj-play-clock/);
  assert.match(css, /jj-btn-gold/);
  assert.match(css, /jj-btn-green/);
});

test('hole cards + 记牌器 + remain badges', () => {
  assert.match(html, /id="bottomCards"/);
  assert.match(html, /aria-label="记牌器 · 王\/2\/A\/K\/Q\/J\/炸"/);
  assert.match(html, /id="remain1"/);
  assert.match(html, /id="remain2"/);
  assert.match(css, /#deckMeter/);
  assert.match(css, /#remain1/);
});

test('speech bubbles + hand fan select', () => {
  assert.match(css, /pass-bubble|seat-pass-bubble|jj-speech-bubble/);
  assert.match(css, /#handArea[\s\S]{0,200}is-selected|#handArea[\s\S]{0,200}\.selected/);
  assert.match(app, /pass-bubble|seat-pass-bubble|不出/);
});

test('no whole-page rotate; ship3b tg-vh', () => {
  assert.doesNotMatch(css, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*viewportStableHeight[^)]*innerHeight/);
});

test('docs/qa play9gd1b present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1b/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1b/report.json')), true);
});
