/**
 * play9fin6c — rarer riichi yaku beyond fin1c/fin3 common set
 * sanshoku / ittsu / chanta / toitoi / chiitoitsu / chinitsu (+ honitsu)
 * Settle still non-empty with yaku list + fu/points
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const eng = readFileSync(join(root, 'src/games/mahjong/riichi-engine.js'), 'utf8');

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

test('cache play9fin6c', () => {
  assert.match(html, /app\.js\?v=play9fin6c/);
  assert.match(eng, /play9fin6c|detectRarerYaku/);
});

test('chinitsu 清一色 judgeable + non-empty settle', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,2],[0,2],[0,5],[0,5]],
    [0,5],
  );
  assert.ok(ev.yaku.some((y) => y.name === '清一色'), JSON.stringify(ev.yaku));
});

test('sanshoku 三色同顺 judgeable', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[0,4],[0,5],[0,6],[2,7]],
    [2,7],
  );
  assert.ok(ev.yaku.some((y) => y.name === '三色同顺'), JSON.stringify(ev.yaku));
});

test('ittsu 一气通贯 judgeable', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[1,2],[1,2],[1,3],[1,3]],
    [1,3],
  );
  assert.ok(ev.yaku.some((y) => y.name === '一气通贯'), JSON.stringify(ev.yaku));
});

test('toitoi 对对和 judgeable', () => {
  const ev = settle(
    [[0,1],[0,1],[0,1],[1,3],[1,3],[1,3],[2,5],[2,5],[2,5],[0,7],[0,7],[0,7],[1,9]],
    [1,9],
  );
  assert.ok(ev.yaku.some((y) => y.name === '对对和'), JSON.stringify(ev.yaku));
});

test('chiitoitsu 七对子 still judgeable', () => {
  const ev = settle(
    [[0,1],[0,1],[0,3],[0,3],[1,5],[1,5],[1,7],[1,7],[2,2],[2,2],[2,8],[2,8],[3,1]],
    [3,1],
  );
  assert.ok(ev.yaku.some((y) => y.name === '七对子'), JSON.stringify(ev.yaku));
  assert.equal(estimateFu({ sevenPairs: true }), 25);
});

test('chanta 混全带幺九 judgeable', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[1,7],[1,8],[1,9],[2,1],[2,2],[2,3],[4,1],[4,1],[4,1],[0,9]],
    [0,9],
  );
  assert.ok(ev.yaku.some((y) => /混全带幺九|纯全带幺九/.test(y.name)), JSON.stringify(ev.yaku));
});

test('honitsu 混一色 judgeable', () => {
  const ev = settle(
    [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[4,1],[4,1],[0,2],[0,2]],
    [4,1],
  );
  assert.ok(ev.yaku.some((y) => y.name === '混一色'), JSON.stringify(ev.yaku));
});

test('engine wires detectRarerYaku; docs present', () => {
  assert.match(eng, /detectRarerYaku/);
  assert.match(eng, /三色同顺/);
  assert.match(eng, /一气通贯/);
  assert.match(eng, /对对和/);
  assert.match(eng, /清一色/);
  assert.equal(existsSync(join(root, '../../docs/qa/play9fin6c/README.md')), true);
});
