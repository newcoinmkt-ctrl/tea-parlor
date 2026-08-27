/**
 * 斗地主人机房间逻辑（权威服）
 * 与 Pinus RoomManager 同构：复用 packages/doudizhu-engine
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOMS_META = {
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

export class DdzTable {
  constructor(opts) {
    this.id = newId();
    this.roomKey = opts.roomKey || 'novice';
    this.currency = opts.currency || 'ingot';
    this.humanUid = opts.humanUid;
    this.humanIndex = 0;
    this.names = [opts.humanName || '茶馆', '茶友A', '茶友B'];
    const meta = ROOMS_META[this.roomKey] || ROOMS_META.novice;
    this.stake = meta.stake;
    this.baseRoomScore = meta.baseRoomScore;
    this.engine = null;
    this.ready = this._init();
  }

  async _init() {
    await loadEngine();
    this.engine = new engineMod.DoudizhuEngine({
      playerNames: this.names,
      humanIndex: this.humanIndex,
      baseRoomScore: this.baseRoomScore,
    });
    this.engine.startGame();
    this.driveAi();
  }

  async ensureReady() {
    await this.ready;
  }

  seatOf(uid) {
    return uid === this.humanUid ? this.humanIndex : -1;
  }

  driveAi() {
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
  }

  publicState(uid) {
    const eng = this.engine;
    if (!eng) {
      return {
        id: this.id,
        roomKey: this.roomKey,
        currency: this.currency,
        phase: 'bid',
        status: '加载中…',
        names: this.names,
        backend: 'colyseus',
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

    let scores = null;
    let humanScore = null;
    if (st.settlement) {
      const s = st.settlement;
      if (Array.isArray(s.scores)) scores = s.scores;
      else if (s.playerScores) scores = s.playerScores;
      else if (s.deltas) scores = s.deltas;
      else if (typeof s.humanDelta === 'number') humanScore = s.humanDelta;
      if (scores) humanScore = scores[this.humanIndex];
    }

    const lastPlay = st.lastPlay
      ? {
          player: st.lastPlay.player,
          cards: st.lastPlay.hand?.cards || st.lastPlay.cards || [],
          type: st.lastPlay.hand?.type || st.lastPlay.type || null,
        }
      : null;

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
      lastPlay,
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
      backend: 'colyseus',
    };
  }

  bid(uid, score) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const ok = this.engine.bid(this.humanIndex, Number(score) || 0);
    if (!ok) throw new Error('叫分无效');
    this.driveAi();
  }

  play(uid, cardIds) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const hand = this.engine.hands[this.humanIndex];
    const cards = cardIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) throw new Error('手牌不匹配');
    const res = this.engine.play(this.humanIndex, cards);
    if (!res?.ok) throw new Error(res?.reason || '出牌失败');
    this.driveAi();
  }

  pass(uid) {
    if (this.seatOf(uid) !== this.humanIndex) throw new Error('仅本人可操作');
    const ok = this.engine.pass(this.humanIndex);
    if (!ok) throw new Error('不能不出');
    this.driveAi();
  }

  hint(uid) {
    if (this.seatOf(uid) !== this.humanIndex) return [];
    const eng = this.engine;
    const prev =
      eng.lastPlay && eng.lastPlay.player !== this.humanIndex ? eng.lastPlay.hand : null;
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
      handCounts: eng.hands.map((h) => h.length),
    });
    return d?.cards || [];
  }
}
