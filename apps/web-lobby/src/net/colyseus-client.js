/**
 * Colyseus 客户端封装（依赖 public/colyseus/colyseus.js）
 * 房间快照与 Pinus publicState 同构，可直接 applyPinusRoom
 */

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

export async function leaveColyseus() {
  try {
    if (room) await room.leave(true);
  } catch (_) {}
  room = null;
  lastRoomState = null;
  client = null;
}

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
} = {}) {
  await connectColyseus(endpoint);
  const options = {
    uid: uid || `h5_${Date.now()}`,
    name: name || '茶馆',
    roomKey: roomId,
    currency,
  };
  if (token) options.token = token;

  room = await client.joinOrCreate('doudizhu', options);

  room.onMessage('room', (msg) => {
    if (msg?.room) emitRoom(msg.room);
  });
  room.onMessage('error', (msg) => {
    const err = new Error(msg?.msg || 'colyseus error');
    err.data = msg;
    console.warn('[colyseus]', err.message);
  });
  room.onMessage('hint', () => {});
  room.onMessage('joined', () => {});

  // 等待首个 room 快照
  const first = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('colyseus room state timeout')), 8000);
    const off = onRoomUpdate((st) => {
      clearTimeout(t);
      off();
      resolve(st);
    });
    // 主动拉一次
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
