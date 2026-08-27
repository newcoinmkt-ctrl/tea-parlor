/**
 * 麻将 H5 引擎（对齐 packages/mahjong-engine 四川玩法）
 *
 * 模式：
 *  - er      二人麻将 · 108 张 · 首胡结算 · 无换三张/定缺
 *  - siren   四人经典 · 首胡结算 · 无换三张/定缺
 *  - xuezhan 血战到底 · 换三张→定缺→胡牌退场 · 最多 3 家胡
 *  - xueliu  血流成河 · 换三张→定缺→胡后留场可再胡 · 杠/胡实时分
 *
 * 牌组：四川标准 108 张（万条筒，无字牌）
 */

// ─── 牌面基础 ─────────────────────────────────────────

export const MJ_SUIT_NAMES = ['万', '条', '筒'];
export const SUIT_NAMES = MJ_SUIT_NAMES;
export const RANK_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const EXCHANGE_DIR = Object.freeze({
  CLOCKWISE: 'clockwise',
  COUNTER: 'counterclockwise',
  ACROSS: 'across',
});

export const GangType = Object.freeze({
  MING_ZHI: 'ming_zhi',
  MING_BU: 'ming_bu',
  AN: 'an',
});

export const PlayerStatus = Object.freeze({
  ACTIVE: 'active',
  HU_OUT: 'hu_out',
  HU_STAY: 'hu_stay',
});

let _uid = 0;

export function createTile(suit, rank) {
  return { id: `mj_${suit}_${rank}_${_uid++}`, suit, rank };
}

export function tileName(c) {
  if (!c) return '';
  const n = RANK_NAMES[c.rank] || c.rank;
  return `${n}${MJ_SUIT_NAMES[c.suit] || ''}`;
}

export function tileKey(t) {
  return Number(t.suit) * 10 + Number(t.rank);
}

export function sameTile(a, b) {
  return a && b && Number(a.suit) === Number(b.suit) && Number(a.rank) === Number(b.rank);
}

/** 四川 108 张 */
export function createSichuanDeck() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 3; suit++) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) deck.push(createTile(suit, rank));
    }
  }
  return deck;
}

/** @deprecated 兼容旧名，实际为 108 张四川牌 */
export function createMjDeck() {
  return createSichuanDeck();
}

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortMahjongHand(cards) {
  return cards.slice().sort((a, b) => {
    if (a.suit !== b.suit) return a.suit - b.suit;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.id).localeCompare(String(b.id));
  });
}

export const sortHand = sortMahjongHand;

export function countBySuit(hand) {
  const c = [0, 0, 0];
  for (const t of hand) {
    if (t.suit >= 0 && t.suit <= 2) c[t.suit] += 1;
  }
  return c;
}

export function countSame(hand, target) {
  return hand.filter((c) => sameTile(c, target));
}

// ─── 胡牌 ─────────────────────────────────────────────

/**
 * @param {object[]} concealed
 * @param {number} completedMelds
 * @param {number|null|undefined} missingSuit  0/1/2 定缺；null/-1 不限制（经典模式）
 */
export function canHu(concealed, completedMelds = 0, missingSuit = -1) {
  if (!Array.isArray(concealed)) return false;
  const hasDingque = missingSuit != null && missingSuit >= 0 && missingSuit <= 2;
  if (hasDingque && concealed.some((t) => t.suit === missingSuit)) return false;

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
  return false;
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

// ─── 换三张 / 定缺 ────────────────────────────────────

export function chooseMissingSuit(hand) {
  if (!Array.isArray(hand) || !hand.length) return 0;
  const counts = countBySuit(hand);
  let best = 0;
  let min = counts[0];
  for (let s = 1; s < 3; s++) {
    if (counts[s] < min) {
      min = counts[s];
      best = s;
    }
  }
  return best;
}

export function suggestExchangeTiles(hand, preferSuit = null) {
  const bySuit = [[], [], []];
  for (const t of hand) {
    if (t.suit >= 0 && t.suit <= 2) bySuit[t.suit].push(t);
  }
  let suit = preferSuit;
  if (suit == null || bySuit[suit].length < 3) {
    let bestS = -1;
    let bestN = -1;
    for (let s = 0; s < 3; s++) {
      if (bySuit[s].length >= 3 && bySuit[s].length > bestN) {
        bestN = bySuit[s].length;
        bestS = s;
      }
    }
    if (bestS < 0) {
      for (let s = 0; s < 3; s++) {
        if (bySuit[s].length > bestN) {
          bestN = bySuit[s].length;
          bestS = s;
        }
      }
    }
    suit = Math.max(0, bestS);
  }
  return bySuit[suit].slice(0, 3);
}

export function isValidExchangeSet(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 3) return false;
  const s0 = tiles[0].suit;
  return tiles.every((t) => t.suit === s0 && t.suit >= 0 && t.suit <= 2);
}

