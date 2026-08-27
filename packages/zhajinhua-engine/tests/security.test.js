/**
 * Provably Fair / 胜率蒙特卡洛 / 防作弊检测
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  // fair
  fairShuffle,
  verifyFairShuffle,
  verifyCommit,
  computeCommitHash,
  generateServerSeed,
  generateSalt,
  fisherYatesShuffle,
  createHmacRng,
  deriveShuffleKey,
  deckFingerprint,
  toPublicFairProof,
  toRevealFairProof,
  // win prob
  getWinProbability,
  buildRemainingDeck,
  rankHandsByEquity,
  // anti-cheat
  createCollusionDetector,
  detectMultiAccountAtTable,
  AlertType,
  // cards
  createCard,
  createDeck52,
} from '../src/index.js';

function C(r1, s1, r2, s2, r3, s3) {
  return [createCard(r1, s1), createCard(r2, s2), createCard(r3, s3)];
}

function rngSeq(seq) {
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return typeof v === 'number' ? v : 0.5;
  };
}

// ═══════════════════════════════════════════
// Provably Fair
// ═══════════════════════════════════════════

test('fisherYatesShuffle: 长度不变、元素守恒', () => {
  const deck = createDeck52().map((c) => `${c.rank}_${c.suit}`);
  const out = fisherYatesShuffle(deck, rngSeq([0.1, 0.9, 0.3, 0.7, 0.2, 0.5]));
  assert.equal(out.length, 52);
  assert.equal(new Set(out).size, 52);
  // 与原集合相同
  assert.deepEqual([...out].sort(), [...deck].sort());
});

test('fairShuffle: 同种子可复现；不同 nonce 不同序', () => {
  const a = fairShuffle({
    serverSeed: 's'.repeat(64),
    salt: 't'.repeat(32),
    clientSeed: 'client',
    nonce: 1,
    withIds: false,
  });
  const b = fairShuffle({
    serverSeed: 's'.repeat(64),
    salt: 't'.repeat(32),
    clientSeed: 'client',
    nonce: 1,
    withIds: false,
  });
  assert.equal(a.commitHash, b.commitHash);
  assert.equal(a.deckFingerprint, b.deckFingerprint);
  assert.deepEqual(
    a.deck.map((c) => `${c.rank}_${c.suit}`),
    b.deck.map((c) => `${c.rank}_${c.suit}`)
  );

  const c = fairShuffle({
    serverSeed: 's'.repeat(64),
    salt: 't'.repeat(32),
    clientSeed: 'client',
    nonce: 2,
    withIds: false,
  });
  assert.notEqual(a.deckFingerprint, c.deckFingerprint);
});

test('commit / verifyCommit：篡改 seed 失败', () => {
  const seed = generateServerSeed();
  const salt = generateSalt();
  const hash = computeCommitHash(seed, salt);
  assert.equal(verifyCommit(seed, salt, hash), true);
  assert.equal(verifyCommit(seed + 'x', salt, hash), false);
  assert.equal(verifyCommit(seed, salt + 'y', hash), false);
});

test('verifyFairShuffle: 完整局后校验通过', () => {
  const full = fairShuffle({
    serverSeed: 'aa'.repeat(32),
    salt: 'bb'.repeat(16),
    clientSeed: 'tea',
    nonce: 7,
    tableId: 'T1',
    handId: 'H1',
    withIds: false,
  });
  const reveal = toRevealFairProof(full);
  const r = verifyFairShuffle({
    ...reveal,
    tableId: 'T1',
    handId: 'H1',
    finalDeck: full.deck,
  });
  assert.equal(r.ok, true);
  assert.equal(r.commitOk, true);
  assert.equal(r.deckOk, true);
  assert.equal(r.proofOk, true);
});

test('verifyFairShuffle: 篡改牌序被检出', () => {
  const full = fairShuffle({
    serverSeed: 'cc'.repeat(32),
    salt: 'dd'.repeat(16),
    nonce: 0,
    withIds: false,
  });
  const tampered = full.deck.slice();
  [tampered[0], tampered[1]] = [tampered[1], tampered[0]];
  const r = verifyFairShuffle({
    serverSeed: full.serverSeed,
    salt: full.salt,
    commitHash: full.commitHash,
    clientSeed: full.clientSeed,
    nonce: full.nonce,
    finalDeck: tampered,
  });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('deck_order_mismatch'));
});

test('toPublicFairProof 不含 serverSeed', () => {
  const full = fairShuffle({ withIds: false });
  const pub = toPublicFairProof(full);
  assert.ok(pub.commitHash);
  assert.ok(pub.publicCode);
  assert.equal(pub.serverSeed, undefined);
  assert.equal(pub.salt, undefined);
});

test('createHmacRng 确定性', () => {
  const key = deriveShuffleKey({
    serverSeed: 'a',
    salt: 'b',
    clientSeed: 'c',
    nonce: 0,
  });
  const r1 = createHmacRng(key);
  const r2 = createHmacRng(key);
  const seq1 = [r1(), r1(), r1()];
  const seq2 = [r2(), r2(), r2()];
  assert.deepEqual(seq1, seq2);
  assert.ok(seq1.every((x) => x >= 0 && x < 1));
});

test('deckFingerprint 稳定', () => {
  const d = [{ rank: 14, suit: 1 }, { rank: 13, suit: 2 }];
  assert.equal(deckFingerprint(d), deckFingerprint(d));
});

// ═══════════════════════════════════════════
// 蒙特卡洛胜率
// ═══════════════════════════════════════════

test('buildRemainingDeck: 去掉手牌与 seen', () => {
  const hand = C(14, 1, 14, 2, 14, 3);
  const seen = [createCard(2, 1)];
  const rem = buildRemainingDeck(hand, seen);
  assert.equal(rem.length, 52 - 3 - 1);
  assert.ok(!rem.some((c) => c.rank === 14 && c.suit === 1));
});

test('getWinProbability: 仅自己 → 100%', () => {
  const r = getWinProbability(C(2, 1, 3, 2, 5, 3), 1, [], { simulations: 10 });
  assert.equal(r.winProbability, 1);
  assert.equal(r.opponents, 0);
});

test('getWinProbability: 豹子 vs 2 人 胜率应很高', () => {
  const r = getWinProbability(
    C(14, 1, 14, 2, 14, 3),
    3,
    [],
    { simulations: 1500, random: rngSeq(makePseudo(42)) }
  );
  assert.ok(r.winProbability > 0.85, `AAA winP=${r.winProbability}`);
  assert.ok(r.equity > 0.85);
  assert.equal(r.wins + r.ties + r.losses, r.simulations);
});

test('getWinProbability: 散牌弱于豹子期望', () => {
  const weak = getWinProbability(
    C(2, 1, 4, 2, 7, 3),
    3,
    [],
    { simulations: 1200, random: rngSeq(makePseudo(7)) }
  );
  const strong = getWinProbability(
    C(13, 1, 13, 2, 13, 3),
    3,
    [],
    { simulations: 1200, random: rngSeq(makePseudo(7)) }
  );
  assert.ok(strong.equity > weak.equity);
});

test('getWinProbability: 对手越多 equity 越低（同手牌）', () => {
  const hand = C(12, 1, 12, 2, 9, 3);
  const two = getWinProbability(hand, 2, [], {
    simulations: 1000,
    random: rngSeq(makePseudo(99)),
  });
  const four = getWinProbability(hand, 4, [], {
    simulations: 1000,
    random: rngSeq(makePseudo(99)),
  });
  assert.ok(two.equity > four.equity, `${two.equity} vs ${four.equity}`);
});

test('getWinProbability: seenCards 减少 remainingCards', () => {
  const hand = C(10, 1, 10, 2, 5, 3);
  const a = getWinProbability(hand, 2, [], { simulations: 50, random: () => 0.3 });
  const seen = [];
  for (let s = 1; s <= 4; s++) {
    for (let r = 2; r <= 6; r++) {
      if (!(r === 10)) seen.push({ rank: r, suit: s });
    }
  }
  const b = getWinProbability(hand, 2, seen, { simulations: 50, random: () => 0.3 });
  assert.ok(b.remainingCards < a.remainingCards);
});

test('rankHandsByEquity: 豹子排第一', () => {
  const ranked = rankHandsByEquity(
    [
      C(2, 1, 4, 2, 8, 3),
      C(14, 1, 14, 2, 14, 3),
      C(9, 1, 9, 2, 3, 3),
    ],
    3,
    [],
    { simulations: 600, random: rngSeq(makePseudo(3)) }
  );
  assert.equal(ranked[0].index, 1);
});

test('getWinProbability 非法入参抛错', () => {
  assert.throws(() => getWinProbability([], 2));
  assert.throws(() => getWinProbability(C(2, 1, 3, 2, 4, 3), 0));
});

/** 简单 LCG 序列，保证可复现且分布尚可 */
function makePseudo(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const out = [];
  for (let i = 0; i < 20000; i++) {
    s = (s * 48271) % 2147483647;
    out.push(s / 2147483647);
  }
  return out;
}

