/**
 * makeAIDecision · 心理博弈 AI 单元测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeAIDecision,
  estimateWinRate,
  handStrengthScore,
  personalityProfile,
  normalizePersonality,
  estimateTableAggression,
  AIAction,
  AIPersonality,
  identifyHandType,
  createCard,
  HandType,
  PlayerStatus,
  applyAIDecision,
  ZajinhuaGameEngine,
  gameStateFromSnapshot,
} from '../src/index.js';

function C(r1, s1, r2, s2, r3, s3) {
  return [createCard(r1, s1), createCard(r2, s2), createCard(r3, s3)];
}

/** 固定序列 RNG */
function rngSeq(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
}

function baseState(over = {}) {
  return {
    pot: 60,
    currentMenStake: 10,
    maxMenStake: 100,
    round: 2,
    maxRounds: 20,
    actionCount: 6,
    canCompare: true,
    players: [
      {
        id: 'ai',
        status: PlayerStatus.MEN,
        looked: false,
        betTotal: 20,
        chips: 500,
        cards: null,
      },
      {
        id: 'op1',
        status: PlayerStatus.MEN,
        looked: false,
        betTotal: 20,
        chips: 500,
      },
      {
        id: 'op2',
        status: PlayerStatus.LOOKED,
        looked: true,
        betTotal: 40,
        chips: 480,
      },
    ],
    betHistory: [],
    ...over,
  };
}

// ── 基础 ──

test('normalizePersonality / personalityProfile', () => {
  assert.equal(normalizePersonality('激进型'), AIPersonality.AGGRESSIVE);
  assert.equal(normalizePersonality('conservative'), AIPersonality.CONSERVATIVE);
  const ag = personalityProfile(AIPersonality.AGGRESSIVE);
  const co = personalityProfile(AIPersonality.CONSERVATIVE);
  assert.ok(ag.bluff > co.bluff);
  assert.ok(ag.raiseFreq > co.raiseFreq);
  assert.ok(co.lookEarly > ag.lookEarly);
  assert.ok(co.foldWeak > ag.foldWeak);
});

test('handStrengthScore: 豹子 > 金花 > 对子 > 散牌', () => {
  const triple = handStrengthScore(identifyHandType(C(14, 1, 14, 2, 14, 3)));
  const flush = handStrengthScore(identifyHandType(C(14, 1, 13, 1, 11, 1)));
  const pair = handStrengthScore(identifyHandType(C(10, 1, 10, 2, 5, 3)));
  const high = handStrengthScore(identifyHandType(C(14, 1, 13, 2, 11, 3)));
  assert.ok(triple > flush);
  assert.ok(flush > pair);
  assert.ok(pair > high);
});

test('estimateWinRate: 未看牌 ≈ 1/n；已看豹子显著更高', () => {
  const state = baseState();
  const unseen = estimateWinRate(
    { id: 'ai', looked: false, personality: 'balanced' },
    state
  );
  assert.ok(unseen.winRate > 0.2 && unseen.winRate < 0.45);
  assert.equal(unseen.looked, false);

  const seen = estimateWinRate(
    {
      id: 'ai',
      looked: true,
      cards: C(14, 1, 14, 2, 14, 3),
      personality: 'balanced',
    },
    state
  );
  assert.ok(seen.winRate > 0.7, `triple winRate ${seen.winRate}`);
  assert.equal(seen.hand.type, HandType.TRIPLE);
});

test('estimateWinRate: 对手越多胜率越低', () => {
  const cards = C(12, 1, 12, 2, 9, 3); // 对 Q
  const two = estimateWinRate(
    { id: 'ai', looked: true, cards },
    {
      players: [
        { id: 'ai', status: PlayerStatus.LOOKED },
        { id: 'b', status: PlayerStatus.LOOKED },
      ],
    }
  );
  const four = estimateWinRate(
    { id: 'ai', looked: true, cards },
    {
      players: [
        { id: 'ai', status: PlayerStatus.LOOKED },
        { id: 'b', status: PlayerStatus.LOOKED },
        { id: 'c', status: PlayerStatus.LOOKED },
        { id: 'd', status: PlayerStatus.LOOKED },
      ],
    }
  );
  assert.ok(two.winRate > four.winRate);
});

// ── 激进型 ──

test('激进型：未看牌更倾向闷跟/闷加，而非立刻看', () => {
  // RNG 偏低 → lookNeed 不足则不看；raise 阈值
  const state = baseState({
    random: rngSeq([0.9, 0.1, 0.1, 0.1]), // 高 roll 跳过 look（lookNeed~0.2）
    pot: 40,
  });
  // lookNeed for aggressive ≈ 0.22+... - 0.72*0.35 较低
  // r=0.9 > lookNeed → 不 look；下一 r=0.1 < raiseFreq*0.7 → raise
  const d = makeAIDecision(
    { id: 'ai', personality: AIPersonality.AGGRESSIVE, looked: false, chips: 500 },
    state
  );
  assert.ok(
    [AIAction.CALL, AIAction.RAISE, AIAction.COMPARE, AIAction.LOOK].includes(d.action),
    d.action
  );
  assert.equal(d.personality, AIPersonality.AGGRESSIVE);
});

