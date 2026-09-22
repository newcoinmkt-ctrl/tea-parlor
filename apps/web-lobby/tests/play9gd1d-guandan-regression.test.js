/**
 * play9gd1d — Guandan skins + full wave regression
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
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
const coly = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');
const room = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/rooms/GuandanRoom.js'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');
const nn = readFileSync(join(root, 'src/niuniu.css'), 'utf8');
const mj = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');

test('cache play9gd1d', () => {
  assert.equal(CACHE_STAMP, 'play9gd1d');
  assert.equal(BUILD_VERSION, 'play9gd1d');
  assert.match(html, /app\.js\?v=play9gd1d/);
  assert.match(coly, /play9gd1d/);
  assert.match(coly, /['"]guandan['"]/);
});

test('play skin ui2c + settle skin ui2d', () => {
  assert.match(ui, /play9ui2c/);
  assert.match(ui, /play9ui2d/);
  assert.match(ui, /gd-yard/);
  assert.match(ui, /gd-score-3d/);
});

test('soft trustee / reconnect present', () => {
  assert.match(room, /allowReconnection/);
  assert.match(room, /applyTrustee|setFullTrustee/);
  assert.match(room, /TRUSTEE_MS|FORFEIT_MS/);
  assert.match(app, /gdSetTrustee|onTrustee/);
});

test('regression: DDZ/MJ/NN markers; no rotate; ship3b tg-vh; no withdraw', () => {
  assert.match(jj, /jj-play-bar|jj-settle-score|--jj-score-gold/);
  assert.match(nn, /nn-felt|felt/);
  assert.match(mj, /mj-compass|table-stage-mj/);
  assert.doesNotMatch(orient, /transform:\s*rotate\(/);
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\(\s*innerHeight\s*,\s*.*viewportStableHeight/);
  assert.doesNotMatch(app, /startGuanDan[\s\S]{0,400}withdraw/);
});

test('docs/qa play9gd1d + no second engine', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9gd1d/README.md')), true);
  assert.equal(existsSync(join(repo, 'packages/guandan-engine')), true);
  assert.equal(existsSync(join(root, 'src/games/guandan2')), false);
});
