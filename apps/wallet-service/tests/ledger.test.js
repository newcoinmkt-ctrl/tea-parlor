import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWalletService,
  LedgerEntryType,
  Currency,
} from '../src/index.js';

function settlementIntent(overrides = {}) {
  return {
    type: 'settlement_intent',
    gameId: 'doudizhu',
    roomId: 'room-1',
    roundId: 'round-1',
    idempotencyKey: 'settle:round-1',
    scores: [-10, 5, 5],
    rawScores: [-10, 5, 5],
    winnerSide: 'farmer',
    ledgerPolicy: 'adapter_returns_intent_only',
    ...overrides,
  };
}

test('issues internal shadow points and writes ledger entry', () => {
  const wallet = createWalletService({ clock: () => '2026-08-14T00:00:00.000Z' });

  const result = wallet.issuePoints({
    userId: 'u1',
    amount: 100,
    idempotencyKey: 'issue:u1:welcome',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.account, {
    userId: 'u1',
    currency: 'SHADOW_POINTS',
    available: 100,
    locked: 0,
    total: 100,
  });
  assert.equal(result.ledgerEntries.length, 1);
  assert.equal(result.ledgerEntries[0].type, LedgerEntryType.ISSUE);
  assert.equal(wallet.queryLedger({ userId: 'u1' }).length, 1);
});

test('locks points for a game round and writes ledger entry', () => {
  const wallet = createWalletService();
  wallet.issuePoints({ userId: 'u1', amount: 100, idempotencyKey: 'issue:u1' });

  const result = wallet.lockPoints({
    userId: 'u1',
    amount: 30,
    referenceId: 'round-1',
    idempotencyKey: 'lock:u1:round-1',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.account, {
    userId: 'u1',
    currency: 'SHADOW_POINTS',
    available: 70,
    locked: 30,
    total: 100,
  });
  assert.equal(result.ledgerEntries[0].type, LedgerEntryType.LOCK);
  assert.equal(result.ledgerEntries[0].availableDelta, -30);
  assert.equal(result.ledgerEntries[0].lockedDelta, 30);
});

test('applies settlement intent, releases locks, and writes settlement ledger entries', () => {
  const wallet = createWalletService();
  for (const userId of ['u1', 'u2', 'u3']) {
    wallet.issuePoints({ userId, amount: 100, idempotencyKey: `issue:${userId}` });
    wallet.lockPoints({
      userId,
      amount: 20,
      referenceId: 'round-1',
      idempotencyKey: `lock:${userId}:round-1`,
    });
  }

  const result = wallet.applySettlementIntent(settlementIntent(), {
    participants: ['u1', 'u2', 'u3'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.accounts.u1, {
    userId: 'u1',
    currency: 'SHADOW_POINTS',
    available: 90,
    locked: 0,
    total: 90,
  });
  assert.deepEqual(result.accounts.u2, {
    userId: 'u2',
    currency: 'SHADOW_POINTS',
    available: 105,
    locked: 0,
    total: 105,
  });
  assert.deepEqual(result.accounts.u3, {
    userId: 'u3',
    currency: 'SHADOW_POINTS',
    available: 105,
    locked: 0,
    total: 105,
  });
  assert.equal(result.ledgerEntries.length, 3);
  assert.equal(result.ledgerEntries.every((entry) => entry.type === LedgerEntryType.SETTLEMENT), true);
  assert.equal(result.ledgerEntries[0].referenceType, 'game_settlement_intent');
});

test('rejects non-zero-sum settlement intent without writing ledger entries', () => {
  const wallet = createWalletService();
  for (const userId of ['u1', 'u2', 'u3']) {
    wallet.issuePoints({ userId, amount: 100, idempotencyKey: `issue:${userId}` });
    wallet.lockPoints({
      userId,
      amount: 20,
      referenceId: 'round-1',
      idempotencyKey: `lock:${userId}:round-1`,
    });
  }
  const before = wallet.queryLedger().length;

  const result = wallet.applySettlementIntent(settlementIntent({ scores: [10, -3, -3] }), {
    participants: ['u1', 'u2', 'u3'],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'settlement_scores_not_zero_sum');
  assert.equal(result.scoreSum, 4);
  assert.equal(wallet.queryLedger().length, before);
  assert.deepEqual(wallet.getAccount('u1'), {
    userId: 'u1',
    currency: 'SHADOW_POINTS',
    available: 80,
    locked: 20,
    total: 100,
  });
});

test('repeated settlement with same idempotencyKey is idempotent', () => {
  const wallet = createWalletService();
  for (const userId of ['u1', 'u2', 'u3']) {
    wallet.issuePoints({ userId, amount: 100, idempotencyKey: `issue:${userId}` });
    wallet.lockPoints({
      userId,
      amount: 20,
      referenceId: 'round-1',
      idempotencyKey: `lock:${userId}:round-1`,
    });
  }

  const first = wallet.applySettlementIntent(settlementIntent(), {
    participants: ['u1', 'u2', 'u3'],
  });
  const ledgerCountAfterFirst = wallet.queryLedger().length;
  const second = wallet.applySettlementIntent(settlementIntent(), {
    participants: ['u1', 'u2', 'u3'],
  });

  assert.strictEqual(second, first);
  assert.equal(wallet.queryLedger().length, ledgerCountAfterFirst);
  assert.deepEqual(wallet.getAccount('u1'), first.accounts.u1);
});

test('queries ledger by user, type, and reference', () => {
  const wallet = createWalletService();
  wallet.issuePoints({ userId: 'u1', amount: 50, idempotencyKey: 'issue:u1' });
  wallet.issuePoints({ userId: 'u2', amount: 50, idempotencyKey: 'issue:u2' });
  wallet.lockPoints({
    userId: 'u1',
    amount: 10,
    referenceId: 'round-query',
    idempotencyKey: 'lock:u1:round-query',
  });

  assert.equal(wallet.queryLedger({ userId: 'u1' }).length, 2);
  assert.equal(wallet.queryLedger({ type: LedgerEntryType.ISSUE }).length, 2);
  const roundEntries = wallet.queryLedger({ referenceId: 'round-query' });
  assert.equal(roundEntries.length, 1);
  assert.equal(roundEntries[0].type, LedgerEntryType.LOCK);
});

test('collects gold table fee and crypto winner fee into the platform account', () => {
  const wallet = createWalletService({ clock: () => '2026-08-17T12:00:00.000Z' });
  wallet.issuePoints({ userId: 'p1', amount: 100, idempotencyKey: 'issue:p1' });

  const gold = wallet.collectPlatformFee({
    fromUserId: 'p1',
    amount: 12,
    kind: 'gold_table_fee',
    idempotencyKey: 'rake:gold:p1:1',
  });
  assert.equal(gold.ok, true);
  assert.equal(gold.fee, 12);
  assert.equal(wallet.getAccount('p1').available, 88);
  assert.equal(wallet.getAccount('ops:platform').available, 12);

  const again = wallet.collectPlatformFee({
    fromUserId: 'p1',
    amount: 12,
    kind: 'gold_table_fee',
    idempotencyKey: 'rake:gold:p1:1',
  });
  assert.equal(again.fee, 12);
  assert.equal(wallet.getAccount('p1').available, 88);

  wallet.issuePoints({ userId: 'p2', amount: 10, idempotencyKey: 'issue:p2' });
  const crypto = wallet.collectPlatformFee({
    fromUserId: 'p2',
    amount: 0.25,
    kind: 'crypto_winner_fee',
    idempotencyKey: 'rake:crypto:p2:1',
  });
  assert.equal(crypto.ok, true);
  assert.equal(wallet.getAccount('ops:platform').available, 12.25);
});

test('snapshot restores full idempotency payloads, not a stub', () => {
  const wallet = createWalletService();
  const issued = wallet.issuePoints({
    userId: 'u1',
    amount: 40,
    idempotencyKey: 'issue:u1:restore',
  });
  const restored = createWalletService();
  restored.importSnapshot(wallet.exportSnapshot());

  const again = restored.issuePoints({
    userId: 'u1',
    amount: 40,
    idempotencyKey: 'issue:u1:restore',
  });
  assert.equal(again.ok, true);
  assert.equal(again.restored, undefined);
  assert.deepEqual(again.account, issued.account);
  assert.equal(restored.getAccount('u1').available, 40);
  assert.equal(restored.queryLedger({ userId: 'u1' }).length, 1);
});

test('does not expose recharge, withdraw, crypto, or cash APIs', () => {
  const wallet = createWalletService();

  assert.equal(typeof wallet.recharge, 'undefined');
  assert.equal(typeof wallet.withdraw, 'undefined');
  assert.equal(typeof wallet.depositCrypto, 'undefined');
});

test('issues USDT_SHADOW chips that cannot be treated as withdrawable', () => {
  const wallet = createWalletService();
  const result = wallet.issuePoints({
    userId: 'u-crypto',
    amount: 50,
    idempotencyKey: 'issue:u-crypto:usdt',
    unit: Currency.USDT_SHADOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.account.currency, 'USDT_SHADOW');
  assert.equal(result.account.available, 50);
  assert.equal(result.ledgerEntries[0].currency, 'USDT_SHADOW');
  assert.equal(wallet.getAccount('u-crypto', Currency.SHADOW_POINTS).available, 0);
});
