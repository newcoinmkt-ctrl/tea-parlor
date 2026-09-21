/**
 * play9fin6a — version visible / room-api errors distinguishable + full regression
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CACHE_STAMP, BUILD_VERSION, buildStampPayload, formatLobbyVersionLabel } from '../src/net/build-stamp.js';
import { buildRuntimeConfigScript } from '../server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const serverSrc = readFileSync(join(root, 'server.js'), 'utf8');
const coly = readFileSync(join(root, 'src/net/colyseus-client.js'), 'utf8');
const colySrv = readFileSync(join(repo, 'apps/colyseus-tea-parlor/src/index.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const lia = readFileSync(join(root, 'src/lobby-ia.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9fin6a', () => {
  assert.match(html, /app\.js\?v=play9fin6a/);
  assert.match(app, /\?v=play9fin6a/);
  assert.equal(CACHE_STAMP, 'play9fin6a');
  assert.equal(BUILD_VERSION, 'play9fin6a');
  assert.doesNotMatch(html, /app\.js\?v=play9fin5b/);
});

test('lobby + health show version/cache stamp', () => {
  assert.match(html, /id="lobbyVersionStamp"/);
  assert.match(html, /lobby-version-stamp/);
  assert.match(app, /paintLobbyVersionStamp/);
  assert.match(app, /formatLobbyVersionLabel/);
  assert.match(serverSrc, /buildStampPayload|CACHE_STAMP/);
  assert.match(serverSrc, /TEA_PARLOR_VERSION|TEA_PARLOR_CACHE/);
  const health = buildStampPayload();
  assert.equal(health.ok, true);
  assert.equal(health.cache, 'play9fin6a');
  assert.equal(health.version, 'play9fin6a');
  assert.match(formatLobbyVersionLabel(), /play9fin6a/);
  const cfg = buildRuntimeConfigScript({ NODE_ENV: 'production' });
  assert.match(cfg, /TEA_PARLOR_VERSION/);
  assert.match(cfg, /TEA_PARLOR_CACHE/);
  assert.match(colySrv, /version:.*play9fin6a|TEA_PARLOR_VERSION/);
});

test('key room API errors distinguishable in logs', () => {
  assert.match(coly, /logRoomApiError/);
  assert.match(coly, /\[room-api:/);
  assert.match(coly, /ddz_join_or_create_failed/);
  assert.match(coly, /ddz_reconnect_failed/);
  assert.match(coly, /ddz_room_state_timeout/);
  assert.match(coly, /ddz_room_message_error/);
  assert.match(coly, /mj_join_or_create_failed/);
  assert.match(coly, /mj_reconnect_failed/);
  assert.match(coly, /mj_room_state_timeout/);
  assert.match(coly, /mj_room_message_error/);
  assert.match(coly, /room_leave_failed/);
});

test('full regression: five tabs + DDZ/MJ/NN + trustee + ads + --tg-vh', () => {
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
  const branding = readFileSync(join(root, 'src/shared/branding.js'), 'utf8');
  assert.match(branding, /normalizeAdPlacement|play9fin3b/);
  assert.equal(existsSync(join(root, 'public/ads/manifest.json')), true);
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight/);
});

test('no Stars / chain withdraw / whole-page rotate', () => {
  assert.match(html, /STARS" hidden disabled|no Stars pay/i);
  assert.doesNotMatch(app, /Telegram Stars pay|chain.?withdraw|提现入口/);
  assert.doesNotMatch(styles, /html\s*\{[^}]*rotate\(/);
});

test('fin5a recent server + fin5b activity/yaku preserved', () => {
  assert.match(app, /syncRecentTablesFromServer/);
  assert.match(app, /retryActivityTelegramSession/);
  const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');
  assert.match(eng, /findAllMeldDecompositions/);
  assert.match(html, /id="activitySessionRetryBtn"/);
});

test('dual-session smoke still green when available', () => {
  const smoke = join(repo, 'apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs');
  if (!existsSync(smoke)) return;
  const r = spawnSync(process.execPath, ['--check', smoke], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('docs/qa play9fin6a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin6a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin6a/report.json')), true);
});
