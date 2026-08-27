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
/** 桌心、桌沿、牌背、服饰胸口可见；大厅横幅仍关（无对应 DOM） */
function isPlacementEnabled(slot) {
  const id = slot.slotId || '';
  if (slot.surface === 'costume') return true;
  if (/table-center|table-rail|card-back/.test(id)) return true;
  if (/-table-skin$|-card-face$|-card-face-hand$|lobby-/.test(id)) return false;
  if (/^(multi|texas|doudizhu)-(table-skin|card-face)/.test(id)) return false;
  return true;
}

export function defaultBrandPlacements(brand = ACTIVE_BRAND) {
  return GAME_BRAND_SLOTS.map((s) => ({
    slotId: s.slotId,
    surface: s.surface,
    game: s.game,
    label: surfaceLabel(s.surface),
    advertiserName: brand.name,
    copy: brand.copy,
    landingUrl: brand.landingUrl,
    enabled: isPlacementEnabled(s),
    theme: brand.theme,
    short: brand.short,
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
    if (p.slotType) node.dataset.slotType = p.slotType;

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
    const logoUrl = p.logoUrl || p.logo?.url || '';
    if (logoUrl) {
      if (!logoEl) {
        logoEl = document.createElement('img');
        logoEl.setAttribute('data-brand-logo', '');
        logoEl.className = 'brand-logo-img';
        logoEl.alt = '';
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

export async function loadAndApplyBrandPlacements(adsUrl) {
  const fallback = defaultBrandPlacements();
  if (!adsUrl) {
    applyBrandPlacements(fallback);
    return fallback;
  }
  try {
    const res = await fetch(adsUrl, { cache: 'no-store' });
    const payload = await res.json();
    const remote = Array.isArray(payload.placements) ? payload.placements : [];
    const merged = mergeBrandPlacements(fallback, remote.map((p) => ({
      slotId: p.slotId,
      label: p.campaignTitle || p.label,
      advertiserName: p.advertiserName,
      copy: p.copy,
      landingUrl: p.landingUrl,
      enabled: p.enabled,
      surface: p.surface,
      slotType: p.slotType,
      theme: p.theme || p.assetTheme,
      short: p.short,
      logoUrl: resolveAdLogoUrl(p),
      categoryId: p.categoryId || '',
    })));
    applyBrandPlacements(merged);
    return merged;
  } catch {
    applyBrandPlacements(fallback);
    return fallback;
  }
}
