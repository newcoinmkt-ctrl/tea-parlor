import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MATCH_MS, MATCH_MS_MAX, SEAT_COUNT } from '../src/games/niuniu/engine.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(root, '../index.html'), 'utf8');
const appSrc = readFileSync(path.join(root, '../src/app.js'), 'utf8');
const orientSrc = readFileSync(path.join(root, '../src/net/table-orient.js'), 'utf8');
const css = readFileSync(path.join(root, '../src/niuniu.css'), 'utf8');
const colyseus = readFileSync(path.join(root, '../../colyseus-tea-parlor/src/index.js'), 'utf8');

test('lobby grid lists 牛牛 beside DDZ/麻将 without breaking existing games', () => {
  assert.match(html, /data-side-game="niuniu"/);
  assert.match(html, /data-game="niuniu"/);
  assert.match(html, /data-room-game="niuniu"/);
  assert.match(html, /data-game-room="niuniu"/);
  assert.match(html, /data-nn="novice"/);
  assert.match(html, /看牌抢庄/);
  assert.match(html, /底分<\/em><b>5<\/b>/);
  assert.match(html, /data-side-game="doudizhu"/);
  assert.match(html, /data-side-game="mahjong"/);
  assert.match(html, /data-game="zhajinhua"/);
  assert.match(html, /data-game="blackjack"/);
  assert.match(appSrc, /function startNiuniu/);
  assert.match(appSrc, /NIUNIU_TABLES/);
  assert.match(appSrc, /createNiuniuUI/);
  assert.doesNotMatch(html, /data-game-room="niuniu"[^>]*data-currency="crypto"/);
});

test('cache play9mj2 + niuniu.css', () => {
  assert.match(html, /app\.js\?v=play9mj2/);
  assert.match(html, /niuniu\.css\?v=play9mj2/);
  assert.match(appSrc, /\?v=play9mj2/);
  assert.doesNotMatch(html, /\?v=play9ship1/);
});

test('no rotate(90deg) on table/multi; nn hook uses letterbox/upright', () => {
  assert.doesNotMatch(orientSrc, /setProperty\([^)]*rotate\(/);
  assert.doesNotMatch(css, /rotate\(90deg\)/);
  assert.match(orientSrc, /isNnTableActive/);
  assert.match(orientSrc, /nnWant/);
  assert.match(css, /transform: none !important/);
  assert.match(appSrc, /nn-active/);
});

test('matchMs stays 3000; nn MATCH_MS ≤ 3s; 6 seats', () => {
  assert.equal(MATCH_MS, 3000);
  assert.equal(MATCH_MS_MAX, 3000);
  assert.equal(SEAT_COUNT, 6);
  assert.match(appSrc, /MATCH_MS/);
  const ddzLogic = readFileSync(path.join(root, '../../colyseus-tea-parlor/src/ddzLogic.js'), 'utf8');
  assert.match(ddzLogic, /MATCH_MS_DEFAULT = 3_000/);
});

test('niu0–niu17 stamps copied', () => {
  const dir = path.join(root, '../public/assets/niuniu/niu');
  for (let i = 0; i <= 17; i++) {
    assert.equal(existsSync(path.join(dir, `niu${i}.png`)), true, `niu${i}.png`);
  }
  assert.equal(existsSync(path.join(root, '../public/assets/home/icon-niuniu.png')), true);
});

test('colyseus /health lists niuniu without requiring NnRoom', () => {
  assert.match(colyseus, /games: \['doudizhu', 'niuniu'\]/);
  assert.match(colyseus, /no NnRoom/);
  assert.match(colyseus, /gameServer\.define\('doudizhu'/);
  assert.doesNotMatch(colyseus, /define\('niuniu'/);
});

test('play9nn1b harden: nn kills landscape mg-table grid + footer; dock tappable', () => {
  assert.match(css, /#multiGameView\.nn-active \.mg-table/);
  assert.match(css, /grid-template-columns: none !important/);
  assert.match(css, /\.nn-active \.mg-footer/);
  assert.match(css, /pointer-events: none !important/);
  assert.match(css, /#nnActions/);
  assert.match(css, /touch-action: manipulation/);
});

test('play9nn1b: rooms claim copy + multi-only shell class', () => {
  assert.match(appSrc, /gameType === 'niuniu'/);
  assert.match(appSrc, /牛牛 · 看牌抢庄/);
  assert.match(readFileSync(path.join(root, '../src/games/niuniu/ui.js'), 'utf8'), /classList\.add\('multi-active'\)/);
  assert.match(readFileSync(path.join(root, '../src/games/niuniu/ui.js'), 'utf8'), /pointerup/);
});
