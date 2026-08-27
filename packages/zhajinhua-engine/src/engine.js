/**
 * ZajinhuaGameEngine — 炸金花多轮下注与筹码控制（状态机）
 *
 * 阶段：WAITING → DEALING → BETTING → SETTLING
 * 玩家：MEN(闷) | LOOKED(看) | ALL_IN(全押) | FOLDED(弃) | LOST(比牌输)
 *
 * 筹码规则：
 *   - 闷牌单注 = currentMenStake
 *   - 看牌单注 = currentMenStake × 2
 *   - 单注上限 maxMenStake；轮数上限 maxRounds（默认 20）
 *   - 比牌消耗 = 发起方当前单注 × 2；输者 → LOST
 *   - 筹码不足当前单注 → allIn() 孤注一掷
 *   - 主池/边池：settleAllPots；All-in 只参与其投入覆盖的池
 *   - 仅剩 1 名争胜玩家 → 立即结算
 */

import { createDeck52, shuffle } from './card.js';
import {
  compareHands,
  hasLeopardAmong,
  identifyHandType,
} from './hand-types.js';
import {
  GamePhase,
  GameEvent,
  PlayerStatus,
  PHASE_TRANSITIONS,
  isActingStatus,
  isContendingStatus,
  isOutStatus,
} from './constants.js';
import {
  buildSidePots,
  settleAllPots,
  previewPots,
} from './pots.js';

/**
 * @typedef {object} EngineOptions
 * @property {string[]} [playerIds]
 * @property {string[]} [playerNames]
 * @property {number[]} [chips]           各家起始筹码
 * @property {number} [ante]              底注
 * @property {number} [baseStake]         初始闷注
 * @property {number} [maxMenStake]       闷注单注上限
 * @property {number} [maxRounds]         最大轮数，默认 20
 * @property {number} [dealerIndex]
 * @property {() => number} [random]
 * @property {boolean} [allowCompareFirstRound]  第一轮是否允许比牌，默认 false
 */

export class ZajinhuaGameEngine {
  /**
   * @param {EngineOptions} [options]
   */
  constructor(options = {}) {
    this.options = {
      ante: Math.max(1, Number(options.ante) || 10),
      baseStake: Math.max(1, Number(options.baseStake) || 10),
      maxMenStake: Math.max(1, Number(options.maxMenStake) || 200),
      maxRounds: Math.max(1, Number(options.maxRounds) || 20),
      allowCompareFirstRound: !!options.allowCompareFirstRound,
      random: options.random || Math.random,
    };

    const ids = options.playerIds || ['p0', 'p1', 'p2'];
    const names = options.playerNames || ids.map((id, i) => `玩家${i + 1}`);
    const chips = options.chips || ids.map(() => 1000);

    if (ids.length < 2 || ids.length > 6) {
      throw new RangeError('player count must be 2–6');
    }

    /** @type {import('./constants.js').GamePhase[keyof import('./constants.js').GamePhase]} */
    this.phase = GamePhase.WAITING;
    this.players = ids.map((id, i) => ({
      id: String(id),
      name: names[i] || String(id),
      chips: Math.max(0, Number(chips[i]) || 0),
      status: PlayerStatus.MEN,
      cards: /** @type {import('./card.js').Card[]} */ ([]),
      betTotal: 0,
      looked: false,
      allIn: false,
    }));

    this.pot = 0;
    this.currentMenStake = this.options.baseStake;
    this.currentPlayerIndex = 0;
    this.dealerIndex = options.dealerIndex != null
      ? options.dealerIndex % this.players.length
      : 0;
    this.round = 0;
    /** 本轮已行动次数（用于轮次推进） */
    this.actionsInRound = 0;
    /** 全场有效行动计数 */
    this.actionCount = 0;
    this.winnerId = null;
    /** @type {string[]} 边池结算可能多名「主池」胜者 */
    this.winnerIds = [];
    this.lastAction = '';
    this.compareLog = [];
    this.eventLog = [];
    /** @type {object|null} 最近一次 settleAllPots 结果 */
    this.lastSettlement = null;
    /** @type {Set<(event: string, data: object, snap: object) => void>} */
    this._listeners = new Set();
  }

