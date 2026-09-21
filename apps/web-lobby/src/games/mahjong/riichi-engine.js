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

/** 日麻吃候选（序数牌） */
export function findRiichiChiOptions(hand, tile) {
  if (!tile || tile.suit > 2) return [];
  const suit = tile.suit;
  const r = Number(tile.rank);
  const patterns = [[r - 2, r - 1], [r - 1, r + 1], [r + 1, r + 2]];
  const out = [];
  for (const [a, b] of patterns) {
    if (a < 1 || a > 9 || b < 1 || b > 9) continue;
    const ta = hand.find((t) => t.suit === suit && t.rank === a);
    if (!ta) continue;
    const tb = hand.find((t) => t.suit === suit && t.rank === b && t.id !== ta.id);
    if (!tb) continue;
    const key = [a, r, b].sort((x, y) => x - y).join('-');
    if (out.some((o) => o.key === key)) continue;
    out.push({ key, tiles: [ta, tb], ranks: [a, r, b].sort((x, y) => x - y) });
  }
  return out;
}


function isTerminalOrHonor(t) {
  if (!t) return false;
  if (t.suit >= 3) return true;
  return t.rank === 1 || t.rank === 9;
}

function isSimple(t) {
  return t && t.suit <= 2 && t.rank >= 2 && t.rank <= 8;
}


/** play9fin4c: clone count map */
function cloneCounts(counts) {
  return new Map(counts);
}

/**
 * play9fin4c: find one standard decomposition (pair + melds).
 * @returns {{ pairKey:number, melds:{type:'chi'|'pon', keys:number[], suit?:number}[] }|null}
 */
function findMeldDecomposition(counts, needMelds) {
  const keys = [...counts.keys()].sort((a, b) => a - b);
  for (const pairKey of keys) {
    if ((counts.get(pairKey) || 0) < 2) continue;
    const m = cloneCounts(counts);
    m.set(pairKey, m.get(pairKey) - 2);
    if (m.get(pairKey) === 0) m.delete(pairKey);
    const melds = [];
    if (decomposeMelds(m, needMelds, melds)) {
      return { pairKey, melds };
    }
  }
  return null;
}

function decomposeMelds(counts, n, out) {
  if (n === 0) {
    for (const v of counts.values()) if (v > 0) return false;
    return true;
  }
  let first = -1;
  for (const [k, c] of counts) {
    if (c > 0) { first = k; break; }
  }
  if (first < 0) return false;

  const cnt = counts.get(first) || 0;
  // pon
  if (cnt >= 3) {
    counts.set(first, cnt - 3);
    out.push({ type: 'pon', keys: [first, first, first], suit: Math.floor(first / 10) });
    if (decomposeMelds(counts, n - 1, out)) return true;
    out.pop();
    counts.set(first, cnt);
  }
  // chi
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
      out.push({ type: 'chi', keys: [a, b, c], suit });
      if (decomposeMelds(counts, n - 1, out)) return true;
      out.pop();
      counts.set(a, (counts.get(a) || 0) + 1);
      counts.set(b, (counts.get(b) || 0) + 1);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  return false;
}

function isTerminalOrHonorKey(k) {
  const suit = Math.floor(k / 10);
  const rank = k % 10;
  return suit >= 3 || rank === 1 || rank === 9;
}

