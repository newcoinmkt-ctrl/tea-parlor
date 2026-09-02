import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createPersistentWalletService,
  createWalletService,
  LedgerEntryType,
} from '../src/index.js';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'wallet-persist-'));
}

test('persistent wallet survives restart: balances and ledger reload from snapshot file', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');

  try {
    // 第一次运行：发分、锁定、结算
    const first = createPersistentWalletService({ file });
    first.issuePoints({ userId: 'u1', amount: 500, idempotencyKey: 'issue:u1:1' });
    first.issuePoints({ userId: 'u2', amount: 500, idempotencyKey: 'issue:u2:1' });
    first.issuePoints({ userId: 'u3', amount: 500, idempotencyKey: 'issue:u3:1' });
    first.lockPoints({ userId: 'u1', amount: 100, referenceId: 'round-1', idempotencyKey: 'lock:u1:r1' });

    assert.equal(first.getAccount('u1').available, 400);
    assert.equal(first.getAccount('u1').locked, 100);
    assert.equal(existsSync(file), true, '每次变更后都应已落盘');

    // 模拟进程重启：全新实例加载同一文件
    const second = createPersistentWalletService({ file });
    assert.equal(second.getAccount('u1').available, 400, '重启后可用余额必须一致');
    assert.equal(second.getAccount('u1').locked, 100, '重启后锁定余额必须一致');
    assert.equal(second.queryLedger({ userId: 'u1' }).length, 2, '流水必须完整恢复');
    assert.equal(second.persistence.loaded, true);

    // 幂等键也要恢复：重复发分不得重复入账
    const repeated = second.issuePoints({ userId: 'u1', amount: 500, idempotencyKey: 'issue:u1:1' });
    assert.equal(repeated.ok, true, '幂等重放应返回缓存结果');
    assert.equal(second.getAccount('u1').available, 400, '重启后幂等保护仍有效，不得重复入账');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settlement round-trip persists across restart with zero-sum guarantee intact', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');

  try {
    const first = createPersistentWalletService({ file });
    for (const userId of ['p1', 'p2', 'p3']) {
      first.issuePoints({ userId, amount: 1000, idempotencyKey: `issue:${userId}` });
      first.lockPoints({ userId, amount: 100, referenceId: 'round-x', idempotencyKey: `lock:${userId}:round-x` });
    }
    first.applySettlementIntent({
      type: 'settlement_intent',
      gameId: 'doudizhu',
      roomId: 'room-x',
      roundId: 'round-x',
      idempotencyKey: 'settle:round-x',
      scores: [6, -3, -3],
      rawScores: [6, -3, -3],
      winnerSide: 'landlord',
      ledgerPolicy: 'adapter_returns_intent_only',
    }, { participants: ['p1', 'p2', 'p3'] });

    const second = createPersistentWalletService({ file });
    assert.equal(second.getAccount('p1').available, 1006);
    assert.equal(second.getAccount('p2').available, 997);
    assert.equal(second.getAccount('p3').available, 997);
    assert.equal(second.queryLedger({ type: LedgerEntryType.SETTLEMENT }).length, 3);

    // 结算幂等：重启后重复提交同一结算意图不产生新流水
    const before = second.queryLedger().length;
    second.applySettlementIntent({
      type: 'settlement_intent',
      gameId: 'doudizhu',
      roomId: 'room-x',
      roundId: 'round-x',
      idempotencyKey: 'settle:round-x',
      scores: [6, -3, -3],
      rawScores: [6, -3, -3],
      winnerSide: 'landlord',
      ledgerPolicy: 'adapter_returns_intent_only',
    }, { participants: ['p1', 'p2', 'p3'] });
    assert.equal(second.queryLedger().length, before, '结算幂等键必须在重启后仍然有效');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt snapshot file fails fast instead of silently starting an empty ledger', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');
  writeFileSync(file, '{not-valid-json', 'utf8');

  try {
    assert.throws(
      () => createPersistentWalletService({ file }),
      /WALLET_SNAPSHOT_CORRUPT/,
      '损坏快照必须拒绝启动，不能静默重置账本'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing snapshot file starts a fresh empty ledger', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');

  try {
    const wallet = createPersistentWalletService({ file });
    assert.equal(wallet.persistence.loaded, false);
    assert.equal(wallet.getAccount('new-user').available, 0);
    assert.equal(existsSync(file), false, '未发生变更前不应写盘');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only methods do not rewrite the snapshot file', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');

  try {
    const wallet = createPersistentWalletService({ file });
    wallet.issuePoints({ userId: 'u1', amount: 100, idempotencyKey: 'issue:u1' });
    const savedAt = JSON.parse(readFileSync(file, 'utf8')).savedAt;

    wallet.getAccount('u1');
    wallet.queryLedger({ userId: 'u1' });
    wallet.getInviteSummary({ userId: 'u1' });

    assert.equal(JSON.parse(readFileSync(file, 'utf8')).savedAt, savedAt, '只读方法不应触发写盘');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invite and gold ledger state survives restart', () => {
  const dir = makeTempDir();
  const file = join(dir, 'wallet.json');

  try {
    const first = createPersistentWalletService({ file, clock: () => '2026-08-31T08:00:00.000Z' });
    first.registerUser({ userId: '100' });
    first.registerUser({ userId: '200', startParam: 'ref_100' });
    assert.equal(first.getUser('200').referred_by, '100');

    const second = createPersistentWalletService({ file, clock: () => '2026-08-31T08:00:00.000Z' });
    assert.equal(second.getUser('200').referred_by, '100', '邀请绑定关系必须重启后仍在');
    assert.equal(second.getAccount('200').available, 2000, '新人金币必须重启后仍在');

    // 重复注册不得重复发金币（幂等保护随快照恢复）
    second.registerUser({ userId: '200', startParam: 'ref_100' });
    assert.equal(second.getAccount('200').available, 2000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('non-persistent createWalletService keeps in-memory behavior unchanged', () => {
  const wallet = createWalletService();
  wallet.issuePoints({ userId: 'u1', amount: 50, idempotencyKey: 'issue:u1' });
  assert.equal(wallet.getAccount('u1').available, 50);
});
