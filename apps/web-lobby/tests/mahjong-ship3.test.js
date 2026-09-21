/**
 * play9ship3b: 推倒胡 archive-gap guards — peng deduct, dingque, settle non-empty
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMahjongTable } from '../src/games/mahjong/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('cache play9mj3', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(html, /app\.js\?v=play9mj3/);
  assert.match(html, /jj-mahjong\.css\?v=play9mj3/);
  assert.match(html, /id="mgMelds"/);
  assert.match(app, /\?v=play9mj3/);
});

test('碰 deducts 2 tiles from hand + removes claim from river', () => {
  const t = createMahjongTable({ mode: 'siren', stake: 100, names: ['我', 'A', 'B', 'C'] });
  t.deal({ dealer: 1 });
  const st = t.state;
  const a = { id: 'mj_0_1_x', suit: 0, rank: 1 };
  const b = { id: 'mj_0_1_y', suit: 0, rank: 1 };
  const c = { id: 'mj_0_1_z', suit: 0, rank: 1 };
  st.hands[0] = st.hands[0].filter((x) => !(x.suit === 0 && x.rank === 1)).slice(0, 11);
  st.hands[0].push(a, b);
  st.phase = 'discard';
  st.current = 1;
  st.hands[1] = st.hands[1].filter((x) => !(x.suit === 0 && x.rank === 1));
  st.hands[1].push(c);
  const before = st.hands[0].length;
  assert.equal(t.discard(1, c.id).ok, true);
  const riverBefore = t.snapshot().discards.length;
  assert.equal(t.snapshot().phase, 'call');
  const r = t.humanCall('peng');
  assert.equal(r.ok, true);
  const snap = t.snapshot();
  assert.equal(snap.hands[0].length, before - 2);
  assert.equal(snap.melds[0].length, 1);
  assert.equal(snap.melds[0][0].type, 'peng');
  assert.equal(snap.discards.length, riverBefore - 1);
  assert.equal(snap.phase, 'discard');
  assert.equal(snap.current, 0);
});

test('定缺: must discard dingque before other suits', () => {
  const t = createMahjongTable({ mode: 'xuezhan', stake: 100 });
  t.deal({ dealer: 0 });
  // skip exchange by forcing dingque complete
  const st = t.state;
  st.phase = 'dingque';
  st.exchangeSelected = [];
  st.missingSuits = [null, null, null, null];
  // give seat 0 both wan (que) and tiao
  st.hands[0] = [
    { id: 'w1', suit: 0, rank: 1 },
    { id: 'w2', suit: 0, rank: 2 },
    { id: 't1', suit: 1, rank: 3 },
    { id: 't2', suit: 1, rank: 4 },
    { id: 't3', suit: 1, rank: 5 },
    { id: 't4', suit: 1, rank: 6 },
    { id: 't5', suit: 1, rank: 7 },
    { id: 'o1', suit: 2, rank: 1 },
    { id: 'o2', suit: 2, rank: 2 },
    { id: 'o3', suit: 2, rank: 3 },
    { id: 'o4', suit: 2, rank: 4 },
    { id: 'o5', suit: 2, rank: 5 },
    { id: 'o6', suit: 2, rank: 6 },
  ];
  for (let i = 1; i < 4; i++) {
    st.hands[i] = st.hands[i].slice(0, 13);
  }
  assert.equal(t.chooseDingque(0, 0).ok, true); // miss wan
  // dealer draws — may not be seat 0; force turn
  st.phase = 'discard';
  st.current = 0;
  // ensure hand still has que + non-que after any draw
  if (!st.hands[0].some((c) => c.suit === 0)) {
    st.hands[0].push({ id: 'w9', suit: 0, rank: 9 });
  }
  const nonQue = st.hands[0].find((c) => c.suit !== 0);
  assert.ok(nonQue);
  const bad = t.discard(0, nonQue.id);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'must_discard_dingque');
  const que = st.hands[0].find((c) => c.suit === 0);
  assert.ok(que);
  const good = t.discard(0, que.id);
  assert.equal(good.ok, true);
});

test('首胡结算 scores non-empty', () => {
  const t = createMahjongTable({ mode: 'siren', stake: 100 });
  t.deal({ dealer: 0 });
  const sh = t.state;
  sh.melds[0] = [
    { type: 'peng', suit: 0, rank: 1, tile: { suit: 0, rank: 1 } },
    { type: 'peng', suit: 0, rank: 2, tile: { suit: 0, rank: 2 } },
    { type: 'peng', suit: 0, rank: 3, tile: { suit: 0, rank: 3 } },
    { type: 'peng', suit: 1, rank: 1, tile: { suit: 1, rank: 1 } },
  ];
  sh.hands[0] = [
    { id: 'a', suit: 2, rank: 5 },
    { id: 'b', suit: 2, rank: 5 },
  ];
  sh.missingSuits = [-1, -1, -1, -1];
  sh.phase = 'discard';
  sh.current = 0;
  const hu = t.huSelf(0);
  assert.equal(hu.ok, true);
  assert.equal(hu.settled, true);
  const snap = t.snapshot();
  assert.equal(snap.phase, 'settle');
  assert.ok(snap.deltas.some((d) => d !== 0), 'deltas must be non-empty');
  assert.equal(snap.deltas.reduce((a, b) => a + b, 0), 0);
  assert.ok(snap.scores[0] > 0);
});

test('ui has countdown auto + disconnect soft trustee + showSettle from render', () => {
  const ui = readFileSync(join(root, 'src/games/mahjong/ui.js'), 'utf8');
  assert.match(ui, /autoTimeoutAct/);
  assert.match(ui, /visibilitychange/);
  assert.match(ui, /softTrustee/);
  assert.match(ui, /showHuSettle\(snap\);\s*\n\s*showSettle\(snap\)/);
  assert.match(ui, /renderMelds/);
  assert.match(ui, /must_discard_dingque/);
  const jj = readFileSync(join(root, 'src/jj-mahjong.css'), 'utf8');
  assert.match(jj, /\.mg-meld-group/);
});
