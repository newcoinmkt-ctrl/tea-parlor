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
  skin('frame-partner-badge', '联名徽章头像框', '广告联名', 80, '人物头像框预留', { rarity: 'epic', source: '广告联名', limited: true, coBranded: true, adLogoId: 'tea-parlor-partner', surface: 'avatar', slotType: 'avatar_frame' }),
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
      slotType: cleanEnum(item.slotType, current.slotType, ['table_skin', 'card_back', 'avatar_frame', 'character_costume']),
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
    slotType: cleanEnum(body.slotType, current.slotType, ['table_skin', 'card_back', 'avatar_frame', 'character_costume']),
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
