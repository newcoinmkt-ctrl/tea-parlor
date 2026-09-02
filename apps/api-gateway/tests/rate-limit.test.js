import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';

import { createRateLimiter, rateLimitKey } from '../src/rate-limit.js';
import { createApiGateway } from '../src/server.js';
import { createSessionToken, signTelegramDataCheckString, buildDataCheckString } from '../src/telegram-auth.js';

const BOT_TOKEN = '123456:TEST_BOT_TOKEN';
const SESSION_SECRET = 'test-session-secret';
const NOW = 1_800_000_000;

function makeInitData(user = { id: 42, first_name: 'Alice' }) {
  const params = new URLSearchParams();
  params.set('auth_date', String(NOW));
  params.set('user', JSON.stringify(user));
  const hash = signTelegramDataCheckString(buildDataCheckString(params), BOT_TOKEN);
  params.set('hash', hash);
  return params.toString();
}

function request(handler, method, url, body = null, headers = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, {
    method,
    url,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    socket: { remoteAddress: headers['x-test-ip'] || '203.0.113.9' },
  });
  delete req.headers['x-test-ip'];
  const chunks = [];
  const res = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  res.setHeader = (k, v) => { res.headers = { ...(res.headers || {}), [k]: v }; };
  res.writeHead = (status, h) => { res.statusCode = status; res.headers = { ...(res.headers || {}), ...h }; return res; };
  return handler(req, res).then(() => ({
    status: res.statusCode,
    headers: res.headers || {},
    body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
  }));
}

test('rate limiter allows requests under the limit and blocks over it', () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3, clock: () => now });

  assert.equal(limiter.consume('ip-a').allowed, true);
  assert.equal(limiter.consume('ip-a').allowed, true);
  assert.equal(limiter.consume('ip-a').allowed, true);
  const blocked = limiter.consume('ip-a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);

  // 不同 key 互不影响
  assert.equal(limiter.consume('ip-b').allowed, true);

  // 进入下一个窗口后重置
  now += 60_000;
  assert.equal(limiter.consume('ip-a').allowed, true);
});

test('rateLimitKey extracts client ip from x-forwarded-for or socket', () => {
  assert.equal(rateLimitKey({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
  assert.equal(rateLimitKey({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9');
  assert.equal(rateLimitKey({ headers: {} }), 'unknown');
});

test('gateway login endpoint returns 429 after exceeding the auth rate limit', async () => {
  let now = 2_000_000_000;
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
    rateLimit: { authMaxRequests: 2, clock: () => now },
  });

  const first = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.1' });
  const second = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.1' });
  const third = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.1' });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429, '超过登录限流应返回 429');
  assert.equal(third.body.reason, 'rate_limited');
  assert.ok(third.headers['retry-after']);

  // 其他 IP 不受影响
  const otherIp = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.2' });
  assert.equal(otherIp.status, 200);

  // 进入下一个窗口后可恢复
  now += 60_000;
  const recovered = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.1' });
  assert.equal(recovered.status, 200);
});

test('rate limiting can be disabled via options.rateLimit.enabled=false', async () => {
  const handler = createApiGateway({
    botToken: BOT_TOKEN,
    sessionSecret: SESSION_SECRET,
    nowSeconds: NOW,
    rateLimit: { enabled: false },
  });
  for (let i = 0; i < 15; i++) {
    const res = await request(handler, 'POST', '/auth/telegram', { initData: makeInitData() }, { 'x-test-ip': '10.0.0.3' });
    assert.equal(res.status, 200);
  }
});

test('authenticated endpoints still work within the general rate limit', async () => {
  const handler = createApiGateway({ sessionSecret: SESSION_SECRET, rateLimit: { generalMaxRequests: 50 } });
  const token = createSessionToken({ user: { id: 42, first_name: 'Alice' }, authDate: NOW }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  const res = await request(handler, 'GET', '/me', null, { authorization: `Bearer ${token}` });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, 42);
});
