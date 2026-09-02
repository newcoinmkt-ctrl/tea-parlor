import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

import {
  DEFAULT_EQUIPMENT,
  createAvatarRepository,
  equipItem,
  initializeDefaultAvatar,
} from '@tea-parlor/avatar-system';
import {
  authenticateRequest,
  buildDataCheckString,
  createSessionToken,
  signTelegramDataCheckString,
  verifySessionToken,
  verifyTelegramInitData,
} from '../src/telegram-auth.js';
import { createApiGateway } from '../src/server.js';
import { createWalletService, LedgerEntryType, GoldLedgerType } from '@tea-parlor/wallet-service';

const BOT_TOKEN = '123456:TEST_BOT_TOKEN';
const SESSION_SECRET = 'test-session-secret';
const NOW = 1_800_000_000;

function makeInitData(overrides = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(overrides.authDate ?? NOW));
  params.set('query_id', overrides.queryId ?? 'AAE-test-query');
  params.set(
    'user',
    JSON.stringify(overrides.user || {
      id: 42,
      first_name: 'Alice',
      last_name: 'Lee',
      username: 'alice',
      language_code: 'en',
      is_premium: true,
      photo_url: 'https://t.me/i/userpic/320/alice.jpg',
    })
  );

  for (const [key, value] of Object.entries(overrides.extra || {})) {
    params.set(key, value);
  }

  const hash = signTelegramDataCheckString(buildDataCheckString(params), BOT_TOKEN);
  params.set('hash', hash);
  return params.toString();
}

