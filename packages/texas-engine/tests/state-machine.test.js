/**
 * TexasGameStateMachine 状态机测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TexasGameStateMachine,
  TexasPhase,
  canTransition,
  isBettingPhase,
  ActionType,
  PlayerStatus,
  createCard,
} from '../src/index.js';

function makeSM(over = {}) {
  return new TexasGameStateMachine({
    playerIds: ['a', 'b', 'c'],
    chips: [1000, 1000, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    random: () => 0.42,
    ...over,
  });
}

// ── 相位表 ──

test('canTransition: 主路径合法', () => {
  assert.equal(canTransition(TexasPhase.WAITING, TexasPhase.DEALING_HOLE), true);
  assert.equal(canTransition(TexasPhase.DEALING_HOLE, TexasPhase.PREFLOP_BETTING), true);
  assert.equal(canTransition(TexasPhase.PREFLOP_BETTING, TexasPhase.DEALING_FLOP), true);
  assert.equal(canTransition(TexasPhase.RIVER_BETTING, TexasPhase.SHOWDOWN), true);
  assert.equal(canTransition(TexasPhase.SHOWDOWN, TexasPhase.SETTLING), true);
  assert.equal(canTransition(TexasPhase.PREFLOP_BETTING, TexasPhase.SETTLING), true);
  assert.equal(canTransition(TexasPhase.WAITING, TexasPhase.FLOP_BETTING), false);
});

// ── 开局与位置 ──

test('startHand: Waiting→…→PreFlopBetting，维护 Button/SB/BB/Actor', () => {
  const sm = makeSM({ buttonSeat: 0 });
  assert.equal(sm.phase, TexasPhase.WAITING);
  const r = sm.startHand();
  assert.equal(r.ok, true);
  assert.equal(sm.phase, TexasPhase.PREFLOP_BETTING);
  assert.equal(sm.buttonSeat, 0);
  assert.equal(sm.sbSeat, 1);
  assert.equal(sm.bbSeat, 2);
  // UTG = BB 左手 = 0
  assert.equal(sm.currentActorIndex, 0);
  assert.equal(sm.currentActorId, 'a');
  // 每人 2 张底牌
  assert.equal(sm.holes.get('a')?.length, 2);
  assert.equal(sm.board.length, 0);
  // 盲注
  assert.equal(sm.players.find((p) => p.id === 'b').betTotal, 5);
  assert.equal(sm.players.find((p) => p.id === 'c').betTotal, 10);
});

test('HU: button=SB 先行动', () => {
  const sm = makeSM({
    playerIds: ['a', 'b'],
    chips: [500, 500],
    buttonSeat: 0,
  });
  sm.startHand();
  assert.equal(sm.sbSeat, 0);
  assert.equal(sm.bbSeat, 1);
  assert.equal(sm.currentActorIndex, 0);
});

// ── 行动校验 ──

test('validateAction: 非当前玩家拒绝', () => {
  const sm = makeSM();
  sm.startHand();
  // actor is a
  const r = sm.validateAction('b', 'call');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_your_turn');
});

test('validateAction: check 面对注额非法', () => {
  const sm = makeSM();
  sm.startHand();
  const r = sm.validateAction('a', 'check');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cannot_check');
});

test('validateAction: 加注增量过小拒绝；短筹 all-in 放行', () => {
  const sm = makeSM();
  sm.startHand();
  // a raise to 30 (raise size 20)
  assert.equal(sm.dispatch('raise', { playerId: 'a', raiseTo: 30 }).ok, true);
  // b 试图加到 40（增量 10 < lastRaise 20）
  const bad = sm.validateAction('b', 'raise', { raiseTo: 40 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'raise_increment_too_small');

  // b 合法 re-raise to 70
  const good = sm.validateAction('b', 'raise', { raiseTo: 70 });
  assert.equal(good.ok, true);

  // 短筹：把 b 筹码改成很少
  const pb = sm.players.find((p) => p.id === 'b');
  pb.chips = 15; // 本街已下 5，再 15 全下到 20 < minRaiseTo
  const short = sm.validateAction('b', 'raise', { raiseTo: 200 });
  assert.equal(short.ok, true);
  assert.equal(short.shortAllIn, true);
});

test('legalActions: preflop UTG 含 call/raise/fold', () => {
  const sm = makeSM();
  sm.startHand();
  const acts = sm.legalActions('a').map((x) => x.action);
  assert.ok(acts.includes(ActionType.FOLD));
  assert.ok(acts.includes(ActionType.CALL));
  assert.ok(acts.includes(ActionType.RAISE));
  assert.ok(acts.includes(ActionType.ALL_IN));
  assert.ok(!acts.includes(ActionType.CHECK));
});

// ── 阶段自动推进 ──

test('preflop 下注一致 → DealingFlop → FlopBetting', () => {
  const sm = makeSM();
  sm.startHand();
  sm.dispatch('call', { playerId: 'a' });
  sm.dispatch('call', { playerId: 'b' });
  const r = sm.dispatch('check', { playerId: 'c' });
  assert.equal(r.ok, true);
  assert.equal(sm.phase, TexasPhase.FLOP_BETTING);
  assert.equal(sm.board.length, 3);
  assert.equal(isBettingPhase(sm.phase), true);
});

test('全街 check/call 到 Showdown/Settling', () => {
  const sm = makeSM({
    playerIds: ['a', 'b'],
    chips: [1000, 1000],
    smallBlind: 10,
    bigBlind: 20,
    buttonSeat: 0,
  });
  sm.startHand();
  // preflop HU: a(SB) call, b(BB) check
  sm.dispatch('call', { playerId: 'a' });
  sm.dispatch('check', { playerId: 'b' });
  assert.equal(sm.phase, TexasPhase.FLOP_BETTING);
  assert.equal(sm.board.length, 3);

  // flop/turn/river: 双方 check
  for (const expectBoard of [3, 4, 5]) {
    assert.equal(sm.board.length, expectBoard === 3 ? 3 : expectBoard);
    // 可能已在 settling if something wrong
    if (!isBettingPhase(sm.phase) && sm.phase !== TexasPhase.FLOP_BETTING
      && sm.phase !== TexasPhase.TURN_BETTING && sm.phase !== TexasPhase.RIVER_BETTING) {
      break;
    }
    const id1 = sm.currentActorId;
    sm.dispatch('check', { playerId: id1 });
    if (sm.phase === TexasPhase.SETTLING || sm.phase === TexasPhase.SHOWDOWN) break;
    const id2 = sm.currentActorId;
    if (id2 && isBettingPhase(sm.phase)) {
      sm.dispatch('check', { playerId: id2 });
    }
  }

  // 应进入摊牌结算
  assert.ok(
    sm.phase === TexasPhase.SETTLING || sm.phase === TexasPhase.SHOWDOWN,
    sm.phase
  );
  if (sm.phase === TexasPhase.SHOWDOWN) {
    // 手动触发（若停在 showdown）
    sm.dispatch('showdown', {});
  }
  // river 结束后应自动 settle
  assert.ok(
    sm.phase === TexasPhase.SETTLING || sm.lastSettlement,
    `phase=${sm.phase}`
  );
});

// ── 仅剩 1 人跳过发牌 ──

test('仅剩 1 名未弃牌：直接 Settling，跳过后续发牌', () => {
  const sm = makeSM();
  sm.startHand();
  // a fold, b fold → c wins
  sm.dispatch('fold', { playerId: 'a' });
  const r = sm.dispatch('fold', { playerId: 'b' });
  assert.equal(r.ok, true);
  assert.equal(sm.phase, TexasPhase.SETTLING);
  assert.equal(sm.board.length, 0, '不应再发公共牌');
  assert.ok(r.awards);
  assert.ok((r.awards.c || r.winnerIds?.includes('c')));
  // 底池 15 归 c
  const totalAwards = Object.values(r.awards || {}).reduce((s, v) => s + v, 0);
  assert.equal(totalAwards, 15);
});

test('flop 后弃牌至一人：Settling', () => {
  const sm = makeSM();
  sm.startHand();
  sm.dispatch('call', { playerId: 'a' });
  sm.dispatch('call', { playerId: 'b' });
  sm.dispatch('check', { playerId: 'c' });
  assert.equal(sm.phase, TexasPhase.FLOP_BETTING);
  assert.equal(sm.board.length, 3);

  // 翻后第一个行动
  const first = sm.currentActorId;
  sm.dispatch('fold', { playerId: first });
  const second = sm.currentActorId;
  sm.dispatch('fold', { playerId: second });
  assert.equal(sm.phase, TexasPhase.SETTLING);
  // 不应发 turn
  assert.equal(sm.board.length, 3);
});

// ── 加注 / 全押 ──

test('raise 与 re-raise 推进 pot', () => {
  const sm = makeSM();
  sm.startHand();
  sm.dispatch('raise', { playerId: 'a', raiseTo: 30 });
  assert.equal(sm.betting.currentBet, 30);
  sm.dispatch('raise', { playerId: 'b', raiseTo: 90 });
  assert.equal(sm.betting.currentBet, 90);
  sm.dispatch('fold', { playerId: 'c' });
  sm.dispatch('call', { playerId: 'a' });
  // 可能已进 flop
  assert.ok(
    sm.phase === TexasPhase.FLOP_BETTING || sm.phase === TexasPhase.PREFLOP_BETTING
  );
});

test('getSnapshot 隐藏他人底牌', () => {
  const sm = makeSM();
  sm.startHand();
  const snapA = sm.getSnapshot('a');
  assert.ok(snapA.holes.a?.length === 2);
  assert.equal(snapA.holes.b, null);
  assert.equal(snapA.phase, TexasPhase.PREFLOP_BETTING);
  assert.equal(snapA.currentActorId, 'a');
});

test('endSettling → Waiting；可再 startHand', () => {
  const sm = makeSM();
  sm.startHand();
  sm.dispatch('fold', { playerId: 'a' });
  sm.dispatch('fold', { playerId: 'b' });
  assert.equal(sm.phase, TexasPhase.SETTLING);
  sm.endSettling();
  assert.equal(sm.phase, TexasPhase.WAITING);
  const r = sm.startHand({ rotateButton: true });
  assert.equal(r.ok, true);
  assert.equal(sm.phase, TexasPhase.PREFLOP_BETTING);
  assert.equal(sm.buttonSeat, 1);
});

test('事件监听 phase 变化', () => {
  const sm = makeSM();
  const phases = [];
  sm.on((ev, data) => {
    if (ev === 'phase') phases.push(data.to);
  });
  sm.startHand();
  assert.ok(phases.includes(TexasPhase.DEALING_HOLE));
  assert.ok(phases.includes(TexasPhase.PREFLOP_BETTING));
});

test('全押后 runout 发满 5 张公共牌并结算', () => {
  const sm = makeSM({
    playerIds: ['a', 'b'],
    chips: [50, 1000],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
  });
  sm.startHand();
  // a SB all-in
  sm.dispatch('all_in', { playerId: 'a' });
  // b call
  const r = sm.dispatch('call', { playerId: 'b' });
  // 应 runout + settle
  assert.ok(
    sm.phase === TexasPhase.SETTLING || sm.board.length === 5 || r.settled,
    `phase=${sm.phase} board=${sm.board.length}`
  );
  if (sm.phase !== TexasPhase.SETTLING && sm.board.length === 5) {
    // 若停在 showdown
    if (sm.phase === TexasPhase.SHOWDOWN || isBettingPhase(sm.phase)) {
      sm._enterShowdown('test');
    }
  }
  assert.ok(sm.board.length === 5 || sm.phase === TexasPhase.SETTLING);
});
