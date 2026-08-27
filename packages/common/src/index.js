export const RealtimeFrameworkIds = Object.freeze({
  LOCAL: 'local',
  COLYSEUS: 'colyseus',
  PINUS: 'pinus',
});

export const realtimeFrameworks = Object.freeze({
  [RealtimeFrameworkIds.LOCAL]: Object.freeze({
    id: RealtimeFrameworkIds.LOCAL,
    label: '本地人机',
    role: 'offline-default',
    endpoint: null,
    recommended: false,
    canHostAuthoritativeRooms: false,
  }),
  [RealtimeFrameworkIds.COLYSEUS]: Object.freeze({
    id: RealtimeFrameworkIds.COLYSEUS,
    label: 'Colyseus 联网',
    role: 'recommended-h5-room-framework',
    endpoint: 'ws://127.0.0.1:2567',
    recommended: true,
    canHostAuthoritativeRooms: true,
  }),
  [RealtimeFrameworkIds.PINUS]: Object.freeze({
    id: RealtimeFrameworkIds.PINUS,
    label: 'Pinus 联网',
    role: 'compatibility-backend',
    endpoint: 'ws://127.0.0.1:3010',
    recommended: false,
    canHostAuthoritativeRooms: true,
  }),
});

export function normalizeRealtimeFramework(id) {
  if (id === 'online') return RealtimeFrameworkIds.COLYSEUS;
  if (id && realtimeFrameworks[id]) return id;
  return RealtimeFrameworkIds.LOCAL;
}

export function getRealtimeFramework(id) {
  return realtimeFrameworks[normalizeRealtimeFramework(id)];
}

export function getRecommendedRealtimeFramework() {
  return realtimeFrameworks[RealtimeFrameworkIds.COLYSEUS];
}

export function isOnlineRealtimeFramework(id) {
  const framework = getRealtimeFramework(id);
  return framework.id === RealtimeFrameworkIds.COLYSEUS || framework.id === RealtimeFrameworkIds.PINUS;
}