test('verifies valid Telegram initData without reading env when botToken is passed', () => {
  const result = verifyTelegramInitData(makeInitData(), {
    botToken: BOT_TOKEN,
    nowSeconds: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.id, 42);
  assert.equal(result.user.firstName, 'Alice');
  assert.equal(result.user.username, 'alice');
  assert.equal(result.authDate, NOW);
});

test('rejects tampered initData hash', () => {
  const initData = makeInitData().replace('alice', 'mallory');

  const result = verifyTelegramInitData(initData, {
    botToken: BOT_TOKEN,
    nowSeconds: NOW,
  });

  assert.deepEqual(result, { ok: false, reason: 'invalid_hash' });
});

test('rejects expired and future auth_date values', () => {
  assert.deepEqual(
    verifyTelegramInitData(makeInitData({ authDate: NOW - 90_000 }), {
      botToken: BOT_TOKEN,
      nowSeconds: NOW,
    }),
    { ok: false, reason: 'auth_date_expired' }
  );

  assert.deepEqual(
    verifyTelegramInitData(makeInitData({ authDate: NOW + 301 }), {
      botToken: BOT_TOKEN,
      nowSeconds: NOW,
    }),
    { ok: false, reason: 'auth_date_in_future' }
  );
});

test('requires BOT_TOKEN from environment when no botToken is injected', () => {
  assert.throws(
    () => verifyTelegramInitData(makeInitData(), { env: {}, nowSeconds: NOW }),
    /BOT_TOKEN_REQUIRED/
  );
});

test('creates signed session tokens and rejects tampering', () => {
  const verified = verifyTelegramInitData(makeInitData(), {
    botToken: BOT_TOKEN,
    nowSeconds: NOW,
  });
  const token = createSessionToken(verified, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const accepted = verifySessionToken(token, { sessionSecret: SESSION_SECRET });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.user.id, 42);

  const parts = token.split('.');
  const tamperedPayload = `${parts[1].slice(0, -1)}${parts[1].endsWith('A') ? 'B' : 'A'}`;
  assert.equal(
    verifySessionToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`, { sessionSecret: SESSION_SECRET }).ok,
    false
  );

  const badSignature = `${parts[0]}.${parts[1]}.bad`;
  assert.deepEqual(
    verifySessionToken(badSignature, { sessionSecret: SESSION_SECRET }),
    { ok: false, reason: 'invalid_token_signature' }
  );
});

test('rejects expired session tokens', () => {
  const token = createSessionToken({
    user: { id: 42, first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });

  assert.equal(
    verifySessionToken(token, {
      sessionSecret: SESSION_SECRET,
      nowSeconds: NOW,
      maxAgeSeconds: 3600,
    }).ok,
    true
  );
  assert.deepEqual(
    verifySessionToken(token, {
      sessionSecret: SESSION_SECRET,
      nowSeconds: NOW + 3601,
      maxAgeSeconds: 3600,
    }),
    { ok: false, reason: 'token_expired' }
  );
});

test('authenticateRequest accepts bearer session token and rejects missing bearer', () => {
  const token = createSessionToken({
    user: { id: 42, first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const req = { headers: { authorization: `Bearer ${token}` } };

  const result = authenticateRequest(req, { sessionSecret: SESSION_SECRET });

  assert.equal(result.ok, true);
  assert.equal(req.user.id, 42);
  assert.deepEqual(
    authenticateRequest({ headers: {} }, { sessionSecret: SESSION_SECRET }),
    { ok: false, status: 401, reason: 'missing_bearer_token' }
  );
});

test('login endpoint returns session token and /me returns authenticated user profile', async () => {
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
  });
  const login = await request(handler, 'POST', '/auth/telegram', {
    initData: makeInitData(),
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.ok, true);
  assert.equal(login.body.user.id, 42);
  assert.equal(typeof login.body.token, 'string');
  assert.equal(JSON.stringify(login.body).includes(BOT_TOKEN), false);

  const me = await request(handler, 'GET', '/me', null, {
    authorization: `Bearer ${login.body.token}`,
  });

  assert.equal(me.status, 200);
  assert.deepEqual(me.body, {
    ok: true,
    user: {
      id: 42,
      firstName: 'Alice',
      lastName: 'Lee',
      username: 'alice',
      languageCode: 'en',
      isPremium: true,
      photoUrl: 'https://t.me/i/userpic/320/alice.jpg',
    },
  });
});

test('login endpoint can bind invite start_param and grant invited newbie gold', async () => {
  const walletService = createWalletService({ clock: () => '2026-08-30T09:00:00.000Z' });
  walletService.registerUser({ userId: '100' });
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
    walletService,
  });
  const login = await request(handler, 'POST', '/auth/telegram', {
    initData: makeInitData({
      user: { id: 201, first_name: 'Bob' },
      extra: { start_param: 'inv_100' },
    }),
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.invite.bound, true);
  assert.equal(login.body.invite.grantType, GoldLedgerType.NEWBIE_INVITE);
  assert.equal(login.body.invite.grantAmount, 2000);
  assert.equal(walletService.getUser('201').referred_by, '100');
  assert.equal(walletService.getAccount('201').available, 2000);
});

test('login invite attribution trusts signed initData start_param over body referrer', async () => {
  const walletService = createWalletService({ clock: () => '2026-08-30T09:30:00.000Z' });
  walletService.registerUser({ userId: '100' });
  walletService.registerUser({ userId: '999' });
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
    walletService,
  });
  const login = await request(handler, 'POST', '/auth/telegram', {
    initData: makeInitData({
      user: { id: 202, first_name: 'Carol' },
      extra: { start_param: 'ref_100' },
    }),
    start_param: 'ref_999',
    device_hash: 'spoofed-body-device',
  }, {
    'x-forwarded-for': '203.0.113.8',
    'x-device-hash': 'device-hash-header',
  });

  assert.equal(login.status, 200);
  assert.equal(login.body.invite.bound, true);
  assert.equal(walletService.getUser('202').referred_by, '100');
  assert.equal(walletService.queryGoldLedger({ userId: '202', type: GoldLedgerType.NEWBIE_INVITE }).length, 1);
  assert.equal(walletService.queryInviteRiskLogs({ userId: '202', refUserId: '100' }).some((row) => row.result === 'bound'), true);
});

test('login endpoint rejects bad initData without leaking secrets', async () => {
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
  });
  const response = await request(handler, 'POST', '/auth/telegram', {
    initData: makeInitData().replace('Alice', 'Mallory'),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { ok: false, reason: 'invalid_hash' });
  assert.equal(JSON.stringify(response.body).includes(BOT_TOKEN), false);
});

test('avatar endpoints require auth and expose catalog inventory equipment for session user', async () => {
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
  });
  const token = createSessionToken({
    user: { id: 42, first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });

  const unauthorized = await request(handler, 'GET', '/avatar/equipment');
  assert.equal(unauthorized.status, 401);

  const headers = { authorization: `Bearer ${token}` };
  const items = await request(handler, 'GET', '/avatar/items', null, headers);
  const inventory = await request(handler, 'GET', '/avatar/inventory', null, headers);
  const equipment = await request(handler, 'GET', '/avatar/equipment', null, headers);
  const outfits = await request(handler, 'GET', '/avatar/outfits', null, headers);

  assert.equal(items.status, 200);
  assert.equal(items.body.ok, true);
  assert.ok(items.body.items.some((item) => item.id === 'top_black'));
  assert.equal(inventory.status, 200);
  assert.ok(inventory.body.inventory.some((entry) => entry.itemId === DEFAULT_EQUIPMENT.top));
  assert.equal(equipment.body.avatar.equipment.top, DEFAULT_EQUIPMENT.top);
  assert.ok(outfits.body.outfits.some((outfit) => outfit.id === 'outfit_casual'));
});

test('avatar equipment save validates invalid and unowned items on backend', async () => {
  const avatarRepository = createAvatarRepository({
    defaultInventory: Object.values(DEFAULT_EQUIPMENT).filter(Boolean),
  });
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    avatarRepository,
  });
  const token = createSessionToken({
    user: { id: 42, first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const headers = { authorization: `Bearer ${token}` };

  const invalid = await request(handler, 'PUT', '/avatar/equipment', {
    avatar: { ...initializeDefaultAvatar(), equipment: { ...DEFAULT_EQUIPMENT, top: 'missing_item' } },
  }, headers);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.ok, false);

  const unowned = await request(handler, 'PUT', '/avatar/equipment', {
    avatar: { ...initializeDefaultAvatar(), equipment: { ...DEFAULT_EQUIPMENT, top: 'top_black' } },
  }, headers);
  assert.equal(unowned.status, 400);
  assert.equal(unowned.body.reason, 'item_not_owned');

  avatarRepository.grantItem('42', 'top_black', { source: 'test' });
  const savedAvatar = equipItem(initializeDefaultAvatar().equipment, 'top_black');
  const saved = await request(handler, 'PUT', '/avatar/equipment', { avatar: savedAvatar }, headers);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.ok, true);
  assert.equal(saved.body.avatar.equipment.top, 'top_black');
});

test('wallet endpoints expose server ledger balances and idempotent grants, locks, settlements', async () => {
  const walletService = createWalletService();
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    walletService,
  });
  const token = createSessionToken({
    user: { id: 42, first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const headers = { authorization: `Bearer ${token}` };

  const initial = await request(handler, 'GET', '/wallet/summary', null, headers);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.balances.shadowPoints.available, 0);
  assert.match(initial.body.compliance, /不可充值、不可提现、不可兑换真实资产/);

  const grant = await request(handler, 'POST', '/wallet/grants/daily', {
    amount: 4000,
    idempotencyKey: 'wallet:grant:daily:42:2026-08-29:1',
  }, headers);
  assert.equal(grant.status, 200);
  assert.equal(grant.body.summary.balances.shadowPoints.available, 4000);

  const repeatedGrant = await request(handler, 'POST', '/wallet/grants/daily', {
    amount: 4000,
    idempotencyKey: 'wallet:grant:daily:42:2026-08-29:1',
  }, headers);
  assert.equal(repeatedGrant.status, 200);
  assert.equal(walletService.queryLedger({ userId: '42', type: LedgerEntryType.ISSUE }).length, 1);

  const lock = await request(handler, 'POST', '/wallet/lock', {
    amount: 100,
    referenceId: 'round-authority',
    idempotencyKey: 'wallet:lock:round-authority:42',
    gameId: 'doudizhu',
    roomId: 'classic',
  }, headers);
  assert.equal(lock.status, 200);
  assert.equal(lock.body.summary.balances.shadowPoints.available, 3900);
  assert.equal(lock.body.summary.balances.shadowPoints.locked, 100);
  walletService.issuePoints({ userId: 'bot-a', amount: 100, idempotencyKey: 'issue:bot-a' });
  walletService.issuePoints({ userId: 'bot-b', amount: 100, idempotencyKey: 'issue:bot-b' });

  const settlement = await request(handler, 'POST', '/wallet/settlement', {
    participants: ['42', 'bot-a', 'bot-b'],
    settlementIntent: {
      type: 'settlement_intent',
      gameId: 'doudizhu',
      roomId: 'classic',
      roundId: 'round-authority',
      idempotencyKey: 'settlement:round-authority',
      ledgerPolicy: 'adapter_returns_intent_only',
      winnerSide: 'landlord',
      scores: [4, -2, -2],
    },
  }, headers);
  assert.equal(settlement.status, 200);
  assert.equal(settlement.body.summary.balances.shadowPoints.available, 4004);
  assert.equal(settlement.body.summary.balances.shadowPoints.locked, 0);
  assert.equal(walletService.queryLedger({ userId: '42', type: LedgerEntryType.SETTLEMENT }).length, 1);
});

test('invite endpoints bind first inviter, claim share reward, qualify first round, and expose gold ledger', async () => {
  const walletService = createWalletService({ clock: () => '2026-08-30T08:00:00.000Z' });
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    walletService,
    botUsername: 'TeaParlorTestBot',
    miniAppShortName: 'tea',
    internalServiceToken: 'internal-test-token',
  });
  const inviterToken = createSessionToken({
    user: { id: 100, first_name: 'Inviter' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const inviteeToken = createSessionToken({
    user: { id: 200, first_name: 'Invitee' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const inviterHeaders = { authorization: `Bearer ${inviterToken}` };
  const inviteeHeaders = { authorization: `Bearer ${inviteeToken}` };

  walletService.registerUser({ userId: '100' });
  const me = await request(handler, 'GET', '/invite/me', null, inviterHeaders);
  assert.equal(me.status, 200);
  assert.match(me.body.invite_link, /https:\/\/t\.me\/TeaParlorTestBot\/tea\?startapp=ref_100/);
  assert.equal(me.body.valid_invite_count, 0);
  assert.equal(me.body.share_claimed_today, false);
  assert.ok(Array.isArray(me.body.milestones));

  const bound = await request(handler, 'POST', '/invite/bind', {
    start_param: 'inv_100',
  }, inviteeHeaders);
  assert.equal(bound.status, 200);
  assert.equal(bound.body.bound, true);
  assert.equal(walletService.getUser('200').referred_by, '100');

  const overwrite = await request(handler, 'POST', '/invite/bind', {
    start_param: 'inv_300',
  }, inviteeHeaders);
  assert.equal(overwrite.status, 400);
  assert.equal(overwrite.body.reason, 'invite_already_bound');
  assert.equal(walletService.getUser('200').referred_by, '100');

  const share = await request(handler, 'POST', '/invite/share-claimed', {
    date: '2026-08-30',
  }, inviterHeaders);
  assert.equal(share.status, 200);
  assert.equal(share.body.ledgerEntry.type, GoldLedgerType.SHARE);

  const secondShare = await request(handler, 'POST', '/invite/share-claimed', {
    date: '2026-08-30',
    idempotencyKey: 'share-second-manual',
  }, inviterHeaders);
  assert.equal(secondShare.status, 400);
  assert.equal(secondShare.body.reason, 'share_reward_already_claimed_today');

  const qualified = await request(handler, 'POST', '/invite/qualify', {
    invitee_user_id: '200',
  }, {
    'x-service-token': 'internal-test-token',
  });
  assert.equal(qualified.status, 200);
  assert.equal(qualified.body.ledgerEntry.type, GoldLedgerType.INVITE_SUCCESS);
  assert.equal(walletService.getUser('100').valid_invite_count, 1);
  assert.equal(walletService.queryNotifications({ userId: '100' }).some((item) => item.body === '有好友通过你的链接进入游戏室'), true);
  const meAfterQualify = await request(handler, 'GET', '/invite/me', null, inviterHeaders);
  assert.deepEqual(meAfterQualify.body.milestones.map((item) => [item.count, item.amount]), [[3, 0], [5, 2000], [10, 5000]]);
  assert.equal(meAfterQualify.body.recentInvites.length, 1);
  assert.equal(meAfterQualify.body.recentInvites[0].masked_name, '玩家 ****200');
  assert.equal(meAfterQualify.body.recentInvites[0].first_round_completed, true);
  assert.equal(meAfterQualify.body.recentInvites[0].reward_settled, true);

  const repeatQualify = await request(handler, 'POST', '/invite/qualify', {
    invitee_user_id: '200',
    idempotencyKey: 'invite-qualify-repeat',
  }, {
    'x-service-token': 'internal-test-token',
  });
  assert.equal(repeatQualify.status, 400);
  assert.equal(repeatQualify.body.reason, 'invite_success_already_credited');

  const ledger = await request(handler, 'GET', '/invite/ledger', null, inviterHeaders);
  assert.equal(ledger.status, 200);
  assert.equal(ledger.body.ledger.some((entry) => entry.type === GoldLedgerType.SHARE), true);
  assert.equal(ledger.body.ledger.some((entry) => entry.type === GoldLedgerType.INVITE_SUCCESS), true);
  assert.match(ledger.body.compliance, /不可提现/);
  assert.match(ledger.body.compliance, /不可用户间转账/);
});

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
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
  };
}
