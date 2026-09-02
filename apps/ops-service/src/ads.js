export const DEFAULT_AD_CATEGORIES = Object.freeze([
  { id: 'exchange', name: '交易所', enabled: true, sort: 10 },
  { id: 'launchpad', name: '发行/观察', enabled: true, sort: 20 },
  { id: 'dex', name: 'DEX', enabled: true, sort: 30 },
  { id: 'platform', name: '平台活动', enabled: true, sort: 40 },
  { id: 'quest', name: '任务赛季', enabled: true, sort: 50 },
  { id: 'costume', name: '服饰冠名', enabled: true, sort: 60 },
  { id: 'other', name: '其他', enabled: true, sort: 90 },
]);

export const BUILTIN_AD_LOGOS = Object.freeze([
  { id: 'eth', name: 'ETH', builtin: true, mime: 'image/svg+xml', type: 'logo', format: 'svg', width: 128, height: 128, auditStatus: 'approved', enabled: true },
  { id: 'btc', name: 'BTC', builtin: true, mime: 'image/svg+xml', type: 'logo', format: 'svg', width: 128, height: 128, auditStatus: 'approved', enabled: true },
  { id: 'tea', name: '茶馆', builtin: true, mime: 'image/svg+xml', type: 'logo', format: 'svg', width: 128, height: 128, auditStatus: 'approved', enabled: true },
  { id: 'triple-bar', name: '三横杠', builtin: true, mime: 'image/svg+xml', type: 'logo', format: 'svg', width: 128, height: 128, auditStatus: 'approved', enabled: true },
]);

export function createAdCategoryMap(overrides = []) {
  const byId = new Map(DEFAULT_AD_CATEGORIES.map((item) => [item.id, { ...item }]));
  for (const item of overrides) {
    if (!item?.id) continue;
    const id = String(item.id).trim().toLowerCase();
    if (!/^[a-z0-9:_-]{2,32}$/.test(id)) continue;
    const current = byId.get(id) || { id, name: id, enabled: true, sort: 100 };
    byId.set(id, {
      ...current,
      name: String(item.name || current.name).trim().slice(0, 24) || id,
      enabled: item.enabled !== false,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : current.sort,
    });
  }
  return new Map([...byId.entries()].sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0])));
}

export function createAdLogoMap(overrides = []) {
  const byId = new Map(BUILTIN_AD_LOGOS.map((item) => [item.id, { ...item }]));
  for (const item of overrides) {
    if (!item?.id || item.builtin) continue;
    const id = String(item.id).trim().toLowerCase();
    if (!/^[a-z0-9:_-]{2,32}$/.test(id)) continue;
    if (byId.has(id) && byId.get(id).builtin) continue;
    byId.set(id, {
      id,
      name: String(item.name || id).trim().slice(0, 24),
      builtin: false,
      mime: String(item.mime || 'image/png').slice(0, 40),
      data: typeof item.data === 'string' ? item.data : '',
      type: item.type === 'image' ? 'image' : 'logo',
      format: String(item.format || mimeToFormat(item.mime)).slice(0, 12),
      width: positiveInt(item.width, 0),
      height: positiveInt(item.height, 0),
      auditStatus: ['approved', 'pending', 'rejected'].includes(item.auditStatus) ? item.auditStatus : 'pending',
      enabled: item.enabled !== false,
    });
  }
  return byId;
}

export function publicLogo(logo, includeData = false) {
  const next = {
    id: logo.id,
    name: logo.name,
    builtin: Boolean(logo.builtin),
    mime: logo.mime || 'image/png',
    type: logo.type || 'logo',
    width: Number(logo.width || 0),
    height: Number(logo.height || 0),
    format: logo.format || mimeToFormat(logo.mime),
    auditStatus: logo.auditStatus || (logo.builtin ? 'approved' : 'pending'),
    enabled: logo.enabled !== false,
    url: logo.builtin ? null : `/public/ad-logos/${logo.id}`,
  };
  if (includeData && logo.data) next.data = logo.data;
  return next;
}

function mimeToFormat(mime = '') {
  if (/svg/i.test(mime)) return 'svg';
  if (/webp/i.test(mime)) return 'webp';
  if (/jpe?g/i.test(mime)) return 'jpeg';
  return 'png';
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
