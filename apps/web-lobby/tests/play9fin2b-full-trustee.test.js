/**
 * play9fin2b — 完整托管: tap 托管 → auto play until cancel / leave;
 * stronger than soft-park; survives reconnect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const mj = readFileSync(join(root, 'src/games/mahjong/ui.js'), 'utf8');
const rk = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
const sess = readFileSync(join(root, 'src/net/table-session.js'), 'utf8');
const coly = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');

test('cache play9fin4c', () => {
  assert.match(html, /app\.js\?v=play9fin4c/);
  assert.match(app, /\?v=play9fin4c/);
});

test('multi HUD has 托管 button', () => {
  assert.match(html, /id="mgTrusteeBtn"/);
  assert.match(html, /完整托管|托管/);
});

test('mahjong fullTrustee API + auto on human turn', () => {
  assert.match(mj, /play9fin2b/);
  assert.match(mj, /let fullTrustee = false/);
  assert.match(mj, /toggleFullTrustee/);
  assert.match(mj, /fullTrustee && \(snap\.current === 0|if \(fullTrustee\)/);
  assert.match(mj, /autoTimeoutAct\('full'\)/);
  assert.match(mj, /fullTrustee,/); // persisted
});

test('riichi fullTrustee API + auto on human turn', () => {
  assert.match(rk, /play9fin2b/);
  assert.match(rk, /let fullTrustee = false/);
  assert.match(rk, /toggleFullTrustee/);
  assert.match(rk, /fullTrustee && \(snap\.current === 0/);
  assert.match(rk, /autoTimeoutAct\('full'\)/);
});

test('session persists fullTrustee for MJ + DDZ', () => {
  assert.match(sess, /fullTrustee: !!payload\.fullTrustee|fullTrustee: !!blob\.fullTrustee/);
  assert.match(sess, /fullTrustee: !!blob\.fullTrustee/);
  assert.match(sess, /fullTrustee: !!payload\.fullTrustee/);
});

test('DDZ reconnect restores trustee; park saves flag', () => {
  assert.match(app, /__ddzFullTrustee/);
  assert.match(app, /完整托管中/);
  assert.match(coly, /fullTrustee:/);
  assert.match(app, /multiUI\?\.toggleFullTrustee/);
});

test('softTrustee still distinct (timeout/disconnect)', () => {
  assert.match(mj, /softTrustee/);
  assert.match(mj, /if \(!fullTrustee\) softTrustee = true/);
  assert.match(rk, /if \(!fullTrustee\) softTrustee = true/);
});
