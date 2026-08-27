/**
 * TexasGameStateMachine — 德州扑克单局核心控制器（状态机）
 *
 * 状态：
 *   Waiting → DealingHoleCards → PreFlopBetting
 *   → DealingFlop → FlopBetting → DealingTurn → TurnBetting
 *   → DealingRiver → RiverBetting → Showdown → Settling
 *
 * 职责：
 *   1. 维护 Button / SB / BB / Current Actor
 *   2. 校验行动（加注增量 ≥ 上次 Raise，短筹 All-in 例外）
 *   3. 下注轮结束自动推进发牌；仅 1 人未弃牌则直接 Settling
 *
 * 下注数学复用 TexasBettingEngine；牌力/边池复用 evaluate + pots。
 */

import { createDeck52 } from '../card.js';
import { evaluateBest5Of7, compareHands } from '../evaluate.js';
import { calculatePots, distributePots } from '../pots.js';
import {
  TexasBettingEngine,
  Street,
  PlayerStatus,
  ActionType,
} from '../betting.js';
import {
  TexasPhase,
  canTransition,
  isBettingPhase,
  nextDealingAfterBetting,
  bettingAfterDealing,
} from './TexasPhase.js';

/**
 * Fisher-Yates
 * @template T
 * @param {T[]} arr
 * @param {() => number} [random]
 */
function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {{
 *   playerIds?: string[],
 *   playerNames?: string[],
 *   chips?: number[],
 *   smallBlind?: number,
 *   bigBlind?: number,
 *   buttonSeat?: number,
 *   allowStraddle?: boolean,
 *   random?: () => number,
 * }} [options]
 */
export class TexasGameStateMachine {
  constructor(options = {}) {
    this.options = options;
    this.random = options.random || Math.random;

    /** @type {TexasBettingEngine} */
    this.betting = new TexasBettingEngine({
      playerIds: options.playerIds,
      playerNames: options.playerNames,
      chips: options.chips,
      smallBlind: options.smallBlind,
      bigBlind: options.bigBlind,
      buttonSeat: options.buttonSeat,
      allowStraddle: options.allowStraddle,
    });

    /** @type {string} */
    this.phase = TexasPhase.WAITING;

    /** @type {import('../card.js').Card[]} */
    this.deck = [];
    /** @type {import('../card.js').Card[]} */
    this.board = [];
    /** @type {Map<string, import('../card.js').Card[]>} playerId → 2 hole cards */
    this.holes = new Map();

    /** @type {object|null} 最近一次结算 */
    this.lastSettlement = null;
    this.handId = 0;

    /** @type {Set<(event: string, data: object, snap: object) => void>} */
    this._listeners = new Set();
    this._transitioning = false;
    this.eventLog = [];
  }

  // ───────── 观察者 ─────────

  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(event, data = {}) {
    this.eventLog.push({ event, data, phase: this.phase, t: Date.now() });
    if (this.eventLog.length > 300) this.eventLog.shift();
    const snap = this.getSnapshot();
    for (const fn of this._listeners) {
      try {
        fn(event, data, snap);
      } catch {
        /* ignore */
      }
    }
  }

  // ───────── 位置指针 ─────────

  get buttonSeat() {
    return this.betting.buttonSeat;
  }

  get sbSeat() {
    return this.betting.sbSeat;
  }

  get bbSeat() {
    return this.betting.bbSeat;
  }

  /** Current Actor Index（座位） */
  get currentActorIndex() {
    return this.betting.currentSeat;
  }

  get currentActorId() {
    return this.betting.playerBySeat(this.currentActorIndex)?.id ?? null;
  }

  get players() {
    return this.betting.players;
  }

  // ───────── 状态迁移 ─────────

  /**
   * @param {string} next
   * @param {object} [meta]
   */
  transition(next, meta = {}) {
    if (!canTransition(this.phase, next)) {
      return {
        ok: false,
        reason: 'illegal_transition',
        from: this.phase,
        to: next,
      };
    }
    const from = this.phase;
    this.phase = next;
    this.emit('phase', { from, to: next, ...meta });
    return { ok: true, from, to: next };
  }

  // ───────── 调度 ─────────

