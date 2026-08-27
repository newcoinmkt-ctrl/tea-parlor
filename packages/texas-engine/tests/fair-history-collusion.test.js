/**
 * Provably Fair + Hand History + Collusion
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  // fair
  fairShuffle,
  computePublicHash,
  verifyPublicHash,
  verifyFairShuffle,
  toPublicFairCommit,
  toFairReveal,
  generateServerSeed,
  generateClientSeed,
  deckFingerprint,
  // HH
  formatPokerStarsHandHistory,
  generateHandHistory,
  psCard,
  psCards,
  buildHandHistoryInputFromSnapshot,
  // collusion
  createCollusionDetector,
  detectMultiAccountAtTable,
  CollusionAlertType,
  createCard,
} from '../src/index.js';

// ═══════════════════════════════════════════
// Provably Fair
// ═══════════════════════════════════════════

test('publicHash = HMAC-SHA256 可复现；篡改 seed 失败', () => {
  const serverSeed = generateServerSeed();
  const clientSeed = generateClientSeed();
  const nonce = 7;
  const hash = computePublicHash(serverSeed, clientSeed, nonce);
  assert.equal(hash.length, 64);
  assert.equal(verifyPublicHash(serverSeed, clientSeed, nonce, hash), true);
  assert.equal(verifyPublicHash(`${serverSeed}x`, clientSeed, nonce, hash), false);
  assert.equal(verifyPublicHash(serverSeed, `${clientSeed}y`, nonce, hash), false);
});

test('fairShuffle: 同种子同序；局前 commit 不含 serverSeed', () => {
  const opts = {
    serverSeed: 'aa'.repeat(32),
    clientSeed: 'client-xyz',
    nonce: 3,
    withIds: false,
  };
  const a = fairShuffle(opts);
  const b = fairShuffle(opts);
  assert.equal(a.publicHash, b.publicHash);
  assert.equal(a.deckFingerprint, b.deckFingerprint);
  assert.deepEqual(
    a.deck.map((c) => `${c.rank}_${c.suit}`),
    b.deck.map((c) => `${c.rank}_${c.suit}`)
  );

  const pub = toPublicFairCommit(a);
  assert.ok(pub.publicHash);
  assert.equal(pub.serverSeed, undefined);
  assert.equal(pub.clientSeed, 'client-xyz');
});

test('verifyFairShuffle: 局后验证通过；篡改牌序失败', () => {
  const full = fairShuffle({
    serverSeed: 'bb'.repeat(32),
    clientSeed: 'c1',
    nonce: 0,
    withIds: false,
  });
  const reveal = toFairReveal(full);
  const ok = verifyFairShuffle({
    ...reveal,
    finalDeck: full.deck,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.hashOk, true);
  assert.equal(ok.deckOk, true);

  const tampered = full.deck.slice();
  [tampered[0], tampered[1]] = [tampered[1], tampered[0]];
  const bad = verifyFairShuffle({
    ...reveal,
    finalDeck: tampered,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.includes('deck_order_mismatch'));
});

test('不同 clientSeed 产生不同牌序', () => {
  const s = 'cc'.repeat(32);
  const d1 = fairShuffle({ serverSeed: s, clientSeed: 'A', nonce: 1, withIds: false });
  const d2 = fairShuffle({ serverSeed: s, clientSeed: 'B', nonce: 1, withIds: false });
  assert.notEqual(d1.deckFingerprint, d2.deckFingerprint);
});

// ═══════════════════════════════════════════
// Hand History
// ═══════════════════════════════════════════

test('psCard / psCards 格式', () => {
  assert.equal(psCard(createCard(14, 4)), 'As');
  assert.equal(psCard(createCard(10, 1)), 'Td');
  assert.equal(psCards([createCard(14, 4), createCard(13, 3)]), 'As Kh');
});

test('formatPokerStarsHandHistory: 含 Header/座位/行动/SUMMARY', () => {
  const text = generateHandHistory({
    handId: 123456789,
    tableName: 'Tea Table',
    smallBlind: 5,
    bigBlind: 10,
    currency: '',
    timestamp: new Date('2024-06-01T12:00:00Z'),
    buttonSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players: [
      { name: 'Alice', seat: 0, chips: 1000 },
      { name: 'Bob', seat: 1, chips: 1000 },
      { name: 'Carol', seat: 2, chips: 1000 },
    ],
    holeCards: {
      Alice: [createCard(14, 4), createCard(13, 4)],
    },
    board: [
      createCard(2, 1), createCard(7, 2), createCard(8, 3),
      createCard(9, 4), createCard(14, 1),
    ],
    actions: [
      { street: 'preflop', player: 'Bob', action: 'posts', amount: 5 },
      { street: 'preflop', player: 'Carol', action: 'posts', amount: 10 },
      { street: 'preflop', player: 'Alice', action: 'raises', amount: 20, raiseTo: 30 },
      { street: 'preflop', player: 'Bob', action: 'folds' },
      { street: 'preflop', player: 'Carol', action: 'calls', amount: 20 },
      { street: 'flop', player: 'Carol', action: 'checks' },
      { street: 'flop', player: 'Alice', action: 'bets', amount: 40 },
      { street: 'flop', player: 'Carol', action: 'folds' },
      { street: 'showdown', player: 'Alice', action: 'collected', amount: 80 },
    ],
    pots: [{ player: 'Alice', amount: 80 }],
    totalPot: 80,
    publicHash: 'abcd'.repeat(16),
    publicCode: 'ABCD-EF01',
    hero: 'Alice',
  });

  assert.match(text, /PokerStars Hand #123456789/);
  assert.match(text, /Hold'em No Limit/);
  assert.match(text, /Seat #1 is the button/);
  assert.match(text, /Seat 1: Alice/);
  assert.match(text, /\*\*\* HOLE CARDS \*\*\*/);
  assert.match(text, /Dealt to Alice \[As Ks\]/);
  assert.match(text, /Alice: raises 20 to 30/);
  assert.match(text, /\*\*\* FLOP \*\*\*/);
  assert.match(text, /\*\*\* SUMMARY \*\*\*/);
  assert.match(text, /Total pot 80/);
  assert.match(text, /Provably Fair/);
  assert.match(text, /Alice.*won/);
});

