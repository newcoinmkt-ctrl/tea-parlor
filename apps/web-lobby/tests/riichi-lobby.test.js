import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(root, '../index.html'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const css = readFileSync(path.join(root, '../src/riichi-mahjong.css'), 'utf8');
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');

test('lobby keeps single 麻将 icon; adds 日麻 room card', () => {
  assert.match(html, /data-side-game="mahjong"/);
  assert.match(html, /data-mj-mode="riichi"/);
  assert.match(html, />日麻</);
  assert.match(html, /data-mj-variant="tuidaohu"/);
  assert.match(html, /推倒胡/);
  // no second home icon for riichi
  assert.doesNotMatch(html, /data-side-game="riichi"/);
  assert.doesNotMatch(html, /data-game="riichi"/);
  assert.equal((html.match(/icon-mahjong\.png/g) || []).length >= 1, true);
});

test('cache play9mj2 + riichi css', () => {
  assert.match(html, /app\.js\?v=play9mj2/);
  assert.match(html, /riichi-mahjong\.css\?v=play9mj2/);
  assert.match(appSrc, /\?v=play9mj2/);
  assert.doesNotMatch(html, /\?v=play9nn1b/);
});

test('startMahjong routes riichi UI; no USDT/chain on riichi', () => {
  assert.match(appSrc, /createRiichiUI/);
  assert.match(appSrc, /isRiichi/);
  assert.match(appSrc, /mode: 'riichi'/);
  assert.doesNotMatch(appSrc, /riichi.*USDT|USDT.*riichi/i);
});

test('no rotate90; matchMs stays 3000', () => {
  assert.doesNotMatch(css, /rotate\(90deg\)/);
  assert.doesNotMatch(orientSrc, /setProperty\([^)]*rotate\(/);
  const ddzLogic = readFileSync(path.join(root, '../../colyseus-tea-parlor/src/ddzLogic.js'), 'utf8');
  assert.match(ddzLogic, /MATCH_MS_DEFAULT = 3_000/);
});

test('pocket tile assets present', () => {
  const dir = path.join(root, '../public/assets/mahjong-pocket/tiles');
  for (const f of ['wan1.png', 'tiao5.png', 'tong9.png', 'ziDong.png', 'ziZhong.png', 'back.png']) {
    assert.equal(existsSync(path.join(dir, f)), true, f);
  }
  assert.equal(existsSync(path.join(root, '../public/assets/mahjong-pocket/ops/立直.png')), true);
  assert.equal(existsSync(path.join(root, '../public/assets/mahjong-pocket/settle/zimo.png')), true);
});

test('primary room remains 四人麻将 推倒胡', () => {
  assert.match(html, /primary-room"[^>]*data-mj-mode="siren"/);
  assert.match(html, /data-mj-mode="siren"[^>]*data-mj-variant="tuidaohu"/);
});
