/**
 * Colyseus Room · 掼蛋 4 人匹配 (play9gd1)
 * 消息协议与 H5 guandan snapshot 同构
 */
import colyseus from 'colyseus';
import { verifySessionToken } from '@tea-parlor/session-auth';
import {
  GdTable,
  MATCH_MS,
  aiThinkDelayMs,
  AI_THINK_MS_MIN,
  EMPTY_ROOM_MS,
  TRUSTEE_MS,
  FORFEIT_MS,
} from '../gdLogic.js';

const { Room } = colyseus;

export function verifyGdJoin(options = {}, deps = {}) {
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

export class GuandanRoom extends Room {
  maxClients = 4;

  async onCreate(options = {}) {
    const roomKey = options.roomKey || 'novice';
    this.setMetadata({ game: 'guandan', roomKey });
    this.autoDispose = true;
    this.patchRate = null;
    this.sessionSecret = options.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
    if (!this.sessionSecret) {
      console.warn('[colyseus/gd] API_GATEWAY_SESSION_SECRET 未配置：入房鉴权关闭（信任模式）');
    }

    this.table = new GdTable({
      roomKey,
      currency: options.currency || 'ingot',
      stake: options.stake,
      match: true,
      autoDeal: false,
      matchMs: MATCH_MS,
      aiThinkMs: AI_THINK_MS_MIN,
    });
    await this.table.ensureReady();
    this._leaveTimers = new Map();
    this._dealt = false;
    this.matchTimerHandle = null;
    this._armEmptyRoomTimer(EMPTY_ROOM_MS);

    this.onMessage('hello', (client, msg) => {
      client.send('hello', { ok: true, uid: client.sessionId, echo: msg || null });
    });

    this.onMessage('play', async (client, msg) => {
      const ids = msg?.cardIds || msg?.cards || [];
      const normalized = ids.map((c) => (typeof c === 'object' ? c.id : c));
      await this._act(client, (uid) => this.table.play(uid, normalized));
    });

    this.onMessage('pass', async (client) => {
      await this._act(client, (uid) => this.table.pass(uid));
    });

    this.onMessage('state', async (client) => {
      await this.table?.ensureReady();
      this._push(client);
    });

    this.onMessage('quit', async (client) => {
      const uid = client.userData?.uid || client.sessionId;
      await this._explicitQuit(uid);
    });

    this.onMessage('rematch', async (client) => {
      try {
        await this.table?.ensureReady();
        if (this.table.phase !== 'settle') {
          client.send('error', { msg: 'not_settle' });
          return;
        }
        const ok = await this.table.rematch();
        if (!ok) {
          client.send('error', { msg: 'rematch_failed' });
          return;
        }
        this._dealt = true;
        this._broadcast();
        this._pumpAi();
      } catch (e) {
        client.send('error', { msg: e.message || String(e) });
      }
    });

    this.onMessage('trustee', async (client, msg) => {
      try {
        await this.table?.ensureReady();
        const uid = client.userData?.uid || client.sessionId;
        const on = msg?.on !== false && msg?.enabled !== false && msg?.trustee !== false;
        const ok = this.table.setFullTrustee(uid, on);
        if (!ok) {
          client.send('error', { msg: 'trustee_unavailable' });
          this._push(client);
          return;
        }
        this._broadcast();
        if (on) this._pumpAi();
      } catch (e) {
        client.send('error', { msg: e.message || String(e) });
        this._push(client);
      }
    });
  }

  async onJoin(client, options = {}) {
    const auth = verifyGdJoin(options, { sessionSecret: this.sessionSecret });
    if (!auth.ok) {
      client.send('error', { msg: auth.reason, detail: auth.detail || null });
      throw new Error(auth.reason);
    }
    const uid = auth.uid || client.sessionId;
    const name = options.name || '茶馆';
    client.userData = { uid, name };

    const existing = this.table.seatOf(uid);
    if (existing >= 0) {
      this._clearLeaveTimers(uid);
      this.table.reconnect(uid, name);
    } else if (this.table.phase === 'match') {
      if (this.table.humanCount >= 1 && !this.table.canAcceptNewHuman()) {
        try { this.lock(); } catch (_) {}
        client.send('error', { msg: 'match_window_stale' });
        throw new Error('match_window_stale');
      }
      const seat = this.table.occupy(uid, name);
      if (seat < 0) throw new Error('room_full');
      this.table.resetMatchWindow();
      const remainMs = Math.max(0, this.table.matchEndsAt - Date.now());
      this._armMatchTimer(remainMs);
      const need = this.table.minHumansBeforeAi || 1;
      // Mirror DDZ: ≥need humans → deal now (AI fills rest); MATCH_MS arms silent fill path
      if (this.table.humanCount >= 4 || this.table.humanCount >= need) {
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
      game: 'guandan',
    });
    this._broadcast();
  }

  async onLeave(client, consented) {
    const uid = client.userData?.uid || client.sessionId;
    if (!this.table) return;

    if (this.table.phase === 'match') {
      this.table.disconnect(uid);
      if (this.table.humanCount === 0) {
        this.table.clearMatchWindow();
        this._clearMatchTimer();
        try { this.unlock(); } catch (_) {}
        this._armEmptyRoomTimer(EMPTY_ROOM_MS);
      }
      this._broadcast();
      return;
    }

    if (this.table.phase === 'settle') return;

    if (consented) {
      await this._explicitQuit(uid);
      return;
    }

    this.table.disconnect(uid);
    this._broadcast();

    const trusteeT = this.clock.setTimeout(() => {
      this.table.applyTrustee(uid);
      this._broadcast();
      this._pumpAi();
    }, TRUSTEE_MS);

    this._leaveTimers.set(uid, { trusteeT });

    try {
      await this.allowReconnection(client, FORFEIT_MS / 1000);
      this._clearLeaveTimers(uid);
      this.table.reconnect(uid);
      this._broadcast();
      if (this.table.seats[this.table.seatOf(uid)]?.fullTrustee) this._pumpAi();
    } catch {
      this._clearLeaveTimers(uid);
      if (this.table.phase !== 'settle') {
        this.table.forfeit(uid);
        await this._settleWallet();
        this._broadcast();
        this.clock.setTimeout(() => this.disconnect(), 50);
      }
    }
  }

  _clearMatchTimer() {
    if (this.matchTimerHandle != null) {
      clearTimeout(this.matchTimerHandle);
      this.matchTimerHandle = null;
    }
  }

  _armEmptyRoomTimer(ms = EMPTY_ROOM_MS) {
    this._clearMatchTimer();
    const delay = Math.max(0, Number(ms) || 0);
    this.matchTimerHandle = setTimeout(() => {
      this.matchTimerHandle = null;
      if (!this.table || this.table.phase !== 'match') return;
      if (this.table.humanCount > 0) return;
      try { this.disconnect(); } catch (_) {}
    }, delay);
  }

  _armMatchTimer(ms = MATCH_MS) {
    this._clearMatchTimer();
    const delay = Math.max(0, Number(ms) || 0);
    this.matchTimerHandle = setTimeout(() => {
      this.matchTimerHandle = null;
      this._onMatchTimeout().catch((e) => console.warn('[colyseus/gd] match timeout', e?.message || e));
    }, delay);
  }

  async _onMatchTimeout() {
    if (!this.table || this.table.phase !== 'match') return;
    if (this.table.humanCount <= 0) {
      try { this.disconnect(); } catch (_) {}
      return;
    }
    await this._dealNow();
  }

  async _dealNow() {
    if (this._dealt) return;
    if (this.table?.phase === 'match') {
      const remaining = this.table.remainingMatchMs();
      const need = this.table.minHumansBeforeAi || 1;
      const humans = this.table.humanCount;
      if (remaining > 0 && humans < 4 && humans < need) {
        this._armMatchTimer(remaining);
        return;
      }
    }
    this._clearMatchTimer();
    await this.table.completeMatch();
    if (this.table.phase === 'match') {
      const remaining = this.table.remainingMatchMs();
      const need = this.table.minHumansBeforeAi || 1;
      if (remaining > 0 && this.table.humanCount < 4 && this.table.humanCount < need) {
        this._armMatchTimer(remaining);
        return;
      }
      return;
    }
    this._dealt = true;
    try { this.lock(); } catch (_) {}
    this._broadcast();
    this._pumpAi();
  }

  async _explicitQuit(uid) {
    this._clearLeaveTimers(uid);
    if (this.table.phase === 'match') {
      this.table.disconnect(uid);
      if (this.table.humanCount === 0) {
        this.table.clearMatchWindow();
        this._clearMatchTimer();
        try { this.unlock(); } catch (_) {}
        this._armEmptyRoomTimer(EMPTY_ROOM_MS);
      }
      this._broadcast();
      return;
    }
    if (this.table.phase === 'settle') return;
    this.table.forfeit(uid);
    await this._settleWallet();
    this._broadcast();
    this.clock.setTimeout(() => this.disconnect(), 50);
  }

  _clearLeaveTimers(uid) {
    const t = this._leaveTimers.get(uid);
    if (t?.trusteeT?.clear) t.trusteeT.clear();
    this._leaveTimers.delete(uid);
  }

  async _settleWallet() {
    try {
      await this.table.maybePostWallet();
    } catch (e) {
      console.warn('[colyseus/gd] wallet', e?.message || e);
    }
  }

  async _act(client, fn) {
    try {
      await this.table?.ensureReady();
      if (this.table.phase === 'match') throw new Error('匹配中，请稍候');
      const uid = client.userData?.uid || client.sessionId;
      fn(uid);
      if (this.table.phase === 'settle') await this._settleWallet();
      this._broadcast();
      this._pumpAi();
    } catch (e) {
      client.send('error', { msg: e.message || String(e) });
      this._push(client);
    }
  }

  _pumpAi() {
    if (this._aiPumpHandle) {
      clearTimeout(this._aiPumpHandle);
      this._aiPumpHandle = null;
    }
    if (!this.table || this.phase === 'match' || this.table.phase === 'match' || this.table.phase === 'settle') return;
    if (!this.table._aiNeedsContinue && !this.table.needsAiAct?.()) return;
    const delay = aiThinkDelayMs();
    this._aiPumpHandle = setTimeout(() => {
      this._aiPumpHandle = null;
      if (!this.table || this.table.phase === 'settle') return;
      try {
        this.table.driveAi();
        if (this.table.phase === 'settle') this._settleWallet().catch(() => {});
        this._broadcast();
        this._pumpAi();
      } catch (e) {
        console.warn('[colyseus/gd] ai pump', e?.message || e);
      }
    }, delay);
  }

  _broadcast() {
    for (const c of this.clients) this._push(c);
  }

  _push(client) {
    if (!this.table) return;
    const uid = client.userData?.uid || client.sessionId;
    const room = this.table.publicState(uid);
    client.send('room', { room });
  }
}
