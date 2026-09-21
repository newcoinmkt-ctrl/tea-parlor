/**
 * play9fin1c — disconnect reconnect back to table
 * Soft park keeps token / MJ snapshot; wall-clock countdown; cache bust.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('cache play9fin4a', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(html, /app\.js\?v=play9fin4a/);
  assert.match(html, /riichi-mahjong\.css\?v=play9fin4a/);
  assert.match(app, /\?v=play9fin4a/);
  assert.doesNotMatch(html, /app\.js\?v=play9mj3/);
});

test('colyseus client exposes parkColyseus + hard leaveColyseus', () => {
  const src = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
  assert.match(src, /export async function parkColyseus/);
  assert.match(src, /room\.leave\(false\)/);
  assert.match(src, /export async function leaveColyseus/);
  assert.match(src, /room\.leave\(true\)/);
  assert.match(src, /clearDdzReconnect/);
  assert.match(src, /table-session\.js/);
});

test('table-session soft park helpers', async () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const mod = await import('../src/net/table-session.js');
  assert.equal(mod.saveDdzReconnect({ uid: 'u1', token: 'r1:tok' }), true);
  assert.equal(mod.peekDdzReconnect('u1')?.token, 'r1:tok');
  assert.equal(mod.peekDdzReconnect('other'), null);
  mod.clearDdzReconnect();
  assert.equal(mod.peekDdzReconnect('u1'), null);

  assert.equal(mod.saveMjSession('classic', {
    mode: 'xuezhan',
    state: { phase: 'discard', current: 0, hands: [[]] },
    turnEndsAt: Date.now() + 5000,
  }), true);
  const mj = mod.peekMjSession('classic', 'xuezhan');
  assert.ok(mj?.state);
  assert.equal(mj.state.phase, 'discard');
  mod.clearMjSession('classic');
  assert.equal(mod.peekMjSession('classic'), null);

  const ends = Date.now() + 2500;
  const left = mod.remainSeconds(ends, 0);
  assert.ok(left >= 2 && left <= 3, `left=${left}`);
});

test('app.js soft-parks mid-hand; settle uses forfeit leave', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(app, /parkColyseus/);
  assert.match(app, /已暂离牌桌/);
  assert.match(app, /已重连回桌/);
  assert.match(app, /armDdzTurnClock/);
  assert.match(app, /showLobby\(\{ forfeit: true \}\)/);
  assert.match(app, /ddzTurnEndsAt/);
});

test('mahjong UI persists + restores session; wall-clock timer', () => {
  const ui = readFileSync(join(root, 'src/games/mahjong/ui.js'), 'utf8');
  assert.match(ui, /persistSoftSession/);
  assert.match(ui, /tryRestoreSession/);
  assert.match(ui, /turnEndsAt/);
  assert.match(ui, /remainSeconds\(turnEndsAt/);
  assert.match(ui, /已重连回桌/);
  assert.match(ui, /table-session\.js/);
});

test('riichi UI persists + restores session; wall-clock timer', () => {
  const ui = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
  assert.match(ui, /persistSoftSession/);
  assert.match(ui, /tryRestoreSession/);
  assert.match(ui, /turnEndsAt/);
  assert.match(ui, /remainSeconds\(turnEndsAt/);
  assert.match(ui, /已重连回桌/);
});

test('ship3b tg-vh preserved (no Math.max with innerHeight)', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  const blob = `${app}\n${orient}`;
  assert.doesNotMatch(blob, /Math\.max\([^)]*innerHeight/);
  assert.doesNotMatch(blob, /Math\.max\([^)]*viewportStableHeight/);
});
