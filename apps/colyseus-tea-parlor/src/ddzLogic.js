/**
 * 斗地主房间逻辑（权威服）
 * 3 座：匹配 →（满 3 真人立刻 / 10s AI 补位）→ 叫分/出牌
 * 复用 packages/doudizhu-engine；AI/托管座走现有 AI helpers
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MATCH_MS = 10_000;
/** Empty matching rooms dispose after this (not the 10s match-to-deal clock). */
export const EMPTY_ROOM_MS = 45_000;
/** New humans need ≥ this much match window left; else reject so joinOrCreate opens fresh (only near expiry). */
export const FRESH_JOIN_MIN_REMAIN_MS = 2_000;
export const TRUSTEE_MS = 30_000;
export const FORFEIT_MS = 60_000;

const AI_NAMES = ['茶友A', '茶友B', '茶友C'];

export const ROOMS_META = {
  novice: { stake: 100, unit: 1, baseRoomScore: 1 },
  classic: { stake: 500, unit: 5, baseRoomScore: 5 },
  friend: { stake: 200, unit: 2, baseRoomScore: 2 },
  c_micro: { stake: 0.5, unit: 1, baseRoomScore: 1 },
  c_std: { stake: 2, unit: 1, baseRoomScore: 2 },
  c_high: { stake: 10, unit: 1, baseRoomScore: 5 },
};

let engineMod = null;
let aiMod = null;
let rulesMod = null;

async function loadEngine() {
  if (engineMod && aiMod) return;
  const root = path.resolve(__dirname, '../../../packages/doudizhu-engine/src');
  engineMod = await import(pathToFileURL(path.join(root, 'engine.js')).href);
  aiMod = await import(pathToFileURL(path.join(root, 'ai.js')).href);
  rulesMod = await import(pathToFileURL(path.join(root, 'rules.js')).href);
}

let _rid = 1;
function newId() {
  return `cddz_${Date.now()}_${_rid++}`;
}

function rot(i, me) {
  if (me < 0 || i == null || i < 0) return i;
  return (i - me + 3) % 3;
}

function rotArr(arr, me) {
  if (!arr || me < 0) return arr;
  return [arr[me], arr[(me + 1) % 3], arr[(me + 2) % 3]];
}

export class DdzTable {
  constructor(opts = {}) {
    this.id = newId();
    this.roomKey = opts.roomKey || 'novice';
    this.currency = opts.currency || 'ingot';
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.matchMs = opts.matchMs ?? MATCH_MS;
    const meta = ROOMS_META[this.roomKey] || ROOMS_META.novice;
    this.stake = meta.stake;
    this.baseRoomScore = meta.baseRoomScore;
    this.engine = null;
    this.phase = 'match';
    // Do not start the 10s match-to-deal clock on empty create — clients must not see a dying empty-room clock.
    this.matchEndsAt = 0;
    this.seats = [null, null, null];
    this.names = ['空位', '空位', '空位'];
    this.humanIndex = 0;
    this.forfeitScores = null;
    this.settledReason = null;
    this.walletHook = null;
    this.ready = this._boot(opts);
  }

  async _boot(opts) {
    await loadEngine();
    if (opts.humanUid && opts.match !== true && opts.autoDeal !== false) {
      this.occupy(opts.humanUid, opts.humanName || '茶馆');
      // Immediate local/autoDeal path — not a wall-clock match wait.
      this.matchEndsAt = 0;
      await this.completeMatch();
    }
  }

  async ensureReady() {
    await this.ready;
  }

  get humanCount() {
    return this.seats.filter((s) => s && s.kind === 'human').length;
  }

  _syncNames() {
    this.names = this.seats.map((s) => {
      if (!s) return this.phase === 'match' ? '匹配中' : '空位';
      return s.name;
    });
  }

  seatOf(uid) {
    if (uid == null) return -1;
    const id = String(uid);
    return this.seats.findIndex((s) => s && s.kind === 'human' && String(s.uid) === id);
  }

  /** Restart the 10s match window (any new human seat during match). */
  resetMatchWindow() {
    if (this.phase !== 'match') return false;
    this.matchEndsAt = this.now() + this.matchMs;
    return true;
  }

  /** Clear match clock (empty room / all humans left). */
  clearMatchWindow() {
    this.matchEndsAt = 0;
  }

  remainingMatchMs() {
    if (!this.matchEndsAt) return 0;
    return this.matchEndsAt - this.now();
  }

