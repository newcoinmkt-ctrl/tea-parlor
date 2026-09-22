/**
 * Colyseus 客户端封装（依赖 public/colyseus/colyseus.js）
 * 房间快照与 Pinus publicState 同构，可直接 applyPinusRoom
 */

import {
  saveDdzReconnect,
  peekDdzReconnect,
  clearDdzReconnect,
} from './table-session.js';


/** play9fin5c: distinguishable room-API error codes for logs */
export function logRoomApiError(code, detail, extra = {}) {
  const msg = detail?.message || detail?.msg || (typeof detail === 'string' ? detail : '');
  const payload = {
    code: String(code || 'room_api_error'),
    message: String(msg || code || 'room_api_error'),
    ...extra,
  };
  console.warn(`[room-api:${payload.code}]`, payload.message, payload);
  return payload;
}


function defaultColyseusUrl() { if (typeof window !== 'undefined' && window.TEA_PARLOR_COLYSEUS_URL) { return String(window.TEA_PARLOR_COLYSEUS_URL); } return 'ws://127.0.0.1:2567'; }

let client = null;
let room = null;
let lastRoomState = null;
const roomListeners = new Set();

function getSDK() {
  if (typeof window !== 'undefined' && window.Colyseus) return window.Colyseus;
  throw new Error('Colyseus SDK 未加载 — 请在 index.html 引入 ./public/colyseus/colyseus.js');
}

export function isColyseusAvailable() {
  return typeof window !== 'undefined' && Boolean(window.Colyseus?.Client);
}

export function onRoomUpdate(fn) {
  roomListeners.add(fn);
  return () => roomListeners.delete(fn);
}

function emitRoom(state) {
  lastRoomState = state;
  for (const fn of roomListeners) {
    try { fn(state); } catch (_) {}
  }
}

export function getLastRoom() {
  return lastRoomState;
}

export async function connectColyseus(endpoint = defaultColyseusUrl()) {
  const { Client } = getSDK();
  // colyseus.js Client accepts http(s) or ws(s); normalize
  let url = endpoint;
  if (url.startsWith('ws://')) url = url.replace('ws://', 'http://');
  if (url.startsWith('wss://')) url = url.replace('wss://', 'https://');
  client = new Client(url);
  return client;
}

/**
 * Hard leave (consented) — forfeit / explicit quit. Clears reconnect token.
 */
export async function leaveColyseus() {
  try {
    if (room) {
      try { room.send('quit', {}); } catch (_) {}
      await room.leave(true);
    }
  } catch (err) {
    logRoomApiError('room_leave_failed', err);
  }
  room = null;
  lastRoomState = null;
  client = null;
  clearDdzReconnect();
}

/**
 * Soft park (play9fin1a) — non-consented leave so allowReconnection keeps the seat.
 * Keeps reconnectionToken; server countdown / AI continue (no freeze).
 */
export async function parkColyseus() {
  const prev = peekDdzReconnect();
  const tok = room?.reconnectionToken || prev?.token || null;
  const uid = prev?.uid || null;
  const phase = lastRoomState?.phase || prev?.phase || null;
  const roomId = room?.roomId || prev?.roomId || null;
  try {
    if (room) await room.leave(false);
  } catch (_) {}
  room = null;
  // keep client for subsequent reconnect()
  if (tok && uid) {
    saveDdzReconnect({
      uid, token: tok, roomId, phase, parked: true,
      fullTrustee: !!(typeof window !== 'undefined' && window.__ddzFullTrustee),
    });
  }
}

export function hasParkedDdz(uid) {
  return Boolean(peekDdzReconnect(uid)?.token);
}

export { peekDdzReconnect, clearDdzReconnect, saveDdzReconnect };

/**
 * 加入/创建斗地主人机房
 */
