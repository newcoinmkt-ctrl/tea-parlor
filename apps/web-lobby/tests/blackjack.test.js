import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  handValue,
  isBlackjack,
  isPair,
  createBlackjackTable,
  cardText,
  MIN_PLAYERS,
  MAX_PLAYERS,
} from '../src/games/blackjack/engine.js';

test('handValue: hard and soft totals', () => {
  assert.equal(handValue([createCard(10, 0), createCard(7, 1)]).total, 17);
  assert.equal(handValue([createCard(14, 0), createCard(6, 1)]).total, 17);
  assert.equal(handValue([createCard(14, 0), createCard(6, 1)]).soft, true);
  assert.equal(handValue([createCard(14, 0), createCard(14, 1), createCard(9, 2)]).total, 21);
  assert.equal(handValue([createCard(10, 0), createCard(12, 1), createCard(5, 2)]).bust, true);
});

test('isBlackjack and isPair', () => {
  assert.equal(isBlackjack([createCard(14, 0), createCard(13, 1)]), true);
  assert.equal(isBlackjack([createCard(14, 0), createCard(10, 1), createCard(7, 2)]), false);
  assert.equal(isPair([createCard(10, 0), createCard(12, 1)]), true);
  assert.equal(isPair([createCard(8, 0), createCard(8, 1)]), true);
  assert.equal(isPair([createCard(8, 0), createCard(9, 1)]), false);
});

test('cardText format', () => {
  assert.match(cardText(createCard(14, 2)), /♥A|A/);
  assert.ok(cardText(createCard(12, 0)).includes('Q'));
});

test('player count clamp 2-7', () => {
  const t = createBlackjackTable({ minBet: 50, chips: 2000, playerCount: 99 });
  assert.equal(t.playerCount, MAX_PLAYERS);
  assert.ok(t.setPlayerCount(2).ok);
  assert.equal(t.playerCount, MIN_PLAYERS);
  assert.ok(t.setPlayerCount(5).ok);
  assert.equal(t.playerCount, 5);
});

test('deal gives every seat two cards + dealer two', () => {
  const t = createBlackjackTable({ minBet: 50, chips: 5000, playerCount: 5 });
  t.setBet(50);
  const d = t.deal();
  assert.ok(d.ok);
  const s = t.snapshot();
  assert.equal(s.seats.length, 5);
  for (const seat of s.seats) {
    assert.ok(seat.hands[0]);
    assert.equal(seat.hands[0].cards.length, 2, `${seat.name} should have 2 cards`);
  }
  assert.equal((s.dealerFull || s.dealer).filter(Boolean).length + (s.dealerHoleHidden ? 1 : 0) >= 1, true);
  // 庄家至少明一张
  assert.ok(s.dealer[0]);
});

test('multi seat play reaches settle', () => {
  const t = createBlackjackTable({ minBet: 50, chips: 5000, playerCount: 3 });
  t.setBet(50);
  t.deal();
  let guard = 0;
  while (t.snapshot().phase === 'insurance' && guard++ < 3) {
    t.offerInsurance(false);
  }
  guard = 0;
  while (t.snapshot().phase === 'player' && guard++ < 40) {
    const s = t.snapshot();
    if (s.isHumanTurn) {
      if (s.canHit && (s.hands[0]?.total || 0) < 12) t.hit();
      else t.stand();
    } else {
      t.runAiIfNeeded();
    }
  }
  const end = t.snapshot();
  assert.equal(end.phase, 'settle');
  assert.equal(end.seats.length, 3);
  assert.ok(typeof end.roundDelta === 'number');
});

test('cannot deal without chips', () => {
  const t = createBlackjackTable({ minBet: 50, chips: 10, playerCount: 2 });
  const r = t.deal();
  assert.equal(r.ok, false);
});

test('insurance is offered when dealer has Ace-up blackjack', () => {
  // draw() pops from the end. 2 人发牌顺序：P0, P1, 庄明, P0, P1, 庄暗
  const shoe = [
    createCard(10, 1), // 庄暗 = 10 → 与明牌 A 组成 BJ
    createCard(9, 2),  // P1 第二张
    createCard(8, 3),  // P0 第二张
    createCard(14, 0), // 庄明 = A
    createCard(7, 1),  // P1 第一张
    createCard(6, 2),  // P0 第一张
  ];
  const t = createBlackjackTable({ minBet: 50, chips: 1000, playerCount: 2, shoe });
  t.setBet(50);
  const dealt = t.deal();
  assert.equal(dealt.ok, true);
  assert.equal(t.phase, 'insurance');
  const before = t.snapshot();
  assert.equal(before.canInsure, true);
  assert.equal(before.dealer[0].rank, 14);

  const insured = t.offerInsurance(true);
  assert.equal(insured.ok, true);
  const end = t.snapshot();
  assert.equal(end.phase, 'settle');
  assert.equal(end.dealerBust, false);
  assert.equal(isBlackjack(end.dealerFull), true);
  // 保险 25 以 2:1 赔付净 +50，主注 50 输掉 → 净 0
  assert.equal(end.roundDelta, 0);
  assert.equal(end.chips, 1000);
});

test('skipping insurance still peeks Ace-up blackjack and settles', () => {
  const shoe = [
    createCard(13, 1),
    createCard(9, 2),
    createCard(8, 3),
    createCard(14, 0),
    createCard(7, 1),
    createCard(6, 2),
  ];
  const t = createBlackjackTable({ minBet: 50, chips: 1000, playerCount: 2, shoe });
  t.setBet(50);
  t.deal();
  assert.equal(t.phase, 'insurance');
  t.offerInsurance(false);
  const end = t.snapshot();
  assert.equal(end.phase, 'settle');
  assert.equal(end.roundDelta, -50);
  assert.equal(end.chips, 950);
});
