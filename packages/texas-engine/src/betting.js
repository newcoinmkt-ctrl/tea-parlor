/**
 * TexasBettingEngine — 德州扑克多轮下注状态机
 *
 * 街道：PREFLOP → FLOP → TURN → RIVER → SHOWDOWN
 * 动作：SB/BB/Straddle、Check、Call、Raise/Re-raise、Fold、All-in
 * 边池：calculatePots / distributePots
 */

import { calculatePots, distributePots, settleTexasPots } from './pots.js';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

export const Street = Object.freeze({
  WAITING: 'waiting',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  FINISHED: 'finished',
});

export const PlayerStatus = Object.freeze({
  ACTIVE: 'active',
  FOLDED: 'folded',
  ALL_IN: 'all_in',
  SITTING_OUT: 'sitting_out',
});

export const ActionType = Object.freeze({
  POST_SB: 'post_sb',
  POST_BB: 'post_bb',
  STRADDLE: 'straddle',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise',
  FOLD: 'fold',
  ALL_IN: 'all_in',
});

const STREET_ORDER = [
  Street.PREFLOP,
  Street.FLOP,
  Street.TURN,
  Street.RIVER,
  Street.SHOWDOWN,
];

// ─────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────

/**
 * @typedef {object} BettingPlayer
 * @property {string} id
 * @property {string} [name]
 * @property {number} seat
 * @property {number} chips
 * @property {number} betStreet   本街已投入
 * @property {number} betTotal    本局累计
 * @property {string} status
 * @property {boolean} actedThisRound  本轮面对当前注额是否已行动
 */

/**
 * @param {{
 *   playerIds?: string[],
 *   playerNames?: string[],
 *   chips?: number[],
 *   smallBlind?: number,
 *   bigBlind?: number,
 *   buttonSeat?: number,
 *   minPlayers?: number,
 *   allowStraddle?: boolean,
 *   dealerButton?: number,
 * }} [options]
 */
export class TexasBettingEngine {
  constructor(options = {}) {
    this.sb = Math.max(1, Number(options.smallBlind) || 5);
    this.bb = Math.max(this.sb, Number(options.bigBlind) || this.sb * 2);
    this.allowStraddle = options.allowStraddle !== false;

    const ids = options.playerIds || ['p0', 'p1', 'p2'];
    const names = options.playerNames || ids.map((id, i) => `P${i}`);
    const chips = options.chips || ids.map(() => 1000);
    if (ids.length < 2 || ids.length > 10) {
      throw new RangeError('player count must be 2–10');
    }

    /** @type {BettingPlayer[]} */
    this.players = ids.map((id, i) => ({
      id: String(id),
      name: names[i] || String(id),
      seat: i,
      chips: Math.max(0, Number(chips[i]) || 0),
      betStreet: 0,
      betTotal: 0,
      status: PlayerStatus.ACTIVE,
      actedThisRound: false,
    }));

    this.buttonSeat = options.buttonSeat != null
      ? options.buttonSeat % this.players.length
      : (options.dealerButton != null ? options.dealerButton % this.players.length : 0);

    this.street = Street.WAITING;
    this.pot = 0; // 冗余：应等于 sum(betTotal)
    this.currentBet = 0; // 本街最高单人投入
    this.minRaise = this.bb; // 最小加注增量
    this.lastRaiseSize = this.bb;
    this.currentSeat = 0;
    this.actionLog = [];
    this.straddleSeat = -1;
    /** 本手是否已 straddle */
    this.straddlePosted = false;
    this._handId = 0;
  }

  // ── 查询 ──

  get n() {
    return this.players.length;
  }

  playerById(id) {
    return this.players.find((p) => p.id === String(id)) || null;
  }

  playerBySeat(seat) {
    return this.players.find((p) => p.seat === seat) || null;
  }

  /** 小盲座位：HU 时 button=SB */
  get sbSeat() {
    if (this.n === 2) return this.buttonSeat;
    return this.nextSeat(this.buttonSeat, () => true);
  }

