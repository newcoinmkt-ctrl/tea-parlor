/**
 * 统一对局模式：local | colyseus | pinus
 * 推荐联网：Colyseus（房间模型更贴 H5）
 * Pinus 保留兼容；本地人机默认
 */

export const PLAY_MODES = ['local', 'colyseus', 'pinus'];
export const PLAY_MODE_KEY = 'tea-parlor-play-mode';

const FRAMEWORKS = {
  local: { id: 'local', label: '本地人机', endpoint: null },
  colyseus: { id: 'colyseus', label: 'Colyseus 联网', endpoint: 'ws://127.0.0.1:2567' },
  pinus: { id: 'pinus', label: 'Pinus 联网', endpoint: 'ws://127.0.0.1:3010' },
};

export function normalizePlayMode(m) {
  if (m === 'online') return 'colyseus';
  return PLAY_MODES.includes(m) ? m : 'local';
}

export function loadPlayMode() {
  try {
    return normalizePlayMode(localStorage.getItem(PLAY_MODE_KEY) || 'local');
  } catch (_) {
    return 'local';
  }
}

export function savePlayMode(mode) {
  const m = normalizePlayMode(mode);
  try { localStorage.setItem(PLAY_MODE_KEY, m); } catch (_) {}
  return m;
}

export function nextPlayMode(current) {
  const i = PLAY_MODES.indexOf(normalizePlayMode(current));
  return PLAY_MODES[(i + 1) % PLAY_MODES.length];
}

export function playModeLabel(mode) {
  const framework = FRAMEWORKS[normalizePlayMode(mode)] || FRAMEWORKS.local;
  switch (framework.id) {
    case 'colyseus':
    case 'pinus':
      return `${framework.label} · ${framework.endpoint}`;
    default:
      return '本地人机（可切 Colyseus / Pinus）';
  }
}

export function playModeHint(mode) {
  switch (normalizePlayMode(mode)) {
    case 'colyseus':
      return '已切换 Colyseus：请先 npm run colyseus:start（端口 2567），再进斗地主';
    case 'pinus':
      return '已切换 Pinus：请先 npm run pinus:start（端口 3010），再进斗地主';
    default:
      return '已切换本地人机：不依赖游戏服';
  }
}

export function isOnlineMode(mode) {
  const m = normalizePlayMode(mode);
  return m === 'colyseus' || m === 'pinus';
}
