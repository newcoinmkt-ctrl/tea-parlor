/**
 * 掼蛋房间逻辑（权威服）· play9gd1
 * 4 座：匹配 →（≤3s AI 补位）→ 出牌/过牌 → 名次结算
 * 复用 @tea-parlor/guandan-engine；本局跳过进贡（tribute cut）
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MATCH_MS_DEFAULT = 3_000;
export const MATCH_MS_MAX = 3_000;
export function resolveMatchMs(env = process.env) {
  const raw = env?.MATCH_MS ?? env?.GD_MATCH_MS;
  if (raw == null || raw === '') return MATCH_MS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return MATCH_MS_DEFAULT;
  const ms = Math.floor(n);
  if (ms > MATCH_MS_MAX) {
    console.warn(`[gd] MATCH_MS=${ms} capped to ${MATCH_MS_MAX}`);
    return MATCH_MS_MAX;
  }
  return Math.max(500, ms);
}
export const MATCH_MS = resolveMatchMs();
export const FRIEND_MATCH_MS = 30_000;
export const DUAL_MIN_HUMANS = 2;
export const AI_THINK_MS_MIN = 800;
export const AI_THINK_MS_MAX = 2000;
export function aiThinkDelayMs(random = Math.random) {
  const span = AI_THINK_MS_MAX - AI_THINK_MS_MIN;
  return AI_THINK_MS_MIN + Math.floor(random() * (span + 1));
}
export const EMPTY_ROOM_MS = 45_000;
export const FRESH_JOIN_MIN_REMAIN_MS = 1_000;
export const TRUSTEE_MS = 30_000;
export const FORFEIT_MS = 60_000;

const AI_NAMES = ['茶友A', '茶友B', '茶友C'];

export const ROOMS_META = {
  novice: { stake: 100, unit: 1 },
  mid: { stake: 200, unit: 2 },
  classic: { stake: 100, unit: 1 },
  friend: { stake: 100, unit: 1 },
};

/** Documented hand types supported this wave (engine subset). */
export const SUPPORTED_HAND_TYPES = Object.freeze([
  '单张', '对子', '三张', '三带二', '三连对', '钢板', '顺子', '同花顺', '炸弹', '天王炸',
]);

let eng = null;

async function loadEngine() {
  if (eng) return eng;
  const root = path.resolve(__dirname, '../../../packages/guandan-engine/src');
  eng = {
    card: await import(pathToFileURL(path.join(root, 'card.js')).href),
    hand: await import(pathToFileURL(path.join(root, 'hand-types.js')).href),
    settle: await import(pathToFileURL(path.join(root, 'settlement.js')).href),
    ai: await import(pathToFileURL(path.join(root, 'ai-decision.js')).href),
    tribute: await import(pathToFileURL(path.join(root, 'tribute.js')).href),
  };
  return eng;
}

let _rid = 1;
function newId() {
  return `cgd_${Date.now()}_${_rid++}`;
}

function rot(i, me) {
  if (me < 0 || i == null || i < 0) return i;
  return (i - me + 4) % 4;
}

