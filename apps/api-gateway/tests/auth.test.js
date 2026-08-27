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
