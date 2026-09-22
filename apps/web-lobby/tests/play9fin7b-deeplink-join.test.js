/**
 * play9fin7b — deep-link seat join
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';
import {
  parseTgInviteStartParam,
  validateInviteRoomKey,
  formatInviteJoinError,
} from '../src/net/tg-invite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const coly = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');

test('cache play9fin7b', () => {
  assert.equal(CACHE_STAMP, 'play9fin7b');
  assert.equal(BUILD_VERSION, 'play9fin7b');
  assert.match(html, /app\.js\?v=play9fin7b/);
  assert.match(coly, /play9fin7b/);
});

test('validate + readable join errors', () => {
  assert.equal(validateInviteRoomKey('').ok, false);
  assert.match(validateInviteRoomKey('ab').message || '', /无效|空/);
  assert.match(formatInviteJoinError(new Error('room is full')), /已满/);
  assert.match(formatInviteJoinError(new Error('room not found')), /过期|关闭/);
  assert.match(formatInviteJoinError(new Error('websocket timeout')), /超时|网络/);
});

test('deep link join path: leave-then-join + never blank', () => {
  assert.match(app, /leaveOtherTableForInvite/);
  assert.match(app, /formatInviteJoinError/);
  assert.match(app, /tryConsumeTgInviteDeepLink/);
  assert.match(app, /enterFriendDualGuandan/);
  assert.match(app, /enterFriendDualTable/);
  // documented leave-then-join
  assert.match(app, /leave other table|leaveOtherTableForInvite|已离开原桌/i);
});

test('parse cold/hot startapp → roomKey', () => {
  const a = parseTgInviteStartParam({ start_param: 't_dual_ddz_seatA' });
  assert.equal(a.roomKey, 'dual_ddz_seatA');
  const b = parseTgInviteStartParam({ tgWebAppStartParam: 't_dual_gd_seatB' });
  assert.equal(b.roomKey, 'dual_gd_seatB');
  assert.equal(b.gameId, 'gd');
});

test('docs/qa play9fin7b', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7b/README.md')), true);
  assert.match(readFileSync(join(repo, 'docs/qa/play9fin7b/README.md'), 'utf8'), /leave.?then.?join|离开.*加入/i);
});

test('guandan still in health games list marker', () => {
  assert.match(coly, /['"]guandan['"]/);
});
