export const EQUIPMENT_SLOTS = Object.freeze([
  'top',
  'bottom',
  'shoes',
  'headwear',
  'glasses',
  'accessory',
  'hair',
  'face',
  'earrings',
  'necklace',
  'watch',
  'hand',
  'back',
  'full_body',
  'special',
  'effect',
  'table_skin',
  'card_back',
  'avatar_frame',
]);

export const OVERLAY_SLOTS = Object.freeze([
  'headwear',
  'glasses',
  'earrings',
  'necklace',
  'watch',
  'accessory',
]);

export const ACTIVE_EQUIPMENT_SLOTS = Object.freeze([
  'headwear',
  'glasses',
  'earrings',
  'accessory',
]);

/** 大厅皮肤 id → 衣服样式 id，人物立绘与牌桌皮肤可互配 */
export const THEME_CLOTHING_MAP = Object.freeze({
  'classic-green': 'cloth_felt_green',
  'dark-gold': 'cloth_night_gold',
  'chinese-red': 'cloth_tea_red',
  'cyber-neon': 'cloth_neon',
  'ink-blue': 'cloth_ink_blue',
  'sunset-amber': 'cloth_amber',
});

export const REQUIRED_EQUIPMENT_SLOTS = Object.freeze(['top', 'bottom', 'shoes']);

export const DEFAULT_EQUIPMENT = Object.freeze({
  top: 'default_top',
  bottom: 'default_bottom',
  shoes: 'default_shoes',
  headwear: null,
  glasses: null,
  accessory: null,
  hair: null,
  face: null,
  earrings: null,
  necklace: null,
  watch: null,
  hand: null,
  back: null,
  full_body: null,
  special: null,
  effect: null,
  table_skin: 'table_classic_green',
  card_back: 'cardback_classic_green',
  avatar_frame: 'frame_default',
});

export const AVATAR_LAYER_ORDER = Object.freeze([
  'base',
  'bottom',
  'shoes',
  'top',
  'full_body',
  'hair',
  'headwear',
  'glasses',
  'earrings',
  'necklace',
  'watch',
  'hand',
  'back',
  'accessory',
  'special',
  'effect',
]);

export const BASE_AVATARS = Object.freeze([
  {
    id: 'base_male_hero',
    name: '西装绅士',
    gender: 'male',
    asset: '/public/characters/m-ea-suit.png',
    thumbnail: '/public/characters/m-ea-suit.png',
  },
  {
    id: 'base_female_qipao',
    name: '红韵旗袍',
    gender: 'female',
    asset: '/public/characters/f-ea-red-qipao.png',
    thumbnail: '/public/characters/f-ea-red-qipao.png',
  },
]);

export const DEFAULT_BASE_AVATAR_ID = 'base_male_hero';

export const SKIN_CATEGORIES = Object.freeze([
  { id: 'normal', label: '普通' },
  { id: 'season', label: '赛季' },
  { id: 'event', label: '活动' },
  { id: 'co_brand', label: '广告联名' },
  { id: 'chain_memorial', label: '链游纪念' },
]);

export const SKIN_EQUIPMENT_SLOTS = Object.freeze(['table_skin', 'card_back', 'avatar_frame']);

