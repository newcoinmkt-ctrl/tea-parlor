/**
 * play9fin7a — unify invite export (DDZ + Guandan)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';
import {
  buildInvitePayload,
  buildTgInviteUrl,
  parseTgInviteStartParam,
} from '../src/net/tg-invite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const invite = readFileSync(join(root, 'src/net/tg-invite.js'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
const coly = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');

test('cache play9fin7a', () => {
  assert.equal(CACHE_STAMP, 'play9fin7a');
  assert.equal(BUILD_VERSION, 'play9fin7a');
  assert.match(html, /app\.js\?v=play9fin7a/);
  assert.match(coly, /play9fin7a/);
});

test('unified 邀请好友 exits: DDZ in-play + settle + room-select', () => {
  assert.match(html, /id="ddzTableInvite"/);
  assert.match(html, /id="ddzResultInvite"/);
  assert.match(html, /id="ddzRoomInvite"/);
  assert.match(html, /邀请好友/);
});

test('unified 邀请好友 exits: Guandan in-play + settle + room-select', () => {
  assert.match(html, /id="mgTableInvite"/);
  assert.match(html, /id="mgSettleInvite"|id="mgResultInvite"/);
  assert.match(html, /id="gdRoomInvite"/);
});

test('payload roomKey + gameId; DDZ and Guandan emit wired', () => {
  const ddz = buildInvitePayload({ roomKey: 'dual_ddz_fin7a', gameId: 'ddz' });
  assert.equal(ddz.gameId, 'ddz');
  assert.match(ddz.url, /startapp=t_dual_ddz_fin7a/);
  const gd = buildInvitePayload({ roomKey: 'dual_gd_fin7a', gameId: 'gd' });
  assert.equal(gd.gameId, 'gd');
  assert.match(buildTgInviteUrl(gd.roomKey), /t_dual_gd_fin7a/);
  assert.match(app, /emitInviteFriend/);
  assert.match(app, /buildInvitePayload/);
  assert.match(app, /bindUnifiedInviteExits/);
  assert.match(app, /enterFriendDualGuandan/);
  assert.match(invite, /buildInvitePayload/);
});

test('deep link parse preserves gd gameId', () => {
  const p = parseTgInviteStartParam({ start_param: 't_dual_gd_seat1' });
  assert.equal(p.roomKey, 'dual_gd_seat1');
  assert.equal(p.gameId, 'gd');
});

test('constraints: letterbox / tg-vh / no withdraw / guandan health', () => {
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /transform:\s*rotate\(/);
  assert.doesNotMatch(app, /Telegram Stars pay|chain.?withdraw|提现入口/);
  assert.match(coly, /['"]guandan['"]/);
  assert.match(html, /data-side-game="guandan"|data-game="guandan"/);
});

test('docs/qa play9fin7a', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7a/README.md')), true);
});
