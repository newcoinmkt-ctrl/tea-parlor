/**
 * ZajinhuaGameEngine 状态机 · 多轮下注 / 筹码 / 比牌
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ZajinhuaGameEngine,
  GamePhase,
  PlayerStatus,
  createCard,
} from '../src/index.js';

/** 固定随机：可复现发牌顺序 */
function rngSeq(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return typeof v === 'number' ? v : 0.5;
  };
}

function makeEngine(over = {}) {
  return new ZajinhuaGameEngine({
    playerIds: ['a', 'b', 'c'],
    playerNames: ['甲', '乙', '丙'],
    chips: [1000, 1000, 1000],
    ante: 10,
    baseStake: 10,
    maxMenStake: 100,
    maxRounds: 20,
    dealerIndex: 0,
    random: rngSeq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.15]),
    ...over,
  });
}

// ── 开局 ──

test('startGame: 底注入池、进入 BETTING、手牌 3 张', () => {
  const g = makeEngine();
  assert.equal(g.phase, GamePhase.WAITING);
  const r = g.startGame();
  assert.equal(r.ok, true);
  assert.equal(g.phase, GamePhase.BETTING);
  assert.equal(g.pot, 30); // 3 * ante 10
  for (const p of g.players) {
    assert.equal(p.cards.length, 3);
    assert.equal(p.status, PlayerStatus.MEN);
    assert.equal(p.betTotal, 10);
    assert.equal(p.chips, 990);
  }
  // pot 精确
  const sum = g.players.reduce((s, p) => s + p.betTotal, 0);
  assert.equal(sum, g.pot);
});

test('筹码不足底注无法开局', () => {
  const g = makeEngine({ chips: [5, 1000, 1000], ante: 10 });
  const r = g.startGame();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient_chips');
  assert.equal(g.phase, GamePhase.WAITING);
});

// ── 看牌倍率 ──

test('lookCards: MEN → LOOKED；看牌单注 = 闷注 × 2', () => {
  const g = makeEngine();
  g.startGame();
  const cur = g.players[g.currentPlayerIndex];
  const unitMen = g.getBetUnit(cur.id);
  assert.equal(unitMen, 10);

  const look = g.lookCards(cur.id);
  assert.equal(look.ok, true);
  assert.equal(cur.status, PlayerStatus.LOOKED);
  assert.equal(g.getBetUnit(cur.id), 20);
  assert.equal(g.getCompareCost(cur.id), 40); // 单注×2
});

test('bet: 看牌必须下闷牌的 2 倍；闷牌跟注=当前闷注', () => {
  const g = makeEngine();
  g.startGame();
  const id = g.players[g.currentPlayerIndex].id;

  // 闷跟 10
  let r = g.bet(id, 10);
  assert.equal(r.ok, true);
  assert.equal(g.pot, 40);

  // 下家看牌后试图闷额 10 → 失败
  const id2 = g.players[g.currentPlayerIndex].id;
  g.lookCards(id2);
  r = g.bet(id2, 10);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'below_min');
  assert.equal(r.min, 20);

  r = g.bet(id2, 20);
  assert.equal(r.ok, true);
  assert.equal(g.pot, 60);
});

test('bet: 加注提高 currentMenStake；超过 maxMenStake 拒绝', () => {
  const g = makeEngine({ maxMenStake: 50 });
  g.startGame();
  const id = g.players[g.currentPlayerIndex].id;

  let r = g.bet(id, 30); // 闷加到 30
  assert.equal(r.ok, true);
  assert.equal(g.currentMenStake, 30);

  const id2 = g.players[g.currentPlayerIndex].id;
  r = g.bet(id2, 60); // 闷加到 60 > max 50
  assert.equal(r.ok, false);

  r = g.bet(id2, 50);
  assert.equal(r.ok, true);
  assert.equal(g.currentMenStake, 50);

  // 看牌加注：100 = 闷 50 上限×2
  const id3 = g.players[g.currentPlayerIndex].id;
  g.lookCards(id3);
  r = g.bet(id3, 100);
  assert.equal(r.ok, true);
  assert.equal(g.currentMenStake, 50);
});

