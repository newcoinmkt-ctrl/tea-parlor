/**
 * 进贡 / 结算 / AI / 合谋 测试
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  bestGuanDanHand,
  canSuppress,
  HandType,
  TributeStateMachine,
  TributePhase,
  TributeKind,
  resolveTributeKind,
  checkAntiTribute,
  pickTributeCard,
  resolvePassWind,
  calculateLevelProgress,
  GuanDanSettlement,
  makeGuanDanAIDecision,
  GuanDanAIAction,
  suggestWildComposition,
  detectGuanDanCollusion,
  teammateOf,
} from '../src/index.js';

const C = (rank, suit = 1) => createCard(rank, suit);
const H = (rank) => createCard(rank, 3); // 红心

describe('canSuppress 炸弹链', () => {
  it('天王炸 > 同花顺 > 5炸 > 4炸；级牌高于 A', () => {
    const jokers = bestGuanDanHand(
      [createCard(16, 0), createCard(16, 0), createCard(17, 0), createCard(17, 0)],
      10,
    );
    const sf = bestGuanDanHand([C(5, 2), C(6, 2), C(7, 2), C(8, 2), C(9, 2)], 10);
    const b5 = bestGuanDanHand([C(4, 1), C(4, 2), C(4, 3), C(4, 4), H(10)], 10);
    const b4 = bestGuanDanHand([C(14, 1), C(14, 2), C(14, 3), C(14, 4)], 10);
    assert.equal(canSuppress(jokers, sf, 10), true);
    assert.equal(canSuppress(sf, b5, 10), true);
    assert.equal(canSuppress(b5, b4, 10), true);
    assert.equal(canSuppress(b4, sf, 10), false);

    const pair10 = bestGuanDanHand([C(10, 1), C(10, 2)], 10);
    const pairA = bestGuanDanHand([C(14, 1), C(14, 2)], 10);
    assert.equal(canSuppress(pair10, pairA, 10), true); // 级牌 > A
  });
});

describe('进贡状态机', () => {
  it('双下双进贡 + 抗贡（两大王）', () => {
    // 0 头游 2 二游 同队；1 三游 3 末游
    const kind = resolveTributeKind([0, 2, 1, 3]);
    assert.equal(kind.kind, TributeKind.DOUBLE);
    assert.equal(kind.pairs.length, 2);

    const hands = {
      0: [C(3), C(4)],
      1: [C(5), createCard(17, 0)],
      2: [C(6), C(7)],
      3: [C(8), createCard(17, 0)],
    };
    const anti = checkAntiTribute(kind.kind, kind.pairs, hands);
    assert.equal(anti.anti, true);

    const sm = new TributeStateMachine({
      finishOrder: [0, 2, 1, 3],
      hands,
      currentRank: 2,
    });
    const snap = sm.start();
    assert.equal(snap.anti, true);
    assert.equal(snap.phase, TributePhase.GAME_START);
    assert.equal(snap.tributes.length, 0);
  });

  it('单进贡执行 + 还贡', () => {
    // 0 头游，2 末游（不同队）；1 二游 3 三游
    const finish = [0, 1, 3, 2];
    const kind = resolveTributeKind(finish);
    assert.equal(kind.kind, TributeKind.SINGLE);

    const hands = {
      0: [C(3), C(4), C(5)],
      1: [C(6), C(7), C(8)],
      2: [C(14), C(13), C(9)], // 末游最大 A
      3: [C(10), C(11), C(12)],
    };
    const sm = new TributeStateMachine({ finishOrder: finish, hands, currentRank: 2 });
    let snap = sm.start();
    assert.equal(snap.anti, false);
    assert.equal(snap.phase, TributePhase.RETURNING);
    assert.equal(snap.tributes.length, 1);
    assert.equal(snap.tributes[0].from, 2);
    assert.equal(snap.tributes[0].to, 0);
    assert.equal(snap.tributes[0].card.rank, 14); // 进 A

    // 头游还一张 ≤10
    const ret = sm.returnTribute(0, C(3));
    // C(3) 新 id 可能对不上 — 用 hands 里真实牌
    if (!ret.ok) {
      const real = sm.hands[0].find((c) => c.rank <= 10);
      const r2 = sm.returnTribute(0, real);
      assert.equal(r2.ok, true);
      assert.equal(r2.snapshot.phase, TributePhase.GAME_START);
    } else {
      assert.equal(ret.snapshot.phase, TributePhase.GAME_START);
    }
  });

  it('进贡不选逢人配', () => {
    const hand = [H(5), C(3), C(4)]; // 打 5，红心 5 为逢人配
    const card = pickTributeCard(hand, 5);
    assert.ok(card);
    assert.notEqual(card.rank === 5 && card.suit === 3, true);
  });
});

describe('接风与升级', () => {
  it('接风给队友', () => {
    const r = resolvePassWind({
      finishedSeat: 0,
      lastPlaySeat: 0,
      wasBeaten: false,
      activeSeats: [1, 2, 3],
    });
    assert.equal(r.passWind, true);
    assert.equal(r.nextSeat, teammateOf(0));
  });

  it('双下升 3；1+3 升 2；1+4 升 1', () => {
    assert.equal(calculateLevelProgress([0, 2, 1, 3]).upgrade, 3);
    assert.equal(calculateLevelProgress([0, 1, 2, 3]).upgrade, 2); // 0 与 2 是 1、3 名
    assert.equal(calculateLevelProgress([0, 1, 3, 2]).upgrade, 1); // 0 与 2 是 1、4 名
  });

  it('打 A：1+4 不升级；双下通关', () => {
    const a14 = calculateLevelProgress([0, 1, 3, 2], { currentLevel: 14 });
    assert.equal(a14.appliedUpgrade, 0);
    assert.equal(a14.continueOnA, true);
    assert.equal(a14.passedA, false);

    const pass = calculateLevelProgress([0, 2, 1, 3], { currentLevel: 14 });
    assert.equal(pass.passedA, true);
    assert.equal(pass.cleared, true);
  });

  it('多局累计', () => {
    const g = new GuanDanSettlement({ team0Level: 12, team1Level: 10, bankerTeam: 0 });
    g.settleHand([0, 2, 1, 3]); // 双下升 3 → 但 12+3 会到 A
    // 12 升 3 级：12→13→14 停 A
    assert.equal(g.teamLevels[0], 14);
    const rec = g.settleHand([0, 1, 3, 2]); // 1+4 打 A 不升级
    assert.equal(rec.continueOnA, true);
    assert.equal(g.teamLevels[0], 14);
    g.settleHand([0, 2, 1, 3]);
    assert.equal(g.clearedTeam, 0);
    assert.equal(g.snapshot().gameOver, true);
  });
});

describe('AI 与合谋', () => {
  it('队友出牌且牌少时 PASS', () => {
    const hand = [C(3), C(5), C(7)];
    const last = bestGuanDanHand([C(4)], 2);
    const dec = makeGuanDanAIDecision(
      { seat: 2, hand }, // 队友 of 0
      {
        currentRank: 2,
        currentSeat: 2,
        lastPlaySeat: 0,
        lastHand: last,
        handCounts: [3, 10, 3, 10],
      },
    );
    assert.equal(dec.action, GuanDanAIAction.PASS);
  });

  it('逢人配优先组炸/同花顺', () => {
    // ♥10 逢人配 + 同花 6-9 → 同花顺优先于散拆
    const cards = [H(10), C(6, 3), C(7, 3), C(8, 3), C(9, 3)];
    const sug = suggestWildComposition(cards, 10);
    assert.ok(sug.best);
    assert.ok(
      sug.best.type === HandType.STRAIGHT_FLUSH
      || sug.best.type === HandType.STRAIGHT
      || sug.best.type === HandType.BOMB,
      sug.best?.name,
    );
  });

  it('同 IP 与喂牌告警', () => {
    const r = detectGuanDanCollusion({
      players: [
        { playerId: 'a', ip: '1.1.1.1' },
        { playerId: 'b', ip: '1.1.1.1' },
      ],
      feedActions: [
        { from: 'a', to: 'b', type: 'feed', meaningless: true },
        { from: 'a', to: 'b', type: 'feed', meaningless: true },
        { from: 'a', to: 'b', type: 'feed', meaningless: true },
      ],
    });
    assert.equal(r.risk, 'warn');
    assert.ok(r.alerts.some((a) => a.type === 'same_ip_table'));
    assert.ok(r.alerts.some((a) => a.type === 'feed_cards'));
  });
});
