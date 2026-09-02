/**
 * Session token 签发与校验 — 网关与实时游戏服共享。
 *
 * token 格式：v1.<base64url(payload)>.<base64url(hmac-sha256(payload))>
 * 与 api-gateway/src/telegram-auth.js 的 createSessionToken 完全兼容：
 * 网关用同一个 secret 签发，游戏服用同一个 secret 校验。
 *
 * 红线：密钥只从环境变量或调用方注入读取，不落日志、不进返回体。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_VERSION = 'v1';
const DEFAULT_MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;

export function createSessionToken({ user, authDate, queryId = null, startParam = null }, options = {}) {
  const secret = getSessionSecret(options);
  const issuedAt = options.issuedAt ?? options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user.id),
    user: sanitizeUser(user),
    authDate,
    queryId,
    startParam,
    iat: issuedAt,
  };
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload, secret);
  return `${SESSION_VERSION}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token, options = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_token' };
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) {
    return { ok: false, reason: 'invalid_token_format' };
  }
  const [, encodedPayload, signature] = parts;
  const expected = signSessionPayload(encodedPayload, getSessionSecret(options));
  if (!safeEqualText(signature, expected)) {
    return { ok: false, reason: 'invalid_token_signature' };
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (!payload?.sub || !payload?.user) return { ok: false, reason: 'invalid_token_payload' };
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_SESSION_AGE_SECONDS;
    const issuedAt = Number(payload.iat);
    if (maxAgeSeconds > 0 && Number.isInteger(issuedAt) && nowSeconds - issuedAt > maxAgeSeconds) {
      return { ok: false, reason: 'token_expired' };
    }
    return {
      ok: true,
      user: sanitizeUser(payload.user),
      authDate: payload.authDate,
      queryId: payload.queryId,
      startParam: payload.startParam || null,
    };
  } catch {
    return { ok: false, reason: 'invalid_token_payload' };
  }
}

export function sanitizeUser(user) {
  return {
    id: Number(user.id),
    firstName: user.first_name || user.firstName || '',
    lastName: user.last_name || user.lastName || '',
    username: user.username || '',
    languageCode: user.language_code || user.languageCode || '',
    isPremium: Boolean(user.is_premium ?? user.isPremium ?? false),
    photoUrl: user.photo_url || user.photoUrl || '',
  };
}

export function getSessionSecret(options = {}) {
  if (options.sessionSecret) return options.sessionSecret;
  const env = options.env || process.env;
  if (env.API_GATEWAY_SESSION_SECRET) return env.API_GATEWAY_SESSION_SECRET;
  throw new Error('SESSION_SECRET_REQUIRED');
}

function signSessionPayload(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function base64urlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