  /**
   * Empty rooms always accept. Rooms with ≥1 human only accept if remaining ≥ FRESH_JOIN_MIN_REMAIN_MS
   * so a new joiner is not handed a nearly-expired overlay (e.g. 1s).
   */
  canAcceptNewHuman() {
    if (this.phase !== 'match') return false;
    if (this.humanCount === 0) return true;
    return this.remainingMatchMs() >= FRESH_JOIN_MIN_REMAIN_MS;
  }

  occupy(uid, name) {
    const existing = this.seatOf(uid);
    if (existing >= 0) {
      this.seats[existing].connected = true;
      this.seats[existing].trustee = false;
      this.seats[existing].disconnectedAt = null;
      if (name) this.seats[existing].name = name;
      this._syncNames();
      return existing;
    }
    if (this.phase !== 'match') return -1;
    const seat = this.seats.findIndex((s) => !s);
    if (seat < 0) return -1;
    this.seats[seat] = {
      uid: String(uid),
      name: name || '茶馆',
      kind: 'human',
      connected: true,
      trustee: false,
      disconnectedAt: null,
    };
    // Every new human seat during match: full MATCH_MS from now (reconnect path above skips this).
    if (this.humanCount === 1) this.humanIndex = seat;
    this.resetMatchWindow();
    this._syncNames();
    return seat;
  }

  freeSeat(uidOrSeat) {
    const seat = typeof uidOrSeat === 'number' ? uidOrSeat : this.seatOf(uidOrSeat);
    if (seat < 0 || !this.seats[seat]) return;
    this.seats[seat] = null;
    this._syncNames();
    const first = this.seats.findIndex((s) => s && s.kind === 'human');
    this.humanIndex = first >= 0 ? first : 0;
  }

  reconnect(uid, name) {
    const seat = this.seatOf(uid);
    if (seat >= 0) {
      this.seats[seat].connected = true;
      this.seats[seat].trustee = false;
      this.seats[seat].disconnectedAt = null;
      if (name) this.seats[seat].name = name;
      this._syncNames();
      return seat;
    }
    return this.occupy(uid, name);
  }

