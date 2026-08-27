/**
 * CardGameStateMachine 单局流程测试
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CardGameStateMachine,
  GamePhase,
  BaseState,
} from '../src/state-machine/index.js';
import { createCard } from '../src/card.js';

/** 可控时钟 + 超时队列 */
function createFakeTimers() {
  let now = 1_000_000;
  const timers = [];
  let idSeq = 1;
  return {
    deps: {
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = idSeq++;
        timers.push({ id, fn, due: now + ms });
        return id;
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    },
    advance(ms) {
      now += ms;
      const due = timers.filter((t) => t.due <= now).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.findIndex((x) => x.id === t.id);
        if (i >= 0) timers.splice(i, 1);
        t.fn();
      }
    },
    flushMicrotasks: async () => {
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function seatAll(sm) {
  sm.dispatch('seat', { playerIndex: 0, name: 'A', autoStart: false });
  sm.dispatch('seat', { playerIndex: 1, name: 'B', autoStart: false });
  sm.dispatch('seat', { playerIndex: 2, name: 'C', autoStart: false });
}

/** 固定牌堆：方便测出完牌 */
function buildDeterministicDeck() {
  // createDeck 后重排：让玩家0 拿很小的牌容易出完（测试里手动 play）
  return createDeck();
}

test('phase flow: Waiting → Dealing → Bidding on startMatch', () => {
  const sm = new CardGameStateMachine({ playTimeoutMs: 60_000 });
  assert.equal(sm.phase, GamePhase.WAITING);

  seatAll(sm);
  const r = sm.dispatch('startMatch');
  assert.equal(r.ok, true);
  // Dealing 瞬时切到 Bidding
  assert.equal(sm.phase, GamePhase.BIDDING);
  assert.equal(sm.ctx.hands[0].length, 17);
  assert.equal(sm.ctx.hands[1].length, 17);
  assert.equal(sm.ctx.hands[2].length, 17);
  assert.equal(sm.ctx.bottomCards.length, 3);
  sm.dispose();
});

test('bidding: score 3 ends and moves to Doubling then can finish doubles to Playing', async () => {
  const sm = new CardGameStateMachine({
    playTimeoutMs: 60_000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
  });
  sm.dispatch('startMatch', { force: true, /* dealt inside */ });
  // startMatch force seats + dealing; need force path
  sm.dispose();

  const sm2 = new CardGameStateMachine({
    playTimeoutMs: 60_000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
  });
  // 直接 force start
  const started = sm2.dispatch('startMatch', { force: true });
  assert.equal(started.ok, true);
  assert.equal(sm2.phase, GamePhase.BIDDING);

  const turn = sm2.ctx.bidTurn;
  const bid = sm2.dispatch('bid', { playerIndex: turn, score: 3 });
  assert.equal(bid.ok, true);
  assert.equal(sm2.phase, GamePhase.DOUBLING);
  assert.equal(sm2.ctx.landlordIndex, turn);
  assert.equal(sm2.ctx.baseScore, 3);
  assert.equal(sm2.ctx.hands[turn].length, 20); // 17+3 bottom

  // 三人加倍
  for (let i = 0; i < 3; i++) {
    sm2.dispatch('double', { playerIndex: i, factor: i === turn ? 2 : 1 });
  }
  assert.equal(sm2.phase, GamePhase.PLAYING);
  assert.equal(sm2.currentPlayerIndex, turn);
  assert.equal(sm2.lastPlayHand, null);
  sm2.dispose();
});

test('playing: tracks currentPlayerIndex and lastPlayHand; empty hand → Settling', () => {
  const sm = new CardGameStateMachine({
    playTimeoutMs: 60_000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
  });
  sm.dispatch('startMatch', { force: true });

  // 快速叫分
  while (sm.phase === GamePhase.BIDDING) {
    const t = sm.ctx.bidTurn;
    sm.dispatch('bid', { playerIndex: t, score: sm.ctx.currentBid === 0 ? 1 : 0 });
  }
  // 加倍
  if (sm.phase === GamePhase.DOUBLING) {
    for (let i = 0; i < 3; i++) {
      if (!sm.ctx.doubleDecided[i]) {
        sm.dispatch('double', { playerIndex: i, factor: 1 });
      }
    }
  }
  assert.equal(sm.phase, GamePhase.PLAYING);

  const leader = sm.currentPlayerIndex;
  // 出最小一张
  const card = sm.ctx.hands[leader].slice().sort((a, b) => a.rank - b.rank)[0];
  const play = sm.dispatch('play', { playerIndex: leader, cards: [card] });
  assert.equal(play.ok, true);
  assert.ok(sm.lastPlayHand);
  assert.equal(sm.lastPlayHand.player, leader);
  assert.equal(sm.currentPlayerIndex, (leader + 1) % 3);

  // 下家 pass
  const p1 = sm.currentPlayerIndex;
  assert.equal(sm.dispatch('pass', { playerIndex: p1 }).ok, true);
  const p2 = sm.currentPlayerIndex;
  assert.equal(sm.dispatch('pass', { playerIndex: p2 }).ok, true);
  // 新一轮领出
  assert.equal(sm.lastPlayHand, null);
  assert.equal(sm.currentPlayerIndex, leader);

  sm.dispose();
});

test('settlement: per-farmer doubling lines, not product of all factors', () => {
  const sm = new CardGameStateMachine({
    baseRoomScore: 1,
    playTimeoutMs: 60_000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
  });
  sm.dispatch('startMatch', { force: true });

  // 叫 2 分
  const starter = sm.ctx.bidTurn;
  sm.dispatch('bid', { playerIndex: starter, score: 2 });
  // 其余不叫
  while (sm.phase === GamePhase.BIDDING) {
    sm.dispatch('bid', { playerIndex: sm.ctx.bidTurn, score: 0 });
  }
  assert.equal(sm.ctx.baseScore, 2);
  const landlord = sm.ctx.landlordIndex;

  // 地主加倍 2，农民各 2
  for (let i = 0; i < 3; i++) {
    sm.dispatch('double', { playerIndex: i, factor: 2 });
  }
  assert.equal(sm.phase, GamePhase.PLAYING);

  // 模拟炸弹数与胜负：直接切 Settling（每人出过牌 → 无春天）
  sm.ctx.bombCount = 1;
  sm.ctx.turnPlayCount = [1, 1, 1];
  sm.ctx.hands[landlord] = [];
  sm.transitionTo(GamePhase.SETTLING, { winnerIndex: landlord });

  assert.equal(sm.phase, GamePhase.SETTLING);
  const s = sm.ctx.settlement;
  assert.ok(s);
  assert.equal(s.baseScore, 2);
  assert.equal(s.bombCount, 1);
  assert.equal(s.spring, false);
  // shared = 2 * 2^1 = 4；每条线 4 * 2 * 2 = 16；地主 +32
  assert.equal(s.doubleProduct, 8);
  assert.equal(sm.ctx.multiplier, 4);
  assert.equal(s.winnerSide, 'landlord');
  assert.equal(s.unit, 4);
  assert.equal(s.scores[landlord], 32);
  for (let i = 0; i < 3; i++) {
    if (i !== landlord) assert.equal(s.scores[i], -16);
  }
  sm.dispose();
});

test('timeout auto-play: enables autoPlay and passes or plays', async () => {
  const fake = createFakeTimers();
  const sm = new CardGameStateMachine({
    playTimeoutMs: 1000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
    timerDeps: fake.deps,
  });
  sm.dispatch('startMatch', { force: true });

  while (sm.phase === GamePhase.BIDDING) {
    const t = sm.ctx.bidTurn;
    sm.dispatch('bid', { playerIndex: t, score: sm.ctx.currentBid === 0 ? 1 : 0 });
  }
  for (let i = 0; i < 3; i++) {
    if (sm.phase === GamePhase.DOUBLING && !sm.ctx.doubleDecided[i]) {
      sm.dispatch('double', { playerIndex: i, factor: 1 });
    }
  }
  assert.equal(sm.phase, GamePhase.PLAYING);

  const leader = sm.currentPlayerIndex;
  const beforeCount = sm.ctx.hands[leader].length;

  // 超时 → 托管自由出最小牌
  fake.advance(1000);
  await fake.flushMicrotasks();

  assert.equal(sm.ctx.autoPlay[leader], true);
  // 应已自动出了至少一张或仍在处理
  assert.ok(
    sm.ctx.hands[leader].length < beforeCount || sm.currentPlayerIndex !== leader
      || sm.ctx.turnPlayCount[leader] > 0
  );
  sm.dispose();
});

test('illegal play rejected; bomb increments bombCount', () => {
  const sm = new CardGameStateMachine({
    playTimeoutMs: 60_000,
    bidTimeoutMs: 60_000,
    doubleTimeoutMs: 60_000,
  });
  sm.dispatch('startMatch', { force: true });
  while (sm.phase === GamePhase.BIDDING) {
    sm.dispatch('bid', { playerIndex: sm.ctx.bidTurn, score: sm.ctx.currentBid === 0 ? 1 : 0 });
  }
  for (let i = 0; i < 3; i++) sm.dispatch('double', { playerIndex: i, factor: 1 });

  const p = sm.currentPlayerIndex;
  // 非当前玩家
  assert.equal(
    sm.dispatch('play', { playerIndex: (p + 1) % 3, cards: sm.ctx.hands[(p + 1) % 3].slice(0, 1) }).ok,
    false
  );

  // 给当前玩家塞一个炸弹并打出
  const bomb = [0, 1, 2, 3].map((s) => createCard(8, s));
  // 确保 id 唯一且在手中
  sm.ctx.hands[p] = bomb.concat(sm.ctx.hands[p]);
  const r = sm.dispatch('play', { playerIndex: p, cards: bomb });
  assert.equal(r.ok, true);
  assert.equal(sm.ctx.bombCount, 1);
  assert.equal(sm.lastPlayHand.hand.type, 'bomb');
  sm.dispose();
});

test('registerState allows extension (OCP)', () => {
  const sm = new CardGameStateMachine();
  let entered = false;
  class CustomWaiting extends BaseState {
    constructor() {
      super(GamePhase.WAITING);
    }
    enter() {
      entered = true;
    }
    handle(machine, event, payload) {
      if (event === 'custom') return { ok: true, data: { custom: true } };
      return super.handle(machine, event, payload);
    }
  }
  sm.registerState(GamePhase.WAITING, new CustomWaiting());
  sm._state.enter(sm);
  assert.equal(entered, true);
  assert.equal(sm.dispatch('custom').ok, true);
  sm.dispose();
});
