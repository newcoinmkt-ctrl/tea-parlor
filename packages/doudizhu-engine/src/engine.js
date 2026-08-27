/**
 * JJ 经典斗地主对局引擎（本地三人：1 人 + 2 AI）
 */

import { createDeck, riffleShuffle, dealRoundRobin, sortCards } from './card.js';
import {
  applyBid,
  createBiddingState,
} from './bidding.js';
import {
  parseHand,
  canBeat,
  removeCards,
  HandType,
} from './rules.js';
import {
  calculateSettlement,
  detectSpring,
} from './settlement.js';

export const Phase = {
  IDLE: 'idle',
  DEAL: 'deal',
  BID: 'bid',
  PLAY: 'play',
  SETTLE: 'settle',
};

export class DoudizhuEngine {
  constructor(options = {}) {
    this.playerNames = options.playerNames || ['玩家', '上家', '下家'];
    this.humanIndex = options.humanIndex ?? 0;
    this.baseRoomScore = options.baseRoomScore ?? 1; // 房间底注系数
    this.resetMatch();
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners) fn(event, data, this.getState());
  }

  resetMatch() {
    this.phase = Phase.IDLE;
    this.hands = [[], [], []];
    this.bottomCards = [];
    this.landlordIndex = -1;
    this.bidScores = [0, 0, 0]; // 各玩家叫分
    this.biddingState = createBiddingState({ starter: 0 });
    this.currentBid = 0;
    this.bidStarter = 0;
    this.bidTurn = 0;
    this.bidRoundPassed = 0;
    this.bidFinished = false;
    this.baseScore = 1;
    this.multiplier = 1;
    this.bombCount = 0;
    this.currentPlayer = 0;
    this.lastPlay = null; // { player, hand: parseResult }
    this.passCount = 0;
    this.playedHistory = [];
    this.playedByPlayer = [[], [], []]; // 每人出过的牌（用于春天）
    this.turnPlayCount = [0, 0, 0]; // 每人出牌次数（非 pass）
    this.winnerSide = null; // 'landlord' | 'farmer'
    this.spring = false;
    this.settlement = null;
    this.selectedIds = new Set();
    this._bidCount = 0;
  }

  getState() {
    return {
      phase: this.phase,
      hands: this.hands.map((h) => h.slice()),
      handCounts: this.hands.map((h) => h.length),
      bottomCards: this.bottomCards.slice(),
      bottomRevealed: this.phase === Phase.PLAY || this.phase === Phase.SETTLE,
      landlordIndex: this.landlordIndex,
      bidScores: this.bidScores.slice(),
      currentBid: this.currentBid,
      bidTurn: this.bidTurn,
      baseScore: this.baseScore,
      multiplier: this.multiplier,
      bombCount: this.bombCount,
      currentPlayer: this.currentPlayer,
      lastPlay: this.lastPlay
        ? {
            player: this.lastPlay.player,
            cards: this.lastPlay.hand.cards.slice(),
            type: this.lastPlay.hand.type,
            weight: this.lastPlay.hand.weight,
          }
        : null,
      passCount: this.passCount,
      playerNames: this.playerNames,
      humanIndex: this.humanIndex,
      winnerSide: this.winnerSide,
      spring: this.spring,
      settlement: this.settlement,
      isHumanTurn: this.isHumanTurn(),
      canPass: this.canPass(),
    };
  }

  isHumanTurn() {
    if (this.phase === Phase.BID) return this.bidTurn === this.humanIndex;
    if (this.phase === Phase.PLAY) return this.currentPlayer === this.humanIndex;
    return false;
  }

  canPass() {
    // 有上家出牌且不是自己领出时才能不要
    if (this.phase !== Phase.PLAY) return false;
    if (this.currentPlayer !== this.humanIndex) return false;
    return this.lastPlay !== null && this.lastPlay.player !== this.humanIndex;
  }

  /** 开始新局 */
  startGame(options = {}) {
    this.resetMatch();
    this.phase = Phase.DEAL;
    const customDeck = Array.isArray(options.deck);
    const deck = customDeck ? options.deck.slice() : riffleShuffle(createDeck());
    if (deck.length !== 54) {
      throw new Error('doudizhu_deck_must_have_54_cards');
    }
    const dealStart = options.dealStart ?? (customDeck ? 0 : Math.floor(Math.random() * 3));
    const dealt = dealRoundRobin(deck, 3, 17, dealStart);
    this.hands = dealt.hands.map((h) => sortCards(h));
    this.bottomCards = dealt.rest.slice(0, 3);
    this.bidStarter = options.bidStarter ?? Math.floor(Math.random() * 3);
    if (!Number.isInteger(this.bidStarter) || this.bidStarter < 0 || this.bidStarter > 2) {
      throw new Error('invalid_bid_starter');
    }
    this.bidTurn = this.bidStarter;
    this.biddingState = createBiddingState({ starter: this.bidStarter });
    this.bidScores = this.biddingState.bidScores.map((score) => score ?? 0);
    this.phase = Phase.BID;
    this.emit('deal', {});
    this.emit('phase', { phase: Phase.BID });
    this.scheduleAI();
  }

  /** 叫分 0=不叫, 1/2/3 */
  bid(player, score) {
    if (this.phase !== Phase.BID) return false;

    const result = applyBid(this.biddingState, player, score);
    if (!result.ok) return false;

    this.biddingState = result.state;
    this.bidScores = this.biddingState.bidScores.map((s) => s ?? 0);
    this.currentBid = this.biddingState.currentBid;
    this.landlordIndex = this.biddingState.landlordIndex;
    this.emit('bid', { player, score });

    if (this.biddingState.finished) {
      this.finishBid();
      return true;
    }

    this.bidTurn = this.biddingState.turn;

    this.emit('turn', { phase: Phase.BID, player: this.bidTurn });
    this.scheduleAI();
    return true;
  }

  finishBid() {
    this._bidCount = 0;
    this.baseScore = this.biddingState.baseScore || this.currentBid || 1;
    this.currentBid = this.baseScore;
    this.landlordIndex = this.biddingState.landlordIndex;
    this.multiplier = 1;
    // 底牌给地主
    this.hands[this.landlordIndex] = sortCards([
      ...this.hands[this.landlordIndex],
      ...this.bottomCards,
    ]);
    this.phase = Phase.PLAY;
    this.currentPlayer = this.landlordIndex;
    this.lastPlay = null;
    this.passCount = 0;
    this.emit('landlord', {
      landlordIndex: this.landlordIndex,
      bottomCards: this.bottomCards.slice(),
      baseScore: this.baseScore,
    });
    this.emit('phase', { phase: Phase.PLAY });
    this.scheduleAI();
  }

  /** 出牌 */
  play(player, cards) {
    if (this.phase !== Phase.PLAY) return { ok: false, reason: 'not_play_phase' };
    if (player !== this.currentPlayer) return { ok: false, reason: 'not_your_turn' };

    const hand = this.hands[player];
    if (cards.length === 0) return { ok: false, reason: 'empty' };
    const ids = new Set();
    for (const c of cards) {
      if (!c || c.id == null || ids.has(c.id) || !hand.some((h) => h.id === c.id)) {
        return { ok: false, reason: 'not_in_hand' };
      }
      ids.add(c.id);
    }

    const parsed = parseHand(cards);
    if (!parsed) return { ok: false, reason: 'invalid_type' };

    const prev = this.lastPlay && this.lastPlay.player !== player ? this.lastPlay.hand : null;
    // 若上家是自己（新一轮），prev 应忽略 — lastPlay.player === player 不会发生在正确流程
    // 自由出：lastPlay 为 null 或 两家 pass 后清空
    const mustBeat = this.lastPlay && this.lastPlay.player !== player;
    if (mustBeat) {
      if (!canBeat(this.lastPlay.hand, parsed)) {
        return { ok: false, reason: 'cannot_beat' };
      }
    }

    // 执行
    this.hands[player] = removeCards(hand, cards);
    this.hands[player] = sortCards(this.hands[player]);
    this.lastPlay = { player, hand: parsed };
    this.passCount = 0;
    this.turnPlayCount[player]++;
    this.playedByPlayer[player].push(...cards);

    // 炸弹翻倍
    if (parsed.type === HandType.BOMB || parsed.type === HandType.ROCKET) {
      this.multiplier *= 2;
      this.bombCount++;
      this.emit('bomb', { player, type: parsed.type, multiplier: this.multiplier });
    }

    this.emit('play', {
      player,
      cards: cards.slice(),
      type: parsed.type,
      handCount: this.hands[player].length,
    });

    // 胜利？
    if (this.hands[player].length === 0) {
      this.finishGame(player);
      return { ok: true };
    }

    this.currentPlayer = (player + 1) % 3;
    this.emit('turn', { phase: Phase.PLAY, player: this.currentPlayer });
    this.scheduleAI();
    return { ok: true };
  }

  /** 不出 */
  pass(player) {
    if (this.phase !== Phase.PLAY) return false;
    if (player !== this.currentPlayer) return false;
    // 必须有人出过牌且不是自己领出
    if (!this.lastPlay || this.lastPlay.player === player) return false;

    this.passCount++;
    this.emit('pass', { player });

    // 两家不要 → 新一轮，lastPlay 清空，当前出牌者继续
    if (this.passCount >= 2) {
      const leader = this.lastPlay.player;
      this.lastPlay = null;
      this.passCount = 0;
      this.currentPlayer = leader;
      this.emit('newRound', { player: leader });
    } else {
      this.currentPlayer = (player + 1) % 3;
    }

    this.emit('turn', { phase: Phase.PLAY, player: this.currentPlayer });
    this.scheduleAI();
    return true;
  }

  finishGame(winnerIndex) {
    if (this.settlement) return this.settlement;

    const isLandlordWin = winnerIndex === this.landlordIndex;
    this.winnerSide = isLandlordWin ? 'landlord' : 'farmer';

    // 春天：地主胜且两农民都未出过牌；反春：农民胜且地主只出过一手
    this.spring = detectSpring({
      landlordIndex: this.landlordIndex,
      winnerIndex,
      turnPlayCount: this.turnPlayCount,
    });
    if (this.spring) this.multiplier *= 2;

    this.settlement = calculateSettlement({
      landlordIndex: this.landlordIndex,
      winnerIndex,
      baseScore: this.baseScore,
      baseRoomScore: this.baseRoomScore,
      multiplier: this.multiplier,
      spring: this.spring,
      bombCount: this.bombCount,
      idempotencyKey: [
        'doudizhu',
        this.landlordIndex,
        winnerIndex,
        this.baseScore,
        this.multiplier,
        this.bombCount,
        this.turnPlayCount.join('-'),
      ].join(':'),
    });
    this.phase = Phase.SETTLE;
    this.emit('settle', this.settlement);
    return this.settlement;
  }

  scheduleAI() {
    // The shared engine package is intentionally side-effect free.
    // Apps drive AI/timers externally so the core can be reused by Bot, H5,
    // and future game servers without hidden IO or wallet/database access.
    return false;
  }

  runAI() {
    return false;
  }

  destroy() {
    this.listeners.clear();
  }
}