  /**
   * 统一事件入口
   * @param {string} event
   * @param {object} [payload]
   */
  dispatch(event, payload = {}) {
    if (this._transitioning) {
      return { ok: false, reason: 'transition_in_progress' };
    }
    const ev = String(event);

    switch (ev) {
      case 'startHand':
      case 'start':
        return this.startHand(payload);
      case 'fold':
      case 'check':
      case 'call':
      case 'raise':
      case 'all_in':
      case 'allIn':
      case 'straddle':
        return this.handlePlayerAction(ev, payload);
      case 'act':
        return this.handlePlayerAction(payload.action || payload.type, payload);
      case 'advance':
        // 强制推进（发牌瞬时状态）
        return this._runDealingIfNeeded();
      case 'showdown':
        return this._enterShowdown('manual');
      case 'reset':
        return this.reset();
      default:
        return { ok: false, reason: 'unknown_event', event: ev };
    }
  }

  // ───────── 开局 ─────────

  /**
   * Waiting → DealingHoleCards → PreFlopBetting
   * @param {{ buttonSeat?: number, rotateButton?: boolean }} [opts]
   */
  startHand(opts = {}) {
    if (this.phase !== TexasPhase.WAITING && this.phase !== TexasPhase.SETTLING) {
      return { ok: false, reason: 'not_startable', phase: this.phase };
    }
    if (this.phase === TexasPhase.SETTLING) {
      this.transition(TexasPhase.WAITING);
    }

    // 可选轮转庄位
    if (opts.rotateButton) {
      this.betting.buttonSeat = (this.betting.buttonSeat + 1) % this.betting.n;
    }
    if (opts.buttonSeat != null) {
      this.betting.buttonSeat = opts.buttonSeat % this.betting.n;
    }

    this.handId += 1;
    this.board = [];
    this.holes.clear();
    this.lastSettlement = null;
    this.deck = shuffle(createDeck52(), this.random);

    const tr = this.transition(TexasPhase.DEALING_HOLE, { handId: this.handId });
    if (!tr.ok) return tr;

    // 发底牌
    for (const p of this.players) {
      if (p.chips <= 0) continue;
      const c1 = this.deck.pop();
      const c2 = this.deck.pop();
      this.holes.set(p.id, [c1, c2]);
    }
    this.emit('deal_hole', {
      players: this.players.map((p) => p.id),
    });

    // 盲注 + 进入 preflop 下注
    const br = this.betting.startHand({ buttonSeat: this.betting.buttonSeat });
    if (!br.ok) {
      this.phase = TexasPhase.WAITING;
      return br;
    }

    this.transition(TexasPhase.PREFLOP_BETTING, {
      button: this.buttonSeat,
      sb: this.sbSeat,
      bb: this.bbSeat,
      actor: this.currentActorIndex,
    });

    return {
      ok: true,
      phase: this.phase,
      handId: this.handId,
      buttonSeat: this.buttonSeat,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      currentActorIndex: this.currentActorIndex,
      currentActorId: this.currentActorId,
    };
  }

  reset() {
    this.phase = TexasPhase.WAITING;
    this.board = [];
    this.holes.clear();
    this.deck = [];
    this.lastSettlement = null;
    this.emit('reset', {});
    return { ok: true, phase: this.phase };
  }

  // ───────── 行动校验与处理 ─────────

  /**
   * 校验并执行玩家动作
   * @param {string} action
   * @param {object} payload
   */
  handlePlayerAction(action, payload = {}) {
    if (!isBettingPhase(this.phase)) {
      return { ok: false, reason: 'not_betting_phase', phase: this.phase };
    }

    const playerId = payload.playerId ?? payload.id;
    if (playerId == null) return { ok: false, reason: 'missing_playerId' };

    // 预校验（加注增量等）
    const validation = this.validateAction(playerId, action, payload);
    if (!validation.ok) return validation;

    const act = normalizeAction(action);
    let result;

    if (act === ActionType.STRADDLE || act === 'straddle') {
      result = this.betting.straddle(playerId, payload.amount);
    } else {
      result = this.betting.act(playerId, act, {
        raiseTo: payload.raiseTo ?? payload.amount,
        raiseBy: payload.raiseBy,
      });
    }

    if (!result.ok) return result;

    this.emit('action', {
      playerId,
      action: act,
      ...result,
      actor: this.currentActorIndex,
    });

    // 仅剩 1 人未弃牌 → 直接结算（跳过发牌/亮牌）
    if (result.settled || result.reason === 'last_standing') {
      return this._settleLastStanding(result);
    }

    // 下注引擎进入 showdown（全员 all-in 或河牌结束）
    if (result.showdown || this.betting.street === Street.SHOWDOWN) {
      // 若牌面未发完，先快速发完再摊牌
      this._dealRemainingBoard();
      return this._enterShowdown(result.reason || 'betting_complete');
    }

    // 街道推进：betting 的 street 已变
    if (result.streetAdvanced) {
      return this._onStreetAdvanced(result);
    }

    return {
      ok: true,
      phase: this.phase,
      action: act,
      currentActorIndex: this.currentActorIndex,
      currentActorId: this.currentActorId,
      pot: this.betting._sumBets(),
      ...result,
    };
  }

