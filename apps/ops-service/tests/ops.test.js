import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createDoudizhuRealtimeServer } from '@tea-parlor/doudizhu-game-server';
import { createWalletService, GoldLedgerType, LedgerEntryType } from '@tea-parlor/wallet-service';
import { createOpsService } from '../src/server.js';

test('admin routes require a token and expose user ledger audit data', async () => {
  const gameServer = createDoudizhuRealtimeServer({ actionTimeoutMs: 0 });
  gameServer.walletService.issuePoints({
    userId: 'alice',
    amount: 1000,
    idempotencyKey: 'grant:alice',
  });
  const ops = createOpsService({
    adminToken: 'secret',
    walletService: gameServer.walletService,
    gameServers: { doudizhu: gameServer },
    clock: () => '2026-08-14T00:00:00.000Z',
  });

  const unauthorized = await invoke(ops.handler, 'GET', '/admin/users/alice');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.reason, 'admin_auth_required');

  const user = await invoke(ops.handler, 'GET', '/admin/users/alice', {
    headers: authHeaders(),
  });
  assert.equal(user.status, 200);
  assert.equal(user.body.user.account.available, 1000);
  assert.equal(user.body.user.ledgerCount, 1);

  const ledger = await invoke(ops.handler, 'GET', `/admin/ledger?userId=alice&type=${LedgerEntryType.ISSUE}`, {
    headers: authHeaders(),
  });
  assert.equal(ledger.body.ledger.length, 1);
  assert.equal(ledger.body.ledger[0].metadata.constructor, Object);
});

