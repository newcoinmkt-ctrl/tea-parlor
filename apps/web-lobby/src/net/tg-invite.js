/**
 * play9ui2a — Telegram Mini App invite / startapp deep link helpers
 * Pure functions for generate + parse; dual-session room join.
 */

export const INVITE_BOT_FALLBACK = 'teaparlorbot';

/** Build t.me deep link with startapp=t_<roomKey> */
export function buildTgInviteUrl(roomId, botUsername = INVITE_BOT_FALLBACK) {
  const rid = String(roomId || '').trim();
  const bot = String(botUsername || INVITE_BOT_FALLBACK).replace(/^@/, '') || INVITE_BOT_FALLBACK;
  if (!rid) return `https://t.me/${bot}/app`;
  const param = rid.startsWith('t_') ? rid.slice(2) : rid;
  return `https://t.me/${bot}/app?startapp=t_${param}`;
}

/** Normalize room key for Colyseus dual join */
export function normalizeDualRoomKey(raw, game = 'ddz') {
  let k = String(raw || '').trim();
  if (!k) return '';
  if (k.startsWith('t_')) k = k.slice(2);
  try { k = decodeURIComponent(k); } catch (_) { /* keep */ }
  if (k.startsWith('dual_')) return k;
  if (k.length >= 4) return `dual_${game}_${k}`;
  return '';
}

/**
 * Parse TG start params from WebApp / URL.
 * Accepts: start_param, tgWebAppStartParam, startapp, hash startapp=
 * @returns {{ roomKey: string, raw: string } | null}
 */
export function parseTgInviteStartParam(sources = {}) {
  const candidates = [
    sources.start_param,
    sources.tgWebAppStartParam,
    sources.startapp,
    sources.searchStartapp,
    sources.hashStartapp,
  ];
  for (const c of candidates) {
    const raw = String(c || '').trim();
    if (!raw) continue;
    let body = raw;
    const m = raw.match(/^(?:startapp=)?t_(.+)$/i);
    if (m) body = m[1];
    else if (/^dual_/i.test(raw) || (/^[A-Za-z0-9_\-]{4,}$/.test(raw) && !/^https?:/i.test(raw))) body = raw;
    else continue;
    const roomKey = normalizeDualRoomKey(body);
    if (roomKey) return { roomKey, raw };
  }
  return null;
}

/** Collect start params from browser-like location + Telegram WebApp */
export function collectTgInviteSources(tg = null, loc = null) {
  const location = loc || (typeof window !== 'undefined' ? window.location : null);
  const search = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const hash = String(location?.hash || '').replace(/^#/, '');
  const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');
  const web = tg || (typeof window !== 'undefined' ? window.Telegram?.WebApp : null);
  return {
    start_param: web?.initDataUnsafe?.start_param || '',
    tgWebAppStartParam: search.get('tgWebAppStartParam') || '',
    startapp: search.get('startapp') || '',
    searchStartapp: search.get('startapp') || '',
    hashStartapp: hashParams.get('startapp') || '',
  };
}