  /**
   * 实时校验动作合法性
   * @param {string} playerId
   * @param {string} action
   * @param {object} [payload]
   */
  validateAction(playerId, action, payload = {}) {
    if (!isBettingPhase(this.phase)) {
      return { ok: false, reason: 'not_betting_phase', phase: this.phase };
    }

    const p = this.betting.playerById(playerId);
    if (!p) return { ok: false, reason: 'player_not_found' };

    if (p.seat !== this.betting.currentSeat) {
      return {
        ok: false,
        reason: 'not_your_turn',
        currentActorIndex: this.currentActorIndex,
        currentActorId: this.currentActorId,
      };
    }

    if (p.status !== PlayerStatus.ACTIVE) {
      return { ok: false, reason: 'cannot_act', status: p.status };
    }

    const act = normalizeAction(action);
    const toCall = this.betting.toCallAmount(p);
    const minRaiseTo = this.betting.minRaiseTo();
    const lastRaiseSize = this.betting.lastRaiseSize;

    switch (act) {
      case ActionType.FOLD:
        return { ok: true, action: act };

      case ActionType.CHECK:
        if (toCall > 0) {
          return { ok: false, reason: 'cannot_check', toCall };
        }
        return { ok: true, action: act };

      case ActionType.CALL:
        if (toCall <= 0) {
          return { ok: true, action: act, note: 'call_as_check' };
        }
        return { ok: true, action: act, toCall: Math.min(toCall, p.chips) };

      case ActionType.RAISE: {
        let raiseTo = payload.raiseTo != null
          ? Math.floor(Number(payload.raiseTo))
          : minRaiseTo;
        if (payload.raiseBy != null && payload.raiseTo == null) {
          raiseTo = p.betStreet + toCall + Math.floor(Number(payload.raiseBy));
        }
        const need = raiseTo - p.betStreet;

        // 短筹 all-in：允许低于最小加注
        if (need >= p.chips) {
          return {
            ok: true,
            action: act,
            shortAllIn: true,
            allInAmount: p.chips,
            note: 'raise_converts_to_all_in',
          };
        }

        if (raiseTo <= this.betting.currentBet) {
          return {
            ok: false,
            reason: 'raise_not_above_current',
            currentBet: this.betting.currentBet,
            raiseTo,
          };
        }

        // 加注增量不能小于上一次 Raise 增量（除非短筹）
        const raiseSize = raiseTo - this.betting.currentBet;
        if (raiseSize < lastRaiseSize) {
          return {
            ok: false,
            reason: 'raise_increment_too_small',
            minRaiseSize: lastRaiseSize,
            minRaiseTo,
            raiseSize,
            hint: '加注金额不能小于上一次 Raise 的增量，除非短筹码 All-in',
          };
        }

        return { ok: true, action: act, raiseTo, raiseSize, minRaiseTo };
      }

      case ActionType.ALL_IN:
        if (p.chips <= 0) return { ok: false, reason: 'no_chips' };
        return {
          ok: true,
          action: act,
          amount: p.chips,
          isShort: p.betStreet + p.chips < minRaiseTo,
        };

      case ActionType.STRADDLE:
      case 'straddle':
        if (this.phase !== TexasPhase.PREFLOP_BETTING) {
          return { ok: false, reason: 'straddle_only_preflop' };
        }
        return { ok: true, action: ActionType.STRADDLE };

      default:
        return { ok: false, reason: 'unknown_action', action: act };
    }
  }

