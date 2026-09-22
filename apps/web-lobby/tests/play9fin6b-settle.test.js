/**
 * play9ui1b — settle page polish
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
const rk = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
const nn = readFileSync(join(root, 'src/games/niuniu/ui.js'), 'utf8');
const mj = readFileSync(join(root, 'src/games/mahjong/ui.js'), 'utf8');
const rcss = readFileSync(join(root, 'src/riichi-mahjong.css'), 'utf8');

test('cache play9ui1b', () => {
  assert.match(html, /app\.js\?v=play9ui1b/);
  assert.equal(CACHE_STAMP, 'play9ui1b');
  assert.equal(BUILD_VERSION, 'play9ui1b');
  assert.doesNotMatch(html, /app\.js\?v=play9fin6a/);
});

test('DDZ settle: 再来一局 + 回大厅 + chip column', () => {
  assert.match(html, /id="ddzResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="ddzResultLobby"[^>]*>回大厅</);
  assert.doesNotMatch(html, /id="ddzResultAgain"[^>]*>下一局</);
  assert.doesNotMatch(html, /id="ddzResultLobby"[^>]*>回房间</);
  assert.match(html, /ddzResultBody[\s\S]*筹码±/);
  assert.match(app, /你赢了.*你输了|你输了/);
});

test('Mahjong 推倒胡 + NiuNiu settle readable chip win/loss', () => {
  assert.match(html, /id="mgResultAgain"[^>]*>再来一局</);
  assert.match(html, /id="mgResultLobby"[^>]*>回大厅</);
  assert.match(html, /id="mgAgainBtn"[^>]*>再来一局</);
  assert.match(html, /id="mgLobbyBtn"[^>]*>回大厅</);
  assert.match(nn, /本局筹码/);
  assert.match(nn, /影子金币/);
  assert.match(mj, /本局筹码/);
  assert.match(mj, /影子金币/);
});

test('Riichi settle: yaku list + 再来一局 + 回大厅', () => {
  assert.match(rk, /id="rkSettleAgain"/);
  assert.match(rk, /id="rkSettleLobby"/);
  assert.match(rk, /再来一局/);
  assert.match(rk, /回大厅/);
  assert.match(rk, /rk-yaku-list|rk-yaku-tag/);
  assert.match(rk, /rkSettleChip|本局筹码/);
  assert.match(rcss, /rkSettleAgain/);
  assert.doesNotMatch(rk, /id="rkSettleOk"/);
});

test('fin6a room/match preserved', () => {
  assert.match(html, /id="ddzFieldSelect"/);
  assert.match(html, /id="ddzMatchRetry"/);
  assert.match(app, /showDdzMatchWaiting|retryDdzMatch/);
});

test('docs/qa play9ui1b present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1b/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9ui1b/report.json')), true);
});
