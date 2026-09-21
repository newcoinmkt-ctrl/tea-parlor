/**
 * 游戏内品牌 / 广告位
 * 三类位置：桌面(table) · 牌面(card) · 服饰(costume)
 * 当前默认投放：BTC
 */

/** @typedef {'table'|'card'|'costume'} BrandSurface */

/**
 * @typedef {object} BrandCampaign
 * @property {string} id
 * @property {string} name       展示名 BTC
 * @property {string} short      角标 ₿
 * @property {string} label      位置标签 如 桌面/牌面/服饰
 * @property {string} copy       副文案
 * @property {string} landingUrl
 * @property {string} theme      CSS 主题 class 后缀
 */

/** 当前主投放 */
export const ACTIVE_BRAND = Object.freeze({
  id: 'btc',
  name: 'BTC',
  short: '₿',
  copy: 'Bitcoin',
  landingUrl: 'https://bitcoin.org',
  theme: 'btc',
});

/**
 * 各游戏槽位 → 表面类型
 * 便于远程 adsUrl 覆盖时仍有默认
 */
export const GAME_BRAND_SLOTS = Object.freeze([
  // 斗地主
  { slotId: 'doudizhu-table-skin', surface: 'table', game: 'doudizhu' },
  { slotId: 'doudizhu-table-center', surface: 'table', game: 'doudizhu' },
  { slotId: 'doudizhu-table-rail-left', surface: 'table', game: 'doudizhu' },
  { slotId: 'doudizhu-table-rail-right', surface: 'table', game: 'doudizhu' },
  { slotId: 'doudizhu-card-back', surface: 'card', game: 'doudizhu' },
  { slotId: 'doudizhu-card-face', surface: 'card', game: 'doudizhu' },
  { slotId: 'doudizhu-card-face-hand', surface: 'card', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-seat-0', surface: 'costume', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-seat-1', surface: 'costume', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-seat-2', surface: 'costume', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-left', surface: 'costume', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-right', surface: 'costume', game: 'doudizhu' },
  { slotId: 'doudizhu-costume-self', surface: 'costume', game: 'doudizhu' },
  // 德州
  { slotId: 'texas-table-skin', surface: 'table', game: 'texas' },
  { slotId: 'texas-table-center', surface: 'table', game: 'texas' },
  { slotId: 'texas-card-face', surface: 'card', game: 'texas' },
  { slotId: 'texas-costume-0', surface: 'costume', game: 'texas' },
  { slotId: 'texas-costume-1', surface: 'costume', game: 'texas' },
  { slotId: 'texas-costume-2', surface: 'costume', game: 'texas' },
  // 炸金花 / 麻将 共用 multi 桌
  { slotId: 'multi-table-skin', surface: 'table', game: 'multi' },
  { slotId: 'multi-table-center', surface: 'table', game: 'multi' },
  { slotId: 'multi-card-face', surface: 'card', game: 'multi' },
  { slotId: 'multi-costume-0', surface: 'costume', game: 'multi' },
  { slotId: 'multi-costume-1', surface: 'costume', game: 'multi' },
  { slotId: 'multi-costume-2', surface: 'costume', game: 'multi' },
  { slotId: 'multi-costume-3', surface: 'costume', game: 'multi' },
  // 大厅
  { slotId: 'lobby-top-banner', surface: 'table', game: 'lobby' },
  { slotId: 'lobby-room-strip', surface: 'table', game: 'lobby' },
  { slotId: 'room-card-low', surface: 'table', game: 'lobby' },
  { slotId: 'room-card-classic', surface: 'table', game: 'lobby' },
]);

/**
 * 默认投放列表（全部 BTC）
 * @returns {Array<{slotId:string,label:string,advertiserName:string,copy:string,landingUrl:string,enabled:boolean,surface:string,theme:string}>}
 */
/**
 * play9fin2a — four play surfaces host ad logos (config/placeholder OK):
 * play9fin3b — config source: ?adsUrl / TEA_PARLOR_ADS_URL / TEA_PARLOR_ADS_CONFIG /
 *   static ./public/ads/manifest.json → PLACEHOLDER_AD_LOGO; pointer-events none
 *   skin (table-skin) · card face · table felt (table-center) · clothes (costume)
 * Hall banners stay off (no DOM). Real ad network can override via adsUrl later.
 */
function isPlacementEnabled(slot) {
  const id = slot.slotId || '';
  if (/lobby-/.test(id)) return false;
  if (slot.surface === 'costume') return true;
  if (/table-center|table-rail|table-skin|card-back|card-face/.test(id)) return true;
  return true;
}

/** Builtin placeholder logo for slots until ops/network fills logoUrl */
export const PLACEHOLDER_AD_LOGO = './public/assets/logos/btc.svg';

/** Surfaces that must stay non-interactive in play (never steal hand/button taps) */
export const AD_LOGO_SURFACES = Object.freeze(['skin', 'card', 'felt', 'clothes']);

export function surfaceKind(slotId = '', surface = '') {
  const id = String(slotId);
  if (/table-skin/.test(id) || surface === 'table' && /skin/.test(id)) return 'skin';
  if (/table-center/.test(id)) return 'felt';
  if (/card-face|card-back/.test(id) || surface === 'card') return 'card';
  if (/costume/.test(id) || surface === 'costume') return 'clothes';
  if (surface === 'table') return 'felt';
  return surface || 'table';
}

export function defaultBrandPlacements(brand = ACTIVE_BRAND) {
  return GAME_BRAND_SLOTS.map((s) => ({
    slotId: s.slotId,
    surface: s.surface,
    surfaceKind: surfaceKind(s.slotId, s.surface),
    game: s.game,
    label: surfaceLabel(s.surface),
    advertiserName: brand.name,
    copy: brand.copy,
    landingUrl: brand.landingUrl,
    enabled: isPlacementEnabled(s),
    theme: brand.theme,
    short: brand.short,
    logoUrl: PLACEHOLDER_AD_LOGO,
  }));
}

function surfaceLabel(surface) {
  if (surface === 'table') return '桌面';
  if (surface === 'card') return '牌面';
  if (surface === 'costume') return '服饰';
  return '合作';
}

/** 牌面水印 HTML（正面半透明，不挡点数） */
export function brandCardBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="pc-face-ad brand-watermark brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** 牌背广告：烫金压印风 ₿（居中） */
export function brandCardBackBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="pc-face-ad brand-back-ad brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** mini-card 水印（正面） */
export function brandMiniBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="mini-ad brand-watermark brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** mini 牌背广告 */
export function brandMiniBackBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="mini-ad brand-back-ad brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** 麻将牌水印 */
export function brandTileBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="mj-brand-ad brand-watermark brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** mg-card 正面水印 */
export function brandMgCardBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="mg-brand-ad brand-watermark brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/** mg-card 牌背烫金广告 */
export function brandMgCardBackBadgeHtml(brand = ACTIVE_BRAND) {
  return `<i class="mg-brand-ad brand-back-ad brand-${brand.theme}" aria-hidden="true" title="${brand.name}">${brand.short}</i>`;
}

/**
 * 把投放写入 DOM 上所有 [data-ad-slot]
 * @param {ReturnType<typeof defaultBrandPlacements>} [placements]
 */
export function applyBrandPlacements(placements = defaultBrandPlacements()) {
  const bySlot = new Map(placements.map((p) => [p.slotId, p]));
  for (const node of document.querySelectorAll('[data-ad-slot]')) {
    const slotId = node.getAttribute('data-ad-slot');
    const p = bySlot.get(slotId);
    if (!p || p.enabled === false) {
      node.hidden = true;
      continue;
    }
    node.hidden = false;
    node.classList.add('brand-slot', `brand-${p.theme || 'btc'}`, `brand-surface-${p.surface || 'table'}`);
    node.dataset.brand = p.theme || 'btc';
    node.dataset.surface = p.surface || 'table';
    node.dataset.adSurfaceKind = p.surfaceKind || surfaceKind(slotId, p.surface);
    if (p.slotType) node.dataset.slotType = p.slotType;
    // Decorative in-play: keep href for ops preview but CSS forces pointer-events:none
    node.setAttribute('tabindex', '-1');
    node.setAttribute('aria-hidden', 'true');

    if (node.tagName === 'A' && p.landingUrl) {
      node.href = p.landingUrl;
      node.target = '_blank';
      node.rel = 'noreferrer noopener';
    }

    // 结构化广告卡
    const labelEl = node.querySelector('.ad-label, [data-brand-label]');
    const titleEl = node.querySelector('strong, [data-brand-name]');
    const copyEl = node.querySelector('small, [data-brand-copy]');
    const emEl = node.querySelector('em');

    if (labelEl) labelEl.textContent = p.label || surfaceLabel(p.surface);
    if (titleEl) titleEl.textContent = p.advertiserName || p.short || 'BTC';
    if (copyEl) copyEl.textContent = p.copy || '';
    if (emEl) emEl.textContent = p.advertiserName || p.short || 'BTC';

    let logoEl = node.querySelector('[data-brand-logo]');
    const logoUrl = p.logoUrl || p.logo?.url || PLACEHOLDER_AD_LOGO;
    if (logoUrl) {
      if (!logoEl) {
        logoEl = document.createElement('img');
        logoEl.setAttribute('data-brand-logo', '');
        logoEl.className = 'brand-logo-img';
        logoEl.alt = '';
        // play9fin3b: graceful placeholder fallback if remote/image fails
        logoEl.addEventListener('error', () => {
          if (logoEl.dataset.fallbackApplied) return;
          logoEl.dataset.fallbackApplied = '1';
          logoEl.src = PLACEHOLDER_AD_LOGO;
        });
        node.prepend(logoEl);
      }
      logoEl.src = logoUrl;
      logoEl.hidden = false;
    } else if (logoEl) {
      logoEl.hidden = true;
    }

    // 纯文本节点 / costume-chip 无子结构
    if (!labelEl && !titleEl && !emEl && node.children.length === 0) {
      node.textContent = p.surface === 'table' && slotId.includes('center')
        ? `${p.advertiserName} · ${p.copy || '桌面'}`
        : (p.advertiserName || p.short || 'BTC');
    }

    // costume-chip 只有 em 时已处理；若 chip 自身是文本容器
    if (node.classList.contains('costume-chip') && emEl) {
      emEl.textContent = p.advertiserName || 'BTC';
    }
  }

  // 全局标记，便于 CSS / 调试
  document.documentElement.dataset.tableBrand = placements[0]?.theme || 'btc';
  window.__teaParlorBrand = () => ({ brand: ACTIVE_BRAND, placements });
}

function resolveAdLogoUrl(placement) {
  const remote = placement?.logo?.url;
  if (remote) {
    if (/^https?:\/\//i.test(remote)) return remote;
    try {
      const origin = new URL(placement.opsBase || 'http://127.0.0.1:5190').origin;
      return `${origin}${remote.startsWith('/') ? remote : `/${remote}`}`;
    } catch {
      return remote;
    }
  }
  if (placement?.logoId && /^(eth|btc|tea|triple-bar)$/.test(placement.logoId)) {
    return `./public/assets/logos/${placement.logoId}.svg`;
  }
  return '';
}

/**
 * 合并远程投放（远程优先字段）
 */
export function mergeBrandPlacements(fallback, remote) {
  const map = new Map(fallback.map((p) => [p.slotId, { ...p }]));
  for (const r of remote || []) {
    if (!r?.slotId) continue;
    map.set(r.slotId, { ...map.get(r.slotId), ...r });
  }
  return [...map.values()];
}

/**
 * Normalize a placement row from JSON / env / ops into brand fields.
 * play9fin3b: swappable image+link; empty logo → PLACEHOLDER_AD_LOGO
 */
export function normalizeAdPlacement(p = {}, brand = ACTIVE_BRAND) {
  const logoUrl = p.logoUrl || resolveAdLogoUrl(p) || p.logo?.url || brand.logoUrl || PLACEHOLDER_AD_LOGO;
  return {
    slotId: p.slotId,
    label: p.campaignTitle || p.label || surfaceLabel(p.surface),
    advertiserName: p.advertiserName || brand.name,
    copy: p.copy || brand.copy || '',
    landingUrl: p.landingUrl || brand.landingUrl || '',
    enabled: p.enabled !== false,
    surface: p.surface,
    surfaceKind: p.surfaceKind || surfaceKind(p.slotId, p.surface),
    slotType: p.slotType,
    theme: p.theme || p.assetTheme || brand.theme,
    short: p.short || brand.short,
    logoUrl: logoUrl || PLACEHOLDER_AD_LOGO,
    categoryId: p.categoryId || '',
  };
}

/**
 * play9fin3b — load ads from URL and/or inline config; always graceful fallback.
 * @param {string} [adsUrl]
 * @param {{ inlineConfig?: object|null }} [opts]
 */
export async function loadAndApplyBrandPlacements(adsUrl, opts = {}) {
  const fallback = defaultBrandPlacements();
  const inline = opts?.inlineConfig;
  const preferUrl = !!opts?.preferUrl;

  const applyPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const brand = payload.brand ? { ...ACTIVE_BRAND, ...payload.brand } : ACTIVE_BRAND;
    const remote = Array.isArray(payload.placements) ? payload.placements : [];
    if (!remote.length && !payload.brand) return null;
    const mapped = remote.map((p) => normalizeAdPlacement(p, brand));
    // If only brand override, recolor defaults
    if (!mapped.length && payload.brand) {
      return defaultBrandPlacements(brand).map((row) => ({
        ...row,
        logoUrl: brand.logoUrl || row.logoUrl || PLACEHOLDER_AD_LOGO,
        landingUrl: brand.landingUrl || row.landingUrl,
      }));
    }
    return mergeBrandPlacements(fallback, mapped);
  };

  // preferUrl (?adsUrl): fetch first; else try inline env JSON, then URL/static
  const tryInline = () => {
    if (!inline) return null;
    try { return applyPayload(inline); } catch (_) { return null; }
  };

  if (!preferUrl) {
    const fromInline = tryInline();
    if (fromInline) {
      applyBrandPlacements(fromInline);
      return fromInline;
    }
  }

  if (!adsUrl) {
    const fromInline = tryInline();
    applyBrandPlacements(fromInline || fallback);
    return fromInline || fallback;
  }

  try {
    const res = await fetch(adsUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ads_${res.status}`);
    const payload = await res.json();
    const merged = applyPayload(payload) || fallback;
    applyBrandPlacements(merged);
    return merged;
  } catch {
    const fromInline = tryInline();
    // play9fin3b: graceful placeholder fallback
    applyBrandPlacements(fromInline || fallback);
    return fromInline || fallback;
  }
}