test('ops service can freeze users and update shadow-points room config', async () => {
  const gameServer = createDoudizhuRealtimeServer({ actionTimeoutMs: 0 });
  const ops = createOpsService({
    adminToken: 'secret',
    walletService: gameServer.walletService,
    gameServers: { doudizhu: gameServer },
    clock: () => '2026-08-14T00:00:00.000Z',
  });

  const frozen = await invoke(ops.handler, 'POST', '/admin/users/bob/freeze', {
    headers: authHeaders(),
    body: { reason: 'risk_review' },
  });
  assert.equal(frozen.body.user.frozen, true);
  assert.equal(frozen.body.user.freeze.reason, 'risk_review');

  const listed = await invoke(ops.handler, 'GET', '/admin/users', { headers: authHeaders() });
  assert.ok(listed.body.users.some((user) => user.userId === 'bob' && user.frozen));

  const config = await invoke(ops.handler, 'PUT', '/admin/room-configs/doudizhu/classic-high', {
    headers: authHeaders(),
    body: {
      name: '经典高手场',
      baseRoomScore: 20,
      buyIn: 2000,
    },
  });
  assert.equal(config.status, 200);
  assert.equal(config.body.config.policy, 'shadow_points_only');
  assert.equal(config.body.config.baseRoomScore, 20);

  const invalid = await invoke(ops.handler, 'PUT', '/admin/room-configs/doudizhu/bad-room', {
    headers: authHeaders(),
    body: {
      baseRoomScore: 0,
      buyIn: 100,
    },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.reason, 'positive_base_room_score_required');
});

test('ops service lists rooms, replays sanitized events, and scans settlement anomalies', async () => {
  const gameServer = createDoudizhuRealtimeServer({ actionTimeoutMs: 0 });
  gameServer.rooms.set('ops-room', {
    roomId: 'ops-room',
    gameId: 'doudizhu',
    status: 'settled',
    roundId: 'ops-room:round-1',
    players: [
      { id: 'p1', name: 'p1', seatIndex: 0 },
      { id: 'p2', name: 'p2', seatIndex: 1 },
      { id: 'p3', name: 'p3', seatIndex: 2 },
    ],
    connectedUserIds: new Set(['p1', 'p2']),
    settled: true,
    events: [
      { type: 'start_round', roundId: 'ops-room:round-1', at: '2026-08-14T00:00:00.000Z' },
      { type: 'action', userId: 'p1', seatIndex: 0, action: { type: 'bid', score: 3 }, at: '2026-08-14T00:00:01.000Z' },
    ],
    settlementIntent: null,
    settlementResult: null,
    engine: null,
  });
  const targetRoom = gameServer.rooms.get('ops-room');
  targetRoom.settlementIntent = {
    scores: [1, 1, -1],
  };

  const ops = createOpsService({
    adminToken: 'secret',
    walletService: gameServer.walletService,
    gameServers: { doudizhu: gameServer },
  });

  const rooms = await invoke(ops.handler, 'GET', '/admin/rooms', { headers: authHeaders() });
  assert.equal(rooms.body.rooms.length, 1);
  assert.equal(rooms.body.rooms[0].roomId, 'ops-room');

  const audit = await invoke(ops.handler, 'GET', '/admin/rooms/doudizhu/ops-room', { headers: authHeaders() });
  assert.equal(audit.body.room.roomId, 'ops-room');
  assert.equal(audit.body.room.players.length, 3);

  const replay = await invoke(ops.handler, 'GET', '/admin/rooms/doudizhu/ops-room/replay', { headers: authHeaders() });
  assert.ok(replay.body.events.some((event) => event.type === 'start_round'));
  assert.equal(Object.hasOwn(replay.body.events[0], 'hand'), false);

  const anomalies = await invoke(ops.handler, 'GET', '/admin/settlements/anomalies', { headers: authHeaders() });
  assert.deepEqual(anomalies.body.anomalies, [{
    gameId: 'doudizhu',
    roomId: 'ops-room',
    roundId: 'ops-room:round-1',
    reason: 'settlement_scores_not_zero_sum',
  }]);
});

test('ops service exposes configurable ad placements for lobby, table, and character costume slots', async () => {
  const gameServer = createDoudizhuRealtimeServer({ actionTimeoutMs: 0 });
  const ops = createOpsService({
    adminToken: 'secret',
    walletService: gameServer.walletService,
    gameServers: { doudizhu: gameServer },
    clock: () => '2026-08-14T00:00:00.000Z',
  });

  const publicTableAds = await invoke(ops.handler, 'GET', '/public/ad-placements?surface=game-table');
  assert.equal(publicTableAds.status, 200);
  assert.ok(publicTableAds.body.placements.every((placement) => placement.enabled));
  assert.ok(publicTableAds.body.placements.some((placement) => placement.slotType === 'table-surface'));
  assert.ok(publicTableAds.body.placements.some((placement) => placement.slotType === 'table-rail'));
  assert.ok(publicTableAds.body.placements.some((placement) => placement.slotType === 'character-costume'));
  assert.ok(publicTableAds.body.placements.some((placement) => placement.slotType === 'card-back'));
  assert.ok(publicTableAds.body.placements.some((placement) => placement.slotType === 'card-front'));
  assert.ok(publicTableAds.body.placements.every((placement) => placement.auditStatus === 'approved'));
  assert.ok(publicTableAds.body.placements.every((placement) => placement.safeAreaPolicy === 'do_not_cover_cards_buttons_timer_result'));
  assert.ok(publicTableAds.body.placements.every((placement) => Number(placement.weight) > 0));
  assert.ok(publicTableAds.body.placements.every((placement) => placement.schedule && placement.geoRules));

  const updated = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-costume-seat-1', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'character-costume',
      seatIndex: 1,
      enabled: true,
      priority: 15,
      categoryId: 'exchange',
      logoId: 'btc',
      materialId: 'btc',
      advertiserName: 'Alpha Exchange',
      campaignTitle: '农民外套',
      copy: '平台任务入口',
      landingUrl: 'https://example.com/alpha',
      assetTheme: 'exchange',
      weight: 8,
      rotationMode: 'weighted',
      schedule: { timezone: 'Asia/Shanghai', daysOfWeek: [1, 2], hours: [10, 20] },
      geoRules: { includeCountries: ['CN'], excludeCountries: ['US'] },
      startAt: '2026-08-01T00:00:00.000Z',
      endAt: '2026-09-01T00:00:00.000Z',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.placement.gameId, 'doudizhu');
  assert.equal(updated.body.placement.seatIndex, 1);
  assert.equal(updated.body.placement.logoId, 'btc');
  assert.equal(updated.body.placement.materialId, 'btc');
  assert.equal(updated.body.placement.weight, 8);
  assert.equal(updated.body.placement.rotationMode, 'weighted');
  assert.deepEqual(updated.body.placement.schedule.daysOfWeek, [1, 2]);
  assert.deepEqual(updated.body.placement.geoRules.includeCountries, ['CN']);
  assert.equal(updated.body.placement.startAt, '2026-08-01T00:00:00.000Z');
  assert.equal(updated.body.placement.endAt, '2026-09-01T00:00:00.000Z');
  assert.equal(updated.body.placement.updatedAt, '2026-08-14T00:00:00.000Z');
  assert.equal(updated.body.placement.policy, 'ad_config_only_no_real_money_settlement');

  const filtered = await invoke(ops.handler, 'GET', '/admin/ad-placements?gameId=doudizhu&slotType=character-costume&seatIndex=1', {
    headers: authHeaders(),
  });
  assert.ok(filtered.body.placements.some((placement) => placement.advertiserName === 'Alpha Exchange' && placement.logo?.id === 'btc'));

  const preview = await invoke(ops.handler, 'GET', '/admin/ad-placements/doudizhu-costume-seat-1/preview', {
    headers: authHeaders(),
  });
  assert.equal(preview.status, 200);
  assert.match(preview.body.html, /data-safe-area="do_not_cover_cards_buttons_timer_result"/);

  const settlementAd = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-settle-test', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'settlement-page',
      slotType: 'settlement',
      enabled: true,
      priority: 16,
      advertiserName: 'Settle Quest',
      campaignTitle: '局后任务',
      copy: '赛季积分挑战',
      landingUrl: 'https://example.com/settle',
      categoryId: 'quest',
      startAt: '2026-08-01T00:00:00.000Z',
      endAt: '2026-09-01T00:00:00.000Z',
    },
  });
  assert.equal(settlementAd.status, 200);
  const publicSettlementAds = await invoke(ops.handler, 'GET', '/public/ad-placements?surface=settlement-page&gameId=doudizhu');
  assert.ok(publicSettlementAds.body.placements.some((placement) => placement.slotId === 'doudizhu-settle-test'));

  const disabled = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-disabled-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: false,
      advertiserName: 'Disabled',
      campaignTitle: '停用广告',
      copy: '不应公开展示',
      landingUrl: 'https://example.com/disabled',
    },
  });
  assert.equal(disabled.status, 200);

  const expired = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-expired-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      advertiserName: 'Expired',
      campaignTitle: '过期广告',
      copy: '不应公开展示',
      landingUrl: 'https://example.com/expired',
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
    },
  });
  assert.equal(expired.status, 200);

  const future = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-future-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      advertiserName: 'Future',
      campaignTitle: '未开始广告',
      copy: '不应公开展示',
      landingUrl: 'https://example.com/future',
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-10-01T00:00:00.000Z',
    },
  });
  assert.equal(future.status, 200);

  const pendingAd = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-pending-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      auditStatus: 'pending',
      advertiserName: 'Pending',
      campaignTitle: '待审核广告',
      copy: '不应公开展示',
      landingUrl: 'https://example.com/pending',
    },
  });
  assert.equal(pendingAd.status, 200);

  const material = await invoke(ops.handler, 'POST', '/admin/ad-materials', {
    headers: authHeaders(),
    body: {
      id: 'pending-material',
      name: '待审核素材',
      type: 'image',
      auditStatus: 'pending',
      width: 320,
      height: 120,
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    },
  });
  assert.equal(material.status, 200);
  assert.equal(material.body.logo.auditStatus, 'pending');

  const pendingMaterialAd = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-pending-material', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      auditStatus: 'approved',
      materialId: 'pending-material',
      logoId: 'pending-material',
      advertiserName: 'Pending Material',
      campaignTitle: '素材待审',
      copy: '不应公开展示',
      landingUrl: 'https://example.com/pending-material',
    },
  });
  assert.equal(pendingMaterialAd.status, 200);

  const publicAfterFilters = await invoke(ops.handler, 'GET', '/public/ad-placements?surface=game-table&gameId=doudizhu');
  const publicSlots = publicAfterFilters.body.placements.map((placement) => placement.slotId);
  assert.ok(!publicSlots.includes('doudizhu-disabled-ad'));
  assert.ok(!publicSlots.includes('doudizhu-expired-ad'));
  assert.ok(!publicSlots.includes('doudizhu-future-ad'));
  assert.ok(!publicSlots.includes('doudizhu-pending-ad'));
  assert.ok(!publicSlots.includes('doudizhu-pending-material'));
  assert.ok(!publicAfterFilters.body.logos.some((logo) => logo.id === 'pending-material'));

  const adminAfterFilters = await invoke(ops.handler, 'GET', '/admin/ad-placements?gameId=doudizhu', {
    headers: authHeaders(),
  });
  const adminSlots = adminAfterFilters.body.placements.map((placement) => placement.slotId);
  assert.ok(adminSlots.includes('doudizhu-disabled-ad'));
  assert.ok(adminSlots.includes('doudizhu-expired-ad'));
  assert.ok(adminSlots.includes('doudizhu-future-ad'));
  assert.ok(adminSlots.includes('doudizhu-pending-ad'));
  assert.ok(adminSlots.includes('doudizhu-pending-material'));

  const lightWeighted = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-weight-light', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      advertiserName: 'Light',
      campaignTitle: '低权重',
      copy: '轮播测试',
      landingUrl: 'https://example.com/light',
      weight: 1,
      rotationMode: 'weighted',
      priority: 900,
    },
  });
  assert.equal(lightWeighted.status, 200);
  const heavyWeighted = await invoke(ops.handler, 'PUT', '/admin/ad-placements/doudizhu-weight-heavy', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      enabled: true,
      advertiserName: 'Heavy',
      campaignTitle: '高权重',
      copy: '轮播测试',
      landingUrl: 'https://example.com/heavy',
      weight: 100,
      rotationMode: 'weighted',
      priority: 900,
    },
  });
  assert.equal(heavyWeighted.status, 200);
  const weighted = await invoke(ops.handler, 'GET', '/public/ad-placements?surface=game-table&slotType=table-rail&rotationSeed=test');
  const weightedSlots = weighted.body.placements.map((placement) => placement.slotId);
  assert.ok(weightedSlots.indexOf('doudizhu-weight-heavy') < weightedSlots.indexOf('doudizhu-weight-light'));

  const invalid = await invoke(ops.handler, 'PUT', '/admin/ad-placements/bad-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'character-costume',
      advertiserName: 'Bad Link',
      campaignTitle: 'bad',
      copy: 'bad',
      landingUrl: 'http://example.com/insecure',
    },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.reason, 'https_landing_url_required');

  const invalidImage = await invoke(ops.handler, 'PUT', '/admin/ad-placements/bad-image-ad', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      advertiserName: 'Bad Image',
      campaignTitle: 'bad',
      copy: 'bad',
      landingUrl: 'https://example.com/valid',
      imageUrl: 'http://example.com/insecure.png',
    },
  });
  assert.equal(invalidImage.status, 400);
  assert.equal(invalidImage.body.reason, 'https_image_url_required');

  const badRange = await invoke(ops.handler, 'PUT', '/admin/ad-placements/bad-range', {
    headers: authHeaders(),
    body: {
      gameId: 'doudizhu',
      surface: 'game-table',
      slotType: 'table-rail',
      advertiserName: 'Bad Range',
      campaignTitle: 'bad',
      copy: 'bad',
      landingUrl: 'https://example.com/range',
      startAt: '2026-09-01T00:00:00.000Z',
      endAt: '2026-08-01T00:00:00.000Z',
    },
  });
  assert.equal(badRange.status, 400);
  assert.equal(badRange.body.reason, 'invalid_ad_time_range');

  const unauthCreate = await invoke(ops.handler, 'POST', '/admin/ad-placements', {
    body: {
      slotId: 'unauth-ad',
      gameId: 'lobby',
      surface: 'lobby',
      slotType: 'banner',
      advertiserName: 'No Auth',
      campaignTitle: 'unauth',
      copy: 'unauth',
      landingUrl: 'https://example.com/no-auth',
    },
  });
  assert.equal(unauthCreate.status, 401);

  const beforeLedger = await invoke(ops.handler, 'GET', '/admin/ledger', { headers: authHeaders() });
  const publicWriteAttempt = await invoke(ops.handler, 'POST', '/public/ad-placements', {
    body: {
      slotId: 'public-write',
      gameId: 'lobby',
      surface: 'lobby',
      slotType: 'banner',
    },
  });
  assert.equal(publicWriteAttempt.status, 401);
  const afterLedger = await invoke(ops.handler, 'GET', '/admin/ledger', { headers: authHeaders() });
  assert.equal(afterLedger.body.ledger.length, beforeLedger.body.ledger.length);

  const beforeClickLedger = await invoke(ops.handler, 'GET', '/admin/ledger', { headers: authHeaders() });
  const click = await invoke(ops.handler, 'POST', '/public/ad-clicks', {
    body: {
      slotId: 'doudizhu-table-center',
      playerId: 'alice',
      eventId: 'click:doudizhu-table-center:1',
    },
  });
  assert.equal(click.status, 200);
  assert.equal(click.body.event.eventType, 'click');
  assert.equal(click.body.event.policy, 'ad_event_only_no_wallet_ledger_write');
  const events = await invoke(ops.handler, 'GET', '/admin/ad-events?eventType=click', { headers: authHeaders() });
  assert.ok(events.body.events.some((event) => event.eventId === 'click:doudizhu-table-center:1'));
  const duplicateClick = await invoke(ops.handler, 'POST', '/public/ad-clicks', {
    body: {
      slotId: 'doudizhu-table-center',
      playerId: 'alice',
      eventId: 'click:doudizhu-table-center:1',
    },
  });
  assert.equal(duplicateClick.body.duplicate, true);
  const afterClickLedger = await invoke(ops.handler, 'GET', '/admin/ledger', { headers: authHeaders() });
  assert.equal(afterClickLedger.body.ledger.length, beforeClickLedger.body.ledger.length);
});

