import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';
import { createDeck, riffleShuffle, dealRoundRobin, sortCards } from '../../card.js';

/**
 * Dealing — 洗牌发牌，预留 3 张底牌
 * 进入后自动发完并进入 Bidding
 */
export class DealingState extends BaseState {
  constructor() {
    super(GamePhase.DEALING);
  }

  enter(machine, payload = {}) {
    const ctx = machine.ctx;
    this._resetRoundFields(ctx);

    const customDeck = Array.isArray(payload.deck);
    const deck = customDeck ? payload.deck.slice() : riffleShuffle(createDeck());
    if (deck.length !== 54) {
      machine.emit('error', { reason: 'invalid_deck' });
      return;
    }

    const dealStart = payload.dealStart ?? (customDeck ? 0 : Math.floor(Math.random() * 3));
    const dealt = dealRoundRobin(deck, 3, 17, dealStart);
    ctx.hands = dealt.hands.map((h) => sortCards(h, false));
    ctx.bottomCards = dealt.rest.slice(0, 3);

    // 叫分从随机或指定 starter 开始
    ctx.bidStarter = payload.bidStarter ?? Math.floor(Math.random() * 3);
    ctx.bidTurn = ctx.bidStarter;

    machine.emit('dealt', {
      handCounts: ctx.hands.map((h) => h.length),
      bidStarter: ctx.bidStarter,
    });

    // 同步进入叫分
    machine.transitionTo(GamePhase.BIDDING);
  }

  handle(machine, event, payload) {
    // 发牌态瞬时，通常无外部事件
    return super.handle(machine, event, payload);
  }

  _resetRoundFields(ctx) {
    ctx.landlordIndex = -1;
    ctx.currentBid = 0;
    ctx.bidScores = [null, null, null];
    ctx.bidActionCount = 0;
    ctx.baseScore = 1;
    ctx.doubleFactors = [1, 1, 1];
    ctx.doubleDecided = [false, false, false];
    ctx.currentPlayerIndex = 0;
    ctx.lastPlayHand = null;
    ctx.passCount = 0;
    ctx.bombCount = 0;
    ctx.turnPlayCount = [0, 0, 0];
    ctx.autoPlay = [false, false, false];
    ctx.winnerIndex = -1;
    ctx.winnerSide = null;
    ctx.spring = false;
    ctx.multiplier = 1;
    ctx.settlement = null;
  }
}