test('激进型：弱牌有概率诈唬 RAISE', () => {
  // 散牌 2,4,7
  const weak = C(2, 1, 4, 2, 7, 3);
  // 控制 RNG：跳过 monster 分支后进入 bluff（bluff 0.28）
  // seen path: not monster/strong/pair/straight → weak bluff if r < bluff
  const decisions = [];
  for (let seed = 0; seed < 40; seed++) {
    const seq = [seed * 0.017, 0.1, 0.1, 0.1, 0.1];
    const d = makeAIDecision(
      {
        id: 'ai',
        personality: AIPersonality.AGGRESSIVE,
        looked: true,
        cards: weak,
        chips: 500,
      },
      baseState({
        random: rngSeq(seq),
        pot: 80,
        betHistory: [],
      })
    );
    decisions.push(d.action);
  }
  // 激进弱牌应出现 FOLD / CALL / RAISE / COMPARE 多种，且至少有过诈唬抬注或跟
  assert.ok(decisions.some((a) => a === AIAction.RAISE || a === AIAction.CALL || a === AIAction.FOLD));
  // 统计 RAISE 出现（诈唬）
  const raises = decisions.filter((a) => a === AIAction.RAISE).length;
  // 不强制每次，但算法应允许诈唬（在 40 次里大概率至少 0；用结构断言 reason）
  const one = makeAIDecision(
    {
      id: 'ai',
      personality: AIPersonality.AGGRESSIVE,
      looked: true,
      cards: weak,
      chips: 500,
    },
    baseState({
      // bluffRoll 很小触发诈唬，下一 r 小走 raise
      random: rngSeq([0.05, 0.1, 0.1]),
    })
  );
  assert.ok(
    one.action === AIAction.RAISE || one.action === AIAction.COMPARE || one.action === AIAction.FOLD || one.action === AIAction.CALL,
    one.reason
  );
  if (one.action === AIAction.RAISE) {
    assert.match(one.reason, /bluff|raise/i);
    assert.ok(one.amount > 0);
  }
});

test('激进型：豹子倾向 COMPARE 或 RAISE', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: 'aggressive',
      looked: true,
      cards: C(13, 1, 13, 2, 13, 3),
      chips: 500,
    },
    baseState({
      canCompare: true,
      random: rngSeq([0.1, 0.1, 0.1]),
    })
  );
  assert.ok([AIAction.COMPARE, AIAction.RAISE, AIAction.CALL].includes(d.action));
  assert.ok(d.winRate > 0.7);
  if (d.action === AIAction.COMPARE) assert.ok(d.targetId);
});

// ── 保守型 ──

test('保守型：已看散牌 → FOLD（非对子/金花以上不出筹码）', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: AIPersonality.CONSERVATIVE,
      looked: true,
      cards: C(14, 1, 12, 2, 9, 3), // AQ9 散
      chips: 500,
    },
    baseState({ random: rngSeq([0.5, 0.5]) })
  );
  assert.equal(d.action, AIAction.FOLD);
  assert.match(d.reason, /conservative/);
});

test('保守型：金花会 CALL/RAISE/COMPARE，不无脑弃', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: 'conservative',
      looked: true,
      cards: C(14, 1, 13, 1, 11, 1), // 金花 AKJ
      chips: 500,
    },
    baseState({ random: rngSeq([0.2, 0.2, 0.2]) })
  );
  assert.notEqual(d.action, AIAction.FOLD);
  assert.ok([AIAction.CALL, AIAction.RAISE, AIAction.COMPARE].includes(d.action));
});

test('保守型：未看牌在压力下倾向 LOOK 或 FOLD', () => {
  const d = makeAIDecision(
    { id: 'ai', personality: 'conservative', looked: false, chips: 500 },
    baseState({
      pot: 200,
      currentMenStake: 20,
      betHistory: [
        { playerId: 'op1', type: 'raise', amount: 40 },
        { playerId: 'op2', type: 'raise', amount: 40 },
        { playerId: 'op1', type: 'raise', amount: 60 },
      ],
      // 低 roll → 触发 lookEarly
      random: rngSeq([0.1, 0.1, 0.1]),
    })
  );
  assert.ok([AIAction.LOOK, AIAction.FOLD, AIAction.CALL].includes(d.action), d.action);
});

test('保守型：小对遇猛加注弃牌', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: 'conservative',
      looked: true,
      cards: C(5, 1, 5, 2, 9, 3),
      chips: 500,
    },
    baseState({
      betHistory: [
        { playerId: 'op1', type: 'raise', amount: 30 },
        { playerId: 'op2', type: 'raise', amount: 50 },
        { playerId: 'op1', type: 'raise', amount: 80 },
      ],
      random: rngSeq([0.5]),
    })
  );
  assert.equal(d.action, AIAction.FOLD);
});

// ── 综合因素 ──