export const AVATAR_ITEMS = Object.freeze([
  item('default_top', '默认上衣', 'top', 'common', '/public/assets/avatar/top/default_top.svg', true, { source: 'default' }),
  item('top_black', '黑金上衣', 'top', 'uncommon', '/public/assets/avatar/top/top_black.svg'),
  item('top_white', '暖白衬衫', 'top', 'uncommon', '/public/assets/avatar/top/top_white.svg'),
  item('top_suit', '绅士西装', 'top', 'rare', '/public/assets/avatar/top/top_suit.svg', false, { collection: 'gentleman' }),
  item('top_casual', '休闲夹克', 'top', 'common', '/public/assets/avatar/top/top_casual.svg', false, { collection: 'casual' }),

  item('default_bottom', '默认下装', 'bottom', 'common', '/public/assets/avatar/bottom/default_bottom.svg', true, { source: 'default' }),
  item('bottom_jeans', '深色牛仔裤', 'bottom', 'common', '/public/assets/avatar/bottom/bottom_jeans.svg'),
  item('bottom_black', '黑色长裤', 'bottom', 'uncommon', '/public/assets/avatar/bottom/bottom_black.svg'),
  item('bottom_suit', '西装长裤', 'bottom', 'rare', '/public/assets/avatar/bottom/bottom_suit.svg', false, { collection: 'gentleman' }),

  item('default_shoes', '默认皮鞋', 'shoes', 'common', '/public/assets/avatar/shoes/default_shoes.svg', true, { source: 'default' }),
  item('shoes_sneakers', '白色球鞋', 'shoes', 'common', '/public/assets/avatar/shoes/shoes_sneakers.svg'),
  item('shoes_leather', '绅士皮鞋', 'shoes', 'rare', '/public/assets/avatar/shoes/shoes_leather.svg', false, { collection: 'gentleman' }),

  item('hat_cap', '俱乐部棒球帽', 'headwear', 'common', '/public/assets/avatar/headwear/hat_cap.svg'),
  item('hat_gentleman', '绅士礼帽', 'headwear', 'rare', '/public/assets/avatar/headwear/hat_gentleman.svg', false, { exclusiveGroup: ['hair'], collection: 'gentleman' }),

  item('glasses_black', '黑框眼镜', 'glasses', 'uncommon', '/public/assets/avatar/glasses/glasses_black.svg'),
  item('glasses_round', '圆框眼镜', 'glasses', 'uncommon', '/public/assets/avatar/glasses/glasses_round.svg'),

  item('watch_classic', '经典腕表', 'accessory', 'rare', '/public/assets/avatar/accessory/watch_classic.svg', false, { tags: ['watch'] }),
  item('necklace_simple', '简约项链', 'accessory', 'uncommon', '/public/assets/avatar/accessory/necklace_simple.svg', false, { tags: ['necklace'] }),

  item('full_body_dress', '整套晚礼服', 'full_body', 'epic', '/public/assets/avatar/full_body/full_body_dress.svg', false, {
    exclusiveGroup: ['top', 'bottom'],
    limited: false,
    collection: 'formal',
    overlay: false,
  }),

  item('cloth_felt_green', '翠绿毡衣', 'full_body', 'common', '/public/assets/avatar/styles/cloth_felt_green.svg', false, clothingStyle({
    dyeColor: '#1f7a56',
    themeId: 'classic-green',
    preferOutfit: { female: 'black_dress', male: 'casual', animal: 'violet' },
  })),
  item('cloth_night_gold', '暗金夜宴', 'full_body', 'rare', '/public/assets/avatar/styles/cloth_night_gold.svg', false, clothingStyle({
    dyeColor: '#c5a45c',
    themeId: 'dark-gold',
    preferOutfit: { female: 'gold_dress', male: 'gold_dress' },
  })),
  item('cloth_tea_red', '绛红唐装', 'full_body', 'rare', '/public/assets/avatar/styles/cloth_tea_red.svg', false, clothingStyle({
    dyeColor: '#b83a3a',
    themeId: 'chinese-red',
    preferOutfit: { female: 'red_dress', male: 'gold_dress' },
  })),
  item('cloth_neon', '霓虹电玩', 'full_body', 'uncommon', '/public/assets/avatar/styles/cloth_neon.svg', false, clothingStyle({
    dyeColor: '#2ee6c5',
    themeId: 'cyber-neon',
    preferOutfit: { female: 'black_dress', male: 'casual' },
  })),
  item('cloth_ink_blue', '墨蓝长衫', 'full_body', 'uncommon', '/public/assets/avatar/styles/cloth_ink_blue.svg', false, clothingStyle({
    dyeColor: '#3d5a9a',
    themeId: 'ink-blue',
    preferOutfit: { female: 'purple_dress', male: 'casual' },
  })),
  item('cloth_amber', '暮色琥珀', 'full_body', 'uncommon', '/public/assets/avatar/styles/cloth_amber.svg', false, clothingStyle({
    dyeColor: '#e08a3c',
    themeId: 'sunset-amber',
    preferOutfit: { female: 'gold_dress', male: 'casual' },
  })),
  item('cloth_silk_white', '丝绸白衫', 'full_body', 'common', '/public/assets/avatar/styles/cloth_silk_white.svg', false, clothingStyle({
    dyeColor: '#f3efe6',
    preferOutfit: { female: 'office', male: 'casual' },
  })),
  item('cloth_rose_gown', '玫瑰红裙', 'full_body', 'rare', '/public/assets/avatar/styles/cloth_rose_gown.svg', false, clothingStyle({
    dyeColor: '#c45b7a',
    preferOutfit: { female: 'red_dress', male: 'casual' },
    gender: 'female',
  })),
  item('cloth_ink_black', '玄青劲装', 'full_body', 'uncommon', '/public/assets/avatar/styles/cloth_ink_black.svg', false, clothingStyle({
    dyeColor: '#1c2430',
    preferOutfit: { female: 'black_dress', male: 'casual' },
  })),
  item('cloth_gold_line', '金线礼服', 'full_body', 'epic', '/public/assets/avatar/styles/cloth_gold_line.svg', false, clothingStyle({
    dyeColor: '#d4b15a',
    preferOutfit: { female: 'gold_dress', male: 'gold_dress' },
  })),
  item('cloth_mint', '薄荷清凉', 'full_body', 'common', '/public/assets/avatar/styles/cloth_mint.svg', false, clothingStyle({
    dyeColor: '#5ecf9a',
  })),
  item('cloth_grape', '葡萄紫纱', 'full_body', 'uncommon', '/public/assets/avatar/styles/cloth_grape.svg', false, clothingStyle({
    dyeColor: '#7b5ea7',
    preferOutfit: { female: 'purple_dress' },
  })),

  item('glasses_sun', '墨镜', 'glasses', 'uncommon', '/public/assets/avatar/glasses/glasses_sun.svg'),
  item('hat_visor', '遮阳帽', 'headwear', 'common', '/public/assets/avatar/headwear/hat_visor.svg'),
  item('hat_hairpin', '金钗发簪', 'headwear', 'rare', '/public/assets/avatar/headwear/hat_hairpin.svg', false, { gender: 'female' }),
  item('acc_bowtie', '金纹领结', 'accessory', 'uncommon', '/public/assets/avatar/accessory/acc_bowtie.svg'),
  item('acc_chain', '金链', 'accessory', 'rare', '/public/assets/avatar/accessory/acc_chain.svg'),
  item('acc_scarf', '丝巾', 'accessory', 'uncommon', '/public/assets/avatar/accessory/acc_scarf.svg'),
  item('acc_flower', '襟花', 'accessory', 'common', '/public/assets/avatar/accessory/acc_flower.svg'),
  item('earrings_pearl', '珍珠耳饰', 'earrings', 'rare', '/public/assets/avatar/earrings/earrings_pearl.svg', false, { gender: 'female' }),

  item('table_classic_green', '翠绿绒桌布', 'table_skin', 'common', '/public/assets/skins/classic-green/room_card.svg', true, skinMeta({
    skinCategory: 'normal',
    source: '基础衣橱',
    themeId: 'classic-green',
    collection: 'table-cloth',
  })),
  item('table_night_gold', '暗金赛季桌布', 'table_skin', 'rare', '/public/assets/avatar/styles/cloth_night_gold.svg', false, skinMeta({
    skinCategory: 'season',
    source: 'S1 赛季',
    limited: true,
    themeId: 'dark-gold',
    collection: 'season-s1',
    season: 'S1',
  })),
  item('table_tea_partner', '茶馆联名桌布', 'table_skin', 'epic', '/public/assets/avatar/styles/cloth_tea_red.svg', false, skinMeta({
    skinCategory: 'co_brand',
    source: '广告联名',
    limited: true,
    coBranded: true,
    adLogoId: 'tea-parlor-partner',
    themeId: 'chinese-red',
    collection: 'co-brand',
  })),
  item('table_chain_memorial', '链游纪念桌布', 'table_skin', 'epic', '/public/assets/avatar/styles/cloth_neon.svg', false, skinMeta({
    skinCategory: 'chain_memorial',
    source: '链游测试纪念',
    limited: true,
    themeId: 'cyber-neon',
    collection: 'chain-memorial',
  })),

  item('cardback_classic_green', '绿毡牌背', 'card_back', 'common', '/public/assets/skins/classic-green/navbar.svg', true, skinMeta({
    skinCategory: 'normal',
    source: '基础衣橱',
    collection: 'card-back',
  })),
  item('cardback_season_gold', '赛季金纹牌背', 'card_back', 'rare', '/public/assets/avatar/styles/cloth_gold_line.svg', false, skinMeta({
    skinCategory: 'season',
    source: 'S1 赛季',
    limited: true,
    collection: 'season-s1',
    season: 'S1',
  })),
  item('cardback_chain_badge', '链游纪念牌背', 'card_back', 'epic', '/public/assets/avatar/styles/cloth_neon.svg', false, skinMeta({
    skinCategory: 'chain_memorial',
    source: '链游测试纪念',
    limited: true,
    collection: 'chain-memorial',
  })),

  item('frame_default', '默认头像框', 'avatar_frame', 'common', '/public/assets/skins/classic-green/gold_coin.svg', true, skinMeta({
    skinCategory: 'normal',
    source: '基础衣橱',
    collection: 'avatar-frame',
  })),
  item('frame_season_gold', '赛季金框', 'avatar_frame', 'rare', '/public/assets/avatar/styles/cloth_night_gold.svg', false, skinMeta({
    skinCategory: 'season',
    source: 'S1 赛季',
    limited: true,
    collection: 'season-s1',
    season: 'S1',
  })),
  item('frame_partner_badge', '联名徽章框', 'avatar_frame', 'epic', '/public/assets/avatar/styles/cloth_tea_red.svg', false, skinMeta({
    skinCategory: 'co_brand',
    source: '广告联名',
    limited: true,
    coBranded: true,
    adLogoId: 'tea-parlor-partner',
    collection: 'co-brand',
  })),
]);

