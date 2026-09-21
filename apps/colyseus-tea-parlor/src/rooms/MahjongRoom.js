/**
 * Colyseus Room · 麻将双人同桌（推倒胡/血战） play9fin1b
 */
import colyseus from 'colyseus';
import { verifySessionToken } from '@tea-parlor/session-auth';
import { MjTable, MJ_MATCH_MS } from '../mjLogic.js';

const { Room } = colyseus;
const EMPTY_MS = 45_000;

export function verifyMjJoin(options = {}, deps = {}) {
  const sessionSecret = deps.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
  if (!sessionSecret) {
    return { ok: true, uid: options.uid || null, trusted: true };
  }
  const verified = verifySessionToken(options.token || '', { sessionSecret });
  if (!verified.ok) return { ok: false, reason: 'auth_failed', detail: verified.reason };
  const tokenUserId = String(verified.user.id);
  if (options.uid != null && tokenUserId !== String(options.uid)) {
    return { ok: false, reason: 'auth_identity_mismatch' };
  }
  return { ok: true, uid: tokenUserId, trusted: false };
}

export class MahjongRoom extends Room {
  maxClients = 4;

  async onCreate(options = {}) {
    const roomKey = options.roomKey || 'tuidaohu';
    this.setMetadata({ game: 'mahjong', roomKey });
    this.autoDispose = true;
    this.patchRate = null;
    this.sessionSecret = options.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
    this.table = new MjTable({
      roomKey,
      mode: options.mode || 'xuezhan',
      matchMs: options.matchMs || MJ_MATCH_MS,
    });
    await this.table.ensureReady();
    this._dealt = false;
    this._matchTimer = null;
    this._armEmpty(EMPTY_MS);

    this.onMessage('discard', async (client, msg) => {
      await this._act(client, (uid) => this.table.discard(uid, msg?.tileId || msg?.id));
    });
    this.onMessage('call', async (client, msg) => {
      await this._act(client, (uid) => this.table.humanCall(uid, msg?.action || 'pass'));
    });
    this.onMessage('huSelf', async (client) => {
      await this._act(client, (uid) => this.table.huSelf(uid));
    });
    this.onMessage('state', async (client) => {
      await this.table.ensureReady();
      this._push(client);
    });
  }

  async onJoin(client, options = {}) {
    const auth = verifyMjJoin(options, { sessionSecret: this.sessionSecret });
    if (!auth.ok) {
      client.send('error', { msg: auth.reason });
      throw new Error(auth.reason);
    }
    const uid = auth.uid || client.sessionId;
    const name = options.name || '茶馆';
    client.userData = { uid, name };

    const existing = this.table.seatOf(uid);
    if (existing >= 0) {
      this.table.reconnect(uid, name);
    } else if (this.table.phase === 'match') {
      const seat = this.table.occupy(uid, name);
      if (seat < 0) throw new Error('room_full');
      this.table.resetMatchWindow();
      const remain = this.table.remainingMatchMs();
      this._armMatch(remain);
      if (this.table.humanCount >= (this.table.minHumansBeforeAi || 2)) {
        await this._dealNow();
      }
    } else {
      throw new Error('game_in_progress');
    }

    client.send('joined', {
      roomId: this.roomId,
      sessionId: client.sessionId,
      uid,
      backend: 'colyseus',
      game: 'mahjong',
    });
    this._broadcast();
  }

  async onLeave(client, consented) {
    const uid = client.userData?.uid || client.sessionId;
    if (!this.table) return;
    if (this.table.phase === 'match') {
      this.table.disconnect(uid);
      if (this.table.humanCount === 0) {
        this._clearMatch();
        this._armEmpty(EMPTY_MS);
      }
      this._broadcast();
      return;
    }
    this.table.disconnect(uid);
    if (!consented) {
      try {
        await this.allowReconnection(client, 60);
        this.table.reconnect(uid);
      } catch (_) { /* forfeit seat stays AI-like */ }
    }
    this._broadcast();
  }

  _clearMatch() {
    if (this._matchTimer != null) {
      clearTimeout(this._matchTimer);
      this._matchTimer = null;
    }
  }

  _armEmpty(ms) {
    this._clearMatch();
    this._matchTimer = setTimeout(() => {
      this._matchTimer = null;
      if (!this.table || this.table.phase !== 'match') return;
      if (this.table.humanCount > 0) return;
      try { this.disconnect(); } catch (_) {}
    }, Math.max(0, ms));
  }

  _armMatch(ms) {
    this._clearMatch();
    this._matchTimer = setTimeout(() => {
      this._matchTimer = null;
      this._dealNow().catch((e) => console.warn('[mj] match timeout', e?.message || e));
    }, Math.max(0, Number(ms) || 0));
  }

  async _dealNow() {
    if (this._dealt) return;
    await this.table.completeMatch();
    if (this.table.phase === 'match') return;
    this._dealt = true;
    this._clearMatch();
    try { this.lock(); } catch (_) {}
    this._broadcast();
  }

  async _act(client, fn) {
    try {
      await this.table.ensureReady();
      const uid = client.userData?.uid || client.sessionId;
      fn(uid);
      this._broadcast();
    } catch (e) {
      client.send('error', { msg: e.message || String(e) });
      this._push(client);
    }
  }

  _push(client) {
    const uid = client.userData?.uid || client.sessionId;
    client.send('room', { room: this.table.publicState(uid) });
  }

  _broadcast() {
    for (const client of this.clients) this._push(client);
  }
}
