/**
 * 四川麻将 · 血战 / 血流 核心规则测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTile,
  createSichuanDeck,
  sortHand,
  chooseMissingSuit,
  suggestExchangeTiles,
  exchangeCards,
  EXCHANGE_DIR,
  canHu,
  GangType,
  settleGangImmediate,
  createSichuanTable,
  applyExchange,
  applyDingqueAll,
  applyGang,
  applyHu,
  discardTile,
  passClaimsAndNext,
  checkMahjongSettlements,
  GameMode,
  Phase,
  PlayerStatus,
} from '../src/index.js';

// 固定随机：便于测试
function rngSeq(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
}

// ── 定缺 / 换三张 ──

test('chooseMissingSuit: picks fewest suit', () => {
  const hand = [
    ...[1, 2, 3].map((r) => createTile(0, r)), // 3 万
    ...[1, 2, 3, 4, 5].map((r) => createTile(1, r)), // 5 条
    ...[1, 2, 3, 4, 5, 6, 7].map((r) => createTile(2, r)), // 7 筒
  ];
  assert.equal(chooseMissingSuit(hand), 0); // 万最少
});

test('suggestExchangeTiles: same suit three', () => {
  const hand = [
    createTile(1, 1), createTile(1, 2), createTile(1, 3), createTile(1, 4),
    createTile(0, 5), createTile(2, 6),
  ];
  const set = suggestExchangeTiles(hand, 1);
  assert.equal(set.length, 3);
  assert.ok(set.every((t) => t.suit === 1));
});

test('exchangeCards: clockwise rotate 3 same-suit', () => {
  const hands = [
    [createTile(0, 1), createTile(0, 2), createTile(0, 3), createTile(1, 9)],
    [createTile(1, 1), createTile(1, 2), createTile(1, 3), createTile(2, 9)],
    [createTile(2, 1), createTile(2, 2), createTile(2, 3), createTile(0, 9)],
    [createTile(0, 4), createTile(0, 5), createTile(0, 6), createTile(1, 8)],
  ];
  // pad to look realistic
  const sets = [
    hands[0].slice(0, 3),
    hands[1].slice(0, 3),
    hands[2].slice(0, 3),
    hands[3].slice(0, 3),
  ];
  const r = exchangeCards(hands, sets, { direction: EXCHANGE_DIR.CLOCKWISE });
  assert.equal(r.ok, true);
  // 0 的牌给 1
  assert.ok(r.hands[1].some((t) => t.suit === 0 && t.rank === 1));
  assert.equal(r.hands[0].length, hands[0].length);
});

test('exchangeCards: rejects mixed suits', () => {
  const hands = [
    [createTile(0, 1), createTile(1, 2), createTile(2, 3)],
    [createTile(0, 1), createTile(0, 2), createTile(0, 3)],
    [createTile(1, 1), createTile(1, 2), createTile(1, 3)],
    [createTile(2, 1), createTile(2, 2), createTile(2, 3)],
  ];
  const r = exchangeCards(hands, [
    hands[0],
    hands[1],
    hands[2],
    hands[3],
  ]);
  assert.equal(r.ok, false);
});

// ── 胡牌 / 定缺 ──

test('canHu: blocked without dingque or with missing suit', () => {
  // 清一色将+面子骨架
  const hand = [
    createTile(0, 1), createTile(0, 1),
    createTile(0, 2), createTile(0, 2), createTile(0, 2),
    createTile(0, 3), createTile(0, 3), createTile(0, 3),
    createTile(0, 4), createTile(0, 4), createTile(0, 4),
    createTile(0, 5), createTile(0, 5), createTile(0, 5),
  ];
  assert.equal(canHu(hand, 0, null), false);
  assert.equal(canHu(hand, 0, 0), false); // 手中全是定缺色
  assert.equal(canHu(hand, 0, 1), true); // 定缺条，全万可胡
});

// ── 杠分 ──

test('settleGangImmediate: 直杠点炮者付', () => {
  const r = settleGangImmediate({
    type: GangType.MING_ZHI,
    ganger: 0,
    discarder: 2,
    baseScore: 2,
  });
  assert.equal(r.deltas[2], -2);
  assert.equal(r.deltas[0], 2);
  assert.equal(r.totalToGanger, 2);
});

test('settleGangImmediate: 暗杠三家付', () => {
  const r = settleGangImmediate({
    type: GangType.AN,
    ganger: 1,
    baseScore: 1,
  });
  assert.equal(r.deltas[1], 6); // 2*3
  assert.equal(r.deltas[0], -2);
  assert.equal(r.deltas[2], -2);
  assert.equal(r.deltas[3], -2);
});

// ── 桌子状态机 ──

test('table: exchange → dingque → playing', () => {
  const table = createSichuanTable({
    mode: GameMode.XUEZHAN,
    dealer: 0,
    random: rngSeq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
  });
  assert.equal(table.phase, Phase.EXCHANGE);
  assert.equal(table.hands[0].length, 13);
  assert.ok(table.wall.length > 0);

  const sets = table.hands.map((h) => suggestExchangeTiles(h));
  // 若某家不足 3 同色，构造合法集
  for (let i = 0; i < 4; i++) {
    if (sets[i].length < 3) {
      const suit = chooseMissingSuit(table.hands[i]) === 0 ? 1 : 0;
      // 强制从 deck 逻辑：用已有最多色
      const by = [[], [], []];
      for (const t of table.hands[i]) by[t.suit].push(t);
      let s = 0;
      for (let k = 1; k < 3; k++) if (by[k].length > by[s].length) s = k;
      sets[i] = by[s].slice(0, 3);
    }
  }
  // 保证 3 张
  for (let i = 0; i < 4; i++) {
    assert.ok(sets[i].length === 3, `player ${i} exchange`);
  }

  const ex = applyExchange(table, sets);
  assert.equal(ex.ok, true);
  assert.equal(table.phase, Phase.DINGQUE);

  applyDingqueAll(table);
  assert.equal(table.phase, Phase.PLAYING);
  assert.equal(table.hands[table.dealer].length, 14); // 庄摸
  assert.ok(table.missingSuits.every((s) => s != null));
});

test('xuezhan: hu_out removes player; three hu ends', () => {
  const table = createSichuanTable({ mode: GameMode.XUEZHAN, dealer: 0, baseScore: 1 });
  // 跳过换牌：手动
  table.phase = Phase.DINGQUE;
  table.exchangeDone = true;
  applyDingqueAll(table, [1, 1, 1, 1]); // 都定缺条

  // 构造玩家 0 可胡牌型（全万）
  table.hands[0] = sortHand([
    createTile(0, 1), createTile(0, 1),
    createTile(0, 2), createTile(0, 2), createTile(0, 2),
    createTile(0, 3), createTile(0, 3), createTile(0, 3),
    createTile(0, 4), createTile(0, 4), createTile(0, 4),
    createTile(0, 5), createTile(0, 5), createTile(0, 5),
  ]);
  table.melds[0] = [];
  table.currentPlayer = 0;
  table.drawnTile = { player: 0, tile: table.hands[0][table.hands[0].length - 1] };

  const hu = applyHu(table, 0, { fromDiscard: false });
  assert.equal(hu.ok, true);
  assert.equal(table.status[0], PlayerStatus.HU_OUT);
  assert.equal(table.huOrder[0], 0);
  assert.ok(table.scores[0] > 0);

  // 模拟再胡两家
  for (const p of [1, 2]) {
    table.hands[p] = sortHand([
      createTile(0, 1), createTile(0, 1),
      createTile(0, 2), createTile(0, 2), createTile(0, 2),
      createTile(0, 3), createTile(0, 3), createTile(0, 3),
      createTile(0, 4), createTile(0, 4), createTile(0, 4),
      createTile(0, 5), createTile(0, 5), createTile(0, 5),
    ]);
    table.missingSuits[p] = 1;
    table.currentPlayer = p;
    applyHu(table, p, { fromDiscard: false });
  }
  assert.equal(table.phase, Phase.FINISHED);
  assert.equal(table.finishedReason, 'three_hu');
  assert.equal(table.huOrder.length, 3);
});

test('xueliu: hu_stay allows multiple hu counts', () => {
  const table = createSichuanTable({ mode: GameMode.XUELIU, dealer: 0, baseScore: 1 });
  table.phase = Phase.DINGQUE;
  table.exchangeDone = true;
  applyDingqueAll(table, [2, 2, 2, 2]);

  const makeHuHand = () => sortHand([
    createTile(0, 1), createTile(0, 1),
    createTile(0, 2), createTile(0, 2), createTile(0, 2),
    createTile(0, 3), createTile(0, 3), createTile(0, 3),
    createTile(0, 4), createTile(0, 4), createTile(0, 4),
    createTile(0, 5), createTile(0, 5), createTile(0, 5),
  ]);

  table.hands[0] = makeHuHand();
  table.missingSuits[0] = 2;
  table.currentPlayer = 0;
  const r1 = applyHu(table, 0, { fromDiscard: false });
  assert.equal(r1.ok, true);
  assert.equal(table.status[0], PlayerStatus.HU_STAY);
  assert.equal(table.huCount[0], 1);
  assert.notEqual(table.phase, Phase.FINISHED);

  // 再次组胡
  table.hands[0] = makeHuHand();
  const r2 = applyHu(table, 0, { fromDiscard: false });
  assert.equal(r2.ok, true);
  assert.equal(table.huCount[0], 2);
});

test('gang real-time updates scores and ledger', () => {
  const table = createSichuanTable({ mode: GameMode.XUEZHAN, dealer: 0, baseScore: 1 });
  table.phase = Phase.DINGQUE;
  applyDingqueAll(table, [0, 0, 0, 0]);
  // 给玩家 1 四张筒 5 暗杠
  const tiles = [
    createTile(2, 5), createTile(2, 5), createTile(2, 5), createTile(2, 5),
  ];
  table.hands[1] = sortHand([...tiles, createTile(1, 1), createTile(1, 2)]);
  table.currentPlayer = 1;
  table.status[1] = PlayerStatus.ACTIVE;

  const before = table.scores.slice();
  const g = applyGang(table, 1, { type: GangType.AN, tile: { suit: 2, rank: 5 } });
  assert.equal(g.ok, true);
  assert.ok(table.scores[1] > before[1]);
  assert.ok(table.ledger.some((r) => r.kind === 'gang' && r.gangType === GangType.AN));
});

test('checkMahjongSettlements aggregates gang + hu', () => {
  const table = createSichuanTable({ mode: GameMode.XUEZHAN, baseScore: 1 });
  table.phase = Phase.DINGQUE;
  applyDingqueAll(table, [1, 1, 1, 1]);

  table.ledger.push(
    { kind: 'gang', gangType: GangType.AN, from: 1, to: 0, amount: 2 },
    { kind: 'gang', gangType: GangType.AN, from: 2, to: 0, amount: 2 },
    { kind: 'hu', zimo: false, from: 3, to: 0, amount: 5, order: 1 },
  );
  table.scores = [9, -2, -2, -5];
  table.huOrder = [0];
  table.huCount = [1, 0, 0, 0];

  const rep = checkMahjongSettlements(table);
  assert.equal(rep.gangTotal[0], 4);
  assert.equal(rep.huTotal[0], 5);
  assert.equal(rep.reconstructed[0], 9);
  assert.equal(rep.huOrder[0], 0);
  assert.equal(rep.finished, false);
});

test('deck size 108', () => {
  assert.equal(createSichuanDeck().length, 108);
});
