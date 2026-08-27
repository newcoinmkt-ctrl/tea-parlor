import {
  AVATAR_ITEMS,
  listEquippedOverlays,
  initializeDefaultAvatar,
} from '/vendor/avatar-system/index.js';

const ITEM_BY_ID = new Map(AVATAR_ITEMS.map((item) => [item.id, item]));

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function overlayLayersFrom(avatar) {
  const equipment = avatar?.equipment || initializeDefaultAvatar().equipment;
  return listEquippedOverlays(equipment).map((layer) => {
    const item = ITEM_BY_ID.get(layer.id);
    return {
      ...layer,
      asset: item?.asset || layer.asset,
      name: item?.name || layer.name,
    };
  });
}

export function overlayLayersHtml(layers = []) {
  return layers.map((layer, index) => (
    `<img class="avatar-layer avatar-layer-${escapeHtml(layer.slot)} char-gear-layer" src="${escapeHtml(layer.asset)}" alt="" data-gear-slot="${escapeHtml(layer.slot)}" loading="lazy" decoding="async" style="--layer-index:${index + 1}" />`
  )).join('');
}

/**
 * 人物立绘 + 可交互配饰图层。衣服样式走换装/染色，不覆盖全身 SVG。
 */
export function avatarRendererHtml({
  avatar = initializeDefaultAvatar(),
  baseSrc = '',
  className = '',
  label = '玩家形象',
  size = 'medium',
} = {}) {
  const src = baseSrc || avatar?.baseAsset || '';
  const layers = overlayLayersFrom(avatar);
  return `
    <div class="avatar-renderer avatar-renderer-${escapeHtml(size)} ${escapeHtml(className)}" role="img" aria-label="${escapeHtml(label)}">
      <img class="avatar-layer avatar-layer-base" src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" style="--layer-index:0" />
      ${overlayLayersHtml(layers)}
    </div>
  `;
}

export function mountAvatarRenderer(target, props = {}) {
  if (!target) return;
  target.innerHTML = avatarRendererHtml(props);
}

/** 把配饰叠在原来的人物容器上，不替换立绘 <img> */
export function mountGearOverlays(host, avatar) {
  if (!host) return [];
  const layers = overlayLayersFrom(avatar);
  let box = host.querySelector(':scope > .char-gear-layers');
  if (!box) {
    box = document.createElement('span');
    box.className = 'char-gear-layers';
    box.setAttribute('aria-hidden', 'true');
    host.appendChild(box);
  }
  box.innerHTML = overlayLayersHtml(layers);
  host.classList.toggle('has-gear', layers.length > 0);
  return layers;
}

export function clearGearOverlays(host) {
  host?.querySelectorAll(':scope > .char-gear-layers').forEach((node) => node.remove());
  host?.classList.remove('has-gear');
}