  /**
   * 当前玩家合法动作列表（含约束元数据）
   * @param {string} [playerId]
   */
  legalActions(playerId) {
    const id = playerId || this.currentActorId;
    if (!id || !isBettingPhase(this.phase)) return [];

    const p = this.betting.playerById(id);
    if (!p || p.seat !== this.currentActorIndex || p.status !== PlayerStatus.ACTIVE) {
      return [];
    }

    const toCall = this.betting.toCallAmount(p);
    const minRaiseTo = this.betting.minRaiseTo();
    /** @type {object[]} */
    const list = [
      { action: ActionType.FOLD },
      { action: ActionType.ALL_IN, amount: p.chips },
    ];

    if (toCall === 0) {
      list.push({ action: ActionType.CHECK });
    } else {
      list.push({
        action: ActionType.CALL,
        amount: Math.min(toCall, p.chips),
      });
    }

    if (p.chips > toCall) {
      list.push({
        action: ActionType.RAISE,
        minRaiseTo,
        minRaiseSize: this.betting.lastRaiseSize,
        maxRaiseTo: p.betStreet + p.chips,
      });
    }

    return list;
  }

  // ───────── 阶段推进 ─────────

  /**
   * 下注街结束后：进入发牌或摊牌
   */
  _onStreetAdvanced(betResult) {
    const fromBetting = this.phase;

    // 仅剩 1 名可行动且多人 all-in 争胜 → 发完公共牌再摊牌
    const cont = this.betting.contendingPlayers();
    const canAct = this.betting.canActPlayers();

    if (cont.length <= 1) {
      return this._settleLastStanding({ reason: 'last_standing' });
    }

    if (canAct.length <= 1 && cont.length >= 2) {
      // 全押局面：连续发完剩余公共牌
      this._dealRemainingBoard();
      return this._enterShowdown('all_in_runout');
    }

    if (betResult.street === Street.SHOWDOWN || fromBetting === TexasPhase.RIVER_BETTING) {
      return this._enterShowdown('river_complete');
    }

    const nextDeal = nextDealingAfterBetting(fromBetting);
    if (!nextDeal) {
      return this._enterShowdown('no_next_street');
    }

    if (nextDeal === TexasPhase.SHOWDOWN) {
      return this._enterShowdown('river_complete');
    }

    // 瞬时发牌阶段
    this.transition(nextDeal, { fromBetting });
    this._dealBoardForPhase(nextDeal);
    const nextBet = bettingAfterDealing(nextDeal);
    this.transition(nextBet, {
      board: this.board.map((c) => ({ rank: c.rank, suit: c.suit })),
    });

    // 同步 betting 引擎街道名（已在 _advanceStreet 改过）
    return {
      ok: true,
      streetAdvanced: true,
      phase: this.phase,
      board: this.board.map((c) => ({ ...c })),
      currentActorIndex: this.currentActorIndex,
      currentActorId: this.currentActorId,
      pot: this.betting._sumBets(),
      pots: this.betting.calculatePots(),
    };
  }

  _dealBoardForPhase(dealingPhase) {
    if (dealingPhase === TexasPhase.DEALING_FLOP) {
      // burn + 3
      this.deck.pop();
      this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.emit('deal_flop', { board: this.board.slice() });
    } else if (dealingPhase === TexasPhase.DEALING_TURN) {
      this.deck.pop();
      this.board.push(this.deck.pop());
      this.emit('deal_turn', { board: this.board.slice() });
    } else if (dealingPhase === TexasPhase.DEALING_RIVER) {
      this.deck.pop();
      this.board.push(this.deck.pop());
      this.emit('deal_river', { board: this.board.slice() });
    }
  }

  /** 全押后快速发完公共牌至 5 张 */
  _dealRemainingBoard() {
    while (this.board.length < 3 && this.deck.length >= 4) {
      if (this.board.length === 0) {
        this.deck.pop();
        this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      }
    }
    while (this.board.length < 5 && this.deck.length >= 2) {
      this.deck.pop();
      this.board.push(this.deck.pop());
    }
    this.emit('deal_runout', { board: this.board.slice() });
  }

  _runDealingIfNeeded() {
    if (isBettingPhase(this.phase) && this.betting._streetClosed()) {
      const r = this.betting._advanceStreet();
      return this._onStreetAdvanced(r);
    }
    return { ok: false, reason: 'nothing_to_advance' };
  }

  // ───────── 摊牌 / 结算 ─────────

