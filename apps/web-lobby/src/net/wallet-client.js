export function resolveApiGatewayBase(injected) {
  const raw = String(
    injected
    || (typeof window !== 'undefined' && window.TEA_PARLOR_API_GATEWAY_URL)
    || '',
  ).trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export async function loginWithTelegramInitData(initData, options = {}) {
  const base = resolveApiGatewayBase(options.baseUrl);
  const response = await fetch(`${base}/auth/telegram`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.deviceHash ? { 'x-device-hash': options.deviceHash } : {}),
    },
    body: JSON.stringify({
      initData,
      // Server attribution only trusts the signed Telegram initData start_param.
      startParam: options.startParam || '',
    }),
  });
  return readJsonResponse(response);
}

export async function fetchWalletSummary(token, options = {}) {
  return walletRequest('/wallet/summary', token, { method: 'GET' }, options);
}

export async function fetchInviteMe(token, options = {}) {
  return walletRequest('/invite/me', token, { method: 'GET' }, options);
}

export async function claimInviteShareReward(token, payload = {}, options = {}) {
  return walletRequest('/invite/share-claimed', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, options);
}

export async function claimWalletGrant(token, grantType, payload = {}, options = {}) {
  return walletRequest(`/wallet/grants/${encodeURIComponent(grantType)}`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, options);
}

export async function lockWalletBuyIn(token, payload = {}, options = {}) {
  return walletRequest('/wallet/lock', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }, options);
}

export async function settleWalletIntent(token, settlementIntent, participants, options = {}) {
  return walletRequest('/wallet/settlement', token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settlementIntent, participants }),
  }, options);
}

async function walletRequest(path, token, init = {}, options = {}) {
  const base = resolveApiGatewayBase(options.baseUrl);
  const headers = {
    ...(init.headers || {}),
    authorization: `Bearer ${token}`,
  };
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) {
    const error = new Error(body.reason || `http_${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}
