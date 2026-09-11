import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRiichiDeck,
  createRiichiTile,
  canWinHand,
  isTenpai,
  doraFromIndicator,
  evaluateYaku,
  computePoints,
  createRiichiTable,
  countDoraInHand,
  tileAssetName,
  START_POINTS,
} from '../src/games/mahjong/riichi-engine.js';

test('riichi deck is 136 tiles', () => {
  const d = createRiichiDeck();
  assert.equal(d.length, 136);
  assert.equal(d.filter((t) => t.suit === 3).length, 16);
  assert.equal(d.filter((t) => t.suit === 4).length, 12);
});

test('canWinHand basic pair + sequences', () => {
  const hand = [];
  // 123m 456m 789m 123p 11s
  for (const [s, r] of [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[2,1],[2,2],[2,3],[1,1],[1,1]]) {
    hand.push(createRiichiTile(s, r));
  }
  assert.equal(canWinHand(hand), true);
});

test('isTenpai detects 13-tile wait', () => {
  const hand = [];
  for (const [s, r] of [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[2,1],[2,2],[2,3],[1,1]]) {
    hand.push(createRiichiTile(s, r));
  }
  assert.equal(isTenpai(hand), true);
});

test('doraFromIndicator wraps 9→1 and winds', () => {
  assert.deepEqual(doraFromIndicator({ suit: 0, rank: 9 }), { suit: 0, rank: 1 });
  assert.deepEqual(doraFromIndicator({ suit: 3, rank: 4 }), { suit: 3, rank: 1 });
  assert.deepEqual(doraFromIndicator({ suit: 4, rank: 3 }), { suit: 4, rank: 1 });
});

test('evaluateYaku riichi + tsumo + dora', () => {
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
    doraCount: 2,
  });
  assert.ok(ev.han >= 3);
  assert.ok(ev.yaku.some((y) => y.name === '立直'));
  assert.ok(ev.yaku.some((y) => y.name === '门前清自摸和'));
});

test('computePoints tsumo child and dealer', () => {
  const ko = computePoints({ han: 3, fu: 30, isDealer: false, isTsumo: true });
  assert.ok(ko.total > 0);
  const oya = computePoints({ han: 3, fu: 30, isDealer: true, isTsumo: true });
  assert.ok(oya.total >= ko.total);
  const mangan = computePoints({ han: 5, fu: 30, isDealer: false, isTsumo: false });
  assert.equal(mangan.tier, '满贯');
});

test('declare riichi then discard works on table', () => {
  let n = 0;
  const random = () => {
    n += 1;
    return (n * 9301 + 49297) % 233280 / 233280;
  };
  const table = createRiichiTable({ random });
  table.deal({ dealer: 0 });
  let snap = table.snapshot();
  assert.equal(snap.scores[0], START_POINTS);
  assert.equal(snap.hands[0].length, 14);
  assert.ok(snap.doraIndicators.length >= 1);
  // discard something
  const id = snap.hands[0][0].id;
  const r = table.discard(id);
  assert.equal(r.ok, true);
  snap = table.snapshot();
  assert.equal(snap.hands[0].length, 13);
  assert.ok(snap.wallLeft < 70);
});

test('tileAssetName maps pocket files', () => {
  assert.equal(tileAssetName({ suit: 0, rank: 5 }), 'wan5.png');
  assert.equal(tileAssetName({ suit: 3, rank: 1 }), 'ziDong.png');
  assert.equal(tileAssetName({ suit: 4, rank: 2 }), 'ziFa.png');
});

test('countDoraInHand', () => {
  const tiles = [createRiichiTile(0, 2), createRiichiTile(0, 2), createRiichiTile(1, 5)];
  assert.equal(countDoraInHand(tiles, [{ suit: 0, rank: 2 }]), 2);
});
