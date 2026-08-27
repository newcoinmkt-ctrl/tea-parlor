/**
 * 炸金花 H5 引擎（对齐 packages/zhajinhua-engine 玩法）
 *
 * - 牌型：豹子 > 顺金 > 金花 > 顺子 > 对子 > 散牌；A23 最小顺
 * - 235：有豹子时仅克豹子；无豹子时最小散牌
 * - 看牌单注 = 闷注 × 2；比牌费用 = 当前单注 × 2
 * - All-in / 主池·边池结算
 * - 公开防篡改码（浏览器可验证承诺）
 */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const HandType = {
  HIGH: 0,
  PAIR: 1,
  STRAIGHT: 2,
  FLUSH: 3,
  STRAIGHT_FLUSH: 4,
  TRIPLE: 5,
};

export const TYPE_NAME = {
  [HandType.HIGH]: '散牌',
  [HandType.PAIR]: '对子',
  [HandType.STRAIGHT]: '顺子',
  [HandType.FLUSH]: '金花',
  [HandType.STRAIGHT_FLUSH]: '同花顺',
  [HandType.TRIPLE]: '豹子',
};

export const PlayerStatus = {
  MEN: 'men',
  LOOKED: 'looked',
  ALL_IN: 'all_in',
  FOLDED: 'folded',
  LOST: 'lost',
};

let _uid = 0;

export function createCard(rank, suit) {
  return {
    id: `zj_${rank}_${suit}_${_uid++}`,
    rank,
    suit,
    isRed: suit === 0 || suit === 2,
  };
}

export function createDeck52() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) deck.push(createCard(rank, suit));
  }
  return deck;
}

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardText(c) {
  if (!c) return '';
  return `${SUITS[c.suit] || ''}${RANK_LABEL[c.rank] || c.rank}`;
}

function cardKey(c) {
  return `${Number(c.rank)}_${Number(c.suit)}`;
}

// ─── 简单哈希 / 公平码（浏览器无 node:crypto） ───

