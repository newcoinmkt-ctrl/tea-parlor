/**
 * play9ui1a — light social + full regression
 * Room code / invite OR recent same-table openable; NO full IM
 * DDZ/MJ/NN + server trustee + ads config + five tabs; no whole-page rotate
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const styles = readFileSync(join(root, 'src/styles.css'), 'utf8');
const lia = readFileSync(join(root, 'src/lobby-ia.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9ui1a', () => {
  assert.match(html, /app\.js\?v=play9ui1a/);
  assert.match(app, /\?v=play9ui1a/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin4b/);
});

test('light social entry openable — room code / invite OR recent same-table', () => {
  assert.match(html, /data-lobby-action="social"/);
  assert.match(html, /data-lobby-view="social"/);
  assert.match(html, /id="socialRecentList"/);
  assert.match(html, /id="socialRoomCodeInput"/);
  assert.match(html, /id="socialJoinRoomBtn"/);
  assert.match(html, /data-lobby-action="friend-room"/);
  assert.doesNotMatch(html, /data-lobby-action="friend-room"[^>]*\bhidden\b/);
  assert.match(html, /id="ddzFriendPanel"/);
  assert.match(html, /id="ddzFriendId"/);
  assert.match(app, /action === 'social'/);
  assert.match(app, /setLobbyView\('social'\)/);
  assert.match(app, /function renderSocialPage/);
  assert.match(app, /rememberRecentTable|loadRecentTables/);
  assert.match(app, /syncRecentTablesFromServer/);
  assert.match(app, /enterFriendDualTable/);
  assert.match(html, /不含好友动态|不含.*IM|无完整 IM/);
  assert.doesNotMatch(html, /moments-feed|im-chat-panel|朋友圈动态流/);
  assert.doesNotMatch(app, /openMomentsFeed|fullImChat/);
});

test('five tabs + DDZ / MJ / NN wired', () => {
  assert.match(html, /<strong>大厅<\/strong>/);
  assert.match(html, /<strong>战绩<\/strong>/);
  assert.match(html, /<strong>补给<\/strong>/);
  assert.match(html, /<strong>说明<\/strong>/);
  assert.match(html, /<strong>我<\/strong>/);
  assert.match(lia, /repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(html, /doudizhu|斗地主/i);
  assert.match(html, /mahjong|麻将|riichi|推倒胡/i);
  assert.match(html, /niuniu|牛牛/i);
});

test('server trustee + ads config preserved', () => {
  assert.match(app, /ddzSetTrustee/);
  const branding = readFileSync(join(root, 'src/shared/branding.js'), 'utf8');
  assert.match(branding, /normalizeAdPlacement|play9fin3b/);
  assert.equal(existsSync(join(root, 'public/ads/manifest.json')), true);
});

test('no Stars / chain withdraw / whole-page rotate; ship3b --tg-vh', () => {
  assert.match(html, /STARS" hidden disabled|no Stars pay/i);
  assert.doesNotMatch(app, /Telegram Stars pay|chain.?withdraw|提现入口/);
  assert.doesNotMatch(styles, /html\s*\{[^}]*rotate\(/);
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight/);
});

test('fin4a activity + fin4b rarer yaku still present', () => {
  assert.match(html, /data-lobby-view="activity"/);
  assert.match(html, /活动中心/);
  const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');
  assert.match(eng, /detectRarerYaku/);
  assert.match(eng, /清一色|三色同顺|一气通贯/);
});

test('dual-session smoke still green when available', () => {
  const smoke = join(repo, 'apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs');
  if (!existsSync(smoke)) return;
  const r = spawnSync(process.execPath, [smoke], {
    cwd: join(repo, 'apps/colyseus-tea-parlor'),
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('docs/qa play9ui1a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1a/report.json')), true);
});
