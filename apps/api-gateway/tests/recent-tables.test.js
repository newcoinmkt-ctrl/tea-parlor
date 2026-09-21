import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSessionToken } from '../src/telegram-auth.js';
import { createApiGateway } from '../src/server.js';
import { createWalletService } from '@tea-parlor/wallet-service';
import { createRecentTablesStore } from '../src/recent-tables.js';

const SESSION_SECRET = 'test-session-secret-recent-tables';
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

function authHeaders(userId = '42') {
  const token = createSessionToken({
    user: { id: Number(userId) || userId, username: 'alice', first_name: 'Alice' },
    authDate: NOW,
  }, {
    sessionSecret: SESSION_SECRET,
    issuedAt: NOW,
  });
  return { authorization: `Bearer ${token}` };
}

test('recent-tables requires session', async () => {
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    walletService: createWalletService(),
    recentTablesStore: createRecentTablesStore(),
    rateLimit: { enabled: false },
  });
  const unauthorized = await request(handler, 'GET', '/social/recent-tables');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.ok, false);
});

test('POST then GET recent-tables by user survives in store (device switch simulation)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recent-tables-'));
  const file = join(dir, 'recent-tables.json');
  try {
    const store = createRecentTablesStore({ file });
    const handler = createApiGateway({
      sessionSecret: SESSION_SECRET,
      walletService: createWalletService(),
      recentTablesStore: store,
      rateLimit: { enabled: false },
    });
    const headers = authHeaders('77');
    const post = await request(handler, 'POST', '/social/recent-tables', {
      roomKey: 'dual_ddz_abc123',
      game: 'doudizhu',
      label: '好友房·abc123',
    }, headers);
    assert.equal(post.status, 200, JSON.stringify(post.body));
    assert.equal(post.body.ok, true);
    assert.equal(post.body.tables.length, 1);
    assert.equal(post.body.tables[0].roomKey, 'dual_ddz_abc123');

    // "other device" = new handler sharing same file-backed store reload
    const store2 = createRecentTablesStore({ file });
    const handler2 = createApiGateway({
      sessionSecret: SESSION_SECRET,
      walletService: createWalletService(),
      recentTablesStore: store2,
      rateLimit: { enabled: false },
    });
    const get = await request(handler2, 'GET', '/social/recent-tables', null, headers);
    assert.equal(get.status, 200);
    assert.equal(get.body.source, 'server');
    assert.equal(get.body.tables.length, 1);
    assert.equal(get.body.tables[0].roomKey, 'dual_ddz_abc123');

    // different user sees empty
    const other = await request(handler2, 'GET', '/social/recent-tables', null, authHeaders('99'));
    assert.equal(other.body.tables.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST rejects missing roomKey', async () => {
  const handler = createApiGateway({
    sessionSecret: SESSION_SECRET,
    walletService: createWalletService(),
    recentTablesStore: createRecentTablesStore(),
    rateLimit: { enabled: false },
  });
  const bad = await request(handler, 'POST', '/social/recent-tables', { game: 'mahjong' }, authHeaders());
  assert.equal(bad.status, 400);
  assert.equal(bad.body.reason, 'room_key_required');
});