export const AVATAR_OUTFITS = Object.freeze([
  {
    id: 'outfit_casual',
    name: '休闲日常',
    rarity: 'common',
    thumbnail: '/public/assets/avatar/outfits/outfit_casual.svg',
    pieceCount: 3,
    items: {
      top: 'top_casual',
      bottom: 'bottom_jeans',
      shoes: 'shoes_sneakers',
    },
    metadata: { collection: 'casual' },
  },
  {
    id: 'outfit_gentleman',
    name: '皇家绅士',
    rarity: 'rare',
    thumbnail: '/public/assets/avatar/outfits/outfit_gentleman.svg',
    pieceCount: 4,
    items: {
      top: 'top_suit',
      bottom: 'bottom_suit',
      shoes: 'shoes_leather',
      headwear: 'hat_gentleman',
    },
    metadata: { collection: 'gentleman' },
  },
  {
    id: 'outfit_night_gold',
    name: '暗金夜宴套',
    rarity: 'rare',
    thumbnail: '/public/assets/avatar/styles/cloth_night_gold.svg',
    pieceCount: 3,
    items: {
      full_body: 'cloth_night_gold',
      headwear: 'hat_gentleman',
      glasses: 'glasses_black',
    },
    metadata: { collection: 'hall-skin', themeId: 'dark-gold' },
  },
  {
    id: 'outfit_tea_red',
    name: '绛红茶楼套',
    rarity: 'rare',
    thumbnail: '/public/assets/avatar/styles/cloth_tea_red.svg',
    pieceCount: 2,
    items: {
      full_body: 'cloth_tea_red',
      accessory: 'acc_flower',
    },
    metadata: { collection: 'hall-skin', themeId: 'chinese-red' },
  },
  {
    id: 'outfit_neon',
    name: '霓虹电玩套',
    rarity: 'uncommon',
    thumbnail: '/public/assets/avatar/styles/cloth_neon.svg',
    pieceCount: 3,
    items: {
      full_body: 'cloth_neon',
      headwear: 'hat_visor',
      glasses: 'glasses_sun',
    },
    metadata: { collection: 'hall-skin', themeId: 'cyber-neon' },
  },
  {
    id: 'outfit_felt_green',
    name: '翠绿牌桌套',
    rarity: 'common',
    thumbnail: '/public/assets/avatar/styles/cloth_felt_green.svg',
    pieceCount: 2,
    items: {
      full_body: 'cloth_felt_green',
      accessory: 'acc_bowtie',
    },
    metadata: { collection: 'hall-skin', themeId: 'classic-green' },
  },
]);

