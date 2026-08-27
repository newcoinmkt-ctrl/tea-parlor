/**
 * Pinus / Pomelo WebSocket 客户端封装（依赖 public/pinus/pinusclient.js）
 * 协议兼容 node-pinus hybridconnector
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3010;

function getPinus() {
  if (typeof window !== 'undefined' && window.pinus) return window.pinus;
  throw new Error('pinus client not loaded — 请在 index.html 引入 ./public/pinus/pinusclient.js');
}

function request(route, msg = {}) {
  const pinus = getPinus();
  return new Promise((resolve, reject) => {
    try {
      pinus.request(route, msg, (data) => {
        if (data && data.code && data.code !== 200) {
          reject(Object.assign(new Error(data.msg || route + ' failed'), { data }));
          return;
        }
        resolve(data);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function isPinusAvailable() {
  return typeof window !== 'undefined' && Boolean(window.pinus);
}

/**
 * 连接游戏服
 * @returns {Promise<void>}
 */
export function connectPinus({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  const pinus = getPinus();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('pinus connect timeout')), 8000);
    pinus.init(
      { host, port, log: false },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export function disconnectPinus() {
  try {
    const pinus = getPinus();
    if (typeof pinus.disconnect === 'function') pinus.disconnect();
  } catch (_) {}
}

export async function enterGame({ uid, name, currency = 'ingot' }) {
  return request('connector.entryHandler.enter', { uid, name, currency });
}

export async function pingEntry() {
  return request('connector.entryHandler.entry', {});
}

export async function ddzCreate({ roomId = 'novice' } = {}) {
  return request('connector.ddzHandler.create', { roomId });
}

export async function ddzBid(score) {
  return request('connector.ddzHandler.bid', { score });
}

export async function ddzPlay(cardIds) {
  return request('connector.ddzHandler.play', { cardIds });
}

export async function ddzPass() {
  return request('connector.ddzHandler.pass', {});
}

export async function ddzHint() {
  return request('connector.ddzHandler.hint', {});
}

export async function ddzState() {
  return request('connector.ddzHandler.state', {});
}

/**
 * 创建会话：连接 + enter + 可选 create
 */
export async function startPinusDdzSession({
  host,
  port,
  uid,
  name,
  roomId = 'novice',
  currency = 'ingot',
} = {}) {
  await connectPinus({ host, port });
  const enter = await enterGame({
    uid: uid || `h5_${Date.now()}`,
    name: name || '茶馆',
    currency,
  });
  const created = await ddzCreate({ roomId });
  return { enter, room: created.room, uid: enter.uid };
}
