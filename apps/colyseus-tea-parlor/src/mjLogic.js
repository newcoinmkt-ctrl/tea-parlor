/**
 * play9fin1b — dual-session mahjong table (推倒胡/血战)
 * Authoritative wrapper around packages/mahjong-engine createSichuanTable.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let eng = null;
async function load() {
  if (eng) return eng;
  try {
    eng = await import('@tea-parlor/mahjong-engine');
  } catch (_) {
    const root = path.resolve(__dirname, '../../../packages/mahjong-engine/src');
    eng = await import(pathToFileURL(path.join(root, 'index.js')).href);
  }
  return eng;
}

const AI_NAMES = ['茶友甲', '茶友乙', '茶友丙'];

export const MJ_MATCH_MS = 30_000;
export const MJ_DUAL_MIN_HUMANS = 2;

export class MjTable {
  constructor(opts = {}) {
    this.roomKey = opts.roomKey || 'tuidaohu';
    this.mode = opts.mode || 'xuezhan';
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.matchMs = opts.matchMs ?? MJ_MATCH_MS;
    this.minHumansBeforeAi = opts.minHumansBeforeAi ?? MJ_DUAL_MIN_HUMANS;
    this.phase = 'match'; // match | play | settle
    this.matchEndsAt = 0;
    this.seats = [null, null, null, null];
    this.table = null;
    this.settle = null;
    this.ready = this._boot();
  }

  async _boot() { await load(); }
  async ensureReady() { await this.ready; }

  get humanCount() {
    return this.seats.filter((s) => s && s.kind === 'human').length;
  }

  seatOf(uid) {
    return this.seats.findIndex((s) => s && s.uid === String(uid));
  }

  resetMatchWindow() {
    this.matchEndsAt = this.now() + this.matchMs;
  }

  remainingMatchMs() {
    if (!this.matchEndsAt) return 0;
    return Math.max(0, this.matchEndsAt - this.now());
  }

  occupy(uid, name) {
    const existing = this.seatOf(uid);
    if (existing >= 0) {
      this.seats[existing].connected = true;
      if (name) this.seats[existing].name = name;
      return existing;
    }
    if (this.phase !== 'match') return -1;
    const seat = this.seats.findIndex((s) => !s);
    if (seat < 0) return -1;
    this.seats[seat] = {
      uid: String(uid),
      name: name || `茶友${seat}`,
      kind: 'human',
      connected: true,
    };
    if (this.humanCount === 1) this.resetMatchWindow();
    return seat;
  }

  reconnect(uid, name) {
    const seat = this.seatOf(uid);
    if (seat < 0) return this.occupy(uid, name);
    this.seats[seat].connected = true;
    if (name) this.seats[seat].name = name;
    return seat;
  }

  disconnect(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) return -1;
    if (this.phase === 'match') {
      this.seats[seat] = null;
      return -1;
    }
    this.seats[seat].connected = false;
    return seat;
  }

  _fillAi() {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      if (!this.seats[i]) {
        this.seats[i] = {
          uid: `ai:${i}`,
          name: AI_NAMES[n++] || `茶友${i}`,
          kind: 'ai',
          connected: false,
        };
      }
    }
  }

  async completeMatch() {
    await this.ensureReady();
    if (this.phase !== 'match') return this.phase;
    const remaining = this.remainingMatchMs();
    const humans = this.humanCount;
    const need = this.minHumansBeforeAi || 1;
    if (remaining > 0 && humans < 4 && humans < need) return this.phase;

    this._fillAi();
    const E = await load();
    const names = this.seats.map((s) => s?.name || '空位');
    this.table = E.createSichuanTable({
      mode: this.mode === 'xueliu' ? E.GameMode.XUELIU : E.GameMode.XUEZHAN,
      playerNames: names,
      baseScore: 1,
    });
    // Skip exchange/dingque for dual-session playability
    E.applyDingqueAll(this.table, [0, 1, 2, 0]); // assign missing suits → PLAYING
    if (this.table.phase !== E.Phase.PLAYING) {
      this.table.phase = E.Phase.PLAYING;
    }
    this.phase = 'play';
    this._driveAi();
    return this.phase;
  }

  _pickAiDiscard(hand) {
    if (!hand?.length) return null;
    return hand[hand.length - 1];
  }

  _driveAi() {
    if (!this.table || this.phase !== 'play') return;
    const E = eng;
    let guard = 0;
    while (this.phase === 'play' && guard++ < 120) {
      if (this.table.phase === E.Phase.FINISHED) {
        this._settle();
        break;
      }
      const cur = this.table.currentPlayer;
      const seat = this.seats[cur];
      if (!seat || seat.kind === 'human') break;
      const hand = this.table.hands[cur];
      const tile = this._pickAiDiscard(hand);
      if (!tile) break;
      const r = E.discardTile(this.table, cur, tile.id || tile);
      if (!r?.ok) break;
      // other AI auto-pass claims
      if (this.table.lastDiscard) {
        E.passClaimsAndNext(this.table);
      }
      if (this.table.phase === E.Phase.FINISHED) {
        this._settle();
        break;
      }
      if (!this.table.wall?.length) {
        this._settle();
        break;
      }
    }
  }

  discard(uid, tileId) {
    if (this.phase !== 'play') throw new Error('not_play');
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('no_seat');
    if (this.table.currentPlayer !== seat) throw new Error('not_your_turn');
    const r = eng.discardTile(this.table, seat, tileId);
    if (!r?.ok) throw new Error(r?.reason || 'discard_fail');
    this._afterHuman();
  }

  humanCall(uid, action) {
    if (this.phase !== 'play') throw new Error('not_play');
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('no_seat');
    const E = eng;
    const tile = this.table.lastDiscard?.tile;
    let r;
    if (action === 'peng') r = E.applyPeng(this.table, seat, tile);
    else if (action === 'gang') r = E.applyGang(this.table, seat, { fromDiscard: true });
    else if (action === 'hu') r = E.applyHu(this.table, seat, { fromDiscard: true });
    else r = E.passClaimsAndNext(this.table);
    if (r && r.ok === false) throw new Error(r.reason || 'call_fail');
    this._afterHuman();
  }

  huSelf(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('no_seat');
    const r = eng.applyHu(this.table, seat, { selfDraw: true });
    if (r && r.ok === false) throw new Error(r.reason || 'hu_fail');
    this._afterHuman();
  }

  _afterHuman() {
    if (this.table.phase === eng.Phase.FINISHED || !this.table.wall?.length) {
      this._settle();
      return;
    }
    this._driveAi();
  }

  _settle() {
    this.phase = 'settle';
    const scores = (this.table.scores || [0, 0, 0, 0]).slice();
    this.settle = {
      scores,
      deltas: scores.slice(),
      huOrder: this.table.huOrder || [],
      reason: this.table.finishedReason || 'hand_over',
      winner: (this.table.huOrder && this.table.huOrder[0]) ?? -1,
    };
  }

  publicState(uid) {
    const seat = this.seatOf(uid);
    const names = this.seats.map((s) => s?.name || '空位');
    const base = {
      backend: 'colyseus',
      game: 'mahjong',
      roomKey: this.roomKey,
      phase: this.phase,
      names,
      humanCount: this.humanCount,
      matchEndsAt: this.matchEndsAt,
      mySeat: seat,
      seats: this.seats.map((s) => (s ? {
        name: s.name,
        kind: s.kind,
        connected: !!s.connected,
      } : null)),
    };
    if (this.phase === 'match' || !this.table) {
      return { ...base, status: '匹配中，等待同桌' };
    }
    const hands = this.table.hands.map((h, i) => (
      i === seat ? h.map((c) => ({ ...c })) : h.map(() => ({ id: 'hidden', suit: -1, rank: 0 }))
    ));
    return {
      ...base,
      status: this.phase === 'settle' ? '结算' : '对局中',
      hands,
      handCounts: this.table.hands.map((h) => h.length),
      melds: this.table.melds || [[], [], [], []],
      current: this.table.currentPlayer,
      dealer: this.table.dealer,
      wallLeft: this.table.wall?.length || 0,
      lastDiscard: this.table.lastDiscard,
      scores: this.table.scores?.slice() || [0, 0, 0, 0],
      settle: this.settle,
      canHuSelf: seat === this.table.currentPlayer,
    };
  }
}
