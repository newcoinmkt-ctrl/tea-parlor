/**
 * play9fin4b — dual-session smoke docs + full regression guards
 * DDZ / MJ / NN + five tabs; no Stars / chain / rotate / withdraw
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
const colyPkg = JSON.parse(readFileSync(join(repo, 'apps/colyseus-tea-parlor/package.json'), 'utf8'));

test('cache play9fin4b', () => {
  assert.match(html, /app\.js\?v=play9fin4b/);
  assert.match(app, /\?v=play9fin4b/);
});

test('dual-session smoke script exists and is wired', () => {
  const smoke = join(repo, 'apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs');
  assert.equal(existsSync(smoke), true);
  assert.match(readFileSync(smoke, 'utf8'), /play9fin4b/);
  assert.match(readFileSync(smoke, 'utf8'), /clientA|mjA/);
  assert.equal(colyPkg.scripts?.['smoke:dual'], 'node scripts/dual-session-smoke.mjs');
});

test('automated dual-session smoke (DDZ + MJ) green', () => {
  const r = spawnSync(process.execPath, ['scripts/dual-session-smoke.mjs'], {
    cwd: join(repo, 'apps/colyseus-tea-parlor'),
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ddz settle/);
  assert.match(r.stdout, /mj settle/);
  assert.match(r.stdout, /"ok": true/);
});

test('five tabs present; home-tabbar is 5-col', () => {
  assert.match(html, /<strong>大厅<\/strong>/);
  assert.match(html, /<strong>战绩<\/strong>/);
  assert.match(html, /<strong>补给<\/strong>/);
  assert.match(html, /<strong>说明<\/strong>/);
  assert.match(html, /<strong>我<\/strong>/);
  assert.match(lia, /repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /play9fin2c: five tabs/);
});

test('DDZ / Mahjong / Niuniu wired in lobby', () => {
  assert.match(html, /斗地主|doudizhu/i);
  assert.match(html, /麻将|mahjong|推倒胡|riichi/i);
  assert.match(html, /牛牛|niuniu/i);
  assert.match(app, /startRoomOnline|startColyseus/);
});

test('no Stars / chain pay / withdraw / whole-page rotate', () => {
  assert.match(html, /STARS" hidden disabled|no Stars pay/i);
  assert.doesNotMatch(app, /Telegram Stars pay|chain.?withdraw|提现入口/);
  assert.doesNotMatch(styles, /html\s*\{[^}]*rotate\(/);
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  assert.match(orient, /--tg-vh/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight/);
});

test('fin3a trustee + fin3b ads still present', () => {
  assert.match(app, /ddzSetTrustee/);
  const branding = readFileSync(join(root, 'src/shared/branding.js'), 'utf8');
  assert.match(branding, /normalizeAdPlacement|play9fin3b/);
  assert.equal(existsSync(join(root, 'public/ads/manifest.json')), true);
});