test('bet: 非当前回合 / 错误金额', () => {
  const g = makeEngine();
  g.startGame();
  const other = g.players.find((p) => p.id !== g.players[g.currentPlayerIndex].id);
  assert.equal(g.bet(other.id, 10).ok, false);
  assert.equal(g.bet(g.players[g.currentPlayerIndex].id, 0).reason, 'invalid_amount');
});

// ── 弃牌与仅剩一人 ──

test('fold: 连续弃牌至仅剩 1 人 → 结算，赢家收 pot', () => {
  const g = makeEngine();
  g.startGame();
  const pot0 = g.pot; // 30

  // 三人依次：弃、弃 → 剩一人
  let id = g.players[g.currentPlayerIndex].id;
  let r = g.fold(id);
  assert.equal(r.ok, true);
  assert.equal(g.phase, GamePhase.BETTING);

  id = g.players[g.currentPlayerIndex].id;
  r = g.fold(id);
  assert.equal(r.ok, true);
  assert.equal(r.settled, true);
  assert.equal(g.phase, GamePhase.SETTLING);
  assert.ok(g.winnerId);

  const w = g.findPlayer(g.winnerId).player;
  // 赢家筹码 = 1000 - ante + pot
  assert.equal(w.chips, 1000 - 10 + pot0);
  // 输家仅扣底注
  for (const p of g.players) {
    if (p.id !== g.winnerId) {
      assert.equal(p.chips, 990);
      assert.equal(p.status, PlayerStatus.FOLDED);
    }
  }
  // 零和
  const total = g.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(total, 3000);
  const deltas = g.settleDeltas();
  const dsum = Object.values(deltas).reduce((a, b) => a + b, 0);
  assert.equal(dsum, 0);
  assert.equal(g.getSnapshot().potCheck.pot, g.getSnapshot().potCheck.sumBets);
});

// ── 比牌 ──

test('comparePlayerCards: 费用=单注×2，输者 LOST，可至结算', () => {
  const g = makeEngine({ allowCompareFirstRound: true });
  g.startGame();

  // 指定手牌：甲 AAA，乙 散牌，丙 散牌
  g.players[0].cards = [
    createCard(14, 1), createCard(14, 2), createCard(14, 3),
  ];
  g.players[1].cards = [
    createCard(2, 1), createCard(4, 2), createCard(7, 3),
  ];
  g.players[2].cards = [
    createCard(3, 1), createCard(5, 2), createCard(8, 3),
  ];

  // 轮到谁就让他比
  g.currentPlayerIndex = 0;
  const cost = g.getCompareCost('a'); // 闷 10 → 比牌 20
  assert.equal(cost, 20);

  const chipsBefore = g.players[0].chips;
  const potBefore = g.pot;
  const r = g.comparePlayerCards('a', 'b');
  assert.equal(r.ok, true);
  assert.equal(r.cost, 20);
  assert.equal(r.winnerId, 'a');
  assert.equal(r.loserId, 'b');
  assert.equal(g.findPlayer('b').player.status, PlayerStatus.LOST);
  assert.equal(g.players[0].chips, chipsBefore - 20);
  assert.equal(g.pot, potBefore + 20);
  assert.equal(g.phase, GamePhase.BETTING); // 还有丙

  // 再比掉丙
  g.currentPlayerIndex = 0;
  const r2 = g.comparePlayerCards('a', 'c');
  assert.equal(r2.ok, true);
  assert.equal(r2.settled, true);
  assert.equal(g.phase, GamePhase.SETTLING);
  assert.equal(g.winnerId, 'a');
});

test('comparePlayerCards: 不可对弃牌/淘汰目标；非本人回合拒绝', () => {
  const g = makeEngine({ allowCompareFirstRound: true });
  g.startGame();
  g.currentPlayerIndex = 0;
  // 先让 b 弃牌：需要轮到 b
  g.currentPlayerIndex = 1;
  g.fold('b');
  assert.equal(g.findPlayer('b').player.status, PlayerStatus.FOLDED);

  // 轮到下家
  const cur = g.players[g.currentPlayerIndex].id;
  if (cur === 'a' || cur === 'c') {
    const r = g.comparePlayerCards(cur, 'b');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'target_not_active');
  }
});

