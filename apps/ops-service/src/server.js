import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createWalletService, LedgerEntryType } from '@tea-parlor/wallet-service';
import { createGameCatalog, publicGame } from './catalog.js';
import {
  DEFAULT_CHARACTERS,
  DEFAULT_SKINS,
  createAppearanceCatalog,
  publicAppearance,
  upsertAppearanceItem,
} from './appearance.js';
import { loadOpsStore, saveOpsStore, snapshotFromMaps } from './store.js';
import { LOGO_MARKS, DEFAULT_COSTUME_LOGOS, normalizeCostumeLogos, publicCostumeLogos } from './logos.js';
import {
  createAdCategoryMap,
  createAdLogoMap,
  publicLogo,
} from './ads.js';
import { DEFAULT_REVENUE_POLICY, PLATFORM_USER_ID, quotePlatformFee } from './revenue.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const OPS_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  GAME_OPERATOR: 'game_operator',
  SUPPORT: 'support',
  AUDITOR: 'auditor',
});

const ROLE_LABELS = Object.freeze({
  [OPS_ROLES.SUPER_ADMIN]: '超级管理员',
  [OPS_ROLES.GAME_OPERATOR]: '游戏运营',
  [OPS_ROLES.SUPPORT]: '客服人员',
  [OPS_ROLES.AUDITOR]: '审计人员',
});

const CONFIG_STATUS = Object.freeze(['draft', 'reviewing', 'published', 'archived']);

