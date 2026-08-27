/**
 * 锄大D（Big Two 风格）简化人机引擎
 * - 4 人 · 52 张 · 各 13 张
 * - 点数：3 < 4 < … < K < A < 2
 * - 同点花色：♦ < ♣ < ♥ < ♠
 * - 支持：单 / 对 / 三张 / 顺子(5) / 炸弹(4)
 * - 首局由持有 ♦3 者先出；出完即胜
 */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const RANK_LABEL = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2',
};

let _uid = 0;

export function createCard(rank, suit) {
  return {
    id: `cd_${rank}_${suit}_${_uid++}`,
    rank,
    suit,
    isRed: suit === 0 || suit === 2,
  };
}

export function createDeck52() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 3; rank <= 15; rank++) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 比较两张牌大小（更大返回正数） */
export function compareCards(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.suit - b.suit;
}

export function sortHand(cards) {
  return cards.slice().sort((a, b) => compareCards(a, b));
}

export function cardText(c) {
  if (!c) return '';
  return `${SUITS[c.suit] || ''}${RANK_LABEL[c.rank] || c.rank}`;
}

export const HandType = {
  SINGLE: 1,
  PAIR: 2,
  TRIPLE: 3,
  STRAIGHT: 4,
  BOMB: 5,
};

/**
 * @returns {{ type: number, power: number, cards: object[] } | null}
 */
export function parsePlay(cards) {
  if (!cards?.length) return null;
  const sorted = sortHand(cards);
  const n = sorted.length;
  const ranks = sorted.map((c) => c.rank);

  if (n === 1) {
    return { type: HandType.SINGLE, power: sorted[0].rank * 10 + sorted[0].suit, cards: sorted };
  }
  if (n === 2) {
    if (ranks[0] !== ranks[1]) return null;
    return { type: HandType.PAIR, power: ranks[0] * 10 + Math.max(sorted[0].suit, sorted[1].suit), cards: sorted };
  }
  if (n === 3) {
    if (ranks[0] !== ranks[1] || ranks[1] !== ranks[2]) return null;
    return { type: HandType.TRIPLE, power: ranks[0], cards: sorted };
  }
  if (n === 4) {
    if (ranks.every((r) => r === ranks[0])) {
      return { type: HandType.BOMB, power: ranks[0], cards: sorted };
    }
    return null;
  }
  if (n === 5) {
    // 顺子：连续 5 张（2 不能进顺；A 作 14 可在 QKA 后）
    const uniq = [...new Set(ranks)];
    if (uniq.length !== 5) return null;
    if (uniq.includes(15)) return null; // 2 不进顺
    const rs = uniq.slice().sort((a, b) => a - b);
    let ok = true;
    for (let i = 1; i < 5; i++) {
      if (rs[i] !== rs[i - 1] + 1) ok = false;
    }
    if (!ok) return null;
    return { type: HandType.STRAIGHT, power: rs[4], cards: sorted };
  }
  return null;
}

export function canBeat(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  if (next.type === HandType.BOMB && prev.type !== HandType.BOMB) return true;
  if (next.type === HandType.BOMB && prev.type === HandType.BOMB) {
    return next.power > prev.power;
  }
  if (next.type !== prev.type) return false;
  if (next.cards.length !== prev.cards.length) return false;
  return next.power > prev.power;
}

export function typeName(type) {
  return {
    [HandType.SINGLE]: '单张',
    [HandType.PAIR]: '对子',
    [HandType.TRIPLE]: '三张',
    [HandType.STRAIGHT]: '顺子',
    [HandType.BOMB]: '炸弹',
  }[type] || '牌型';
}

