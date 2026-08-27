/**
 * 无限注德州 3 人人机局（1 真人 + 2 AI）
 * 盲注：SB / BB，按钮位每局轮转
 */
import { createDeck, shuffle } from './cards.js';
import { evaluateHand, compareHands, CATEGORY_NAME } from './hand.js';

export const Phase = {
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown',
  SETTLE: 'settle',
};

export function createTexasTable(options = {}) {
  const names = options.names || ['茶馆', '茶友A', '茶友B'];
  const humanIndex = options.humanIndex ?? 0;
  const smallBlind = options.smallBlind ?? 10;
  const bigBlind = options.bigBlind ?? 20;
  const buyIn = options.buyIn ?? 1000;
  let button = options.button ?? 0;

  let state = null;

  function startHand() {
    const deck = shuffle(shuffle(createDeck()));
    const stacks = state?.stacks?.slice() || [buyIn, buyIn, buyIn];
    // 确保还能玩
    for (let i = 0; i < 3; i++) {
      if (stacks[i] < bigBlind) stacks[i] = buyIn; // 人机局补码影子积分
    }

    const sb = (button + 1) % 3;
    const bb = (button + 2) % 3;
    const holes = [[], [], []];
    for (let r = 0; r < 2; r++) {
      for (let p = 0; p < 3; p++) holes[p].push(deck.pop());
    }

    const bets = [0, 0, 0];
    const contrib = [0, 0, 0];
    const folded = [false, false, false];
    const allIn = [false, false, false];

    // 下盲
    function post(p, amount) {
      const pay = Math.min(stacks[p], amount);
      stacks[p] -= pay;
      bets[p] += pay;
      contrib[p] += pay;
      if (stacks[p] === 0) allIn[p] = true;
      return pay;
    }
    post(sb, smallBlind);
    post(bb, bigBlind);

    state = {
      names,
      humanIndex,
      smallBlind,
      bigBlind,
      button,
      sb,
      bb,
      deck,
      holes,
      board: [],
      stacks,
      bets,
      contrib,
      pot: contrib.reduce((a, b) => a + b, 0),
      folded,
      allIn,
      phase: Phase.PREFLOP,
      // preflop 从大盲下一位开始
      current: (bb + 1) % 3,
      toCall: bigBlind,
      minRaise: bigBlind,
      lastAggressor: bb,
      acted: [false, false, false],
      log: [`新一局 · 按钮 ${names[button]} · 盲注 ${smallBlind}/${bigBlind}`],
      winners: null,
      showdown: null,
      handNo: (state?.handNo || 0) + 1,
    };
    // 盲注不算完整行动；preflop 从大盲下一位开始（可能是真人）
    return getPublicState();
  }

  function living() {
    return [0, 1, 2].filter((i) => !state.folded[i]);
  }

  function canAct(i) {
    return !state.folded[i] && !state.allIn[i] && state.stacks[i] >= 0;
  }

  function streetOver() {
    const active = living().filter((i) => !state.allIn[i] || state.bets[i] === state.toCall || state.stacks[i] === 0);
    // 所有未弃牌者：要么 all-in，要么已行动且注额对齐
    const contenders = living();
    if (contenders.length <= 1) return true;
    const needAct = contenders.filter((i) => !state.allIn[i]);
    if (!needAct.length) return true;
    return needAct.every((i) => state.acted[i] && state.bets[i] === state.toCall);
  }

  function nextActor(from) {
    for (let k = 1; k <= 3; k++) {
      const i = (from + k) % 3;
      if (canAct(i) && (state.bets[i] < state.toCall || !state.acted[i])) return i;
    }
    return -1;
  }

  function advanceIfNeeded() {
    // 只剩一人
    const alive = living();
    if (alive.length === 1) {
      endHand(alive);
      return;
    }
    if (!streetOver()) {
      const n = nextActor(state.current);
      if (n >= 0) state.current = n;
      return;
    }
    // 进下一街
    goNextStreet();
  }

  function goNextStreet() {
    // 收注进池（已在 pot 累计）
    state.bets = [0, 0, 0];
    state.toCall = 0;
    state.minRaise = state.bigBlind;
    state.acted = [false, false, false];
    state.lastAggressor = -1;

    if (state.phase === Phase.PREFLOP) {
      state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      state.phase = Phase.FLOP;
      state.log.unshift(`翻牌 ${state.board.map((c) => c.rank).join('-')}`);
    } else if (state.phase === Phase.FLOP) {
      state.board.push(state.deck.pop());
      state.phase = Phase.TURN;
      state.log.unshift('转牌');
    } else if (state.phase === Phase.TURN) {
      state.board.push(state.deck.pop());
      state.phase = Phase.RIVER;
      state.log.unshift('河牌');
    } else if (state.phase === Phase.RIVER) {
      showdown();
      return;
    }

    // 新街从按钮下一位未弃牌者开始
    let start = (state.button + 1) % 3;
    for (let k = 0; k < 3; k++) {
      const i = (start + k) % 3;
      if (!state.folded[i] && !state.allIn[i]) {
        state.current = i;
        break;
      }
    }
    // 若全 all-in 直接发完
    if (living().every((i) => state.allIn[i] || state.folded[i])) {
      while (state.phase !== Phase.SHOWDOWN && state.phase !== Phase.SETTLE) {
        if (state.phase === Phase.FLOP) {
          state.board.push(state.deck.pop());
          state.phase = Phase.TURN;
        } else if (state.phase === Phase.TURN) {
          state.board.push(state.deck.pop());
          state.phase = Phase.RIVER;
        } else if (state.phase === Phase.RIVER) {
          showdown();
          return;
        } else break;
      }
    }
  }

  function showdown() {
    state.phase = Phase.SHOWDOWN;
    const alive = living();
    const evals = alive.map((i) => ({
      seat: i,
      eval: evaluateHand(state.holes[i], state.board),
    }));
    evals.sort((a, b) => compareHands(b.eval, a.eval));
    const best = evals[0].eval;
    const winners = evals.filter((e) => compareHands(e.eval, best) === 0).map((e) => e.seat);
    endHand(winners, evals);
  }

  function endHand(winners, evals = null) {
    const awards = awardPots(winners, evals);
    for (let i = 0; i < 3; i++) {
      if (awards[i] > 0) state.stacks[i] += awards[i];
    }
    const pot = state.pot;
    state.winners = winners;
    state.showdown = evals;
    state.phase = Phase.SETTLE;
    state.pot = 0;
    const top = winners[0];
    state.log.unshift(
      `结算：${winners.map((w) => state.names[w]).join('、')} 获胜 +${awards[top] || 0}`
      + (evals ? `（${evals.find((e) => e.seat === winners[0]).eval.name}）` : ' 无人跟注'),
    );
    button = (button + 1) % 3;
    return pot;
  }

  /** 按投入拆主池/边池；弃牌者筹码仍在池中但不能赢 */
  function awardPots(winners, evals) {
    const awards = [0, 0, 0];
    if (!evals || !winners.length) {
      if (!winners.length) return awards;
      const pot = state.pot;
      const share = Math.floor(pot / winners.length);
      let rem = pot - share * winners.length;
      for (const w of winners) {
        awards[w] = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
      }
      return awards;
    }

    const levels = [...new Set(state.contrib.filter((x) => x > 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const level of levels) {
      const layer = level - prev;
      if (layer <= 0) {
        prev = level;
        continue;
      }
      const contributors = [0, 1, 2].filter((i) => state.contrib[i] >= level);
      const amount = layer * contributors.length;
      const eligible = contributors.filter((i) => !state.folded[i]);
      const eligibleEvals = evals.filter((e) => eligible.includes(e.seat));
      let potWinners = eligibleEvals.length
        ? eligibleEvals.filter((e) => compareHands(e.eval, eligibleEvals[0].eval) === 0).map((e) => e.seat)
        : eligible;
      if (!potWinners.length) potWinners = contributors;
      if (!potWinners.length || amount <= 0) {
        prev = level;
        continue;
      }
      const share = Math.floor(amount / potWinners.length);
      let rem = amount - share * potWinners.length;
      for (const w of potWinners) {
        awards[w] += share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
      }
      prev = level;
    }
    return awards;
  }

  /**
   * action: { type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', amount? }
   * amount 为加注后总本街注额（toCall 目标）或加注增量
   */
  function applyAction(seat, action) {
    if (!state || state.phase === Phase.SETTLE || state.phase === Phase.SHOWDOWN) {
      return { ok: false, reason: 'hand_over' };
    }
    if (seat !== state.current) return { ok: false, reason: 'not_your_turn' };
    if (state.folded[seat] || state.allIn[seat]) return { ok: false, reason: 'cannot_act' };

    const type = action.type;
    const need = Math.max(0, state.toCall - state.bets[seat]);
    const stack = state.stacks[seat];

    if (type === 'fold') {
      state.folded[seat] = true;
      state.acted[seat] = true;
      state.log.unshift(`${state.names[seat]} 弃牌`);
      advanceIfNeeded();
      return { ok: true };
    }

    if (type === 'check') {
      if (need > 0) return { ok: false, reason: 'cannot_check' };
      state.acted[seat] = true;
      state.log.unshift(`${state.names[seat]} 过牌`);
      advanceIfNeeded();
      return { ok: true };
    }

    if (type === 'call') {
      const pay = Math.min(stack, need);
      state.stacks[seat] -= pay;
      state.bets[seat] += pay;
      state.contrib[seat] += pay;
      state.pot += pay;
      if (state.stacks[seat] === 0) state.allIn[seat] = true;
      state.acted[seat] = true;
      state.log.unshift(`${state.names[seat]} 跟注 ${pay}`);
      advanceIfNeeded();
      return { ok: true };
    }

    if (type === 'bet' || type === 'raise' || type === 'allin') {
      let target;
      if (type === 'allin') {
        target = state.bets[seat] + stack;
      } else {
        // amount = 本街总投入目标
        target = Number(action.amount);
        if (!Number.isFinite(target)) return { ok: false, reason: 'bad_amount' };
      }
      const pay = target - state.bets[seat];
      if (pay <= 0) return { ok: false, reason: 'bad_amount' };
      if (pay > stack) return { ok: false, reason: 'insufficient' };

      // 加注合法性：至少 minRaise（除 all-in 不足）
      const raiseBy = target - state.toCall;
      if (type !== 'allin' && target < state.toCall) return { ok: false, reason: 'below_call' };
      if (type !== 'allin' && state.toCall > 0 && raiseBy > 0 && raiseBy < state.minRaise && target < state.bets[seat] + stack) {
        // 允许 all-in 短加
        if (pay < stack) return { ok: false, reason: 'min_raise' };
      }
      if (type === 'bet' && state.toCall > 0) return { ok: false, reason: 'use_raise' };

      state.stacks[seat] -= pay;
      state.bets[seat] += pay;
      state.contrib[seat] += pay;
      state.pot += pay;
      if (state.stacks[seat] === 0) state.allIn[seat] = true;

      if (target > state.toCall) {
        const raised = target - state.toCall;
        if (raised >= state.minRaise) state.minRaise = raised;
        state.toCall = target;
        state.lastAggressor = seat;
        // 其他人需重新行动
        state.acted = [false, false, false];
      }
      state.acted[seat] = true;
      state.log.unshift(
        `${state.names[seat]} ${type === 'allin' ? '全下' : (state.toCall === target && raiseBy <= 0 ? '下注' : '加注')} ${pay}`,
      );
      advanceIfNeeded();
      return { ok: true };
    }

    return { ok: false, reason: 'unknown_action' };
  }

  function getLegalActions(seat = state?.current) {
    if (!state || seat !== state.current || state.phase === Phase.SETTLE) return [];
    if (state.folded[seat] || state.allIn[seat]) return [];
    const need = Math.max(0, state.toCall - state.bets[seat]);
    const stack = state.stacks[seat];
    const acts = [{ type: 'fold' }];
    if (need === 0) acts.push({ type: 'check' });
    if (need > 0 && stack > 0) acts.push({ type: 'call', amount: Math.min(need, stack) });
    if (stack > need) {
      if (state.toCall === 0) {
        acts.push({ type: 'bet', min: state.bigBlind, max: stack });
      } else {
        acts.push({ type: 'raise', min: state.toCall + state.minRaise, max: state.bets[seat] + stack });
      }
      acts.push({ type: 'allin', amount: state.bets[seat] + stack });
    } else if (stack > 0 && need >= stack) {
      acts.push({ type: 'allin', amount: state.bets[seat] + stack });
    }
    return acts;
  }

  function getPublicState(viewer = humanIndex) {
    if (!state) return null;
    return {
      names: state.names.slice(),
      humanIndex,
      button: state.button,
      sb: state.sb,
      bb: state.bb,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      phase: state.phase,
      board: state.board.slice(),
      pot: state.pot,
      current: state.current,
      toCall: state.toCall,
      minRaise: state.minRaise,
      stacks: state.stacks.slice(),
      bets: state.bets.slice(),
      folded: state.folded.slice(),
      allIn: state.allIn.slice(),
      holes: state.holes.map((h, i) => (
        i === viewer || state.phase === Phase.SETTLE || state.phase === Phase.SHOWDOWN
          ? h.slice()
          : h.map(() => null)
      )),
      // 结算时亮牌
      holesRevealed: state.phase === Phase.SETTLE || state.phase === Phase.SHOWDOWN
        ? state.holes.map((h) => h.slice())
        : null,
      winners: state.winners,
      showdown: state.showdown,
      log: state.log.slice(0, 8),
      legal: getLegalActions(viewer),
      handNo: state.handNo,
    };
  }

  function nextHand() {
    return startHand();
  }

  return {
    startHand,
    nextHand,
    applyAction,
    getPublicState,
    getLegalActions,
    get state() { return state; },
  };
}

export { CATEGORY_NAME };
