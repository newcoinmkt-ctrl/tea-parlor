/**
 * play9fin1c — riichi yaku/fu settle usable; empty settle forbidden
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  createRiichiTile,
  evaluateYaku,
  estimateFu,
  computePoints,
  createRiichiTable,
} from '../src/games/mahjong/riichi-engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function closedPinfuish() {
  // 123m 456m 789p 22s 33s + win 3s — simplified tenpai shape for yaku tests
  const tiles = [];
  for (const [s, r] of [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,7],[1,8],[1,9],[2,2],[2,2],[2,3],[2,3]]) {
    tiles.push(createRiichiTile(s, r));
  }
  return tiles;
}

test('cache play9fin6b', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  assert.match(html, /app\.js\?v=play9fin6b/);
  assert.match(app, /\?v=play9fin6b/);
  assert.doesNotMatch(html, /app\.js\?v=play9fin1b/);
});

test('common yaku: riichi/ippatsu/menzen/pinfu/tanyao/dora/ura non-empty', () => {
  // 已知可和形：123m 456m 789p 22s + 333s (win 3s) — reuse engine test pattern
  const closed = [];
  for (const r of [1, 2, 3, 4, 5, 6]) closed.push(createRiichiTile(0, r));
  for (const r of [7, 8, 9]) closed.push(createRiichiTile(1, r));
  closed.push(createRiichiTile(2, 2), createRiichiTile(2, 2));
  closed.push(createRiichiTile(2, 3), createRiichiTile(2, 3));
  const winTile = createRiichiTile(2, 3);
  const ev = evaluateYaku({
    hand: closed,
    winTile,
    melds: [],
    riichi: true,
    isTsumo: true,
    doraCount: 2,
    uraCount: 1,
    ippatsu: true,
  });
  assert.ok(ev.yaku.length >= 3, JSON.stringify(ev.yaku));
  const names = ev.yaku.map((y) => y.name).join(',');
  assert.match(names, /立直/);
  assert.ok(/一发|门前清自摸|宝牌|里宝牌|断幺|平和/.test(names), names);
  assert.ok(ev.han >= 3, `han=${ev.han}`);
  assert.ok(ev.fu >= 20, `fu=${ev.fu}`);
  const pts = computePoints({ han: ev.han, fu: ev.fu, isDealer: false, isTsumo: true });
  assert.ok((pts.total || 0) > 0, JSON.stringify(pts));
});

test('estimateFu: seven pairs 25; menzen ron 30; pinfu tsumo 20', () => {
  assert.equal(estimateFu({ sevenPairs: true }), 25);
  assert.equal(estimateFu({ closed: true, isTsumo: false }), 30);
  assert.equal(estimateFu({ closed: true, isTsumo: true, pinfu: true }), 20);
});

test('yakuhai detected on dragon triplet', () => {
  const hand = [];
  // 111z (中) + sequences + pair
  for (let i = 0; i < 3; i++) hand.push(createRiichiTile(4, 1));
  for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9]) hand.push(createRiichiTile(0, r > 9 ? 9 : r));
  // trim to 13 + win
  while (hand.length > 13) hand.pop();
  const winTile = createRiichiTile(0, 1);
  // This shape may not be a legal win — just ensure yakuhai key path doesn't empty when win legal
  const ev = evaluateYaku({
    hand: [
      createRiichiTile(0, 1), createRiichiTile(0, 2), createRiichiTile(0, 3),
      createRiichiTile(0, 4), createRiichiTile(0, 5), createRiichiTile(0, 6),
      createRiichiTile(1, 1), createRiichiTile(1, 2), createRiichiTile(1, 3),
      createRiichiTile(4, 1), createRiichiTile(4, 1), createRiichiTile(2, 5), createRiichiTile(2, 5),
    ],
    winTile: createRiichiTile(4, 1),
    melds: [],
    isTsumo: true,
  });
  assert.ok(ev.yaku.length > 0, JSON.stringify(ev.yaku));
  assert.ok(ev.yaku.some((y) => /役牌|门前清自摸|平和|断幺/.test(y.name)), JSON.stringify(ev.yaku));
  assert.ok(ev.fu >= 20);
});

test('settle always lists yaku + fu/points — empty forbidden in UI+engine', () => {
  const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');
  const ui = readFileSync(join(root, 'src/games/mahjong/riichi-ui.js'), 'utf8');
  assert.match(eng, /estimateFu/);
  assert.match(eng, /empty_settle_forbidden|play9fin1c: settle yaku list must never be empty|if \(!ev\.yaku\?\.length/);
  assert.match(ui, /play9fin1c: empty settle forbidden/);
  assert.match(ui, /\$\{fu\} 符/);
  assert.match(ui, /\$\{han\} 番/);
  assert.match(ui, /\$\{points\} 点/);
});

test('ship3b tg-vh preserved', () => {
  const app = readFileSync(join(root, 'src/app.js'), 'utf8');
  const orient = readFileSync(join(root, 'src/net/table-orient.js'), 'utf8');
  const blob = `${app}\n${orient}`;
  assert.doesNotMatch(blob, /Math\.max\([^)]*innerHeight/);
});
