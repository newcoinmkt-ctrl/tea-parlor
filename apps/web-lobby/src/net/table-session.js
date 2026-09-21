/**
 * play9fin1a — soft park / reconnect session helpers
 * DDZ: Colyseus reconnectionToken; Mahjong: local engine state snapshot.
 * Soft leave (back to lobby) must NOT clear these; explicit quit / settle does.
 */
export const DDZ_RECONNECT_KEY = 'tea-parlor-ddz-reconnect';
export const MJ_SESSION_KEY = 'tea-parlor-mj-session';
export const RIICHI_SESSION_KEY = 'tea-parlor-riichi-session';

const MAX_AGE_MS = 10 * 60 * 1000; // 10 min resume window

function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function ssSet(key, val) {
  try {
    sessionStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (_) {
    return false;
  }
}

function ssDel(key) {
  try { sessionStorage.removeItem(key); } catch (_) {}
}

export function saveDdzReconnect(blob) {
  if (!blob?.token || !blob?.uid) return false;
  return ssSet(DDZ_RECONNECT_KEY, {
    uid: String(blob.uid),
    token: String(blob.token),
    roomId: blob.roomId || null,
    roomKey: blob.roomKey || null,
    phase: blob.phase || null,
    // play9fin2b: full trustee survives disconnect reconnect
    fullTrustee: !!blob.fullTrustee,
    savedAt: Date.now(),
  });
}

export function peekDdzReconnect(uid) {
  const p = ssGet(DDZ_RECONNECT_KEY);
  if (!p?.token) return null;
  if (uid != null && String(p.uid) !== String(uid)) return null;
  if (p.savedAt && Date.now() - p.savedAt > MAX_AGE_MS) {
    ssDel(DDZ_RECONNECT_KEY);
    return null;
  }
  return p;
}

export function clearDdzReconnect() {
  ssDel(DDZ_RECONNECT_KEY);
}

export function saveMjSession(kind, payload) {
  const key = kind === 'riichi' ? RIICHI_SESSION_KEY : MJ_SESSION_KEY;
  if (!payload?.state) return false;
  return ssSet(key, {
    kind: kind === 'riichi' ? 'riichi' : 'tuidaohu',
    mode: payload.mode || null,
    label: payload.label || null,
    state: payload.state,
    turnEndsAt: payload.turnEndsAt || null,
    softTrustee: !!payload.softTrustee,
    fullTrustee: !!payload.fullTrustee,
    savedAt: Date.now(),
  });
}

export function peekMjSession(kind, mode) {
  const key = kind === 'riichi' ? RIICHI_SESSION_KEY : MJ_SESSION_KEY;
  const p = ssGet(key);
  if (!p?.state) return null;
  if (p.savedAt && Date.now() - p.savedAt > MAX_AGE_MS) {
    ssDel(key);
    return null;
  }
  if (mode && p.mode && p.mode !== mode) return null;
  if (kind === 'riichi' && p.kind !== 'riichi') return null;
  if (kind !== 'riichi' && p.kind === 'riichi') return null;
  // settled hands are not resume targets
  if (p.state?.phase === 'settle' || p.state?.phase === 'idle') {
    ssDel(key);
    return null;
  }
  return p;
}

export function clearMjSession(kind) {
  if (kind === 'riichi') ssDel(RIICHI_SESSION_KEY);
  else if (kind === 'tuidaohu' || kind === 'classic') ssDel(MJ_SESSION_KEY);
  else {
    ssDel(MJ_SESSION_KEY);
    ssDel(RIICHI_SESSION_KEY);
  }
}

/** Wall-clock remaining seconds from an absolute deadline. */
export function remainSeconds(endsAt, fallback = 0) {
  const t = Number(endsAt) || 0;
  if (!t) return fallback;
  return Math.max(0, Math.ceil((t - Date.now()) / 1000));
}
