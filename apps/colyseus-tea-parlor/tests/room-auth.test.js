import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionToken } from '@tea-parlor/session-auth';
import { verifyRoomJoin } from '../src/rooms/DoudizhuRoom.js';

const SECRET = 'colyseus-test-secret';
const NOW = Math.floor(Date.now() / 1000);

function tokenFor(userId) {
  return createSessionToken(
    { user: { id: userId, first_name: `p${userId}` }, authDate: NOW },
    { sessionSecret: SECRET, issuedAt: NOW },
  );
}

test('verifyRoomJoin accepts a valid token matching the claimed uid', () => {
  const result = verifyRoomJoin(
    { uid: '42', token: tokenFor(42) },
    { sessionSecret: SECRET },
  );
  assert.equal(result.ok, true);
  assert.equal(result.uid, '42');
  assert.equal(result.trusted, false);
});

test('verifyRoomJoin rejects a missing token when a secret is configured', () => {
  const result = verifyRoomJoin({ uid: '42' }, { sessionSecret: SECRET });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'auth_failed');
  assert.equal(result.detail, 'missing_token');
});

test('verifyRoomJoin rejects a forged token signature', () => {
  const forged = createSessionToken(
    { user: { id: 42 }, authDate: NOW },
    { sessionSecret: 'attacker-secret', issuedAt: NOW },
  );
  const result = verifyRoomJoin({ uid: '42', token: forged }, { sessionSecret: SECRET });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'auth_failed');
  assert.equal(result.detail, 'invalid_token_signature');
});

test('verifyRoomJoin rejects a token whose user does not match the claimed uid', () => {
  const result = verifyRoomJoin(
    { uid: '99', token: tokenFor(42) },
    { sessionSecret: SECRET },
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'auth_identity_mismatch');
});

test('verifyRoomJoin rejects an expired token', () => {
  const expired = createSessionToken(
    { user: { id: 42 }, authDate: NOW },
    { sessionSecret: SECRET, issuedAt: NOW - 8 * 24 * 60 * 60 },
  );
  const result = verifyRoomJoin({ uid: '42', token: expired }, { sessionSecret: SECRET });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'auth_failed');
  assert.equal(result.detail, 'token_expired');
});

test('verifyRoomJoin falls back to trust mode when no secret is configured', () => {
  const result = verifyRoomJoin({ uid: '42' }, { sessionSecret: null });
  assert.equal(result.ok, true);
  assert.equal(result.uid, '42');
  assert.equal(result.trusted, true, '无密钥时为本地开发信任模式');
});

test('verifyRoomJoin without uid uses token identity as the uid', () => {
  const result = verifyRoomJoin({ token: tokenFor(42) }, { sessionSecret: SECRET });
  assert.equal(result.ok, true);
  assert.equal(result.uid, '42', 'uid 缺失时应以 token 身份为准');
});
