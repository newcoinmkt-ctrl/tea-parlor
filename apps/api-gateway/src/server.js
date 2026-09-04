import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAvatarRepository } from '@tea-parlor/avatar-system';
import {
  Currency,
  createWalletService,
  createPersistentWalletService,
} from '@tea-parlor/wallet-service';
import {
  authenticateRequest,
  createSessionToken,
  verifyTelegramInitData,
} from './telegram-auth.js';
import { createRateLimiter, rateLimitKey } from './rate-limit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApiGateway(options = {}) {
  const avatarRepository = options.avatarRepository || createAvatarRepository(options.avatarOptions || {});
  const walletService = options.walletService || createWalletService(options.walletOptions || {});

  // P1 修复（评审 #9）：按来源 IP 限流。登录端点带 HMAC 校验且关联邀请金币，
  // 单独用更严格的窗口；其余端点用宽松窗口兜底。测试可注入 clock。
  const limiterOptions = options.rateLimit || {};
  const authLimiter = createRateLimiter({
    windowMs: limiterOptions.windowMs ?? 60_000,
    maxRequests: limiterOptions.authMaxRequests ?? 10,
    clock: limiterOptions.clock,
  });
  const generalLimiter = createRateLimiter({
    windowMs: limiterOptions.windowMs ?? 60_000,
    maxRequests: limiterOptions.generalMaxRequests ?? 120,
    clock: limiterOptions.clock,
  });
  const rateLimitEnabled = limiterOptions.enabled !== false;

  return async function apiGatewayHandler(req, res) {
    try {
      const pathname = new URL(req.url, 'http://api-gateway.local').pathname;

      if (req.method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'api-gateway' });
      }

      if (req.method === 'OPTIONS') {
        return sendJson(res, 204, null);
      }

      if (rateLimitEnabled) {
        const key = rateLimitKey(req);
        const isAuth = req.method === 'POST' && pathname === '/auth/telegram';
        const limiter = isAuth ? authLimiter : generalLimiter;
        const verdict = limiter.consume(key);
        if (!verdict.allowed) {
          res.setHeader('retry-after', String(Math.ceil(verdict.retryAfterMs / 1000)));
          return sendJson(res, 429, { ok: false, reason: 'rate_limited', retryAfterMs: verdict.retryAfterMs });
        }
      }

      if (req.method === 'POST' && req.url === '/auth/telegram') {
        const body = await readJson(req);
        const verified = verifyTelegramInitData(body.initData, options);
        if (!verified.ok) return sendJson(res, 401, { ok: false, reason: verified.reason });
        const startParam = sanitizeStartParam(verified.startParam || '');
        const inviteRegistration = walletService.registerUser({
          userId: String(verified.user.id),
          startParam,
          idempotencyKey: `invite:register:${verified.user.id}:${startParam || 'organic'}`,
          ip: getClientIp(req),
          deviceHash: getDeviceHash(req, body),
          source: 'telegram_mini_app',
        });

        const token = createSessionToken(verified, options);
        return sendJson(res, 200, {
          ok: true,
          token,
          user: verified.user,
          invite: summarizeInviteRegistration(inviteRegistration),
        });
      }

      if (req.method === 'GET' && req.url === '/me') {
        const auth = authenticateRequest(req, options);
        if (!auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });
        return sendJson(res, 200, { ok: true, user: auth.user });
      }

      if (pathname.startsWith('/avatar/')) {
        const auth = authenticateRequest(req, options);
        if (!auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });
        return handleAvatarRoute(req, res, pathname, auth.user, avatarRepository);
      }

      if (pathname.startsWith('/wallet/')) {
        const auth = authenticateRequest(req, options);
        if (!auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });
        return handleWalletRoute(req, res, pathname, auth.user, walletService);
      }

      if (pathname.startsWith('/invite/')) {
        return handleInviteRoute(req, res, pathname, options, walletService);
      }

      return sendJson(res, 404, { ok: false, reason: 'not_found' });
    } catch (error) {
      if (error.message === 'BOT_TOKEN_REQUIRED') {
        return sendJson(res, 500, { ok: false, reason: 'server_auth_not_configured' });
      }
      if (error.message === 'SESSION_SECRET_REQUIRED') {
        return sendJson(res, 500, { ok: false, reason: 'session_secret_not_configured' });
      }
      if (error.message === 'init_data_required') {
        return sendJson(res, 400, { ok: false, reason: 'init_data_required' });
      }
      return sendJson(res, 400, { ok: false, reason: 'bad_request' });
    }
  };
}

