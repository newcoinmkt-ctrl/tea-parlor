/**
 * Colyseus Room · 斗地主 3 人匹配
 * 消息协议与 H5 publicState 同构
 */
import colyseus from 'colyseus';
import { verifySessionToken } from '@tea-parlor/session-auth';
import {
  DdzTable,
  MATCH_MS,
  EMPTY_ROOM_MS,
  TRUSTEE_MS,
  FORFEIT_MS,
} from '../ddzLogic.js';

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
  maxClients = 3;

  async onCreate(options = {}) {
    const roomKey = options.roomKey || 'novice';
    this.setMetadata({
      game: 'doudizhu',
      roomKey,
    });
    this.autoDispose = true;
    this.patchRate = null;
    this.sessionSecret = options.sessionSecret ?? process.env.API_GATEWAY_SESSION_SECRET ?? null;
    if (!this.sessionSecret) {
      console.warn('[colyseus] API_GATEWAY_SESSION_SECRET 未配置：入房鉴权关闭（信任模式），仅限本地开发/测试使用');
    }

    this.table = new DdzTable({
      roomKey,
      currency: options.currency || 'ingot',
      match: true,
      autoDeal: false,
      matchMs: MATCH_MS,
    });
    await this.table.ensureReady();
    this._leaveTimers = new Map();
    this._dealt = false;
    this.matchTimerHandle = null;

    // Empty rooms: dispose-only timer. Do NOT start the 10s match-to-deal countdown until first human.
    this._armEmptyRoomTimer(EMPTY_ROOM_MS);

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

    this.onMessage('quit', async (client) => {
      const uid = client.userData?.uid || client.sessionId;
      await this._explicitQuit(uid);
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
    client.userData = { uid, name };

    const existing = this.table.seatOf(uid);
    if (existing >= 0) {
      this._clearLeaveTimers(uid);
      this.table.reconnect(uid, name);
    } else if (this.table.phase === 'match') {
      // Only refuse rooms about to expire (< FRESH_JOIN_MIN_REMAIN_MS); empty rooms always ok.
      if (this.table.humanCount >= 1 && !this.table.canAcceptNewHuman()) {
        try { this.lock(); } catch (_) {}
        client.send('error', { msg: 'match_window_stale', detail: 'matching room nearly expired' });
        throw new Error('match_window_stale');
      }
      const seat = this.table.occupy(uid, name);
      if (seat < 0) {
        throw new Error('room_full');
      }
      // Every new human: full MATCH_MS window + wall-clock arm to matchEndsAt (not blind MATCH_MS alone).
      this.table.resetMatchWindow();
      const remainMs = Math.max(0, this.table.matchEndsAt - Date.now());
      console.log('[ddz] occupy', {
        now: Date.now(),
        matchEndsAt: this.table.matchEndsAt,
        humanCount: this.table.humanCount,
        deltaMs: remainMs,
      });
      this._armMatchTimer(remainMs);
      if (this.table.humanCount >= 3) {
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

    if (this.table.phase === 'settle') {
      return;
    }

    if (consented) {
      await this._explicitQuit(uid);
      return;
    }

    this.table.disconnect(uid);
    this._broadcast();

    const trusteeT = this.clock.setTimeout(() => {
      this.table.applyTrustee(uid);
      this._broadcast();
    }, TRUSTEE_MS);

    this._leaveTimers.set(uid, { trusteeT });

    try {
      await this.allowReconnection(client, FORFEIT_MS / 1000);
      this._clearLeaveTimers(uid);
      this.table.reconnect(uid);
      this._broadcast();
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

  /** Clear wall-clock match/empty timers (Node setTimeout — not Colyseus clock). */
  _clearMatchTimer() {
    if (this.matchTimerHandle != null) {
      clearTimeout(this.matchTimerHandle);
      this.matchTimerHandle = null;
    }
    if (this.matchTimer?.clear) this.matchTimer.clear();
    this.matchTimer = null;
  }

  /** Dispose empty matching rooms via wall-clock Node setTimeout. Does not deal. */
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

  /**
   * Match-to-deal countdown via wall-clock Node setTimeout.
   * Prefer arming with Math.max(0, matchEndsAt - Date.now()) after each human occupy.
   * (patchRate=null → Colyseus clock rarely ticks → @gamestdio/timer Delayed is unreliable.)
   */
  _armMatchTimer(ms = MATCH_MS) {
    this._clearMatchTimer();
    const delay = Math.max(0, Number(ms) || 0);
    this.matchTimerHandle = setTimeout(() => {
      this.matchTimerHandle = null;
      this._onMatchTimeout().catch((e) => console.warn('[colyseus] match timeout', e?.message || e));
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
      if (remaining > 0 && this.table.humanCount < 3) {
        console.log('[ddz] deal blocked remaining=', remaining);
        this._armMatchTimer(remaining);
        return;
      }
    }
    this._clearMatchTimer();
    console.log('[ddz] deal', {
      now: Date.now(),
      matchEndsAt: this.table?.matchEndsAt ?? 0,
      humanCount: this.table?.humanCount ?? 0,
      deltaMs: this.table ? (Date.now() - (this.table.matchEndsAt - (this.table.matchMs || MATCH_MS))) : 0,
    });
    await this.table.completeMatch();
    // completeMatch may no-op if still gated (defense in depth)
    if (this.table.phase === 'match') {
      const remaining = this.table.remainingMatchMs();
      if (remaining > 0 && this.table.humanCount < 3) {
        console.log('[ddz] deal blocked remaining=', remaining);
        this._armMatchTimer(remaining);
        return;
      }
      return;
    }
    this._dealt = true;
    try { this.lock(); } catch (_) {}
    this._broadcast();
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
      console.warn('[colyseus] wallet hook', e?.message || e);
    }
  }

  async _act(client, fn) {
    try {
      await this.table?.ensureReady();
      if (this.table.phase === 'match') {
        throw new Error('匹配中，请稍候');
      }
      const uid = client.userData?.uid || client.sessionId;
      fn(uid);
      if (this.table.phase === 'settle') {
        await this._settleWallet();
      }
      this._broadcast();
    } catch (e) {
      client.send('error', { msg: e.message || String(e) });
      this._push(client);
    }
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