test('comparePlayerCards: 看牌后比牌费用加倍', () => {
  const g = makeEngine({ allowCompareFirstRound: true });
  g.startGame();
  g.currentPlayerIndex = 0;
  g.lookCards('a');
  assert.equal(g.getCompareCost('a'), 40); // 20*2
  g.players[0].cards = [createCard(13, 1), createCard(13, 2), createCard(13, 3)];
  g.players[1].cards = [createCard(2, 1), createCard(3, 2), createCard(4, 3)];
  const potBefore = g.pot;
  const r = g.comparePlayerCards('a', 'b');
  assert.equal(r.ok, true);
  assert.equal(r.cost, 40);
  assert.equal(g.pot, potBefore + 40);
});

test('第一轮默认不可比牌', () => {
  const g = makeEngine({ allowCompareFirstRound: false });
  g.startGame();
  g.currentPlayerIndex = 0;
  const r = g.comparePlayerCards('a', 'b');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too_early');
});

// ── 轮数上限 ──

test('maxRounds 强制开牌结算', () => {
  const g = makeEngine({ maxRounds: 1, baseStake: 10 });
  g.startGame();
  // round 从 1 开始；三人各行动一次后 round→2 > 1 → showdown
  for (let i = 0; i < 3; i++) {
    const id = g.players[g.currentPlayerIndex].id;
    if (g.phase !== GamePhase.BETTING) break;
    const unit = g.getBetUnit(id);
    g.bet(id, unit);
  }
  assert.equal(g.phase, GamePhase.SETTLING);
  assert.ok(g.winnerId);
  const total = g.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(total, 3000, '筹码守恒');
});

// ── 快照与状态 ──

test('getSnapshot: 未看牌不可见他人手牌；结算后全亮', () => {
  const g = makeEngine();
  g.startGame();
  const snapA = g.getSnapshot('a');
  const me = snapA.players.find((p) => p.id === 'a');
  const other = snapA.players.find((p) => p.id === 'b');
  // a 未看 → 自己也看不到
  assert.equal(me.cards, null);
  assert.equal(other.cards, null);

  g.lookCards('a');
  const snap2 = g.getSnapshot('a');
  assert.equal(snap2.players.find((p) => p.id === 'a').cards.length, 3);
  assert.equal(snap2.players.find((p) => p.id === 'b').cards, null);

  // 弃到结算
  g.currentPlayerIndex = g.players.findIndex((p) => p.id === 'a');
  g.fold('a');
  const cur = g.players[g.currentPlayerIndex].id;
  g.fold(cur);
  assert.equal(g.phase, GamePhase.SETTLING);
  const snapEnd = g.getSnapshot('a');
  assert.ok(snapEnd.players.every((p) => p.cards && p.cards.length === 3));
});

test('pot 全程与 betTotal 之和一致', () => {
  const g = makeEngine();
  g.startGame();
  for (let i = 0; i < 6; i++) {
    if (g.phase !== GamePhase.BETTING) break;
    const id = g.players[g.currentPlayerIndex].id;
    if (i === 2) {
      g.lookCards(id);
    }
    if (i === 4) {
      g.fold(id);
      continue;
    }
    const unit = g.getBetUnit(id);
    const r = g.bet(id, unit);
    if (!r.ok) break;
    const sum = g.players.reduce((s, p) => s + p.betTotal, 0);
    assert.equal(sum, g.pot, `step ${i} pot mismatch`);
  }
});

test('reset 回到 WAITING', () => {
  const g = makeEngine();
  g.startGame();
  g.reset();
  assert.equal(g.phase, GamePhase.WAITING);
  assert.equal(g.pot, 0);
  assert.ok(g.players.every((p) => p.cards.length === 0));
});
