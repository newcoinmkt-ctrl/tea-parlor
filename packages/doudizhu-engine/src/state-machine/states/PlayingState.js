import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';
import {
  parseHand,
  canBeat,
  removeCards,
  HandType,
  getHint,
} from '../../rules.js';

/**
 * Playing — 出牌轮询
 * - currentPlayerIndex / lastPlayHand
 * - 超时托管：能过则过，否则出最小合法牌；自由出则出最小单/提示
 */
export class PlayingState extends BaseState {
  constructor() {
    super(GamePhase.PLAYING);
  }

  enter(machine) {
    const ctx = machine.ctx;
    machine.emit('playing_start', {
      currentPlayerIndex: ctx.currentPlayerIndex,
      landlordIndex: ctx.landlordIndex,
    });
    this._armTimer(machine);
  }

  exit(machine) {
    machine.stopPhaseTimer();
  }

  handle(machine, event, payload = {}) {
    switch (event) {
      case 'play':
        return this._play(machine, payload.playerIndex, payload.cards);
      case 'pass':
        return this._pass(machine, payload.playerIndex);
      case 'setAutoPlay':
        return this._setAuto(machine, payload.playerIndex, !!payload.enabled);
      case 'timeout':
        return this._onTimeout(machine);
      default:
        return super.handle(machine, event, payload);
    }
  }

  _armTimer(machine) {
    const ctx = machine.ctx;
    const p = ctx.currentPlayerIndex;
    // 托管立即自动出
    if (ctx.autoPlay[p]) {
      queueMicrotask(() => this._autoAct(machine));
      return;
    }
    machine.startPhaseTimer(ctx.playTimeoutMs, () => this._onTimeout(machine));
  }

  _setAuto(machine, player, enabled) {
    if (!Number.isInteger(player) || player < 0 || player > 2) {
      return { ok: false, reason: 'invalid_player' };
    }
    machine.ctx.autoPlay[player] = enabled;
    if (enabled && machine.ctx.currentPlayerIndex === player) {
      queueMicrotask(() => this._autoAct(machine));
    }
    return { ok: true };
  }

  _play(machine, player, cards) {
    const ctx = machine.ctx;
    if (player !== ctx.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn' };
    }
    if (!Array.isArray(cards) || cards.length === 0) {
      return { ok: false, reason: 'empty_cards' };
    }

    // 校验牌在手中
    if (!cardsInHand(ctx.hands[player], cards)) {
      return { ok: false, reason: 'cards_not_in_hand' };
    }

    const parsed = parseHand(cards);
    if (!parsed) return { ok: false, reason: 'invalid_hand_type' };

    // 压牌
    if (ctx.lastPlayHand && ctx.lastPlayHand.player !== player) {
      if (!canBeat(ctx.lastPlayHand.hand, parsed)) {
        return { ok: false, reason: 'cannot_beat' };
      }
    }

    // 扣牌
    ctx.hands[player] = removeCards(ctx.hands[player], cards);
    ctx.lastPlayHand = { player, hand: parsed };
    ctx.passCount = 0;
    ctx.turnPlayCount[player] += 1;

    if (parsed.type === HandType.BOMB || parsed.type === HandType.ROCKET) {
      ctx.bombCount += 1;
    }

    machine.emit('play', {
      playerIndex: player,
      cards: cards.slice(),
      type: parsed.type,
      weight: parsed.weight,
      remaining: ctx.hands[player].length,
    });

    // 出完 → 结算
    if (ctx.hands[player].length === 0) {
      ctx.winnerIndex = player;
      return machine.transitionTo(GamePhase.SETTLING, { winnerIndex: player });
    }

    ctx.currentPlayerIndex = (player + 1) % 3;
    this._armTimer(machine);
    return { ok: true, data: { nextPlayer: ctx.currentPlayerIndex } };
  }

  _pass(machine, player) {
    const ctx = machine.ctx;
    if (player !== ctx.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn' };
    }
    // 领出不能 pass
    if (!ctx.lastPlayHand || ctx.lastPlayHand.player === player) {
      return { ok: false, reason: 'cannot_pass_on_lead' };
    }

    ctx.passCount += 1;
    machine.emit('pass', { playerIndex: player });

    // 两家都 pass → 领出权回到 lastPlay.player
    if (ctx.passCount >= 2) {
      ctx.currentPlayerIndex = ctx.lastPlayHand.player;
      ctx.lastPlayHand = null;
      ctx.passCount = 0;
      machine.emit('new_trick', { leader: ctx.currentPlayerIndex });
    } else {
      ctx.currentPlayerIndex = (player + 1) % 3;
    }

    this._armTimer(machine);
    return { ok: true, data: { nextPlayer: ctx.currentPlayerIndex } };
  }

  _onTimeout(machine) {
    const ctx = machine.ctx;
    const p = ctx.currentPlayerIndex;
    // 超时进入托管
    ctx.autoPlay[p] = true;
    machine.emit('auto_play_enabled', { playerIndex: p, reason: 'timeout' });
    return this._autoAct(machine);
  }

  /**
   * 托管策略：
   * - 可压：出最小合法牌（findBeatingHands / getHint）
   * - 可过：pass
   * - 自由出：最小单张或 getHint
   */
  _autoAct(machine) {
    const ctx = machine.ctx;
    if (ctx.phase !== GamePhase.PLAYING) return { ok: false, reason: 'not_playing' };
    const p = ctx.currentPlayerIndex;
    const hand = ctx.hands[p];
    const prev = ctx.lastPlayHand && ctx.lastPlayHand.player !== p
      ? ctx.lastPlayHand.hand
      : null;

    if (prev) {
      const hint = getHint(hand, prev);
      if (hint && hint.cards?.length) {
        return this._play(machine, p, hint.cards);
      }
      return this._pass(machine, p);
    }

    // 自由出：最小单
    const sorted = hand.slice().sort((a, b) => a.rank - b.rank || a.suit - b.suit);
    if (!sorted.length) return { ok: false, reason: 'empty_hand' };
    const free = getHint(hand, null);
    if (free?.cards?.length) return this._play(machine, p, free.cards);
    return this._play(machine, p, [sorted[0]]);
  }
}

function cardsInHand(hand, cards) {
  const ids = new Set(hand.map((c) => c.id));
  const used = new Set();
  for (const c of cards) {
    if (!ids.has(c.id) || used.has(c.id)) return false;
    used.add(c.id);
  }
  return true;
}