  get bbSeat() {
    if (this.n === 2) return this.nextSeat(this.buttonSeat, () => true);
    return this.nextSeat(this.sbSeat, () => true);
  }

  /** 默认 straddle：BB 左手位 */
  get defaultStraddleSeat() {
    return this.nextSeat(this.bbSeat, () => true);
  }

  nextSeat(from, pred) {
    for (let k = 1; k <= this.n; k++) {
      const s = (from + k) % this.n;
      const p = this.playerBySeat(s);
      if (p && pred(p)) return s;
    }
    return from;
  }

  activePlayers() {
    return this.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.ALL_IN
    );
  }

  canActPlayers() {
    return this.players.filter((p) => p.status === PlayerStatus.ACTIVE && p.chips > 0);
  }

  contendingPlayers() {
    return this.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.ALL_IN
    );
  }

  /**
   * 跟注还需多少（本街）
   * @param {BettingPlayer} p
   */
  toCallAmount(p) {
    return Math.max(0, this.currentBet - p.betStreet);
  }

  /**
   * 最小加注后的总本街投入（绝对额）
   * NL：至少 currentBet + lastRaiseSize
   */
  minRaiseTo() {
    return this.currentBet + this.lastRaiseSize;
  }

  // ── 开局 ──

  /**
   * 开始新手：下盲注，进入 PREFLOP
   * @param {{ buttonSeat?: number }} [opts]
   */
  startHand(opts = {}) {
    if (opts.buttonSeat != null) {
      this.buttonSeat = opts.buttonSeat % this.n;
    }

    for (const p of this.players) {
      p.betStreet = 0;
      p.betTotal = 0;
      p.actedThisRound = false;
      if (p.chips > 0) p.status = PlayerStatus.ACTIVE;
      else p.status = PlayerStatus.SITTING_OUT;
    }

    const seated = this.players.filter((p) => p.status === PlayerStatus.ACTIVE);
    if (seated.length < 2) {
      return { ok: false, reason: 'not_enough_players' };
    }

    this._handId += 1;
    this.street = Street.PREFLOP;
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.lastRaiseSize = this.bb;
    this.straddleSeat = -1;
    this.straddlePosted = false;
    this.actionLog = [];

    // 下盲
    const sbP = this.playerBySeat(this.sbSeat);
    const bbP = this.playerBySeat(this.bbSeat);
    this._postBlind(sbP, this.sb, ActionType.POST_SB);
    this._postBlind(bbP, this.bb, ActionType.POST_BB);

    this.currentBet = Math.max(sbP.betStreet, bbP.betStreet);
    // 盲注不视为「已完成自愿行动」：preflop 仍需轮到时决策
    sbP.actedThisRound = false;
    bbP.actedThisRound = false;

    // 行动位：UTG（BB 左手）；HU 时 button/SB 先动
    if (this.n === 2) {
      this.currentSeat = this.sbSeat;
    } else {
      this.currentSeat = this.nextSeat(this.bbSeat, (p) => p.status === PlayerStatus.ACTIVE);
    }

    this._log('hand_start', {
      button: this.buttonSeat,
      sb: this.sbSeat,
      bb: this.bbSeat,
      handId: this._handId,
    });

    return {
      ok: true,
      street: this.street,
      currentSeat: this.currentSeat,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
    };
  }

  /**
   * 抓牌（Straddle）：通常 BB 左手，额度为 2×BB，仅限 preflop 且无人加注前
   * @param {string} playerId
   * @param {number} [amount]
   */
  straddle(playerId, amount) {
    if (!this.allowStraddle) return { ok: false, reason: 'straddle_disabled' };
    if (this.street !== Street.PREFLOP) return { ok: false, reason: 'not_preflop' };
    if (this.straddlePosted) return { ok: false, reason: 'already_straddled' };
    // 仅允许在 BB 下完、尚未有非盲加注时：currentBet 仍为 BB
    if (this.currentBet > this.bb) return { ok: false, reason: 'action_already_raised' };

    const p = this.playerById(playerId);
    if (!p || p.status !== PlayerStatus.ACTIVE) return { ok: false, reason: 'invalid_player' };
    if (p.seat !== this.defaultStraddleSeat) {
      return { ok: false, reason: 'not_straddle_seat', expectedSeat: this.defaultStraddleSeat };
    }

    const amt = amount != null ? Math.floor(Number(amount)) : this.bb * 2;
    if (amt < this.bb * 2) return { ok: false, reason: 'straddle_min', min: this.bb * 2 };

    const need = amt - p.betStreet;
    if (need <= 0) return { ok: false, reason: 'already_covered' };
    const paid = this._commit(p, need);
    this.straddlePosted = true;
    this.straddleSeat = p.seat;

    const raiseSize = amt - this.currentBet;
    if (amt > this.currentBet) {
      this.lastRaiseSize = Math.max(this.bb, raiseSize);
      this.currentBet = amt;
    }
    // straddle 后从 straddle 左手开始
    this.currentSeat = this.nextSeat(p.seat, (x) => x.status === PlayerStatus.ACTIVE);
    this._resetActedFlags(p.id);
    p.actedThisRound = true;

    this._log(ActionType.STRADDLE, { playerId: p.id, amount: paid, to: p.betStreet });
    return { ok: true, amount: paid, currentBet: this.currentBet };
  }

  // ── 玩家动作 ──

  /**
   * 统一动作入口
   * @param {string} playerId
   * @param {string} action  check|call|raise|fold|all_in
   * @param {{ raiseTo?: number, raiseBy?: number }} [params]
   *   raiseTo = 本街总投入目标；raiseBy = 在 toCall 之外再加
   */
  act(playerId, action, params = {}) {
    if (this.street === Street.WAITING || this.street === Street.FINISHED || this.street === Street.SHOWDOWN) {
      return { ok: false, reason: 'not_betting' };
    }
    const p = this.playerById(playerId);
    if (!p) return { ok: false, reason: 'player_not_found' };
    if (p.seat !== this.currentSeat) {
      return { ok: false, reason: 'not_your_turn', current: this.playerBySeat(this.currentSeat)?.id };
    }
    if (p.status !== PlayerStatus.ACTIVE) return { ok: false, reason: 'cannot_act' };

    const act = String(action).toLowerCase().replace(/-/g, '_');
    let result;
    switch (act) {
      case ActionType.FOLD:
      case 'fold':
        result = this._fold(p);
        break;
      case ActionType.CHECK:
      case 'check':
        result = this._check(p);
        break;
      case ActionType.CALL:
      case 'call':
        result = this._call(p);
        break;
      case ActionType.RAISE:
      case 'raise':
      case 're_raise':
      case 'reraise':
        result = this._raise(p, params);
        break;
      case ActionType.ALL_IN:
      case 'all_in':
      case 'allin':
        result = this._allIn(p);
        break;
      default:
        return { ok: false, reason: 'unknown_action' };
    }
    if (!result.ok) return result;

    // 是否只剩一人争胜
    const cont = this.contendingPlayers();
    if (cont.length <= 1) {
      return this._endHand('last_standing');
    }

    // 本街是否结束
    if (this._streetClosed()) {
      return this._advanceStreet();
    }

    this._nextActor();
    return {
      ...result,
      ok: true,
      nextSeat: this.currentSeat,
      nextPlayerId: this.playerBySeat(this.currentSeat)?.id,
      street: this.street,
      pot: this._sumBets(),
    };
  }

  fold(playerId) {
    return this.act(playerId, ActionType.FOLD);
  }

  check(playerId) {
    return this.act(playerId, ActionType.CHECK);
  }

  call(playerId) {
    return this.act(playerId, ActionType.CALL);
  }

  /**
   * @param {string} playerId
   * @param {number} raiseTo  本街总投入
   */
  raise(playerId, raiseTo) {
    return this.act(playerId, ActionType.RAISE, { raiseTo });
  }

  allIn(playerId) {
    return this.act(playerId, ActionType.ALL_IN);
  }

  // ── 内部动作 ──

  _fold(p) {
    p.status = PlayerStatus.FOLDED;
    p.actedThisRound = true;
    this._log(ActionType.FOLD, { playerId: p.id });
    return { ok: true, action: ActionType.FOLD };
  }

  _check(p) {
    if (this.toCallAmount(p) > 0) {
      return { ok: false, reason: 'cannot_check', toCall: this.toCallAmount(p) };
    }
    p.actedThisRound = true;
    this._log(ActionType.CHECK, { playerId: p.id });
    return { ok: true, action: ActionType.CHECK };
  }

  _call(p) {
    const toCall = this.toCallAmount(p);
    if (toCall <= 0) {
      return this._check(p);
    }
    if (p.chips <= toCall) {
      return this._allIn(p);
    }
    this._commit(p, toCall);
    p.actedThisRound = true;
    this._log(ActionType.CALL, { playerId: p.id, amount: toCall });
    return { ok: true, action: ActionType.CALL, amount: toCall };
  }

  _raise(p, params) {
    const toCall = this.toCallAmount(p);
    let raiseTo;
    if (params.raiseTo != null) {
      raiseTo = Math.floor(Number(params.raiseTo));
    } else if (params.raiseBy != null) {
      raiseTo = p.betStreet + toCall + Math.floor(Number(params.raiseBy));
    } else {
      raiseTo = this.minRaiseTo();
    }

    if (raiseTo <= this.currentBet) {
      return { ok: false, reason: 'raise_too_small', minRaiseTo: this.minRaiseTo() };
    }

    // 全下不足最小加注：转为 all-in（短码加注规则：可 all-in 但不重开完整加注额度——简化为允许并更新 currentBet）
    const need = raiseTo - p.betStreet;
    if (need >= p.chips) {
      return this._allIn(p);
    }

    if (raiseTo < this.minRaiseTo() && p.chips > need) {
      return { ok: false, reason: 'below_min_raise', minRaiseTo: this.minRaiseTo() };
    }

    const raiseSize = raiseTo - this.currentBet;
    this._commit(p, need);
    this.lastRaiseSize = Math.max(this.bb, raiseSize);
    this.currentBet = p.betStreet;
    this._resetActedFlags(p.id);
    p.actedThisRound = true;

    this._log(ActionType.RAISE, {
      playerId: p.id,
      raiseTo: p.betStreet,
      raiseSize,
      amount: need,
    });
    return {
      ok: true,
      action: ActionType.RAISE,
      raiseTo: p.betStreet,
      amount: need,
    };
  }

  _allIn(p) {
    if (p.chips <= 0) return { ok: false, reason: 'no_chips' };
    const goingTo = p.betStreet + p.chips;
    const paid = this._commit(p, p.chips);
    p.status = PlayerStatus.ALL_IN;
    p.actedThisRound = true;

    if (goingTo > this.currentBet) {
      const raiseSize = goingTo - this.currentBet;
      // 全下加注额 ≥ minRaise 才重开行动
      if (raiseSize >= this.lastRaiseSize) {
        this.lastRaiseSize = raiseSize;
        this._resetActedFlags(p.id);
      } else {
        // 短码 all-in：抬高 currentBet，但不重置已行动玩家的义务（简化：仍重置未匹配者）
        this._resetActedUnmatched();
      }
      this.currentBet = Math.max(this.currentBet, goingTo);
    }

    this._log(ActionType.ALL_IN, { playerId: p.id, amount: paid, to: p.betStreet });
    return { ok: true, action: ActionType.ALL_IN, amount: paid };
  }

  _postBlind(p, amount, type) {
    if (!p || p.status !== PlayerStatus.ACTIVE) return 0;
    const pay = Math.min(amount, p.chips);
    this._commit(p, pay);
    if (p.chips === 0) p.status = PlayerStatus.ALL_IN;
    this._log(type, { playerId: p.id, amount: pay });
    return pay;
  }

  /**
   * 从玩家筹码扣 amount 入本街/累计
   */
  _commit(p, amount) {
    const pay = Math.min(Math.max(0, Math.floor(amount)), p.chips);
    p.chips -= pay;
    p.betStreet += pay;
    p.betTotal += pay;
    this.pot = this._sumBets();
    if (p.chips === 0 && p.status === PlayerStatus.ACTIVE) {
      p.status = PlayerStatus.ALL_IN;
    }
    return pay;
  }

  _sumBets() {
    return this.players.reduce((s, p) => s + p.betTotal, 0);
  }

  _resetActedFlags(exceptId) {
    for (const p of this.players) {
      if (p.status === PlayerStatus.ACTIVE && p.id !== exceptId) {
        p.actedThisRound = false;
      }
    }
  }

  _resetActedUnmatched() {
    for (const p of this.players) {
      if (p.status === PlayerStatus.ACTIVE && p.betStreet < this.currentBet) {
        p.actedThisRound = false;
      }
    }
  }

  /**
   * 本街是否所有可行动者都已匹配注额并行动完毕
   */
  _streetClosed() {
    const actors = this.canActPlayers();
    if (actors.length === 0) return true;
    // 至少一人仍可行动且未匹配或未行动
    for (const p of actors) {
      if (p.betStreet < this.currentBet) return false;
      if (!p.actedThisRound) return false;
    }
    return true;
  }

  _nextActor() {
    const start = this.currentSeat;
    for (let k = 1; k <= this.n; k++) {
      const s = (start + k) % this.n;
      const p = this.playerBySeat(s);
      if (!p || p.status !== PlayerStatus.ACTIVE) continue;
      // 需要行动：未匹配或未 acted
      if (p.betStreet < this.currentBet || !p.actedThisRound) {
        this.currentSeat = s;
        return;
      }
    }
    // 无人 → 保持
  }

  /**
   * 进入下一街或摊牌
   */
  _advanceStreet() {
    // 收本街：betStreet 清零（累计 betTotal 保留）
    for (const p of this.players) {
      p.betStreet = 0;
      p.actedThisRound = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.bb;
    this.minRaise = this.bb;

    const idx = STREET_ORDER.indexOf(this.street);
    const cont = this.contendingPlayers();
    const canStillBet = this.canActPlayers().length >= 2
      && this.canActPlayers().some((p) => p.chips > 0);

    // 只剩 ≤1 人能行动（其余 all-in）→ 直接摊牌
    if (this.canActPlayers().length <= 1 && cont.length >= 2) {
      this.street = Street.SHOWDOWN;
      this._log('showdown', { reason: 'all_in_runout' });
      return {
        ok: true,
        streetAdvanced: true,
        street: this.street,
        showdown: true,
        pots: this.calculatePots(),
      };
    }

    if (idx < 0 || this.street === Street.RIVER) {
      this.street = Street.SHOWDOWN;
      this._log('showdown', { reason: 'river_complete' });
      return {
        ok: true,
        streetAdvanced: true,
        street: this.street,
        showdown: true,
        pots: this.calculatePots(),
      };
    }

    this.street = STREET_ORDER[idx + 1];
    if (this.street === Street.SHOWDOWN) {
      return {
        ok: true,
        streetAdvanced: true,
        street: this.street,
        showdown: true,
        pots: this.calculatePots(),
      };
    }

    // 翻后第一行动：button 左手第一个仍 active 的玩家
    this.currentSeat = this.nextSeat(
      this.buttonSeat,
      (p) => p.status === PlayerStatus.ACTIVE
    );

    this._log('street', { street: this.street, currentSeat: this.currentSeat });
    return {
      ok: true,
      streetAdvanced: true,
      street: this.street,
      currentSeat: this.currentSeat,
      nextPlayerId: this.playerBySeat(this.currentSeat)?.id,
      pot: this._sumBets(),
      pots: this.calculatePots(),
    };
  }

  _endHand(reason) {
    this.street = Street.FINISHED;
    const winners = this.contendingPlayers();
    const pots = this.calculatePots();
    // 单人通吃：所有池给他
    /** @type {Record<string, number>} */
    const awards = {};
    if (winners.length === 1) {
      const w = winners[0];
      const total = this._sumBets();
      awards[w.id] = total;
      w.chips += total;
      // 清空记账
      for (const p of this.players) {
        p.betTotal = 0;
        p.betStreet = 0;
      }
      this.pot = 0;
    }
    this._log('hand_end', { reason, awards });
    return {
      ok: true,
      settled: true,
      reason,
      street: this.street,
      awards,
      pots,
      winnerIds: winners.map((w) => w.id),
    };
  }

  // ── 边池 API ──

  /**
   * 当前牌桌边池快照
   */
  calculatePots() {
    return calculatePots(this.players.map((p) => ({
      id: p.id,
      betTotal: p.betTotal,
      folded: p.status === PlayerStatus.FOLDED,
      allIn: p.status === PlayerStatus.ALL_IN,
      seat: p.seat,
      status: p.status,
    })));
  }

  /**
   * 亮牌结算
   * @param {Array<{ id: string, rank?: number, score?: number }>} playerRankings
   *   rank: 1 最好；或 score 越大越好
   */
  distributePots(playerRankings) {
    const pots = this.calculatePots();
    const result = distributePots(pots, playerRankings, {
      sbSeat: this.sbSeat,
      seats: Object.fromEntries(this.players.map((p) => [p.id, p.seat])),
      playerCount: this.n,
    });

    // 发到 chips，清空 betTotal
    for (const p of this.players) {
      const win = result.awards[p.id] || result.awards[String(p.id)] || 0;
      if (win > 0) p.chips += win;
      p.betTotal = 0;
      p.betStreet = 0;
    }
    this.pot = 0;
    this.street = Street.FINISHED;
    this._log('distribute', { awards: result.awards });
    return {
      ok: true,
      ...result,
      street: this.street,
    };
  }

  /** 静态导出，便于单测 */
  static calculatePots(playersState) {
    return calculatePots(playersState);
  }

  static distributePots(pots, rankings, options) {
    return distributePots(pots, rankings, options);
  }

  static settleTexasPots(playersState, rankings, options) {
    return settleTexasPots(playersState, rankings, options);
  }

  // ── 快照 ──

  getSnapshot() {
    return {
      street: this.street,
      buttonSeat: this.buttonSeat,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      currentSeat: this.currentSeat,
      currentPlayerId: this.playerBySeat(this.currentSeat)?.id,
      currentBet: this.currentBet,
      minRaiseTo: this.minRaiseTo(),
      lastRaiseSize: this.lastRaiseSize,
      pot: this._sumBets(),
      pots: this.calculatePots(),
      smallBlind: this.sb,
      bigBlind: this.bb,
      straddlePosted: this.straddlePosted,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: p.chips,
        betStreet: p.betStreet,
        betTotal: p.betTotal,
        status: p.status,
        toCall: p.status === PlayerStatus.ACTIVE ? this.toCallAmount(p) : 0,
        actedThisRound: p.actedThisRound,
      })),
      actionLog: this.actionLog.slice(-40),
    };
  }

  legalActions(playerId) {
    const p = this.playerById(playerId);
    if (!p || p.seat !== this.currentSeat || p.status !== PlayerStatus.ACTIVE) {
      return [];
    }
    if (this.street === Street.SHOWDOWN || this.street === Street.FINISHED) return [];

    const acts = [ActionType.FOLD, ActionType.ALL_IN];
    const toCall = this.toCallAmount(p);
    if (toCall === 0) acts.push(ActionType.CHECK);
    else acts.push(ActionType.CALL);
    // 有余筹可加注
    if (p.chips > toCall) acts.push(ActionType.RAISE);
    return acts;
  }

  _log(type, data = {}) {
    this.actionLog.push({ type, ...data, t: Date.now(), street: this.street });
    if (this.actionLog.length > 300) this.actionLog.shift();
  }
}

export default TexasBettingEngine;
