import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';

/**
 * Bidding — 叫地主（0 不叫 / 1 / 2 / 3 分）
 * 叫 3 分立即结束；三人行动后取最高分；全不叫则 starter 当地主分 1
 */
export class BiddingState extends BaseState {
  constructor() {
    super(GamePhase.BIDDING);
  }

  enter(machine) {
    const ctx = machine.ctx;
    machine.emit('bidding_start', {
      bidTurn: ctx.bidTurn,
      bidStarter: ctx.bidStarter,
    });
    machine.startPhaseTimer(ctx.bidTimeoutMs, () => this._onTimeout(machine));
  }

  exit(machine) {
    machine.stopPhaseTimer();
  }

  handle(machine, event, payload = {}) {
    switch (event) {
      case 'bid':
        return this._bid(machine, payload.playerIndex, payload.score);
      case 'timeout':
        return this._onTimeout(machine);
      default:
        return super.handle(machine, event, payload);
    }
  }

  _legalScores(ctx) {
    const scores = [0];
    for (let s = 1; s <= 3; s++) {
      if (s > ctx.currentBid) scores.push(s);
    }
    return scores;
  }

  _bid(machine, player, score) {
    const ctx = machine.ctx;
    if (!Number.isInteger(player) || player !== ctx.bidTurn) {
      return { ok: false, reason: 'not_bid_turn' };
    }
    if (!this._legalScores(ctx).includes(score)) {
      return { ok: false, reason: 'invalid_bid_score' };
    }

    ctx.bidScores[player] = score;
    ctx.bidActionCount += 1;
    if (score > ctx.currentBid) {
      ctx.currentBid = score;
      ctx.landlordIndex = player;
    }

    machine.emit('bid', { playerIndex: player, score, currentBid: ctx.currentBid });

    // 叫 3 分结束
    if (score === 3) {
      return this._finishBidding(machine, 3, 'bid_3');
    }

    if (ctx.bidActionCount >= 3) {
      if (ctx.currentBid === 0) {
        ctx.landlordIndex = ctx.bidStarter;
        return this._finishBidding(machine, 1, 'all_pass_starter_landlord');
      }
      return this._finishBidding(machine, ctx.currentBid, 'highest_bid');
    }

    ctx.bidTurn = (ctx.bidTurn + 1) % 3;
    machine.startPhaseTimer(ctx.bidTimeoutMs, () => this._onTimeout(machine));
    return { ok: true, data: { nextBidTurn: ctx.bidTurn } };
  }

  _finishBidding(machine, baseScore, reason) {
    const ctx = machine.ctx;
    ctx.baseScore = baseScore;
    if (ctx.landlordIndex < 0) ctx.landlordIndex = ctx.bidStarter;

    // 底牌给地主
    const li = ctx.landlordIndex;
    ctx.hands[li] = ctx.hands[li].concat(ctx.bottomCards);
    // 排序交给上层；此处简单 push

    machine.emit('bid_finished', {
      landlordIndex: li,
      baseScore,
      reason,
      bottomCards: ctx.bottomCards.slice(),
    });

    return machine.transitionTo(GamePhase.DOUBLING);
  }

  _onTimeout(machine) {
    const ctx = machine.ctx;
    // 超时视为不叫
    return this._bid(machine, ctx.bidTurn, 0);
  }
}
