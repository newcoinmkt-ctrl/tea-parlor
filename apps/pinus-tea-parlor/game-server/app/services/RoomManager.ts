/**
 * Pinus 斗地主人机房间 — 使用 @tea-parlor/doudizhu-engine 完整规则 + AI
 */
import * as path from 'path';
import { pathToFileURL } from 'url';

type Currency = 'ingot' | 'crypto';

const ROOMS_META: Record<string, { stake: number; unit: number; baseRoomScore: number }> = {
  novice: { stake: 100, unit: 1, baseRoomScore: 1 },
  classic: { stake: 500, unit: 5, baseRoomScore: 5 },
  friend: { stake: 200, unit: 2, baseRoomScore: 2 },
  c_micro: { stake: 0.5, unit: 1, baseRoomScore: 1 },
  c_std: { stake: 2, unit: 1, baseRoomScore: 2 },
  c_high: { stake: 10, unit: 1, baseRoomScore: 5 },
};

let engineMod: any = null;
let aiMod: any = null;
let rulesMod: any = null;

/** 避免 tsc 把 import() 编成 require()，强制原生 ESM 动态加载 */
const dynImport = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

async function loadEngine() {
  if (engineMod && aiMod) return;
  // dist/app/services -> repo root packages
  const root = path.resolve(__dirname, '../../../../../../packages/doudizhu-engine/src');
  engineMod = await dynImport(pathToFileURL(path.join(root, 'engine.js')).href);
  aiMod = await dynImport(pathToFileURL(path.join(root, 'ai.js')).href);
  rulesMod = await dynImport(pathToFileURL(path.join(root, 'rules.js')).href);
}

let _rid = 1;
function newId() {
  return `ddz_${Date.now()}_${_rid++}`;
}

export class DdzRoom {
  id: string;
  roomKey: string;
  currency: Currency;
  stake: number;
  humanUid: string;
  humanIndex = 0;
  names: string[];
  engine: any;
  private ready: Promise<void>;

  constructor(opts: {
    humanUid: string;
    humanName: string;
    roomKey: string;
    currency: Currency;
  }) {
    this.id = newId();
    this.roomKey = opts.roomKey;
    this.currency = opts.currency;
    this.humanUid = opts.humanUid;
    const meta = ROOMS_META[opts.roomKey] || ROOMS_META.novice;
    this.stake = meta.stake;
    this.names = [opts.humanName || '茶馆', '茶友A', '茶友B'];

    this.ready = (async () => {
      await loadEngine();
      this.engine = new engineMod.DoudizhuEngine({
        playerNames: this.names,
        humanIndex: this.humanIndex,
        baseRoomScore: meta.baseRoomScore,
      });
      this.engine.startGame();
      this.driveAi();
    })();
  }

  async ensureReady() {
    await this.ready;
  }

  private seatOf(uid: string) {
    return uid === this.humanUid ? this.humanIndex : -1;
  }

  private driveAi() {
    const eng = this.engine;
    if (!eng || !aiMod) return;
    let guard = 0;
    while (guard++ < 200) {
      if (eng.phase === engineMod.Phase.SETTLE) return;
      if (eng.phase === engineMod.Phase.BID) {
        if (eng.bidTurn === eng.humanIndex) return;
        const score = aiMod.decideBid(eng.hands[eng.bidTurn], eng.currentBid);
        eng.bid(eng.bidTurn, score);
        continue;
      }
      if (eng.phase === engineMod.Phase.PLAY) {
        if (eng.currentPlayer === eng.humanIndex) return;
        const seat = eng.currentPlayer;
        const prev =
          eng.lastPlay && eng.lastPlay.player !== seat ? eng.lastPlay.hand : null;
        const decision = aiMod.decidePlay({
          hand: eng.hands[seat],
          prevHand: prev,
          isLandlord: eng.landlordIndex === seat,
          myIndex: seat,
          landlordIndex: eng.landlordIndex,
          handCounts: eng.hands.map((h: any[]) => h.length),
          prevPlayer: eng.lastPlay?.player,
        });
        if (!decision?.cards?.length) {
          if (prev) eng.pass(seat);
          else {
            // 自由出最小单张
            const sorted = eng.hands[seat].slice().sort((a: any, b: any) => a.rank - b.rank);
            eng.play(seat, [sorted[0]]);
          }
        } else {
          eng.play(seat, decision.cards);
        }
        continue;
      }
      return;
    }
  }

