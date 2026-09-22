/**
 * play9ui2c — Guandan 4-seat yard shell
 * Keep in sync with index.html ?v= and health payload.
 */
export const CACHE_STAMP = 'play9ui2c';
export const BUILD_VERSION = 'play9ui2c';
export const BUILD_SERVICE = 'web-lobby';

export function buildStampPayload(extra = {}) {
  return {
    ok: true,
    service: BUILD_SERVICE,
    version: BUILD_VERSION,
    cache: CACHE_STAMP,
    ...extra,
  };
}

export function formatLobbyVersionLabel({ version = BUILD_VERSION, cache = CACHE_STAMP } = {}) {
  return `茶馆 ${version} · cache ${cache}`;
}
