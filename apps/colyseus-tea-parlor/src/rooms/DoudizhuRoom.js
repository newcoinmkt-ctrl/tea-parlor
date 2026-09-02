/**
 * Colyseus Room · 斗地主人机桌
 * 消息协议与 H5 pinus 快照兼容（publicState 同构）
 */
import colyseus from 'colyseus';
import { verifySessionToken } from '@tea-parlor/session-auth';
import { DdzTable } from '../ddzLogic.js';

const { Room } = colyseus;


/**
 * P0 鉴权（评审 #3 遗留的 onJoin TODO(auth)）：
 * 校验网关签发的 session token，且 uid 必须与 token 身份一致，
 * 不再盲信客户端传来的 options.uid。
 * 未配置密钥时保持本地开发信任模式（仅限测试）。
 * 抽成纯函数便于单元测试。
 */
export function verifyRoomJoin(options = {}, deps = {}) {
  const sessionSecret = deps.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
  if (!sessionSecret) {
    return { ok: true, uid: options.uid || null, trusted: true };
  }
  const verified = verifySessionToken(options.token || '', { sessionSecret });
  if (!verified.ok) {
    return { ok: false, reason: 'auth_failed', detail: verified.reason };
  }
  const tokenUserId = String(verified.user.id);
  if (options.uid != null && tokenUserId !== String(options.uid)) {
    return { ok: false, reason: 'auth_identity_mismatch' };
  }
  return { ok: true, uid: tokenUserId, trusted: false };
}

export class DoudizhuRoom extends Room {
  maxClients = 4;

  async onCreate(options = {}) {
    this.setMetadata({
      game: 'doudizhu',
      roomKey: options.roomKey || 'novice',
    });
    this.autoDispose = true;
    this.patchRate = null; // 用显式消息推送状态，不依赖 Schema
    this.table = null;
    this.humanUid = null;
    this.sessionSecret = options.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
    if (!this.sessionSecret) {
      console.warn('[colyseus] API_GATEWAY_SESSION_SECRET 未配置：入房鉴权关闭（信任模式），仅限本地开发/测试使用');
    }

    this.onMessage('hello', (client, msg) => {
      client.send('hello', { ok: true, uid: client.sessionId, echo: msg || null });
    });

    this.onMessage('bid', async (client, msg) => {
      await this._act(client, (uid) => this.table.bid(uid, msg?.score ?? 0));
    });

    this.onMessage('play', async (client, msg) => {
      const ids = msg?.cardIds || msg?.cards || [];
      await this._act(client, (uid) => this.table.play(uid, ids));
    });

    this.onMessage('pass', async (client) => {
      await this._act(client, (uid) => this.table.pass(uid));
    });

    this.onMessage('hint', async (client) => {
      try {
        await this.table?.ensureReady();
        const cards = this.table.hint(client.userData?.uid || client.sessionId);
        client.send('hint', { cards });
        this._push(client);
      } catch (e) {
        client.send('error', { msg: e.message || String(e) });
      }
    });

    this.onMessage('state', async (client) => {
      await this.table?.ensureReady();
      this._push(client);
    });
  }

  async onJoin(client, options = {}) {
    const auth = verifyRoomJoin(options, { sessionSecret: this.sessionSecret });
    if (!auth.ok) {
      client.send('error', { msg: auth.reason, detail: auth.detail || null });
      throw new Error(auth.reason);
    }
    const uid = auth.uid || client.sessionId;
    const name = options.name || '茶馆';
    const roomKey = options.roomKey || this.metadata?.roomKey || 'novice';
    const currency = options.currency || 'ingot';

    client.userData = { uid, name };

    // 首个真人建桌；后续客户端旁观同一桌（演示）
    if (!this.table) {
      this.humanUid = uid;
      this.table = new DdzTable({
        humanUid: uid,
        humanName: name,
        roomKey,
        currency,
      });
      await this.table.ensureReady();
    } else {
      await this.table.ensureReady();
    }

    client.send('joined', {
      roomId: this.roomId,
      sessionId: client.sessionId,
      uid,
      backend: 'colyseus',
    });
    this._push(client);
  }

  onLeave(client) {
    // 真人离开后自动销毁
    if (client.userData?.uid === this.humanUid) {
      this.disconnect();
    }
  }

  async _act(client, fn) {
    try {
      await this.table?.ensureReady();
      const uid = client.userData?.uid || client.sessionId;
      fn(uid);
      // 广播最新状态给所有人
      for (const c of this.clients) this._push(c);
    } catch (e) {
      client.send('error', { msg: e.message || String(e) });
      this._push(client);
    }
  }

  _push(client) {
    if (!this.table) return;
    const uid = client.userData?.uid || client.sessionId;
    const room = this.table.publicState(uid);
    client.send('room', { room });
  }
}
