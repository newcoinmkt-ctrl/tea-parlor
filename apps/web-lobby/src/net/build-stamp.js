/**
 * play9gd1b — Guandan playable minimal rules (server-authoritative)
 * Keep in sync with index.html ?v= and health payload.
 */
export const CACHE_STAMP = 'play9gd1b';
export const BUILD_VERSION = 'play9gd1b';
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
