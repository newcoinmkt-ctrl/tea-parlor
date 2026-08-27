import {
  AVATAR_ITEMS,
  OVERLAY_SLOTS,
  clothingIdForTheme,
  isClothingStyleItem,
  themeIdForClothing,
} from './catalog.js';
import { getEquippedItem, normalizeEquipment } from './equipment.js';

export function findCatalogItem(itemId, catalog = AVATAR_ITEMS) {
  return catalog.find((item) => item.id === itemId) || null;
}

export function isOverlaySlot(slot) {
  return OVERLAY_SLOTS.includes(slot);
}

export function listEquippedOverlays(equipment, catalog = AVATAR_ITEMS) {
  const normalized = normalizeEquipment(equipment);
  const layers = [];
  for (const slot of OVERLAY_SLOTS) {
    const item = getEquippedItem(normalized, slot, catalog);
    if (!item || item.overlay === false) continue;
    layers.push({
      slot,
      id: item.id,
      name: item.name,
      asset: item.asset,
      thumbnail: item.thumbnail,
      zIndex: OVERLAY_SLOTS.indexOf(slot) + 1,
    });
  }
  return layers;
}

/**
 * 衣服样式如何作用在「原来的人物立绘」上：
 * - 若该人物有专属换装图，优先换装（同一张脸）
 * - 否则按样式色相染色（不改肤色）
 */
export function resolveClothingStyle(itemOrId, character = {}, catalog = AVATAR_ITEMS) {
  const item = typeof itemOrId === 'string' ? findCatalogItem(itemOrId, catalog) : itemOrId;
  if (!isClothingStyleItem(item)) return { ok: false, reason: 'not_clothing_style' };

  const kind = character.kind === 'female'
    ? 'female'
    : character.kind === 'animal'
      ? 'animal'
      : 'male';
  const prefer = item.preferOutfit?.[kind] || item.preferOutfit?.unisex || null;
  const hasNamedOutfit = Boolean(prefer && character.costumes?.[prefer]);
  const matchesDefault = Boolean(prefer && character.defaultOutfit === prefer);
  const hasExclusive = hasNamedOutfit || matchesDefault;
  const costumeId = hasNamedOutfit ? prefer : hasExclusive ? 'default' : item.id;

  return {
    ok: true,
    item,
    mode: hasExclusive ? 'outfit' : 'dye',
    costumeId,
    dyeColor: item.dyeColor,
    themeId: item.themeId || themeIdForClothing(item.id),
    lastOutfitId: hasExclusive ? costumeId : null,
  };
}

export function resolveAppearance({
  character = {},
  costumeId = 'default',
  lastOutfitId = null,
  equipment = {},
  catalog = AVATAR_ITEMS,
} = {}) {
  const styleItem = getEquippedItem(equipment, 'full_body', catalog);
  const style = isClothingStyleItem(styleItem)
    ? resolveClothingStyle(styleItem, character, catalog)
    : null;
  const costumeFromStyle = style?.ok ? style.costumeId : costumeId;
  const dyeColor = style?.ok && style.mode === 'dye' ? style.dyeColor : null;

  return {
    characterId: character.id || null,
    costumeId: costumeFromStyle || 'default',
    lastOutfitId: style?.lastOutfitId || lastOutfitId || null,
    dyeColor,
    clothingStyleId: style?.ok ? style.item.id : null,
    themeId: style?.themeId || null,
    overlays: listEquippedOverlays(equipment, catalog),
  };
}

export function applyThemeToEquipment(equipment, themeId, catalog = AVATAR_ITEMS) {
  const clothingId = clothingIdForTheme(themeId);
  if (!clothingId) return { ok: false, reason: 'unknown_theme', equipment: normalizeEquipment(equipment) };
  const item = findCatalogItem(clothingId, catalog);
  if (!item) return { ok: false, reason: 'unknown_item', equipment: normalizeEquipment(equipment) };
  const next = normalizeEquipment(equipment);
  next.full_body = clothingId;
  return { ok: true, equipment: next, item };
}