// ═══════════════════════════════════════════
// 防作弊
// ═══════════════════════════════════════════

test('同 IP 同桌多开告警', () => {
  const det = createCollusionDetector();
  det.registerSession({ playerId: 'p1', ip: '1.2.3.4', deviceId: 'd1', tableId: 'T' });
  det.registerSession({ playerId: 'p2', ip: '1.2.3.4', deviceId: 'd2', tableId: 'T' });
  det.registerSession({ playerId: 'p3', ip: '9.9.9.9', deviceId: 'd3', tableId: 'T' });
  const r = det.analyzeTable('T');
  assert.ok(r.alerts.some((a) => a.type === AlertType.MULTI_ACCOUNT_SAME_IP));
  assert.ok(r.riskScore > 0);
  assert.ok(r.linkedPairs.some((p) => p.a === 'p1' && p.b === 'p2'));
});

test('同设备多开 CRITICAL', () => {
  const det = createCollusionDetector();
  det.registerSession({ playerId: 'a', ip: '1.1.1.1', deviceId: 'SAME', tableId: 'X' });
  det.registerSession({ playerId: 'b', ip: '2.2.2.2', deviceId: 'SAME', tableId: 'X' });
  const r = det.analyzeTable('X');
  const al = r.alerts.find((a) => a.type === AlertType.MULTI_ACCOUNT_SAME_DEVICE);
  assert.ok(al);
  assert.equal(al.severity, 'critical');
});

