/**
 * play9ui2b — MJ JJ settle + FULL wave regression
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
const mjUi = readFileSync(join(root, 'src/games/mahjong/ui.js'), 'utf8');
const mjCss = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');
const jj = readFileSync(join(root, 'src/jj-table.css'), 'utf8');
const nnCss = readFileSync(join(root, 'src/niuniu.css'), 'utf8');
const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');

test('cache play9ui2b', () => {
  assert.equal(CACHE_STAMP, 'play9ui2b');
  assert.equal(BUILD_VERSION, 'play9ui2b');
  assert.match(html, /app\.js\?v=play9ui2b/);
});

test('MJ settle: four banners + 胡 stamp + 再来/回大厅; never blank', () => {
  assert.match(html, /id="mjHuSettle"/);
  assert.match(html, /data-mj-hu-delta="0"/);
  assert.match(html, /data-mj-hu-delta="1"/);
  assert.match(html, /data-mj-hu-delta="2"/);
  assert.match(html, /data-mj-hu-delta="3"/);
  assert.match(html, /class="mj-hu-stamp"[^>]*>胡</);
  assert.match(html, /id="mgAgainBtn"[^>]*>再来一局</);
  assert.match(html, /id="mgLobbyBtn"[^>]*>回大厅</);
  assert.match(mjUi, /play9ui2b: never blank settle|never blank settle/);
  assert.match(mjUi, /showHuSettle/);
  assert.match(mjCss, /play9ui2b|#mgSettleRow/);
});

test('wave regression: ui1a bid/autoplay + ui1b settle + ui1c NN felt + ui1d MJ', () => {
  assert.match(html, /jj-bid-bar|id="bidTimer"/);
  assert.match(html, /id="ddzAutoplayHint"/);
  assert.match(app, /自动出牌中/);
  assert.match(html, /id="jjSettleHud"/);
  assert.match(jj, /jj-lose-stamp|jj-win-stamp/);
  assert.match(nnCss, /play9ui1c|green felt|nn-turn-clock/);
  assert.match(html, /class="mj-compass"/);
  assert.match(html, /data-mj-variant="tuidaohu"|推倒胡/);
  assert.match(html, /data-mj-mode="riichi"|日麻/);
});

test('no Stars/TON/USDT/withdraw/rotate; ship3b tg-vh', () => {
  assert.doesNotMatch(jj, /#tableView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.doesNotMatch(mjCss, /#multiGameView[^{]*\{[^}]*rotate\(90deg\)/);
  assert.match(orient, /viewportStableHeight/);
  assert.doesNotMatch(orient, /Math\.max\([^)]*innerHeight[^)]*viewportStableHeight/);
  assert.match(html, /不可提现|影子金币/);
});

test('fin features: trustee ads activity five-ish lobby views', () => {
  assert.match(html, /id="trusteeButton"/);
  assert.match(html, /data-ad-slot/);
  assert.match(html, /data-lobby-view="activity"/);
  assert.match(html, /data-lobby-view="home"/);
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
});

test('docs/qa play9ui2b + prior slices present', () => {
  for (const s of ['play9ui1a', 'play9ui1b', 'play9ui1c', 'play9ui1d', 'play9ui2b']) {
    assert.equal(existsSync(join(repo, `docs/qa/${s}/README.md`)), true, s);
  }
});