export function createOpsService(options = {}) {
  const adminToken = options.adminToken || process.env.ADMIN_TOKEN || null;
  const walletService = options.walletService || createWalletService({ clock: options.clock });
  const gameServers = options.gameServers || {};
  const clock = options.clock || (() => new Date().toISOString());
  const storePath = options.storePath || null;
  const saved = loadOpsStore(storePath);

  const frozenUsers = new Map(saved?.frozenUsers || []);
  const roomConfigs = new Map(saved?.roomConfigs?.length ? saved.roomConfigs : defaultRoomConfigs());
  const adPlacements = new Map(saved?.adPlacements?.length ? saved.adPlacements : defaultAdPlacements());
  const gameCandidates = new Map(defaultGameCandidates());
  const games = createGameCatalog(saved?.games || []);
  const characters = createAppearanceCatalog(DEFAULT_CHARACTERS, saved?.characters || []);
  const skins = createAppearanceCatalog(DEFAULT_SKINS, saved?.skins || []);
  let costumeLogos = normalizeCostumeLogos(saved?.costumeLogos || DEFAULT_COSTUME_LOGOS);
  const adCategories = createAdCategoryMap(saved?.adCategories || []);
  const adLogos = createAdLogoMap(saved?.adLogos || []);
  const adEvents = new Map(saved?.adEvents || []);
  const auditLogs = new Map((saved?.auditLogs || []).map((item) => [item.id, item]));
  const configVersions = new Map((saved?.configVersions || []).map((item) => [item.version, item]));
  const adminUsers = createAdminUserMap({
    adminToken,
    roleTokens: options.roleTokens || {},
  });
  const userProfiles = new Map(saved?.userProfiles || []);
  const pendingRevenueEvents = new Map(saved?.pendingRevenueEvents || []);

  if (saved?.wallet && walletService.importSnapshot) {
    walletService.importSnapshot(saved.wallet);
  }
  if (options.seedDemo && userProfiles.size === 0) seedDemoUsers();

  function persist() {
    if (!storePath) return;
    saveOpsStore(storePath, snapshotFromMaps({
      frozenUsers,
      roomConfigs,
      adPlacements,
      games,
      characters,
      skins,
      costumeLogos,
      adCategories,
      adLogos,
      adEvents,
      auditLogs,
      configVersions,
      userProfiles,
      pendingRevenueEvents,
      wallet: walletService.exportSnapshot ? walletService.exportSnapshot() : null,
    }));
  }

  async function handler(req, res) {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'ops-service' });
      }

      if (req.method === 'OPTIONS') {
        return sendJson(res, 204, {});
      }

      if (req.method === 'GET' && url.pathname === '/public/ad-placements') {
        return sendJson(res, 200, {
          ok: true,
          placements: listAdPlacements(Object.fromEntries(url.searchParams.entries()), false),
          categories: listAdCategories(),
          logos: listAdLogos(false, true),
        });
      }

      if (req.method === 'POST' && (url.pathname === '/public/ad-events' || url.pathname === '/public/ad-impressions' || url.pathname === '/public/ad-clicks')) {
        const body = await readJson(req);
        const defaultType = url.pathname.endsWith('clicks') ? 'click' : url.pathname.endsWith('impressions') ? 'impression' : '';
        const recorded = recordAdEvent({ ...body, eventType: body.eventType || defaultType }, req);
        return sendJson(res, recorded.ok ? 200 : 400, recorded);
      }

      const publicLogoMatch = url.pathname.match(/^\/public\/ad-logos\/([^/]+)$/);
      if (req.method === 'GET' && publicLogoMatch) {
        return serveAdLogo(res, decodeURIComponent(publicLogoMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/public/game-candidates') {
        return sendJson(res, 200, {
          ok: true,
          candidates: listGameCandidates(false),
        });
      }

      if (req.method === 'GET' && url.pathname === '/public/catalog') {
        return sendJson(res, 200, {
          ok: true,
          policy: 'shadow_points_only',
          games: listGames(),
          characters: listCharacters(),
          skins: listSkins(),
          costumeLogos: publicCostumeLogos(costumeLogos),
          adCategories: listAdCategories(),
          adLogos: listAdLogos(false, true),
          revenue: DEFAULT_REVENUE_POLICY,
        });
      }

      if (req.method === 'GET' && url.pathname === '/public/chain-assets') {
        const playerId = String(url.searchParams.get('playerId') || 'lobby:anonymous').trim().slice(0, 64);
        return sendJson(res, 200, buildPublicChainAssets(playerId));
      }

      if (req.method === 'GET' && url.pathname === '/public/costume-logos') {
        return sendJson(res, 200, { ok: true, costumeLogos: publicCostumeLogos(costumeLogos) });
      }

      if (req.method === 'POST' && url.pathname === '/public/revenue') {
        const body = await readJson(req);
        const recorded = recordRevenueEvent(body);
        return sendJson(res, recorded.ok ? 200 : 400, recorded);
      }

      if (req.method === 'GET' && url.pathname === '/public/characters') {
        return sendJson(res, 200, { ok: true, characters: listCharacters() });
      }

      if (req.method === 'GET' && url.pathname === '/public/skins') {
        return sendJson(res, 200, { ok: true, skins: listSkins() });
      }

      if (req.method === 'GET' && url.pathname === '/public/player-status') {
        const playerId = String(url.searchParams.get('playerId') || '').trim();
        if (!playerId) return sendJson(res, 400, { ok: false, reason: 'player_id_required' });
        const freeze = frozenUsers.get(playerId) || null;
        return sendJson(res, 200, {
          ok: true,
          playerId,
          frozen: Boolean(freeze),
          reason: freeze?.reason || null,
        });
      }

      if (req.method === 'POST' && url.pathname === '/public/player-touch') {
        const body = await readJson(req);
        const touched = touchPlayer(body);
        return sendJson(res, touched.ok ? 200 : 400, touched);
      }

      if (req.method === 'GET' && serveAdminAsset(req, res, url.pathname)) {
        return;
      }

      const auth = authenticateAdmin(req, adminToken, adminUsers);
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });
      const writeGate = authorizeAdminWrite(req, url, auth.admin);
      if (!writeGate.ok) {
        recordAuditLog(req, auth.admin, {
          action: writeGate.action,
          object: writeGate.object,
          status: 'denied',
          result: { ok: false, reason: writeGate.reason },
        });
        return sendJson(res, 403, { ok: false, reason: writeGate.reason, role: auth.admin.role });
      }

      if (req.method === 'GET' && url.pathname === '/admin/me') {
        return sendJson(res, 200, { ok: true, admin: publicAdmin(auth.admin), roles: ROLE_LABELS });
      }

      if (req.method === 'GET' && url.pathname === '/admin/dashboard') {
        return sendJson(res, 200, { ok: true, dashboard: dashboardMetrics() });
      }

      if (req.method === 'GET' && url.pathname === '/admin/audit-logs') {
        return sendJson(res, 200, { ok: true, logs: listAuditLogs(Object.fromEntries(url.searchParams.entries())) });
      }

      if (req.method === 'GET' && url.pathname === '/admin/config-versions') {
        return sendJson(res, 200, { ok: true, versions: listConfigVersions() });
      }

      if (req.method === 'POST' && url.pathname === '/admin/config-versions/publish') {
        const body = await readJson(req);
        const result = publishConfigVersion(body, auth.admin);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'config.publish', body.scope || 'ops-config');
      }

      const rollbackMatch = url.pathname.match(/^\/admin\/config-versions\/([^/]+)\/rollback$/);
      if (req.method === 'POST' && rollbackMatch) {
        const body = await readJson(req);
        const result = rollbackConfigVersion(decodeURIComponent(rollbackMatch[1]), auth.admin, body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'config.rollback', rollbackMatch[1]);
      }

      if (req.method === 'GET' && url.pathname === '/admin/users') {
        return sendJson(res, 200, { ok: true, users: listUsers(url.searchParams) });
      }

      if (req.method === 'POST' && url.pathname === '/admin/users') {
        const body = await readJson(req);
        const created = createManagedUser(body);
        return sendAdminWrite(res, created.ok ? 200 : 400, created, req, auth.admin, 'user.create', body.userId || 'user');
      }

      const userMatch = url.pathname.match(/^\/admin\/users\/([^/]+)$/);
      if (req.method === 'GET' && userMatch) {
        const userId = decodeURIComponent(userMatch[1]);
        return sendJson(res, 200, { ok: true, user: getUserAudit(userId) });
      }

      const freezeMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/(freeze|unfreeze)$/);
      if (req.method === 'POST' && freezeMatch) {
        const userId = decodeURIComponent(freezeMatch[1]);
        const action = freezeMatch[2];
        const body = await readJson(req);
        const result = action === 'freeze'
          ? freezeUser(userId, body.reason)
          : unfreezeUser(userId, body.reason);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, `user.${action}`, userId);
      }

      const grantMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/grant$/);
      if (req.method === 'POST' && grantMatch) {
        const body = await readJson(req);
        const granted = grantUser(decodeURIComponent(grantMatch[1]), body);
        return sendAdminWrite(res, granted.ok ? 200 : 400, granted, req, auth.admin, 'user.grant', decodeURIComponent(grantMatch[1]));
      }

      const profileMatch = url.pathname.match(/^\/admin\/users\/([^/]+)$/);
      if (req.method === 'PUT' && profileMatch) {
        const body = await readJson(req);
        const result = updateUserProfile(decodeURIComponent(profileMatch[1]), body);
        return sendAdminWrite(res, 200, result, req, auth.admin, 'user.update', decodeURIComponent(profileMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/admin/ledger/summary') {
        return sendJson(res, 200, { ok: true, summary: ledgerSummary() });
      }

      if (req.method === 'GET' && url.pathname === '/admin/revenue-events') {
        return sendJson(res, 200, { ok: true, events: listRevenueEvents() });
      }

      if (req.method === 'GET' && url.pathname === '/admin/ledger') {
        return sendJson(res, 200, {
          ok: true,
          ledger: queryLedger(Object.fromEntries(url.searchParams.entries())),
        });
      }

      const inviteesMatch = url.pathname.match(/^\/admin\/invites\/([^/]+)\/invitees$/);
      if (req.method === 'GET' && inviteesMatch) {
        const inviterUserId = decodeURIComponent(inviteesMatch[1]);
        return sendJson(res, 200, {
          ok: true,
          inviterUserId,
          invitees: walletService.listInvitees
            ? walletService.listInvitees({ inviterUserId, limit: Number(url.searchParams.get('limit') || 100) })
            : [],
          reviews: walletService.listInviteRewardReviews
            ? walletService.listInviteRewardReviews({ inviterUserId })
            : [],
        });
      }

      if (req.method === 'GET' && url.pathname === '/admin/gold-ledger') {
        return sendJson(res, 200, {
          ok: true,
          ledger: walletService.queryGoldLedger
            ? walletService.queryGoldLedger({
                userId: url.searchParams.get('userId') || '',
                type: url.searchParams.get('type') || '',
                refUserId: url.searchParams.get('refUserId') || '',
                limit: Number(url.searchParams.get('limit') || 100),
              })
            : [],
        });
      }

      if (req.method === 'GET' && url.pathname === '/admin/invite-rewards') {
        return sendJson(res, 200, {
          ok: true,
          reviews: walletService.listInviteRewardReviews
            ? walletService.listInviteRewardReviews({
                status: url.searchParams.get('status') || '',
                inviterUserId: url.searchParams.get('inviterUserId') || '',
                inviteeUserId: url.searchParams.get('inviteeUserId') || '',
                limit: Number(url.searchParams.get('limit') || 100),
              })
            : [],
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/invite-rewards/approve') {
        const body = await readJson(req);
        const result = walletService.approveInviteReward
          ? walletService.approveInviteReward({
              reviewId: body.reviewId || body.review_id || '',
              inviteeUserId: body.inviteeUserId || body.invitee_user_id || '',
              operatorId: auth.admin.id,
              reason: body.reason || '',
              idempotencyKey: body.idempotencyKey || body.idempotency_key || '',
            })
          : { ok: false, reason: 'invite_reward_ops_not_supported' };
        persist();
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'invite_reward.approve', body.reviewId || body.inviteeUserId || 'invite_reward');
      }

      if (req.method === 'POST' && url.pathname === '/admin/invite-rewards/freeze') {
        const body = await readJson(req);
        const result = walletService.freezeInviteReward
          ? walletService.freezeInviteReward({
              ledgerId: body.ledgerId || body.ledger_id || '',
              operatorId: auth.admin.id,
              reason: body.reason || '',
              idempotencyKey: body.idempotencyKey || body.idempotency_key || '',
            })
          : { ok: false, reason: 'invite_reward_ops_not_supported' };
        persist();
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'invite_reward.freeze', body.ledgerId || 'invite_reward');
      }

      if (req.method === 'GET' && url.pathname === '/admin/rooms') {
        return sendJson(res, 200, { ok: true, rooms: listRooms() });
      }

      const replayMatch = url.pathname.match(/^\/admin\/rooms\/([^/]+)\/([^/]+)\/replay$/);
      if (req.method === 'GET' && replayMatch) {
        return sendJson(res, 200, getRoomReplay(replayMatch[1], decodeURIComponent(replayMatch[2])));
      }

      const roomMatch = url.pathname.match(/^\/admin\/rooms\/([^/]+)\/([^/]+)$/);
      if (req.method === 'GET' && roomMatch) {
        return sendJson(res, 200, getRoomAudit(roomMatch[1], decodeURIComponent(roomMatch[2])));
      }

      if (req.method === 'GET' && url.pathname === '/admin/settlements/anomalies') {
        return sendJson(res, 200, { ok: true, anomalies: findSettlementAnomalies() });
      }

      if (req.method === 'GET' && url.pathname === '/admin/room-configs') {
        return sendJson(res, 200, { ok: true, configs: [...roomConfigs.values()] });
      }

      if (req.method === 'GET' && url.pathname === '/admin/games') {
        return sendJson(res, 200, { ok: true, games: listGames() });
      }

      if (req.method === 'GET' && url.pathname === '/admin/characters') {
        return sendJson(res, 200, { ok: true, characters: listCharacters() });
      }

      const characterMatch = url.pathname.match(/^\/admin\/characters\/([^/]+)$/);
      if (req.method === 'PUT' && characterMatch) {
        const body = await readJson(req);
        const result = upsertCharacter(decodeURIComponent(characterMatch[1]), body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'character.update', decodeURIComponent(characterMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/admin/costume-logos') {
        return sendJson(res, 200, {
          ok: true,
          costumeLogos: publicCostumeLogos(costumeLogos),
          marks: LOGO_MARKS,
        });
      }

      if (req.method === 'PUT' && url.pathname === '/admin/costume-logos') {
        const body = await readJson(req);
        costumeLogos = normalizeCostumeLogos({ ...costumeLogos, ...body });
        persist();
        return sendAdminWrite(res, 200, { ok: true, costumeLogos: publicCostumeLogos(costumeLogos) }, req, auth.admin, 'costume_logo.update', 'costume-logos');
      }

      if (req.method === 'GET' && url.pathname === '/admin/skins') {
        return sendJson(res, 200, { ok: true, skins: listSkins() });
      }

      const skinMatch = url.pathname.match(/^\/admin\/skins\/([^/]+)$/);
      if (req.method === 'PUT' && skinMatch) {
        const body = await readJson(req);
        const result = upsertSkin(decodeURIComponent(skinMatch[1]), body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'skin.update', decodeURIComponent(skinMatch[1]));
      }

      const gameMatch = url.pathname.match(/^\/admin\/games\/([^/]+)$/);
      if (req.method === 'PUT' && gameMatch) {
        const body = await readJson(req);
        const result = upsertGame(decodeURIComponent(gameMatch[1]), body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'game.update', decodeURIComponent(gameMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-placements') {
        return sendJson(res, 200, {
          ok: true,
          placements: listAdPlacements(Object.fromEntries(url.searchParams.entries()), true),
          categories: listAdCategories(),
          logos: listAdLogos(false),
        });
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-placements') {
        const body = await readJson(req);
        const created = upsertAdPlacement(body.slotId || `ad-${Date.now()}`, body);
        return sendAdminWrite(res, created.ok ? 200 : 400, created, req, auth.admin, 'ad.create', body.slotId || 'new-ad');
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-categories') {
        return sendJson(res, 200, { ok: true, categories: listAdCategories() });
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-categories') {
        const body = await readJson(req);
        const created = upsertAdCategory(body);
        return sendAdminWrite(res, created.ok ? 200 : 400, created, req, auth.admin, 'ad_category.create', body.id || 'ad-category');
      }

      const categoryMatch = url.pathname.match(/^\/admin\/ad-categories\/([^/]+)$/);
      if (req.method === 'PUT' && categoryMatch) {
        const body = await readJson(req);
        const result = upsertAdCategory({ ...body, id: decodeURIComponent(categoryMatch[1]) });
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'ad_category.update', decodeURIComponent(categoryMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-logos') {
        return sendJson(res, 200, { ok: true, logos: listAdLogos(false) });
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-materials') {
        return sendJson(res, 200, { ok: true, materials: listAdLogos(false) });
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-logos') {
        const body = await readJson(req);
        const created = upsertAdLogo(body);
        return sendAdminWrite(res, created.ok ? 200 : 400, created, req, auth.admin, 'ad_material.create', body.id || 'ad-material');
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-materials') {
        const body = await readJson(req);
        const created = upsertAdLogo(body);
        return sendAdminWrite(res, created.ok ? 200 : 400, created, req, auth.admin, 'ad_material.create', body.id || 'ad-material');
      }

      const logoDelete = url.pathname.match(/^\/admin\/ad-logos\/([^/]+)$/);
      if (req.method === 'DELETE' && logoDelete) {
        const result = deleteAdLogo(decodeURIComponent(logoDelete[1]));
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'ad_material.delete', decodeURIComponent(logoDelete[1]));
      }

      const materialMatch = url.pathname.match(/^\/admin\/ad-materials\/([^/]+)$/);
      if (req.method === 'PUT' && materialMatch) {
        const body = await readJson(req);
        const result = upsertAdLogo({ ...body, id: decodeURIComponent(materialMatch[1]), data: body.data || body.image || adLogos.get(decodeURIComponent(materialMatch[1]))?.data });
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'ad_material.update', decodeURIComponent(materialMatch[1]));
      }
      if (req.method === 'DELETE' && materialMatch) {
        const result = deleteAdLogo(decodeURIComponent(materialMatch[1]));
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'ad_material.delete', decodeURIComponent(materialMatch[1]));
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-events') {
        return sendJson(res, 200, { ok: true, events: listAdEvents(Object.fromEntries(url.searchParams.entries())) });
      }

      if (req.method === 'GET' && url.pathname === '/admin/game-candidates') {
        return sendJson(res, 200, {
          ok: true,
          candidates: listGameCandidates(true),
        });
      }

      const adMatch = url.pathname.match(/^\/admin\/ad-placements\/([^/]+)$/);
      const adPreviewMatch = url.pathname.match(/^\/admin\/ad-placements\/([^/]+)\/preview$/);
      if (req.method === 'GET' && adPreviewMatch) {
        const placement = adPlacements.get(decodeURIComponent(adPreviewMatch[1]));
        return sendJson(res, placement ? 200 : 404, placement ? { ok: true, placement: decorateAdPlacement(normalizeStoredAdPlacement(placement)), html: previewAdHtml(decorateAdPlacement(normalizeStoredAdPlacement(placement))) } : { ok: false, reason: 'ad_not_found' });
      }
      if (req.method === 'DELETE' && adMatch) {
        const removed = deleteAdPlacement(decodeURIComponent(adMatch[1]));
        return sendAdminWrite(res, removed.ok ? 200 : 400, removed, req, auth.admin, 'ad.delete', decodeURIComponent(adMatch[1]));
      }
      if (req.method === 'PUT' && adMatch) {
        const body = await readJson(req);
        const result = upsertAdPlacement(decodeURIComponent(adMatch[1]), body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'ad.update', decodeURIComponent(adMatch[1]));
      }

      const configMatch = url.pathname.match(/^\/admin\/room-configs\/([^/]+)\/([^/]+)$/);
      if (req.method === 'PUT' && configMatch) {
        const body = await readJson(req);
        const result = upsertRoomConfig(configMatch[1], decodeURIComponent(configMatch[2]), body);
        return sendAdminWrite(res, result.ok ? 200 : 400, result, req, auth.admin, 'room_config.update', `${configMatch[1]}:${decodeURIComponent(configMatch[2])}`);
      }

      return sendJson(res, 404, { ok: false, reason: 'not_found' });
    } catch {
      return sendJson(res, 400, { ok: false, reason: 'bad_request' });
    }
  }

  function sendAdminWrite(res, statusCode, payload, req, admin, action, object) {
    recordAuditLog(req, admin, {
      action,
      object,
      status: payload?.ok === false ? 'failed' : 'success',
      result: summarizeAuditResult(payload),
    });
    return sendJson(res, statusCode, payload);
  }

  function recordAuditLog(req, admin, { action, object, status, result }) {
    const id = `audit_${auditLogs.size + 1}`;
    auditLogs.set(id, {
      id,
      actorId: admin?.id || 'unknown',
      actorName: admin?.name || admin?.id || 'unknown',
      role: admin?.role || 'unknown',
      roleLabel: ROLE_LABELS[admin?.role] || admin?.role || 'unknown',
      at: clock(),
      ip: clientIp(req),
      action: String(action || 'unknown').slice(0, 80),
      object: String(object || '').slice(0, 120),
      status,
      result,
    });
    persist();
  }

  function listAuditLogs(filter = {}) {
    return [...auditLogs.values()]
      .filter((log) => !filter.actorId || log.actorId === filter.actorId)
      .filter((log) => !filter.role || log.role === filter.role)
      .filter((log) => !filter.action || log.action.includes(filter.action))
      .slice(-300)
      .reverse();
  }

  function dashboardMetrics() {
    const rooms = listRooms();
    const events = [...adEvents.values()];
    const uniquePlayers = new Set();
    for (const entry of queryLedger({})) if (entry.userId && entry.userId !== PLATFORM_USER_ID) uniquePlayers.add(entry.userId);
    for (const room of rooms) {
      if (room.roomId?.includes('friend') || room.roomId?.startsWith('fr_')) uniquePlayers.add(room.roomId);
    }
    const durations = Object.values(gameServers).flatMap((server) => [...(server?.rooms?.values?.() || [])].map(roomDurationSeconds)).filter((n) => n > 0);
    return {
      dau: uniquePlayers.size,
      rounds: rooms.filter((room) => room.roundId || room.status === 'settled').length,
      averageDurationSeconds: durations.length ? Math.round(durations.reduce((sum, n) => sum + n, 0) / durations.length) : 0,
      friendRooms: rooms.filter((room) => String(room.roomId || '').includes('friend') || String(room.roomId || '').startsWith('fr_')).length,
      adImpressions: events.filter((event) => event.eventType === 'impression').length,
      adClicks: events.filter((event) => event.eventType === 'click').length,
      auditLogCount: auditLogs.size,
      policy: 'ops_dashboard_no_real_money_backend',
    };
  }

  function publishConfigVersion(body = {}, admin = {}) {
    const version = cleanText(body.version || `v${configVersions.size + 1}`, 40);
    if (!version) return { ok: false, reason: 'version_required' };
    if (configVersions.has(version)) return { ok: false, reason: 'version_exists' };
    const snapshot = configSnapshot();
    const record = {
      version,
      scope: cleanText(body.scope || 'ops-config', 40) || 'ops-config',
      note: cleanText(body.note || '', 160),
      status: 'published',
      createdAt: clock(),
      createdBy: publicAdmin(admin),
      snapshot,
      policy: 'config_version_only_no_real_money_backend',
    };
    configVersions.set(version, record);
    persist();
    return { ok: true, version: publicConfigVersion(record) };
  }

  function rollbackConfigVersion(version, admin = {}, body = {}) {
    const record = configVersions.get(version);
    if (!record) return { ok: false, reason: 'config_version_not_found' };
    applyConfigSnapshot(record.snapshot);
    const rollbackVersion = cleanText(body.rollbackVersion || `rollback-${version}-${configVersions.size + 1}`, 80);
    const next = {
      version: rollbackVersion,
      scope: record.scope,
      note: cleanText(body.reason || `rollback to ${version}`, 160),
      status: 'published',
      createdAt: clock(),
      createdBy: publicAdmin(admin),
      rollbackOf: version,
      snapshot: configSnapshot(),
      policy: 'config_version_only_no_real_money_backend',
    };
    configVersions.set(next.version, next);
    persist();
    return { ok: true, restored: publicConfigVersion(record), version: publicConfigVersion(next) };
  }

  function listConfigVersions() {
    return [...configVersions.values()].map(publicConfigVersion).reverse();
  }

  function configSnapshot() {
    return {
      roomConfigs: [...roomConfigs.entries()],
      games: [...games.values()],
      characters: [...characters.values()],
      skins: [...skins.values()],
      costumeLogos,
      adCategories: [...adCategories.values()],
      adLogos: [...adLogos.values()],
      adPlacements: [...adPlacements.entries()],
    };
  }

  function applyConfigSnapshot(snapshot = {}) {
    replaceMap(roomConfigs, snapshot.roomConfigs || []);
    replaceValueMap(games, snapshot.games || [], 'id');
    replaceValueMap(characters, snapshot.characters || [], 'id');
    replaceValueMap(skins, snapshot.skins || [], 'id');
    costumeLogos = normalizeCostumeLogos(snapshot.costumeLogos || DEFAULT_COSTUME_LOGOS);
    replaceValueMap(adCategories, snapshot.adCategories || [], 'id');
    replaceValueMap(adLogos, snapshot.adLogos || [], 'id');
    replaceMap(adPlacements, snapshot.adPlacements || []);
  }

  function listUsers(searchParams) {
    const userId = searchParams.get ? searchParams.get('userId') : searchParams.userId;
    const query = String((searchParams.get ? searchParams.get('q') : searchParams.q) || userId || '').trim().toLowerCase();
    const tgId = String((searchParams.get ? searchParams.get('tgId') : searchParams.tgId) || '').trim().toLowerCase();
    const nickname = String((searchParams.get ? searchParams.get('nickname') : searchParams.nickname) || '').trim().toLowerCase();
    const accounts = walletService?.listAccounts
      ? walletService.listAccounts(userId && !query ? { userId } : {})
      : [];
    const accountUserIds = new Set(accounts.map((account) => account.userId));
    for (const frozenUserId of frozenUsers.keys()) accountUserIds.add(frozenUserId);
    for (const profileId of userProfiles.keys()) accountUserIds.add(profileId);
    return [...accountUserIds]
      .sort()
      .map(getUserAudit)
      .filter((user) => matchesUserSearch(user, { query, tgId, nickname }));
  }

  function getUserAudit(userId) {
    const account = walletService?.getAccount ? walletService.getAccount(userId) : null;
    const ledger = queryLedger({ userId });
    const freeze = frozenUsers.get(userId) || null;
    const profile = userProfiles.get(userId) || null;
    const matchStats = userMatchStats(userId);
    return {
      userId,
      uid: userId,
      tgId: profile?.tgId || null,
      nickname: profile?.displayName || profile?.nickname || userId,
      frozen: Boolean(freeze),
      freeze,
      profile,
      account,
      shadowPoints: {
        available: Number(account?.available || 0),
        locked: Number(account?.locked || 0),
        total: Number(account?.total || Number(account?.available || 0) + Number(account?.locked || 0)),
      },
      ledger: ledger.slice(-50),
      ledgerCount: ledger.length,
      lastLedgerEntry: ledger.at(-1) || null,
      stats: matchStats,
    };
  }

  function matchesUserSearch(user, { query, tgId, nickname }) {
    const profile = user.profile || {};
    const haystack = [
      user.userId,
      user.uid,
      profile.tgId,
      profile.displayName,
      profile.nickname,
      profile.note,
    ].map((item) => String(item || '').toLowerCase());
    if (query && !haystack.some((item) => item.includes(query))) return false;
    if (tgId && !String(profile.tgId || '').toLowerCase().includes(tgId)) return false;
    if (nickname && ![profile.displayName, profile.nickname].some((item) => String(item || '').toLowerCase().includes(nickname))) return false;
    return true;
  }

  function userMatchStats(userId) {
    let rounds = 0;
    let wins = 0;
    let friendRooms = 0;
    for (const server of Object.values(gameServers)) {
      for (const room of server?.rooms?.values?.() || []) {
        const players = room.players || [];
        if (!players.some((player) => player.id === userId || player.userId === userId)) continue;
        rounds += room.roundId || room.status === 'settled' ? 1 : 0;
        if (String(room.roomId || '').includes('friend') || String(room.roomId || '').startsWith('fr_')) friendRooms += 1;
        const scores = room.settlementIntent?.scores || [];
        const seat = players.find((player) => player.id === userId || player.userId === userId)?.seatIndex;
        if (Number.isInteger(seat) && Number(scores[seat] || 0) > 0) wins += 1;
      }
    }
    return {
      rounds,
      wins,
      winRate: rounds ? Number((wins / rounds).toFixed(4)) : 0,
      friendRooms,
    };
  }

  function freezeUser(userId, reason) {
    const cleanReason = cleanText(reason, 160);
    if (!cleanReason) return { ok: false, reason: 'freeze_reason_required' };
    const freeze = {
      userId,
      reason: cleanReason,
      createdAt: clock(),
    };
    frozenUsers.set(userId, freeze);
    ensureProfile(userId);
    persist();
    return { ok: true, user: getUserAudit(userId) };
  }

  function unfreezeUser(userId, reason) {
    const cleanReason = cleanText(reason, 160);
    if (!cleanReason) return { ok: false, reason: 'unfreeze_reason_required' };
    frozenUsers.delete(userId);
    persist();
    return { ok: true, user: getUserAudit(userId) };
  }

  function listGames() {
    return [...games.values()].map(publicGame);
  }

  function listCharacters() {
    return [...characters.values()].map(publicAppearance);
  }

  function listSkins() {
    return [...skins.values()].map(publicAppearance);
  }

  function upsertCharacter(id, body) {
    const result = upsertAppearanceItem(characters, id, body);
    if (result.ok) persist();
    return result.ok ? { ok: true, character: result.item } : result;
  }

  function upsertSkin(id, body) {
    const result = upsertAppearanceItem(skins, id, body);
    if (result.ok) persist();
    return result.ok ? { ok: true, skin: result.item } : result;
  }

  function upsertGame(gameId, body) {
    if (!games.has(gameId)) return { ok: false, reason: 'unknown_game' };
    const current = games.get(gameId);
    const next = {
      ...current,
      enabled: body.enabled !== false,
      sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : current.sort,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 24) : current.name,
      summary: typeof body.summary === 'string' && body.summary.trim()
        ? body.summary.trim().slice(0, 48)
        : current.summary,
    };
    games.set(gameId, next);
    persist();
    return { ok: true, game: publicGame(next) };
  }

  function ensureProfile(userId, patch = {}) {
    const current = userProfiles.get(userId) || {
      userId,
      displayName: '',
      tgId: '',
      nickname: '',
      note: '',
      source: patch.source || 'ops',
      createdAt: clock(),
    };
    const next = {
      ...current,
      displayName: patch.displayName != null
        ? String(patch.displayName).trim().slice(0, 24)
        : current.displayName,
      tgId: patch.tgId != null || patch.telegramId != null
        ? String(patch.tgId || patch.telegramId || '').trim().slice(0, 32)
        : current.tgId,
      nickname: patch.nickname != null
        ? String(patch.nickname || '').trim().slice(0, 32)
        : current.nickname,
      note: patch.note != null ? String(patch.note).trim().slice(0, 160) : current.note,
      source: patch.source || current.source || 'ops',
      updatedAt: clock(),
    };
    userProfiles.set(userId, next);
    return next;
  }

  function touchPlayer(body = {}) {
    const playerId = String(body.playerId || body.userId || '').trim().slice(0, 64);
    if (!playerId) return { ok: false, reason: 'player_id_required' };
    const freeze = frozenUsers.get(playerId) || null;
    const profile = userProfiles.get(playerId) || null;
    return {
      ok: true,
      playerId,
      frozen: Boolean(freeze),
      reason: freeze?.reason || null,
      managed: Boolean(profile && profile.source === 'ops'),
    };
  }

  function createManagedUser(body = {}) {
    const userId = String(body.userId || '').trim().slice(0, 64);
    if (!userId) return { ok: false, reason: 'user_id_required' };
    if (userProfiles.has(userId)) return { ok: false, reason: 'user_exists' };
    ensureProfile(userId, {
      displayName: body.displayName || userId,
      tgId: body.tgId || body.telegramId || '',
      nickname: body.nickname || body.displayName || userId,
      note: body.note || '',
      source: 'ops',
    });
    const amount = Number(body.amount);
    if (Number.isFinite(amount) && amount > 0) {
      walletService.issuePoints({
        userId,
        amount,
        idempotencyKey: String(body.idempotencyKey || `ops:create:${userId}`),
        reason: 'ops_create_user',
        metadata: {
          surface: 'ops_admin',
          policy: 'shadow_points_only',
          reason: String(body.reason || 'ops_create_user').slice(0, 160),
        },
      });
    }
    persist();
    return { ok: true, user: getUserAudit(userId) };
  }

  function updateUserProfile(userId, body = {}) {
    const profile = ensureProfile(userId, body);
    persist();
    return { ok: true, user: getUserAudit(userId), profile };
  }

  function grantUser(userId, body = {}) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: 'positive_amount_required' };
    }
    const reason = String(body.reason || '').trim().slice(0, 160);
    if (!reason) return { ok: false, reason: 'grant_reason_required' };
    ensureProfile(userId, { displayName: body.displayName, note: body.note });
    const result = walletService.issuePoints({
      userId,
      amount,
      idempotencyKey: String(body.idempotencyKey || `ops:grant:${userId}:${clock()}`),
      reason: 'ops_manual_grant',
      metadata: { surface: 'ops_admin', policy: 'shadow_points_only', reason },
    });
    persist();
    return { ok: true, grant: result, user: getUserAudit(userId) };
  }

  function recordRevenueEvent(body = {}) {
    const quote = quotePlatformFee({
      currency: body.currency === 'season_points' || body.currency === 'crypto' ? 'season_points' : 'ingot',
      baseScore: body.baseScore,
      winAmount: body.winAmount,
      rate: DEFAULT_REVENUE_POLICY.seasonPointWinnerRate,
    });
    const fee = Number(body.fee != null ? body.fee : quote.fee);
    if (!Number.isFinite(fee) || fee <= 0) return { ok: false, reason: 'positive_fee_required' };
    const kind = body.kind === 'season_point_test_fee' || body.kind === 'crypto_winner_fee'
      ? 'season_point_test_fee'
      : 'gold_table_fee';
    const playerId = String(body.playerId || 'lobby:anonymous').trim().slice(0, 64);
    const key = String(body.idempotencyKey || `pending-revenue:${kind}:${playerId}:${clock()}`).slice(0, 160);
    if (pendingRevenueEvents.has(key)) {
      const existing = pendingRevenueEvents.get(key);
      return { ok: true, ...existing, duplicate: true };
    }
    const event = {
      id: `revenue_event_${pendingRevenueEvents.size + 1}`,
      idempotencyKey: key,
      status: 'pending_review',
      kind,
      fee,
      quote,
      playerId,
      game: body.game || null,
      roomName: body.roomName || null,
      currency: body.currency === 'season_points' || body.currency === 'crypto' ? 'season_points' : 'ingot',
      createdAt: clock(),
      policy: 'public_event_only_no_ledger_write',
    };
    pendingRevenueEvents.set(key, event);
    persist();
    return {
      ok: true,
      fee,
      kind,
      event,
    };
  }

  function listRevenueEvents() {
    return [...pendingRevenueEvents.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function buildPublicChainAssets(playerId) {
    const account = walletService?.getAccount ? walletService.getAccount(playerId) : null;
    return {
      ok: true,
      playerId,
      policy: 'internal_mock_only_no_chain_transaction',
      network: {
        name: 'Tea Testnet',
        labels: ['测试网', '规划中', '合规后开放'],
        externalTransactions: false,
      },
      wallet: {
        bound: false,
        label: '模拟签名未开启',
        simulatedSignature: null,
      },
      assets: [
        {
          id: 'shadow-points',
          label: '影子积分',
          amount: Number(account?.available || 0),
          unit: '金币',
          tag: '内部账本',
        },
        {
          id: 'season-points',
          label: '赛季积分',
          amount: 100,
          unit: 'SP',
          tag: '测试区',
        },
        {
          id: 'skin-shards',
          label: '皮肤碎片',
          amount: 36,
          unit: '片',
          tag: '活动',
        },
        {
          id: 'memorial-assets',
          label: '链游纪念资产',
          amount: 3,
          unit: '件',
          tag: '展示',
        },
      ],
      collectibles: [
        {
          id: 'nft-skin-table-gold',
          title: '赛季金桌布',
          type: 'NFT 皮肤占位',
          rarity: '稀有',
          status: '不可交易',
          source: '赛季活动',
        },
        {
          id: 'nft-skin-card-chain',
          title: '链游纪念牌背',
          type: 'NFT 皮肤占位',
          rarity: '史诗',
          status: '展示中',
          source: '链游纪念',
        },
        {
          id: 'nft-frame-partner',
          title: '联名头像框',
          type: '广告联名',
          rarity: '史诗',
          status: '待开放',
          source: '联名配置',
        },
      ],
    };
  }

  function ledgerSummary() {
    const ledger = queryLedger({});
    const accounts = walletService?.listAccounts ? walletService.listAccounts() : [];
    const issued = ledger
      .filter((entry) => entry.type === LedgerEntryType.ISSUE)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const settlementNet = ledger
      .filter((entry) => entry.type === LedgerEntryType.SETTLEMENT)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const rakeToHouse = ledger
      .filter((entry) => entry.type === LedgerEntryType.RAKE && entry.userId === PLATFORM_USER_ID)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const rakeGold = ledger
      .filter((entry) => entry.userId === PLATFORM_USER_ID && entry.metadata?.kind === 'gold_table_fee')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const rakeCrypto = ledger
      .filter((entry) => entry.userId === PLATFORM_USER_ID && entry.metadata?.kind === 'crypto_winner_fee')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const platformIssue = ledger
      .filter((entry) => entry.userId === PLATFORM_USER_ID && entry.type === LedgerEntryType.ISSUE && entry.metadata?.kind)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const available = accounts.reduce((sum, account) => sum + Number(account.available || 0), 0);
    const locked = accounts.reduce((sum, account) => sum + Number(account.locked || 0), 0);
    const platform = walletService.getAccount(PLATFORM_USER_ID);
    return {
      userCount: listUsers(new URLSearchParams()).length,
      frozenCount: frozenUsers.size,
      accountCount: accounts.length,
      ledgerCount: ledger.length,
      issued,
      available,
      locked,
      total: available + locked,
      settlementNet,
      settlementBalanced: Number(settlementNet.toFixed(8)) === 0,
      issueCount: ledger.filter((entry) => entry.type === LedgerEntryType.ISSUE).length,
      lockCount: ledger.filter((entry) => entry.type === LedgerEntryType.LOCK).length,
      settlementCount: ledger.filter((entry) => entry.type === LedgerEntryType.SETTLEMENT).length,
      rakeCount: ledger.filter((entry) => entry.type === LedgerEntryType.RAKE).length,
      platformRevenue: platform.available,
      rakeToHouse: rakeToHouse + platformIssue,
      rakeGold,
      rakeCrypto: rakeCrypto + ledger
        .filter((entry) => entry.userId === PLATFORM_USER_ID && entry.type === LedgerEntryType.ISSUE && entry.metadata?.kind === 'crypto_winner_fee')
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      revenuePolicy: DEFAULT_REVENUE_POLICY,
      pendingRevenueEvents: pendingRevenueEvents.size,
      policy: 'shadow_points_only',
    };
  }

  function seedDemoUsers() {
    const seeds = [
      { userId: 'ops:alice', displayName: '运营演示甲', amount: 3000, note: '后台独立建档' },
      { userId: 'ops:bob', displayName: '运营演示乙', amount: 1200, note: '后台独立建档' },
    ];
    for (const seed of seeds) {
      ensureProfile(seed.userId, {
        displayName: seed.displayName,
        note: seed.note,
        source: 'ops',
      });
      walletService.issuePoints({
        userId: seed.userId,
        amount: seed.amount,
        idempotencyKey: `ops:seed:${seed.userId}`,
        reason: 'ops_demo_seed',
        metadata: { policy: 'shadow_points_only' },
      });
    }
    persist();
  }

  function queryLedger(filter = {}) {
    if (!walletService?.queryLedger) return [];
    const allowed = {};
    if (filter.userId) allowed.userId = filter.userId;
    if (filter.type) allowed.type = filter.type;
    if (filter.referenceId) allowed.referenceId = filter.referenceId;
    return walletService.queryLedger(allowed);
  }

  function listRooms() {
    return Object.entries(gameServers).flatMap(([gameId, server]) => {
      if (!server?.rooms) return [];
      return [...server.rooms.values()].map((room) => ({
        gameId,
        roomId: room.roomId,
        status: room.status,
        roundId: room.roundId,
        playerCount: room.players?.length || 0,
        connectedCount: room.connectedUserIds?.size || 0,
        settled: Boolean(room.settled),
      }));
    });
  }

  function getRoomAudit(gameId, roomId) {
    const server = gameServers[gameId];
    const room = server?.rooms?.get(roomId);
    if (!room) return { ok: false, reason: 'room_not_found' };
    let publicState;
    try {
      publicState = server.getPublicState?.(roomId);
    } catch {
      publicState = null;
    }
    if (!publicState || publicState.ok === false) publicState = {
      roomId: room.roomId,
      status: room.status,
      roundId: room.roundId,
      players: room.players || [],
      settled: Boolean(room.settled),
    };
    return {
      ok: true,
      room: {
        ...publicState,
        eventsCount: room.events?.length || 0,
      },
    };
  }

  function getRoomReplay(gameId, roomId) {
    const server = gameServers[gameId];
    const room = server?.rooms?.get(roomId);
    if (!room) return { ok: false, reason: 'room_not_found' };
    return {
      ok: true,
      gameId,
      roomId,
      roundId: room.roundId,
      events: (room.events || []).map(publicOpsEvent),
    };
  }

  function findSettlementAnomalies() {
    const anomalies = [];
    for (const [gameId, server] of Object.entries(gameServers)) {
      if (!server?.rooms) continue;
      for (const room of server.rooms.values()) {
        const scores = room.settlementIntent?.scores || [];
        if (room.settlementIntent && sum(scores) !== 0) {
          anomalies.push(makeAnomaly(gameId, room, 'settlement_scores_not_zero_sum'));
        }
        if (room.settlementResult && !room.settlementResult.ok) {
          anomalies.push(makeAnomaly(gameId, room, room.settlementResult.reason || 'settlement_failed'));
        }
        if (room.engine?.phase === 'settle' && !room.settled) {
          anomalies.push(makeAnomaly(gameId, room, 'engine_settled_without_wallet_settlement'));
        }
      }
    }
    return anomalies;
  }

  function upsertRoomConfig(gameId, roomKey, body) {
    const baseRoomScore = Number(body.baseRoomScore);
    const buyIn = Number(body.buyIn);
    if (!Number.isFinite(baseRoomScore) || baseRoomScore <= 0) {
      return { ok: false, reason: 'positive_base_room_score_required' };
    }
    if (!Number.isFinite(buyIn) || buyIn <= 0) {
      return { ok: false, reason: 'positive_buy_in_required' };
    }
    const config = {
      gameId,
      roomKey,
      name: String(body.name || roomKey).slice(0, 40),
      enabled: body.enabled !== false,
      baseRoomScore,
      buyIn,
      updatedAt: clock(),
      policy: 'shadow_points_only',
    };
    roomConfigs.set(configKey(gameId, roomKey), config);
    persist();
    return { ok: true, config };
  }

  function listAdPlacements(filter = {}, includeDisabled = false) {
    const now = Date.parse(clock());
    const list = [...adPlacements.values()]
      .map((placement) => normalizeStoredAdPlacement(placement))
      .filter((placement) => includeDisabled || isPublicAdPlacement(placement, now, adLogos))
      .filter((placement) => !filter.gameId || placement.gameId === filter.gameId)
      .filter((placement) => !filter.surface || placement.surface === filter.surface)
      .filter((placement) => !filter.slotType || placement.slotType === filter.slotType)
      .filter((placement) => filter.seatIndex === undefined || filter.seatIndex === '' || String(placement.seatIndex ?? '') === String(filter.seatIndex))
      .filter((placement) => !filter.categoryId || placement.categoryId === filter.categoryId)
      .sort((a, b) => weightedAdOrder(a, b, filter.rotationSeed || filter.seed) || a.priority - b.priority || a.slotId.localeCompare(b.slotId));
    return (includeDisabled ? list : collapseWeightedRotation(list, filter.rotationSeed || filter.seed)).map(decorateAdPlacement);
  }

  function decorateAdPlacement(placement) {
    const logo = (placement.materialId || placement.logoId) ? adLogos.get(placement.materialId || placement.logoId) : null;
    const category = placement.categoryId ? adCategories.get(placement.categoryId) : null;
    return {
      ...placement,
      categoryName: category?.name || '',
      logo: logo ? publicLogo(logo) : null,
      material: logo ? publicLogo(logo) : null,
    };
  }

  function listAdCategories() {
    return [...adCategories.values()];
  }

  function upsertAdCategory(body = {}) {
    const id = String(body.id || '').trim().toLowerCase();
    if (!/^[a-z0-9:_-]{2,32}$/.test(id)) return { ok: false, reason: 'invalid_category_id' };
    const name = String(body.name || '').trim().slice(0, 24);
    if (!name) return { ok: false, reason: 'category_name_required' };
    const current = adCategories.get(id) || { id, sort: 100 };
    const next = {
      ...current,
      id,
      name,
      enabled: body.enabled !== false,
      sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : current.sort,
    };
    adCategories.set(id, next);
    persist();
    return { ok: true, category: next };
  }

  function listAdLogos(includeData = false, publicOnly = false) {
    return [...adLogos.values()]
      .filter((logo) => !publicOnly || (logo.enabled !== false && (logo.auditStatus || 'approved') === 'approved'))
      .map((logo) => publicLogo(logo, includeData));
  }

  function upsertAdLogo(body = {}) {
    const id = String(body.id || `logo-${Date.now()}`).trim().toLowerCase();
    if (!/^[a-z0-9:_-]{2,32}$/.test(id)) return { ok: false, reason: 'invalid_logo_id' };
    if (adLogos.get(id)?.builtin) return { ok: false, reason: 'builtin_logo_readonly' };
    const name = String(body.name || id).trim().slice(0, 24);
    const parsed = parseImagePayload(body.data || body.image || '');
    if (!parsed.ok) return parsed;
    adLogos.set(id, {
      id,
      name,
      builtin: false,
      mime: parsed.mime,
      data: parsed.data,
      type: body.type === 'image' ? 'image' : 'logo',
      format: cleanEnum(body.format || mimeToFormat(parsed.mime), 'png', ['png', 'jpeg', 'webp', 'svg']),
      width: positiveInt(body.width, 0, 4096),
      height: positiveInt(body.height, 0, 4096),
      auditStatus: cleanEnum(body.auditStatus, 'pending', ['approved', 'pending', 'rejected']),
      enabled: body.enabled !== false,
    });
    persist();
    return { ok: true, logo: publicLogo(adLogos.get(id)) };
  }

  function deleteAdLogo(id) {
    const logo = adLogos.get(id);
    if (!logo) return { ok: false, reason: 'logo_not_found' };
    if (logo.builtin) return { ok: false, reason: 'builtin_logo_readonly' };
    adLogos.delete(id);
    persist();
    return { ok: true };
  }

  function deleteAdPlacement(slotId) {
    if (!adPlacements.has(slotId)) return { ok: false, reason: 'ad_not_found' };
    adPlacements.delete(slotId);
    persist();
    return { ok: true, slotId };
  }

  function serveAdLogo(res, id) {
    const logo = adLogos.get(id);
    if (!logo) {
      sendJson(res, 404, { ok: false, reason: 'logo_not_found' });
      return;
    }
    if (logo.builtin) {
      sendJson(res, 200, { ok: true, builtin: true, id: logo.id });
      return;
    }
    if (logo.enabled === false || logo.auditStatus !== 'approved') {
      sendJson(res, 404, { ok: false, reason: 'logo_not_available' });
      return;
    }
    const buffer = Buffer.from(logo.data, 'base64');
    res.writeHead(200, {
      'content-type': logo.mime || 'image/png',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'content-length': buffer.length,
    });
    res.end(buffer);
  }

  function listGameCandidates(includePrivate = false) {
    return [...gameCandidates.values()].map((candidate) => {
      const publicCandidate = {
        id: candidate.id,
        name: candidate.name,
        source: candidate.source,
        commit: candidate.commit,
        status: candidate.status,
        playable: false,
        integrationMode: candidate.integrationMode,
        reason: candidate.reason,
        reusableScope: candidate.reusableScope,
        gameTypes: candidate.gameTypes,
        policy: candidate.policy,
      };
      if (!includePrivate) return publicCandidate;
      return {
        ...publicCandidate,
        localPath: candidate.localPath,
        forbiddenImports: candidate.forbiddenImports,
        risks: candidate.risks,
      };
    });
  }

  function upsertAdPlacement(slotId, body) {
    const next = normalizeAdPlacement(slotId, body, clock);
    if (!next.ok) return next;
    adPlacements.set(slotId, next.placement);
    persist();
    return { ok: true, placement: next.placement };
  }

  function recordAdEvent(body = {}, req = {}) {
    const eventType = cleanEnum(body.eventType, '', ['impression', 'click']);
    if (!eventType) return { ok: false, reason: 'invalid_ad_event_type' };
    const placementId = cleanText(body.placementId || body.slotId, 80);
    if (!placementId) return { ok: false, reason: 'ad_slot_required' };
    const placement = adPlacements.get(placementId) || [...adPlacements.values()].find((item) => item.slotId === placementId);
    if (!placement) return { ok: false, reason: 'ad_not_found' };
    const active = isPublicAdPlacement(normalizeStoredAdPlacement(placement), Date.parse(clock()), adLogos);
    if (!active) return { ok: false, reason: 'ad_not_public' };
    const eventId = cleanText(body.eventId || `${eventType}:${placementId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, 120);
    if (adEvents.has(eventId)) return { ok: true, duplicate: true, event: adEvents.get(eventId), policy: 'ad_event_only_no_wallet_ledger_write' };
    const event = {
      eventId,
      eventType,
      slotId: placement.slotId,
      placementId,
      gameId: placement.gameId,
      surface: placement.surface,
      slotType: placement.slotType,
      seatIndex: placement.seatIndex ?? null,
      playerId: cleanText(body.playerId, 64) || 'anonymous',
      url: cleanUrl(body.url || placement.landingUrl) || '',
      userAgent: cleanText(req.headers?.['user-agent'] || body.userAgent, 160),
      createdAt: clock(),
      policy: 'ad_event_only_no_wallet_ledger_write',
    };
    adEvents.set(eventId, event);
    persist();
    return { ok: true, event, policy: event.policy };
  }

  function listAdEvents(filter = {}) {
    return [...adEvents.values()]
      .filter((event) => !filter.eventType || event.eventType === filter.eventType)
      .filter((event) => !filter.slotId || event.slotId === filter.slotId || event.placementId === filter.slotId)
      .slice(-500);
  }

  function listen(port = 0, host = options.host || '127.0.0.1') {
    const server = createServer(handler);
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        const address = server.address();
        resolve({
          server,
          port: address.port,
          host: address.address,
          url: `http://${address.address}:${address.port}`,
          close: () => new Promise((closeResolve, closeReject) => {
            server.close((error) => error ? closeReject(error) : closeResolve());
          }),
        });
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  }

  return {
    handler,
    listen,
    frozenUsers,
    roomConfigs,
    adPlacements,
    gameCandidates,
    games,
    characters,
    skins,
    getCostumeLogos: () => costumeLogos,
    auditLogs,
    configVersions,
    adminUsers,
    userProfiles,
    listUsers,
    getUserAudit,
    listRooms,
    getRoomAudit,
    getRoomReplay,
    findSettlementAnomalies,
    listAdPlacements,
    listGameCandidates,
    listGames,
    listCharacters,
    listSkins,
    upsertCharacter,
    upsertSkin,
    upsertAdPlacement,
    upsertGame,
    grantUser,
    createManagedUser,
    ledgerSummary,
    dashboardMetrics,
    listAuditLogs,
    listConfigVersions,
    persist,
  };
}

