import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_VERSION = 'v1';

export function getBotTokenFromEnv(env = process.env) {
  const token = env.BOT_TOKEN;
  if (!token || typeof token !== 'string') {
    throw new Error('BOT_TOKEN_REQUIRED');
  }
  return token;
}

export function verifyTelegramInitData(initData, options = {}) {
  const botToken = options.botToken || getBotTokenFromEnv(options.env);
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AUTH_AGE_SECONDS;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const params = parseInitData(initData);
  const receivedHash = params.get('hash');

  if (!receivedHash) return { ok: false, reason: 'missing_hash' };
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: 'invalid_auth_date' };
  }
  if (maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    return { ok: false, reason: 'auth_date_expired' };
  }
  if (authDate - nowSeconds > 300) {
    return { ok: false, reason: 'auth_date_in_future' };
  }

  const dataCheckString = buildDataCheckString(params);
  const expectedHash = signTelegramDataCheckString(dataCheckString, botToken);
  if (!safeEqualHex(receivedHash, expectedHash)) {
    return { ok: false, reason: 'invalid_hash' };
  }

  const user = parseTelegramUser(params.get('user'));
  if (!user) return { ok: false, reason: 'missing_user' };

  return {
    ok: true,
    user: sanitizeUser(user),
    authDate,
    queryId: params.get('query_id') || null,
    startParam: params.get('start_param') || null,
  };
}

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

export function authenticateRequest(req, options = {}) {
  const header = getHeader(req, 'authorization');
  if (!header?.startsWith('Bearer ')) {
    return { ok: false, status: 401, reason: 'missing_bearer_token' };
  }
  const result = verifySessionToken(header.slice('Bearer '.length), options);
  if (!result.ok) return { ok: false, status: 401, reason: result.reason };
  req.user = result.user;
  return { ok: true, user: result.user };
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

export function signTelegramDataCheckString(dataCheckString, botToken) {
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

export function buildDataCheckString(params) {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function parseInitData(initData) {
  if (typeof initData !== 'string' || initData.length === 0) {
    throw new Error('init_data_required');
  }
  return new URLSearchParams(initData);
}

function parseTelegramUser(rawUser) {
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser);
    if (!Number.isFinite(Number(user.id))) return null;
    return user;
  } catch {
    return null;
  }
}

function getSessionSecret(options) {
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

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function getHeader(req, name) {
  return req.headers?.[name] || req.headers?.[name.toLowerCase()] || null;
}
