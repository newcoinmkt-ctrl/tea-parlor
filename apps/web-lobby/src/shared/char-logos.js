/** 衣服胸标。配置来自后台：开关、左右标、大小。贴在衣服区域，不改人设原图。 */

const BUILTIN_LOGO_SRC = {
  eth: './public/assets/logos/eth.svg',
  'triple-bar': './public/assets/logos/triple-bar.svg',
  btc: './public/assets/logos/btc.svg',
  tea: './public/assets/logos/tea.svg',
};

let logoSources = { ...BUILTIN_LOGO_SRC };

const DEFAULT_CONFIG = {
  enabled: true,
  leftId: 'eth',
  rightId: 'triple-bar',
  size: 'md',
  placement: 'chest',
};

let costumeLogoConfig = { ...DEFAULT_CONFIG };

const FIGURE_SELECTOR = [
  '.char-figure',
  '.char-pick-img',
  '.profile-preview-figure img',
  '.bj-seat-img',
  '.costume-swatch.costume-outfit img',
  '[data-texas-seat] img',
  '[data-mg-seat] img',
].join(',');

export function setCostumeLogoConfig(next = {}) {
  costumeLogoConfig = {
    ...DEFAULT_CONFIG,
    ...next,
    enabled: next.enabled !== false,
  };
  logoSources = { ...BUILTIN_LOGO_SRC, ...(next.sources || {}) };
  remountCharLogos();
  return costumeLogoConfig;
}

export function getCostumeLogoConfig() {
  return { ...costumeLogoConfig };
}

function logoTag(id, side) {
  const src = logoSources[id];
  if (!id || id === 'none' || !src) return '';
  return `<img class="char-logo char-logo-${side}" src="${src}" alt="" data-logo-id="${id}">`;
}

function logoHtml() {
  if (!costumeLogoConfig.enabled) return '';
  return (
    `<span class="char-chest-logos is-on-cloth size-${costumeLogoConfig.size || 'md'}" aria-hidden="true">`
    + logoTag(costumeLogoConfig.leftId, 'left')
    + logoTag(costumeLogoConfig.rightId, 'right')
    + '</span>'
  );
}

export function remountCharLogos(root = document) {
  root.querySelectorAll('.char-chest-logos').forEach((node) => node.remove());
  mountCharLogos(root);
}

export function mountCharLogos(root = document) {
  const html = logoHtml();
  if (!html) return;
  root.querySelectorAll(FIGURE_SELECTOR).forEach((img) => {
    const host = img.closest('.char-figure-wrap, .profile-preview-figure, .char-pick, .costume-swatch, .tx-seat, .mg-seat, .bj-seat')
      || img.parentElement;
    if (!host || host.querySelector(':scope > .char-chest-logos')) return;
    host.classList.add('char-logo-host', 'char-logo-on-cloth');
    host.insertAdjacentHTML('beforeend', html);
  });
}