async function handleInviteRoute(req, res, pathname, options, walletService) {
  const internal = authenticateInternalRequest(req, options);
  const auth = internal.ok ? null : authenticateRequest(req, options);
  if (!internal.ok && !auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });
  const user = auth?.user || null;
  const userId = user ? String(user.id) : null;

  if (req.method === 'GET' && pathname === '/invite/me') {
    const summary = walletService.getInviteSummary({
      userId,
      inviteLink: buildInviteLink(userId, options),
    });
    return sendJson(res, 200, {
      ...summary,
      notifications: walletService.queryNotifications({ userId, limit: 10 }),
      compliance: inviteComplianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/invite/share-claimed') {
    const body = await readJson(req);
    const result = walletService.claimShareReward({
      userId,
      date: body.date || currentDateKey(),
      idempotencyKey: body.idempotencyKey,
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      summary: walletSummary(walletService, userId),
      compliance: inviteComplianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/invite/bind') {
    const body = await readJson(req);
    const startParam = sanitizeStartParam(
      body.startParam || body.start_param || (body.inviterId ? `inv_${body.inviterId}` : '')
    );
    const result = walletService.registerUser({
      userId,
      startParam,
      idempotencyKey: `invite:bind:${userId}:${startParam}`,
      ip: getClientIp(req),
      deviceHash: getDeviceHash(req, body),
      source: 'api_invite_bind',
    });
    const bind = result.bind || {};
    return sendJson(res, bind.ok ? 200 : 400, {
      ...result,
      ...bind,
      summary: walletSummary(walletService, userId),
      compliance: inviteComplianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/invite/qualify') {
    const body = await readJson(req);
    const inviteeUserId = internal.ok
      ? sanitizeKey(body.inviteeUserId || body.invitee_user_id || body.userId || body.user_id)
      : userId;
    const result = walletService.qualifyInvite({
      inviteeUserId,
      idempotencyKey: body.idempotencyKey,
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      compliance: inviteComplianceCopy(),
    });
  }

  if (req.method === 'GET' && pathname === '/invite/ledger') {
    const url = new URL(req.url, 'http://api-gateway.local');
    return sendJson(res, 200, {
      ok: true,
      ledger: walletService.queryGoldLedger({
        userId,
        limit: Number(url.searchParams.get('limit') || 20),
      }),
      summary: walletService.getInviteSummary({
        userId,
        inviteLink: buildInviteLink(userId, options),
      }),
      compliance: inviteComplianceCopy(),
    });
  }

  return sendJson(res, 404, { ok: false, reason: 'not_found' });
}

async function handleWalletRoute(req, res, pathname, user, walletService) {
  const userId = String(user.id);

  if (req.method === 'GET' && pathname === '/wallet/summary') {
    return sendJson(res, 200, walletSummary(walletService, userId));
  }

  if (req.method === 'GET' && pathname === '/wallet/daily-supply') {
    const status = walletService.getDailySupplyStatus({ userId });
    return sendJson(res, 200, {
      ...status,
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/wallet/daily-supply/claim') {
    const body = await readJson(req);
    const result = walletService.claimDailySupply({
      userId,
      idempotencyKey: body.idempotencyKey || body.idempotency_key,
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname.startsWith('/wallet/grants/')) {
    const grantType = sanitizeKey(pathname.slice('/wallet/grants/'.length) || 'daily');
    const body = await readJson(req);
    // Bind legacy daily grant to the 4×/day Shanghai limiter — no unlimited backdoor.
    if (grantType === 'daily' || grantType === 'daily_supply') {
      const result = walletService.claimDailySupply({
        userId,
        idempotencyKey: body.idempotencyKey || body.idempotency_key,
      });
      return sendJson(res, result.ok ? 200 : 400, {
        ...result,
        summary: walletSummary(walletService, userId),
        compliance: complianceCopy(),
      });
    }
    const amount = positiveAmount(body.amount ?? defaultGrantAmount(grantType));
    const idempotencyKey = body.idempotencyKey || defaultGrantKey(grantType, userId, body.referenceId);
    const unit = parseCurrency(body.currency);
    const result = walletService.issuePoints({
      userId,
      amount,
      idempotencyKey,
      unit,
      reason: `wallet_${grantType}_grant`,
      metadata: {
        grantType,
        referenceId: sanitizeKey(body.referenceId || todayKey()),
        policy: 'non_withdrawable_shadow_points',
      },
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/wallet/lock') {
    const body = await readJson(req);
    const amount = positiveAmount(body.amount);
    const referenceId = sanitizeReference(body.referenceId);
    const idempotencyKey = body.idempotencyKey || `wallet:lock:${referenceId}:${userId}`;
    const result = walletService.lockPoints({
      userId,
      amount,
      referenceId,
      idempotencyKey,
      unit: parseCurrency(body.currency),
      metadata: {
        gameId: sanitizeKey(body.gameId || 'unknown'),
        roomId: sanitizeKey(body.roomId || ''),
        source: 'api-gateway',
        policy: 'server_authoritative_buy_in_lock',
      },
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  if (req.method === 'POST' && pathname === '/wallet/settlement') {
    const body = await readJson(req);
    const result = walletService.applySettlementIntent(body.settlementIntent, {
      participants: body.participants,
    });
    return sendJson(res, result.ok ? 200 : 400, {
      ...result,
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  if (req.method === 'GET' && pathname === '/wallet/ledger') {
    return sendJson(res, 200, {
      ok: true,
      ledger: walletService.queryLedger({ userId }),
      summary: walletSummary(walletService, userId),
      compliance: complianceCopy(),
    });
  }

  return sendJson(res, 404, { ok: false, reason: 'not_found' });
}

function walletSummary(walletService, userId) {
  const shadow = walletService.getAccount(userId, Currency.SHADOW_POINTS);
  const season = walletService.getAccount(userId, Currency.USDT_SHADOW);
  const dailySupply = typeof walletService.getDailySupplyStatus === 'function'
    ? walletService.getDailySupplyStatus({ userId })
    : null;
  return {
    ok: true,
    userId,
    mode: 'server_ledger',
    balances: {
      shadowPoints: shadow,
      seasonPoints: {
        ...season,
        currency: 'SEASON_POINTS',
        label: '赛季积分',
        withdrawable: false,
      },
    },
    dailySupply,
    ledgerCount: walletService.queryLedger({ userId }).length,
    compliance: complianceCopy(),
  };
}

function buildInviteLink(userId, options = {}) {
  const botUsername = sanitizeBotUsername(options.botUsername || options.telegramBotUsername || 'TeaParlorBot');
  const miniAppShortName = sanitizeBotUsername(options.miniAppShortName || options.telegramMiniAppShortName || '');
  const encodedRef = encodeURIComponent(`ref_${userId}`);
  if (options.miniAppInviteUrl) {
    const url = new URL(options.miniAppInviteUrl);
    url.searchParams.set('startapp', `ref_${userId}`);
    return url.toString();
  }
  if (miniAppShortName) return `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodedRef}`;
  return `https://t.me/${botUsername}?start=${encodedRef}`;
}

function summarizeInviteRegistration(result) {
  if (!result?.ok) return { ok: false };
  return {
    ok: true,
    bound: Boolean(result.bind?.bound),
    bindReason: result.bind?.reason || null,
    grantType: result.grant?.goldLedgerEntry?.type || null,
    grantAmount: result.grant?.goldLedgerEntry?.amount || 0,
  };
}

function complianceCopy() {
  return '不可充值、不可提现、不可兑换真实资产';
}

function inviteComplianceCopy() {
  return '金币仅为游戏币，可单向发放或购买占位；不可提现、不可兑回、不可用户间转账、无多级分销';
}

function defaultGrantAmount(grantType) {
  if (grantType === 'daily') return 4000;
  if (grantType === 'invite') return 1000;
  if (grantType === 'task') return 500;
  return 0;
}

function defaultGrantKey(grantType, userId, referenceId) {
  return `wallet:grant:${grantType}:${userId}:${sanitizeKey(referenceId || todayKey())}`;
}

function parseCurrency(value) {
  const text = String(value || '').toUpperCase();
  if (text === 'SEASON_POINTS' || text === 'SEASON' || text === 'USDT_SHADOW') return Currency.USDT_SHADOW;
  return Currency.SHADOW_POINTS;
}

function positiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_amount');
  return Math.round(amount * 100) / 100;
}

function sanitizeReference(value) {
  const text = sanitizeKey(value);
  if (!text) throw new Error('reference_id_required');
  return text;
}

function sanitizeKey(value) {
  return String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function sanitizeStartParam(value) {
  return String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function sanitizeBotUsername(value) {
  return String(value || 'TeaParlorBot').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'TeaParlorBot';
}

function authenticateInternalRequest(req, options = {}) {
  if (!options.internalServiceToken) return { ok: false };
  const token = req.headers?.['x-service-token'] || req.headers?.['X-Service-Token'];
  return token === options.internalServiceToken ? { ok: true } : { ok: false };
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 128);
  return String(req.socket?.remoteAddress || req.connection?.remoteAddress || '').slice(0, 128);
}

function getDeviceHash(req, body = {}) {
  return sanitizeKey(
    body.deviceHash
    || body.device_hash
    || req.headers?.['x-device-hash']
    || ''
  );
}

function todayKey(date = new Date()) {
  return currentDateKey(date);
}

function currentDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(value.getTime())) {
    return String(date || new Date().toISOString()).slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

async function handleAvatarRoute(req, res, pathname, user, avatarRepository) {
  const userId = String(user.id);

  if (req.method === 'GET' && pathname === '/avatar/items') {
    return sendJson(res, 200, { ok: true, items: avatarRepository.getCatalog() });
  }
  if (req.method === 'GET' && pathname === '/avatar/outfits') {
    return sendJson(res, 200, { ok: true, outfits: avatarRepository.getOutfits() });
  }
  if (req.method === 'GET' && pathname === '/avatar/inventory') {
    return sendJson(res, 200, { ok: true, inventory: avatarRepository.getInventory(userId) });
  }
  if (req.method === 'GET' && pathname === '/avatar/equipment') {
    return sendJson(res, 200, { ok: true, avatar: avatarRepository.getEquipment(userId) });
  }
  if (req.method === 'PUT' && pathname === '/avatar/equipment') {
    const body = await readJson(req);
    const incomingAvatar = body.avatar || body;
    const result = avatarRepository.saveEquipment(userId, incomingAvatar.equipment || incomingAvatar);
    if (!result.ok) return sendJson(res, 400, result);
    return sendJson(res, 200, { ok: true, avatar: result });
  }
  return sendJson(res, 404, { ok: false, reason: 'not_found' });
}

export function startApiGateway(options = {}) {
  const port = options.port || Number(process.env.PORT || 3000);
  const host = options.host || process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  // P0 修复：独立启动默认启用文件持久化钱包，进程重启不再丢账本与流水。
  // options.walletOptions.file 可覆盖；显式传空字符串可退回内存模式。
  const walletOptions = { ...(options.walletOptions || {}) };
  if (walletOptions.file === undefined) {
    walletOptions.file = join(__dirname, '..', 'data', 'wallet-snapshot.json');
  }
  if (walletOptions.file) {
    const { file, logger, ...rest } = walletOptions;
    const walletService = createPersistentWalletService({ file, logger, ...rest });
    console.log(`[api-gateway] wallet persistence: ${file} (loaded=${walletService.persistence.loaded})`);
    const persistedServer = createServer(createApiGateway({ ...options, walletService, walletOptions: undefined }));
    persistedServer.listen(port, host);
    return persistedServer;
  }
  const server = createServer(createApiGateway(options));
  server.listen(port, host);
  return server;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('body_too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-device-hash, x-service-token',
  });
  res.end(payload === null ? '' : JSON.stringify(payload));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startApiGateway();
}
