import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDailySupplyStatus,
  formatDailySupplyClaimSuccess,
  formatDailySupplyExhaustedReason,
  claimButtonLabel,
  DAILY_SUPPLY_TG_PROMPT,
} from './daily-supply-copy.js';

test('copy helpers cover TG prompt, remaining, exhausted', () => {
  assert.equal(formatDailySupplyStatus({ hasSession: false }), DAILY_SUPPLY_TG_PROMPT);
  assert.match(formatDailySupplyStatus({ remaining: 3, hasSession: true }), /还可领 3\/4/);
  assert.match(formatDailySupplyStatus({ remaining: 0, hasSession: true }), /今日补给次数已用完/);
  assert.match(formatDailySupplyClaimSuccess({ amount: 4000, remaining: 2 }), /剩余 2/);
  assert.equal(formatDailySupplyExhaustedReason('daily_supply_exhausted'), '今日补给次数已用完');
  assert.equal(claimButtonLabel({ hasSession: false }), '请从 Telegram 打开');
  assert.equal(claimButtonLabel({ remaining: 0, hasSession: true }), '今日已领完');
});