export const DEV_DEFAULT_INVENTORY = Object.freeze([
  'default_top',
  'default_bottom',
  'default_shoes',
  'top_black',
  'top_white',
  'top_suit',
  'top_casual',
  'bottom_jeans',
  'bottom_black',
  'bottom_suit',
  'shoes_sneakers',
  'shoes_leather',
  'hat_cap',
  'hat_gentleman',
  'glasses_black',
  'glasses_round',
  'watch_classic',
  'necklace_simple',
  'full_body_dress',
  'cloth_felt_green',
  'cloth_night_gold',
  'cloth_tea_red',
  'cloth_neon',
  'cloth_ink_blue',
  'cloth_amber',
  'cloth_silk_white',
  'cloth_rose_gown',
  'cloth_ink_black',
  'cloth_gold_line',
  'cloth_mint',
  'cloth_grape',
  'glasses_sun',
  'hat_visor',
  'hat_hairpin',
  'acc_bowtie',
  'acc_chain',
  'acc_scarf',
  'acc_flower',
  'earrings_pearl',
  'table_classic_green',
  'table_night_gold',
  'table_tea_partner',
  'table_chain_memorial',
  'cardback_classic_green',
  'cardback_season_gold',
  'cardback_chain_badge',
  'frame_default',
  'frame_season_gold',
  'frame_partner_badge',
]);

