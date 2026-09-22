/**
 * play9fin7b — Telegram Mini App invite / startapp deep link helpers
 * Pure functions for generate + parse; dual-session room join.
 * Unified invite payload: roomKey + gameId for DDZ / Guandan / MJ.
 */

export const INVITE_BOT_FALLBACK = 'teaparlorbot';

/** Map lobby / roomKey game tags → short dual suffix */
export const INVITE_GAME_SHORT = {
  ddz: 'ddz',
  doudizhu: 'ddz',
  gd: 'gd',
  guandan: 'gd',
  mj: 'mj',
  mahjong: 'mj',
};

export function shortGameId(game = 'ddz') {
  const g = String(game || 'ddz').toLowerCase().trim();
  return INVITE_GAME_SHORT[g] || (g.length <= 4 ? g : 'ddz');
}

/** Infer game short id from dual_* roomKey */
export function inferGameIdFromRoomKey(roomKey) {
  const k = String(roomKey || '').trim();
  const m = k.match(/^dual_([a-z0-9]+)_/i);
  if (m) return shortGameId(m[1]);
  return 'ddz';
}

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
  const g = shortGameId(game);
  if (k.length >= 4) return `dual_${g}_${k}`;
  return '';
}

/**
 * Parse TG start params from WebApp / URL.
 * Accepts: start_param, tgWebAppStartParam, startapp, hash startapp=
 * @returns {{ roomKey: string, gameId: string, raw: string } | null}
 */
export function parseTgInviteStartParam(sources = {}, defaultGame = 'ddz') {
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
    const inferred = inferGameIdFromRoomKey(body.startsWith('dual_') ? body : '') || defaultGame;
    const roomKey = normalizeDualRoomKey(body, body.startsWith('dual_') ? inferred : defaultGame);
    if (roomKey) {
      return { roomKey, gameId: inferGameIdFromRoomKey(roomKey), raw };
    }
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

/**
 * Unified invite payload for in-play / settle / room-select.
 * @returns {{ roomKey: string, gameId: string, url: string, startapp: string, copyText: string }}
 */
export function buildInvitePayload({ roomKey, gameId = 'ddz', botUsername = INVITE_BOT_FALLBACK } = {}) {
  const g = shortGameId(gameId);
  const key = normalizeDualRoomKey(roomKey, g) || normalizeDualRoomKey(`invite${Date.now().toString(36)}`, g);
  const url = buildTgInviteUrl(key, botUsername);
  const startapp = `t_${key}`;
  const copyText = `${url}\n房间号 ${key}`;
  return { roomKey: key, gameId: g, url, startapp, copyText };
}

/** Human-readable share text per game */
export function inviteShareText(gameId = 'ddz') {
  const g = shortGameId(gameId);
  if (g === 'gd') return '来茶馆打一局掼蛋';
  if (g === 'mj') return '来茶馆打一局麻将';
  return '来茶馆打一局经典斗地主';
}

/** Validate roomKey shape for join (readable errors upstream) */
export function validateInviteRoomKey(roomKey) {
  const k = String(roomKey || '').trim();
  if (!k) return { ok: false, reason: 'empty', message: '邀请码为空，请重新获取链接' };
  if (!/^dual_[a-z0-9]+_[A-Za-z0-9_\-]{2,}$/i.test(k) && !/^[A-Za-z0-9_\-]{4,}$/.test(k)) {
    return { ok: false, reason: 'invalid', message: '邀请码无效，请检查链接或房间号' };
  }
  const dual = normalizeDualRoomKey(k, inferGameIdFromRoomKey(k) || 'ddz');
  if (!dual) return { ok: false, reason: 'invalid', message: '邀请码无效，请检查链接或房间号' };
  return { ok: true, roomKey: dual, gameId: inferGameIdFromRoomKey(dual) };
}

/** Map Colyseus / network join failures to readable Chinese (never blank). */
export function formatInviteJoinError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  if (!msg || msg === 'undefined' || msg === 'null') {
    return '邀请加入失败，请稍后重试或重新获取链接';
  }
  if (/full|max clients|seat|no.?seat|capacity|房间已满/.test(msg)) {
    return '该桌已满，请换一桌或请房主再开一局';
  }
  if (/not found|expired|gone|closed|disposed|does not exist|404|410/.test(msg)) {
    return '邀请已过期或房间已关闭，请重新获取链接';
  }
  if (/invalid|malformed|bad.?key|forbidden|401|403/.test(msg)) {
    return '邀请码无效，请检查链接或房间号';
  }
  if (/timeout|timed out|network|fetch|websocket|econn|offline/.test(msg)) {
    return '网络超时，请检查连接后重试';
  }
  return `邀请加入失败：${String(err?.message || err).slice(0, 80)}`;
}
