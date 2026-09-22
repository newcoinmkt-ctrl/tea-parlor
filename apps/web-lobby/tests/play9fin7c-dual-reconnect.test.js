/**
 * play9fin7c — dual session + reconnect
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const colyClient = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
const coly = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');

test('cache play9fin7c', () => {
  assert.equal(CACHE_STAMP, 'play9fin7c');
  assert.equal(BUILD_VERSION, 'play9fin7c');
  assert.match(html, /app\.js\?v=play9fin7c/);
  assert.match(coly, /play9fin7c/);
});

test('reconnect only when roomKey matches', () => {
  assert.match(colyClient, /want && had && want !== had/);
  assert.match(colyClient, /roomKey: options\.roomKey/);
  assert.match(colyClient, /tea-parlor-gd-reconnect/);
});

test('invite dual paths preserved', () => {
  assert.match(app, /enterFriendDualTable/);
  assert.match(app, /enterFriendDualGuandan/);
  assert.match(app, /leaveOtherTableForInvite/);
  assert.match(app, /emitInviteFriend/);
});

test('dual-session smoke PASS incl. gd + reconnect', () => {
  const smoke = join(repo, 'apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs');
  assert.equal(existsSync(smoke), true);
  const r = spawnSync(process.execPath, [smoke], { encoding: 'utf8', timeout: 25000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout || '', /PASS/);
  assert.match(r.stdout || '', /gd two clients same room/);
  assert.match(r.stdout || '', /ddz reconnect same seat/);
  assert.match(r.stdout || '', /gd reconnect same seat/);
});

test('docs/qa play9fin7c', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/README.md')), true);
  assert.match(readFileSync(join(repo, 'docs/qa/play9fin7c/README.md'), 'utf8'), /reconnect|同桌/i);
});

test('guandan in health games', () => {
  assert.match(coly, /['"]guandan['"]/);
});