  publicState(uid: string) {
    const eng = this.engine;
    if (!eng) {
      return {
        id: this.id,
        roomKey: this.roomKey,
        currency: this.currency,
        phase: 'bid',
        status: '加载中…',
        names: this.names,
      };
    }
    const st = eng.getState();
    const me = this.seatOf(uid);
    let status = '准备';
    if (st.phase === 'bid') status = `叫分中 · 轮到 ${this.names[st.bidTurn]}`;
    else if (st.phase === 'play') status = `出牌中 · 轮到 ${this.names[st.currentPlayer]}`;
    else if (st.phase === 'settle') {
      const w = st.settlement?.winnerIndex ?? -1;
      status = `结算 · ${w >= 0 ? this.names[w] : '结束'}`;
    }

    // 人类视角分数（引擎 settlement 结构）
    let scores: number[] | null = null;
    let humanScore: number | null = null;
    if (st.settlement) {
      const s = st.settlement;
      // calculateSettlement typically returns per-player deltas
      if (Array.isArray(s.scores)) scores = s.scores;
      else if (s.playerScores) scores = s.playerScores;
      else if (typeof s.humanDelta === 'number') {
        humanScore = s.humanDelta;
      } else if (s.deltas) scores = s.deltas;
      // fallback from landlord win
      if (!scores && s.baseScore != null) {
        const base = (s.baseScore || 1) * (s.multiplier || 1) * (this.stake || 100);
        const landlordWin = st.winnerSide === 'landlord';
        scores = [0, 1, 2].map((i) => {
          if (i === st.landlordIndex) return landlordWin ? base * 2 : -base * 2;
          return landlordWin ? -base : base;
        });
      }
      if (scores) humanScore = scores[this.humanIndex];
    }

    return {
      id: this.id,
      roomKey: this.roomKey,
      currency: this.currency,
      stake: this.stake,
      phase: st.phase,
      landlord: st.landlordIndex,
      currentBid: st.currentBid,
      bidTurn: st.bidTurn,
      bidScores: st.bidScores,
      currentPlayer: st.currentPlayer,
      multiplier: st.multiplier,
      bombCount: st.bombCount,
      handsCount: st.handCounts,
      myHand: me >= 0 ? st.hands[me] : [],
      bottom: st.bottomRevealed ? st.bottomCards : null,
      lastPlay: st.lastPlay,
      names: this.names,
      humanIndex: this.humanIndex,
      winner: st.settlement?.winnerIndex ?? null,
      spring: st.spring,
      scores,
      humanScore,
      settlement: st.settlement,
      status,
      isHumanTurn: st.isHumanTurn,
      canPass: st.canPass,
    };
  }

  bid(uid: string, score: number) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const ok = this.engine.bid(this.humanIndex, Number(score) || 0);
    if (!ok) throw new Error('叫分无效');
    this.driveAi();
  }

  play(uid: string, cardIds: string[]) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const hand = this.engine.hands[this.humanIndex];
    const cards = cardIds.map((id: string) => hand.find((c: any) => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) throw new Error('手牌不匹配');
    const res = this.engine.play(this.humanIndex, cards);
    if (!res?.ok) throw new Error(res?.reason || '出牌失败');
    this.driveAi();
  }

  pass(uid: string) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const ok = this.engine.pass(this.humanIndex);
    if (!ok) throw new Error('不能不出');
    this.driveAi();
  }

  hint(uid: string) {
    if (this.seatOf(uid) !== this.humanIndex) return [];
    const eng = this.engine;
    const prev =
      eng.lastPlay && eng.lastPlay.player !== this.humanIndex ? eng.lastPlay.hand : null;
    // getHint from rules if available
    if (rulesMod?.getHint) {
      const h = rulesMod.getHint(eng.hands[this.humanIndex], prev);
      return h?.cards || [];
    }
    const d = aiMod.decidePlay({
      hand: eng.hands[this.humanIndex],
      prevHand: prev,
      isLandlord: eng.landlordIndex === this.humanIndex,
      myIndex: this.humanIndex,
      landlordIndex: eng.landlordIndex,
      handCounts: eng.hands.map((h: any[]) => h.length),
    });
    return d?.cards || [];
  }
}

class RoomManager {
  private rooms = new Map<string, DdzRoom>();
  private uidRoom = new Map<string, string>();

  touchPlayer(_uid: string, _name: string) {}

  async createDdzRoom(opts: {
    uid: string;
    name: string;
    roomId: string;
    currency: Currency;
  }) {
    this.leave(opts.uid);
    const room = new DdzRoom({
      humanUid: opts.uid,
      humanName: opts.name,
      roomKey: opts.roomId,
      currency: opts.currency,
    });
    await room.ensureReady();
    this.rooms.set(room.id, room);
    this.uidRoom.set(opts.uid, room.id);
    return room;
  }

  get(id: string) {
    return this.rooms.get(id) || null;
  }

  findByUid(uid: string) {
    const id = this.uidRoom.get(uid);
    return id ? this.rooms.get(id) || null : null;
  }

  leave(uid: string) {
    const id = this.uidRoom.get(uid);
    if (!id) return;
    this.uidRoom.delete(uid);
    this.rooms.delete(id);
  }
}

let _rm: RoomManager | null = null;
export function getRoomManager() {
  if (!_rm) _rm = new RoomManager();
  return _rm;
}
