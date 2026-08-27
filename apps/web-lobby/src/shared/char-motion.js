/**
 * 牌桌人物情景动作（非简单漂浮）
 * idle 静止微呼吸；deal 发牌前倾伸手；play 出牌前冲；
 * win 欢呼上跳；lose 垂头后仰；fold 侧身弃牌；think 点头思考；
 * bet 推筹码；call 点头应牌；allin 双手推出
 */

const ACT_CLASS = {
  idle: 'char-act-idle',
  deal: 'char-act-deal',
  play: 'char-act-play',
  bet: 'char-act-bet',
  call: 'char-act-call',
  allin: 'char-act-allin',
  win: 'char-act-win',
  lose: 'char-act-lose',
  fold: 'char-act-fold',
  think: 'char-act-think',
};

const ALL_ACT = Object.values(ACT_CLASS);

const DEFAULT_HOLD = {
  idle: 0,
  deal: 1100,
  play: 900,
  bet: 850,
  call: 700,
  allin: 1200,
  win: 2800,
  lose: 2400,
  fold: 1400,
  think: 900,
};

/** @type {Map<string, number>} */
const timers = new Map();

function seatKey(seat) {
  return String(seat);
}

function collectFigures(seat) {
  const s = seatKey(seat);
  const sels = [
    `[data-char="${s}"] .char-figure`,
    `[data-texas-seat="${s}"] .char-figure`,
    `[data-mg-seat="${s}"] .char-figure`,
    `[data-bj-seat="${s}"] .bj-seat-img`,
    `[data-bj-seat="${s}"] .char-figure`,
    seat === 0 ? '.self-char .char-figure, .char-figure-self .char-figure' : null,
  ].filter(Boolean);
  const nodes = [];
  for (const sel of sels) {
    document.querySelectorAll(sel).forEach((n) => nodes.push(n));
  }
  // 同步容器，方便做整体位移
  const wraps = [];
  nodes.forEach((el) => {
    const w = el.closest('.char-figure-wrap, .bj-seat-char, .tx-char-col, .bj-seat-inner');
    if (w) wraps.push(w);
  });
  return { figs: nodes, wraps };
}

function clearAct(el) {
  ALL_ACT.forEach((c) => el.classList.remove(c));
}

/**
 * @param {number} seat
 * @param {keyof typeof ACT_CLASS} action
 * @param {{ holdMs?: number }} [opts]
 */
export function playCharAction(seat, action, opts = {}) {
  const act = ACT_CLASS[action] ? action : 'idle';
  const cls = ACT_CLASS[act];
  const hold = opts.holdMs ?? DEFAULT_HOLD[act] ?? 900;
  const { figs, wraps } = collectFigures(seat);
  if (!figs.length) return;

  const key = seatKey(seat);
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }

  figs.forEach((el) => {
    clearAct(el);
    // restart animation
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add(cls, 'char-figure-live', 'char-nobg');
    el.dataset.charAct = act;
  });
  wraps.forEach((w) => {
    clearAct(w);
    w.classList.add(cls);
  });

  if (hold > 0 && act !== 'idle') {
    timers.set(
      key,
      setTimeout(() => {
        figs.forEach((el) => {
          clearAct(el);
          el.classList.add(ACT_CLASS.idle, 'char-figure-live', 'char-nobg');
          el.dataset.charAct = 'idle';
        });
        wraps.forEach((w) => {
          clearAct(w);
          w.classList.add(ACT_CLASS.idle);
        });
        timers.delete(key);
      }, hold),
    );
  }
}

export function resetAllCharActions() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  document.querySelectorAll('.char-figure, .bj-seat-img').forEach((el) => {
    clearAct(el);
    el.classList.add(ACT_CLASS.idle, 'char-figure-live', 'char-nobg');
    el.dataset.charAct = 'idle';
  });
}

/**
 * @param {number[]} deltas
 */
export function playSettleActions(deltas = []) {
  deltas.forEach((d, i) => {
    if (d > 0) playCharAction(i, 'win', { holdMs: 2800 });
    else if (d < 0) playCharAction(i, 'lose', { holdMs: 2400 });
    else playCharAction(i, 'idle');
  });
}

/** 根据德州/扑克动作类型映射情景 */
export function playFromPokerAct(seat, type) {
  const map = {
    fold: 'fold',
    check: 'think',
    call: 'call',
    bet: 'bet',
    raise: 'play',
    allin: 'allin',
    hit: 'play',
    stand: 'think',
    double: 'allin',
    deal: 'deal',
    split: 'play',
  };
  playCharAction(seat, map[type] || 'play');
}

export const CHAR_ACTIONS = ACT_CLASS;