export async function startColyseusDdzSession({
  endpoint = defaultColyseusUrl(),
  uid,
  name,
  roomId = 'novice',
  currency = 'ingot',
  token,
  /** Quick-match must not resume a prior dealt/AI table via reconnection token. */
  fresh = false,
} = {}) {
  await connectColyseus(endpoint);
  const options = {
    uid: uid || `h5_${Date.now()}`,
    name: name || '茶馆',
    roomKey: roomId,
    currency,
  };
  if (token) options.token = token;

  if (fresh) {
    clearDdzReconnect();
  }

  // play9fin7c: only resume when stored roomKey matches target dual/public key
  const storedTok = fresh ? null : (() => {
    const parsed = peekDdzReconnect(options.uid);
    if (!parsed?.token) return null;
    const want = String(options.roomKey || '');
    const had = String(parsed.roomKey || '');
    if (want && had && want !== had) return null;
    return parsed.token;
  })();
  let joined = null;
  if (storedTok) {
    try {
      joined = await client.reconnect(storedTok);
    } catch (err) {
      logRoomApiError('ddz_reconnect_failed', err, { roomKey: options.roomKey || options.roomId });
      joined = null;
    }
  }
  if (!joined) {
    try {
      joined = await client.joinOrCreate('doudizhu', options);
    } catch (err) {
      logRoomApiError('ddz_join_or_create_failed', err, { roomKey: options.roomKey || options.roomId });
      throw err;
    }
  }
  room = joined;
  {
    const prev = peekDdzReconnect(options.uid);
    saveDdzReconnect({
      uid: options.uid,
      token: room.reconnectionToken || null,
      roomId: room.roomId || null,
      roomKey: options.roomKey || roomId || null,
      phase: lastRoomState?.phase || 'match',
      fullTrustee: !!(prev?.fullTrustee || (typeof window !== 'undefined' && window.__ddzFullTrustee)),
    });
  }

  room.onMessage('room', (msg) => {
    if (msg?.room) emitRoom(msg.room);
  });
  room.onMessage('error', (msg) => {
    const err = new Error(msg?.msg || 'colyseus error');
    err.data = msg;
    logRoomApiError('ddz_room_message_error', err, { codeHint: msg?.code || msg?.reason });
  });
  room.onMessage('hint', () => {});
  room.onMessage('joined', () => {});

  // First snapshot may be phase=match — that is success, not a timeout.
  const first = await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      logRoomApiError('ddz_room_state_timeout', 'colyseus room state timeout', { roomId: room?.roomId });
      reject(new Error('colyseus room state timeout'));
    }, 12000);
    const off = onRoomUpdate((st) => {
      clearTimeout(t);
      off();
      resolve(st);
    });
    try { room.send('state', {}); } catch (_) {}
  });

  return {
    room: first,
    uid: options.uid,
    sessionId: room.sessionId,
    backend: 'colyseus',
  };
}

function ensureRoom() {
  if (!room) throw new Error('未加入 Colyseus 房间');
  return room;
}

function waitRoomUpdate(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('colyseus response timeout')), timeoutMs);
    const off = onRoomUpdate((st) => {
      clearTimeout(t);
      off();
      resolve(st);
    });
  });
}

export async function ddzBid(score) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('bid', { score });
  return { room: await p };
}

export async function ddzPlay(cardIds) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('play', { cardIds });
  return { room: await p };
}

export async function ddzPass() {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('pass', {});
  return { room: await p };
}

export async function ddzHint() {
  const r = ensureRoom();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('hint timeout')), 5000);
    const onHint = (msg) => {
      clearTimeout(t);
      r.onMessage('hint', () => {}); // no-op rebind not needed
      resolve({ cards: msg?.cards || [] });
    };
    // one-shot via once if available
    if (typeof r.onMessage === 'function') {
      const prev = onHint;
      r.onMessage('hint', (msg) => {
        clearTimeout(t);
        resolve({ cards: msg?.cards || [] });
      });
    }
    r.send('hint', {});
  });
}

export async function ddzState() {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('state', {});
  return { room: await p };
}

/**
 * play9fin3a — server-authoritative full trustee (DDZ).
 * Sends `{ on }` to Colyseus; server sets seat.fullTrustee and driveAi.
 */
export async function ddzSetTrustee(on = true) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('trustee', { on: !!on });
  return { room: await p };
}


/**
 * play9fin1c — join/create mahjong dual-session room (推倒胡/血战)
 */
export async function startColyseusMjSession({
  endpoint = defaultColyseusUrl(),
  uid,
  name,
  roomId = 'tuidaohu',
  mode = 'xuezhan',
  token,
  fresh = false,
} = {}) {
  await connectColyseus(endpoint);
  const options = {
    uid: uid || `h5_${Date.now()}`,
    name: name || '茶馆',
    roomKey: roomId,
    mode,
  };
  if (token) options.token = token;

  if (fresh) {
    try { sessionStorage.removeItem('tea-parlor-mj-reconnect'); } catch (_) {}
  }
  const storedTok = fresh ? null : (() => {
    try {
      const raw = sessionStorage.getItem('tea-parlor-mj-reconnect');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.uid === options.uid && parsed?.token) return parsed.token;
    } catch (_) {}
    return null;
  })();

  let joined = null;
  if (storedTok) {
    try { joined = await client.reconnect(storedTok); } catch (err) {
      logRoomApiError('mj_reconnect_failed', err, { roomKey: roomId });
      joined = null;
    }
  }
  if (!joined) {
    try {
      joined = await client.joinOrCreate('mahjong', options);
    } catch (err) {
      logRoomApiError('mj_join_or_create_failed', err, { roomKey: roomId });
      throw err;
    }
  }
  room = joined;
  try {
    sessionStorage.setItem('tea-parlor-mj-reconnect', JSON.stringify({
      uid: options.uid,
      token: room.reconnectionToken || null,
      roomKey: roomId,
    }));
  } catch (_) {}

  room.onMessage('room', (msg) => {
    if (msg?.room) emitRoom(msg.room);
  });
  room.onMessage('error', (msg) => {
    logRoomApiError('mj_room_message_error', msg?.msg || msg, { codeHint: msg?.code || msg?.reason });
  });
  room.onMessage('joined', () => {});

  const first = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      logRoomApiError('mj_room_state_timeout', 'colyseus mj room state timeout', { roomId: room?.roomId });
      reject(new Error('colyseus mj room state timeout'));
    }, 12000);
    const off = onRoomUpdate((st) => {
      clearTimeout(timer);
      off();
      resolve(st);
    });
    try { room.send('state', {}); } catch (_) {}
  });

  return {
    room: first,
    uid: options.uid,
    sessionId: room.sessionId,
    backend: 'colyseus',
    game: 'mahjong',
  };
}