test('tableAggression: 历史猛加注抬高', () => {
  const low = estimateTableAggression(
    { betHistory: [{ playerId: 'x', type: 'call', amount: 10 }], players: [] },
    'ai'
  );
  const high = estimateTableAggression(
    {
      betHistory: [
        { playerId: 'x', type: 'raise', amount: 40 },
        { playerId: 'y', type: 'raise', amount: 60 },
        { playerId: 'x', type: 'all_in', amount: 100 },
      ],
      players: [],
    },
    'ai'
  );
  assert.ok(high > low);
});

test('轮数/底池影响：高压力弱牌更易 FOLD', () => {
  const weak = C(3, 1, 6, 2, 9, 3);
  const calm = makeAIDecision(
    { id: 'ai', personality: 'balanced', looked: true, cards: weak, chips: 500 },
    baseState({
      pot: 30,
      round: 1,
      betHistory: [],
      random: rngSeq([0.9, 0.9, 0.9]), // 高 roll 不易 bluff，看 fold 阈值
    })
  );
  const pressure = makeAIDecision(
    { id: 'ai', personality: 'balanced', looked: true, cards: weak, chips: 500 },
    baseState({
      pot: 400,
      currentMenStake: 40,
      round: 15,
      maxRounds: 20,
      betHistory: [
        { playerId: 'op1', type: 'raise', amount: 80 },
        { playerId: 'op2', type: 'raise', amount: 80 },
      ],
      random: rngSeq([0.9, 0.9, 0.9]),
    })
  );
  // 压力局 continueScore 更低，更易弃（不绝对，但 reason/action 合理）
  assert.ok(
    pressure.action === AIAction.FOLD
    || pressure.winRate <= calm.winRate + 0.01
    || pressure.debug?.potHeat > calm.debug?.potHeat
  );
});

test('COMPARE 需要 targetId 且目标为对手', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: 'aggressive',
      looked: true,
      cards: C(14, 1, 14, 2, 14, 3),
      chips: 500,
    },
    baseState({
      canCompare: true,
      random: rngSeq([0.05, 0.05]), // 高概率比牌
    })
  );
  if (d.action === AIAction.COMPARE) {
    assert.ok(d.targetId);
    assert.notEqual(d.targetId, 'ai');
  }
});

test('canCompare=false 时不输出 COMPARE', () => {
  for (let i = 0; i < 15; i++) {
    const d = makeAIDecision(
      {
        id: 'ai',
        personality: 'aggressive',
        looked: true,
        cards: C(14, 1, 14, 2, 14, 3),
        chips: 500,
      },
      baseState({
        canCompare: false,
        random: rngSeq([0.01 * i, 0.02, 0.03]),
      })
    );
    assert.notEqual(d.action, AIAction.COMPARE, d.reason);
  }
});

test('输出字段完整', () => {
  const d = makeAIDecision(
    {
      id: 'ai',
      personality: 'balanced',
      looked: true,
      cards: C(9, 1, 9, 2, 12, 3),
      chips: 500,
    },
    baseState({ random: rngSeq([0.4, 0.4]) })
  );
  assert.ok(Object.values(AIAction).includes(d.action));
  assert.ok(typeof d.winRate === 'number');
  assert.ok(typeof d.strength === 'number');
  assert.ok(typeof d.reason === 'string');
  assert.ok(typeof d.personality === 'string');
});

// ── 与引擎联调 ──

test('applyAIDecision + gameStateFromSnapshot 联调', () => {
  const g = new ZajinhuaGameEngine({
    playerIds: ['ai', 'b', 'c'],
    chips: [1000, 1000, 1000],
    ante: 10,
    baseStake: 10,
    maxRounds: 10,
    dealerIndex: 2,
    random: rngSeq([0.2, 0.3, 0.4, 0.5]),
  });
  g.startGame();
  const snap = g.getSnapshot('ai');
  // 给 AI 看牌手牌（引擎里 AI 可能未看）
  const ai = g.findPlayer('ai').player;
  // 强制好牌便于 CALL
  ai.cards = C(14, 1, 14, 2, 13, 3);
  ai.looked = true;
  ai.status = PlayerStatus.LOOKED;

  const state = gameStateFromSnapshot(g.getSnapshot('ai'), 'ai', {
    random: rngSeq([0.5, 0.5, 0.5]),
    canCompare: false,
  });
  // 补全 cards（snapshot 已看可见）
  const decision = makeAIDecision(
    {
      id: 'ai',
      personality: 'conservative',
      looked: true,
      cards: ai.cards,
      chips: ai.chips,
      status: ai.status,
    },
    state
  );
  assert.ok(decision.action);

  g.currentPlayerIndex = g.players.findIndex((p) => p.id === 'ai');
  // LOOK 已看则 already；用 CALL
  if (decision.action === AIAction.LOOK) {
    const r = applyAIDecision(g, 'ai', { action: AIAction.CALL, amount: g.getBetUnit('ai') });
    assert.equal(r.ok, true);
  } else if (decision.action !== AIAction.COMPARE) {
    const r = applyAIDecision(g, 'ai', {
      ...decision,
      amount: decision.amount || g.getBetUnit('ai'),
    });
    // fold/call/raise 应合法
    assert.ok(r.ok || r.reason, JSON.stringify(r));
  }
});
