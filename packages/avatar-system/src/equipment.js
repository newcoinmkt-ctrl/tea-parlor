import {
  AVATAR_ITEMS,
  AVATAR_LAYER_ORDER,
  DEFAULT_BASE_AVATAR_ID,
  DEFAULT_EQUIPMENT,
  EQUIPMENT_SLOTS,
  REQUIRED_EQUIPMENT_SLOTS,
} from './catalog.js';

export function cloneEquipment(equipment = DEFAULT_EQUIPMENT) {
  return normalizeEquipment({ ...equipment });
}

export function initializeDefaultAvatar(options = {}) {
  return {
    baseAvatarId: options.baseAvatarId || DEFAULT_BASE_AVATAR_ID,
    equipment: cloneEquipment(options.equipment || DEFAULT_EQUIPMENT),
  };
}

export function normalizeEquipment(equipment = {}) {
  const result = {};
  for (const slot of EQUIPMENT_SLOTS) {
    result[slot] = equipment[slot] ?? null;
  }
  for (const slot of REQUIRED_EQUIPMENT_SLOTS) {
    if (!result[slot]) result[slot] = DEFAULT_EQUIPMENT[slot];
  }
  return result;
}

export function equipItem(equipment, itemId, catalog = AVATAR_ITEMS) {
  const item = findItem(catalog, itemId);
  if (!item) return { ok: false, reason: 'invalid_item' };
  const next = normalizeEquipment(equipment);
  next[item.category] = item.id;
  return { ok: true, equipment: resolveEquipmentConflicts(next, catalog), item };
}

export function unequipItem(equipment, slot) {
  if (!EQUIPMENT_SLOTS.includes(slot)) return { ok: false, reason: 'invalid_slot' };
  const next = normalizeEquipment(equipment);
  next[slot] = REQUIRED_EQUIPMENT_SLOTS.includes(slot) ? DEFAULT_EQUIPMENT[slot] : null;
  return { ok: true, equipment: normalizeEquipment(next) };
}

export function applyOutfit(equipment, outfit, catalog = AVATAR_ITEMS) {
  if (!outfit?.items || typeof outfit.items !== 'object') return { ok: false, reason: 'invalid_outfit' };
  let next = normalizeEquipment(equipment);
  for (const [slot, itemId] of Object.entries(outfit.items)) {
    if (!EQUIPMENT_SLOTS.includes(slot)) return { ok: false, reason: 'invalid_slot' };
    const item = findItem(catalog, itemId);
    if (!item) return { ok: false, reason: 'invalid_item' };
    if (item.category !== slot) return { ok: false, reason: 'slot_mismatch' };
    next[slot] = item.id;
    next = resolveEquipmentConflicts(next, catalog);
  }
  return { ok: true, equipment: normalizeEquipment(next) };
}

export function resetToDefault() {
  return cloneEquipment(DEFAULT_EQUIPMENT);
}

export function cancelPreview(savedEquipment) {
  return cloneEquipment(savedEquipment);
}

export function saveEquipment(previewEquipment, options = {}) {
  const validation = validateEquipment(previewEquipment, options);
  if (!validation.ok) return validation;
  return { ok: true, savedEquipment: cloneEquipment(validation.equipment) };
}

export function isItemOwned(inventory, itemId) {
  return normalizeInventoryIds(inventory).has(itemId);
}

export function getEquippedItem(equipment, slot, catalog = AVATAR_ITEMS) {
  const itemId = normalizeEquipment(equipment)[slot];
  return itemId ? findItem(catalog, itemId) : null;
}

export function resolveEquipmentConflicts(equipment, catalog = AVATAR_ITEMS) {
  const next = normalizeEquipment(equipment);
  const byId = new Map(catalog.map((item) => [item.id, item]));
  for (const slot of AVATAR_LAYER_ORDER) {
    if (slot === 'base') continue;
    const item = byId.get(next[slot]);
    if (!item?.exclusiveGroup?.length) continue;
    for (const conflictedSlot of item.exclusiveGroup) {
      if (!EQUIPMENT_SLOTS.includes(conflictedSlot)) continue;
      next[conflictedSlot] = REQUIRED_EQUIPMENT_SLOTS.includes(conflictedSlot)
        ? DEFAULT_EQUIPMENT[conflictedSlot]
        : null;
    }
  }
  return normalizeEquipment(next);
}

export function validateEquipment(equipment, options = {}) {
  const catalog = options.catalog || AVATAR_ITEMS;
  const inventory = normalizeInventoryIds(options.inventory || catalog.filter((item) => item.default).map((item) => item.id));
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const next = resolveEquipmentConflicts(normalizeEquipment(equipment), catalog);

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = next[slot];
    if (!itemId) continue;
    const item = byId.get(itemId);
    if (!item) return { ok: false, reason: 'invalid_item', slot, itemId };
    if (item.category !== slot) return { ok: false, reason: 'slot_mismatch', slot, itemId };
    if (!inventory.has(itemId)) return { ok: false, reason: 'item_not_owned', slot, itemId };
  }

  for (const slot of REQUIRED_EQUIPMENT_SLOTS) {
    const itemId = next[slot];
    if (!itemId) return { ok: false, reason: 'required_slot_missing', slot };
    const item = byId.get(itemId);
    if (!item || item.category !== slot) return { ok: false, reason: 'required_default_invalid', slot, itemId };
  }

  return { ok: true, equipment: next };
}

export function buildAvatarLayers({ baseAvatar, equipment, catalog = AVATAR_ITEMS }) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const normalized = normalizeEquipment(equipment);
  const layers = [];
  if (baseAvatar) {
    layers.push({
      slot: 'base',
      id: baseAvatar.id,
      name: baseAvatar.name,
      asset: baseAvatar.asset,
      thumbnail: baseAvatar.thumbnail || baseAvatar.asset,
      zIndex: 0,
    });
  }
  for (const slot of AVATAR_LAYER_ORDER) {
    if (slot === 'base') continue;
    const item = byId.get(normalized[slot]);
    if (!item) continue;
    layers.push({
      slot,
      id: item.id,
      name: item.name,
      asset: item.asset,
      thumbnail: item.thumbnail,
      rarity: item.rarity,
      zIndex: AVATAR_LAYER_ORDER.indexOf(slot),
    });
  }
  return layers;
}

export function getAvatarAsset(itemOrLayer, fallback = '') {
  return itemOrLayer?.asset || itemOrLayer?.thumbnail || fallback;
}

export function normalizeInventoryIds(inventory) {
  if (inventory instanceof Set) return new Set(inventory);
  if (!Array.isArray(inventory)) return new Set();
  return new Set(inventory.map((entry) => typeof entry === 'string' ? entry : entry?.itemId || entry?.id).filter(Boolean));
}

function findItem(catalog, itemId) {
  return catalog.find((item) => item.id === itemId) || null;
}
