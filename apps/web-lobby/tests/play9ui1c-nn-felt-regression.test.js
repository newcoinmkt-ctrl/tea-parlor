/**
 * play9ui1e — NN green felt + full regression guards
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_STAMP, BUILD_VERSION } from '../src/net/build-stamp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const nnCss = readFileSync(join(root, 'src/niuniu.css'), 'utf8');
const nnUi = readFileSync(join(root, 'src/games/niuniu/ui.js'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
const mjCss = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');

test('cache play9ui1e', () => {
  assert.equal(CACHE_STAMP, 'play9ui1e');
  assert.equal(BUILD_VERSION, 'play9ui1e');
  assert.match(html, /app\.js\?v=play9ui1e/);
  assert.match(html, /niuniu\.css\?v=play9ui1e/);
});

test('NN oval green felt + wood rim + 6 seats', () => {
  assert.match(nnCss, /play9ui1e|green felt/);
  assert.match(nnCss, /nn-felt|#nnFelt/);
  assert.match(nnCss, /8b5a2b|wood|#8b5a2b/);
  assert.match(nnUi, /6-seat|seatPos/);
  assert.match(nnUi, /nn-turn-clock|is-turn/);
  assert.match(nnCss, /nn-turn-clock|is-turn/);
});

test('NN actions preserved (抢庄/下注/开牌 mapping)', () => {
  assert.match(nnUi, /qiangzhuang|抢/);
  assert.match(nnUi, /xiazhu|注/);
  assert.match(nnUi, /cuopai|开牌|搓/);
  assert.match(nnCss, /nn-actions|#mgActions/);
});

test('five tabs + DDZ/MJ/NN entries; no Stars/withdraw/rotate', () => {
  assert.match(html, /data-lobby-view="home"/);
  assert.match(html, /data-lobby-view="activity"/);
  assert.match(html, /data-side-game="niuniu"/);
  assert.match(html, /斗地主|doudizhu|local-doudizhu|data-side-game="doudizhu"|data-game="doudizhu"/i);
  assert.match(html, /麻将|mahjong|推倒胡|日麻/i);
  assert.doesNotMatch(jj, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.doesNotMatch(nnCss, /rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
});

test('fin features preserved: trustee/ads/activity/settle buttons', () => {
  assert.match(html, /id="trusteeButton"/);
  assert.match(html, /data-ad-slot/);
  assert.match(html, /data-lobby-view="activity"/);
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="ddzResultLobby"[^>]*>回大厅</);
  assert.match(app, /自动出牌中|ddzAutoplayHint/);
  assert.match(jj, /jj-bid-bar|#bidTimer/);
});

test('Texas entry exists but no invented 9-seat NN', () => {
  assert.match(html, /data-side-game="texas"/);
  assert.doesNotMatch(nnUi, /9-seat|nine.?seat/i);
});

test('docs/qa play9ui1e present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1e/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1e/report.json')), true);
});
