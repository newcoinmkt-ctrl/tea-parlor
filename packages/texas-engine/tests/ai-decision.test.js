/**
 * 德州 AI · Equity / Pot Odds / 风格决策
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCard,
  calculateEquity,
  calculatePotOdds,
  calculateCallEV,
  shouldCallByOdds,
  detectDraws,
  preflopStrength,
  styleProfile,
  normalizePokerStyle,
  makePokerAIDecision,
  PokerStyle,
  PokerAction,
  remainingDeck,
} from '../src/index.js';

const C = (r, s) => createCard(r, s);

function rngSeq(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return typeof v === 'number' ? v : 0.5;
  };
}

function makePseudo(seed, n = 50000) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const out = [];
  for (let i = 0; i < n; i++) {
    s = (s * 48271) % 2147483647;
    out.push(s / 2147483647);
  }
  return out;
}

// ── Equity ──

test('calculateEquity: AA vs 1 人 preflop 应显著 > 50%', () => {
  const hole = [C(14, 1), C(14, 2)];
  const r = calculateEquity(hole, [], 1, {
    simulations: 1200,
    random: rngSeq(makePseudo(11)),
  });
  assert.ok(r.equity > 0.75, `AA equity=${r.equity}`);
  assert.equal(r.simulations, 1200);
});

test('calculateEquity: 22 vs 多人 equity 下降', () => {
  const hole = [C(2, 1), C(2, 2)];
  const one = calculateEquity(hole, [], 1, {
    simulations: 800,
    random: rngSeq(makePseudo(3)),
  });
  const three = calculateEquity(hole, [], 3, {
    simulations: 800,
    random: rngSeq(makePseudo(3)),
  });
  assert.ok(one.equity > three.equity, `${one.equity} vs ${three.equity}`);
});

test('calculateEquity: Flop 坚果同花 equity 很高', () => {
  const hole = [C(14, 1), C(13, 1)];
  const board = [C(12, 1), C(5, 1), C(2, 2)];
  const r = calculateEquity(hole, board, 1, {
    simulations: 600,
    random: rngSeq(makePseudo(7)),
  });
  assert.ok(r.equity > 0.7, `nut flush draw/made? equity=${r.equity}`);
});

test('calculateEquity: 非法入参抛错', () => {
  assert.throws(() => calculateEquity([C(14, 1)], [], 1));
});

test('remainingDeck 去掉已知牌', () => {
  const d = remainingDeck([C(14, 1), C(13, 1)]);
  assert.equal(d.length, 50);
});

// ── Pot Odds / EV ──

test('calculatePotOdds: 100 池 call 50 → 1/3', () => {
  const o = calculatePotOdds(100, 50);
  assert.ok(Math.abs(o.potOdds - 50 / 150) < 1e-9);
  assert.equal(o.breakEvenEquity, o.potOdds);
});

test('calculateCallEV: equity 高于 pot odds → +EV', () => {
  const ev = calculateCallEV(0.4, 100, 50); // need 33%
  assert.ok(ev.isPositiveEV);
  assert.ok(ev.ev > 0);
  assert.ok(shouldCallByOdds(0.4, 50 / 150));
  assert.ok(!shouldCallByOdds(0.2, 50 / 150));
});

test('callAmount=0 时 potOdds=0 且 +EV', () => {
  const o = calculatePotOdds(80, 0);
  assert.equal(o.potOdds, 0);
  const ev = calculateCallEV(0.3, 80, 0);
  assert.equal(ev.isPositiveEV, true);
});

// ── Draws ──

test('detectDraws: 同花听牌', () => {
  const hole = [C(14, 1), C(9, 1)];
  const board = [C(2, 1), C(7, 1), C(3, 2)];
  const d = detectDraws(hole, board);
  assert.equal(d.flushDraw, true);
  assert.ok(d.outs >= 9);
});

test('preflopStrength: AA > 72o', () => {
  assert.ok(preflopStrength([C(14, 1), C(14, 2)]) > preflopStrength([C(7, 1), C(2, 2)]));
  assert.ok(preflopStrength([C(14, 1), C(13, 1)]) > preflopStrength([C(14, 1), C(3, 2)]));
});

// ── 风格 ──

test('normalizePokerStyle / styleProfile', () => {
  assert.equal(normalizePokerStyle('Tight-Aggressive'), PokerStyle.TAG);
  assert.equal(normalizePokerStyle('lag'), PokerStyle.LAG);
  const tag = styleProfile(PokerStyle.TAG);
  const lag = styleProfile(PokerStyle.LAG);
  assert.ok(lag.vpip > tag.vpip);
  assert.ok(lag.bluff >= tag.bluff);
  assert.ok(tag.cbet > 0.5);
});

// ── makePokerAIDecision ──

test('强牌面对下注倾向 CALL/RAISE', () => {
  const d = makePokerAIDecision(
    {
      id: 'ai',
      holeCards: [C(14, 1), C(14, 2)],
      style: PokerStyle.TAG,
      chips: 1000,
    },
    {
      communityCards: [C(14, 3), C(8, 2), C(3, 1)],
      pot: 100,
      callAmount: 30,
      currentBet: 30,
      minRaiseTo: 60,
      bb: 10,
      street: 'flop',
      activeOpponentsCount: 1,
      equitySimulations: 400,
      random: rngSeq(makePseudo(5)),
    }
  );
  assert.ok(
    [PokerAction.CALL, PokerAction.RAISE, PokerAction.ALL_IN, PokerAction.BET].includes(d.action),
    d.action + d.reason
  );
  assert.ok(d.equity > 0.5);
});

test('+EV 跟注：equity 高于 pot odds', () => {
  // 人为高 equity：坚果满
  const d = makePokerAIDecision(
    {
      id: 'ai',
      holeCards: [C(9, 1), C(9, 2)],
      style: PokerStyle.BALANCED,
      chips: 500,
    },
    {
      communityCards: [C(9, 3), C(9, 4), C(2, 1)],
      pot: 90,
      callAmount: 10,
      currentBet: 10,
      minRaiseTo: 20,
      bb: 5,
      street: 'flop',
      activeOpponentsCount: 1,
      equitySimulations: 300,
      random: rngSeq([0.5, 0.5, 0.5]),
    }
  );
  assert.notEqual(d.action, PokerAction.FOLD);
  assert.ok(d.isPositiveEV !== false || d.equity > d.potOdds);
});

test('弱牌面对大注 TAG 倾向弃牌', () => {
  const d = makePokerAIDecision(
    {
      id: 'ai',
      holeCards: [C(7, 1), C(2, 2)],
      style: PokerStyle.TAG,
      chips: 500,
    },
    {
      communityCards: [C(14, 3), C(13, 2), C(12, 1)],
      pot: 50,
      callAmount: 80,
      currentBet: 80,
      minRaiseTo: 160,
      bb: 10,
      street: 'flop',
      activeOpponentsCount: 2,
      equitySimulations: 350,
      random: rngSeq(makePseudo(9)),
    }
  );
  // 多数情况 fold
  assert.ok(
    d.action === PokerAction.FOLD || d.equity < 0.35,
    `${d.action} eq=${d.equity}`
  );
});

test('C-Bet：preflop aggressor 在 flop 可过牌面下注', () => {
  let betCount = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const d = makePokerAIDecision(
      {
        id: 'ai',
        holeCards: [C(14, 1), C(13, 2)],
        style: PokerStyle.TAG,
        chips: 1000,
      },
      {
        communityCards: [C(7, 1), C(2, 3), C(8, 4)],
        pot: 60,
        callAmount: 0,
        currentBet: 0,
        minRaiseTo: 20,
        bb: 10,
        street: 'flop',
        activeOpponentsCount: 1,
        isPreflopAggressor: true,
        equitySimulations: 200,
        random: rngSeq(makePseudo(seed)),
      }
    );
    if (d.action === PokerAction.BET || d.action === PokerAction.RAISE) betCount += 1;
  }
  assert.ok(betCount >= 8, `cbet count ${betCount}/25`);
});

test('半诈唬：听花时可能 BET/RAISE', () => {
  const decisions = [];
  for (let seed = 1; seed <= 30; seed++) {
    const d = makePokerAIDecision(
      {
        id: 'ai',
        holeCards: [C(14, 1), C(10, 1)],
        style: PokerStyle.LAG,
        chips: 1000,
      },
      {
        communityCards: [C(2, 1), C(7, 1), C(9, 3)],
        pot: 80,
        callAmount: 0,
        currentBet: 0,
        minRaiseTo: 20,
        bb: 10,
        street: 'flop',
        activeOpponentsCount: 1,
        equitySimulations: 250,
        random: rngSeq(makePseudo(seed + 50)),
      }
    );
    decisions.push(d);
  }
  assert.ok(
    decisions.some((d) =>
      d.action === PokerAction.BET || d.action === PokerAction.RAISE || d.reason?.includes('semi')
      || d.debug?.draws?.flushDraw)
  );
});

test('Preflop AA TAG 倾向 RAISE', () => {
  const d = makePokerAIDecision(
    {
      id: 'ai',
      holeCards: [C(14, 1), C(14, 2)],
      style: 'tag',
      chips: 1000,
    },
    {
      communityCards: [],
      pot: 15,
      callAmount: 10,
      currentBet: 10,
      minRaiseTo: 20,
      bb: 10,
      street: 'preflop',
      activeOpponentsCount: 2,
      equitySimulations: 300,
      random: rngSeq([0.1, 0.1, 0.1]),
    }
  );
  assert.ok(
    [PokerAction.RAISE, PokerAction.CALL, PokerAction.ALL_IN].includes(d.action),
    d.action
  );
  assert.equal(d.style, PokerStyle.TAG);
});

test('输出字段完整', () => {
  const d = makePokerAIDecision(
    { id: 'ai', holeCards: [C(12, 1), C(12, 2)], style: PokerStyle.BALANCED, chips: 500 },
    {
      pot: 40,
      callAmount: 0,
      communityCards: [C(2, 1), C(5, 2), C(9, 3)],
      street: 'flop',
      activeOpponentsCount: 1,
      bb: 10,
      minRaiseTo: 10,
      equitySimulations: 150,
      random: () => 0.5,
    }
  );
  assert.ok(Object.values(PokerAction).includes(d.action));
  assert.ok(typeof d.equity === 'number');
  assert.ok(typeof d.potOdds === 'number');
  assert.ok(typeof d.reason === 'string');
  assert.ok(typeof d.style === 'string');
});
