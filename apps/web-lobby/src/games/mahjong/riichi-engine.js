/**
 * 日麻（Riichi）H5 引擎 — 本地人机 v1
 * 136 张（万条筒+字牌），立直 / 荣和 / 自摸 / 宝牌；役种简化，结算 UI 对齐 Pocket。
 * variant: 'riichi' — 不替换推倒胡四川路径。
 */

export const RIICHI_VARIANT = 'riichi';
export const START_POINTS = 25000;
export const WINDS = ['东', '南', '西', '北'];
export const DRAGONS = ['中', '发', '白'];

/** suit: 0万 1条 2筒 3风(1-4东南西北) 4字(1-3中发白) */
let _uid = 0;

export function createRiichiTile(suit, rank) {
  return { id: `r_${suit}_${rank}_${_uid++}`, suit, rank };
}

export function tileKey(t) {
  return Number(t.suit) * 10 + Number(t.rank);
}

export function sameTile(a, b) {
  return a && b && Number(a.suit) === Number(b.suit) && Number(a.rank) === Number(b.rank);
}

export function tileName(t) {
  if (!t) return '';
  if (t.suit === 0) return `${'一二三四五六七八九'[t.rank - 1] || t.rank}万`;
  if (t.suit === 1) return `${'一二三四五六七八九'[t.rank - 1] || t.rank}条`;
  if (t.suit === 2) return `${'一二三四五六七八九'[t.rank - 1] || t.rank}筒`;
  if (t.suit === 3) return WINDS[t.rank - 1] || '风';
  if (t.suit === 4) return DRAGONS[t.rank - 1] || '字';
  return '?';
}

/** Pocket Card2d 文件名 */
export function tileAssetName(t) {
  if (!t) return 'back.png';
  if (t.suit === 0) return `wan${t.rank}.png`;
  if (t.suit === 1) return `tiao${t.rank}.png`;
  if (t.suit === 2) return `tong${t.rank}.png`;
  if (t.suit === 3) return ['ziDong.png', 'ziNan.png', 'ziXi.png', 'ziBei.png'][t.rank - 1] || 'back.png';
  if (t.suit === 4) return ['ziZhong.png', 'ziFa.png', 'ziBai.png'][t.rank - 1] || 'back.png';
  return 'back.png';
}

export function createRiichiDeck() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 3; suit++) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) deck.push(createRiichiTile(suit, rank));
    }
  }
  for (let rank = 1; rank <= 4; rank++) {
    for (let i = 0; i < 4; i++) deck.push(createRiichiTile(3, rank));
  }
  for (let rank = 1; rank <= 3; rank++) {
    for (let i = 0; i < 4; i++) deck.push(createRiichiTile(4, rank));
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

export function sortRiichiHand(cards) {
  return cards.slice().sort((a, b) => {
    if (a.suit !== b.suit) return a.suit - b.suit;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.id).localeCompare(String(b.id));
  });
}