  // ───────── 观察者 ─────────

  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(event, data = {}) {
    this.eventLog.push({ event, data, t: Date.now() });
    if (this.eventLog.length > 300) this.eventLog.shift();
    const snap = this.getSnapshot();
    for (const fn of this._listeners) {
      try {
        fn(event, data, snap);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  // ───────── 状态迁移 ─────────

  /**
   * @param {string} next
   * @param {object} [meta]
   */
  transition(next, meta = {}) {
    const allowed = PHASE_TRANSITIONS[this.phase] || [];
    if (!allowed.includes(next)) {
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

  // ───────── 查询 ─────────

  findPlayer(playerId) {
    const id = String(playerId);
    const index = this.players.findIndex((p) => p.id === id);
    if (index < 0) return null;
    return { player: this.players[index], index };
  }

  /** 仍需下注行动（闷/看，不含 All-in） */
  actingPlayers() {
    return this.players.filter((p) => isActingStatus(p.status));
  }

  /** 仍在争胜（闷/看/全押） */
  contendingPlayers() {
    return this.players.filter((p) => isContendingStatus(p.status));
  }

  /** @deprecated 同 actingPlayers */
  activePlayers() {
    return this.actingPlayers();
  }

  activeIndices() {
    return this.players
      .map((p, i) => (isActingStatus(p.status) ? i : -1))
      .filter((i) => i >= 0);
  }

  contendingIndices() {
    return this.players
      .map((p, i) => (isContendingStatus(p.status) ? i : -1))
      .filter((i) => i >= 0);
  }

  /**
   * 当前玩家应付「单注」（闷 1 倍 / 看 2 倍）
   * @param {string|number} playerIdOrIndex
   */
  getBetUnit(playerIdOrIndex) {
    const p = typeof playerIdOrIndex === 'number'
      ? this.players[playerIdOrIndex]
      : this.findPlayer(playerIdOrIndex)?.player;
    if (!p) return 0;
    if (p.status === PlayerStatus.ALL_IN) return 0;
    if (p.status === PlayerStatus.LOOKED || p.looked) {
      return this.currentMenStake * 2;
    }
    return this.currentMenStake;
  }

  /** 是否因筹码不足而只能 All-in */
  canAllIn(playerId) {
    const found = this.findPlayer(playerId);
    if (!found) return false;
    const { player } = found;
    if (!isActingStatus(player.status)) return false;
    if (player.chips <= 0) return false;
    const unit = this.getBetUnit(player.id);
    return player.chips < unit;
  }

  /**
   * 比牌费用 = 当前单注 × 2
   * @param {string|number} attackerIdOrIndex
   */
  getCompareCost(attackerIdOrIndex) {
    return this.getBetUnit(attackerIdOrIndex) * 2;
  }

  /** 场上是否有豹子（争胜玩家手牌） */
  hasLeopardInGame() {
    const hands = this.contendingPlayers().map((p) => p.cards);
    return hasLeopardAmong(hands);
  }

  /** 当前主池/边池预览 */
  getPotsPreview() {
    return previewPots(this.players.map((p, i) => ({
      id: p.id,
      betTotal: p.betTotal,
      status: p.status,
      allIn: p.allIn,
      seat: i,
    })));
  }

  // ───────── 开局 / 重置 ─────────

  /**
   * 开局：发牌、收底注、进入 BETTING
   * @param {{ dealerIndex?: number }} [opts]
   */
  startGame(opts = {}) {
    if (this.phase !== GamePhase.WAITING && this.phase !== GamePhase.SETTLING) {
      return { ok: false, reason: 'not_startable', phase: this.phase };
    }
    if (this.phase === GamePhase.SETTLING) {
      this.transition(GamePhase.WAITING);
    }

    this.transition(GamePhase.DEALING, { event: GameEvent.START });

    if (opts.dealerIndex != null) {
      this.dealerIndex = opts.dealerIndex % this.players.length;
    }

    const ante = this.options.ante;
    // 筹码不足底注则无法入局
    for (const p of this.players) {
      if (p.chips < ante) {
        this.phase = GamePhase.WAITING;
        return { ok: false, reason: 'insufficient_chips', playerId: p.id };
      }
    }

    const deck = shuffle(createDeck52(), this.options.random);
    let idx = 0;
    const nSeats = this.players.length;
    const dealStart = this.dealerIndex % nSeats;
    this.pot = 0;
    this.currentMenStake = Math.min(this.options.baseStake, this.options.maxMenStake);
    this.round = 1;
    this.actionsInRound = 0;
    this.actionCount = 0;
    this.winnerId = null;
    this.winnerIds = [];
    this.lastSettlement = null;
    this.compareLog = [];
    this.lastAction = '发牌，各下底注';

    for (const p of this.players) p.cards = [];
    for (let r = 0; r < 3; r++) {
      for (let p = 0; p < nSeats; p++) {
        this.players[(dealStart + p) % nSeats].cards.push(deck[idx++]);
      }
    }
    for (const p of this.players) {
      p.status = PlayerStatus.MEN;
      p.looked = false;
      p.allIn = false;
      p.betTotal = 0;
      // 底注
      p.chips -= ante;
      p.betTotal += ante;
      this.pot += ante;
    }

    // 庄家下家先行动
    this.currentPlayerIndex = this.nextActiveIndex(this.dealerIndex);
    this.transition(GamePhase.BETTING, { dealer: this.dealerIndex });
    this.emit(GameEvent.START, {
      pot: this.pot,
      current: this.players[this.currentPlayerIndex].id,
    });
    return { ok: true, pot: this.pot };
  }

  /** 兼容别名 */
  deal(opts) {
    return this.startGame(opts);
  }

  reset() {
    for (const p of this.players) {
      p.status = PlayerStatus.MEN;
      p.looked = false;
      p.allIn = false;
      p.cards = [];
      p.betTotal = 0;
    }
    this.pot = 0;
    this.winnerId = null;
    this.winnerIds = [];
    this.lastSettlement = null;
    this.round = 0;
    this.actionsInRound = 0;
    this.actionCount = 0;
    this.compareLog = [];
    this.currentMenStake = this.options.baseStake;
    this.phase = GamePhase.WAITING;
    this.lastAction = '已重置';
    this.emit(GameEvent.RESET, {});
    return { ok: true };
  }

  // ───────── 看牌 ─────────

  /**
   * 看牌：MEN → LOOKED（不切换回合，可随时看）
   * @param {string} playerId
   */
  lookCards(playerId) {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const found = this.findPlayer(playerId);
    if (!found) return { ok: false, reason: 'player_not_found' };
    const { player } = found;
    if (!isContendingStatus(player.status)) {
      return { ok: false, reason: 'player_out' };
    }
    if (player.status === PlayerStatus.ALL_IN) {
      // 全押后可亮给自己看
      player.looked = true;
      return {
        ok: true,
        already: true,
        allIn: true,
        cards: player.cards.map((c) => ({ ...c })),
      };
    }
    if (player.status === PlayerStatus.LOOKED || player.looked) {
      return { ok: true, already: true, cards: player.cards.map((c) => ({ ...c })) };
    }
    player.status = PlayerStatus.LOOKED;
    player.looked = true;
    this.lastAction = `${player.name} 看牌`;
    this.emit(GameEvent.LOOK, { playerId: player.id });
    return {
      ok: true,
      cards: player.cards.map((c) => ({ ...c })),
      hand: identifyHandType(player.cards),
    };
  }

  // ───────── 下注（跟注 / 加注） ─────────

  /**
   * 下注
   * - 闷牌：amount ≥ currentMenStake，且 ≤ maxMenStake；加注时 amount 成为新闷注
   * - 看牌：amount ≥ currentMenStake×2，且 ≤ maxMenStake×2；加注时 amount/2 为新闷注
   * - amount 必须为正整数
   *
   * @param {string} playerId
   * @param {number} amount  本次投入底池的筹码
   */
  bet(playerId, amount) {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const found = this.findPlayer(playerId);
    if (!found) return { ok: false, reason: 'player_not_found' };
    const { player, index } = found;
    if (index !== this.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn', current: this.players[this.currentPlayerIndex].id };
    }
    if (!isActingStatus(player.status)) {
      return { ok: false, reason: 'player_out' };
    }

    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    const looked = player.status === PlayerStatus.LOOKED || player.looked;
    const minUnit = looked ? this.currentMenStake * 2 : this.currentMenStake;
    const maxUnit = looked
      ? this.options.maxMenStake * 2
      : this.options.maxMenStake;

    // 筹码不足当前单注 → 引导 All-in
    if (player.chips < minUnit) {
      return {
        ok: false,
        reason: 'insufficient_chips',
        chips: player.chips,
        need: minUnit,
        canAllIn: true,
        hint: '筹码不足，请使用 allIn()',
      };
    }

    if (amt < minUnit) {
      return {
        ok: false,
        reason: 'below_min',
        min: minUnit,
        looked,
        currentMenStake: this.currentMenStake,
        canAllIn: player.chips < minUnit,
      };
    }
    if (amt > maxUnit) {
      return {
        ok: false,
        reason: 'above_max',
        max: maxUnit,
        looked,
      };
    }
    // 看牌下注必须是闷注的 2 倍关系：amount 对应闷注 = amount/2，须为整数倍
    if (looked && amt % 2 !== 0) {
      return { ok: false, reason: 'looked_must_even', hint: '看牌下注须为偶数（闷注×2）' };
    }

    // 加注：提高桌面闷注
    const impliedMen = looked ? amt / 2 : amt;
    if (impliedMen > this.currentMenStake) {
      if (impliedMen > this.options.maxMenStake) {
        return { ok: false, reason: 'raise_above_max', maxMenStake: this.options.maxMenStake };
      }
      this.currentMenStake = impliedMen;
    } else if (impliedMen < this.currentMenStake) {
      // 跟注必须正好等于当前单注（不允许少付）
      if (amt !== minUnit) {
        return {
          ok: false,
          reason: 'must_call_exact_or_raise',
          callAmount: minUnit,
          currentMenStake: this.currentMenStake,
        };
      }
    }

    if (player.chips < amt) {
      return {
        ok: false,
        reason: 'insufficient_chips',
        chips: player.chips,
        need: amt,
        canAllIn: true,
      };
    }

    player.chips -= amt;
    player.betTotal += amt;
    this.pot += amt;
    this.actionCount += 1;
    this.actionsInRound += 1;

    // 刚好把筹码打光 → 自动 All-in
    if (player.chips === 0) {
      player.allIn = true;
      player.status = PlayerStatus.ALL_IN;
    }

    this.lastAction =
      `${player.name}${looked ? '看牌' : '闷'}注 ${amt}`
      + `${player.allIn ? '（All-in）' : ''}`
      + `（闷标 ${this.currentMenStake} · 池 ${this.pot}）`;

    this.emit(GameEvent.BET, {
      playerId: player.id,
      amount: amt,
      pot: this.pot,
      currentMenStake: this.currentMenStake,
      looked,
      allIn: player.allIn,
    });

    const result = this._afterAction();
    if (result.settled) return { ok: true, amount: amt, pot: this.pot, allIn: player.allIn, ...result };

    this._advanceTurn();
    return {
      ok: true,
      amount: amt,
      pot: this.pot,
      allIn: player.allIn,
      currentMenStake: this.currentMenStake,
      nextPlayerId: this.players[this.currentPlayerIndex]?.id,
      pots: this.getPotsPreview(),
    };
  }

  // ───────── 孤注一掷 All-in ─────────

  /**
   * 全押：投入剩余全部筹码，状态 → ALL_IN
   * - 无需再跟注，直接参与最终开牌
   * - 只能赢取「其投入所覆盖」的主池/边池
   *
   * @param {string} playerId
   */
  allIn(playerId) {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const found = this.findPlayer(playerId);
    if (!found) return { ok: false, reason: 'player_not_found' };
    const { player, index } = found;
    if (index !== this.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn' };
    }
    if (!isActingStatus(player.status)) {
      return { ok: false, reason: 'player_out' };
    }
    if (player.chips <= 0) {
      return { ok: false, reason: 'no_chips' };
    }

    const amt = player.chips;
    const unit = this.getBetUnit(player.id);
    // 允许：筹码不足单注 或 主动全押（≥ 单注）
    player.chips = 0;
    player.betTotal += amt;
    this.pot += amt;
    player.allIn = true;
    player.status = PlayerStatus.ALL_IN;
    this.actionCount += 1;
    this.actionsInRound += 1;

    this.lastAction =
      `${player.name} 孤注一掷 All-in ${amt}`
      + `（单注 ${unit} · 池 ${this.pot}）`;

    this.emit(GameEvent.ALL_IN, {
      playerId: player.id,
      amount: amt,
      pot: this.pot,
      betTotal: player.betTotal,
      pots: this.getPotsPreview(),
    });

    const result = this._afterAction();
    if (result.settled) {
      return {
        ok: true,
        allIn: true,
        amount: amt,
        pot: this.pot,
        ...result,
      };
    }

    this._advanceTurn();
    return {
      ok: true,
      allIn: true,
      amount: amt,
      pot: this.pot,
      betTotal: player.betTotal,
      nextPlayerId: this.players[this.currentPlayerIndex]?.id,
      pots: this.getPotsPreview(),
    };
  }

  // ───────── 弃牌 ─────────

  /**
   * @param {string} playerId
   */
  fold(playerId) {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const found = this.findPlayer(playerId);
    if (!found) return { ok: false, reason: 'player_not_found' };
    const { player, index } = found;
    if (index !== this.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn' };
    }
    if (!isActingStatus(player.status) && player.status !== PlayerStatus.ALL_IN) {
      // All-in 不可弃（已锁定进池）；仅 acting 可弃
      return { ok: false, reason: 'player_out' };
    }
    if (player.status === PlayerStatus.ALL_IN) {
      return { ok: false, reason: 'already_all_in' };
    }

    player.status = PlayerStatus.FOLDED;
    this.actionCount += 1;
    this.actionsInRound += 1;
    this.lastAction = `${player.name} 弃牌`;
    this.emit(GameEvent.FOLD, { playerId: player.id });

    const left = this.contendingPlayers();
    if (left.length <= 1) {
      const winner = left[0] || null;
      return this._settle(winner?.id ?? null, 'last_standing');
    }

    const result = this._afterAction();
    if (result.settled) return { ok: true, folded: true, ...result };

    this._advanceTurn();
    return {
      ok: true,
      folded: true,
      nextPlayerId: this.players[this.currentPlayerIndex]?.id,
      contendingCount: this.contendingPlayers().length,
    };
  }

  // ───────── 比牌 ─────────

  /**
   * 发起比牌
   * - 目标必须为未弃牌且未淘汰
   * - 费用 = 发起方当前单注 × 2
   * - 输者 status → LOST；平局发起方负
   *
   * @param {string} attackerId
   * @param {string} defenderId
   */
  comparePlayerCards(attackerId, defenderId) {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const atk = this.findPlayer(attackerId);
    const def = this.findPlayer(defenderId);
    if (!atk || !def) return { ok: false, reason: 'player_not_found' };
    if (atk.index === def.index) return { ok: false, reason: 'self' };
    if (atk.index !== this.currentPlayerIndex) {
      return { ok: false, reason: 'not_your_turn' };
    }
    // 发起方须能行动；防守方可争胜（含 All-in）
    if (!isActingStatus(atk.player.status)) {
      return { ok: false, reason: 'attacker_cannot_act' };
    }
    if (!isContendingStatus(def.player.status)) {
      return { ok: false, reason: 'target_not_active' };
    }

    // 第一轮限制
    if (!this.options.allowCompareFirstRound) {
      const n = this.contendingPlayers().length;
      if (this.actionCount < n && this.round <= 1) {
        return { ok: false, reason: 'too_early', hint: '第一轮不可比牌' };
      }
    }

    const cost = this.getCompareCost(atk.index);
    if (atk.player.chips < cost) {
      return {
        ok: false,
        reason: 'insufficient_chips',
        need: cost,
        chips: atk.player.chips,
        canAllIn: true,
      };
    }

    // 扣费入池
    atk.player.chips -= cost;
    atk.player.betTotal += cost;
    this.pot += cost;
    this.actionCount += 1;
    this.actionsInRound += 1;

    if (atk.player.chips === 0) {
      atk.player.allIn = true;
      atk.player.status = PlayerStatus.ALL_IN;
      atk.player.looked = true;
    } else {
      atk.player.status = PlayerStatus.LOOKED;
      atk.player.looked = true;
    }
    // 防守方：All-in 保持；否则标已看
    if (def.player.status !== PlayerStatus.ALL_IN) {
      def.player.status = PlayerStatus.LOOKED;
    }
    def.player.looked = true;

    const handsForLeo = this.contendingPlayers().map((p) => p.cards);
    const hasLeoFull = hasLeopardAmong(handsForLeo);

    const cmp = compareHands(atk.player.cards, def.player.cards, hasLeoFull);
    let winnerId;
    let loserId;
    if (cmp > 0) {
      winnerId = atk.player.id;
      loserId = def.player.id;
    } else {
      winnerId = def.player.id;
      loserId = atk.player.id;
    }

    const loser = this.findPlayer(loserId).player;
    loser.status = PlayerStatus.LOST;
    loser.allIn = false;

    const entry = {
      attackerId: atk.player.id,
      defenderId: def.player.id,
      winnerId,
      loserId,
      cost,
      cmp,
      pot: this.pot,
    };
    this.compareLog.push(entry);
    this.lastAction =
      `${atk.player.name} 与 ${def.player.name} 比牌（耗 ${cost}），`
      + `${this.findPlayer(winnerId).player.name} 胜，`
      + `${loser.name} 淘汰`;

    this.emit(GameEvent.COMPARE, entry);

    const left = this.contendingPlayers();
    if (left.length <= 1) {
      return {
        ok: true,
        ...entry,
        ...this._settle(left[0]?.id ?? winnerId, 'compare_last'),
        settled: true,
      };
    }

    const after = this._afterAction();
    if (after.settled) {
      return { ok: true, ...entry, ...after };
    }

    this._advanceTurn();
    return {
      ok: true,
      ...entry,
      nextPlayerId: this.players[this.currentPlayerIndex]?.id,
      contendingCount: left.length,
    };
  }

  // ───────── 强制开牌 ─────────

  forceShowdown(reason = 'max_rounds') {
    if (this.phase !== GamePhase.BETTING) {
      return { ok: false, reason: 'not_betting' };
    }
    const contending = this.contendingPlayers();
    if (contending.length === 0) {
      return this._settle(null, reason);
    }
    if (contending.length === 1) {
      return this._settle(contending[0].id, reason);
    }

    for (const p of contending) {
      p.looked = true;
      if (p.status === PlayerStatus.MEN) p.status = PlayerStatus.LOOKED;
    }
    this.lastAction = `开牌结算（${reason}）· 边池分配`;
    this.emit(GameEvent.FORCE_SHOWDOWN, { reason, contending: contending.map((p) => p.id) });
    // 多池结算，winnerId 由 settleAllPots 决定
    return this._settle(null, reason, { multiPot: true });
  }

  // ───────── 内部 ─────────

  nextActiveIndex(fromIndex) {
    const n = this.players.length;
    for (let s = 1; s <= n; s++) {
      const i = (fromIndex + s) % n;
      if (isActingStatus(this.players[i].status)) return i;
    }
    return fromIndex;
  }

  _advanceTurn() {
    if (this.phase !== GamePhase.BETTING) return;
    // 若无人可行动，不推进
    if (this.actingPlayers().length === 0) return;
    this.currentPlayerIndex = this.nextActiveIndex(this.currentPlayerIndex);
  }

  /**
   * 行动后：仅剩一人 / 全员 All-in / 轮数上限 → 结算
   */
  _afterAction() {
    const contending = this.contendingPlayers();
    if (contending.length <= 1) {
      return this._settle(contending[0]?.id ?? null, 'last_standing');
    }

    const acting = this.actingPlayers();
    // 无人再需下注（全是 All-in 或 至多一人有筹码）→ 开牌
    if (acting.length === 0) {
      return this.forceShowdown('all_in_showdown');
    }
    if (acting.length === 1 && contending.some((p) => p.status === PlayerStatus.ALL_IN)) {
      // 仅一人仍有筹码，其余 All-in：无需再抬注，直接开牌
      return this.forceShowdown('all_in_showdown');
    }

    // 一轮：按仍可行动人数计
    const need = Math.max(1, acting.length);
    if (this.actionsInRound >= need) {
      this.actionsInRound = 0;
      this.round += 1;
      this.emit('round', { round: this.round });
      if (this.round > this.options.maxRounds) {
        return this.forceShowdown('max_rounds');
      }
    }
    return { settled: false };
  }

  /**
   * 结算：主池 + 边池（settleAllPots）
   * @param {string|null} winnerId  单人胜出时可直给；多人开牌传 null + multiPot
   * @param {string} reason
   * @param {{ multiPot?: boolean }} [opts]
   */
  _settle(winnerId, reason, opts = {}) {
    if (this.phase === GamePhase.SETTLING) {
      return {
        ok: true,
        settled: true,
        already: true,
        winnerId: this.winnerId,
        settlement: this.lastSettlement,
      };
    }

    const sumBets = this.players.reduce((s, p) => s + p.betTotal, 0);
    if (sumBets !== this.pot) this.pot = sumBets;

    // 全员亮牌（争胜/淘汰）
    for (const p of this.players) {
      if (isContendingStatus(p.status) || p.status === PlayerStatus.LOST) {
        p.looked = true;
        if (p.status === PlayerStatus.MEN) p.status = PlayerStatus.LOOKED;
      }
    }

    const useMulti =
      opts.multiPot
      || winnerId == null
      || this.contendingPlayers().length > 1
      || this.players.some((p) => p.allIn || p.status === PlayerStatus.ALL_IN);

    let settlement;
    if (useMulti) {
      settlement = settleAllPots(
        this.players.map((p, i) => ({
          id: p.id,
          betTotal: p.betTotal,
          status: p.status,
          allIn: p.allIn,
          cards: p.cards,
          seat: i,
        })),
        { hasLeopardInGame: this.hasLeopardInGame() }
      );
    } else {
      // 单人通吃：等价单主池
      settlement = {
        pots: [{
          index: 0,
          isMain: true,
          amount: this.pot,
          level: this.pot,
          layer: this.pot,
          contributorIds: this.players.filter((p) => p.betTotal > 0).map((p) => p.id),
          eligibleIds: winnerId ? [winnerId] : [],
          winnerIds: winnerId ? [winnerId] : [],
          shares: winnerId ? { [winnerId]: this.pot } : {},
        }],
        awards: Object.fromEntries(
          this.players.map((p) => [p.id, p.id === winnerId ? this.pot : 0])
        ),
        deltas: Object.fromEntries(
          this.players.map((p) => [
            p.id,
            (p.id === winnerId ? this.pot : 0) - p.betTotal,
          ])
        ),
        totalPot: this.pot,
        mainPot: this.pot,
        sidePotsTotal: 0,
      };
    }

    // 发奖到 chips
    for (const p of this.players) {
      const win = settlement.awards[p.id] || 0;
      if (win > 0) p.chips += win;
    }

    // 主胜者：获奖最多者
    const ranked = [...this.players].sort(
      (a, b) => (settlement.awards[b.id] || 0) - (settlement.awards[a.id] || 0)
    );
    const topAward = settlement.awards[ranked[0]?.id] || 0;
    this.winnerIds = ranked
      .filter((p) => (settlement.awards[p.id] || 0) === topAward && topAward > 0)
      .map((p) => p.id);
    this.winnerId = this.winnerIds[0] ?? winnerId;
    this.lastSettlement = settlement;

    this.transition(GamePhase.SETTLING, { reason, winnerId: this.winnerId });

    const potDesc = settlement.pots
      .map((pot) => `${pot.isMain ? '主池' : `边池${pot.index}`}${pot.amount}`
        + `→${(pot.winnerIds || []).join(',') || '-'}`)
      .join(' · ');

    this.lastAction = this.winnerId
      ? `结算（${reason}）· ${potDesc}`
      : `结算 · 无赢家（${reason}）`;

    this.emit('settle', {
      winnerId: this.winnerId,
      winnerIds: this.winnerIds,
      reason,
      pot: this.pot,
      settlement,
      deltas: settlement.deltas,
    });

    return {
      ok: true,
      settled: true,
      winnerId: this.winnerId,
      winnerIds: this.winnerIds,
      reason,
      pot: this.pot,
      settlement,
      deltas: settlement.deltas,
      pots: settlement.pots,
    };
  }

  /**
   * 本局筹码变动（边池分配后）
   */
  settleDeltas() {
    if (this.lastSettlement?.deltas) {
      return { ...this.lastSettlement.deltas };
    }
    const deltas = {};
    for (const p of this.players) {
      deltas[p.id] = -p.betTotal;
    }
    if (this.winnerId != null && deltas[this.winnerId] != null) {
      deltas[this.winnerId] += this.pot;
    }
    return deltas;
  }

  /**
   * 静态/实例均可：对任意玩家列表执行边池结算
   * @param {import('./pots.js').PotPlayer[]} players
   * @param {object} [options]
   */
  static settleAllPots(players, options) {
    return settleAllPots(players, options);
  }

  settleAllPots(players, options) {
    return settleAllPots(players || this.players.map((p, i) => ({
      id: p.id,
      betTotal: p.betTotal,
      status: p.status,
      allIn: p.allIn,
      cards: p.cards,
      seat: i,
    })), options);
  }

  /**
   * @param {string} [viewerId]  视角玩家：仅自己已看/结算可见手牌
   */
  getSnapshot(viewerId = null) {
    const viewer = viewerId != null ? this.findPlayer(viewerId) : null;
    const showAll = this.phase === GamePhase.SETTLING;
    const potsPreview = this.getPotsPreview();

    return {
      phase: this.phase,
      pot: this.pot,
      currentMenStake: this.currentMenStake,
      maxMenStake: this.options.maxMenStake,
      maxRounds: this.options.maxRounds,
      round: this.round,
      actionCount: this.actionCount,
      dealerId: this.players[this.dealerIndex]?.id,
      currentPlayerId: this.players[this.currentPlayerIndex]?.id,
      winnerId: this.winnerId,
      winnerIds: this.winnerIds.slice(),
      lastAction: this.lastAction,
      hasLeopardInGame: this.phase === GamePhase.BETTING || this.phase === GamePhase.SETTLING
        ? hasLeopardAmong(
          this.players.filter((p) => isContendingStatus(p.status) || p.status === PlayerStatus.LOST)
            .map((p) => p.cards)
            .filter((c) => c?.length === 3)
        )
        : false,
      compareLog: this.compareLog.slice(),
      pots: potsPreview.pots,
      mainPot: potsPreview.mainPot,
      sidePotsTotal: potsPreview.sidePotsTotal,
      settlement: this.lastSettlement,
      players: this.players.map((p) => {
        const isSelf = viewer && p.id === viewer.player.id;
        const canSee = showAll || (isSelf && p.looked);
        return {
          id: p.id,
          name: p.name,
          chips: p.chips,
          status: p.status,
          looked: p.looked,
          allIn: p.allIn || p.status === PlayerStatus.ALL_IN,
          betTotal: p.betTotal,
          betUnit: isActingStatus(p.status) ? this.getBetUnit(p.id) : 0,
          compareCost: isActingStatus(p.status) ? this.getCompareCost(p.id) : 0,
          canAllIn: isActingStatus(p.status) && this.canAllIn(p.id),
          cards: canSee ? p.cards.map((c) => ({ ...c })) : null,
          hand: canSee && p.cards.length === 3 ? identifyHandType(p.cards) : null,
        };
      }),
      actingIds: this.actingPlayers().map((p) => p.id),
      contendingIds: this.contendingPlayers().map((p) => p.id),
      activeIds: this.actingPlayers().map((p) => p.id),
      deltas: this.phase === GamePhase.SETTLING ? this.settleDeltas() : null,
      potCheck: {
        pot: this.pot,
        sumBets: this.players.reduce((s, p) => s + p.betTotal, 0),
        potsSum: potsPreview.totalPot,
      },
    };
  }
}

export { buildSidePots, settleAllPots, previewPots };
export default ZajinhuaGameEngine;
