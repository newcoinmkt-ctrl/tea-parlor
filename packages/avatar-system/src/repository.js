import {
  AVATAR_ITEMS,
  AVATAR_OUTFITS,
  DEV_DEFAULT_INVENTORY,
  DEFAULT_BASE_AVATAR_ID,
} from './catalog.js';
import {
  initializeDefaultAvatar,
  normalizeEquipment,
  validateEquipment,
} from './equipment.js';

export class MemoryAvatarRepository {
  constructor(options = {}) {
    this.catalog = options.catalog || AVATAR_ITEMS;
    this.outfits = options.outfits || AVATAR_OUTFITS;
    this.defaultInventory = options.defaultInventory || DEV_DEFAULT_INVENTORY;
    this.users = new Map();
    this.clock = options.clock || (() => new Date().toISOString());
  }

  getCatalog() {
    return this.catalog.map(clone);
  }

  getOutfits() {
    return this.outfits.map(clone);
  }

  ensureUser(userId) {
    assertUserId(userId);
    if (!this.users.has(String(userId))) {
      const initial = initializeDefaultAvatar({ baseAvatarId: DEFAULT_BASE_AVATAR_ID });
      this.users.set(String(userId), {
        userId: String(userId),
        baseAvatarId: initial.baseAvatarId,
        inventory: new Set(this.defaultInventory),
        equipment: normalizeEquipment(initial.equipment),
        presets: [],
        updatedAt: this.clock(),
      });
    }
    return this.users.get(String(userId));
  }

  getInventory(userId) {
    const user = this.ensureUser(userId);
    return [...user.inventory].map((itemId, index) => ({
      id: `${user.userId}:${itemId}`,
      userId: user.userId,
      itemId,
      source: itemId.startsWith('default_') ? 'default' : 'development_seed',
      obtainedAt: user.updatedAt,
      metadata: { order: index },
    }));
  }

  grantItem(userId, itemId, source = 'manual') {
    const user = this.ensureUser(userId);
    user.inventory.add(itemId);
    user.updatedAt = this.clock();
    return this.getInventory(userId).find((entry) => entry.itemId === itemId);
  }

  getEquipment(userId) {
    const user = this.ensureUser(userId);
    return {
      userId: user.userId,
      baseAvatarId: user.baseAvatarId,
      equipment: normalizeEquipment(user.equipment),
      updatedAt: user.updatedAt,
    };
  }

  saveEquipment(userId, equipment, options = {}) {
    const user = this.ensureUser(userId);
    const validation = validateEquipment(equipment, {
      catalog: this.catalog,
      inventory: this.getInventory(userId),
      ...options,
    });
    if (!validation.ok) return validation;
    user.equipment = normalizeEquipment(validation.equipment);
    user.updatedAt = this.clock();
    return { ok: true, ...this.getEquipment(userId) };
  }

  exportSnapshot() {
    return {
      users: [...this.users.values()].map((user) => ({
        userId: user.userId,
        baseAvatarId: user.baseAvatarId,
        inventory: [...user.inventory],
        equipment: normalizeEquipment(user.equipment),
        presets: user.presets.map(clone),
        updatedAt: user.updatedAt,
      })),
    };
  }

  importSnapshot(snapshot) {
    if (!snapshot?.users) return;
    this.users = new Map();
    for (const user of snapshot.users) {
      if (!user?.userId) continue;
      this.users.set(String(user.userId), {
        userId: String(user.userId),
        baseAvatarId: user.baseAvatarId || DEFAULT_BASE_AVATAR_ID,
        inventory: new Set(user.inventory || []),
        equipment: normalizeEquipment(user.equipment),
        presets: Array.isArray(user.presets) ? user.presets.map(clone) : [],
        updatedAt: user.updatedAt || this.clock(),
      });
    }
  }
}

export function createAvatarRepository(options = {}) {
  return new MemoryAvatarRepository(options);
}

function assertUserId(userId) {
  if (!String(userId || '').trim()) throw new Error('user_id_required');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