function authenticateAdmin(req, adminToken, adminUsers = new Map()) {
  if (!adminToken) return { ok: false, status: 500, reason: 'admin_token_not_configured' };
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const headerToken = req.headers['x-admin-token'];
  const token = bearer || headerToken || '';
  const admin = adminUsers.get(token);
  if (admin) return { ok: true, admin };
  if (bearer === adminToken || headerToken === adminToken) {
    return { ok: true, admin: { id: 'super-admin', name: '超级管理员', role: OPS_ROLES.SUPER_ADMIN } };
  }
  return { ok: false, status: 401, reason: 'admin_auth_required' };
}

function createAdminUserMap({ adminToken, roleTokens = {} } = {}) {
  const users = new Map();
  if (adminToken) {
    users.set(adminToken, { id: 'super-admin', name: '超级管理员', role: OPS_ROLES.SUPER_ADMIN });
  }
  for (const [role, value] of Object.entries(roleTokens || {})) {
    const token = typeof value === 'string' ? value : value?.token;
    if (!token) continue;
    const roleId = normalizeRole(role);
    users.set(token, normalizeAdmin({
      id: typeof value === 'string' ? `${roleId}-admin` : value.id,
      name: typeof value === 'string' ? ROLE_LABELS[roleId] : value.name,
      role: roleId,
    }, token));
  }
  return users;
}