  _settleLastStanding(prev = {}) {
    const cont = this.betting.contendingPlayers().filter(
      (p) => p.status !== PlayerStatus.FOLDED
    );
    // contending 已含 active+all_in；folded 已排除
    const alive = this.players.filter((p) => p.status !== PlayerStatus.FOLDED
      && p.status !== PlayerStatus.SITTING_OUT);

    const winners = this.betting.contendingPlayers();
    if (winners.length !== 1 && alive.filter((p) => p.status !== PlayerStatus.FOLDED).length > 1) {
      // 仍有多人未弃
      const notFolded = this.players.filter((p) => p.status !== PlayerStatus.FOLDED);
      if (notFolded.length > 1) {
        // 若 betting 已 finished
        if (prev.settled && prev.winnerIds?.length === 1) {
          return this._finishSettlement(prev.awards || {}, 'last_standing', prev);
        }
      }
    }

    this.transition(TexasPhase.SETTLING, { reason: 'last_standing' });

    const winner = winners[0] || this.players.find((p) => p.status !== PlayerStatus.FOLDED);
    const total = this.players.reduce((s, p) => s + p.betTotal, 0);
    /** @type {Record<string, number>} */
    const awards = {};
    for (const p of this.players) awards[p.id] = 0;

    if (winner) {
      awards[winner.id] = total;
      // chips：betting 的 _endHand 可能已加过
      if (!prev.awards) {
        winner.chips += total;
        for (const p of this.players) {
          p.betTotal = 0;
          p.betStreet = 0;
        }
      } else {
        Object.assign(awards, prev.awards);
      }
    }

    this.lastSettlement = {
      reason: 'last_standing',
      awards,
      pots: [],
      winnerIds: winner ? [winner.id] : [],
      showdown: false,
    };

    this.emit('settle', this.lastSettlement);
    return {
      ok: true,
      settled: true,
      phase: this.phase,
      ...this.lastSettlement,
    };
  }

  _enterShowdown(reason) {
    if (this.phase === TexasPhase.SETTLING || this.phase === TexasPhase.WAITING) {
      return { ok: false, reason: 'already_settled' };
    }

    // 确保在 Showdown
    if (this.phase !== TexasPhase.SHOWDOWN) {
      // 从 RiverBetting / 其他可进 Showdown
      if (canTransition(this.phase, TexasPhase.SHOWDOWN)) {
        this.transition(TexasPhase.SHOWDOWN, { reason });
      } else if (isBettingPhase(this.phase)) {
        // 强制路径
        const from = this.phase;
        this.phase = TexasPhase.SHOWDOWN;
        this.emit('phase', { from, to: TexasPhase.SHOWDOWN, reason, forced: true });
      }
    }

    this._dealRemainingBoard();

    // 未弃牌玩家比牌
    const contenders = this.players.filter((p) => p.status !== PlayerStatus.FOLDED
      && p.status !== PlayerStatus.SITTING_OUT
      && this.holes.has(p.id));

    if (contenders.length === 0) {
      return this._finishSettlement({}, 'no_contenders');
    }
    if (contenders.length === 1) {
      return this._settleLastStanding({ reason: 'one_contender_showdown' });
    }

    if (this.board.length < 5) {
      return { ok: false, reason: 'board_incomplete', boardLen: this.board.length };
    }

    // 评估
    const hands = contenders.map((p) => {
      const hole = this.holes.get(p.id);
      const best = evaluateBest5Of7(hole, this.board);
      return { id: p.id, seat: p.seat, hand: best };
    });

    // 排名：value 越大越好 → rank 1 最好
    hands.sort((a, b) => b.hand.value - a.hand.value);
    let rank = 1;
    /** @type {Array<{ id: string, rank: number, seat: number, score: number }>} */
    const rankings = [];
    for (let i = 0; i < hands.length; i++) {
      if (i > 0 && hands[i].hand.value < hands[i - 1].hand.value) {
        rank = i + 1;
      }
      rankings.push({
        id: hands[i].id,
        rank,
        seat: hands[i].seat,
        score: hands[i].hand.value,
      });
    }

    this.emit('showdown', {
      rankings,
      hands: hands.map((h) => ({
        id: h.id,
        name: h.hand.name,
        category: h.hand.category,
        value: h.hand.value,
      })),
    });

    // 边池分配
    const pots = calculatePots(this.players.map((p) => ({
      id: p.id,
      betTotal: p.betTotal,
      folded: p.status === PlayerStatus.FOLDED,
      allIn: p.status === PlayerStatus.ALL_IN,
      seat: p.seat,
      status: p.status,
    })));

    const dist = distributePots(pots, rankings, {
      sbSeat: this.sbSeat,
      seats: Object.fromEntries(this.players.map((p) => [p.id, p.seat])),
      playerCount: this.players.length,
    });

    // 发奖到筹码
    for (const p of this.players) {
      const win = dist.awards[p.id] || 0;
      if (win > 0) p.chips += win;
      p.betTotal = 0;
      p.betStreet = 0;
    }
    this.betting.pot = 0;

    return this._finishSettlement(dist.awards, reason, {
      pots: dist.pots,
      rankings,
      hands: hands.map((h) => ({
        id: h.id,
        hand: h.hand,
      })),
      totalDistributed: dist.totalDistributed,
    });
  }