export function hashHex(str) {
  // djb2 + 扩展 → 16 hex（演示级承诺，非密码学）
  let h1 = 5381;
  let h2 = 52711;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1) ^ c;
    h2 = ((h2 << 5) + h2 + c) | 0;
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}`;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fairDealDeck() {
  const serverSeed = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  const salt = Math.random().toString(36).slice(2, 10);
  const commitHash = hashHex(`${serverSeed}:${salt}`);
  const rng = mulberry32(seedFromString(`${serverSeed}:${salt}:tea`));
  const deck = shuffle(createDeck52(), rng);
  const fp = hashHex(deck.map(cardKey).join('|'));
  const publicCode = `${commitHash.slice(0, 8)}-${fp.slice(0, 8)}`.toUpperCase();
  return { deck, serverSeed, salt, commitHash, publicCode, deckFingerprint: fp };
}

// ─── 牌型 ───

export function is235(cards) {
  if (!cards || cards.length !== 3) return false;
  const set = new Set(cards.map((c) => Number(c.rank)));
  return set.size === 3 && set.has(2) && set.has(3) && set.has(5);
}

export function isLeopard(cards) {
  if (!cards || cards.length !== 3) return false;
  return cards.every((c) => c.rank === cards[0].rank);
}

/**
 * 评估三张牌（兼容旧 evalHand 字段）
 */
export function evalHand(cards) {
  if (!cards || cards.length !== 3) {
    return {
      type: -1, power: 0, name: '—', ranks: [], isA23: false, is235: false, primary: 0, kickers: [],
    };
  }
  const ranksAsc = cards.map((c) => c.rank).sort((a, b) => a - b);
  const ranksDesc = ranksAsc.slice().reverse();
  const suits = cards.map((c) => c.suit);
  const flush = suits[0] === suits[1] && suits[1] === suits[2];
  const isTriple = ranksAsc[0] === ranksAsc[2];
  const isPair = !isTriple && (
    ranksAsc[0] === ranksAsc[1] || ranksAsc[1] === ranksAsc[2]
  );
  const isA23 = ranksAsc[0] === 2 && ranksAsc[1] === 3 && ranksAsc[2] === 14;
  const isNormalStraight = ranksAsc[1] === ranksAsc[0] + 1 && ranksAsc[2] === ranksAsc[1] + 1;
  const straight = isA23 || isNormalStraight;
  const special235 = is235(cards);

  let type = HandType.HIGH;
  if (isTriple) type = HandType.TRIPLE;
  else if (straight && flush) type = HandType.STRAIGHT_FLUSH;
  else if (flush) type = HandType.FLUSH;
  else if (straight) type = HandType.STRAIGHT;
  else if (isPair) type = HandType.PAIR;

  let primary = 0;
  let kickers = [];
  let ranks = ranksDesc;

  if (type === HandType.TRIPLE) {
    primary = ranksAsc[0];
    ranks = [primary, primary, primary];
  } else if (type === HandType.STRAIGHT || type === HandType.STRAIGHT_FLUSH) {
    primary = isA23 ? 3 : ranksAsc[2];
    ranks = isA23 ? [3, 2, 14] : ranksDesc;
  } else if (type === HandType.PAIR) {
    if (ranksAsc[0] === ranksAsc[1]) {
      primary = ranksAsc[0];
      kickers = [ranksAsc[2]];
    } else {
      primary = ranksAsc[1];
      kickers = [ranksAsc[0]];
    }
    ranks = [primary, primary, kickers[0]];
  } else {
    primary = ranksDesc[0];
    kickers = ranksDesc.slice(1);
  }

  const k0 = kickers[0] || 0;
  const k1 = kickers[1] || 0;
  const power = type * 1_000_000 + primary * 400 + k0 * 20 + k1;

  return {
    type,
    power,
    name: TYPE_NAME[type] || '散牌',
    ranks,
    ranksDesc: ranks,
    primary,
    kickers,
    isA23,
    is235: special235,
    isFlush: flush,
    isStraight: straight,
  };
}

/**
 * 比较：支持 hasLeopardInGame 的 235 规则
 * @returns {number} >0 a大；<0 b大；0 平
 */
export function compareHands(a, b, hasLeopardInGame = false) {
  const ha = Array.isArray(a) ? evalHand(a) : a;
  const hb = Array.isArray(b) ? evalHand(b) : b;

  if (ha.is235 && hb.is235) return 0;
  if (hasLeopardInGame) {
    if (ha.is235 && hb.type === HandType.TRIPLE) return 1;
    if (hb.is235 && ha.type === HandType.TRIPLE) return -1;
  }
  if (ha.is235 && !hb.is235) return -1;
  if (hb.is235 && !ha.is235) return 1;

  if (ha.power !== hb.power) return ha.power > hb.power ? 1 : -1;
  return 0;
}

// ─── 边池 ───

export function buildSidePots(players) {
  const list = players.map((p, i) => ({
    id: p.id != null ? String(p.id) : String(i),
    seat: i,
    betTotal: Math.max(0, Math.floor(Number(p.betTotal ?? p.bets) || 0)),
    canWin: p.canWin !== false && !p.folded && !p.lost,
  }));
  const levels = [...new Set(list.map((p) => p.betTotal))].filter((x) => x > 0).sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    const layer = level - prev;
    if (layer <= 0) {
      prev = level;
      continue;
    }
    const contributors = list.filter((p) => p.betTotal >= level);
    const amount = layer * contributors.length;
    pots.push({
      index: pots.length,
      isMain: pots.length === 0,
      amount,
      level,
      seats: contributors.map((c) => c.seat),
      eligible: contributors.filter((c) => c.canWin).map((c) => c.seat),
    });
    prev = level;
  }
  return pots;
}

export function settleAllPots(players, hands) {
  const pots = buildSidePots(players);
  const awards = players.map(() => 0);
  for (const pot of pots) {
    if (pot.amount <= 0) continue;
    const elig = pot.eligible;
    if (!elig.length) {
      // 退还出资者均分
      const share = Math.floor(pot.amount / pot.seats.length);
      let rem = pot.amount - share * pot.seats.length;
      for (const s of pot.seats) {
        awards[s] += share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
      }
      pot.winners = pot.seats.slice();
      continue;
    }
    const hasLeo = elig.some((i) => isLeopard(hands[i]));
    let best = [elig[0]];
    for (let k = 1; k < elig.length; k++) {
      const i = elig[k];
      const cmp = compareHands(hands[i], hands[best[0]], hasLeo);
      if (cmp > 0) best = [i];
      else if (cmp === 0) best.push(i);
    }
    pot.winners = best;
    const each = Math.floor(pot.amount / best.length);
    let rem = pot.amount - each * best.length;
    for (const s of best) {
      awards[s] += each + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
    }
  }
  const deltas = players.map((p, i) => awards[i] - (p.betTotal ?? p.bets ?? 0));
  return { pots, awards, deltas };
}

// ─── 蒙特卡洛胜率（轻量） ───

export function getWinProbability(currentHand, activePlayerCount, seenCards = [], options = {}) {
  if (!currentHand || currentHand.length !== 3) {
    return { winProbability: 0, equity: 0, simulations: 0 };
  }
  const n = Math.max(1, Math.floor(activePlayerCount) || 1);
  if (n === 1) return { winProbability: 1, equity: 1, simulations: 0, opponents: 0 };

  const used = new Set([
    ...currentHand.map(cardKey),
    ...(seenCards || []).map(cardKey),
  ]);
  const remaining = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      const k = `${rank}_${suit}`;
      if (!used.has(k)) remaining.push({ rank, suit });
    }
  }

  const opponents = n - 1;
  const sims = Math.max(50, Math.min(800, Number(options.simulations) || 400));
  const random = options.random || Math.random;
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let s = 0; s < sims; s++) {
    const pool = shuffle(remaining, random);
    let idx = 0;
    const oppHands = [];
    let ok = true;
    for (let o = 0; o < opponents; o++) {
      if (idx + 3 > pool.length) {
        ok = false;
        break;
      }
      oppHands.push([pool[idx++], pool[idx++], pool[idx++]]);
    }
    if (!ok) continue;
    const all = [currentHand, ...oppHands];
    const hasLeo = all.some(isLeopard);
    let lose = false;
    let tieAll = true;
    for (const oh of oppHands) {
      const cmp = compareHands(currentHand, oh, hasLeo);
      if (cmp < 0) {
        lose = true;
        break;
      }
      if (cmp !== 0) tieAll = false;
    }
    if (lose) losses += 1;
    else if (tieAll) ties += 1;
    else wins += 1;
  }
  const done = Math.max(1, wins + ties + losses);
  return {
    winProbability: wins / done,
    tieProbability: ties / done,
    loseProbability: losses / done,
    equity: (wins + ties * 0.5) / done,
    simulations: done,
    opponents,
  };
}

// ─── 桌子 ───

function isActing(status) {
  return status === PlayerStatus.MEN || status === PlayerStatus.LOOKED;
}

function isContending(status) {
  return (
    status === PlayerStatus.MEN
    || status === PlayerStatus.LOOKED
    || status === PlayerStatus.ALL_IN
  );
}

/**
 * @param {{ names?: string[], ante?: number, stake?: number, maxRounds?: number, buyIn?: number }} opts
 */
export function createZhajinhuaTable({
  names = ['茶馆', '茶友A', '茶友B'],
  ante = 50,
  stake = 50,
  maxRounds = 8,
  buyIn = 0,
} = {}) {
  const n = 3;
  const startChips = buyIn > 0 ? buyIn : Math.max(ante * 40, stake * 40, 2000);

  const state = {
    names: names.slice(0, n),
    ante: Math.max(1, Number(ante) || 50),
    stake: Math.max(1, Number(stake) || 50),
    currentMenStake: Math.max(1, Number(stake) || 50),
    maxMenStake: Math.max(Number(stake) * 20, 500),
    maxRounds: Math.max(3, Number(maxRounds) || 8),
    hands: [[], [], []],
    status: [PlayerStatus.MEN, PlayerStatus.MEN, PlayerStatus.MEN],
    looked: [false, false, false],
    folded: [false, false, false], // 兼容：弃牌或比牌输
    allIn: [false, false, false],
    chips: [startChips, startChips, startChips],
    bets: [0, 0, 0],
    pot: 0,
    current: 0,
    phase: 'idle',
    winner: -1,
    winners: [],
    actionCount: 0,
    lastAction: '',
    compareLog: [],
    publicCode: '',
    fair: null,
    settlement: null,
    betHistory: [],
  };

  function contending() {
    return [0, 1, 2].filter((i) => isContending(state.status[i]));
  }

  function acting() {
    return [0, 1, 2].filter((i) => isActing(state.status[i]));
  }

  /** 兼容旧 alive = 未弃且未淘汰（含 all-in） */
  function alive() {
    return contending();
  }

  function betUnit(player) {
    if (state.allIn[player] || state.status[player] === PlayerStatus.ALL_IN) return 0;
    return state.looked[player] ? state.currentMenStake * 2 : state.currentMenStake;
  }

  function compareCost(player) {
    return betUnit(player) * 2;
  }

  function hasLeopardInGame() {
    return contending().some((i) => isLeopard(state.hands[i]));
  }

  function payIn(player, amount) {
    const pay = Math.min(amount, state.chips[player]);
    state.chips[player] -= pay;
    state.bets[player] += pay;
    state.pot += pay;
    if (state.chips[player] === 0 && isActing(state.status[player])) {
      state.allIn[player] = true;
      state.status[player] = PlayerStatus.ALL_IN;
      state.looked[player] = state.looked[player] || false;
    }
    return pay;
  }

  function deal() {
    const fair = fairDealDeck();
    state.fair = fair;
    state.publicCode = fair.publicCode;
    const deck = fair.deck;
    const dealStart = Math.floor(Math.random() * n);
    const hands = [[], [], []];
    let di = 0;
    for (let r = 0; r < 3; r++) {
      for (let p = 0; p < n; p++) hands[(dealStart + p) % n].push(deck[di++]);
    }
    state.hands = hands;
    state.status = [PlayerStatus.MEN, PlayerStatus.MEN, PlayerStatus.MEN];
    state.looked = [false, false, false];
    state.folded = [false, false, false];
    state.allIn = [false, false, false];
    state.chips = [startChips, startChips, startChips];
    state.bets = [0, 0, 0];
    state.pot = 0;
    state.settlement = null;
    state.winners = [];
    state.betHistory = [];

    for (let i = 0; i < n; i++) {
      payIn(i, state.ante);
    }
    state.current = (dealStart + 1) % n;
    state.phase = 'play';
    state.winner = -1;
    state.actionCount = 0;
    state.currentMenStake = state.stake;
    state.lastAction = `发牌完成 · 校验 ${state.publicCode}`;
    state.compareLog = [];
  }

  function look(player) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (!isContending(state.status[player])) return { ok: false, reason: 'folded' };
    if (state.looked[player]) {
      return {
        ok: true,
        already: true,
        winProb: estimateWinProb(player),
      };
    }
    state.looked[player] = true;
    if (state.status[player] === PlayerStatus.MEN) {
      state.status[player] = PlayerStatus.LOOKED;
    }
    state.lastAction = `${state.names[player]} 看牌`;
    return { ok: true, winProb: estimateWinProb(player) };
  }

  function estimateWinProb(player) {
    if (!state.looked[player]) return null;
    const cnt = contending().length;
    return getWinProbability(state.hands[player], cnt, [], { simulations: 350 });
  }

  function fold(player) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (!isActing(state.status[player])) return { ok: false, reason: 'folded' };

    state.status[player] = PlayerStatus.FOLDED;
    state.folded[player] = true;
    state.lastAction = `${state.names[player]} 弃牌`;
    state.actionCount += 1;

    const left = contending();
    if (left.length <= 1) {
      return finishMulti(left[0] ?? -1, 'last_standing');
    }
    const after = afterAction();
    if (after.settled) return after;
    advance();
    return { ok: true };
  }

  /**
   * 跟注 / 加注
   * @param {number} player
   * @param {number} [amount]  默认跟注；大于单注为加注
   */
  function call(player, amount) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (!isActing(state.status[player])) return { ok: false, reason: 'folded' };

    const unit = betUnit(player);
    if (state.chips[player] < unit) {
      return {
        ok: false,
        reason: 'insufficient_chips',
        canAllIn: true,
        need: unit,
        chips: state.chips[player],
      };
    }

    let pay = amount != null ? Math.floor(Number(amount)) : unit;
    if (!Number.isFinite(pay) || pay < unit) pay = unit;

    // 加注抬高闷注
    const looked = state.looked[player];
    const impliedMen = looked ? pay / 2 : pay;
    if (impliedMen > state.currentMenStake) {
      const next = Math.min(state.maxMenStake, Math.floor(impliedMen));
      if (looked && pay % 2 !== 0) pay = unit;
      else state.currentMenStake = next;
    }

    const actual = payIn(player, pay);
    state.actionCount += 1;
    state.betHistory.push({
      playerId: String(player),
      type: actual > unit ? 'raise' : 'call',
      amount: actual,
    });
    state.lastAction =
      `${state.names[player]}${state.allIn[player] ? ' All-in' : (looked ? '看注' : '闷注')}`
      + ` ${actual}`;

    const after = afterAction();
    if (after.settled) return { ok: true, pay: actual, ...after };
    advance();
    return { ok: true, pay: actual, allIn: state.allIn[player] };
  }

  function allIn(player) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (!isActing(state.status[player])) return { ok: false, reason: 'folded' };
    if (state.chips[player] <= 0) return { ok: false, reason: 'no_chips' };

    const amt = state.chips[player];
    payIn(player, amt);
    state.allIn[player] = true;
    state.status[player] = PlayerStatus.ALL_IN;
    state.actionCount += 1;
    state.betHistory.push({ playerId: String(player), type: 'all_in', amount: amt });
    state.lastAction = `${state.names[player]} 孤注一掷 ${amt}`;

    const after = afterAction();
    if (after.settled) return { ok: true, amount: amt, allIn: true, ...after };
    advance();
    return { ok: true, amount: amt, allIn: true };
  }

  function raise(player, mult = 2) {
    const unit = betUnit(player);
    const men = state.currentMenStake;
    const nextMen = Math.min(state.maxMenStake, Math.max(men + 1, Math.floor(men * mult)));
    const pay = state.looked[player] ? nextMen * 2 : nextMen;
    return call(player, pay);
  }

  function compare(player, target) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (!isActing(state.status[player])) return { ok: false, reason: 'folded' };
    if (!isContending(state.status[target])) return { ok: false, reason: 'folded' };
    if (player === target) return { ok: false, reason: 'self' };
    if (typeof target !== 'number' || target < 0 || target > 2) {
      return { ok: false, reason: 'bad_target' };
    }
    const aliveN = contending().length;
    if (state.actionCount < aliveN) {
      return { ok: false, reason: 'too_early' };
    }

    const cost = compareCost(player);
    if (state.chips[player] < cost) {
      return {
        ok: false,
        reason: 'insufficient_chips',
        canAllIn: true,
        need: cost,
      };
    }

    const paid = payIn(player, cost);
    state.actionCount += 1;
    state.looked[player] = true;
    state.looked[target] = true;
    if (state.status[player] !== PlayerStatus.ALL_IN) {
      state.status[player] = PlayerStatus.LOOKED;
    }
    if (state.status[target] !== PlayerStatus.ALL_IN) {
      state.status[target] = PlayerStatus.LOOKED;
    }

    const hasLeo = hasLeopardInGame();
    const cmp = compareHands(state.hands[player], state.hands[target], hasLeo);
    let loser;
    let winnerSide;
    if (cmp > 0) {
      loser = target;
      winnerSide = player;
    } else {
      loser = player;
      winnerSide = target;
    }
    state.status[loser] = PlayerStatus.LOST;
    state.folded[loser] = true;
    state.allIn[loser] = false;
    state.compareLog.push({ a: player, b: target, winner: winnerSide, loser, cost: paid });
    state.lastAction =
      `${state.names[player]} 比牌 ${state.names[target]}（${paid}），`
      + `${state.names[winnerSide]} 胜`;

    const left = contending();
    if (left.length <= 1) {
      return {
        ok: true,
        settled: true,
        cmp,
        winner: winnerSide,
        loser,
        ...finishMulti(left[0] ?? winnerSide, 'compare_last'),
      };
    }
    const after = afterAction();
    if (after.settled) return { ok: true, cmp, winner: winnerSide, loser, ...after };
    advance();
    return { ok: true, cmp, winner: winnerSide, loser };
  }

  function afterAction() {
    const left = contending();
    if (left.length <= 1) {
      return finishMulti(left[0] ?? -1, 'last_standing');
    }
    const act = acting();
    if (act.length === 0) {
      return showdownAll('all_in_showdown');
    }
    const rounds = Math.floor(state.actionCount / Math.max(1, left.length));
    if (rounds >= state.maxRounds) {
      return showdownAll('max_rounds');
    }
    return { settled: false };
  }

  function showdownAll(reason = 'max_rounds') {
    const left = contending();
    if (left.length === 0) return finishMulti(-1, reason);
    if (left.length === 1) return finishMulti(left[0], reason);
    left.forEach((i) => {
      state.looked[i] = true;
    });
    state.lastAction = reason === 'all_in_showdown' ? '全押开牌 · 边池结算' : '回合上限 · 强制开牌';
    return finishMulti(null, reason, true);
  }

  function finishMulti(winnerOrNull, reason, multi = false) {
    const players = [0, 1, 2].map((i) => ({
      id: String(i),
      betTotal: state.bets[i],
      bets: state.bets[i],
      canWin: isContending(state.status[i]) || (winnerOrNull === i),
      folded: state.status[i] === PlayerStatus.FOLDED,
      lost: state.status[i] === PlayerStatus.LOST,
    }));

    // 单人通吃
    if (!multi && winnerOrNull != null && winnerOrNull >= 0 && contending().length <= 1) {
      const awards = [0, 0, 0];
      awards[winnerOrNull] = state.pot;
      const deltas = [0, 1, 2].map((i) => awards[i] - state.bets[i]);
      state.chips[winnerOrNull] += state.pot;
      state.winner = winnerOrNull;
      state.winners = [winnerOrNull];
      state.settlement = {
        pots: [{ isMain: true, amount: state.pot, winners: [winnerOrNull] }],
        awards,
        deltas,
        reason,
      };
    } else {
      // 边池
      for (let i = 0; i < 3; i++) {
        if (isContending(state.status[i])) players[i].canWin = true;
        if (state.status[i] === PlayerStatus.FOLDED || state.status[i] === PlayerStatus.LOST) {
          players[i].canWin = false;
        }
      }
      const settled = settleAllPots(players, state.hands);
      for (let i = 0; i < 3; i++) {
        state.chips[i] += settled.awards[i];
      }
      state.settlement = { ...settled, reason };
      let best = 0;
      let bestA = settled.awards[0];
      for (let i = 1; i < 3; i++) {
        if (settled.awards[i] > bestA) {
          bestA = settled.awards[i];
          best = i;
        }
      }
      state.winner = bestA > 0 ? best : (winnerOrNull ?? 0);
      state.winners = settled.awards
        .map((a, i) => (a === bestA && a > 0 ? i : -1))
        .filter((i) => i >= 0);
    }

    state.phase = 'settle';
    state.looked = [true, true, true];
    return {
      ok: true,
      settled: true,
      winner: state.winner,
      reason,
      settlement: state.settlement,
    };
  }

  function finish(winner) {
    return finishMulti(winner, 'finish');
  }

  function advance() {
    if (state.phase !== 'play') return;
    const act = acting();
    if (!act.length) return;
    for (let k = 0; k < 3; k++) {
      state.current = (state.current + 1) % 3;
      if (isActing(state.status[state.current])) break;
    }
  }

  function settleDeltas() {
    if (state.settlement?.deltas) return state.settlement.deltas.slice();
    const deltas = [0, 0, 0];
    if (state.winner < 0 || state.phase !== 'settle') return deltas;
    for (let i = 0; i < 3; i++) deltas[i] = -state.bets[i];
    deltas[state.winner] += state.pot;
    return deltas;
  }

  function snapshot(forPlayer = 0) {
    const unit0 = betUnit(0);
    const cost0 = compareCost(0);
    let winProb = null;
    if (state.looked[forPlayer] && state.phase === 'play') {
      winProb = estimateWinProb(forPlayer);
    }
    return {
      names: state.names.slice(),
      hands: state.hands.map((h, i) => {
        if (state.phase === 'settle' || (i === forPlayer && state.looked[i])) {
          return h.map((c) => ({ ...c }));
        }
        return [null, null, null];
      }),
      rawHands: state.hands.map((h) => h.map((c) => ({ ...c }))),
      looked: state.looked.slice(),
      folded: state.folded.slice(),
      allIn: state.allIn.slice(),
      status: state.status.slice(),
      chips: state.chips.slice(),
      bets: state.bets.slice(),
      pot: state.pot,
      current: state.current,
      phase: state.phase,
      winner: state.winner,
      winners: state.winners.slice(),
      ante: state.ante,
      stake: state.stake,
      currentMenStake: state.currentMenStake,
      betUnit: unit0,
      compareCost: cost0,
      canAllIn: isActing(state.status[forPlayer]) && state.chips[forPlayer] > 0
        && state.chips[forPlayer] < betUnit(forPlayer),
      canCompare: state.actionCount >= contending().length,
      actionCount: state.actionCount,
      maxRounds: state.maxRounds,
      lastAction: state.lastAction,
      alive: alive(),
      contending: contending(),
      publicCode: state.publicCode,
      winProb,
      pots: state.phase === 'settle' && state.settlement?.pots
        ? state.settlement.pots
        : buildSidePots([0, 1, 2].map((i) => ({
          betTotal: state.bets[i],
          canWin: isContending(state.status[i]),
          folded: state.folded[i],
        }))),
      evals: state.hands.map((h, i) => (
        state.phase === 'settle' || (i === forPlayer && state.looked[i])
          ? evalHand(h)
          : null
      )),
      deltas: state.phase === 'settle' ? settleDeltas() : [0, 0, 0],
      settlement: state.settlement,
      betHistory: state.betHistory.slice(),
    };
  }

  return {
    deal,
    look,
    fold,
    call,
    allIn,
    raise,
    compare,
    showdownAll,
    snapshot,
    settleDeltas,
    betUnit,
    compareCost,
    state,
  };
}
