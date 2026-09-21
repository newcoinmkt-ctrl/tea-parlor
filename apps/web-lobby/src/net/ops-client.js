const DEFAULT_OPS_URL = 'http://127.0.0.1:5190';

function trimSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isLocalHostName(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function isPublicOpsUrl(url) {
  const raw = trimSlash(url);
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  try {
    return !isLocalHostName(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function resolveOpsBase() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('ops');
    if (fromQuery && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(fromQuery.replace(/\/$/, ''))) {
      return fromQuery.replace(/\/$/, '');
    }
  } catch (_) { /* ignore */ }

  const runtime = typeof window !== 'undefined' ? trimSlash(window.TEA_PARLOR_OPS_URL) : '';
  if (isPublicOpsUrl(runtime)) return runtime;

  let hostname = '';
  try { hostname = window.location.hostname; } catch (_) {}
  if (!isLocalHostName(hostname)) {
    return runtime && /^https?:\/\//i.test(runtime) ? runtime : '';
  }
  return DEFAULT_OPS_URL;
}

/**
 * play9fin3b — resolve ads config URL.
 * Priority: explicit ?adsUrl → TEA_PARLOR_ADS_URL → static manifest → ops (dev).
 * Returns '' when no remote URL (caller uses inline config / static / placeholder).
 */
export function resolveAdsUrl(explicit) {
  if (explicit) {
    const e = String(explicit).trim();
    if (/^https?:\/\//i.test(e) || e.startsWith('./') || e.startsWith('/')) return e;
  }
  try {
    const runtime = typeof window !== 'undefined' ? String(window.TEA_PARLOR_ADS_URL || '').trim() : '';
    if (runtime && (/^https?:\/\//i.test(runtime) || runtime.startsWith('./') || runtime.startsWith('/'))) {
      return runtime;
    }
  } catch (_) { /* ignore */ }
  // Static bundled manifest (always available; swappable via deploy)
  return './public/ads/manifest.json';
}

/** play9fin3b — inline env JSON config if present */
export function resolveInlineAdsConfig() {
  try {
    const cfg = typeof window !== 'undefined' ? window.TEA_PARLOR_ADS_CONFIG : null;
    if (cfg && typeof cfg === 'object') return cfg;
  } catch (_) { /* ignore */ }
  return null;
}

export async function fetchOpsCatalog() {
  const res = await fetch(`${resolveOpsBase()}/public/catalog`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`ops_catalog_${res.status}`);
  return res.json();
}

export async function reportOpsRevenue(payload) {
  const res = await fetch(`${resolveOpsBase()}/public/revenue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`ops_revenue_${res.status}`);
  return res.json();
}

export async function reportAdEvent(eventType, payload = {}) {
  const res = await fetch(`${resolveOpsBase()}/public/ad-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      eventType,
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`ops_ad_event_${res.status}`);
  return res.json();
}

export async function fetchPlayerStatus(playerId) {
  const url = `${resolveOpsBase()}/public/player-status?playerId=${encodeURIComponent(playerId)}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`ops_status_${res.status}`);
  return res.json();
}

export async function fetchChainAssets(playerId) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  const res = await fetch(`${resolveOpsBase()}/public/chain-assets${query}`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`ops_chain_assets_${res.status}`);
  return res.json();
}

export async function touchOpsPlayer({ playerId, name }) {
  const res = await fetch(`${resolveOpsBase()}/public/player-touch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId, name }),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`ops_touch_${res.status}`);
  return res.json();
}
