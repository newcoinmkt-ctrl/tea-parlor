const DEFAULT_OPS_URL = 'http://127.0.0.1:5190';

export function resolveOpsBase() {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('ops');
    if (fromQuery && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(fromQuery.replace(/\/$/, ''))) {
      return fromQuery.replace(/\/$/, '');
    }
  } catch (_) { /* ignore */ }
  return DEFAULT_OPS_URL;
}

export function resolveAdsUrl(explicit) {
  if (explicit && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(explicit)) return explicit;
  return `${resolveOpsBase()}/public/ad-placements`;
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
  });
  if (!res.ok) throw new Error(`ops_revenue_${res.status}`);
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
  });
  if (!res.ok) throw new Error(`ops_touch_${res.status}`);
  return res.json();
}