function skinMeta(extra = {}) {
  return {
    skinCategory: extra.skinCategory || 'normal',
    source: extra.source || '基础衣橱',
    limited: Boolean(extra.limited),
    coBranded: Boolean(extra.coBranded),
    adLogoId: extra.adLogoId || null,
    collection: extra.collection || 'cosmetic-skin',
    season: extra.season || null,
    themeId: extra.themeId || null,
    tradable: false,
    metadata: {
      displayType: 'cosmetic-skin',
      slotType: extra.slotType || null,
    },
  };
}

function clothingStyle(extra = {}) {
  return {
    applyMode: extra.applyMode || 'dye',
    dyeColor: extra.dyeColor || '#c9a227',
    preferOutfit: extra.preferOutfit || {},
    themeId: extra.themeId || null,
    overlay: false,
    exclusiveGroup: extra.exclusiveGroup || ['top', 'bottom'],
    collection: extra.collection || 'clothing-style',
    gender: extra.gender || 'unisex',
  };
}

function item(id, name, category, rarity, asset, isDefault = false, extra = {}) {
  const overlayDefault = OVERLAY_SLOTS.includes(category);
  return Object.freeze({
    id,
    name,
    type: 'item',
    category,
    rarity,
    asset,
    thumbnail: extra.thumbnail || asset,
    default: Boolean(isDefault),
    exclusiveGroup: extra.exclusiveGroup || [],
    gender: extra.gender || 'unisex',
    tags: extra.tags || [],
    price: extra.price ?? null,
    currency: extra.currency ?? null,
    source: extra.source || 'seed',
    limited: Boolean(extra.limited || false),
    tradable: Boolean(extra.tradable || false),
    vipLevel: extra.vipLevel ?? null,
    eventId: extra.eventId || null,
    startTime: extra.startTime || null,
    endTime: extra.endTime || null,
    collection: extra.collection || null,
    season: extra.season || null,
    skinCategory: extra.skinCategory || null,
    coBranded: Boolean(extra.coBranded || false),
    adLogoId: extra.adLogoId || null,
    unlockCondition: extra.unlockCondition || null,
    overlay: extra.overlay ?? overlayDefault,
    applyMode: extra.applyMode || (overlayDefault ? 'layer' : null),
    dyeColor: extra.dyeColor || null,
    preferOutfit: extra.preferOutfit || {},
    themeId: extra.themeId || null,
    metadata: extra.metadata || {},
    createdAt: extra.createdAt || '2026-08-21T00:00:00.000Z',
    updatedAt: extra.updatedAt || '2026-08-21T00:00:00.000Z',
  });
}

export function isClothingStyleItem(item) {
  return Boolean(item && item.category === 'full_body' && item.applyMode && item.applyMode !== 'layer');
}

export function listClothingStyles(catalog = AVATAR_ITEMS) {
  return catalog.filter(isClothingStyleItem);
}

export function listOverlayItems(catalog = AVATAR_ITEMS) {
  return catalog.filter((item) => item.overlay && OVERLAY_SLOTS.includes(item.category));
}

export function isSkinItem(item) {
  return Boolean(item && SKIN_EQUIPMENT_SLOTS.includes(item.category));
}

export function listSkinItems(catalog = AVATAR_ITEMS, slot = null) {
  return catalog.filter((item) => isSkinItem(item) && (!slot || item.category === slot));
}

export function skinCategoryLabel(category) {
  return SKIN_CATEGORIES.find((item) => item.id === category)?.label || '普通';
}

export function clothingIdForTheme(themeId) {
  return THEME_CLOTHING_MAP[themeId] || null;
}

export function themeIdForClothing(itemId) {
  const hit = Object.entries(THEME_CLOTHING_MAP).find(([, id]) => id === itemId);
  return hit ? hit[0] : null;
}