function normalizeAdmin(admin = {}, token = '') {
  const role = normalizeRole(admin.role);
  return {
    id: cleanText(admin.id || `${role}-${String(token).slice(0, 6)}`, 48) || `${role}-admin`,
    name: cleanText(admin.name || ROLE_LABELS[role], 48) || ROLE_LABELS[role],
    role,
  };
}

function normalizeRole(role) {
  const value = String(role || '').trim();
  if (value === OPS_ROLES.GAME_OPERATOR || value === 'game-operator' || value === 'operator') return OPS_ROLES.GAME_OPERATOR;
  if (value === OPS_ROLES.SUPPORT || value === 'customer_service' || value === 'customer-service') return OPS_ROLES.SUPPORT;
  if (value === OPS_ROLES.AUDITOR || value === 'audit') return OPS_ROLES.AUDITOR;
  return OPS_ROLES.SUPER_ADMIN;
}

function publicAdmin(admin = {}) {
  return {
    id: admin.id || 'unknown',
    name: admin.name || admin.id || 'unknown',
    role: admin.role || 'unknown',
    roleLabel: ROLE_LABELS[admin.role] || admin.role || 'unknown',
  };
}

function authorizeAdminWrite(req, url, admin = {}) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return { ok: true };
  const action = inferAuditAction(req.method, url.pathname);
  const object = inferAuditObject(url.pathname);
  if (admin.role === OPS_ROLES.SUPER_ADMIN) return { ok: true, action, object };
  const path = url.pathname;
  if (admin.role === OPS_ROLES.GAME_OPERATOR) {
    const allowed = /^\/admin\/(games|room-configs|characters|skins|costume-logos|ad-|config-versions)/.test(path);
    return allowed ? { ok: true, action, object } : { ok: false, reason: 'rbac_forbidden', action, object };
  }
  if (admin.role === OPS_ROLES.SUPPORT) {
    const allowed = /^\/admin\/users\/[^/]+\/(freeze|unfreeze)$/.test(path) || (req.method === 'PUT' && /^\/admin\/users\/[^/]+$/.test(path));
    return allowed ? { ok: true, action, object } : { ok: false, reason: 'rbac_forbidden', action, object };
  }
  return { ok: false, reason: 'rbac_forbidden', action, object };
}

