import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

import { createSessionToken } from '../src/telegram-auth.js';
import { createApiGateway } from '../src/server.js';
import { createWalletService, GoldLedgerType, DailySupplyPolicy } from '@tea-parlor/wallet-service';

const SESSION_SECRET = 'test-session-secret-daily-supply';
const NOW = 1_800_000_000;

async function request(handler, method, url, body = null, headers = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, {
    method,
    url,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  });
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  res.writeHead = (statusCode, responseHeaders) => {
    res.statusCode = statusCode;
    res.headers = responseHeaders;
    return res;
  };

  await handler(req, res);

  return {
    status: res.statusCode,
    headers: res.headers,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
  };
}

test('daily-supply endpoints require session and enforce 4 claims then exhaust', async () => {
  const walletService = createWalletService({ clock: () => '2026-09-04T02:00:00.000Z' });
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    walletService,
    rateLimit: { enabled: false },
  });
  const token = createSessionToken({
    user: { id: 77, first_name: 'Supply' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const headers = { authorization: `Bearer ${token}` };

  const unauthorized = await request(handler, 'GET', '/wallet/daily-supply');
  assert.equal(unauthorized.status, 401);

  const status0 = await request(handler, 'GET', '/wallet/daily-supply', null, headers);
  assert.equal(status0.status, 200);
  assert.equal(status0.body.remaining, 4);
  assert.equal(status0.body.amount, DailySupplyPolicy.AMOUNT);

  for (let i = 1; i <= 4; i += 1) {
    const claim = await request(handler, 'POST', '/wallet/daily-supply/claim', {}, headers);
    assert.equal(claim.status, 200, `claim ${i}`);
    assert.equal(claim.body.ok, true);
    assert.equal(claim.body.claimed, i);
    assert.equal(claim.body.summary.balances.shadowPoints.available, DailySupplyPolicy.AMOUNT * i);
  }

  const fifth = await request(handler, 'POST', '/wallet/daily-supply/claim', {}, headers);
  assert.equal(fifth.status, 400);
  assert.equal(fifth.body.ok, false);
  assert.equal(fifth.body.reason, 'daily_supply_exhausted');
  assert.equal(
    walletService.queryGoldLedger({ userId: '77', type: GoldLedgerType.DAILY_SUPPLY }).length,
    4,
  );

  const legacy = await request(handler, 'POST', '/wallet/grants/daily', { amount: 4000 }, headers);
  assert.equal(legacy.status, 400);
  assert.equal(legacy.body.reason, 'daily_supply_exhausted');
});