  disconnect(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) return -1;
    if (this.phase === 'match') {
      this.freeSeat(seat);
      return -1;
    }
    this.seats[seat].connected = false;
    this.seats[seat].disconnectedAt = this.now();
    return seat;
  }

  applyTrustee(uidOrSeat) {
    const seat = typeof uidOrSeat === 'number' ? uidOrSeat : this.seatOf(uidOrSeat);
    if (seat < 0 || !this.seats[seat]) return;
    this.seats[seat].trustee = true;
    this.seats[seat].connected = false;
    this.driveAi();
  }

  isWaitingHuman(seat) {
    const s = this.seats[seat];
    return Boolean(s && s.kind === 'human' && s.connected && !s.trustee);
  }

  _fillAi() {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      if (!this.seats[i]) {
        this.seats[i] = {
          uid: `ai:${i}`,
          name: AI_NAMES[n++] || `茶友${i}`,
          kind: 'ai',
          connected: false,
          trustee: true,
          disconnectedAt: null,
        };
      }
    }
    this._syncNames();
  }

  async onMatchTimeout() {
    return this.completeMatch();
  }

  async completeMatch() {
    if (this.phase !== 'match') return this.phase;
    const remaining = this.remainingMatchMs();
    if (remaining > 0 && this.humanCount < 3) {
      console.log('[ddz] deal blocked remaining=', remaining);
      return this.phase;
    }
    this._fillAi();
    await this.deal();
    return this.phase;
  }

  async deal() {
    await loadEngine();
    this.forfeitScores = null;
    this.settledReason = null;
    this.engine = new engineMod.DoudizhuEngine({
      playerNames: this.names.slice(),
      humanIndex: this.humanIndex,
      baseRoomScore: this.baseRoomScore,
    });
    this.engine.startGame();
    this.phase = this.engine.phase || 'bid';
    this.driveAi();
    this._syncPhase();
  }

  _syncPhase() {
    if (this.forfeitScores) {
      this.phase = 'settle';
      return;
    }
    if (!this.engine) {
      this.phase = 'match';
      return;
    }
    this.phase = this.engine.phase === 'deal' ? 'bid' : this.engine.phase;
  }

  goldScores(engineScores) {
    const br = this.baseRoomScore || 1;
    return (engineScores || [0, 0, 0]).map((s) => (Number(s) || 0) / br * this.stake);
  }

  driveAi() {
    const eng = this.engine;
    if (!eng || !aiMod || this.forfeitScores) return;
    let guard = 0;
    while (guard++ < 200) {
      if (eng.phase === engineMod.Phase.SETTLE) {
        this._syncPhase();
        return;
      }
      if (eng.phase === engineMod.Phase.BID) {
        if (this.isWaitingHuman(eng.bidTurn)) return;
        const score = aiMod.decideBid(eng.hands[eng.bidTurn], eng.currentBid);
        eng.bid(eng.bidTurn, score);
        continue;
      }
      if (eng.phase === engineMod.Phase.PLAY) {
        const seat = eng.currentPlayer;
        if (this.isWaitingHuman(seat)) return;
        const prev =
          eng.lastPlay && eng.lastPlay.player !== seat ? eng.lastPlay.hand : null;
        const decision = aiMod.decidePlay({
          hand: eng.hands[seat],
          prevHand: prev,
          isLandlord: eng.landlordIndex === seat,
          myIndex: seat,
          landlordIndex: eng.landlordIndex,
          handCounts: eng.hands.map((h) => h.length),
          prevPlayer: eng.lastPlay?.player,
        });
        if (!decision?.cards?.length) {
          if (prev) eng.pass(seat);
          else {
            const sorted = eng.hands[seat].slice().sort((a, b) => a.rank - b.rank);
            eng.play(seat, [sorted[0]]);
          }
        } else {
          eng.play(seat, decision.cards);
        }
        continue;
      }
      return;
    }
    this._syncPhase();
  }

  _scoresForPublic() {
    if (this.forfeitScores) return this.forfeitScores.slice();
    const eng = this.engine;
    if (!eng?.settlement) return null;
    const s = eng.settlement;
    let raw = null;
    if (Array.isArray(s.scores)) raw = s.scores;
    else if (s.playerScores) raw = s.playerScores;
    else if (s.deltas) raw = s.deltas;
    if (!raw) return null;
    return this.goldScores(raw);
  }

  publicState(uid) {
    const me = this.seatOf(uid);
    const names = this.names.slice();
    const seats = this.seats.map((s, i) => {
      if (!s) return { empty: true, name: names[i], kind: null, connected: false, trustee: false };
      return {
        name: s.name,
        kind: s.kind,
        connected: !!s.connected,
        trustee: !!s.trustee,
        empty: false,
      };
    });

    if (this.phase === 'match' || !this.engine) {
      return {
        id: this.id,
        roomKey: this.roomKey,
        currency: this.currency,
        stake: this.stake,
        phase: 'match',
        matchEndsAt: this.matchEndsAt,
        humanCount: this.humanCount,
        names: rotArr(names, me < 0 ? 0 : me) || names,
        seats: rotArr(seats, me < 0 ? 0 : me) || seats,
        myHand: [],
        status: '匹配中，超时 AI 补位',
        humanIndex: 0,
        backend: 'colyseus',
      };
    }

    const eng = this.engine;
    const st = eng.getState();
    this._syncPhase();
    const scores = this._scoresForPublic();
    let status = '准备';
    if (this.phase === 'bid' || st.phase === 'bid') {
      status = `叫分中 · 轮到 ${names[st.bidTurn]}`;
    } else if (this.phase === 'play' || st.phase === 'play') {
      status = `出牌中 · 轮到 ${names[st.currentPlayer]}`;
    } else if (this.phase === 'settle' || st.phase === 'settle') {
      if (this.settledReason === 'forfeit') {
        const q = this.seats.findIndex((_, i) => this.forfeitScores && this.forfeitScores[i] < 0);
        status = `结算 · ${q >= 0 ? names[q] : '中途退出'} 认负`;
      } else {
        const w = st.settlement?.winnerIndex ?? -1;
        status = `结算 · ${w >= 0 ? names[w] : '结束'}`;
      }
    }

    const lastPlay = st.lastPlay
      ? {
          player: rot(st.lastPlay.player, me),
          cards: st.lastPlay.hand?.cards || st.lastPlay.cards || [],
          type: st.lastPlay.hand?.type || st.lastPlay.type || null,
        }
      : null;

    const viewMe = me < 0 ? -1 : 0;
    const isMyTurn = me >= 0 && (
      (st.phase === 'bid' && st.bidTurn === me)
      || (st.phase === 'play' && st.currentPlayer === me)
    );
    const canPass = st.phase === 'play'
      && me >= 0
      && st.currentPlayer === me
      && st.lastPlay
      && st.lastPlay.player !== me;

    return {
      id: this.id,
      roomKey: this.roomKey,
      currency: this.currency,
      stake: this.stake,
      phase: this.phase,
      matchEndsAt: this.matchEndsAt,
      humanCount: this.humanCount,
      landlord: rot(st.landlordIndex, me),
      currentBid: st.currentBid,
      bidTurn: rot(st.bidTurn, me),
      bidScores: rotArr(st.bidScores, me),
      currentPlayer: rot(st.currentPlayer, me),
      multiplier: st.multiplier,
      bombCount: st.bombCount,
      handsCount: rotArr(st.handCounts, me),
      myHand: me >= 0 ? st.hands[me] : [],
      bottom: st.bottomRevealed ? st.bottomCards : null,
      lastPlay,
      names: rotArr(names, me < 0 ? 0 : me),
      seats: rotArr(seats, me < 0 ? 0 : me),
      humanIndex: viewMe < 0 ? 0 : 0,
      winner: st.settlement?.winnerIndex != null ? rot(st.settlement.winnerIndex, me) : null,
      spring: st.spring,
      scores: scores ? rotArr(scores, me < 0 ? 0 : me) : null,
      humanScore: scores && me >= 0 ? scores[me] : (scores ? scores[0] : null),
      settlement: st.settlement || (this.forfeitScores ? { scores: this.forfeitScores, reason: 'forfeit' } : null),
      status,
      isHumanTurn: isMyTurn && this.isWaitingHuman(me),
      canPass,
      backend: 'colyseus',
    };
  }

  bid(uid, score) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('仅本人可操作');
    if (!this.engine) throw new Error('尚未开局');
    const ok = this.engine.bid(seat, Number(score) || 0);
    if (!ok) throw new Error('叫分无效');
    this.driveAi();
    this._syncPhase();
  }

  play(uid, cardIds) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('仅本人可操作');
    if (!this.engine) throw new Error('尚未开局');
    const hand = this.engine.hands[seat];
    const cards = cardIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) throw new Error('手牌不匹配');
    const res = this.engine.play(seat, cards);
    if (!res?.ok) throw new Error(res?.reason || '出牌失败');
    this.driveAi();
    this._syncPhase();
  }

  pass(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('仅本人可操作');
    if (!this.engine) throw new Error('尚未开局');
    const ok = this.engine.pass(seat);
    if (!ok) throw new Error('不能不出');
    this.driveAi();
    this._syncPhase();
  }

  hint(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0 || !this.engine) return [];
    const eng = this.engine;
    const prev =
      eng.lastPlay && eng.lastPlay.player !== seat ? eng.lastPlay.hand : null;
    if (rulesMod?.getHint) {
      const h = rulesMod.getHint(eng.hands[seat], prev);
      return h?.cards || [];
    }
    const d = aiMod.decidePlay({
      hand: eng.hands[seat],
      prevHand: prev,
      isLandlord: eng.landlordIndex === seat,
      myIndex: seat,
      landlordIndex: eng.landlordIndex,
      handCounts: eng.hands.map((h) => h.length),
    });
    return d?.cards || [];
  }

  forfeit(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) return null;
    if (this.phase === 'match') {
      this.freeSeat(seat);
      return null;
    }
    if (this.phase === 'settle' && this.forfeitScores) return this.forfeitScores;
    const scores = [0, 0, 0];
    scores[seat] = -this.stake;
    const share = this.stake / 2;
    for (let i = 0; i < 3; i++) {
      if (i !== seat) scores[i] = share;
    }
    this.forfeitScores = scores;
    this.settledReason = 'forfeit';
    this.phase = 'settle';
    return scores;
  }

  async maybePostWallet() {
    const scores = this._scoresForPublic();
    if (!scores) {
      this.walletHook = { ok: false, reason: 'no_scores' };
      return this.walletHook;
    }
    const participants = this.seats.map((s, i) => (s && s.uid) || `seat:${i}`);
    this.walletHook = await postShadowSettlement({
      scores,
      participants,
      roomId: this.id,
      stake: this.stake,
    });
    return this.walletHook;
  }
}

/**
 * Best-effort HTTP hook to wallet/ops applySettlementIntent.
 * Missing WALLET_URL / OPS_URL → scores still live in the room snapshot.
 */
export async function postShadowSettlement({ scores, participants, roomId, stake }) {
  const base = String(process.env.WALLET_URL || process.env.OPS_URL || '').replace(/\/+$/, '');
  if (!base) {
    return { ok: false, reason: 'wallet_url_missing' };
  }
  const intent = {
    scores,
    idempotencyKey: `ddz:${roomId}:settle`,
    roomId,
    stake,
  };
  try {
    const res = await fetch(`${base}/wallet/settlement`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settlementIntent: intent, participants }),
    });
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
    if (!res.ok || body.ok === false) {
      return { ok: false, reason: body.reason || `http_${res.status}` };
    }
    return { ok: true, body };
  } catch (e) {
    return { ok: false, reason: 'wallet_http_failed', detail: e.message || String(e) };
  }
}