function inferAuditAction(method, pathname) {
  const resource = pathname.split('/').filter(Boolean).slice(1).join('.') || 'unknown';
  return `${method.toLowerCase()}.${resource}`;
}

function inferAuditObject(pathname) {
  return decodeURIComponent(pathname.split('/').filter(Boolean).slice(1).join('/'));
}

function summarizeAuditResult(payload = {}) {
  if (!payload || typeof payload !== 'object') return { ok: Boolean(payload) };
  const summary = { ok: payload.ok !== false };
  if (payload.reason) summary.reason = payload.reason;
  for (const key of ['user', 'config', 'placement', 'skin', 'game', 'category', 'logo', 'version']) {
    const value = payload[key];
    if (!value) continue;
    summary[key] = value.id || value.userId || value.roomKey || value.slotId || value.version || true;
  }
  return summary;
}

function clientIp(req = {}) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'local';
}

function normalizeConfigStatus(value, fallback = 'published') {
  const aliases = {
    unpublished: 'archived',
    scheduled: 'reviewing',
    pending: 'reviewing',
    approved: 'published',
  };
  const raw = aliases[String(value || '').trim()] || String(value || '').trim();
  return CONFIG_STATUS.includes(raw) ? raw : fallback;
}

function publicConfigVersion(record = {}) {
  return {
    version: record.version,
    scope: record.scope,
    note: record.note || '',
    status: record.status,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    rollbackOf: record.rollbackOf || null,
    policy: record.policy,
  };
}

