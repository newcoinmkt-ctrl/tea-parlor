/**
 * play9fin1c — two TG / dual-session same table (DDZ + Mahjong)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const colRoot = join(root, '../colyseus-tea-parlor');

test('cache play9fin7b', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(html, /app\.js\?v=play9fin7b/);
  assert.match(app, /\?v=play9fin7b/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin1a/);
});

test('colyseus client exposes dual MJ session + makeDualRoomKey', () => {
  const src = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
  assert.match(src, /export async function startColyseusMjSession/);
  assert.match(src, /joinOrCreate\('mahjong'/);
  assert.match(src, /export function makeDualRoomKey/);
  assert.match(src, /dual_/);
});

test('app wires friend dual enter + dualRoomKey to startRoomOnline', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(app, /ensureDualRoomKey/);
  assert.match(app, /enterFriendDualTable/);
  assert.match(app, /dualRoomKey/);
  assert.match(app, /ddzFriendEnter/);
  assert.match(app, /bindFriendDualEnter/);
});

test('colyseus server registers mahjong room + friend dual match', () => {
  const idx = readFileSync(join(colRoot, 'src/index.js'), 'utf8');
  const ddz = readFileSync(join(colRoot, 'src/ddzLogic.js'), 'utf8');
  assert.match(idx, /define\('mahjong'/);
  assert.match(idx, /MahjongRoom/);
  assert.match(ddz, /FRIEND_MATCH_MS/);
  assert.match(ddz, /DUAL_MIN_HUMANS/);
  assert.match(ddz, /minHumansBeforeAi/);
});

test('ship3b tg-vh preserved', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  const blob = `${app}\n${orient}`;
  assert.doesNotMatch(blob, /Math\.max\([^)]*innerHeight/);
  assert.doesNotMatch(blob, /Math\.max\([^)]*viewportStableHeight/);
});
