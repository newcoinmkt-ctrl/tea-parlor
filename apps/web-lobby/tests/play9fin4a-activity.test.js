/**
 * play9fin4b — lobby activity / daily supply entry
 * Enterable + viewable; chips only; non-withdrawable; NO Stars/chain top-up
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const lia = readFileSync(join(root, 'src/lobby-ia.css'), 'utf8');
const copy = readFileSync(join(root, 'src/net/daily-supply-copy.js'), 'utf8');

test('cache play9fin4b', () => {
  assert.match(html, /app\.js\?v=play9fin4b/);
  assert.match(html, /lobby-ia\.css\?v=play9fin4b/);
  assert.match(app, /\?v=play9fin4b/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin3c/);
});

test('activity entry on home is enterable', () => {
  assert.match(html, /data-lobby-action="activity"/);
  assert.match(html, /activity-entry-btn/);
  assert.match(html, /活动中心/);
  assert.match(app, /action === 'activity'/);
  assert.match(app, /setLobbyView\('activity'\)/);
  assert.match(app, /renderActivityPage/);
  assert.match(app, /lobby-view-activity/);
});

test('activity page viewable with daily supply claim', () => {
  assert.match(html, /data-lobby-view="activity"/);
  assert.match(html, /id="activityClaimBtn"/);
  assert.match(html, /id="activityClaimStatus"/);
  assert.match(html, /每日补给/);
  assert.match(html, /data-lobby-action="claim"/);
  assert.match(app, /function renderActivityPage/);
  assert.match(app, /function syncActivityClaimStatus/);
});

test('rewards are chips only — non-withdrawable; no Stars/chain top-up on activity', () => {
  assert.match(html, /不可提现/);
  assert.match(html, /影子金币/);
  const activityBlock = html.split('data-lobby-view="activity"')[1]?.split('data-lobby-view="records"')[0] || '';
  assert.ok(activityBlock.length > 100, 'activity block extracted');
  assert.match(activityBlock, /不支持 Stars|不提供 Stars|已禁用/);
  assert.doesNotMatch(activityBlock, /value="STARS"|Telegram Stars pay|data-stars-pay/);
  assert.doesNotMatch(activityBlock, /data-chain-topup|id="chainTopup"|class="chain-topup"/);
  assert.match(activityBlock, /已禁用/);
  assert.match(copy, /不可提现/);
  assert.match(lia, /play9fin4b/);
  assert.match(lia, /activity-entry-btn/);
  assert.match(lia, /activity-page/);
});

test('docs/qa play9fin4b present', () => {
  assert.equal(existsSync(join(root, '../../docs/qa/play9fin4b/README.md')), true);
  assert.equal(existsSync(join(root, '../../docs/qa/play9fin4b/report.json')), true);
});