function replaceMap(target, entries) {
  target.clear();
  for (const [key, value] of entries || []) target.set(key, value);
}

function replaceValueMap(target, items, key = 'id') {
  target.clear();
  for (const item of items || []) {
    if (item?.[key]) target.set(item[key], item);
  }
}

function roomDurationSeconds(room = {}) {
  const events = room.events || [];
  const first = Date.parse(events[0]?.at || room.createdAt || '');
  const last = Date.parse(events.at(-1)?.at || room.updatedAt || room.settledAt || '');
  return Number.isFinite(first) && Number.isFinite(last) && last > first ? Math.round((last - first) / 1000) : 0;
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 320 * 1024) throw new Error('body_too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-admin-token',
  });
  res.end(JSON.stringify(payload));
}

function defaultRoomConfigs() {
  return [
    ['doudizhu:classic-low', {
      gameId: 'doudizhu',
      roomKey: 'classic-low',
      name: '经典初级场',
      enabled: true,
      baseRoomScore: 1,
      buyIn: 100,
      policy: 'shadow_points_only',
    }],
    ['doudizhu:classic-mid', {
      gameId: 'doudizhu',
      roomKey: 'classic-mid',
      name: '经典进阶场',
      enabled: true,
      baseRoomScore: 5,
      buyIn: 500,
      policy: 'shadow_points_only',
    }],
  ];
}

