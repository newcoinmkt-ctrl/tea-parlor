/**
 * play9fin5a feature preserved under play9gd1a cache
 * recent same-table server-backed (not localStorage-only)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const wallet = readFileSync(join(root, 'src/net/wallet-client.js'), 'utf8');
const gateway = readFileSync(join(repo, 'apps/api-gateway/src/server.js'), 'utf8');
const store = readFileSync(join(repo, 'apps/api-gateway/src/recent-tables.js'), 'utf8');

test('cache play9gd1a', () => {
  assert.match(html, /app\.js\?v=play9gd1a/);
  assert.match(app, /\?v=play9gd1a/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin5a/);
});

test('client syncs recent tables via session API (not localStorage-only)', () => {
  assert.match(app, /syncRecentTablesFromServer/);
  assert.match(app, /fetchRecentTablesApi|postRecentTableApi/);
  assert.match(app, /paintSocialRecentList/);
  assert.match(app, /_recentTablesSource/);
  assert.match(app, /账号同步|换机\/刷新/);
  assert.match(app, /loadRecentTablesLocal|RECENT_TABLE_KEY/);
  assert.match(wallet, /fetchRecentTables/);
  assert.match(wallet, /postRecentTable/);
  assert.match(wallet, /\/social\/recent-tables/);
});

test('api-gateway exposes authenticated /social/recent-tables', () => {
  assert.match(gateway, /\/social\/recent-tables/);
  assert.match(gateway, /handleSocialRoute/);
  assert.match(gateway, /recentTablesStore/);
  assert.match(store, /createRecentTablesStore|RecentTablesStore/);
  assert.match(store, /remember\(/);
  assert.match(store, /list\(/);
});

test('social page still openable; no full IM', () => {
  assert.match(html, /data-lobby-view="social"/);
  assert.match(html, /id="socialRecentList"/);
  assert.match(html, /不含好友动态|不含.*IM/);
  assert.doesNotMatch(html, /moments-feed|im-chat-panel/);
});

test('docs/qa play9fin5a present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin5a/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin5a/report.json')), true);
});