test('ops console can take a game offline, grant shadow points, and summarize the ledger', async () => {
  const ops = createOpsService({
    adminToken: 'secret',
    clock: () => '2026-08-17T00:00:00.000Z',
  });
  const initialSummary = await invoke(ops.handler, 'GET', '/admin/ledger/summary', { headers: authHeaders() });
  assert.equal(initialSummary.body.summary.ledgerCount, 0);

  const reported = await invoke(ops.handler, 'POST', '/public/revenue', {
    body: {
      playerId: 'lobby:p1',
      currency: 'ingot',
      kind: 'gold_table_fee',
      fee: 12,
      baseScore: 12,
      game: 'doudizhu',
      idempotencyKey: 'test:rake:1',
    },
  });
  assert.equal(reported.status, 200);
  assert.equal(reported.body.fee, 12);
  assert.equal(reported.body.event.status, 'pending_review');
  assert.equal(reported.body.event.policy, 'public_event_only_no_ledger_write');
  const seasonPointFee = await invoke(ops.handler, 'POST', '/public/revenue', {
    body: {
      playerId: 'lobby:p2',
      currency: 'season_points',
      kind: 'season_point_test_fee',
      fee: 0.5,
      winAmount: 50,
      game: 'doudizhu',
      idempotencyKey: 'test:rake:2',
    },
  });
  assert.equal(seasonPointFee.status, 200);
  assert.equal(seasonPointFee.body.kind, 'season_point_test_fee');
  const profit = await invoke(ops.handler, 'GET', '/admin/ledger/summary', { headers: authHeaders() });
  assert.equal(profit.body.summary.platformRevenue, 0);
  assert.equal(profit.body.summary.pendingRevenueEvents, 2);
  assert.equal(profit.body.summary.ledgerCount, 0);
  const publicRevenueEvents = await invoke(ops.handler, 'GET', '/admin/revenue-events');
  assert.equal(publicRevenueEvents.status, 401);
  const revenueEvents = await invoke(ops.handler, 'GET', '/admin/revenue-events', { headers: authHeaders() });
  assert.equal(revenueEvents.body.events.length, 2);

  const catalog = await invoke(ops.handler, 'GET', '/public/catalog');
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.games.some((game) => game.id === 'doudizhu' && game.enabled));
  assert.ok(catalog.body.characters.some((item) => item.id === 'male_hero' && item.enabled));
  assert.ok(catalog.body.skins.some((item) => item.id === 'classic-green' && item.enabled));
  const chainAssets = await invoke(ops.handler, 'GET', '/public/chain-assets?playerId=ops:alice');
  assert.equal(chainAssets.status, 200);
  assert.equal(chainAssets.body.policy, 'internal_mock_only_no_chain_transaction');
  assert.equal(chainAssets.body.network.externalTransactions, false);
  assert.deepEqual(chainAssets.body.network.labels, ['测试网', '规划中', '合规后开放']);
  assert.ok(chainAssets.body.assets.some((item) => item.label === '影子积分'));
  assert.ok(chainAssets.body.assets.some((item) => item.label === '赛季积分'));
  assert.ok(chainAssets.body.assets.some((item) => item.label === '皮肤碎片'));
  assert.ok(chainAssets.body.assets.some((item) => item.label === '链游纪念资产'));
  assert.ok(chainAssets.body.collectibles.some((item) => item.type === 'NFT 皮肤占位' && item.status === '不可交易'));
  assert.doesNotMatch(JSON.stringify(chainAssets.body), /充值|提现|真钱场|USDT 入座|收款|转账/);
  const coBrandSkin = catalog.body.skins.find((item) => item.id === 'chinese-red');
  assert.equal(coBrandSkin.category, '广告联名');
  assert.equal(coBrandSkin.rarity, 'epic');
  assert.equal(coBrandSkin.coBranded, true);
  assert.equal(coBrandSkin.slotType, 'table_skin');
  assert.equal(coBrandSkin.listingStatus, 'published');
  assert.equal(coBrandSkin.auditStatus, 'approved');
  assert.deepEqual(coBrandSkin.logoPlacementPolicy, ['table_corner']);
  assert.ok(catalog.body.skins.some((item) => item.slotType === 'card_back'));
  assert.ok(catalog.body.skins.some((item) => item.slotType === 'avatar_frame'));
  assert.equal(catalog.body.skins.some((item) => item.slotType === 'card_front' && item.coBranded), false);
  assert.ok(catalog.body.skins.some((item) => item.group === '链游纪念' && item.nft?.tradable === false));

  const hideChar = await invoke(ops.handler, 'PUT', '/admin/characters/tea_fox', {
    headers: authHeaders(),
    body: { enabled: false },
  });
  assert.equal(hideChar.status, 200);
  assert.equal(hideChar.body.character.enabled, false);
  const hideSkin = await invoke(ops.handler, 'PUT', '/admin/skins/cyber-neon', {
    headers: authHeaders(),
    body: { enabled: false },
  });
  assert.equal(hideSkin.body.skin.enabled, false);
  const updateSkin = await invoke(ops.handler, 'PUT', '/admin/skins/frame-partner-badge', {
    headers: authHeaders(),
    body: {
      enabled: true,
      rarity: 'legendary',
      source: '本地联名配置',
      limited: true,
      coBranded: true,
      slotType: 'avatar_frame',
      surface: 'avatar',
      listingStatus: 'scheduled',
      auditStatus: 'pending',
      logoPlacementPolicy: ['chest_badge', 'sleeve_badge', 'head'],
    },
  });
  assert.equal(updateSkin.status, 200);
  assert.equal(updateSkin.body.skin.rarity, 'legendary');
  assert.equal(updateSkin.body.skin.source, '本地联名配置');
  assert.equal(updateSkin.body.skin.slotType, 'avatar_frame');
  assert.equal(updateSkin.body.skin.listingStatus, 'reviewing');
  assert.equal(updateSkin.body.skin.configStatus, 'reviewing');
  assert.equal(updateSkin.body.skin.auditStatus, 'pending');
  assert.deepEqual(updateSkin.body.skin.logoPlacementPolicy, ['chest_badge', 'sleeve_badge']);
  const publicLooks = await invoke(ops.handler, 'GET', '/public/catalog');
  assert.equal(publicLooks.body.characters.find((item) => item.id === 'tea_fox').enabled, false);
  assert.equal(publicLooks.body.skins.find((item) => item.id === 'cyber-neon').enabled, false);
  assert.equal(publicLooks.body.skins.find((item) => item.id === 'frame-partner-badge').rarity, 'legendary');

  const offline = await invoke(ops.handler, 'PUT', '/admin/games/doudizhu', {
    headers: authHeaders(),
    body: { enabled: false },
  });
  assert.equal(offline.status, 200);
  assert.equal(offline.body.game.enabled, false);

  const publicAfter = await invoke(ops.handler, 'GET', '/public/catalog');
  assert.equal(publicAfter.body.games.find((game) => game.id === 'doudizhu').enabled, false);

  const unknown = await invoke(ops.handler, 'PUT', '/admin/games/not-a-game', {
    headers: authHeaders(),
    body: { enabled: true },
  });
  assert.equal(unknown.status, 400);

  const created = await invoke(ops.handler, 'POST', '/admin/users', {
    headers: authHeaders(),
    body: { userId: 'ops:carol', displayName: 'Carol', amount: 200 },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.user.profile.source, 'ops');
  assert.equal(created.body.user.account.available, 200);

  const duplicate = await invoke(ops.handler, 'POST', '/admin/users', {
    headers: authHeaders(),
    body: { userId: 'ops:carol', amount: 1 },
  });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.reason, 'user_exists');

  const touch = await invoke(ops.handler, 'POST', '/public/player-touch', {
    body: { playerId: 'lobby-visitor', name: '路过' },
  });
  assert.equal(touch.status, 200);
  assert.equal(touch.body.managed, false);
  const visitors = await invoke(ops.handler, 'GET', '/admin/users?userId=lobby-visitor', { headers: authHeaders() });
  assert.equal(visitors.body.users.length, 0);

  const grant = await invoke(ops.handler, 'POST', '/admin/users/carol/grant', {
    headers: authHeaders(),
    body: { amount: 500, displayName: 'Carol', reason: 'manual_test_credit' },
  });
  assert.equal(grant.status, 200);
  assert.equal(grant.body.user.account.available, 500);
  assert.equal(grant.body.user.profile.displayName, 'Carol');
  assert.equal(grant.body.user.lastLedgerEntry.metadata.reason, 'manual_test_credit');

  const missingReason = await invoke(ops.handler, 'POST', '/admin/users/carol/grant', {
    headers: authHeaders(),
    body: { amount: 1 },
  });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.body.reason, 'grant_reason_required');

  const summary = await invoke(ops.handler, 'GET', '/admin/ledger/summary', { headers: authHeaders() });
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.issued, 700);
  assert.equal(summary.body.summary.settlementBalanced, true);
  assert.equal(summary.body.summary.policy, 'shadow_points_only');

  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /运营控制台|运营后台/);
  assert.match(page, /玩法/);
  assert.match(page, /广告/);
  assert.match(page, /账目/);
  assert.match(page, /用户/);
  assert.match(page, /新建用户|建档/);
  assert.match(page, /人物/);
  assert.match(page, /皮肤/);
  assert.match(page, /服饰 Logo|服饰Logo/);
  assert.match(page, /品类|上传素材|新建 \/ 编辑广告/);
  assert.match(page, /审计日志/);
  assert.match(page, /配置发布与回滚/);
  assert.match(page, /UID \/ TG ID \/ 昵称/);
  assert.match(page, /草稿|审核中|已发布|已下架/);
  assert.doesNotMatch(page, /资金提现|资金充值|法币|主网/);
});

