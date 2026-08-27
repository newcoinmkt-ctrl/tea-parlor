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
          logos: listAdLogos(false),
        });
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
          adLogos: listAdLogos(false),
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

      const auth = authenticateAdmin(req, adminToken);
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, reason: auth.reason });

      if (req.method === 'GET' && url.pathname === '/admin/users') {
        return sendJson(res, 200, { ok: true, users: listUsers(url.searchParams) });
      }

      if (req.method === 'POST' && url.pathname === '/admin/users') {
        const body = await readJson(req);
        const created = createManagedUser(body);
        return sendJson(res, created.ok ? 200 : 400, created);
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
          ? freezeUser(userId, body.reason || 'manual_ops_freeze')
          : unfreezeUser(userId);
        return sendJson(res, 200, result);
      }

      const grantMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/grant$/);
      if (req.method === 'POST' && grantMatch) {
        const body = await readJson(req);
        const granted = grantUser(decodeURIComponent(grantMatch[1]), body);
        return sendJson(res, granted.ok ? 200 : 400, granted);
      }

      const profileMatch = url.pathname.match(/^\/admin\/users\/([^/]+)$/);
      if (req.method === 'PUT' && profileMatch) {
        const body = await readJson(req);
        return sendJson(res, 200, updateUserProfile(decodeURIComponent(profileMatch[1]), body));
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
        return sendJson(res, result.ok ? 200 : 400, result);
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
        return sendJson(res, 200, { ok: true, costumeLogos: publicCostumeLogos(costumeLogos) });
      }

      if (req.method === 'GET' && url.pathname === '/admin/skins') {
        return sendJson(res, 200, { ok: true, skins: listSkins() });
      }

      const skinMatch = url.pathname.match(/^\/admin\/skins\/([^/]+)$/);
      if (req.method === 'PUT' && skinMatch) {
        const body = await readJson(req);
        const result = upsertSkin(decodeURIComponent(skinMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      const gameMatch = url.pathname.match(/^\/admin\/games\/([^/]+)$/);
      if (req.method === 'PUT' && gameMatch) {
        const body = await readJson(req);
        const result = upsertGame(decodeURIComponent(gameMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 400, result);
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
        return sendJson(res, created.ok ? 200 : 400, created);
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-categories') {
        return sendJson(res, 200, { ok: true, categories: listAdCategories() });
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-categories') {
        const body = await readJson(req);
        const created = upsertAdCategory(body);
        return sendJson(res, created.ok ? 200 : 400, created);
      }

      const categoryMatch = url.pathname.match(/^\/admin\/ad-categories\/([^/]+)$/);
      if (req.method === 'PUT' && categoryMatch) {
        const body = await readJson(req);
        const result = upsertAdCategory({ ...body, id: decodeURIComponent(categoryMatch[1]) });
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      if (req.method === 'GET' && url.pathname === '/admin/ad-logos') {
        return sendJson(res, 200, { ok: true, logos: listAdLogos(false) });
      }

      if (req.method === 'POST' && url.pathname === '/admin/ad-logos') {
        const body = await readJson(req);
        const created = upsertAdLogo(body);
        return sendJson(res, created.ok ? 200 : 400, created);
      }

      const logoDelete = url.pathname.match(/^\/admin\/ad-logos\/([^/]+)$/);
      if (req.method === 'DELETE' && logoDelete) {
        return sendJson(res, 200, deleteAdLogo(decodeURIComponent(logoDelete[1])));
      }

      if (req.method === 'GET' && url.pathname === '/admin/game-candidates') {
        return sendJson(res, 200, {
          ok: true,
          candidates: listGameCandidates(true),
        });
      }

      const adMatch = url.pathname.match(/^\/admin\/ad-placements\/([^/]+)$/);
      if (req.method === 'DELETE' && adMatch) {
        const removed = deleteAdPlacement(decodeURIComponent(adMatch[1]));
        return sendJson(res, removed.ok ? 200 : 400, removed);
      }
      if (req.method === 'PUT' && adMatch) {
        const body = await readJson(req);
        const result = upsertAdPlacement(decodeURIComponent(adMatch[1]), body);
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      const configMatch = url.pathname.match(/^\/admin\/room-configs\/([^/]+)\/([^/]+)$/);
      if (req.method === 'PUT' && configMatch) {
        const body = await readJson(req);
        const result = upsertRoomConfig(configMatch[1], decodeURIComponent(configMatch[2]), body);
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      return sendJson(res, 404, { ok: false, reason: 'not_found' });
    } catch {
      return sendJson(res, 400, { ok: false, reason: 'bad_request' });
    }
  }

  function listUsers(searchParams) {
    const userId = searchParams.get ? searchParams.get('userId') : searchParams.userId;
    const accounts = walletService?.listAccounts
      ? walletService.listAccounts(userId ? { userId } : {})
      : [];
    const accountUserIds = new Set(accounts.map((account) => account.userId));
    for (const frozenUserId of frozenUsers.keys()) accountUserIds.add(frozenUserId);
    for (const profileId of userProfiles.keys()) accountUserIds.add(profileId);
    const ids = userId ? [...accountUserIds].filter((id) => id === userId) : [...accountUserIds];
    return ids.sort().map(getUserAudit);
  }

  function getUserAudit(userId) {
    const account = walletService?.getAccount ? walletService.getAccount(userId) : null;
    const ledger = queryLedger({ userId });
    const freeze = frozenUsers.get(userId) || null;
    const profile = userProfiles.get(userId) || null;
    return {
      userId,
      frozen: Boolean(freeze),
      freeze,
      profile,
      account,
      ledgerCount: ledger.length,
      lastLedgerEntry: ledger.at(-1) || null,
    };
  }

  function freezeUser(userId, reason) {
    const freeze = {
      userId,
      reason: String(reason || 'manual_ops_freeze').slice(0, 160),
      createdAt: clock(),
    };
    frozenUsers.set(userId, freeze);
    ensureProfile(userId);
    persist();
    return { ok: true, user: getUserAudit(userId) };
  }

  function unfreezeUser(userId) {
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
      note: '',
      source: patch.source || 'ops',
      createdAt: clock(),
    };
    const next = {
      ...current,
      displayName: patch.displayName != null
        ? String(patch.displayName).trim().slice(0, 24)
        : current.displayName,
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
    return [...adPlacements.values()]
      .map((placement) => normalizeStoredAdPlacement(placement))
      .filter((placement) => includeDisabled || (placement.enabled && isAdPlacementActive(placement, now)))
      .filter((placement) => !filter.gameId || placement.gameId === filter.gameId)
      .filter((placement) => !filter.surface || placement.surface === filter.surface)
      .filter((placement) => !filter.slotType || placement.slotType === filter.slotType)
      .filter((placement) => filter.seatIndex === undefined || filter.seatIndex === '' || String(placement.seatIndex ?? '') === String(filter.seatIndex))
      .filter((placement) => !filter.categoryId || placement.categoryId === filter.categoryId)
      .sort((a, b) => a.priority - b.priority || a.slotId.localeCompare(b.slotId))
      .map(decorateAdPlacement);
  }

  function decorateAdPlacement(placement) {
    const logo = placement.logoId ? adLogos.get(placement.logoId) : null;
    const category = placement.categoryId ? adCategories.get(placement.categoryId) : null;
    return {
      ...placement,
      categoryName: category?.name || '',
      logo: logo ? publicLogo(logo) : null,
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

  function listAdLogos(includeData = false) {
    return [...adLogos.values()].map((logo) => publicLogo(logo, includeData));
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
    persist,
  };
}

function authenticateAdmin(req, adminToken) {
  if (!adminToken) return { ok: false, status: 500, reason: 'admin_token_not_configured' };
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  const headerToken = req.headers['x-admin-token'];
  if (bearer === adminToken || headerToken === adminToken) return { ok: true };
  return { ok: false, status: 401, reason: 'admin_auth_required' };
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
  const allowedSlotTypes = new Set(['banner', 'table', 'table-surface', 'table-rail', 'character-costume', 'card-back', 'settlement']);
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
  if (!advertiserName || !campaignTitle || !copy) {
    return { ok: false, reason: 'ad_copy_required' };
  }
  if (!landingUrl) return { ok: false, reason: 'https_landing_url_required' };
  return {
    ok: true,
    placement: {
      slotId,
      gameId,
      surface: body.surface,
      slotType: body.slotType,
      seatIndex: seatIndex.value,
      enabled: body.enabled !== false,
      priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
      advertiserName,
      campaignTitle,
      copy,
      landingUrl,
      assetTheme: cleanText(body.assetTheme || body.categoryId || 'platform', 24),
      categoryId: cleanText(body.categoryId || body.assetTheme || 'other', 32) || 'other',
      logoId: body.logoId && /^[a-z0-9:_-]{2,32}$/i.test(body.logoId) ? String(body.logoId) : '',
      short: cleanText(body.short || body.advertiserName, 8),
      startAt: startAt.value,
      endAt: endAt.value,
      updatedAt: clock(),
      policy: 'ad_config_only_no_real_money_settlement',
    },
  };
}

function normalizeStoredAdPlacement(placement = {}) {
  return {
    ...placement,
    gameId: cleanText(placement.gameId || inferGameIdFromSlot(placement.slotId, placement.surface), 32) || 'general',
    seatIndex: Number.isInteger(placement.seatIndex) ? placement.seatIndex : null,
    startAt: placement.startAt || null,
    endAt: placement.endAt || null,
  };
}

function isAdPlacementActive(placement, now) {
  const start = placement.startAt ? Date.parse(placement.startAt) : NaN;
  const end = placement.endAt ? Date.parse(placement.endAt) : NaN;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now > end) return false;
  return true;
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

function cleanText(value, maxLength) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, maxLength);
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
  const defaultStore = fileURLToPath(new URL('../data/ops-store.json', import.meta.url));
  const service = createOpsService({
    adminToken: process.env.ADMIN_TOKEN || 'tea-parlor-ops',
    storePath: process.env.OPS_STORE_PATH || defaultStore,
    seedDemo: process.env.OPS_SEED_DEMO !== '0',
  });
  service.listen(Number(process.env.PORT || 5190)).then(({ url }) => {
    console.log(`Ops console ${url}/admin`);
    console.log('Admin token is read from ADMIN_TOKEN (local default: tea-parlor-ops). Shadow points only.');
  });
}
