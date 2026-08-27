import { createServer } from 'node:http';
import { createAvatarRepository } from '@tea-parlor/avatar-system';
import {
  authenticateRequest,
  createSessionToken,
  verifyTelegramInitData,
} from './telegram-auth.js';

export function createApiGateway(options = {}) {
  const avatarRepository = options.avatarRepository || createAvatarRepository(options.avatarOptions || {});

  return async function apiGatewayHandler(req, res) {
    try {
      const pathname = new URL(req.url, 'http://api-gateway.local').pathname;

      if (req.method === 'POST' && req.url === '/auth/telegram') {
        const body = await readJson(req);
        const verified = verifyTelegramInitData(body.initData, options);
        if (!verified.ok) return sendJson(res, 401, { ok: false, reason: verified.reason });

        const token = createSessionToken(verified, options);
        return sendJson(res, 200, { ok: true, token, user: verified.user });
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
  const server = createServer(createApiGateway(options));
  server.listen(port);
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
  });
  res.end(JSON.stringify(payload));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startApiGateway();
}