function defaultAdPlacements() {
  return [
    ['lobby-top-banner', {
      slotId: 'lobby-top-banner',
      gameId: 'lobby',
      surface: 'lobby',
      slotType: 'banner',
      seatIndex: null,
      enabled: true,
      priority: 10,
      advertiserName: 'NovaDEX',
      campaignTitle: '限时交易赛',
      copy: '模拟赛奖励已开放',
      landingUrl: 'https://example.com/novadex',
      assetTheme: 'exchange',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['lobby-room-strip', {
      slotId: 'lobby-room-strip',
      gameId: 'lobby',
      surface: 'lobby',
      slotType: 'table',
      seatIndex: null,
      enabled: true,
      priority: 20,
      advertiserName: 'Orbit Launch',
      campaignTitle: '新项目观察',
      copy: '研究页与社区任务',
      landingUrl: 'https://example.com/orbit',
      assetTheme: 'launchpad',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-table-center', {
      slotId: 'doudizhu-table-center',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-surface',
      seatIndex: null,
      enabled: true,
      priority: 10,
      advertiserName: 'TeaSwap',
      campaignTitle: '桌面冠名',
      copy: '链游积分季',
      landingUrl: 'https://example.com/teaswap',
      assetTheme: 'dex',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-table-rail-left', {
      slotId: 'doudizhu-table-rail-left',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      seatIndex: null,
      enabled: true,
      priority: 20,
      advertiserName: 'BitBridge',
      campaignTitle: '牌桌边栏',
      copy: '平台活动入口',
      landingUrl: 'https://example.com/bitbridge',
      assetTheme: 'platform',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-table-rail-right', {
      slotId: 'doudizhu-table-rail-right',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      seatIndex: null,
      enabled: true,
      priority: 30,
      advertiserName: 'MintPad',
      campaignTitle: '牌桌边栏',
      copy: '项目日历',
      landingUrl: 'https://example.com/mintpad',
      assetTheme: 'launchpad',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-costume-seat-0', {
      slotId: 'doudizhu-costume-seat-0',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'character-costume',
      seatIndex: 0,
      enabled: true,
      priority: 40,
      advertiserName: 'ChainQuest',
      campaignTitle: '地主披风',
      copy: '赛季任务',
      landingUrl: 'https://example.com/chainquest',
      assetTheme: 'quest',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-costume-seat-1', {
      slotId: 'doudizhu-costume-seat-1',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'character-costume',
      seatIndex: 1,
      enabled: true,
      priority: 50,
      advertiserName: 'CEXOne',
      campaignTitle: '农民背心',
      copy: '积分榜',
      landingUrl: 'https://example.com/cexone',
      assetTheme: 'exchange',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-costume-seat-2', {
      slotId: 'doudizhu-costume-seat-2',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'character-costume',
      seatIndex: 2,
      enabled: true,
      priority: 60,
      advertiserName: 'BlockHarbor',
      campaignTitle: '农民肩章',
      copy: '平台活动',
      landingUrl: 'https://example.com/blockharbor',
      assetTheme: 'platform',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-card-back', {
      slotId: 'doudizhu-card-back',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'card-back',
      seatIndex: null,
      enabled: true,
      priority: 70,
      advertiserName: 'Tea Club',
      campaignTitle: '牌背冠名',
      copy: '测试资产展示',
      landingUrl: 'https://example.com/card-back',
      assetTheme: 'platform',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-card-front', {
      slotId: 'doudizhu-card-front',
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'card-front',
      seatIndex: null,
      enabled: true,
      priority: 72,
      advertiserName: 'CardSponsor',
      campaignTitle: '牌面角标',
      copy: '正面花色区广告',
      landingUrl: 'https://example.com/card-front',
      assetTheme: 'platform',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
    ['doudizhu-settlement-banner', {
      slotId: 'doudizhu-settlement-banner',
      gameId: 'doudizhu',
      surface: 'settlement-page',
      slotType: 'settlement',
      seatIndex: null,
      enabled: true,
      priority: 80,
      advertiserName: 'QuestBoard',
      campaignTitle: '局后任务',
      copy: '赛季积分挑战',
      landingUrl: 'https://example.com/settlement',
      assetTheme: 'quest',
      startAt: null,
      endAt: null,
      updatedAt: null,
      policy: 'ad_config_only_no_real_money_settlement',
    }],
  ];
}

function defaultGameCandidates() {
  return [
    ['openinggame-qp', {
      id: 'openinggame-qp',
      name: 'openinggame/qp H5 棋牌游戏平台',
      source: 'https://github.com/openinggame/qp',
      localPath: 'external/github-candidates/openinggame-qp',
      commit: '8f249ff4c73dd692ff62ace94ca470cc47ddb014',
      status: 'quarantine',
      integrationMode: 'reference-only',
      reason: '缺少 LICENSE 与可审计源码，仅含闭源容器、数据库归档和截图素材，不能作为可玩游戏接入。',
      reusableScope: ['大厅/房间信息架构参考', '非品牌化交互层级参考'],
      gameTypes: ['炸金花', '二人麻将', '斗地主', '血流成河', '血战到底', '房间场'],
      forbiddenImports: ['闭源 Web/Server 镜像', '数据库归档', '截图素材', '账号/余额/资金逻辑'],
      risks: ['license_missing', 'closed_binary_images', 'database_archives', 'hardcoded_service_credentials', 'docker_socket_mount', 'ip_asset_unclear'],
      policy: 'github_candidate_quarantine_no_runtime_merge',
    }],
  ];
}

function normalizeAdPlacement(slotId, body, clock) {
  if (!slotId || !/^[a-z0-9:_-]{3,64}$/i.test(slotId)) {
    return { ok: false, reason: 'invalid_slot_id' };
  }
  const allowedSurfaces = new Set(['lobby', 'game-table', 'settlement-page']);
  const allowedSlotTypes = new Set(['banner', 'table', 'table-surface', 'table-rail', 'character-costume', 'card-back', 'card-front', 'settlement']);
  if (!allowedSurfaces.has(body.surface)) return { ok: false, reason: 'invalid_ad_surface' };
  if (!allowedSlotTypes.has(body.slotType)) return { ok: false, reason: 'invalid_ad_slot_type' };
  const gameId = cleanText(body.gameId || inferGameIdFromSlot(slotId, body.surface), 32);
  if (!gameId) return { ok: false, reason: 'game_id_required' };
  const seatIndex = parseSeatIndex(body.seatIndex);
  if (!seatIndex.ok) return seatIndex;
  const startAt = normalizeDateTime(body.startAt);
  if (!startAt.ok) return startAt;
  const endAt = normalizeDateTime(body.endAt);
  if (!endAt.ok) return endAt;
  if (startAt.value && endAt.value && Date.parse(startAt.value) > Date.parse(endAt.value)) {
    return { ok: false, reason: 'invalid_ad_time_range' };
  }
  const advertiserName = cleanText(body.advertiserName, 32);
  const campaignTitle = cleanText(body.campaignTitle, 36);
  const copy = cleanText(body.copy, 48);
  const landingUrl = cleanUrl(body.landingUrl);
  const imageUrl = body.imageUrl ? cleanUrl(body.imageUrl) : '';
  if (!advertiserName || !campaignTitle || !copy) {
    return { ok: false, reason: 'ad_copy_required' };
  }
  if (!landingUrl) return { ok: false, reason: 'https_landing_url_required' };
  if (body.imageUrl && !imageUrl) return { ok: false, reason: 'https_image_url_required' };
  const weight = Number(body.weight);
  const priority = Number(body.priority);
  return {
    ok: true,
    placement: {
      placementId: cleanText(body.placementId || slotId, 80),
      slotId,
      gameId,
      surface: body.surface,
      slotType: body.slotType,
      seatIndex: seatIndex.value,
      enabled: body.enabled !== false,
      priority: Number.isFinite(priority) ? priority : 100,
      advertiserName,
      campaignTitle,
      copy,
      landingUrl,
      imageUrl,
      assetTheme: cleanText(body.assetTheme || body.categoryId || 'platform', 24),
      categoryId: cleanText(body.categoryId || body.assetTheme || 'other', 32) || 'other',
      logoId: body.logoId && /^[a-z0-9:_-]{2,32}$/i.test(body.logoId) ? String(body.logoId) : '',
      short: cleanText(body.short || body.advertiserName, 8),
      startAt: startAt.value,
      endAt: endAt.value,
      weight: Number.isFinite(weight) && weight > 0 ? Math.min(1000, weight) : 1,
      rotationMode: cleanEnum(body.rotationMode, 'priority', ['priority', 'weighted', 'random']),
      schedule: normalizeSchedule(body.schedule),
      geoRules: normalizeGeoRules(body.geoRules),
      auditStatus: cleanEnum(body.auditStatus, 'approved', ['approved', 'pending', 'rejected']),
      configStatus: normalizeConfigStatus(body.configStatus || body.listingStatus, 'published'),
      materialId: body.materialId && /^[a-z0-9:_-]{2,32}$/i.test(body.materialId) ? String(body.materialId) : (body.logoId && /^[a-z0-9:_-]{2,32}$/i.test(body.logoId) ? String(body.logoId) : ''),
      safeAreaPolicy: 'do_not_cover_cards_buttons_timer_result',
      updatedAt: clock(),
      policy: 'ad_config_only_no_real_money_settlement',
    },
  };
}

function normalizeStoredAdPlacement(placement = {}) {
  return {
    ...placement,
    placementId: placement.placementId || placement.slotId || '',
    gameId: cleanText(placement.gameId || inferGameIdFromSlot(placement.slotId, placement.surface), 32) || 'general',
    seatIndex: Number.isInteger(placement.seatIndex) ? placement.seatIndex : null,
    startAt: placement.startAt || null,
    endAt: placement.endAt || null,
    priority: Number.isFinite(Number(placement.priority)) ? Number(placement.priority) : 100,
    weight: Number.isFinite(Number(placement.weight)) && Number(placement.weight) > 0 ? Number(placement.weight) : 1,
    rotationMode: cleanEnum(placement.rotationMode, 'priority', ['priority', 'weighted', 'random']),
    schedule: normalizeSchedule(placement.schedule),
    geoRules: normalizeGeoRules(placement.geoRules),
    auditStatus: cleanEnum(placement.auditStatus, 'approved', ['approved', 'pending', 'rejected']),
    configStatus: normalizeConfigStatus(placement.configStatus || placement.listingStatus, 'published'),
    materialId: placement.materialId || '',
    safeAreaPolicy: placement.safeAreaPolicy || 'do_not_cover_cards_buttons_timer_result',
  };
}

function isAdPlacementActive(placement, now) {
  const start = placement.startAt ? Date.parse(placement.startAt) : NaN;
  const end = placement.endAt ? Date.parse(placement.endAt) : NaN;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now > end) return false;
  return true;
}

function isPublicAdPlacement(placement, now, materials = new Map()) {
  if (!placement.enabled || !isAdPlacementActive(placement, now) || placement.auditStatus !== 'approved') return false;
  if ((placement.configStatus || 'published') !== 'published') return false;
  const materialId = placement.materialId || placement.logoId;
  if (!materialId) return true;
  const material = materials.get(materialId);
  return !material || (material.enabled !== false && (material.auditStatus || 'approved') === 'approved');
}

function weightedAdOrder(a, b, seed = '') {
  if (a.rotationMode !== 'weighted' && b.rotationMode !== 'weighted' && a.rotationMode !== 'random' && b.rotationMode !== 'random') return 0;
  const aw = Number(a.weight || 1);
  const bw = Number(b.weight || 1);
  const as = a.rotationMode === 'weighted'
    ? -aw + seededScore(`${seed}:${a.slotId}:${a.placementId}`)
    : seededScore(`${seed}:${a.slotId}:${a.placementId}`);
  const bs = b.rotationMode === 'weighted'
    ? -bw + seededScore(`${seed}:${b.slotId}:${b.placementId}`)
    : seededScore(`${seed}:${b.slotId}:${b.placementId}`);
  return as - bs;
}

function collapseWeightedRotation(list, seed = '') {
  const groups = new Map();
  for (const ad of list) {
    const key = `${ad.gameId}|${ad.surface}|${ad.slotType}|${ad.seatIndex ?? ''}|${ad.slotId}`;
    const group = groups.get(key) || [];
    group.push(ad);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    return group.slice().sort((a, b) => weightedAdOrder(a, b, seed) || a.priority - b.priority)[0];
  }).sort((a, b) => a.priority - b.priority || a.slotId.localeCompare(b.slotId));
}

function seededScore(value) {
  const text = String(value || 'default');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function inferGameIdFromSlot(slotId = '', surface = '') {
  const value = String(slotId || '');
  if (surface === 'lobby' || value.startsWith('lobby-') || value.startsWith('room-')) return 'lobby';
  const match = value.match(/^([a-z0-9]+)[-_:]/i);
  return match ? match[1] : 'general';
}

function parseSeatIndex(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 8) {
    return { ok: false, reason: 'invalid_seat_index' };
  }
  return { ok: true, value: parsed };
}

function normalizeDateTime(value) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const raw = String(value).trim();
  const normalized = raw.includes('T') && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? `${raw}:00.000Z`
    : raw;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return { ok: false, reason: 'invalid_ad_time' };
  return { ok: true, value: new Date(parsed).toISOString() };
}

function parseImagePayload(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'logo_image_required' };
  let mime = 'image/png';
  let data = raw.trim();
  const match = data.match(/^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,(.+)$/i);
  if (match) {
    mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    data = match[2];
  }
  if (!/^[a-z0-9+/=\s]+$/i.test(data) || data.replace(/\s/g, '').length < 32) {
    return { ok: false, reason: 'invalid_logo_image' };
  }
  if (data.length > 240000) return { ok: false, reason: 'logo_too_large' };
  return { ok: true, mime, data: data.replace(/\s/g, '') };
}