test('ops store persists game and ad changes across service restarts', async () => {
  const storePath = fileURLToPath(new URL('./tmp-ops-store.json', import.meta.url));
  try {
    const first = createOpsService({
      adminToken: 'secret',
      storePath,
      clock: () => '2026-08-17T00:00:00.000Z',
    });
    await invoke(first.handler, 'PUT', '/admin/games/texas', {
      headers: authHeaders(),
      body: { enabled: false },
    });
    await invoke(first.handler, 'PUT', '/admin/ad-placements/lobby-top-banner', {
      headers: authHeaders(),
      body: {
        gameId: 'lobby',
        surface: 'lobby',
        slotType: 'banner',
        seatIndex: null,
        enabled: true,
        advertiserName: 'Tea Ads',
        campaignTitle: '大厅横幅',
        copy: '影子积分季',
        landingUrl: 'https://example.com/tea',
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-09-01T00:00:00.000Z',
      },
    });

    const second = createOpsService({ adminToken: 'secret', storePath });
    const games = await invoke(second.handler, 'GET', '/admin/games', { headers: authHeaders() });
    assert.equal(games.body.games.find((game) => game.id === 'texas').enabled, false);
    const category = await invoke(first.handler, 'POST', '/admin/ad-categories', {
      headers: authHeaders(),
      body: { id: 'defi', name: 'DeFi' },
    });
    assert.equal(category.status, 200);
    const logo = await invoke(first.handler, 'POST', '/admin/ad-logos', {
      headers: authHeaders(),
      body: {
        id: 'dot',
        name: 'Dot',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
    });
    assert.equal(logo.status, 200);
    const createdAd = await invoke(first.handler, 'POST', '/admin/ad-placements', {
      headers: authHeaders(),
      body: {
        slotId: 'lobby-custom-dot',
        gameId: 'lobby',
        surface: 'lobby',
        slotType: 'banner',
        categoryId: 'defi',
        logoId: 'dot',
        advertiserName: 'DotAds',
        campaignTitle: '自建广告',
        copy: '后台新增内容',
        landingUrl: 'https://example.com/dot',
      },
    });
    assert.equal(createdAd.status, 200);
    await invoke(first.handler, 'PUT', '/admin/costume-logos', {
      headers: authHeaders(),
      body: { enabled: true, leftId: 'btc', rightId: 'tea', size: 'lg' },
    });
    const ads = await invoke(second.handler, 'GET', '/public/ad-placements?surface=lobby');
    assert.ok(ads.body.placements.some((placement) => placement.advertiserName === 'Tea Ads'));

    await invoke(first.handler, 'POST', '/admin/users', {
      headers: authHeaders(),
      body: { userId: 'ops:dana', displayName: 'Dana', amount: 700 },
    });
    const third = createOpsService({ adminToken: 'secret', storePath });
    const adsAfter = await invoke(third.handler, 'GET', '/admin/ad-placements', { headers: authHeaders() });
    assert.ok(adsAfter.body.categories.some((item) => item.id === 'defi'));
    assert.ok(adsAfter.body.logos.some((item) => item.id === 'dot' && item.builtin === false));
    assert.ok(adsAfter.body.placements.some((item) => item.slotId === 'lobby-custom-dot' && item.logoId === 'dot'));
    const restoredBanner = adsAfter.body.placements.find((item) => item.slotId === 'lobby-top-banner');
    assert.equal(restoredBanner.gameId, 'lobby');
    assert.equal(restoredBanner.startAt, '2026-08-01T00:00:00.000Z');
    assert.equal(restoredBanner.endAt, '2026-09-01T00:00:00.000Z');
    const logos = await invoke(third.handler, 'GET', '/public/costume-logos');
    assert.equal(logos.body.costumeLogos.leftId, 'btc');
    assert.equal(logos.body.costumeLogos.rightId, 'tea');
    assert.equal(logos.body.costumeLogos.size, 'lg');
    const restored = await invoke(third.handler, 'GET', '/admin/users/ops:dana', { headers: authHeaders() });
    assert.equal(restored.body.user.account.available, 700);
    assert.equal(restored.body.user.profile.source, 'ops');
  } finally {
    rmSync(storePath, { force: true });
  }
});

test('ops service enforces RBAC, audit logs writes, and supports config rollback', async () => {
  const ops = createOpsService({
    adminToken: 'secret',
    roleTokens: {
      game_operator: { token: 'operator-token', id: 'op-1', name: 'Game Ops' },
      support: { token: 'support-token', id: 'cs-1', name: 'Support' },
      auditor: { token: 'audit-token', id: 'audit-1', name: 'Audit' },
    },
    clock: () => '2026-08-30T00:00:00.000Z',
  });

  const me = await invoke(ops.handler, 'GET', '/admin/me', { headers: authHeaders('operator-token') });
  assert.equal(me.body.admin.role, 'game_operator');
  assert.equal(me.body.admin.roleLabel, '游戏运营');

  const supportCreateAd = await invoke(ops.handler, 'PUT', '/admin/ad-placements/support-ad', {
    headers: authHeaders('support-token'),
    body: {
      gameId: 'lobby',
      surface: 'lobby',
      slotType: 'banner',
      advertiserName: 'Support',
      campaignTitle: '越权',
      copy: '越权',
      landingUrl: 'https://example.com/support',
    },
  });
  assert.equal(supportCreateAd.status, 403);
  assert.equal(supportCreateAd.body.reason, 'rbac_forbidden');

  const auditorWrite = await invoke(ops.handler, 'PUT', '/admin/games/doudizhu', {
    headers: authHeaders('audit-token'),
    body: { enabled: false },
  });
  assert.equal(auditorWrite.status, 403);

  const supportFreezeWithoutReason = await invoke(ops.handler, 'POST', '/admin/users/alice/freeze', {
    headers: authHeaders('support-token'),
    body: {},
  });
  assert.equal(supportFreezeWithoutReason.status, 400);
  assert.equal(supportFreezeWithoutReason.body.reason, 'freeze_reason_required');

  const supportFreeze = await invoke(ops.handler, 'POST', '/admin/users/alice/freeze', {
    headers: authHeaders('support-token'),
    body: { reason: 'risk_review' },
  });
  assert.equal(supportFreeze.status, 200);
  assert.equal(supportFreeze.body.user.frozen, true);

  const supportGrant = await invoke(ops.handler, 'POST', '/admin/users/alice/grant', {
    headers: authHeaders('support-token'),
    body: { amount: 1, reason: 'bad' },
  });
  assert.equal(supportGrant.status, 403);

  const supportUnfreezeWithoutReason = await invoke(ops.handler, 'POST', '/admin/users/alice/unfreeze', {
    headers: authHeaders('support-token'),
    body: {},
  });
  assert.equal(supportUnfreezeWithoutReason.status, 400);
  assert.equal(supportUnfreezeWithoutReason.body.reason, 'unfreeze_reason_required');

  const created = await invoke(ops.handler, 'POST', '/admin/users', {
    headers: authHeaders(),
    body: {
      userId: 'ops:search-1',
      tgId: '998877',
      displayName: '茶客甲',
      nickname: 'SearchNick',
      amount: 200,
      reason: 'seed',
    },
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.user.tgId, '998877');
  assert.equal(created.body.user.shadowPoints.available, 200);
  assert.ok(Array.isArray(created.body.user.ledger));

  const foundByTg = await invoke(ops.handler, 'GET', '/admin/users?tgId=998877', { headers: authHeaders('support-token') });
  assert.equal(foundByTg.body.users.length, 1);
  const foundByNick = await invoke(ops.handler, 'GET', '/admin/users?nickname=searchnick', { headers: authHeaders('support-token') });
  assert.equal(foundByNick.body.users[0].userId, 'ops:search-1');

  const detail = await invoke(ops.handler, 'GET', '/admin/users/ops:search-1', { headers: authHeaders('support-token') });
  assert.equal(detail.body.user.nickname, '茶客甲');
  assert.equal(detail.body.user.profile.nickname, 'SearchNick');
  assert.equal(detail.body.user.ledgerCount, 1);
  assert.equal(detail.body.user.stats.rounds, 0);

  const publish = await invoke(ops.handler, 'POST', '/admin/config-versions/publish', {
    headers: authHeaders('operator-token'),
    body: { version: 'v1', scope: 'ops-config', note: 'baseline' },
  });
  assert.equal(publish.status, 200);
  assert.equal(publish.body.version.version, 'v1');

  const offline = await invoke(ops.handler, 'PUT', '/admin/games/doudizhu', {
    headers: authHeaders('operator-token'),
    body: { enabled: false },
  });
  assert.equal(offline.status, 200);

  const rollback = await invoke(ops.handler, 'POST', '/admin/config-versions/v1/rollback', {
    headers: authHeaders('operator-token'),
    body: { reason: 'restore' },
  });
  assert.equal(rollback.status, 200);
  const games = await invoke(ops.handler, 'GET', '/admin/games', { headers: authHeaders('audit-token') });
  assert.equal(games.body.games.find((game) => game.id === 'doudizhu').enabled, true);

  await invoke(ops.handler, 'POST', '/public/ad-impressions', {
    body: { slotId: 'lobby-top-banner', eventId: 'impression:lobby:1' },
  });
  await invoke(ops.handler, 'POST', '/public/ad-clicks', {
    body: { slotId: 'lobby-top-banner', eventId: 'click:lobby:1' },
  });
  const dashboard = await invoke(ops.handler, 'GET', '/admin/dashboard', { headers: authHeaders('audit-token') });
  assert.equal(dashboard.body.dashboard.adImpressions, 1);
  assert.equal(dashboard.body.dashboard.adClicks, 1);
  assert.equal(dashboard.body.dashboard.policy, 'ops_dashboard_no_real_money_backend');

  const logs = await invoke(ops.handler, 'GET', '/admin/audit-logs', { headers: authHeaders('audit-token') });
  assert.ok(logs.body.logs.some((log) => log.status === 'denied' && log.role === 'support'));
  assert.ok(logs.body.logs.some((log) => log.action === 'user.freeze' && log.actorId === 'cs-1' && log.status === 'success'));
  assert.ok(logs.body.logs.some((log) => log.action === 'config.rollback' && log.status === 'success'));
});

test('ops service queries invite risk state and gates manual invite reward operations', async () => {
  const wallet = createWalletService({
    clock: () => '2026-08-31T10:00:00.000Z',
    inviteBindWindowLimit: 1,
  });
  wallet.registerUser({ userId: '100' });
  wallet.registerUser({ userId: '201', startParam: 'ref_100' });
  wallet.registerUser({ userId: '202', startParam: 'ref_100' });
  const pending = wallet.qualifyInvite({ inviteeUserId: '202' });
  assert.equal(pending.pending_review, true);

  const ops = createOpsService({
    adminToken: 'secret',
    walletService: wallet,
    roleTokens: {
      support: { token: 'support-token', id: 'support-1', name: '客服一号' },
      auditor: { token: 'auditor-token', id: 'auditor-1', name: '审计一号' },
    },
    clock: () => '2026-08-31T10:00:00.000Z',
  });

  const invitees = await invoke(ops.handler, 'GET', '/admin/invites/100/invitees', {
    headers: authHeaders('auditor-token'),
  });
  assert.equal(invitees.status, 200);
  assert.equal(invitees.body.invitees.length, 2);
  const abnormal = invitees.body.invitees.find((item) => item.userId === '202');
  assert.equal(abnormal.risk_status, 'abnormal');
  assert.equal(abnormal.reward_settled, false);
  assert.equal(invitees.body.reviews[0].status, 'pending_review');

  const newbieLedger = await invoke(ops.handler, 'GET', `/admin/gold-ledger?userId=202&type=${GoldLedgerType.NEWBIE_INVITE}`, {
    headers: authHeaders('support-token'),
  });
  assert.equal(newbieLedger.status, 200);
  assert.equal(newbieLedger.body.ledger.length, 1);
  assert.equal(newbieLedger.body.ledger[0].amount, 2000);

  const forbiddenApprove = await invoke(ops.handler, 'POST', '/admin/invite-rewards/approve', {
    headers: authHeaders('support-token'),
    body: { inviteeUserId: '202', reason: '客服无权补发' },
  });
  assert.equal(forbiddenApprove.status, 403);
  assert.equal(forbiddenApprove.body.reason, 'rbac_forbidden');

  const approved = await invoke(ops.handler, 'POST', '/admin/invite-rewards/approve', {
    headers: authHeaders(),
    body: { inviteeUserId: '202', reason: '人工审核通过' },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.review.status, 'paid');
  assert.equal(approved.body.ledgerEntry.type, GoldLedgerType.INVITE_SUCCESS);
  assert.equal(wallet.getUser('100').valid_invite_count, 1);

  const forbiddenFreeze = await invoke(ops.handler, 'POST', '/admin/invite-rewards/freeze', {
    headers: authHeaders('support-token'),
    body: { ledgerId: approved.body.ledgerEntry.id, reason: '客服无权冻结' },
  });
  assert.equal(forbiddenFreeze.status, 403);
  assert.equal(forbiddenFreeze.body.reason, 'rbac_forbidden');

  const frozen = await invoke(ops.handler, 'POST', '/admin/invite-rewards/freeze', {
    headers: authHeaders(),
    body: { ledgerId: approved.body.ledgerEntry.id, reason: '作弊复核' },
  });
  assert.equal(frozen.status, 200);
  assert.equal(frozen.body.review.status, 'frozen');
  assert.equal(frozen.body.reversal.goldLedgerEntry.amount, -4000);

  const inviterLedger = await invoke(ops.handler, 'GET', `/admin/gold-ledger?userId=100&type=${GoldLedgerType.INVITE_SUCCESS}`, {
    headers: authHeaders('auditor-token'),
  });
  assert.deepEqual(inviterLedger.body.ledger.map((entry) => entry.amount), [4000, -4000]);

  const auditLogs = await invoke(ops.handler, 'GET', '/admin/audit-logs?action=invite_reward', {
    headers: authHeaders(),
  });
  assert.ok(auditLogs.body.logs.some((log) => log.action === 'invite_reward.approve' && log.status === 'success'));
  assert.ok(auditLogs.body.logs.some((log) => log.action === 'invite_reward.freeze' && log.status === 'success'));
  const allAuditLogs = await invoke(ops.handler, 'GET', '/admin/audit-logs', {
    headers: authHeaders(),
  });
  assert.ok(allAuditLogs.body.logs.some((log) => log.action === 'post.invite-rewards.approve' && log.status === 'denied'));
});

test('ops service exposes quarantined GitHub game candidates without enabling runtime play', async () => {
  const ops = createOpsService({
    adminToken: 'secret',
    gameServers: {},
  });

  const publicList = await invoke(ops.handler, 'GET', '/public/game-candidates');
  assert.equal(publicList.status, 200);
  const publicCandidate = publicList.body.candidates.find((candidate) => candidate.id === 'openinggame-qp');
  assert.equal(publicCandidate.status, 'quarantine');
  assert.equal(publicCandidate.playable, false);
  assert.equal(publicCandidate.integrationMode, 'reference-only');
  assert.deepEqual(publicCandidate.gameTypes, ['炸金花', '二人麻将', '斗地主', '血流成河', '血战到底', '房间场']);
  assert.equal(Object.hasOwn(publicCandidate, 'localPath'), false);

  const adminList = await invoke(ops.handler, 'GET', '/admin/game-candidates', { headers: authHeaders() });
  assert.equal(adminList.status, 200);
  const adminCandidate = adminList.body.candidates.find((candidate) => candidate.id === 'openinggame-qp');
  assert.equal(adminCandidate.localPath, 'external/github-candidates/openinggame-qp');
  assert.ok(adminCandidate.risks.includes('closed_binary_images'));
  assert.ok(adminCandidate.forbiddenImports.includes('数据库归档'));
});

function invoke(handler, method, url, options = {}) {
  return new Promise((resolve) => {
    const payload = options.body ? JSON.stringify(options.body) : '';
    const req = Readable.from(payload ? [payload] : []);
    req.method = method;
    req.url = url;
    req.headers = {
      host: 'localhost',
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(raw) {
        resolve({
          status: this.statusCode,
          headers: this.headers,
          body: JSON.parse(String(raw || '{}')),
        });
      },
    };
    handler(req, res);
  });
}

function authHeaders(token = 'secret') {
  return { authorization: `Bearer ${token}` };
}