function rotArr(arr, me) {
  if (!arr || me < 0) return arr;
  return [0, 1, 2, 3].map((k) => arr[(k + me) % 4]);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(cards, currentRank) {
  return cards.slice().sort((a, b) => {
    const ra = a.rank === 17 ? 100 : a.rank === 16 ? 99 : (a.rank === currentRank ? 15 : a.rank);
    const rb = b.rank === 17 ? 100 : b.rank === 16 ? 99 : (b.rank === currentRank ? 15 : b.rank);
    if (rb !== ra) return rb - ra;
    return (b.suit || 0) - (a.suit || 0);
  });
}

function rankLabel(r) {
  const m = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  return m[r] || String(r);
}

function patternLabel(p) {
  if (p === 'double_down') return '双下升3';
  if (p === 'one_three') return '1+3 升2';
  if (p === 'one_four') return '1+4 升1';
  return p || '';
}

export class GdTable {
  constructor(opts = {}) {
    this.id = newId();
    this.roomKey = opts.roomKey || 'novice';
    this.currency = opts.currency || 'ingot';
    this.now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this.matchMs = opts.matchMs ?? (
      (opts.roomKey === 'friend' || String(opts.roomKey || '').startsWith('dual_'))
        ? FRIEND_MATCH_MS
        : MATCH_MS
    );
    this.minHumansBeforeAi = opts.minHumansBeforeAi ?? (
      (opts.roomKey === 'friend' || String(opts.roomKey || '').startsWith('dual_'))
        ? DUAL_MIN_HUMANS
        : 1
    );
    this.aiThinkMs = opts.aiThinkMs ?? 0;
    this._aiNeedsContinue = false;
    const meta = ROOMS_META[this.roomKey] || ROOMS_META.novice;
    this.stake = opts.stake ?? meta.stake;
    this.phase = 'match';
    this.matchEndsAt = 0;
    this.seats = [null, null, null, null];
    this.names = ['空位', '空位', '空位', '空位'];
    this.humanIndex = 0;
    this.forfeitScores = null;
    this.settledReason = null;
    this.currentRank = 2;
    this.team0Level = 2;
    this.team1Level = 2;
    this.bankerTeam = 0;
    this.hands = [[], [], [], []];
    this.finished = [];
    this.currentSeat = 0;
    this.leadSeat = 0;
    this.lastPlay = null;
    this.seatPlays = [null, null, null, null];
    this.passStreak = 0;
    this.message = '';
    this.lastRecord = null;
    this.career = null;
    this.skipTribute = true; // play9gd1: tribute cut
    this.ready = this._boot(opts);
  }

  async _boot(opts) {
    await loadEngine();
    if (opts.humanUid && opts.match !== true && opts.autoDeal !== false) {
      this.occupy(opts.humanUid, opts.humanName || '茶馆');
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

  resetMatchWindow() {
    if (this.phase !== 'match') return false;
    this.matchEndsAt = this.now() + this.matchMs;
    return true;
  }

  clearMatchWindow() {
    this.matchEndsAt = 0;
  }

  remainingMatchMs() {
    if (!this.matchEndsAt) return 0;
    return this.matchEndsAt - this.now();
  }

  canAcceptNewHuman() {
    if (this.phase !== 'match') return false;
    if (this.humanCount === 0) return true;
    return this.remainingMatchMs() >= FRESH_JOIN_MIN_REMAIN_MS;
  }

  occupy(uid, name) {
    const existing = this.seatOf(uid);
    if (existing >= 0) {
      this.seats[existing].connected = true;
      if (!this.seats[existing].fullTrustee) this.seats[existing].trustee = false;
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
      fullTrustee: false,
      disconnectedAt: null,
    };
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
      this.seats[seat].disconnectedAt = null;
      if (this.seats[seat].fullTrustee) this.seats[seat].trustee = true;
      else this.seats[seat].trustee = false;
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

  setFullTrustee(uidOrSeat, on = true) {
    const seat = typeof uidOrSeat === 'number' ? uidOrSeat : this.seatOf(uidOrSeat);
    if (seat < 0 || !this.seats[seat]) return false;
    const s = this.seats[seat];
    if (s.kind !== 'human') return false;
    const want = !!on;
    s.fullTrustee = want;
    s.trustee = want;
    if (want) s.connected = true;
    if (want) this.driveAi();
    return true;
  }

  isWaitingHuman(seat) {
    const s = this.seats[seat];
    return Boolean(s && s.kind === 'human' && s.connected && !s.trustee);
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
          trustee: true,
          fullTrustee: false,
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
    const need = this.minHumansBeforeAi || 1;
    const humans = this.humanCount;
    // Wait until timeout unless ≥need humans (AI fills rest) — mirror DDZ.
    if (remaining > 0 && humans < 4 && humans < need) {
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
    this.lastRecord = null;
    this.finished = [];
    this.lastPlay = null;
    this.seatPlays = [null, null, null, null];
    this.passStreak = 0;
    this.message = '';

    if (!this.career) {
      this.career = new eng.settle.GuanDanSettlement({
        team0Level: this.team0Level,
        team1Level: this.team1Level,
        bankerTeam: this.bankerTeam,
      });
    }
    this.currentRank = this.career.currentRank();
    const deck = shuffle(shuffle(eng.card.createGuanDanDeck()));
    this.hands = [[], [], [], []];
    for (let i = 0; i < 108; i++) this.hands[i % 4].push(deck[i]);
    this.hands = this.hands.map((h) => sortHand(h, this.currentRank));

    this.leadSeat = 0;
    for (let s = 0; s < 4; s++) {
      if (this.hands[s].some((c) => eng.card.isWild(c, this.currentRank))) {
        this.leadSeat = s;
        break;
      }
    }
    this.currentSeat = this.leadSeat;
    this.phase = 'play';
    this.message = `${this.names[this.currentSeat]} 先出 · 打 ${rankLabel(this.currentRank)}`;
    this.driveAi();
  }

  /** Rematch: keep seats, new hand (tribute still skipped). */
  async rematch() {
    if (this.phase !== 'settle' && this.phase !== 'play') return false;
    await this.deal();
    return true;
  }

  activeSeats() {
    return [0, 1, 2, 3].filter((s) => this.hands[s].length > 0 && !this.finished.includes(s));
  }

  nextActive(from) {
    for (let i = 1; i <= 4; i++) {
      const s = (from + i) % 4;
      if (this.hands[s].length > 0 && !this.finished.includes(s)) return s;
    }
    return from;
  }

  play(uid, cardIds) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('not_seated');
    const ids = Array.isArray(cardIds) ? cardIds : [];
    const cards = ids.map((id) => this.hands[seat].find((c) => String(c.id) === String(id))).filter(Boolean);
    if (cards.length !== ids.length) throw new Error('not_in_hand');
    const r = this._act(seat, cards);
    if (!r.ok) throw new Error(r.reason || 'illegal');
    this.driveAi();
    return r;
  }

  pass(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0) throw new Error('not_seated');
    const r = this._act(seat, null);
    if (!r.ok) throw new Error(r.reason || 'illegal');
    this.driveAi();
    return r;
  }

  _act(seat, cards) {
    if (this.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (Number(seat) !== this.currentSeat) return { ok: false, reason: 'not_turn' };
    if (this.finished.includes(seat)) return { ok: false, reason: 'already_finished' };

    if (!cards || cards.length === 0) {
      if (!this.lastPlay) return { ok: false, reason: 'must_lead' };
      this.passStreak += 1;
      const lastSeat = this.lastPlay.seat;
      const others = this.activeSeats().filter((s) => s !== lastSeat);
      if (this.passStreak >= others.length || others.length === 0) {
        const finisherLead = this.finished.includes(lastSeat);
        this.lastPlay = null;
        this.seatPlays = [null, null, null, null];
        this.passStreak = 0;
        if (finisherLead) {
          const pw = eng.settle.resolvePassWind({
            finishedSeat: lastSeat,
            lastPlaySeat: lastSeat,
            wasBeaten: false,
            activeSeats: this.activeSeats(),
          });
          if (pw.passWind && pw.nextSeat != null && this.activeSeats().includes(pw.nextSeat)) {
            this.currentSeat = pw.nextSeat;
            this.message = `${this.names[seat]} 过 · 接风 ${this.names[this.currentSeat]}`;
          } else {
            this.currentSeat = this.nextActive(lastSeat);
            this.message = `${this.names[seat]} 过 · ${this.names[this.currentSeat]} 自由出牌`;
          }
        } else {
          this.currentSeat = (this.hands[lastSeat]?.length > 0 && !this.finished.includes(lastSeat))
            ? lastSeat
            : this.nextActive(lastSeat);
          this.message = `${this.names[seat]} 过 · ${this.names[this.currentSeat]} 自由出牌`;
        }
      } else {
        this.currentSeat = this.nextActive(seat);
        this.message = `${this.names[seat]} 过`;
      }
      return { ok: true };
    }

    const hand = this.hands[seat];
    const used = new Set();
    for (const c of cards) {
      if (!c || c.id == null || used.has(c.id) || !hand.some((h) => h.id === c.id)) {
        return { ok: false, reason: 'not_in_hand' };
      }
      used.add(c.id);
    }
    const parsed = eng.hand.bestGuanDanHand(cards, this.currentRank);
    if (!parsed) return { ok: false, reason: 'invalid_hand' };
    if (this.lastPlay) {
      if (!eng.hand.canSuppress(parsed, this.lastPlay.hand, this.currentRank)) {
        return { ok: false, reason: 'cannot_beat' };
      }
    }

    const idSet = new Set(cards.map((c) => c.id));
    this.hands[seat] = hand.filter((c) => !idSet.has(c.id));
    this.lastPlay = { seat, hand: parsed, cards: cards.map((c) => ({ ...c })) };
    this.seatPlays[seat] = { seat, cards: this.lastPlay.cards };
    this.passStreak = 0;
    this.leadSeat = seat;
    this.message = `${this.names[seat]} 出 ${parsed.name || ''}`;

    if (this.hands[seat].length === 0) {
      this.finished.push(seat);
      this.message = `${this.names[seat]} · 第 ${this.finished.length} 名`;
      const mate = eng.tribute.teammateOf(seat);
      if (this.finished.includes(mate) || this.finished.length >= 3) {
        this._completeRanking();
        return { ok: true, finished: true };
      }
      this.currentSeat = this.nextActive(seat);
    } else {
      this.currentSeat = this.nextActive(seat);
    }
    return { ok: true };
  }

  _completeRanking() {
    const rest = [0, 1, 2, 3].filter((s) => !this.finished.includes(s));
    rest.sort((a, b) => this.hands[a].length - this.hands[b].length || a - b);
    this.finished = [...this.finished, ...rest];
    this._settle();
  }

  _settle() {
    this.phase = 'settle';
    const order = this.finished.slice(0, 4);
    while (order.length < 4) {
      for (let s = 0; s < 4; s++) {
        if (!order.includes(s)) order.push(s);
      }
    }
    const rec = this.career.settleHand(order);
    const progress = eng.settle.calculateLevelProgress(order, { currentLevel: rec.levelBefore });
    const winTeam = rec.winTeam;
    const mult = progress.pattern === 'double_down' ? 3
      : progress.pattern === 'one_three' ? 2
        : 1;
    const deltas = [0, 1, 2, 3].map((s) => {
      const team = s % 2;
      return team === winTeam ? this.stake * mult : -this.stake * mult;
    });
    this.message = `结算 · ${patternLabel(progress.pattern)}`;
    this.lastRecord = {
      ...rec,
      deltas,
      stake: this.stake,
      mult,
      names: this.names.slice(),
      finishOrder: order,
      places: ['头游', '二游', '三游', '末游'],
      currentRank: this.currentRank,
      nextRank: this.career.currentRank(),
      winnerTeam: winTeam,
      pattern: progress.pattern,
      withdrawable: false,
    };
    this.team0Level = this.career.teamLevels?.[0] ?? this.team0Level;
    this.team1Level = this.career.teamLevels?.[1] ?? this.team1Level;
  }

  forfeit(uid) {
    const seat = this.seatOf(uid);
    if (seat < 0 || this.phase === 'settle') return;
    // Losing team = forfeiter's team
    const loseTeam = seat % 2;
    const winTeam = 1 - loseTeam;
    const deltas = [0, 1, 2, 3].map((s) => (s % 2 === winTeam ? this.stake : -this.stake));
    this.forfeitScores = deltas;
    this.settledReason = 'forfeit';
    this.phase = 'settle';
    this.lastRecord = {
      deltas,
      stake: this.stake,
      mult: 1,
      names: this.names.slice(),
      finishOrder: [0, 1, 2, 3].sort((a, b) => {
        const aw = a % 2 === winTeam ? 0 : 1;
        const bw = b % 2 === winTeam ? 0 : 1;
        return aw - bw || a - b;
      }),
      places: ['头游', '二游', '三游', '末游'],
      currentRank: this.currentRank,
      winnerTeam: winTeam,
      pattern: 'forfeit',
      reason: 'forfeit',
      withdrawable: false,
    };
    this.message = `结算 · ${this.names[seat]} 认负`;
  }

  needsAiAct() {
    if (this.phase !== 'play' || this.forfeitScores) return false;
    return !this.isWaitingHuman(this.currentSeat);
  }


  _pickAiCards(seat, dec) {
    const hand = this.hands[seat] || [];
    const pool = hand.slice();
    const take = (pred) => {
      const idx = pool.findIndex(pred);
      if (idx < 0) return null;
      return pool.splice(idx, 1)[0];
    };
    const fromList = (list) => {
      if (!list?.length) return [];
      const out = [];
      for (const c of list) {
        let got = null;
        if (c?.id != null) got = take((h) => String(h.id) === String(c.id));
        if (!got && c) got = take((h) => h.rank === c.rank && h.suit === c.suit);
        if (!got && c) got = take((h) => h.rank === c.rank);
        if (!got) return [];
        out.push(got);
      }
      return out;
    };
    let cards = fromList(dec.cards);
    if (cards.length) return cards;
    cards = fromList(dec.hand?.cards);
    if (cards.length) return cards;
    const pattern = dec.hand?.pattern || [];
    if (pattern.length) {
      const out = [];
      for (const r of pattern) {
        const got = take((h) => h.rank === r);
        if (!got) return [];
        out.push(got);
      }
      return out;
    }
    return [];
  }

  driveAi() {
    if (this.phase !== 'play' || !eng) return;
    this._aiNeedsContinue = false;
    let guard = 0;
    while (guard++ < 200) {
      if (this.phase === 'settle') return;
      const seat = this.currentSeat;
      if (this.isWaitingHuman(seat)) return;
      const dec = eng.ai.makeGuanDanAIDecision(
        { seat, hand: this.hands[seat] },
        {
          currentRank: this.currentRank,
          currentSeat: seat,
          lastPlaySeat: this.lastPlay?.seat ?? null,
          lastHand: this.lastPlay?.hand ?? null,
          handCounts: this.hands.map((h) => h.length),
          activeSeats: this.activeSeats(),
        },
      );
      if (dec.action === eng.ai.GuanDanAIAction.PASS || !dec.hand) {
        // Free lead cannot pass — dump lowest single
        if (!this.lastPlay) {
          const c = this.hands[seat][this.hands[seat].length - 1];
          if (c) this._act(seat, [c]);
          else return;
        } else {
          this._act(seat, null);
        }
      } else {
        const playCards = this._pickAiCards(seat, dec);
        if (!playCards.length) {
          if (!this.lastPlay) {
            const c = this.hands[seat][this.hands[seat].length - 1];
            if (c) this._act(seat, [c]);
            else return;
          } else {
            this._act(seat, null);
          }
        } else {
          const r = this._act(seat, playCards);
          if (!r.ok) {
            if (!this.lastPlay) {
              const c = this.hands[seat][this.hands[seat].length - 1];
              if (c) this._act(seat, [c]);
            } else {
              this._act(seat, null);
            }
          }
        }
      }
      if (this.aiThinkMs > 0 && this.phase === 'play' && !this.isWaitingHuman(this.currentSeat)) {
        this._aiNeedsContinue = true;
        return;
      }
    }
  }

  remainMeter() {
    const ranks = [17, 16, this.currentRank, 14, 13, 12, 11];
    const all = this.hands.flat();
    const counts = {};
    for (const r of ranks) counts[r] = all.filter((c) => c.rank === r).length;
    return counts;
  }

  publicState(uid) {
    const me = this.seatOf(uid);
    const names = this.names.slice();
    const seats = this.seats.map((s, i) => {
      if (!s) return { empty: true, name: names[i], kind: null, connected: false, trustee: false, fullTrustee: false };
      return {
        name: s.name,
        kind: s.kind,
        connected: !!s.connected,
        trustee: !!s.trustee,
        fullTrustee: !!s.fullTrustee,
        empty: false,
      };
    });

    if (this.phase === 'match') {
      return {
        id: this.id,
        game: 'guandan',
        roomKey: this.roomKey,
        currency: this.currency,
        stake: this.stake,
        phase: 'match',
        matchEndsAt: this.matchEndsAt,
        humanCount: this.humanCount,
        names: rotArr(names, me < 0 ? 0 : me) || names,
        seats: rotArr(seats, me < 0 ? 0 : me) || seats,
        handCounts: [0, 0, 0, 0],
        hands: [[], [], [], []],
        myHand: [],
        currentRank: this.currentRank,
        status: '匹配中，超时 AI 补位',
        message: '匹配中',
        matchMs: this.matchMs || MATCH_MS,
        humanIndex: 0,
        backend: 'colyseus',
        skipTribute: true,
        supportedHandTypes: SUPPORTED_HAND_TYPES,
      };
    }

    const viewMe = me < 0 ? 0 : me;
    const handsView = this.hands.map((h, i) => (
      i === me || this.phase === 'settle'
        ? h.map((c) => ({ ...c }))
        : h.map((c) => ({ id: c.id, hidden: true }))
    ));
    const lastPlay = this.lastPlay
      ? {
        seat: rot(this.lastPlay.seat, viewMe),
        name: this.lastPlay.hand?.name,
        type: this.lastPlay.hand?.type,
        cards: this.lastPlay.cards,
        text: (this.lastPlay.cards || []).map((c) => eng.card.cardText(c)).join(' '),
      }
      : null;

    const seatPlays = this.seatPlays.map((p) => (p
      ? { seat: rot(p.seat, viewMe), cards: p.cards }
      : null));

    return {
      id: this.id,
      game: 'guandan',
      roomKey: this.roomKey,
      currency: this.currency,
      stake: this.stake,
      phase: this.phase,
      matchEndsAt: this.matchEndsAt,
      humanCount: this.humanCount,
      currentRank: this.currentRank,
      currentSeat: rot(this.currentSeat, viewMe),
      leadSeat: rot(this.leadSeat, viewMe),
      lastPlay,
      seatPlays: rotArr(seatPlays, viewMe),
      remainMeter: this.remainMeter(),
      finished: this.finished.map((s) => rot(s, viewMe)),
      hands: rotArr(handsView, viewMe),
      handCounts: rotArr(this.hands.map((h) => h.length), viewMe),
      myHand: me >= 0 ? this.hands[me].map((c) => ({ ...c })) : [],
      names: rotArr(names, viewMe),
      seats: rotArr(seats, viewMe),
      message: this.message,
      status: this.message,
      lastRecord: this.lastRecord
        ? {
          ...this.lastRecord,
          deltas: rotArr(this.lastRecord.deltas, viewMe),
          finishOrder: (this.lastRecord.finishOrder || []).map((s) => rot(s, viewMe)),
          names: rotArr(this.lastRecord.names || names, viewMe),
        }
        : null,
      settlement: this.career?.snapshot?.() || null,
      humanTurn: this.phase === 'play' && me >= 0 && this.currentSeat === me && this.isWaitingHuman(me),
      isHumanTurn: this.phase === 'play' && me >= 0 && this.currentSeat === me && this.isWaitingHuman(me),
      humanReturn: false,
      tribute: null,
      skipTribute: true,
      myTrustee: me >= 0 ? !!this.seats[me]?.trustee : false,
      myFullTrustee: me >= 0 ? !!this.seats[me]?.fullTrustee : false,
      backend: 'colyseus',
      supportedHandTypes: SUPPORTED_HAND_TYPES,
      withdrawable: false,
    };
  }

  async maybePostWallet() {
    // Chips are non-withdrawable in-game numbers; client applies deltas locally.
    return this.lastRecord?.deltas || this.forfeitScores || null;
  }
}
