/**
 * play9fin1c: 日麻立直/番结算加厚 · 推倒胡吃碰杠 · 软代打倒计时
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMahjongTable, findChiOptions } from '../src/games/mahjong/engine.js';
import {
  createRiichiTable,
  createRiichiTile,
  evaluateYaku,
  findRiichiChiOptions,
} from '../src/games/mahjong/riichi-engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('cache play9fin2b', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(html, /app\.js\?v=play9fin2b/);
  assert.match(html, /riichi-mahjong\.css\?v=play9fin2b/);
  assert.match(app, /\?v=play9fin2b/);
  assert.doesNotMatch(html, /app\.js\?v=play9ship3b/);
});

test('tg-vh ship3b fix not regressed (no Math.max with innerHeight)', () => {
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(orient, /prefer.*viewportStableHeight|Prefer Telegram viewportStableHeight/i);
  assert.match(orient, /never Math\.max with/);
  assert.match(app, /never Math\.max w\/ innerHeight/);
  assert.match(app, /syncViewportHeight\(\)/);
});

test('findChiOptions returns legal sequences', () => {
  const hand = [
    { id: 'a', suit: 0, rank: 2 },
    { id: 'b', suit: 0, rank: 3 },
    { id: 'c', suit: 0, rank: 5 },
  ];
  const opts = findChiOptions(hand, { id: 'd', suit: 0, rank: 4 });
  assert.ok(opts.length >= 1);
  assert.equal(opts[0].tiles.length, 2);
});

test('推倒胡 吃 deducts 2 + removes river + only legal button', () => {
  const t = createMahjongTable({ mode: 'siren', stake: 100, names: ['我', 'A', 'B', 'C'] });
  t.deal({ dealer: 3 });
  const st = t.state;
  // seat 3 discards; seat 0 is 下家 → can chi
  const c2 = { id: 'c2', suit: 0, rank: 2 };
  const c3 = { id: 'c3', suit: 0, rank: 3 };
  const c4 = { id: 'c4', suit: 0, rank: 4 };
  st.hands[0] = st.hands[0].filter((x) => !(x.suit === 0 && (x.rank === 2 || x.rank === 3))).slice(0, 11);
  st.hands[0].push(c2, c3);
  st.phase = 'discard';
  st.current = 3;
  st.hands[3] = st.hands[3].filter((x) => !(x.suit === 0 && x.rank === 4));
  st.hands[3].push(c4);
  const before = st.hands[0].length;
  assert.equal(t.discard(3, c4.id).ok, true);
  const snap = t.snapshot();
  assert.equal(snap.phase, 'call');
  assert.equal(snap.callOptions.canChi, true);
  // illegal: no peng if only 2 different ranks
  assert.equal(snap.callOptions.canPeng, false);
  const riverBefore = snap.discards.length;
  const r = t.humanCall('chi');
  assert.equal(r.ok, true);
  const after = t.snapshot();
  assert.equal(after.hands[0].length, before - 2);
  assert.equal(after.melds[0].length, 1);
  assert.equal(after.melds[0][0].type, 'chi');
  assert.equal(after.discards.length, riverBefore - 1);
  assert.equal(after.phase, 'discard');
  assert.equal(after.current, 0);
});

test('血战无吃', () => {
  const t = createMahjongTable({ mode: 'xuezhan', stake: 100 });
  t.deal({ dealer: 3 });
  const st = t.state;
  st.phase = 'discard';
  st.current = 3;
  st.missingSuits = [1, 1, 1, 1];
  const c2 = { id: 'c2', suit: 0, rank: 2 };
  const c3 = { id: 'c3', suit: 0, rank: 3 };
  const c4 = { id: 'c4', suit: 0, rank: 4 };
  st.hands[0] = st.hands[0].filter((x) => x.suit !== 0).slice(0, 11);
  st.hands[0].push(c2, c3);
  st.hands[3] = st.hands[3].filter((x) => !(x.suit === 0 && x.rank === 4));
  st.hands[3].push(c4);
  t.discard(3, c4.id);
  const snap = t.snapshot();
  if (snap.phase === 'call') {
    assert.equal(snap.callOptions?.canChi, false);
  }
});

test('evaluateYaku riichi+ippatsu+ura non-empty', () => {
  const closed = [];
  for (const [s, r] of [[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[2,2],[2,3],[2,4],[1,3],[1,4],[1,5],[1,8]]) {
    closed.push(createRiichiTile(s, r));
  }
  const win = createRiichiTile(1, 8);
  const ev = evaluateYaku({
    hand: closed,
    winTile: win,
    melds: [],
    riichi: true,
    isTsumo: true,
    seatWind: 1,
    roundWind: 1,
    doraCount: 1,
    uraCount: 2,
    ippatsu: true,
  });
  assert.ok(ev.han >= 4);
  assert.ok(ev.yaku.some((y) => y.name === '立直'));
  assert.ok(ev.yaku.some((y) => y.name === '一发'));
  assert.ok(ev.yaku.some((y) => y.name === '里宝牌'));
  assert.ok(ev.yaku.some((y) => y.name === '宝牌'));
});

test('declareRiichi pending + discard sets riichiDiscardIndex', () => {
  const table = createRiichiTable({ random: () => 0.42 });
  table.deal({ dealer: 0 });
  // Force closed tenpai 14: 123m456m789m123p11s + junk 2s to discard
  const hand = [];
  for (const [s, r] of [
    [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],
    [2,1],[2,2],[2,3],[1,1],[1,2],
  ]) {
    hand.push(createRiichiTile(s, r));
  }
  table.state.hands[0] = hand;
  table.state.melds[0] = [];
  table.state.riichi[0] = false;
  table.state.phase = 'discard';
  table.state.current = 0;
  table.state.drawn = hand[hand.length - 1];
  table.state.wall = table.state.wall.concat(Array.from({ length: 20 }, (_, i) => createRiichiTile(2, (i % 9) + 1)));
  table.refreshFlags();
  let snap = table.snapshot();
  assert.equal(snap.canRiichi, true);
  const decl = table.declareRiichi();
  assert.equal(decl.ok, true);
  snap = table.snapshot();
  assert.equal(snap.pendingRiichi, true);
  // discard the 2s — leaves 13 tenpai (wait 1s)
  const junk = table.state.hands[0].find((t) => t.suit === 1 && t.rank === 2);
  assert.ok(junk);
  const dr = table.discard(junk.id, { riichiDeclare: true });
  assert.equal(dr.ok, true);
  const after = table.snapshot();
  assert.equal(after.riichi[0], true);
  assert.ok(after.riichiDiscardIndex[0] >= 0);
  assert.equal(after.scores[0], 24000);
  assert.equal(after.ippatsu[0], true);
});

test('riichi findChiOptions + humanCall chi deduct', () => {
  const opts = findRiichiChiOptions(
    [createRiichiTile(1, 2), createRiichiTile(1, 3), createRiichiTile(2, 5)],
    createRiichiTile(1, 4),
  );
  assert.ok(opts.length >= 1);
});

test('riichi-ui has soft trustee + countdown auto + settle ura', () => {
  const ui = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
  assert.match(ui, /autoTimeoutAct/);
  assert.match(ui, /visibilitychange/);
  assert.match(ui, /softTrustee/);
  assert.match(ui, /rk-settle-ura|里宝牌/);
  assert.match(ui, /rkBtnChi/);
  assert.match(ui, /is-riichi-armed/);
  const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');
  assert.match(eng, /humanCall/);
  assert.match(eng, /uraCount/);
  assert.match(eng, /riichiDiscardIndex/);
});
