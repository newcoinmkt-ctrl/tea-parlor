/**
 * play9fin3a — Colyseus authoritative trustee client wiring
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const coly = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
const repo = join(root, '../..');
const ddz = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/ddzLogic.js'), 'utf8');
const room = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/rooms/DoudizhuRoom.js'), 'utf8');
const mj = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/mjLogic.js'), 'utf8');
const mjRoom = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/rooms/MahjongRoom.js'), 'utf8');

test('cache play9fin5b', () => {
  assert.match(html, /app\.js\?v=play9fin5b/);
  assert.match(app, /\?v=play9fin5b/);
});

test('server setFullTrustee + reconnect preserves fullTrustee', () => {
  assert.match(ddz, /setFullTrustee/);
  assert.match(ddz, /play9fin3a/);
  assert.match(ddz, /fullTrustee/);
  assert.match(ddz, /myFullTrustee/);
  assert.match(ddz, /voluntary fullTrustee/);
});

test('Colyseus rooms handle trustee message', () => {
  assert.match(room, /onMessage\('trustee'/);
  assert.match(room, /setFullTrustee/);
  assert.match(mjRoom, /onMessage\('trustee'/);
  assert.match(mj, /setFullTrustee/);
  assert.match(mj, /seat\.kind === 'ai' \|\| seat\.trustee/);
});

test('client ddzSetTrustee / mjSetTrustee send trustee', () => {
  assert.match(coly, /export async function ddzSetTrustee/);
  assert.match(coly, /r\.send\('trustee'/);
  assert.match(coly, /export async function mjSetTrustee/);
});

test('online toggle sends server trustee; no client auto-play online', () => {
  assert.match(app, /ddzSetTrustee/);
  assert.match(app, /forbid pure client auto-play|联网局：AI\/托管在 Colyseus/);
  assert.match(app, /if \(game\.online\) return/);
  assert.match(app, /sync trustee UI from server/);
  assert.match(app, /re-assert server fullTrustee after reconnect/);
});

test('preserve --tg-vh (ship3b)', () => {
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight/);
});