function exchangeTarget(from, direction) {
  if (direction === EXCHANGE_DIR.COUNTER) return (from + 3) % 4;
  if (direction === EXCHANGE_DIR.ACROSS) return (from + 2) % 4;
  return (from + 1) % 4;
}

function removeTilesByIds(hand, tiles) {
  const result = hand.slice();
  for (const t of tiles) {
    let idx = t.id ? result.findIndex((x) => x.id === t.id) : -1;
    if (idx < 0) idx = result.findIndex((x) => tileKey(x) === tileKey(t));
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

function doExchangeCards(playersHands, exchangeSets, direction = EXCHANGE_DIR.CLOCKWISE) {
  for (let i = 0; i < 4; i++) {
    if (!isValidExchangeSet(exchangeSets[i])) {
      return { ok: false, reason: `invalid_set_player_${i}` };
    }
  }
  const hands = playersHands.map((h) => h.slice());
  const given = exchangeSets.map((s) => s.slice());
  const received = [[], [], [], []];
  for (let i = 0; i < 4; i++) hands[i] = removeTilesByIds(hands[i], given[i]);
  for (let i = 0; i < 4; i++) {
    const target = exchangeTarget(i, direction);
    received[target] = given[i].slice();
    hands[target] = sortMahjongHand(hands[target].concat(given[i]));
  }
  return { ok: true, hands, received, direction };
}

// ─── 杠分 ─────────────────────────────────────────────

const DEFAULT_GANG_PAY = {
  [GangType.MING_ZHI]: { fromDiscarder: 1, fromEachOther: 0 },
  [GangType.MING_BU]: { fromDiscarder: 0, fromEachOther: 1 },
  [GangType.AN]: { fromDiscarder: 0, fromEachOther: 2 },
};

export function settleGangImmediate(opts) {
  const {
    type,
    ganger,
    discarder = null,
    baseScore = 1,
    playerCount = 4,
    payTable = DEFAULT_GANG_PAY,
  } = opts;
  const active = new Set(opts.activePlayers || Array.from({ length: playerCount }, (_, i) => i));
  if (!active.has(ganger)) {
    return { deltas: Array(playerCount).fill(0), records: [], totalToGanger: 0 };
  }
  const pay = payTable[type] || DEFAULT_GANG_PAY[type] || { fromDiscarder: 0, fromEachOther: 0 };
  const deltas = Array(playerCount).fill(0);
  const records = [];
  let total = 0;

  if (type === GangType.MING_ZHI && discarder != null && active.has(discarder)) {
    const amt = pay.fromDiscarder * baseScore;
    deltas[discarder] -= amt;
    deltas[ganger] += amt;
    total += amt;
    records.push({
      kind: 'gang',
      gangType: type,
      from: discarder,
      to: ganger,
      amount: amt,
      label: '刮风(直杠)',
    });
  } else {
    const each = pay.fromEachOther * baseScore;
    for (let i = 0; i < playerCount; i++) {
      if (i === ganger || !active.has(i)) continue;
      deltas[i] -= each;
      deltas[ganger] += each;
      total += each;
      records.push({
        kind: 'gang',
        gangType: type,
        from: i,
        to: ganger,
        amount: each,
        label: type === GangType.AN ? '下雨(暗杠)' : '刮风(补杠)',
      });
    }
  }
  return { deltas, records, totalToGanger: total };
}

export function findAnGangCandidates(concealed) {
  const map = new Map();
  for (const t of concealed) {
    const k = `${t.suit}_${t.rank}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  const out = [];
  for (const tiles of map.values()) {
    if (tiles.length >= 4) {
      out.push({ suit: tiles[0].suit, rank: tiles[0].rank, tiles: tiles.slice(0, 4) });
    }
  }
  return out;
}

export function findBuGangCandidates(concealed, pengMelds) {
  const out = [];
  for (const m of pengMelds || []) {
    if (m.type !== 'peng') continue;
    const extra = concealed.filter((t) => t.suit === m.suit && t.rank === m.rank);
    if (extra.length >= 1) {
      out.push({ suit: m.suit, rank: m.rank, tile: extra[0], meldId: m.id });
    }
  }
  return out;
}

// ─── 模式元信息 ───────────────────────────────────────

export function playerCountForMode(mode) {
  return mode === 'er' ? 2 : 4;
}

export function usesSichuanPhases(mode) {
  return mode === 'xuezhan' || mode === 'xueliu';
}

export function settleMultiplier(mode) {
  if (mode === 'xueliu') return 2;
  return 1;
}

export function modeName(mode) {
  return {
    er: '二人麻将',
    siren: '四人麻将',
    xuezhan: '血战到底',
    xueliu: '血流成河',
  }[mode] || '麻将';
}

export function modeDesc(mode) {
  return {
    er: '2 人桌 · 摸打碰杠胡',
    siren: '4 人经典 · 首胡结算',
    xuezhan: '4 人 · 换三张/定缺 · 胡牌退场',
    xueliu: '4 人 · 换三张/定缺 · 胡后留场可再胡',
  }[mode] || '麻将';
}

export function suitLabel(suit) {
  return MJ_SUIT_NAMES[suit] || '';
}

// ─── 桌子 ─────────────────────────────────────────────

/**
 * @param {'er'|'siren'|'xuezhan'|'xueliu'} mode
 */
export function createMahjongTable({
  mode = 'xuezhan',
  names = ['茶馆', '茶友A', '茶友B', '茶友C'],
  stake = 100,
} = {}) {
  const playerCount = playerCountForMode(mode);
  const isSichuan = usesSichuanPhases(mode);
  const isXueliu = mode === 'xueliu';
  const isXuezhan = mode === 'xuezhan';
  const isFirstHuEnd = mode === 'er' || mode === 'siren';

  const state = {
    mode,
    names: names.slice(0, playerCount),
    playerCount,
    stake,
    dealer: 0,
    hands: Array.from({ length: playerCount }, () => []),
    melds: Array.from({ length: playerCount }, () => []),
    wall: [],
    discards: [],
    lastDiscard: null,
    current: 0,
    phase: 'idle', // idle | exchange | dingque | discard | call | settle
    winner: -1,
    winners: [],
    canHuSelf: false,
    wallLeft: 0,
    drawn: null,
    missingSuits: Array.from({ length: playerCount }, () => null),
    status: Array.from({ length: playerCount }, () => PlayerStatus.ACTIVE),
    scores: Array.from({ length: playerCount }, () => 0),
    ledger: [],
    huOrder: [],
    huCount: Array.from({ length: playerCount }, () => 0),
    exchangeSelected: [], // 真人换三张选中的 id
    pendingClaims: [],
    finishedReason: null,
    _meldSeq: 0,
  };

  function playingSeats() {
    if (isXueliu) {
      return Array.from({ length: playerCount }, (_, i) => i).filter(
        (i) => state.status[i] === PlayerStatus.ACTIVE || state.status[i] === PlayerStatus.HU_STAY
      );
    }
    return Array.from({ length: playerCount }, (_, i) => i).filter(
      (i) => state.status[i] === PlayerStatus.ACTIVE
    );
  }

  function applyScoreDeltas(deltas, records) {
    for (let i = 0; i < playerCount; i++) {
      state.scores[i] += deltas[i] || 0;
    }
    for (const r of records || []) {
      state.ledger.push({ ...r, ts: state.ledger.length });
    }
  }

  function finish(reason) {
    state.phase = 'settle';
    state.finishedReason = reason;
    if (state.huOrder.length) {
      state.winner = state.huOrder[0];
      state.winners = state.huOrder.slice();
    } else {
      state.winner = -1;
      state.winners = [];
    }
    state.ledger.push({ kind: 'finish', reason });
  }

  function drawFor(player) {
    if (state.wall.length === 0) {
      finish('wall_empty');
      return { ok: true, draw: true };
    }
    if (state.status[player] === PlayerStatus.HU_OUT) {
      const next = nextActive(player);
      if (next < 0) {
        finish('one_left');
        return { ok: true };
      }
      return drawFor(next);
    }
    const t = state.wall.shift();
    state.hands[player] = sortMahjongHand([...state.hands[player], t]);
    state.wallLeft = state.wall.length;
    state.drawn = t.id;
    state.current = player;
    state.phase = 'discard';
    const missing = state.missingSuits[player];
    state.canHuSelf = canHu(state.hands[player], state.melds[player].length, missing);
    return { ok: true };
  }

  function nextActive(from) {
    for (let s = 1; s <= playerCount; s++) {
      const i = (from + s) % playerCount;
      if (isXuezhan) {
        if (state.status[i] === PlayerStatus.ACTIVE) return i;
      } else if (state.status[i] !== PlayerStatus.HU_OUT) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 发牌
   * @param {{ dealer?: number }} [opts] dealer = 庄家座位（掷骰结果），默认 0
   */
  function deal(opts = {}) {
    const deck = shuffle(shuffle(createSichuanDeck()));
    const handSize = 13;
    state.hands = [];
    state.melds = Array.from({ length: playerCount }, () => []);
    state.missingSuits = Array.from({ length: playerCount }, () => null);
    state.status = Array.from({ length: playerCount }, () => PlayerStatus.ACTIVE);
    state.scores = Array.from({ length: playerCount }, () => 0);
    state.ledger = [];
    state.huOrder = [];
    state.huCount = Array.from({ length: playerCount }, () => 0);
    state.exchangeSelected = [];
    state.pendingClaims = [];
    state.finishedReason = null;
    state.winner = -1;
    state.winners = [];
    state._meldSeq = 0;
    const d = Number(opts.dealer);
    state.dealer = Number.isFinite(d)
      ? ((Math.floor(d) % playerCount) + playerCount) % playerCount
      : Math.floor(Math.random() * playerCount);

    let idx = 0;
    // 从庄家起顺时针轮发（更贴近真桌）
    const seatOrder = Array.from({ length: playerCount }, (_, i) => (state.dealer + i) % playerCount);
    if (playerCount === 4) {
      // 三轮各 4 张 + 一轮各 1 张 = 13
      const batches = [4, 4, 4, 1];
      for (let p = 0; p < 4; p++) state.hands[p] = [];
      for (const n of batches) {
        for (const p of seatOrder) {
          for (let k = 0; k < n; k++) state.hands[p].push(deck[idx++]);
        }
      }
      for (let p = 0; p < 4; p++) state.hands[p] = sortMahjongHand(state.hands[p]);
    } else {
      // 二人：同样按庄家轮发
      for (let p = 0; p < playerCount; p++) state.hands[p] = [];
      const batches = [4, 4, 4, 1];
      for (const n of batches) {
        for (const p of seatOrder) {
          for (let k = 0; k < n; k++) state.hands[p].push(deck[idx++]);
        }
      }
      for (let p = 0; p < playerCount; p++) state.hands[p] = sortMahjongHand(state.hands[p]);
    }
    state.wall = deck.slice(idx);
    state.discards = [];
    state.lastDiscard = null;
    state.current = state.dealer;
    state.drawn = null;
    state.wallLeft = state.wall.length;
    state.canHuSelf = false;
    state.ledger.push({ kind: 'deal', dealer: state.dealer });

    if (isSichuan) {
      state.phase = 'exchange';
    } else {
      // 经典：无换三张/定缺，庄家直接摸
      for (let p = 0; p < playerCount; p++) state.missingSuits[p] = -1;
      state.phase = 'discard';
      drawFor(state.dealer);
    }
  }

  // ── 换三张 ──

  function toggleExchangeTile(tileId) {
    if (state.phase !== 'exchange') return { ok: false, reason: 'not_exchange' };
    const hand = state.hands[0];
    const tile = hand.find((c) => c.id === tileId);
    if (!tile) return { ok: false, reason: 'missing' };
    const idx = state.exchangeSelected.indexOf(tileId);
    if (idx >= 0) {
      state.exchangeSelected.splice(idx, 1);
      return { ok: true };
    }
    if (state.exchangeSelected.length >= 3) {
      return { ok: false, reason: 'max_3' };
    }
    // 须同花色
    if (state.exchangeSelected.length > 0) {
      const first = hand.find((c) => c.id === state.exchangeSelected[0]);
      if (first && first.suit !== tile.suit) {
        return { ok: false, reason: 'same_suit' };
      }
    }
    state.exchangeSelected.push(tileId);
    return { ok: true };
  }

  function confirmExchange() {
    if (state.phase !== 'exchange') return { ok: false, reason: 'not_exchange' };
    if (playerCount !== 4) {
      state.phase = 'dingque';
      return { ok: true };
    }
    const humanTiles = state.exchangeSelected
      .map((id) => state.hands[0].find((c) => c.id === id))
      .filter(Boolean);
    if (!isValidExchangeSet(humanTiles)) {
      return { ok: false, reason: 'need_3_same_suit' };
    }
    const sets = [humanTiles];
    for (let i = 1; i < 4; i++) {
      let set = suggestExchangeTiles(state.hands[i]);
      if (set.length < 3) {
        const by = [[], [], []];
        for (const t of state.hands[i]) by[t.suit]?.push(t);
        let s = 0;
        for (let k = 1; k < 3; k++) if ((by[k]?.length || 0) > (by[s]?.length || 0)) s = k;
        set = by[s].slice(0, 3);
      }
      if (set.length < 3) return { ok: false, reason: `ai_exchange_${i}` };
      sets.push(set);
    }
    const r = doExchangeCards(state.hands, sets, EXCHANGE_DIR.CLOCKWISE);
    if (!r.ok) return r;
    state.hands = r.hands;
    state.exchangeSelected = [];
    state.ledger.push({ kind: 'exchange', direction: r.direction });
    state.phase = 'dingque';
    return { ok: true, received: r.received };
  }

  function autoExchangeIfNeeded() {
    // AI 全自动换（测试/兜底）
    if (state.phase !== 'exchange') return { ok: false };
    const sets = state.hands.map((h) => {
      let set = suggestExchangeTiles(h);
      if (set.length < 3) {
        const by = [[], [], []];
        for (const t of h) if (t.suit >= 0 && t.suit <= 2) by[t.suit].push(t);
        let s = 0;
        for (let k = 1; k < 3; k++) if (by[k].length > by[s].length) s = k;
        set = by[s].slice(0, 3);
      }
      return set;
    });
    if (sets.some((s) => s.length < 3)) return { ok: false, reason: 'cannot_auto' };
    const r = doExchangeCards(state.hands, sets);
    if (!r.ok) return r;
    state.hands = r.hands;
    state.exchangeSelected = [];
    state.phase = 'dingque';
    return { ok: true };
  }

  // ── 定缺 ──

  function chooseDingque(player, suit) {
    if (state.phase !== 'dingque') return { ok: false, reason: 'not_dingque' };
    if (player < 0 || player >= playerCount) return { ok: false, reason: 'bad_player' };
    let s = suit;
    if (s === -1 || s == null) s = chooseMissingSuit(state.hands[player]);
    if (s < 0 || s > 2) return { ok: false, reason: 'bad_suit' };
    state.missingSuits[player] = s;

    // AI 自动定缺
    for (let i = 1; i < playerCount; i++) {
      if (state.missingSuits[i] == null) {
        state.missingSuits[i] = chooseMissingSuit(state.hands[i]);
      }
    }

    if (state.missingSuits.every((x) => x != null)) {
      state.phase = 'discard';
      drawFor(state.dealer);
    }
    return { ok: true, suit: s };
  }

  // ── 碰杠胡 ──

  function scanClaims(discarder, tile) {
    const claims = [];
    for (const i of playingSeats()) {
      if (i === discarder) continue;
      if (state.status[i] === PlayerStatus.HU_OUT) continue;
      const meldsCount = state.melds[i].length;
      const missing = state.missingSuits[i];
      if (canHu([...state.hands[i], tile], meldsCount, missing)) {
        claims.push({ type: 'hu', seat: i, canHu: true, canPeng: false, canGang: false });
      }
      if (state.status[i] === PlayerStatus.ACTIVE) {
        const dingque = missing != null && missing >= 0 && missing <= 2 && tile.suit === missing;
        const n = countSame(state.hands[i], tile).length;
        if (!dingque && n >= 2) {
          claims.push({
            type: 'peng',
            seat: i,
            canHu: false,
            canPeng: true,
            canGang: n >= 3,
          });
        }
        if (!dingque && n >= 3) {
          claims.push({ type: 'gang', seat: i, canHu: false, canPeng: true, canGang: true });
        }
      }
    }
    return claims;
  }

  function applyHuInternal(player, opts = {}) {
    if (state.status[player] === PlayerStatus.HU_OUT) {
      return { ok: false, reason: 'already_out' };
    }
    const missing = state.missingSuits[player];
    const meldsCount = state.melds[player].length;
    let hand = state.hands[player];
    let tile = opts.tile;

    if (opts.fromDiscard) {
      tile = opts.tile || state.lastDiscard?.tile;
      if (!tile) return { ok: false, reason: 'no_hu_tile' };
      hand = [...hand, tile];
    }

    if (!canHu(hand, meldsCount, missing)) {
      return { ok: false, reason: 'cannot_hu' };
    }

    const isZimo = !opts.fromDiscard;
    // 血流二次及以上胡分 ×2
    const multi = isXueliu && state.huCount[player] > 0 ? 2 : 1;
    const unit = state.stake * multi;
    const deltas = Array.from({ length: playerCount }, () => 0);
    const records = [];

    if (isZimo) {
      const payers = playingSeats().filter((i) => i !== player);
      for (const i of payers) {
        const amt = unit * 2;
        deltas[i] -= amt;
        deltas[player] += amt;
        records.push({
          kind: 'hu',
          mode: state.mode,
          zimo: true,
          from: i,
          to: player,
          amount: amt,
          order: state.huOrder.length + 1,
        });
      }
    } else {
      const discarder = opts.discarder;
      const amt = unit;
      deltas[discarder] -= amt;
      deltas[player] += amt;
      records.push({
        kind: 'hu',
        mode: state.mode,
        zimo: false,
        from: discarder,
        to: player,
        amount: amt,
        order: state.huOrder.length + 1,
      });
      // 一炮多响时保留 lastDiscard 供后续认胡；clearDiscard 时再清
      if (!opts.keepDiscard && state.lastDiscard) state.lastDiscard = null;
    }

    applyScoreDeltas(deltas, records);
    state.huCount[player] += 1;
    if (!state.huOrder.includes(player)) state.huOrder.push(player);

    if (isXuezhan) {
      state.status[player] = PlayerStatus.HU_OUT;
      state.hands[player] = sortMahjongHand(hand);
    } else if (isXueliu) {
      state.status[player] = PlayerStatus.HU_STAY;
      state.hands[player] = sortMahjongHand(isZimo ? hand.slice(0, -1) : state.hands[player]);
    } else {
      // 经典首胡即终
      state.status[player] = PlayerStatus.HU_OUT;
      state.hands[player] = sortMahjongHand(hand);
      finish('first_hu');
      state.winner = player;
      return { ok: true, settled: true, deltas, records };
    }

    if (isXuezhan && state.huOrder.length >= 3) {
      finish('three_hu');
      return { ok: true, settled: true, deltas, records };
    }
    if (isXuezhan && playingSeats().length <= 1) {
      finish('one_left');
      return { ok: true, settled: true, deltas, records };
    }

    return { ok: true, deltas, records };
  }

  function doPeng(seat, tile, asGang = false) {
    const need = asGang ? 3 : 2;
    const hand = state.hands[seat];
    const keep = [];
    let removed = 0;
    for (const c of hand) {
      if (removed < need && sameTile(c, tile)) {
        removed += 1;
        continue;
      }
      keep.push(c);
    }
    state.hands[seat] = sortMahjongHand(keep);
    const from = state.lastDiscard?.player;
    if (asGang) {
      state.melds[seat].push({
        id: `m_${++state._meldSeq}`,
        type: 'gang',
        gangType: GangType.MING_ZHI,
        tile,
        suit: tile.suit,
        rank: tile.rank,
        open: true,
        from,
      });
      const pay = settleGangImmediate({
        type: GangType.MING_ZHI,
        ganger: seat,
        discarder: from,
        baseScore: state.stake,
        activePlayers: playingSeats(),
        playerCount,
      });
      applyScoreDeltas(pay.deltas, pay.records);
      state.lastDiscard = null;
      state.current = seat;
      drawFor(seat);
    } else {
      state.melds[seat].push({
        id: `m_${++state._meldSeq}`,
        type: 'peng',
        tile,
        suit: tile.suit,
        rank: tile.rank,
        open: true,
        from,
      });
      state.lastDiscard = null;
      state.current = seat;
      state.phase = 'discard';
      state.drawn = null;
      state.canHuSelf = canHu(state.hands[seat], state.melds[seat].length, state.missingSuits[seat]);
    }
  }

  function discard(player, tileId) {
    if (state.phase !== 'discard' && state.phase !== 'draw') {
      return { ok: false, reason: 'not_discard' };
    }
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    if (state.status[player] === PlayerStatus.HU_OUT) return { ok: false, reason: 'player_out' };

    const hand = state.hands[player];
    const tile = hand.find((c) => c.id === tileId);
    if (!tile) return { ok: false, reason: 'missing' };

    state.hands[player] = sortMahjongHand(hand.filter((c) => c.id !== tileId));
    state.discards.push({ player, tile });
    state.lastDiscard = { player, tile };
    state.drawn = null;
    state.canHuSelf = false;
    state.pendingClaims = [];

    const claims = scanClaims(player, tile);
    const huClaimants = claims.filter((c) => c.canHu || c.type === 'hu');

    // 一炮多响：全部结算
    if (huClaimants.length) {
      // 真人可选择：若真人能胡且不是唯一，进入 call；AI 直接胡
      const humanHu = huClaimants.find((c) => c.seat === 0);
      const aiHu = huClaimants.filter((c) => c.seat !== 0);

      for (let hi = 0; hi < aiHu.length; hi++) {
        const c = aiHu[hi];
        const isLastAi = hi === aiHu.length - 1 && !humanHu;
        applyHuInternal(c.seat, {
          fromDiscard: true,
          discarder: player,
          tile,
          keepDiscard: !isLastAi || !!humanHu,
        });
        if (state.phase === 'settle') return { ok: true, settled: true, multiHu: true };
      }

      if (humanHu && state.phase !== 'settle') {
        // 真人可选择胡（一炮多响保留 lastDiscard）
        if (!state.lastDiscard) state.lastDiscard = { player, tile };
        state.phase = 'call';
        state.current = 0;
        state.pendingClaims = claims.filter((c) => c.seat === 0);
        return { ok: true, call: true };
      }

      if (state.phase === 'settle') return { ok: true, settled: true };

      state.lastDiscard = null;
      // 全部 AI 已胡完，下家摸
      const next = nextActive(player);
      if (next < 0 || state.wall.length === 0) {
        finish('wall_empty');
        return { ok: true, settled: true };
      }
      drawFor(next);
      return { ok: true, multiHu: huClaimants.length > 1 };
    }

    // 真人可碰杠优先于 AI，避免 AI 抢走同一张弃牌的应答
    if (claims.some((c) => c.seat === 0 && (c.canPeng || c.canGang || c.type === 'peng' || c.type === 'gang'))) {
      state.phase = 'call';
      state.current = 0;
      state.pendingClaims = claims.filter((c) => c.seat === 0);
      return { ok: true, call: true };
    }

    const pengCaller = claims.find(
      (c) => c.seat !== 0 && (c.canPeng || c.canGang || c.type === 'peng' || c.type === 'gang')
    );
    if (pengCaller) {
      const asGang = !!(pengCaller.canGang || pengCaller.type === 'gang');
      doPeng(pengCaller.seat, tile, asGang && Math.random() > 0.5);
      return { ok: true, peng: pengCaller.seat };
    }

    const next = nextActive(player);
    if (next < 0 || state.wall.length === 0) {
      finish('wall_empty');
      return { ok: true, settled: true };
    }
    drawFor(next);
    return { ok: true };
  }

  function humanCall(action) {
    if (state.phase !== 'call' || !state.lastDiscard) {
      // 点炮胡后 lastDiscard 可能被清，需从 discards 取
      if (action === 'hu' && state.phase === 'call') {
        /* fallthrough */
      } else if (state.phase !== 'call') {
        return { ok: false, reason: 'no_call' };
      }
    }

    const disc = state.lastDiscard || state.discards[state.discards.length - 1];
    if (!disc) return { ok: false, reason: 'no_discard' };
    const { tile, player: from } = disc;

    if (action === 'hu') {
      const r = applyHuInternal(0, { fromDiscard: true, discarder: from, tile });
      if (!r.ok) return r;
      if (state.phase === 'settle') return { ok: true, settled: true };
      // 血流继续 / 血战继续
      const next = nextActive(from);
      if (next < 0 || state.wall.length === 0) {
        finish('wall_empty');
        return { ok: true, settled: true };
      }
      drawFor(next);
      return { ok: true };
    }

    if (action === 'peng' || action === 'gang') {
      const missing = state.missingSuits[0];
      if (missing != null && missing >= 0 && missing <= 2 && tile.suit === missing) {
        return { ok: false, reason: 'dingque' };
      }
      const same = countSame(state.hands[0], tile);
      if (action === 'peng' && same.length < 2) return { ok: false, reason: 'no_peng' };
      if (action === 'gang' && same.length < 3) return { ok: false, reason: 'no_gang' };
      doPeng(0, tile, action === 'gang');
      return { ok: true };
    }

    // pass：胡权放弃后，其他人仍可碰/杠这张弃牌
    const rest = scanClaims(from, tile).filter((c) => c.seat !== 0);
    const pengCaller = rest.find(
      (c) => c.canPeng || c.canGang || c.type === 'peng' || c.type === 'gang'
    );
    if (pengCaller) {
      const asGang = !!(pengCaller.canGang || pengCaller.type === 'gang');
      doPeng(pengCaller.seat, tile, asGang && Math.random() > 0.5);
      return { ok: true, pass: true, peng: pengCaller.seat };
    }
    const next = nextActive(from);
    if (next < 0 || state.wall.length === 0) {
      finish('wall_empty');
      return { ok: true, settled: true };
    }
    drawFor(next);
    return { ok: true, pass: true };
  }

  function huSelf(player) {
    if (state.phase !== 'discard') return { ok: false, reason: 'not_discard' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };
    const r = applyHuInternal(player, { fromDiscard: false });
    if (!r.ok) return r;
    if (state.phase === 'settle') return { ok: true, settled: true };

    // 血流自摸后须继续打牌（手牌已去掉胡牌那张）— 需再摸
    if (isXueliu && state.status[player] === PlayerStatus.HU_STAY) {
      drawFor(player);
    } else if (isXuezhan) {
      const next = nextActive(player);
      if (next < 0 || state.wall.length === 0) {
        finish(state.wall.length === 0 ? 'wall_empty' : 'one_left');
        return { ok: true, settled: true };
      }
      drawFor(next);
    }
    return { ok: true };
  }

  /** 暗杠 / 补杠（自己回合） */
  function gangSelf(player, opts = {}) {
    if (state.phase !== 'discard') return { ok: false, reason: 'not_discard' };
    if (player !== state.current) return { ok: false, reason: 'not_turn' };

    const type = opts.type || GangType.AN;
    if (type === GangType.AN) {
      const cands = findAnGangCandidates(state.hands[player]);
      const cand = opts.tile
        ? cands.find((c) => c.suit === opts.tile.suit && c.rank === opts.tile.rank)
        : cands[0];
      if (!cand) return { ok: false, reason: 'no_an_gang' };
      const takeIds = new Set(cand.tiles.map((t) => t.id));
      state.hands[player] = state.hands[player].filter((t) => !takeIds.has(t.id));
      state.melds[player].push({
        id: `m_${++state._meldSeq}`,
        type: 'gang',
        gangType: GangType.AN,
        suit: cand.suit,
        rank: cand.rank,
        tile: cand.tiles[0],
        open: false,
      });
      const pay = settleGangImmediate({
        type: GangType.AN,
        ganger: player,
        baseScore: state.stake,
        activePlayers: playingSeats(),
        playerCount,
      });
      applyScoreDeltas(pay.deltas, pay.records);
      drawFor(player);
      return { ok: true, gangPay: pay };
    }

    if (type === GangType.MING_BU) {
      const pengs = state.melds[player].filter((m) => m.type === 'peng');
      const cands = findBuGangCandidates(state.hands[player], pengs);
      const cand = opts.tile
        ? cands.find((c) => c.suit === opts.tile.suit && c.rank === opts.tile.rank)
        : cands[0];
      if (!cand) return { ok: false, reason: 'no_bu_gang' };
      state.hands[player] = state.hands[player].filter((t) => t.id !== cand.tile.id);
      const meld = state.melds[player].find(
        (m) => m.type === 'peng' && m.suit === cand.suit && m.rank === cand.rank
      );
      if (meld) {
        meld.type = 'gang';
        meld.gangType = GangType.MING_BU;
        meld.open = true;
      }
      const pay = settleGangImmediate({
        type: GangType.MING_BU,
        ganger: player,
        baseScore: state.stake,
        activePlayers: playingSeats(),
        playerCount,
      });
      applyScoreDeltas(pay.deltas, pay.records);
      drawFor(player);
      return { ok: true, gangPay: pay };
    }
    return { ok: false, reason: 'unknown_gang' };
  }

  function settleDeltas() {
    // 实时 scores 即为本局累计
    return state.scores.slice();
  }

  function snapshot() {
    const missing = state.missingSuits[0];
    const anGang = state.phase === 'discard' && state.current === 0
      ? findAnGangCandidates(state.hands[0])
      : [];
    const buGang = state.phase === 'discard' && state.current === 0
      ? findBuGangCandidates(
        state.hands[0],
        state.melds[0].filter((m) => m.type === 'peng')
      )
      : [];

    let callOptions = null;
    if (state.phase === 'call' && state.lastDiscard) {
      const tile = state.lastDiscard.tile;
      callOptions = {
        canHu: canHu([...state.hands[0], tile], state.melds[0].length, missing),
        canPeng: countSame(state.hands[0], tile).length >= 2
          && state.status[0] === PlayerStatus.ACTIVE,
        canGang: countSame(state.hands[0], tile).length >= 3
          && state.status[0] === PlayerStatus.ACTIVE,
      };
    }

    return {
      mode: state.mode,
      modeName: modeName(state.mode),
      modeDesc: modeDesc(state.mode),
      names: state.names.slice(),
      playerCount,
      hands: state.hands.map((h) => h.map((c) => ({ ...c }))),
      counts: state.hands.map((h) => h.length),
      melds: state.melds.map((m) => m.map((x) => ({
        ...x,
        tile: x.tile ? { ...x.tile } : { suit: x.suit, rank: x.rank },
      }))),
      // 弃牌全量（或最近 64 张）供 UI 按座位分区展示
      discards: state.discards.slice(-64).map((d) => ({
        player: d.player,
        tile: { ...d.tile },
        name: tileName(d.tile),
      })),
      lastDiscard: state.lastDiscard
        ? {
          player: state.lastDiscard.player,
          tile: { ...state.lastDiscard.tile },
          name: tileName(state.lastDiscard.tile),
        }
        : null,
      current: state.current,
      dealer: state.dealer,
      phase: state.phase,
      winner: state.winner,
      winners: state.winners.slice(),
      huOrder: state.huOrder.slice(),
      huCount: state.huCount.slice(),
      canHuSelf: state.canHuSelf && state.current === 0 && state.phase === 'discard',
      wallLeft: state.wallLeft,
      stake: state.stake,
      scores: state.scores.slice(),
      deltas: state.phase === 'settle' ? settleDeltas() : state.scores.slice(),
      status: state.status.slice(),
      missingSuits: state.missingSuits.slice(),
      exchangeSelected: state.exchangeSelected.slice(),
      isSichuan,
      finishedReason: state.finishedReason,
      callOptions,
      canAnGang: anGang.length > 0,
      canBuGang: buGang.length > 0,
      anGangCandidates: anGang,
      buGangCandidates: buGang,
      ledger: state.ledger.slice(-20),
    };
  }

  return {
    deal,
    discard,
    humanCall,
    huSelf,
    gangSelf,
    toggleExchangeTile,
    confirmExchange,
    autoExchangeIfNeeded,
    chooseDingque,
    snapshot,
    settleDeltas,
    state,
  };
}