/** play9fin4c rarer yaku from decomposition + tile counts */
function detectRarerYaku({ counts, closed, sevenPairs, melds, full }) {
  const extra = [];
  if (sevenPairs) return extra; // 七对子 already added; skip standard-shape rarer set

  const needMelds = 4 - (melds?.length || 0);
  // Include open melds as fixed pons/chis when present
  const openMelds = (melds || []).map((m) => {
    if (m.tiles?.length === 3) {
      const keys = m.tiles.map(tileKey);
      const sorted = [...keys].sort((a, b) => a - b);
      const isChi = sorted[0] !== sorted[2] && Math.floor(sorted[0] / 10) === Math.floor(sorted[2] / 10);
      return { type: isChi ? 'chi' : 'pon', keys: sorted, suit: Math.floor(sorted[0] / 10) };
    }
    if (m.type === 'chi' || m.kind === 'chi') {
      return { type: 'chi', keys: [], suit: m.suit };
    }
    return { type: 'pon', keys: m.suit != null ? [m.suit * 10 + (m.rank || 0)] : [], suit: m.suit };
  });

  let decomp = null;
  if (needMelds > 0) {
    decomp = findMeldDecomposition(counts, needMelds);
  } else {
    decomp = { pairKey: [...counts.keys()][0], melds: [] };
  }
  if (!decomp && openMelds.length === 0) return extra;

  const allMelds = [...(decomp?.melds || []), ...openMelds];
  const pairKey = decomp?.pairKey;

  // 对对和 — all pons
  if (allMelds.length === 4 && allMelds.every((m) => m.type === 'pon')) {
    extra.push({ name: '对对和', han: closed ? 2 : 2 });
  }

  // 清一色 / 混一色
  const suitSet = new Set();
  let hasHonor = false;
  for (const t of full) {
    if (t.suit >= 3) hasHonor = true;
    else suitSet.add(t.suit);
  }
  for (const m of melds || []) {
    const tiles = m.tiles || [];
    if (tiles.length) {
      for (const t of tiles) {
        if (t.suit >= 3) hasHonor = true;
        else suitSet.add(t.suit);
      }
    } else if (m.suit != null) {
      if (m.suit >= 3) hasHonor = true;
      else suitSet.add(m.suit);
    }
  }
  if (suitSet.size === 1 && !hasHonor) {
    extra.push({ name: '清一色', han: closed ? 6 : 5 });
  } else if (suitSet.size === 1 && hasHonor) {
    extra.push({ name: '混一色', han: closed ? 3 : 2 });
  }

  // 三色同顺 — same rank sequence in m/p/s
  const chiByStart = new Map(); // startRank -> set of suits
  for (const m of allMelds) {
    if (m.type !== 'chi' || !m.keys?.length) continue;
    const ranks = m.keys.map((k) => k % 10).sort((a, b) => a - b);
    if (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) {
      const start = ranks[0];
      if (!chiByStart.has(start)) chiByStart.set(start, new Set());
      chiByStart.get(start).add(m.suit);
    }
  }
  for (const suits of chiByStart.values()) {
    if (suits.has(0) && suits.has(1) && suits.has(2)) {
      extra.push({ name: '三色同顺', han: closed ? 2 : 1 });
      break;
    }
  }

  // 一气通贯 — 123+456+789 same suit
  for (let suit = 0; suit <= 2; suit++) {
    const starts = new Set();
    for (const m of allMelds) {
      if (m.type !== 'chi' || m.suit !== suit || !m.keys?.length) continue;
      const ranks = m.keys.map((k) => k % 10).sort((a, b) => a - b);
      if (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) starts.add(ranks[0]);
    }
    if (starts.has(1) && starts.has(4) && starts.has(7)) {
      extra.push({ name: '一气通贯', han: closed ? 2 : 1 });
      break;
    }
  }

  // 混全带幺九 — every meld and pair contains terminal/honor
  if (pairKey != null && allMelds.length === 4) {
    const pairOk = isTerminalOrHonorKey(pairKey);
    const meldsOk = allMelds.every((m) => {
      if (m.keys?.length) return m.keys.some(isTerminalOrHonorKey);
      // open meld without keys: check suit/rank if present
      if (m.suit >= 3) return true;
      return false;
    });
    const hasHonorOrTerminal = [...counts.keys()].some(isTerminalOrHonorKey) || pairOk;
    // chanta requires terminals/honors but NOT all-terminals (that would be junchan) — simplified: allow if pairOk && meldsOk && has at least one honor OR mixed
    if (pairOk && meldsOk && hasHonorOrTerminal) {
      // exclude if ALL tiles are terminals/honors without a simple (still award chanta for tea parlor)
      const hasSimple = [...counts.keys()].some((k) => {
        const suit = Math.floor(k / 10);
        const rank = k % 10;
        return suit <= 2 && rank >= 2 && rank <= 8;
      });
      // 纯全带幺九 if no honors and all terminal; 混全 if has honor or simple mixed into terminal melds
      if (!hasSimple) {
        // 纯全带幺九 (junchan) — closed 3 / open 2; treat as chanta upgrade
        extra.push({ name: '纯全带幺九', han: closed ? 3 : 2 });
      } else {
        extra.push({ name: '混全带幺九', han: closed ? 2 : 1 });
      }
    }
  }

  return extra;
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
  uraCount = 0,
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

  // play9fin1a: 立直/一发/门清自摸 — 保证番结算非空
  if (riichi && closed) yaku.push({ name: '立直', han: 1 });
  if (ippatsu && riichi && closed) yaku.push({ name: '一发', han: 1 });
  if (isTsumo && closed) yaku.push({ name: '门前清自摸和', han: 1 });

  // 断幺九
  if (full.every(isSimple) && (melds.length === 0 || melds.every((m) => {
    const tiles = m.tiles || [];
    if (tiles.length) return tiles.every(isSimple);
    return m.suit != null && m.suit <= 2 && m.rank >= 2 && m.rank <= 8;
  }))) {
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

  // 简化平和：门清全顺子+两面听近似 — 无字牌刻/杠且非七对时给平和
  if (closed && !sevenPairs && full.every((t) => t.suit <= 2)) {
    const hasTerminalHonorTriplet = [...counts.entries()].some(([k, c]) => {
      const suit = Math.floor(k / 10);
      const rank = k % 10;
      return c >= 3 && (suit >= 3 || rank === 1 || rank === 9);
    });
    if (!hasTerminalHonorTriplet && !yaku.some((y) => y.name === '平和')) {
      // 仅当尚无其它非宝牌役时也允许与立直并存
      yaku.push({ name: '平和', han: 1 });
    }
  }

  // play9fin4c: rarer yaku (三色同顺/一气通贯/混全带幺九/对对和/清一色/混一色)
  {
    const rarer = detectRarerYaku({ counts, closed, sevenPairs, melds, full });
    for (const y of rarer) {
      if (!yaku.some((e) => e.name === y.name)) yaku.push(y);
    }
  }

  if (doraCount > 0) yaku.push({ name: '宝牌', han: doraCount });
  if (uraCount > 0) yaku.push({ name: '里宝牌', han: uraCount });

  // 至少要有非宝牌役才能和；若仅宝牌则拒和；门清无役则补平和
  const nonDora = yaku.filter((y) => y.name !== '宝牌' && y.name !== '里宝牌');
  if (nonDora.length === 0) {
    if (doraCount + uraCount > 0 && closed) {
      return { yaku: [], han: 0, fu: 0 };
    }
    if (closed) yaku.push({ name: '平和', han: 1 });
    else return { yaku: [], han: 0, fu: 0 };
  }

  // play9fin1c: never return empty yaku on a winning hand — fallback 门前清自摸/荣和
  if (yaku.length === 0) {
    if (closed && isTsumo) yaku.push({ name: '门前清自摸和', han: 1 });
    else if (closed) yaku.push({ name: '平和', han: 1 });
    else yaku.push({ name: '役牌', han: 1 });
  }

  const han = yaku.reduce((s, y) => s + y.han, 0);
  const fu = estimateFu({
    sevenPairs,
    isTsumo,
    closed,
    melds,
    pinfu: yaku.some((y) => y.name === '平和'),
  });
  return { yaku, han, fu, sevenPairs };
}

/** play9fin1c: simplified but non-flat fu (七对25 / 门清荣和30 / 自摸+2 / 平和自摸20) */
export function estimateFu({
  sevenPairs = false,
  isTsumo = false,
  closed = true,
  melds = [],
  pinfu = false,
} = {}) {
  if (sevenPairs) return 25;
  if (pinfu && isTsumo && closed) return 20;
  let fu = 20;
  if (closed && !isTsumo) fu = 30; // 门清荣和
  if (isTsumo) fu += 2;
  // open minkou / ankou rough bump
  for (const m of melds) {
    const type = m.type || m.kind;
    if (type === 'peng' || type === 'pon') fu += 2;
    if (type === 'gang' || type === 'kan' || type === 'ankan') fu += m.concealed || m.closed ? 16 : 8;
  }
  fu = Math.ceil(fu / 10) * 10;
  return Math.max(20, Math.min(110, fu));
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
    riichiDiscardIndex: [-1, -1, -1, -1],
    riichiSticks: 0,
    ippatsu: [false, false, false, false],
    _pendingRiichi: false,
    callOptions: null,
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
      canRiichi: (state.canRiichi || state._pendingRiichi) && state.current === 0 && !state.riichi[0],
      pendingRiichi: !!state._pendingRiichi && state.current === 0,
      canRon: state.canRon && state.claimSeat === 0,
      callOptions: state.phase === 'call' ? state.callOptions : null,
      ippatsu: state.ippatsu.slice(),
      riichiDiscardIndex: state.riichiDiscardIndex.slice(),
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
      doraCount,
      uraCount,
      ippatsu: state.ippatsu[seat],
    });
    // play9fin1c: settle yaku list must never be empty; always expose fu/points
    if (!ev.yaku.length) {
      if (state.riichi[seat]) ev.yaku.push({ name: '立直', han: 1 });
      if (kind === 'tsumo' && state.melds[seat].length === 0) {
        ev.yaku.push({ name: '门前清自摸和', han: 1 });
      } else if (!ev.yaku.length) {
        ev.yaku.push({ name: kind === 'tsumo' ? '自摸' : '荣和', han: 1 });
      }
      if (state.ippatsu[seat] && state.riichi[seat]) {
        if (!ev.yaku.some((y) => y.name === '一发')) ev.yaku.push({ name: '一发', han: 1 });
      }
      if (doraCount > 0 && !ev.yaku.some((y) => y.name === '宝牌')) {
        ev.yaku.push({ name: '宝牌', han: doraCount });
      }
      if (uraCount > 0 && !ev.yaku.some((y) => y.name === '里宝牌')) {
        ev.yaku.push({ name: '里宝牌', han: uraCount });
      }
      ev.han = ev.yaku.reduce((s, y) => s + y.han, 0);
      ev.fu = estimateFu({
        sevenPairs: !!ev.sevenPairs,
        isTsumo: kind === 'tsumo',
        closed: state.melds[seat].length === 0,
        melds: state.melds[seat],
        pinfu: ev.yaku.some((y) => y.name === '平和'),
      });
    }
    if (!ev.fu) {
      ev.fu = estimateFu({
        sevenPairs: !!ev.sevenPairs,
        isTsumo: kind === 'tsumo',
        closed: state.melds[seat].length === 0,
        melds: state.melds[seat],
        pinfu: ev.yaku.some((y) => y.name === '平和'),
      });
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
    if (!ev.yaku?.length || !ev.han) {
      throw new Error('empty_settle_forbidden');
    }
    state.settle = {
      kind,
      title: kind === 'tsumo' ? '自摸' : '荣和',
      yaku: ev.yaku,
      han: ev.han,
      fu: ev.fu || 30,
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
    state.riichiDiscardIndex = [-1, -1, -1, -1];
    state.ippatsu = [false, false, false, false];
    state._pendingRiichi = false;
    state.callOptions = null;
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

    let justDeclared = false;
    if (riichiDeclare || (state._pendingRiichi && seat === state.current)) {
      if (!state.canRiichi && !state._pendingRiichi) return { ok: false, reason: 'no_riichi' };
      const left = hand.slice(0, idx).concat(hand.slice(idx + 1));
      if (!isTenpai(left, 0)) return { ok: false, reason: 'not_tenpai' };
      state.riichi[seat] = true;
      state.ippatsu[seat] = true;
      state.scores[seat] -= 1000;
      state.riichiSticks += 1;
      state._pendingRiichi = false;
      justDeclared = true;
    } else if (state.riichi[seat]) {
      // 立直后只能模切
      const drawn = state.drawn;
      if (!drawn || tileId !== drawn.id) return { ok: false, reason: 'riichi_moqie' };
    }

    const [tile] = hand.splice(idx, 1);
    state.rivers[seat].push(tile);
    if (justDeclared) state.riichiDiscardIndex[seat] = state.rivers[seat].length - 1;
    state.lastDiscard = tile;
    state.drawn = null;
    state.canTsumo = false;
    state.canRiichi = false;
    state.callOptions = null;
    // 他人打出打断一发
    for (let i = 0; i < 4; i++) {
      if (i !== seat) state.ippatsu[i] = false;
    }

    // 检查荣和 / 吃碰杠
    state.canRon = false;
    state.claimSeat = -1;
    state.callOptions = null;
    for (let i = 1; i < 4; i++) {
      if (i === seat) continue;
      if (state.riichi[i]) continue; // 立直后不鸣牌
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
          applyWin({ seat: i, kind: 'ron', fromSeat: seat, winTile: tile });
          return { ok: true, snap: snapshot() };
        }
      }
      // AI 简化：有碰就碰（非立直）
      const n = state.hands[i].filter((t) => sameTile(t, tile)).length;
      if (n >= 2 && !state.riichi[i] && Math.random() > 0.55) {
        doRiichiPeng(i, tile, n >= 3 && Math.random() > 0.7);
        return { ok: true, snap: snapshot() };
      }
    }

    // 玩家 call：荣 / 吃 / 碰 / 杠
    if (seat !== 0) {
      const opts = { canRon: false, canChi: false, canPeng: false, canGang: false, chiOptions: [] };
      if (canWinHand([...state.hands[0], tile], state.melds[0].length)) {
        const doraCount = countDoraInHand([...state.hands[0], tile], liveDoraTiles());
        const ev = evaluateYaku({
          hand: state.hands[0],
          winTile: tile,
          melds: state.melds[0],
          riichi: state.riichi[0],
          isTsumo: false,
          seatWind: seatWind(0),
          roundWind: state.roundWind,
          doraCount,
          ippatsu: state.ippatsu[0],
        });
        if (ev.han > 0) {
          opts.canRon = true;
          state.canRon = true;
          state.claimSeat = 0;
        }
      }
      if (!state.riichi[0]) {
        const n = state.hands[0].filter((t) => sameTile(t, tile)).length;
        opts.canPeng = n >= 2;
        opts.canGang = n >= 3;
        if (((seat + 1) % 4) === 0) {
          const chiOpts = findRiichiChiOptions(state.hands[0], tile);
          opts.canChi = chiOpts.length > 0;
          opts.chiOptions = chiOpts;
        }
      }
      if (opts.canRon || opts.canChi || opts.canPeng || opts.canGang) {
        state.callOptions = opts;
        state.phase = 'call';
        return { ok: true, snap: snapshot(), awaitCall: true };
      }
    }

    const next = (seat + 1) % 4;
    drawFor(next);
    return { ok: true, snap: snapshot() };
  }

  function doRiichiPeng(seat, tile, asGang = false) {
    const need = asGang ? 3 : 2;
    const hand = state.hands[seat];
    const keep = [];
    let removed = 0;
    for (const c of hand) {
      if (removed < need && sameTile(c, tile)) { removed += 1; continue; }
      keep.push(c);
    }
    if (removed < need) return { ok: false, reason: asGang ? 'no_gang' : 'no_peng' };
    state.hands[seat] = sortRiichiHand(keep);
    // remove from river
    const riv = state.rivers[state.current];
    if (riv?.length && sameTile(riv[riv.length - 1], tile)) riv.pop();
    state.melds[seat].push({
      type: asGang ? 'gang' : 'peng',
      tile,
      suit: tile.suit,
      rank: tile.rank,
      open: true,
      from: state.current,
    });
    state.ippatsu = [false, false, false, false];
    state.lastDiscard = null;
    state.callOptions = null;
    state.canRon = false;
    state.current = seat;
    if (asGang) {
      drawFor(seat);
    } else {
      state.phase = 'discard';
      state.drawn = null;
      refreshFlags(seat);
    }
    return { ok: true, deducted: need };
  }

  function doRiichiChi(seat, tile) {
    const opts = findRiichiChiOptions(state.hands[seat], tile);
    const opt = opts[0];
    if (!opt) return { ok: false, reason: 'no_chi' };
    const takeIds = new Set(opt.tiles.map((t) => t.id));
    const before = state.hands[seat].length;
    state.hands[seat] = sortRiichiHand(state.hands[seat].filter((t) => !takeIds.has(t.id)));
    if (state.hands[seat].length !== before - 2) return { ok: false, reason: 'chi_deduct' };
    const riv = state.rivers[state.current];
    if (riv?.length && sameTile(riv[riv.length - 1], tile)) riv.pop();
    state.melds[seat].push({
      type: 'chi',
      tile,
      suit: tile.suit,
      rank: tile.rank,
      ranks: opt.ranks,
      tiles: [...opt.tiles, tile],
      open: true,
      from: state.current,
    });
    state.ippatsu = [false, false, false, false];
    state.lastDiscard = null;
    state.callOptions = null;
    state.canRon = false;
    state.current = seat;
    state.phase = 'discard';
    state.drawn = null;
    refreshFlags(seat);
    return { ok: true, deducted: 2 };
  }

  function declareRiichi() {
    if (state.current !== 0 || state.phase !== 'discard') return { ok: false, reason: 'phase' };
    if (state.riichi[0]) return { ok: false, reason: 'already' };
    if (!state.canRiichi && !state._pendingRiichi) return { ok: false, reason: 'no_riichi' };
    state._pendingRiichi = true;
    return { ok: true, snap: snapshot(), pending: true };
  }

  function humanCall(action) {
    if (state.phase !== 'call' || !state.lastDiscard) return { ok: false, reason: 'no_call' };
    const tile = state.lastDiscard;
    const from = state.current;
    if (action === 'ron' || action === 'hu') {
      return ron();
    }
    if (action === 'chi') {
      if (((from + 1) % 4) !== 0) return { ok: false, reason: 'not_kami' };
      const r = doRiichiChi(0, tile);
      if (!r.ok) return r;
      return { ok: true, snap: snapshot(), chi: true };
    }
    if (action === 'peng' || action === 'gang') {
      const r = doRiichiPeng(0, tile, action === 'gang');
      if (!r.ok) return r;
      return { ok: true, snap: snapshot(), peng: true };
    }
    // pass
    state.canRon = false;
    state.claimSeat = -1;
    state.callOptions = null;
    const next = (from + 1) % 4;
    drawFor(next);
    return { ok: true, snap: snapshot(), pass: true };
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
    return humanCall('pass');
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
    humanCall,
    aiDiscard,
    tsumoAi,
    snapshot,
    debugHand,
    refreshFlags: () => refreshFlags(state.current),
    state,
  };
}

export function modeNameRiichi() {
  return '日麻';
}
