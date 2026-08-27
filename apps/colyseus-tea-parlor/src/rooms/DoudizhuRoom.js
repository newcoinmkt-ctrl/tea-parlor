/**
 * Colyseus Room · 斗地主人机桌
 * 消息协议与 H5 pinus 快照兼容（publicState 同构）
 */
import colyseus from 'colyseus';
import { DdzTable } from '../ddzLogic.js';

const { Room } = colyseus;

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
    const uid = options.uid || client.sessionId;
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
