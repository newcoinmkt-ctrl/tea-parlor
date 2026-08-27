/** 衣服胸标：与人物、大厅皮肤分开配置。 */

export const LOGO_MARKS = Object.freeze([
  { id: 'none', name: '不显示', group: 'empty' },
  { id: 'eth', name: 'ETH', group: 'chain' },
  { id: 'triple-bar', name: '三横杠', group: 'brand' },
  { id: 'btc', name: 'BTC', group: 'chain' },
  { id: 'tea', name: '茶馆', group: 'brand' },
]);

export const DEFAULT_COSTUME_LOGOS = Object.freeze({
  enabled: true,
  leftId: 'eth',
  rightId: 'triple-bar',
  size: 'md',
  placement: 'chest',
  policy: 'costume_patch_not_character_identity',
});

const SIZES = new Set(['sm', 'md', 'lg']);

function isLogoId(id) {
  return id === 'none' || /^[a-z0-9:_-]{2,32}$/.test(String(id || ''));
}

export function normalizeCostumeLogos(raw = {}) {
  const leftId = isLogoId(raw.leftId) ? raw.leftId : DEFAULT_COSTUME_LOGOS.leftId;
  const rightId = isLogoId(raw.rightId) ? raw.rightId : DEFAULT_COSTUME_LOGOS.rightId;
  return {
    enabled: raw.enabled !== false,
    leftId,
    rightId,
    size: SIZES.has(raw.size) ? raw.size : DEFAULT_COSTUME_LOGOS.size,
    placement: 'chest',
    policy: DEFAULT_COSTUME_LOGOS.policy,
  };
}

export function publicCostumeLogos(config) {
  const next = normalizeCostumeLogos(config);
  return {
    ...next,
    marks: LOGO_MARKS.filter((mark) => mark.id !== 'none'),
  };
}