  _finishSettlement(awards, reason, extra = {}) {
    if (this.phase !== TexasPhase.SETTLING) {
      if (canTransition(this.phase, TexasPhase.SETTLING)) {
        this.transition(TexasPhase.SETTLING, { reason });
      } else {
        const from = this.phase;
        this.phase = TexasPhase.SETTLING;
        this.emit('phase', { from, to: TexasPhase.SETTLING, reason, forced: true });
      }
    }

    const winnerIds = Object.entries(awards)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    this.lastSettlement = {
      reason,
      awards,
      winnerIds,
      showdown: reason !== 'last_standing',
      ...extra,
    };

    this.betting.street = Street.FINISHED;
    this.emit('settle', this.lastSettlement);

    return {
      ok: true,
      settled: true,
      phase: this.phase,
      ...this.lastSettlement,
    };
  }

  /**
   * 结算完成后回到 Waiting（或自动下一手）
   * @param {{ autoNext?: boolean, rotateButton?: boolean }} [opts]
   */
  endSettling(opts = {}) {
    if (this.phase !== TexasPhase.SETTLING) {
      return { ok: false, reason: 'not_settling' };
    }
    this.transition(TexasPhase.WAITING);
    if (opts.autoNext) {
      return this.startHand({ rotateButton: opts.rotateButton !== false });
    }
    return { ok: true, phase: this.phase };
  }

  // ───────── 快照 ─────────

  /**
   * @param {string} [viewerId]  视角：仅看自己底牌
   */
  getSnapshot(viewerId = null) {
    const betSnap = this.betting.getSnapshot();
    const holes = {};
    for (const [pid, cards] of this.holes) {
      if (!viewerId || viewerId === pid || this.phase === TexasPhase.SHOWDOWN
        || this.phase === TexasPhase.SETTLING) {
        // 弃牌可在结算亮
        const p = this.betting.playerById(pid);
        const show = !viewerId
          || viewerId === pid
          || this.phase === TexasPhase.SETTLING
          || this.phase === TexasPhase.SHOWDOWN;
        holes[pid] = show ? cards.map((c) => ({ ...c })) : null;
      } else {
        holes[pid] = null;
      }
    }

    return {
      phase: this.phase,
      handId: this.handId,
      buttonSeat: this.buttonSeat,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      currentActorIndex: this.currentActorIndex,
      currentActorId: this.currentActorId,
      board: this.board.map((c) => ({ rank: c.rank, suit: c.suit, id: c.id })),
      holes,
      pot: betSnap.pot,
      pots: betSnap.pots,
      currentBet: betSnap.currentBet,
      minRaiseTo: betSnap.minRaiseTo,
      lastRaiseSize: betSnap.lastRaiseSize,
      smallBlind: betSnap.smallBlind,
      bigBlind: betSnap.bigBlind,
      players: betSnap.players,
      legalActions: this.currentActorId ? this.legalActions(this.currentActorId) : [],
      settlement: this.lastSettlement,
      bettingStreet: betSnap.street,
    };
  }
}

function normalizeAction(action) {
  const a = String(action || '').toLowerCase().replace(/-/g, '_');
  if (a === 'allin') return ActionType.ALL_IN;
  if (a === 're_raise' || a === 'reraise') return ActionType.RAISE;
  return a;
}

export default TexasGameStateMachine;