test('buildHandHistoryInputFromSnapshot 映射', () => {
  const input = buildHandHistoryInputFromSnapshot({
    snapshot: {
      handId: 99,
      buttonSeat: 0,
      sbSeat: 1,
      bbSeat: 2,
      smallBlind: 5,
      bigBlind: 10,
      pot: 30,
      board: [],
      players: [
        { id: 'a', name: 'A', seat: 0, chips: 990, betTotal: 0, status: 'active' },
        { id: 'b', name: 'B', seat: 1, chips: 995, betTotal: 5, status: 'active' },
        { id: 'c', name: 'C', seat: 2, chips: 990, betTotal: 10, status: 'active' },
      ],
      holes: { a: [createCard(14, 1), createCard(2, 1)] },
    },
    actionLog: [
      { type: 'fold', playerId: 'a', street: 'preflop' },
    ],
    meta: { tableName: 'T1', publicCode: 'XX' },
  });
  assert.equal(input.handId, 99);
  assert.equal(input.players.length, 3);
  const text = formatPokerStarsHandHistory(input);
  assert.match(text, /A: folds/);
});

// ═══════════════════════════════════════════
// Collusion
// ═══════════════════════════════════════════

test('同 IP 多开告警', () => {
  const det = createCollusionDetector();
  det.registerSession({ playerId: 'p1', ip: '1.1.1.1', deviceId: 'd1', tableId: 'T' });
  det.registerSession({ playerId: 'p2', ip: '1.1.1.1', deviceId: 'd2', tableId: 'T' });
  const r = det.analyzeTable('T');
  assert.ok(r.alerts.some((a) => a.type === CollusionAlertType.MULTI_ACCOUNT_SAME_IP));
  assert.ok(r.riskScore > 0);
});

test('Chip Dumping：关联账号互喂', () => {
  const det = createCollusionDetector({ dumpMinTransfers: 3 });
  det.registerSession({ playerId: 'feeder', ip: '9.9.9.9', tableId: 'T2' });
  det.registerSession({ playerId: 'whale', ip: '9.9.9.9', tableId: 'T2' });
  for (let i = 0; i < 4; i++) {
    det.recordEvent({
      type: 'chip_dump',
      playerId: 'feeder',
      beneficiaryId: 'whale',
      amount: 100,
      tableId: 'T2',
    });
  }
  const r = det.analyzeTable('T2');
  assert.ok(r.alerts.some((a) => a.type === CollusionAlertType.CHIP_DUMPING));
});

test('Squeeze soft fold：关联号夹击软弃', () => {
  const det = createCollusionDetector({ softFoldMin: 3 });
  det.registerSession({ playerId: 'x', deviceId: 'DEV', tableId: 'T3' });
  det.registerSession({ playerId: 'y', deviceId: 'DEV', tableId: 'T3' });
  for (let i = 0; i < 4; i++) {
    det.recordEvent({
      type: 'squeeze_fold',
      playerId: 'x',
      colluderId: 'y',
      aggressorId: 'z',
      tableId: 'T3',
      potOdds: 0.2,
    });
  }
  const r = det.analyzeTable('T3');
  assert.ok(r.alerts.some((a) => a.type === CollusionAlertType.SQUEEZE_SOFT_FOLD));
});

test('detectMultiAccountAtTable 快捷', () => {
  const r = detectMultiAccountAtTable(
    [
      { playerId: 'u1', ip: '8.8.8.8', tableId: 'Z' },
      { playerId: 'u2', ip: '8.8.8.8', tableId: 'Z' },
    ],
    'Z'
  );
  assert.ok(r.alerts.length >= 1);
});

test('无关玩家不误报 dumping', () => {
  const det = createCollusionDetector({ dumpMinTransfers: 2 });
  det.registerSession({ playerId: 'a', ip: '1.1.1.1', tableId: 'T' });
  det.registerSession({ playerId: 'b', ip: '2.2.2.2', tableId: 'T' });
  det.recordEvent({
    type: 'chip_dump',
    playerId: 'a',
    beneficiaryId: 'b',
    amount: 500,
    tableId: 'T',
  });
  const r = det.analyzeTable('T');
  assert.equal(
    r.alerts.filter((a) => a.type === CollusionAlertType.CHIP_DUMPING).length,
    0
  );
});