function canFormNMelds(counts, n) {
  if (n === 0) {
    for (const v of counts.values()) if (v > 0) return false;
    return true;
  }
  let first = -1;
  for (const [k, c] of counts) {
    if (c > 0) {
      first = k;
      break;
    }
  }
  if (first < 0) return false;
  const cnt = counts.get(first) || 0;
  if (cnt >= 3) {
    counts.set(first, cnt - 3);
    if (canFormNMelds(counts, n - 1)) {
      counts.set(first, cnt);
      return true;
    }
    counts.set(first, cnt);
  }
  const suit = Math.floor(first / 10);
  const rank = first % 10;
  if (suit <= 2 && rank >= 1 && rank <= 7) {
    const a = first;
    const b = suit * 10 + (rank + 1);
    const c = suit * 10 + (rank + 2);
    if ((counts.get(a) || 0) >= 1 && (counts.get(b) || 0) >= 1 && (counts.get(c) || 0) >= 1) {
      counts.set(a, (counts.get(a) || 0) - 1);
      counts.set(b, (counts.get(b) || 0) - 1);
      counts.set(c, (counts.get(c) || 0) - 1);
      if (canFormNMelds(counts, n - 1)) {
        counts.set(a, (counts.get(a) || 0) + 1);
        counts.set(b, (counts.get(b) || 0) + 1);
        counts.set(c, (counts.get(c) || 0) + 1);
        return true;
      }
      counts.set(a, (counts.get(a) || 0) + 1);
      counts.set(b, (counts.get(b) || 0) + 1);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  return false;
}

/** 标准形：4 面子 + 1 雀头（含字牌刻子） */
export function canWinHand(concealed, completedMelds = 0) {
  if (!Array.isArray(concealed)) return false;
  const needMelds = 4 - completedMelds;
  if (needMelds < 0) return false;
  const expectLen = needMelds * 3 + 2;
  if (concealed.length !== expectLen) return false;
  const counts = new Map();
  for (const t of concealed) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => a - b);
  for (const pairKey of keys) {
    if ((counts.get(pairKey) || 0) < 2) continue;
    const m = new Map(counts);
    m.set(pairKey, m.get(pairKey) - 2);
    if (canFormNMelds(m, needMelds)) return true;
  }
  // 七对子（简化：无副露）
  if (completedMelds === 0 && concealed.length === 14) {
    let pairs = 0;
    let ok = true;
    for (const v of counts.values()) {
      if (v === 2) pairs += 1;
      else if (v === 4) pairs += 2;
      else {
        ok = false;
        break;
      }
    }
    if (ok && pairs === 7) return true;
  }
  return false;
}

/** 听牌：存在打出一张后仍能荣和的等待 */
export function isTenpai(hand, meldsLen = 0) {
  if (!hand || hand.length < 1) return false;
  // 手牌 13 张时检查是否有等待
  if (hand.length === 13 + meldsLen * 0) {
    // try each possible tile as wait (brute 34)
    for (let suit = 0; suit < 3; suit++) {
      for (let rank = 1; rank <= 9; rank++) {
        const probe = createRiichiTile(suit, rank);
        if (canWinHand([...hand, probe], meldsLen)) return true;
      }
    }
    for (let rank = 1; rank <= 4; rank++) {
      if (canWinHand([...hand, createRiichiTile(3, rank)], meldsLen)) return true;
    }
    for (let rank = 1; rank <= 3; rank++) {
      if (canWinHand([...hand, createRiichiTile(4, rank)], meldsLen)) return true;
    }
    return false;
  }
  // 14 张：是否存在打出一张后听牌
  if (hand.length === 14) {
    for (let i = 0; i < hand.length; i++) {
      const left = hand.slice(0, i).concat(hand.slice(i + 1));
      if (isTenpai(left, meldsLen)) return true;
    }
  }
  return false;
}

/** 宝牌指示牌 → 实际宝牌 */
export function doraFromIndicator(ind) {
  if (!ind) return null;
  if (ind.suit <= 2) {
    const rank = ind.rank === 9 ? 1 : ind.rank + 1;
    return { suit: ind.suit, rank };
  }
  if (ind.suit === 3) {
    const rank = ind.rank === 4 ? 1 : ind.rank + 1;
    return { suit: 3, rank };
  }
  if (ind.suit === 4) {
    const rank = ind.rank === 3 ? 1 : ind.rank + 1;
    return { suit: 4, rank };
  }
  return null;
}

export function countDoraInHand(tiles, doraTiles) {
  if (!tiles?.length || !doraTiles?.length) return 0;
  let n = 0;
  for (const t of tiles) {
    for (const d of doraTiles) {
      if (sameTile(t, d)) n += 1;
    }
  }
  return n;
}

function isTerminalOrHonor(t) {
  if (!t) return false;
  if (t.suit >= 3) return true;
  return t.rank === 1 || t.rank === 9;
}

function isSimple(t) {
  return t && t.suit <= 2 && t.rank >= 2 && t.rank <= 8;
}

/**
 * 简化役种判定（门前为主）
 * @returns {{ yaku: {name:string,han:number}[], han: number, fu: number, sevenPairs?: boolean }}
 */
export function evaluateYaku({
  hand,
  winTile,
  melds = [],
  riichi = false,
  isTsumo = false,
  seatWind = 1,
  roundWind = 1,
  doraCount = 0,
  ippatsu = false,
}) {
  const closed = melds.length === 0;
  const full = winTile ? [...hand, winTile] : hand.slice();
  const yaku = [];
  let sevenPairs = false;

  if (!canWinHand(full, melds.length)) {
    return { yaku: [], han: 0, fu: 0 };
  }

  // 七对
  const counts = new Map();
  for (const t of full) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (closed && full.length === 14) {
    let pairs = 0;
    let ok = true;
    for (const v of counts.values()) {
      if (v === 2) pairs += 1;
      else if (v === 4) pairs += 2;
      else {
        ok = false;
        break;
      }
    }
    if (ok && pairs === 7) {
      sevenPairs = true;
      yaku.push({ name: '七对子', han: 2 });
    }
  }

  if (riichi && closed) yaku.push({ name: '立直', han: 1 });
  if (ippatsu && riichi) yaku.push({ name: '一发', han: 1 });
  if (isTsumo && closed) yaku.push({ name: '门前清自摸和', han: 1 });

  // 断幺九
  if (full.every(isSimple) && melds.every((m) => (m.tiles || []).every(isSimple))) {
    yaku.push({ name: '断幺九', han: 1 });
  }

  // 役牌
  const yakuhaiKeys = [
    { key: 40 + 1, name: '役牌·中' },
    { key: 40 + 2, name: '役牌·发' },
    { key: 40 + 3, name: '役牌·白' },
    { key: 30 + roundWind, name: `役牌·场风${WINDS[roundWind - 1]}` },
    { key: 30 + seatWind, name: `役牌·自风${WINDS[seatWind - 1]}` },
  ];
  for (const y of yakuhaiKeys) {
    if ((counts.get(y.key) || 0) >= 3) yaku.push({ name: y.name, han: 1 });
  }

  if (doraCount > 0) yaku.push({ name: '宝牌', han: doraCount });

  // 至少要有非宝牌役才能和（日麻规则）；简化：若仅宝牌则补「平和」占位当门清听牌自摸/立直已有
  const nonDora = yaku.filter((y) => y.name !== '宝牌' && y.name !== '里宝牌');
  if (nonDora.length === 0 && doraCount > 0 && closed) {
    // 不能仅宝牌和 — 返回空
    return { yaku: [], han: 0, fu: 0 };
  }
  if (yaku.length === 0) {
    // 开放简化：门清和牌至少给平和
    if (closed) yaku.push({ name: '平和', han: 1 });
    else return { yaku: [], han: 0, fu: 0 };
  }

  const han = yaku.reduce((s, y) => s + y.han, 0);
  const fu = sevenPairs ? 25 : 30;
  return { yaku, han, fu, sevenPairs };
}

/** 简化得点：子家 / 亲家 · 荣和 / 自摸 */
export function computePoints({ han, fu = 30, isDealer = false, isTsumo = false }) {
  if (han <= 0) return { total: 0, payments: [], tier: '' };
  let base;
  if (han >= 13) base = 8000;
  else if (han >= 11) base = 6000;
  else if (han >= 8) base = 4000;
  else if (han >= 6) base = 3000;
  else if (han >= 5) base = 2000;
  else {
    const raw = fu * Math.pow(2, 2 + han);
    base = Math.min(2000, Math.ceil(raw / 100) * 100);
  }

  let tier = '';
  if (han >= 13) tier = '役满';
  else if (han >= 11) tier = '三倍满';
  else if (han >= 8) tier = '倍满';
  else if (han >= 6) tier = '跳满';
  else if (han >= 5 || base >= 2000) tier = '满贯';

  if (isTsumo) {
    if (isDealer) {
      const each = Math.ceil((base * 2) / 100) * 100;
      return { total: each * 3, payments: { ko: each }, tier, base };
    }
    const fromKo = Math.ceil(base / 100) * 100;
    const fromOya = Math.ceil((base * 2) / 100) * 100;
    return { total: fromKo * 2 + fromOya, payments: { ko: fromKo, oya: fromOya }, tier, base };
  }
  // ron
  const total = Math.ceil((base * (isDealer ? 6 : 4)) / 100) * 100;
  return { total, payments: { ron: total }, tier, base };
}

export function scoreTierName(han, total) {
  if (han >= 13) return '役满';
  if (han >= 11) return '三倍满';
  if (han >= 8) return '倍满';
  if (han >= 6) return '跳满';
  if (han >= 5 || total >= 8000) return '满贯';
  return '';
}

/**
 * @param {{ names?: string[], random?: function }} opts
 */
export function createRiichiTable({
  names = ['茶馆', '茶友A', '茶友B', '茶友C'],
  random = Math.random,
} = {}) {
  const playerCount = 4;
  const state = {
    variant: RIICHI_VARIANT,
    mode: 'riichi',
    names: names.slice(0, 4),
    playerCount,
    dealer: 0,
    roundWind: 1, // 东场
    honba: 0,
    hands: [[], [], [], []],
    melds: [[], [], [], []],
    rivers: [[], [], [], []],
    wall: [],
    deadWall: [],
    doraIndicators: [],
    uraDoraIndicators: [],
    scores: [START_POINTS, START_POINTS, START_POINTS, START_POINTS],
    riichi: [false, false, false, false],
    riichiSticks: 0,
    ippatsu: [false, false, false, false],
    current: 0,
    phase: 'idle', // idle | discard | call | settle
    drawn: null,
    lastDiscard: null,
    winner: -1,
    winKind: null, // tsumo | ron | draw
    settle: null,
    wallLeft: 0,
    canTsumo: false,
    canRiichi: false,
    canRon: false,
    claimSeat: -1,
  };

  function seatWind(seat) {
    return ((seat - state.dealer + 4) % 4) + 1;
  }

  function liveDoraTiles() {
    return state.doraIndicators.map(doraFromIndicator).filter(Boolean);
  }

  function snapshot() {
    const doraTiles = liveDoraTiles();
    return {
      variant: RIICHI_VARIANT,
      mode: 'riichi',
      modeName: '日麻',
      names: state.names.slice(),
      playerCount: 4,
      dealer: state.dealer,
      roundWind: state.roundWind,
      roundLabel: `${WINDS[state.roundWind - 1]}${1}局`,
      honba: state.honba,
      hands: state.hands.map((h, i) => (i === 0 ? sortRiichiHand(h.slice()) : h.map(() => ({ id: 'hidden', suit: -1, rank: 0 })))),
      handCounts: state.hands.map((h) => h.length),
      melds: state.melds.map((m) => m.slice()),
      rivers: state.rivers.map((r) => r.slice()),
      discards: state.rivers.flat(),
      scores: state.scores.slice(),
      riichi: state.riichi.slice(),
      riichiSticks: state.riichiSticks,
      doraIndicators: state.doraIndicators.slice(),
      uraDoraIndicators: state.phase === 'settle' ? state.uraDoraIndicators.slice() : [],
      doraTiles,
      wallLeft: state.wall.length,
      wallCount: state.wall.length,
      current: state.current,
      phase: state.phase,
      drawn: state.drawn,
      lastDiscard: state.lastDiscard,
      winner: state.winner,
      winKind: state.winKind,
      settle: state.settle,
      canTsumo: state.canTsumo && state.current === 0,
      canRiichi: state.canRiichi && state.current === 0,
      canRon: state.canRon && state.claimSeat === 0,
      seatWinds: [0, 1, 2, 3].map(seatWind),
      status: [0, 1, 2, 3].map(() => 'active'),
      missingSuits: [null, null, null, null],
    };
  }

  function refreshFlags(seat) {
    const hand = state.hands[seat];
    state.canTsumo = false;
    state.canRiichi = false;
    if (state.phase !== 'discard' || state.current !== seat) return;
    if (canWinHand(hand, state.melds[seat].length)) {
      // need at least one yaku
      const doraCount = countDoraInHand(hand, liveDoraTiles());
      const ev = evaluateYaku({
        hand: hand.slice(0, -1),
        winTile: hand[hand.length - 1],
        melds: state.melds[seat],
        riichi: state.riichi[seat],
        isTsumo: true,
        seatWind: seatWind(seat),
        roundWind: state.roundWind,
        doraCount,
        ippatsu: state.ippatsu[seat],
      });
      state.canTsumo = ev.han > 0;
    }
    // 立直：门清、未立直、听牌、墙>4
    if (
      !state.riichi[seat]
      && state.melds[seat].length === 0
      && state.wall.length > 4
      && hand.length === 14
    ) {
      // 存在打出后听牌
      for (let i = 0; i < hand.length; i++) {
        const left = hand.slice(0, i).concat(hand.slice(i + 1));
        if (isTenpai(left, 0)) {
          state.canRiichi = true;
          break;
        }
      }
    }
  }

  function drawFor(seat) {
    if (state.wall.length <= 0) {
      endDraw();
      return null;
    }
    const tile = state.wall.shift();
    state.hands[seat].push(tile);
    state.drawn = tile;
    state.phase = 'discard';
    state.current = seat;
    state.canRon = false;
    state.claimSeat = -1;
    refreshFlags(seat);
    return tile;
  }

  function endDraw() {
    state.phase = 'settle';
    state.winner = -1;
    state.winKind = 'draw';
    state.settle = {
      kind: 'draw',
      title: '流局',
      yaku: [],
      han: 0,
      fu: 0,
      total: 0,
      tier: '',
      hand: [],
      winTile: null,
      doraIndicators: state.doraIndicators.slice(),
      uraDoraIndicators: [],
      deltas: [0, 0, 0, 0],
    };
  }

  function applyWin({ seat, kind, fromSeat = -1, winTile }) {
    const hand = state.hands[seat].slice();
    let closedHand = hand;
    let winning = winTile;
    if (kind === 'ron') {
      winning = winTile || state.lastDiscard;
      closedHand = hand;
    } else {
      winning = hand[hand.length - 1];
      closedHand = hand.slice(0, -1);
    }
    const allTiles = kind === 'ron' ? [...closedHand, winning] : hand;
    const doraCount = countDoraInHand(allTiles, liveDoraTiles());
    // 里宝牌：立直时翻开
    let uraCount = 0;
    if (state.riichi[seat]) {
      state.uraDoraIndicators = state.deadWall.slice(1, 1 + state.doraIndicators.length);
      const uraTiles = state.uraDoraIndicators.map(doraFromIndicator).filter(Boolean);
      uraCount = countDoraInHand(allTiles, uraTiles);
    }
    const ev = evaluateYaku({
      hand: closedHand,
      winTile: winning,
      melds: state.melds[seat],
      riichi: state.riichi[seat],
      isTsumo: kind === 'tsumo',
      seatWind: seatWind(seat),
      roundWind: state.roundWind,
      doraCount: doraCount + uraCount,
      ippatsu: state.ippatsu[seat],
    });
    if (uraCount > 0) {
      // split 宝牌 / 里宝牌 display
      const yaku = ev.yaku.filter((y) => y.name !== '宝牌');
      if (doraCount > 0) yaku.push({ name: '宝牌', han: doraCount });
      yaku.push({ name: '里宝牌', han: uraCount });
      ev.yaku = yaku;
      ev.han = yaku.reduce((s, y) => s + y.han, 0);
    }
    const isDealer = seat === state.dealer;
    const pts = computePoints({
      han: ev.han,
      fu: ev.fu,
      isDealer,
      isTsumo: kind === 'tsumo',
    });
    const deltas = [0, 0, 0, 0];
    let total = pts.total;
    if (kind === 'tsumo') {
      for (let i = 0; i < 4; i++) {
        if (i === seat) continue;
        const pay = isDealer
          ? pts.payments.ko
          : (i === state.dealer ? pts.payments.oya : pts.payments.ko);
        deltas[i] -= pay;
        deltas[seat] += pay;
      }
    } else {
      deltas[fromSeat] -= pts.total;
      deltas[seat] += pts.total;
    }
    // 立直棒
    if (state.riichiSticks > 0) {
      deltas[seat] += state.riichiSticks * 1000;
      total += state.riichiSticks * 1000;
      state.riichiSticks = 0;
    }
    for (let i = 0; i < 4; i++) state.scores[i] += deltas[i];

    state.phase = 'settle';
    state.winner = seat;
    state.winKind = kind;
    state.settle = {
      kind,
      title: kind === 'tsumo' ? '自摸' : '荣和',
      yaku: ev.yaku,
      han: ev.han,
      fu: ev.fu,
      total: deltas[seat],
      tier: pts.tier || scoreTierName(ev.han, Math.abs(deltas[seat])),
      hand: sortRiichiHand(closedHand),
      winTile: winning,
      doraIndicators: state.doraIndicators.slice(),
      uraDoraIndicators: state.uraDoraIndicators.slice(),
      deltas,
      isDealer,
      playerName: state.names[seat],
    };
    state.canTsumo = false;
    state.canRiichi = false;
    state.canRon = false;
  }

  function deal({ dealer = 0 } = {}) {
    state.dealer = dealer;
    state.hands = [[], [], [], []];
    state.melds = [[], [], [], []];
    state.rivers = [[], [], [], []];
    state.riichi = [false, false, false, false];
    state.ippatsu = [false, false, false, false];
    state.winner = -1;
    state.winKind = null;
    state.settle = null;
    state.lastDiscard = null;
    state.drawn = null;
    state.canRon = false;
    state.claimSeat = -1;
    state.uraDoraIndicators = [];

    const deck = shuffle(createRiichiDeck(), random);
    // 王牌 14：最后 14 张；宝牌指示为王牌第 3 墩上牌（简化取 dead[2]）
    state.deadWall = deck.slice(deck.length - 14);
    state.wall = deck.slice(0, deck.length - 14);
    state.doraIndicators = [state.deadWall[2]];

    for (let r = 0; r < 3; r++) {
      for (let s = 0; s < 4; s++) {
        for (let k = 0; k < 4; k++) state.hands[s].push(state.wall.shift());
      }
    }
    for (let s = 0; s < 4; s++) state.hands[s].push(state.wall.shift());
    for (let s = 0; s < 4; s++) state.hands[s] = sortRiichiHand(state.hands[s]);

    state.current = dealer;
    drawFor(dealer);
    return snapshot();
  }

  function discard(tileId, { riichiDeclare = false } = {}) {
    if (state.phase !== 'discard') return { ok: false, reason: 'phase' };
    const seat = state.current;
    const hand = state.hands[seat];
    const idx = hand.findIndex((t) => t.id === tileId);
    if (idx < 0) return { ok: false, reason: 'missing' };

    if (riichiDeclare || (state._pendingRiichi && seat === state.current)) {
      if (!state.canRiichi && !state._pendingRiichi) return { ok: false, reason: 'no_riichi' };
      const left = hand.slice(0, idx).concat(hand.slice(idx + 1));
      if (!isTenpai(left, 0)) return { ok: false, reason: 'not_tenpai' };
      state.riichi[seat] = true;
      state.ippatsu[seat] = true;
      state.scores[seat] -= 1000;
      state.riichiSticks += 1;
      state._pendingRiichi = false;
    } else if (state.riichi[seat]) {
      // 立直后只能模切
      const drawn = state.drawn;
      if (!drawn || tileId !== drawn.id) return { ok: false, reason: 'riichi_moqie' };
    }

    const [tile] = hand.splice(idx, 1);
    state.rivers[seat].push(tile);
    state.lastDiscard = tile;
    state.drawn = null;
    state.canTsumo = false;
    state.canRiichi = false;
    // 他人打出打断一发
    for (let i = 0; i < 4; i++) {
      if (i !== seat) state.ippatsu[i] = false;
    }

    // 检查荣和
    state.canRon = false;
    state.claimSeat = -1;
    for (let i = 0; i < 4; i++) {
      if (i === seat) continue;
      if (canWinHand([...state.hands[i], tile], state.melds[i].length)) {
        const doraCount = countDoraInHand([...state.hands[i], tile], liveDoraTiles());
        const ev = evaluateYaku({
          hand: state.hands[i],
          winTile: tile,
          melds: state.melds[i],
          riichi: state.riichi[i],
          isTsumo: false,
          seatWind: seatWind(i),
          roundWind: state.roundWind,
          doraCount,
          ippatsu: state.ippatsu[i],
        });
        if (ev.han > 0) {
          // 本地人机：玩家可荣；AI 自动荣
          if (i === 0) {
            state.canRon = true;
            state.claimSeat = 0;
            state.phase = 'call';
            return { ok: true, snap: snapshot(), awaitRon: true };
          }
          applyWin({ seat: i, kind: 'ron', fromSeat: seat, winTile: tile });
          return { ok: true, snap: snapshot() };
        }
      }
    }

    const next = (seat + 1) % 4;
    drawFor(next);
    return { ok: true, snap: snapshot() };
  }

  function declareRiichi() {
    if (!state.canRiichi || state.current !== 0) return { ok: false };
    state._pendingRiichi = true;
    return { ok: true, snap: snapshot() };
  }

  function tsumo() {
    if (!state.canTsumo || state.current !== 0) return { ok: false };
    applyWin({ seat: 0, kind: 'tsumo' });
    return { ok: true, snap: snapshot() };
  }

  function ron() {
    if (!state.canRon || state.claimSeat !== 0) return { ok: false };
    const from = state.current;
    applyWin({ seat: 0, kind: 'ron', fromSeat: from, winTile: state.lastDiscard });
    return { ok: true, snap: snapshot() };
  }

  function skipRon() {
    if (state.phase !== 'call') return { ok: false };
    state.canRon = false;
    state.claimSeat = -1;
    const next = (state.current + 1) % 4;
    drawFor(next);
    return { ok: true, snap: snapshot() };
  }

  function tsumoAi(seat) {
    if (state.current !== seat || !state.canTsumo) return false;
    // refresh for seat
    refreshFlags(seat);
    if (!canWinHand(state.hands[seat], state.melds[seat].length)) return false;
    const doraCount = countDoraInHand(state.hands[seat], liveDoraTiles());
    const ev = evaluateYaku({
      hand: state.hands[seat].slice(0, -1),
      winTile: state.hands[seat][state.hands[seat].length - 1],
      melds: state.melds[seat],
      riichi: state.riichi[seat],
      isTsumo: true,
      seatWind: seatWind(seat),
      roundWind: state.roundWind,
      doraCount,
      ippatsu: state.ippatsu[seat],
    });
    if (ev.han <= 0) return false;
    applyWin({ seat, kind: 'tsumo' });
    return true;
  }

  /** AI helper: expose raw hand for seat (local AI only) */
  function debugHand(seat) {
    return state.hands[seat].slice();
  }

  function aiDiscard(seat) {
    if (state.phase !== 'discard' || state.current !== seat) return { ok: false };
    refreshFlags(seat);
    if (state.canTsumo || canWinHand(state.hands[seat], state.melds[seat].length)) {
      const doraCount = countDoraInHand(state.hands[seat], liveDoraTiles());
      const ev = evaluateYaku({
        hand: state.hands[seat].slice(0, -1),
        winTile: state.hands[seat][state.hands[seat].length - 1],
        melds: state.melds[seat],
        riichi: state.riichi[seat],
        isTsumo: true,
        seatWind: seatWind(seat),
        roundWind: state.roundWind,
        doraCount,
        ippatsu: state.ippatsu[seat],
      });
      if (ev.han > 0) {
        applyWin({ seat, kind: 'tsumo' });
        return { ok: true, snap: snapshot() };
      }
    }
    const hand = state.hands[seat];
    let tileId = hand[hand.length - 1]?.id;
    let doRiichi = false;
    if (!state.riichi[seat] && state.melds[seat].length === 0 && hand.length === 14) {
      // try find discard that leaves tenpai → declare riichi sometimes
      for (let i = 0; i < hand.length; i++) {
        const left = hand.slice(0, i).concat(hand.slice(i + 1));
        if (isTenpai(left, 0)) {
          tileId = hand[i].id;
          doRiichi = state.wall.length > 8 && random() > 0.35;
          break;
        }
      }
    }
    if (state.riichi[seat] && state.drawn) tileId = state.drawn.id;
    // isolate discard without going through player-only pending
    state.canRiichi = doRiichi || state.canRiichi;
    if (doRiichi) state._pendingRiichi = true;
    return discard(tileId, { riichiDeclare: doRiichi });
  }

  return {
    deal,
    discard,
    declareRiichi,
    tsumo,
    ron,
    skipRon,
    aiDiscard,
    tsumoAi,
    snapshot,
    debugHand,
    refreshFlags: () => refreshFlags(state.current),
  };
}

export function modeNameRiichi() {
  return '日麻';
}
