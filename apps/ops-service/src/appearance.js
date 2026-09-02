/** 人物目录与 H5 CHAR_OPTIONS 同源：@tea-parlor/character-catalog */
import { publicCharacters } from '@tea-parlor/character-catalog';

export const DEFAULT_CHARACTERS = Object.freeze(publicCharacters());

export const DEFAULT_SKINS = Object.freeze([
  skin('classic-green', '翠绿牌桌', '普通', 10, '经典绿毡', { rarity: 'common', source: '基础衣橱', surface: 'lobby-table', slotType: 'table_skin' }),
  skin('dark-gold', '暗金夜场', '赛季', 20, '深金质感', { rarity: 'rare', source: 'S1 赛季', limited: true, surface: 'table', slotType: 'table_skin' }),
  skin('chinese-red', '绛红茶楼', '广告联名', 30, '红木金边', { rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'tea-parlor-partner', surface: 'table', slotType: 'table_skin' }),
  skin('cyber-neon', '霓虹电玩', '链游纪念', 40, '青绿霓虹', { rarity: 'epic', source: '链游测试纪念', limited: true, surface: 'table', slotType: 'table_skin' }),
  skin('ink-blue', '墨蓝书斋', '活动', 50, '冷蓝纸砚', { rarity: 'uncommon', source: '活动掉落', limited: true, surface: 'lobby', slotType: 'table_skin' }),
  skin('sunset-amber', '暮色琥珀', '活动', 60, '暖橙黄昏', { rarity: 'uncommon', source: '活动掉落', limited: true, surface: 'lobby', slotType: 'table_skin' }),
  skin('cardback-season-gold', '赛季金纹牌背', '赛季', 70, '牌桌牌背预留', { rarity: 'rare', source: 'S1 赛季', limited: true, surface: 'table', slotType: 'card_back' }),
  skin('cardback-partner-center', '联名中心牌背', '广告联名', 74, '牌背中心小标', { rarity: 'epic', source: 'Telegram Stars 占位订单', limited: true, coBranded: true, adLogoId: 'tea-parlor-partner', surface: 'table', slotType: 'card_back', listingStatus: 'scheduled', auditStatus: 'pending', logoPlacementPolicy: ['card_back_center'] }),
  skin('frame-partner-badge', '联名徽章头像框', '广告联名', 80, '人物头像框预留', { rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'tea-parlor-partner', surface: 'avatar', slotType: 'avatar_frame' }),
  skin('frame-chain-memorial', '链游纪念头像框', '链游纪念', 90, 'NFT 皮肤占位/展示/不可交易', { rarity: 'legendary', source: 'NFT 皮肤占位', limited: true, surface: 'avatar', slotType: 'avatar_frame', listingStatus: 'scheduled', auditStatus: 'pending', nftStatus: '展示占位' }),
]);

function skin(id, name, group, sort, summary, extra = {}) {
  return {
    id,
    name,
    group,
    enabled: extra.enabled !== false,
    sort,
    summary,
    category: group,
    rarity: extra.rarity || 'common',
    source: extra.source || '内部配置',
    limited: Boolean(extra.limited),
    coBranded: Boolean(extra.coBranded),
    adLogoId: extra.adLogoId || null,
    surface: extra.surface || 'lobby',
    slotType: extra.slotType || 'table_skin',
    previewUrl: extra.previewUrl || null,
    adSlotIds: Array.isArray(extra.adSlotIds) ? extra.adSlotIds.slice() : [],
    listingStatus: normalizeListingStatus(extra.configStatus || extra.listingStatus || 'published'),
    configStatus: normalizeListingStatus(extra.configStatus || extra.listingStatus || 'published'),
    auditStatus: extra.auditStatus || 'approved',
    logoPlacementPolicy: Array.isArray(extra.logoPlacementPolicy)
      ? extra.logoPlacementPolicy.slice()
      : (extra.coBranded ? defaultLogoPlacement(extra.slotType) : []),
    nft: extra.nftStatus ? { status: extra.nftStatus, tradable: false } : null,
  };
}

export function createAppearanceCatalog(defaults, overrides = []) {
  const byId = new Map(defaults.map((item) => [item.id, { ...item }]));
  for (const item of overrides) {
    if (!item?.id || !byId.has(item.id)) continue;
    const current = byId.get(item.id);
    byId.set(item.id, {
      ...current,
      enabled: item.enabled !== false,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 24) : current.name,
      summary: typeof item.summary === 'string' && item.summary.trim()
        ? item.summary.trim().slice(0, 48)
        : current.summary,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : current.sort,
      category: cleanText(item.category, current.category, 16),
      rarity: cleanEnum(item.rarity, current.rarity, ['common', 'uncommon', 'rare', 'epic', 'legendary']),
      source: cleanText(item.source, current.source, 32),
      limited: item.limited == null ? current.limited : Boolean(item.limited),
      coBranded: item.coBranded == null ? current.coBranded : Boolean(item.coBranded),
      adLogoId: cleanText(item.adLogoId, current.adLogoId, 48, true),
      surface: cleanEnum(item.surface, current.surface, ['lobby', 'table', 'avatar', 'settlement', 'lobby-table']),
      slotType: cleanEnum(item.slotType, current.slotType, ['table_skin', 'card_back', 'card_front', 'avatar_frame', 'character_costume']),
      previewUrl: cleanText(item.previewUrl, current.previewUrl, 256, true),
      adSlotIds: Array.isArray(item.adSlotIds)
        ? item.adSlotIds.map((id) => String(id).slice(0, 64)).filter(Boolean)
        : current.adSlotIds || [],
      listingStatus: normalizeListingStatus(item.configStatus || item.listingStatus || current.listingStatus),
      configStatus: normalizeListingStatus(item.configStatus || item.listingStatus || current.configStatus || current.listingStatus),
      auditStatus: cleanEnum(item.auditStatus, current.auditStatus, ['approved', 'pending', 'rejected']),
      logoPlacementPolicy: sanitizeLogoPlacement(item.logoPlacementPolicy, current.logoPlacementPolicy, current.slotType),
      nft: item.nft || current.nft || null,
    });
  }
  return new Map([...byId.entries()].sort((a, b) => a[1].sort - b[1].sort));
}