export function createChudadiTable({ names = ['茶馆', '茶友A', '茶友B', '茶友C'], stake = 100 } = {}) {
  const state = {
    names: names.slice(0, 4),
    stake,
    hands: [[], [], [], []],
    current: 0,
    lastPlay: null, // { player, hand }
    passCount: 0,
    phase: 'idle', // idle | play | settle
    winner: -1,
    finished: [],
    mustIncludeDiamond3: false,
    freeLead: true,
  };

  function deal() {
    const deck = shuffle(createDeck52());
    const dealStart = Math.floor(Math.random() * 4);
    const hands = [[], [], [], []];
    let i = 0;
    for (let r = 0; r < 13; r++) {
      for (let p = 0; p < 4; p++) hands[(dealStart + p) % 4].push(deck[i++]);
    }
    state.hands = hands.map((h) => sortHand(h));
    state.lastPlay = null;
    state.passCount = 0;
    state.phase = 'play';
    state.winner = -1;
    state.finished = [];
    state.freeLead = true;
    // ♦3 先出
    let starter = 0;
    for (let i = 0; i < 4; i++) {
      if (state.hands[i].some((c) => c.rank === 3 && c.suit === 0)) {
        starter = i;
        break;
      }
    }
    state.current = starter;
    state.mustIncludeDiamond3 = true;
  }

  function play(player, cardIds) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (state.finished.includes(player)) return { ok: false, reason: 'done' };
    const hand = state.hands[player];
    const picked = cardIds.map((id) => hand.find((c) => c.id === id)).filter(Boolean);
    if (picked.length !== cardIds.length) return { ok: false, reason: 'missing' };
    const parsed = parsePlay(picked);
    if (!parsed) return { ok: false, reason: 'invalid' };
    if (state.mustIncludeDiamond3) {
      if (!picked.some((c) => c.rank === 3 && c.suit === 0)) {
        return { ok: false, reason: 'need_d3' };
      }
    }
    const prev = state.freeLead || !state.lastPlay ? null : state.lastPlay.hand;
    if (!canBeat(prev, parsed)) return { ok: false, reason: 'cannot_beat' };

    state.hands[player] = sortHand(hand.filter((c) => !cardIds.includes(c.id)));
    state.lastPlay = { player, hand: parsed };
    state.passCount = 0;
    state.mustIncludeDiamond3 = false;
    state.freeLead = false;

    if (state.hands[player].length === 0) {
      state.winner = player;
      state.finished.push(player);
      state.phase = 'settle';
      return { ok: true, settled: true };
    }
    advance();
    return { ok: true };
  }

  function pass(player) {
    if (state.phase !== 'play') return { ok: false, reason: 'not_play' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (state.freeLead || !state.lastPlay) return { ok: false, reason: 'must_play' };
    if (state.mustIncludeDiamond3) return { ok: false, reason: 'must_play' };
    state.passCount += 1;
    if (state.passCount >= 3) {
      // 新一轮自由出牌
      state.lastPlay = null;
      state.passCount = 0;
      state.freeLead = true;
    }
    advance();
    return { ok: true };
  }

  function advance() {
    for (let i = 0; i < 4; i++) {
      state.current = (state.current + 1) % 4;
      if (!state.finished.includes(state.current)) break;
    }
  }

  /** 结算：赢家收每人 remaining * stake */
  function settleDeltas() {
    const deltas = [0, 0, 0, 0];
    if (state.winner < 0) return deltas;
    const w = state.winner;
    for (let i = 0; i < 4; i++) {
      if (i === w) continue;
      const loss = state.hands[i].length * state.stake;
      deltas[i] = -loss;
      deltas[w] += loss;
    }
    return deltas;
  }

  function snapshot() {
    return {
      names: state.names.slice(),
      hands: state.hands.map((h) => h.map((c) => ({ ...c }))),
      counts: state.hands.map((h) => h.length),
      current: state.current,
      lastPlay: state.lastPlay
        ? {
            player: state.lastPlay.player,
            type: state.lastPlay.hand.type,
            typeName: typeName(state.lastPlay.hand.type),
            cards: state.lastPlay.hand.cards.map((c) => ({ ...c })),
            text: state.lastPlay.hand.cards.map(cardText).join(' '),
          }
        : null,
      phase: state.phase,
      winner: state.winner,
      freeLead: state.freeLead,
      mustIncludeDiamond3: state.mustIncludeDiamond3,
      stake: state.stake,
      deltas: state.phase === 'settle' ? settleDeltas() : [0, 0, 0, 0],
    };
  }

  return { deal, play, pass, snapshot, settleDeltas, state };
}