export async function mjDiscard(tileId) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('discard', { tileId });
  return { room: await p };
}

export async function mjCall(action) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('call', { action });
  return { room: await p };
}

/** play9fin3a — server-authoritative full trustee (Mahjong Colyseus room) */
export async function mjSetTrustee(on = true) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('trustee', { on: !!on });
  return { room: await p };
}

/** Shared dual-table room key for two TG / two clients */
export function makeDualRoomKey(game = 'ddz') {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `dual_${game}_${suffix}`;
}

/**
 * play9gd1 — join/create Guandan 4-seat Colyseus room
 */
export async function startColyseusGdSession({
  endpoint = defaultColyseusUrl(),
  uid,
  name,
  roomId = 'novice',
  currency = 'ingot',
  token,
  fresh = true,
} = {}) {
  await connectColyseus(endpoint);
  const options = {
    uid: uid || `h5_${Date.now()}`,
    name: name || '茶馆',
    roomKey: roomId,
    currency,
  };
  if (token) options.token = token;

  if (fresh) {
    try { sessionStorage.removeItem('tea-parlor-gd-reconnect'); } catch (_) {}
  }
  // play9fin7c: only resume when stored gd roomKey matches invite/target key
  const storedTok = fresh ? null : (() => {
    try {
      const raw = sessionStorage.getItem('tea-parlor-gd-reconnect');
      const parsed = raw ? JSON.parse(raw) : null;
      if (!(parsed?.uid === options.uid && parsed?.token)) return null;
      const want = String(options.roomKey || '');
      const had = String(parsed.roomKey || '');
      if (want && had && want !== had) return null;
      return parsed.token;
    } catch (_) {}
    return null;
  })();

  let joined = null;
  if (storedTok) {
    try { joined = await client.reconnect(storedTok); } catch (err) {
      logRoomApiError('gd_reconnect_failed', err, { roomKey: roomId });
      joined = null;
    }
  }
  if (!joined) {
    try {
      joined = await client.joinOrCreate('guandan', options);
    } catch (err) {
      logRoomApiError('gd_join_or_create_failed', err, { roomKey: roomId });
      throw err;
    }
  }
  room = joined;
  try {
    sessionStorage.setItem('tea-parlor-gd-reconnect', JSON.stringify({
      uid: options.uid,
      token: room.reconnectionToken || null,
      roomKey: roomId,
      fullTrustee: !!(typeof window !== 'undefined' && window.__gdFullTrustee),
    }));
  } catch (_) {}

  room.onMessage('room', (msg) => {
    if (msg?.room) emitRoom(msg.room);
  });
  room.onMessage('error', (msg) => {
    logRoomApiError('gd_room_message_error', msg?.msg || msg, { codeHint: msg?.code || msg?.reason });
  });
  room.onMessage('joined', () => {});

  const first = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      logRoomApiError('gd_room_state_timeout', 'colyseus gd room state timeout', { roomId: room?.roomId });
      reject(new Error('colyseus gd room state timeout'));
    }, 12000);
    const off = onRoomUpdate((st) => {
      clearTimeout(timer);
      off();
      resolve(st);
    });
    try { room.send('state', {}); } catch (_) {}
  });

  return {
    room: first,
    uid: options.uid,
    sessionId: room.sessionId,
    backend: 'colyseus',
    game: 'guandan',
  };
}

export async function gdPlay(cardIds) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('play', { cardIds });
  return { room: await p };
}

export async function gdPass() {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('pass', {});
  return { room: await p };
}

export async function gdRematch() {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('rematch', {});
  return { room: await p };
}

export async function gdSetTrustee(on = true) {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('trustee', { on: !!on });
  return { room: await p };
}

export async function gdState() {
  const r = ensureRoom();
  const p = waitRoomUpdate();
  r.send('state', {});
  return { room: await p };
}