export function publicAppearance(item) {
  return {
    id: item.id,
    name: item.name,
    group: item.group,
    enabled: Boolean(item.enabled),
    sort: item.sort,
    summary: item.summary || '',
    category: item.category || item.group,
    rarity: item.rarity || 'common',
    source: item.source || '内部配置',
    limited: Boolean(item.limited),
    coBranded: Boolean(item.coBranded),
    adLogoId: item.adLogoId || null,
    surface: item.surface || 'lobby',
    slotType: item.slotType || 'table_skin',
    previewUrl: item.previewUrl || null,
    adSlotIds: Array.isArray(item.adSlotIds) ? item.adSlotIds.slice() : [],
    listingStatus: item.listingStatus || 'published',
    configStatus: item.configStatus || item.listingStatus || 'published',
    auditStatus: item.auditStatus || 'approved',
    logoPlacementPolicy: Array.isArray(item.logoPlacementPolicy) ? item.logoPlacementPolicy.slice() : [],
    nft: item.nft || null,
  };
}

export function upsertAppearanceItem(map, itemId, body) {
  if (!map.has(itemId)) return { ok: false, reason: 'unknown_item' };
  const current = map.get(itemId);
  const next = {
    ...current,
    enabled: body.enabled !== false,
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 24) : current.name,
    summary: typeof body.summary === 'string' && body.summary.trim()
      ? body.summary.trim().slice(0, 48)
      : current.summary,
    sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : current.sort,
    category: cleanText(body.category, current.category, 16),
    rarity: cleanEnum(body.rarity, current.rarity, ['common', 'uncommon', 'rare', 'epic', 'legendary']),
    source: cleanText(body.source, current.source, 32),
    limited: body.limited == null ? current.limited : Boolean(body.limited),
    coBranded: body.coBranded == null ? current.coBranded : Boolean(body.coBranded),
    adLogoId: cleanText(body.adLogoId, current.adLogoId, 48, true),
    surface: cleanEnum(body.surface, current.surface, ['lobby', 'table', 'avatar', 'settlement', 'lobby-table']),
    slotType: cleanEnum(body.slotType, current.slotType, ['table_skin', 'card_back', 'card_front', 'avatar_frame', 'character_costume']),
    previewUrl: cleanText(body.previewUrl, current.previewUrl, 256, true),
    adSlotIds: Array.isArray(body.adSlotIds)
      ? body.adSlotIds.map((id) => String(id).slice(0, 64)).filter(Boolean)
      : current.adSlotIds || [],
    listingStatus: normalizeListingStatus(body.configStatus || body.listingStatus || current.listingStatus),
    configStatus: normalizeListingStatus(body.configStatus || body.listingStatus || current.configStatus || current.listingStatus),
    auditStatus: cleanEnum(body.auditStatus, current.auditStatus, ['approved', 'pending', 'rejected']),
    logoPlacementPolicy: sanitizeLogoPlacement(body.logoPlacementPolicy, current.logoPlacementPolicy, current.slotType),
    nft: body.nft || current.nft || null,
  };
  map.set(itemId, next);
  return { ok: true, item: publicAppearance(next) };
}

function cleanText(value, fallback, max, allowEmpty = false) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().slice(0, max);
  if (!text && !allowEmpty) return fallback;
  return text || null;
}

function cleanEnum(value, fallback, allowed) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeListingStatus(value) {
  const aliases = {
    unpublished: 'archived',
    scheduled: 'reviewing',
    pending: 'reviewing',
    approved: 'published',
  };
  const raw = aliases[String(value || '').trim()] || String(value || '').trim();
  return ['draft', 'reviewing', 'published', 'archived'].includes(raw) ? raw : 'published';
}

function defaultLogoPlacement(slotType) {
  if (slotType === 'card_back') return ['card_back_center'];
  if (slotType === 'table_skin') return ['table_corner'];
  if (slotType === 'avatar_frame' || slotType === 'character_costume') return ['chest_badge', 'sleeve_badge'];
  return [];
}

function sanitizeLogoPlacement(value, fallback, slotType) {
  if (!Array.isArray(value)) return Array.isArray(fallback) ? fallback.slice() : defaultLogoPlacement(slotType);
  const allowed = new Set(['chest_badge', 'sleeve_badge', 'table_corner', 'card_back_center']);
  return value.map((item) => String(item)).filter((item) => allowed.has(item));
}
