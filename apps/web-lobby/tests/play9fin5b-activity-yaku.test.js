/**
 * play9fin5b — activity TG-session UX (prompt + retry) + thickened yaku decompose
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRiichiTile,
  evaluateYaku,
  estimateFu,
  computePoints,
  canWinHand,
} from '../src/games/mahjong/riichi-engine.js';
import {
  DAILY_SUPPLY_TG_PROMPT,
  DAILY_SUPPLY_TG_RETRY,
} from '../src/net/daily-supply-copy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'src/app.js'), 'utf8');
const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');
const copy = readFileSync(join(root, 'src/net/daily-supply-copy.js'), 'utf8');

const T = (s, r) => createRiichiTile(s, r);
const hand = (pairs) => pairs.map(([s, r]) => T(s, r));

function settle(tiles13, win, opts = {}) {
  const h = hand(tiles13);
  const w = T(...win);
  assert.equal(canWinHand([...h, w], 0), true, 'must be winning hand');
  const ev = evaluateYaku({ hand: h, winTile: w, melds: [], isTsumo: true, ...opts });
  assert.ok(ev.yaku.length > 0, 'empty settle forbidden: ' + JSON.stringify(ev));
  assert.ok(ev.fu >= 20, 'fu=' + ev.fu);
  const pts = computePoints({ han: ev.han, fu: ev.fu, isDealer: false, isTsumo: true });
  assert.ok((pts.total || 0) > 0, JSON.stringify(pts));
  return ev;
}

test('cache play9gd1d', () => {
  assert.match(html, /app\.js\?v=play9gd1d/);
  assert.match(app, /\?v=play9gd1d/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin5a/);
});

test('activity claim shows clear TG prompt + retry when session missing', () => {
  assert.match(html, /id="activitySessionRetryBtn"/);
  assert.match(html, /重试登录/);
  assert.match(app, /retryActivityTelegramSession/);
  assert.match(app, /bindActivitySessionRetry/);
  assert.match(app, /DAILY_SUPPLY_TG_RETRY|activitySessionRetryBtn/);
  assert.match(copy, /未检测到 Telegram 会话/);
  assert.match(copy, /DAILY_SUPPLY_TG_RETRY/);
  assert.equal(typeof DAILY_SUPPLY_TG_PROMPT, 'string');
  assert.match(DAILY_SUPPLY_TG_PROMPT, /Telegram/);
  assert.match(DAILY_SUPPLY_TG_RETRY, /重试/);
  // no silent fail path: missing token updates activityClaimStatus
  assert.match(app, /DAILY_SUPPLY_TG_PROMPT[\s\S]{0,240}activityClaimStatus/);
});

test('yaku decompose thickened — findAllMeldDecompositions + best-of', () => {
  assert.match(eng, /findAllMeldDecompositions/);
  assert.match(eng, /scoreRarerYakuForDecomp/);
  assert.match(eng, /collectMeldDecompositions/);
  assert.match(eng, /play9gd1d|findAllMeldDecompositions/);
});

test('settle lists each judgeable yaku separately (chinitsu + tanyao not lumped)', () => {
  // 清一色 all simples — should list 清一色 and 断幺九 separately (+ 门前清自摸和)
  const ev = settle(
    [[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,2],[0,3],[0,4],[0,5],[0,5],[0,8],[0,8]],
    [0,8],
  );
  const names = ev.yaku.map((y) => y.name);
  assert.ok(names.includes('清一色'), JSON.stringify(names));
  assert.ok(names.includes('断幺九'), JSON.stringify(names));
  assert.ok(names.includes('门前清自摸和'), JSON.stringify(names));
  assert.ok(ev.yaku.length >= 3, 'expected separate yaku entries: ' + JSON.stringify(names));
  // no generic lump label
  assert.ok(!names.includes('役牌'), JSON.stringify(names));
});

test('sanshoku still judgeable after thicken; multi-yaku listed', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[0,4],[0,5],[0,6],[2,7]],
    [2,7],
  );
  assert.ok(ev.yaku.some((y) => y.name === '三色同顺'), JSON.stringify(ev.yaku));
  assert.ok(ev.yaku.length >= 2, JSON.stringify(ev.yaku));
});

test('docs/qa play9fin5b present', () => {
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin5b/README.md')), true);
  assert.equal(existsSync(join(repo, 'docs/qa/play9fin5b/report.json')), true);
});