function mimeToFormat(mime = '') {
  if (/svg/i.test(mime)) return 'svg';
  if (/webp/i.test(mime)) return 'webp';
  if (/jpe?g/i.test(mime)) return 'jpeg';
  return 'png';
}

function positiveInt(value, fallback = 0, max = 4096) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(max, n);
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function cleanEnum(value, fallback, allowed) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeSchedule(schedule = {}) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    return { timezone: 'UTC', daysOfWeek: [], hours: [] };
  }
  return {
    timezone: cleanText(schedule.timezone || 'UTC', 40) || 'UTC',
    daysOfWeek: Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
      : [],
    hours: Array.isArray(schedule.hours)
      ? schedule.hours.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 23)
      : [],
  };
}

function normalizeGeoRules(geoRules = {}) {
  if (!geoRules || typeof geoRules !== 'object' || Array.isArray(geoRules)) {
    return { includeCountries: [], excludeCountries: [] };
  }
  const cleanCountries = (items) => Array.isArray(items)
    ? items.map((item) => String(item).trim().toUpperCase()).filter((item) => /^[A-Z]{2}$/.test(item)).slice(0, 50)
    : [];
  return {
    includeCountries: cleanCountries(geoRules.includeCountries),
    excludeCountries: cleanCountries(geoRules.excludeCountries),
  };
}

function previewAdHtml(ad = {}) {
  const title = escapeHtml(ad.campaignTitle || ad.advertiserName || '广告预览');
  const copy = escapeHtml(ad.copy || '');
  const surface = escapeHtml(ad.surface || 'unknown');
  const slotType = escapeHtml(ad.slotType || 'unknown');
  const logo = ad.logo?.url || ad.material?.url
    ? `<img src="${escapeAttribute(ad.logo?.url || ad.material?.url)}" alt="" style="width:32px;height:32px;object-fit:contain;border-radius:6px;">`
    : '';
  return [
    `<div class="ad-preview" data-surface="${surface}" data-slot-type="${slotType}" data-safe-area="${escapeAttribute(ad.safeAreaPolicy || 'do_not_cover_cards_buttons_timer_result')}">`,
    logo,
    '<div>',
    `<strong>${title}</strong>`,
    copy ? `<small>${copy}</small>` : '',
    `<em>${surface} / ${slotType}</em>`,
    '</div>',
    '</div>',
  ].join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function cleanUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return null;
    return url.toString().slice(0, 240);
  } catch {
    return null;
  }
}

function configKey(gameId, roomKey) {
  return `${gameId}:${roomKey}`;
}

function publicOpsEvent(event) {
  if (!event) return event;
  return {
    type: event.type,
    userId: event.userId,
    seatIndex: event.seatIndex,
    phase: event.phase,
    action: event.action,
    reason: event.reason,
    at: event.at,
    roundId: event.roundId,
    idempotencyKey: event.idempotencyKey,
  };
}

function makeAnomaly(gameId, room, reason) {
  return {
    gameId,
    roomId: room.roomId,
    roundId: room.roundId,
    reason,
  };
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function serveAdminAsset(req, res, pathname) {
  if (req.method !== 'GET') return false;
  let rel = pathname;
  if (rel === '/' || rel === '/admin' || rel === '/admin/') rel = '/index.html';
  else if (rel === '/admin.css' || rel === '/admin.js') rel = rel;
  else if (rel.startsWith('/admin/')) rel = rel.slice('/admin'.length);
  else return false;
  if (!rel || rel === '/') rel = '/index.html';
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!existsSync(filePath)) return false;
  res.writeHead(200, {
    'content-type': STATIC_TYPES[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  createReadStream(filePath).pipe(res);
  return true;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const isProd = process.env.NODE_ENV === 'production';
  const defaultStore = fileURLToPath(new URL('../data/ops-store.json', import.meta.url));
  const adminToken = process.env.ADMIN_TOKEN || (isProd ? '' : 'tea-parlor-ops');
  if (isProd && !process.env.ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN is required. The admin page ships no default password.');
    process.exit(1);
  }
  const service = createOpsService({
    adminToken,
    storePath: process.env.OPS_STORE_PATH || defaultStore,
    seedDemo: process.env.OPS_SEED_DEMO !== '0',
  });
  const host = process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1');
  service.listen(Number(process.env.PORT || 5190), host).then(({ url }) => {
    console.log(`Ops console ${url}/admin`);
    console.log('Admin token is read from ADMIN_TOKEN. Shadow points only. Gold is not withdrawable.');
  });
}
