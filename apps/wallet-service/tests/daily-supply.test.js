import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWalletService,
  createPersistentWalletService,
  GoldLedgerType,
  DailySupplyPolicy,
} from '../src/index.js';

test('daily supply allows 4 claims then exhausts for same Shanghai day', () => {
  let now = '2026-09-04T02:00:00.000Z'; // Shanghai 10:00 same calendar day
  const wallet = createWalletService({ clock: () => now });
  const userId = 'u-daily-1';

  for (let i = 1; i <= 4; i += 1) {
    const result = wallet.claimDailySupply({ userId });
    assert.equal(result.ok, true, `claim ${i} should succeed`);
    assert.equal(result.amount, DailySupplyPolicy.AMOUNT);
    assert.equal(result.claimIndex, i);
    assert.equal(result.claimed, i);
    assert.equal(result.remaining, 4 - i);
    assert.equal(result.account.available, DailySupplyPolicy.AMOUNT * i);
  }

  const fifth = wallet.claimDailySupply({ userId });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.reason, 'daily_supply_exhausted');
  assert.equal(fifth.claimed, 4);
  assert.equal(fifth.remaining, 0);
  assert.equal(wallet.getAccount(userId).available, DailySupplyPolicy.AMOUNT * 4);
  assert.equal(
    wallet.queryGoldLedger({ userId, type: GoldLedgerType.DAILY_SUPPLY }).length,
    4,
  );
});

test('next Asia/Shanghai calendar day resets daily supply claims', () => {
  let now = '2026-09-04T15:30:00.000Z'; // Shanghai 2026-09-04 23:30
  const wallet = createWalletService({ clock: () => now });
  const userId = 'u-daily-2';

  for (let i = 0; i < 4; i += 1) {
    assert.equal(wallet.claimDailySupply({ userId }).ok, true);
  }
  assert.equal(wallet.claimDailySupply({ userId }).reason, 'daily_supply_exhausted');

  now = '2026-09-04T16:05:00.000Z'; // Shanghai 2026-09-05 00:05
  const nextDay = wallet.claimDailySupply({ userId });
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.date, '2026-09-05');
  assert.equal(nextDay.claimed, 1);
  assert.equal(nextDay.remaining, 3);
  assert.equal(wallet.getAccount(userId).available, DailySupplyPolicy.AMOUNT * 5);
});

test('daily supply status and snapshot reload keep claim count', () => {
  const dir = mkdtempSync(join(tmpdir(), 'daily-supply-'));
  const file = join(dir, 'wallet.json');
  try {
    let now = '2026-09-04T04:00:00.000Z';
    const first = createPersistentWalletService({ file, clock: () => now });
    first.claimDailySupply({ userId: 'u-persist' });
    first.claimDailySupply({ userId: 'u-persist' });
    assert.equal(first.getDailySupplyStatus({ userId: 'u-persist' }).claimed, 2);

    const second = createPersistentWalletService({ file, clock: () => now });
    const status = second.getDailySupplyStatus({ userId: 'u-persist' });
    assert.equal(status.claimed, 2);
    assert.equal(status.remaining, 2);
    assert.equal(second.getAccount('u-persist').available, DailySupplyPolicy.AMOUNT * 2);

    const thirdClaim = second.claimDailySupply({ userId: 'u-persist' });
    assert.equal(thirdClaim.ok, true);
    assert.equal(thirdClaim.claimed, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('idempotent replay of same claim slot does not double credit', () => {
  const wallet = createWalletService({ clock: () => '2026-09-04T08:00:00.000Z' });
  const key = 'gold:daily_supply:u3:2026-09-04:1';
  const a = wallet.claimDailySupply({ userId: 'u3', idempotencyKey: key });
  const b = wallet.claimDailySupply({ userId: 'u3', idempotencyKey: key });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(wallet.getAccount('u3').available, DailySupplyPolicy.AMOUNT);
  assert.equal(wallet.getDailySupplyStatus({ userId: 'u3' }).claimed, 1);
});