test('喂筹码：关联账号多次弃牌让利', () => {
  const det = createCollusionDetector({ chipFeedFoldThreshold: 3 });
  det.registerSession({ playerId: 'feeder', ip: '10.0.0.1', deviceId: 'devA', tableId: 'T2' });
  det.registerSession({ playerId: 'whale', ip: '10.0.0.1', deviceId: 'devB', tableId: 'T2' });
  for (let i = 0; i < 5; i++) {
    det.recordAction({
      type: 'fold',
      playerId: 'feeder',
      tableId: 'T2',
      beneficiaryId: 'whale',
    });
  }
  const r = det.analyzeTable('T2');
  assert.ok(r.alerts.some((a) => a.type === AlertType.CHIP_FEEDING));
});

test('协同比牌：一边倒', () => {
  const det = createCollusionDetector({ comparePairMin: 3, compareOneSideRatio: 0.8 });
  det.registerSession({ playerId: 'x', ip: '8.8.8.8', tableId: 'T3' });
  det.registerSession({ playerId: 'y', ip: '8.8.8.8', tableId: 'T3' });
  for (let i = 0; i < 5; i++) {
    det.recordAction({
      type: 'compare',
      playerId: 'x',
      targetId: 'y',
      winnerId: 'x',
      loserId: 'y',
      tableId: 'T3',
    });
  }
  const r = det.analyzeTable('T3');
  assert.ok(r.alerts.some((a) => a.type === AlertType.COLLUSIVE_COMPARE));
});

test('协同入座：短间隔', () => {
  let t = 1_000_000;
  const det = createCollusionDetector({ now: () => t });
  det.registerSession({ playerId: 'm1', ip: '5.5.5.5', tableId: 'T4', joinedAt: t });
  t += 3000;
  det.registerSession({ playerId: 'm2', ip: '5.5.5.5', tableId: 'T4', joinedAt: t });
  const r = det.analyzeTable('T4');
  assert.ok(r.alerts.some((a) => a.type === AlertType.COORDINATED_ENTRY));
});

test('detectMultiAccountAtTable 无状态快捷', () => {
  const r = detectMultiAccountAtTable(
    [
      { playerId: 'u1', ip: '7.7.7.7', tableId: 'Z' },
      { playerId: 'u2', ip: '7.7.7.7', tableId: 'Z' },
    ],
    'Z'
  );
  assert.ok(r.alerts.length >= 1);
});

test('无关玩家不误报多开', () => {
  const det = createCollusionDetector();
  det.registerSession({ playerId: 'a', ip: '1.1.1.1', deviceId: 'd1', tableId: 'T' });
  det.registerSession({ playerId: 'b', ip: '2.2.2.2', deviceId: 'd2', tableId: 'T' });
  const r = det.analyzeTable('T');
  assert.equal(
    r.alerts.filter((a) =>
      a.type === AlertType.MULTI_ACCOUNT_SAME_IP
      || a.type === AlertType.MULTI_ACCOUNT_SAME_DEVICE
    ).length,
    0
  );
});
