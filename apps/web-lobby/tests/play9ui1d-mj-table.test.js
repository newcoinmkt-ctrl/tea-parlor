/**
 * play9fin7a — Mahjong JJ table layout guards
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
const css = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9fin7a', () => {
  assert.equal(CACHE_STAMP, 'play9fin7a');
  assert.equal(BUILD_VERSION, 'play9fin7a');
  assert.match(html, /app\.js\?v=play9fin7a/);
  assert.match(html, /jj-mahjong\.css\?v=play9fin7a/);
});

test('compass 东南西北 + countdown + four walls', () => {
  assert.match(html, /class="mj-compass"/);
  assert.match(html, />东</);
  assert.match(html, />南</);
  assert.match(html, />西</);
  assert.match(html, />北</);
  assert.match(html, /id="mjCountdown"/);
  assert.match(html, /mj-wall-n/);
  assert.match(html, /mj-wall-s/);
  assert.match(html, /mj-wall-e/);
  assert.match(html, /mj-wall-w/);
  assert.match(css, /mj-compass|#mjCountdown/);
});

test('推倒胡 + 日麻 entries both present (not split icons)', () => {
  assert.match(html, /data-mj-variant="tuidaohu"|推倒胡/);
  assert.match(html, /data-mj-mode="riichi"|日麻/);
  assert.match(html, /推倒胡 \/ 日麻|推倒胡默认 · 可切日麻/);
});

test('letterbox no rotate; tg-vh preserved', () => {
  assert.doesNotMatch(css, /#multiGameView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.match(css, /play9fin7a|table-stage-land-target/);
});

test('docs/qa play9fin7a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7a/report.json')), true);
});
