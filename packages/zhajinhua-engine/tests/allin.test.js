/**
 * All-in 引擎集成测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ZajinhuaGameEngine,
  GamePhase,
  PlayerStatus,
  createCard,
  settleAllPots,
} from '../src/index.js';

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
    chips: [100, 500, 500],
    ante: 10,
    baseStake: 50,
    maxMenStake: 200,
    maxRounds: 20,
    dealerIndex: 2, // 庄丙 → 甲先手
    random: rngSeq([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
    allowCompareFirstRound: true,
    ...over,
  });
}

test('筹码不足当前单注时 bet 提示 canAllIn', () => {
  const g = makeEngine({ chips: [30, 500, 500], baseStake: 50, ante: 10 });
  g.startGame();
  // 甲 chips=20, 单注 50
  g.currentPlayerIndex = 0;
  assert.ok(g.canAllIn('a'));
  const r = g.bet('a', 50);
  assert.equal(r.ok, false);
  assert.equal(r.canAllIn, true);
});

test('allIn: 投入全部筹码，状态 ALL_IN，不再行动', () => {
  const g = makeEngine({ chips: [30, 500, 500], baseStake: 50, ante: 10 });
  g.startGame();
  // 甲 30-10=20
  g.currentPlayerIndex = 0;
  const r = g.allIn('a');
  assert.equal(r.ok, true);
  assert.equal(r.amount, 20);
  const pa = g.findPlayer('a').player;
  assert.equal(pa.chips, 0);
  assert.equal(pa.status, PlayerStatus.ALL_IN);
  assert.equal(pa.allIn, true);
  assert.equal(pa.betTotal, 30); // ante 10 + 20
  // 甲不在 acting 列表
  assert.ok(!g.actingPlayers().some((p) => p.id === 'a'));
  assert.ok(g.contendingPlayers().some((p) => p.id === 'a'));
});

test('All-in 后仅一人可行动 → 立即开牌边池结算', () => {
  const g = makeEngine({
    chips: [40, 40, 500],
    baseStake: 20,
    ante: 10,
    dealerIndex: 2,
  });
  g.startGame();
  // 各 30 chips 后；甲 all-in，乙 all-in，仅丙可行动 → showdown
  g.currentPlayerIndex = 0;
  g.allIn('a');
  if (g.phase === GamePhase.BETTING) {
    g.currentPlayerIndex = g.players.findIndex((p) => p.id === g.players[g.currentPlayerIndex].id);
    // 推进到乙
    const cur = g.players[g.currentPlayerIndex].id;
    if (cur === 'b') g.allIn('b');
    else if (g.phase === GamePhase.BETTING) {
      // 可能已因「仅一人+allin」结算
    }
  }
  // 若还在下注且轮到乙
  if (g.phase === GamePhase.BETTING) {
    const cur = g.players[g.currentPlayerIndex].id;
    if (cur === 'b') g.allIn('b');
  }

  assert.equal(g.phase, GamePhase.SETTLING);
  assert.ok(g.lastSettlement);
  assert.equal(g.lastSettlement.totalPot, g.pot);
  const sumAwards = Object.values(g.lastSettlement.awards).reduce((a, b) => a + b, 0);
  assert.equal(sumAwards, g.pot);
  // 筹码守恒（开局 40+40+500）
  const total = g.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(total, 580);
});

test('短码 All-in 只分主池：引擎集成', () => {
  const g = makeEngine({
    chips: [50, 200, 200],
    ante: 10,
    baseStake: 10,
    dealerIndex: 2,
  });
  g.startGame();
  // 强制手牌
  g.players[0].cards = [createCard(14, 1), createCard(14, 2), createCard(14, 3)]; // AAA
  g.players[1].cards = [createCard(2, 1), createCard(4, 2), createCard(7, 3)];
  g.players[2].cards = [createCard(13, 1), createCard(13, 2), createCard(13, 3)]; // KKK

  // 甲 all-in 剩余 40
  g.currentPlayerIndex = 0;
  g.allIn('a');
  assert.equal(g.findPlayer('a').player.betTotal, 50);

  // 乙、丙继续下注抬高边池
  if (g.phase === GamePhase.BETTING) {
    // 可能已 showdown（仅…）三人：甲 all-in，乙丙 acting → 继续
    assert.equal(g.phase, GamePhase.BETTING);
    // 乙跟/加 40 闷（与甲对齐后再加）
    // 当前闷注仍 10；为构造边池让乙丙各多下
    let guard = 0;
    while (g.phase === GamePhase.BETTING && guard++ < 10) {
      const id = g.players[g.currentPlayerIndex].id;
      if (id === 'a') break;
      const unit = g.getBetUnit(id);
      // 加注到较高
      const raise = id === 'b' ? Math.min(40, g.options.maxMenStake) : unit;
      const looked = g.findPlayer(id).player.looked;
      if (!looked && raise >= unit) {
        const r = g.bet(id, raise);
        if (!r.ok) g.bet(id, unit);
      } else {
        g.bet(id, unit);
      }
      if (g.actingPlayers().length <= 1) break;
    }
    if (g.phase === GamePhase.BETTING) {
      g.forceShowdown('test');
    }
  }

  assert.equal(g.phase, GamePhase.SETTLING);
  const awards = g.lastSettlement.awards;
  // 甲 AAA 应至少赢到主池份额 > 0
  assert.ok(awards.a > 0, 'short all-in with AAA wins main pot share');
  // 甲获奖不超过「其投入相关」：awards.a <= 其 betTotal * 人数 粗上界
  // 更严：甲不应独吞整池若乙丙投入更多
  const pot = g.pot;
  if (g.findPlayer('b').player.betTotal > g.findPlayer('a').player.betTotal) {
    assert.ok(awards.a < pot || awards.c > 0 || awards.b > 0);
  }
  assert.equal(Object.values(awards).reduce((a, b) => a + b, 0), pot);
});

test('getSnapshot 含 pots 与 canAllIn', () => {
  const g = makeEngine({ chips: [25, 500, 500], baseStake: 50, ante: 10 });
  g.startGame();
  g.currentPlayerIndex = 0;
  const snap = g.getSnapshot('a');
  assert.ok(Array.isArray(snap.pots));
  assert.equal(snap.players.find((p) => p.id === 'a').canAllIn, true);
});

test('静态 settleAllPots 与实例方法一致', () => {
  const players = [
    {
      id: 'a',
      betTotal: 25,
      status: PlayerStatus.ALL_IN,
      cards: [createCard(14, 1), createCard(14, 2), createCard(14, 3)],
    },
    {
      id: 'b',
      betTotal: 80,
      status: PlayerStatus.LOOKED,
      cards: [createCard(9, 1), createCard(9, 2), createCard(3, 3)],
    },
  ];
  const r1 = settleAllPots(players);
  const r2 = ZajinhuaGameEngine.settleAllPots(players);
  assert.deepEqual(r1.awards, r2.awards);
  assert.equal(r1.awards.a, 50); // main 25*2
  assert.equal(r1.awards.b, 55); // side 55
});

test('全员 All-in 后开牌，筹码守恒', () => {
  const g = new ZajinhuaGameEngine({
    playerIds: ['a', 'b'],
    chips: [100, 100],
    ante: 10,
    baseStake: 30,
    maxRounds: 5,
    dealerIndex: 1,
    random: rngSeq([0.1, 0.2, 0.3, 0.4]),
  });
  g.startGame();
  g.currentPlayerIndex = 0;
  g.allIn('a');
  // 两人：甲 all-in 后仅乙可行动 → 立即 showdown
  assert.equal(g.phase, GamePhase.SETTLING);
  const total = g.players.reduce((s, p) => s + p.chips, 0);
  assert.equal(total, 200);
});
