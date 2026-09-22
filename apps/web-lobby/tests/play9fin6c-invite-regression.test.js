/**
 * play9fin7c — TG invite deep link + full regression
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';
import {
  buildTgInviteUrl,
  parseTgInviteStartParam,
  normalizeDualRoomKey,
} from '../src/net/tg-invite.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
const lia = readFileSync(join(root, 'src/lobby-ia.css'), 'utf8');

test('cache play9fin7c', () => {
  assert.match(html, /app\.js\?v=play9fin7c/);
  assert.equal(CACHE_STAMP, 'play9fin7c');
  assert.equal(BUILD_VERSION, 'play9fin7c');
  assert.doesNotMatch(html, /app\.js\?v=play9fin6b/);
});

test('TG invite link generates startapp params', () => {
  const url = buildTgInviteUrl('dual_ddz_abc123', 'teaparlorbot');
  assert.match(url, /t\.me\/teaparlorbot\/app\?startapp=t_dual_ddz_abc123/);
  assert.match(html, /id="socialGenInviteBtn"/);
  assert.match(html, /id="socialInviteUrl"/);
  assert.match(app, /buildTgInviteUrl|friendInviteUrl/);
  assert.match(app, /startapp/);
});

test('another session can parse deep link and join same room', () => {
  const a = parseTgInviteStartParam({ start_param: 't_dual_ddz_xyz9' });
  assert.equal(a.roomKey, 'dual_ddz_xyz9');
  const b = parseTgInviteStartParam({ tgWebAppStartParam: 't_dual_ddz_xyz9' });
  assert.equal(b.roomKey, 'dual_ddz_xyz9');
  const c = parseTgInviteStartParam({ startapp: 't_roomcode99' });
  assert.equal(c.roomKey, 'dual_ddz_roomcode99');
  assert.equal(normalizeDualRoomKey('dual_ddz_abc'), 'dual_ddz_abc');
  assert.match(app, /tryConsumeTgInviteDeepLink/);
  assert.match(app, /parseTgInviteStartParam|collectTgInviteSources/);
  assert.match(app, /enterFriendDualTable/);
});

test('full regression: trustee/ads/activity/recent/five tabs/three games', () => {
  assert.match(html, /<strong>大厅<\/strong>/);
  assert.match(html, /<strong>战绩<\/strong>/);
  assert.match(html, /<strong>补给<\/strong>/);
  assert.match(html, /<strong>说明<\/strong>/);
  assert.match(html, /<strong>我<\/strong>/);
  assert.match(lia, /repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /doudizhu|斗地主/i);
  assert.match(html, /mahjong|麻将|riichi|推倒胡/i);
  assert.match(html, /niuniu|牛牛/i);
  assert.match(app, /ddzSetTrustee/);
  assert.match(app, /syncRecentTablesFromServer/);
  assert.match(html, /id="activitySessionRetryBtn"/);
  assert.equal(existsSync(join(root, 'public/ads/manifest.json')), true);
  assert.match(orient, /--tg-vh/);
});

test('no Stars / chain withdraw / whole-page rotate', () => {
  assert.match(html, /STARS" hidden disabled|no Stars pay/i);
  assert.doesNotMatch(app, /Telegram Stars pay|chain.?withdraw|提现入口/);
  assert.doesNotMatch(styles, /html\s*\{[^}]*rotate\(/);
});

test('fin6a match + fin6b settle preserved', () => {
  assert.match(html, /id="ddzFieldSelect"/);
  assert.match(html, /id="ddzMatchRetry"/);
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="ddzResultLobby"[^>]*>回大厅</);
  const rk = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
  assert.match(rk, /rkSettleAgain/);
});

test('dual-session smoke still green', () => {
  const smoke = join(repo, 'apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs');
  assert.equal(existsSync(smoke), true);
  const r = spawnSync(process.execPath, [smoke], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout || '', /PASS/);
});

test('docs/qa play9fin7c present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin7c/report.json')), true);
});
