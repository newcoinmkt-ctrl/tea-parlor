/**
 * 德州扑克 Hand History 生成器（PokerStars / PT4 兼容文本）
 *
 * 记录：桌信息、盲注、座位与筹码、发牌、各街行动、Showdown、奖池分配
 */

import { RANK_LABEL, SUIT_SYMBOL, cardText as defaultCardText } from './card.js';

/** PokerStars 花色字母 */
const PS_SUIT = Object.freeze({
  1: 'd', // diamond
  2: 'c', // club
  3: 'h', // heart
  4: 's', // spade
});

const PS_RANK = Object.freeze({
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
});

/**
 * PokerStars 牌面：As, Td, 9c
 * @param {{ rank: number, suit: number }} c
 */
export function psCard(c) {
  if (!c) return '??';
  const r = PS_RANK[c.rank] || String(c.rank);
  const s = PS_SUIT[c.suit] || '?';
  return `${r}${s}`;
}

/**
 * @param {Array<{ rank: number, suit: number }>} cards
 */
export function psCards(cards) {
  return (cards || []).map(psCard).join(' ');
}

/**
 * 座位名：Button / SB / BB / UTG / MP / CO / …
 * @param {number} seat
 * @param {number} buttonSeat
 * @param {number} playerCount
 * @param {number} sbSeat
 * @param {number} bbSeat
 */
export function positionLabel(seat, buttonSeat, playerCount, sbSeat, bbSeat) {
  if (seat === buttonSeat) return 'Button';
  if (seat === sbSeat) return 'Small Blind';
  if (seat === bbSeat) return 'Big Blind';
  // 距 BB 的顺时针
  const n = playerCount;
  const dist = (seat - bbSeat + n) % n;
  if (dist === 1) return 'UTG';
  if (dist === 2 && n >= 6) return 'UTG+1';
  if (dist === n - 2 && n >= 6) return 'Cutoff';
  if (dist === n - 1) return 'Cutoff';
  return `Seat ${seat + 1}`;
}

/**
 * @typedef {object} HHPlayer
 * @property {string} name
 * @property {number} seat              0-based
 * @property {number} chips             开局筹码
 * @property {boolean} [satOut]
 */

/**
 * @typedef {object} HHAction
 * @property {string} street            preflop|flop|turn|river|showdown
 * @property {string} player            玩家名
 * @property {string} action            posts|folds|checks|calls|bets|raises|all-in|shows|collected|dealt
 * @property {number} [amount]
 * @property {number} [raiseTo]
 * @property {boolean} [isAllIn]
 * @property {string} [cards]           shows 时 "As Kd"
 */

/**
 * @typedef {object} HHInput
 * @property {string|number} handId
 * @property {string} [tableName]
 * @property {string} [gameType]        e.g. "Hold'em No Limit"
 * @property {number} smallBlind
 * @property {number} bigBlind
 * @property {string} [currency]        $ or empty for chips
 * @property {Date|string|number} [timestamp]
 * @property {number} buttonSeat        0-based
 * @property {number} [sbSeat]
 * @property {number} [bbSeat]
 * @property {HHPlayer[]} players
 * @property {Record<string, Array>} [holeCards]  name → cards（仅 showdown 写入）
 * @property {Array} [board]
 * @property {HHAction[]} actions
 * @property {Array<{ player: string, amount: number }>} [pots]
 * @property {number} [totalPot]
 * @property {number} [rake]
 * @property {string} [publicHash]      Provably Fair 可选
 * @property {string} [publicCode]
 */

/**
 * 生成 PokerStars 风格 Hand History 文本
 * @param {HHInput} input
 * @returns {string}
 */
export function formatPokerStarsHandHistory(input) {
  const cur = input.currency === '' || input.currency == null ? '' : (input.currency || '$');
  const fmt = (n) => {
    const v = Number(n) || 0;
    if (!cur) return String(v);
    return `${cur}${v}`;
  };

  const handId = input.handId ?? Date.now();
  const table = input.tableName || 'Tea Parlor';
  const game = input.gameType || "Hold'em No Limit";
  const ts = formatPsDate(input.timestamp || new Date());
  const n = (input.players || []).length;
  const buttonSeat = input.buttonSeat ?? 0;
  const sbSeat = input.sbSeat != null
    ? input.sbSeat
    : (n === 2 ? buttonSeat : (buttonSeat + 1) % n);
  const bbSeat = input.bbSeat != null
    ? input.bbSeat
    : (n === 2 ? (buttonSeat + 1) % n : (sbSeat + 1) % n);

  const lines = [];

  // Header
  lines.push(
    `PokerStars Hand #${handId}:  ${game} (${fmt(input.smallBlind)}/${fmt(input.bigBlind)}) - ${ts}`
  );
  lines.push(
    `Table '${table}' ${n}-max Seat #${buttonSeat + 1} is the button`
  );

  // Seats
  const sorted = (input.players || []).slice().sort((a, b) => a.seat - b.seat);
  for (const p of sorted) {
    if (p.satOut) {
      lines.push(`Seat ${p.seat + 1}: ${p.name} (${fmt(p.chips)} in chips) is sitting out`);
    } else {
      lines.push(`Seat ${p.seat + 1}: ${p.name} (${fmt(p.chips)} in chips)`);
    }
  }

  // Blinds from actions or synthetic
  const actions = input.actions || [];
  const posts = actions.filter((a) => a.action === 'posts' || a.action === 'post');
  if (posts.length) {
    for (const a of posts) {
      const kind = a.amount === input.smallBlind ? 'small blind' : 'big blind';
      const allIn = a.isAllIn ? ' and is all-in' : '';
      lines.push(`${a.player}: posts ${kind} ${fmt(a.amount)}${allIn}`);
    }
  } else {
    const sbP = sorted.find((p) => p.seat === sbSeat);
    const bbP = sorted.find((p) => p.seat === bbSeat);
    if (sbP) lines.push(`${sbP.name}: posts small blind ${fmt(input.smallBlind)}`);
    if (bbP) lines.push(`${bbP.name}: posts big blind ${fmt(input.bigBlind)}`);
  }

  lines.push('*** HOLE CARDS ***');

  // Dealt to hero if provided
  const hero = input.hero || sorted[0]?.name;
  if (hero && input.holeCards?.[hero]) {
    lines.push(`Dealt to ${hero} [${psCards(input.holeCards[hero])}]`);
  }

  // Streets
  const streetOrder = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const streetTitle = {
    preflop: null, // already HOLE CARDS
    flop: '*** FLOP ***',
    turn: '*** TURN ***',
    river: '*** RIVER ***',
    showdown: '*** SHOW DOWN ***',
  };

  let boardShown = 0;
  const board = input.board || [];

  for (const st of streetOrder) {
    const streetActs = actions.filter(
      (a) => String(a.street || 'preflop').toLowerCase() === st
        && a.action !== 'posts'
        && a.action !== 'post'
        && a.action !== 'dealt'
    );

    if (st === 'flop' && board.length >= 3) {
      lines.push(`${streetTitle.flop} [${psCards(board.slice(0, 3))}]`);
      boardShown = 3;
    } else if (st === 'turn' && board.length >= 4) {
      lines.push(
        `${streetTitle.turn} [${psCards(board.slice(0, 3))}] [${psCard(board[3])}]`
      );
      boardShown = 4;
    } else if (st === 'river' && board.length >= 5) {
      lines.push(
        `${streetTitle.river} [${psCards(board.slice(0, 4))}] [${psCard(board[4])}]`
      );
      boardShown = 5;
    } else if (st === 'showdown' && streetActs.length) {
      lines.push(streetTitle.showdown);
    }

    if (st === 'preflop' && !streetActs.length) {
      // still ok
    }

    for (const a of streetActs) {
      lines.push(formatActionLine(a, fmt));
    }
  }

  // SUMMARY
  lines.push('*** SUMMARY ***');
  const totalPot = input.totalPot != null
    ? input.totalPot
    : (input.pots || []).reduce((s, p) => s + (p.amount || 0), 0);
  const rake = input.rake || 0;
  lines.push(`Total pot ${fmt(totalPot)} | Rake ${fmt(rake)}`);
  if (board.length) {
    lines.push(`Board [${psCards(board)}]`);
  }

  for (const p of sorted) {
    const pos = positionLabel(p.seat, buttonSeat, n, sbSeat, bbSeat);
    let line = `Seat ${p.seat + 1}: ${p.name} (${pos})`;
    const collected = (input.pots || []).filter((x) => x.player === p.name);
    const won = collected.reduce((s, x) => s + (x.amount || 0), 0);
    const showed = input.holeCards?.[p.name];
    if (showed) {
      line += ` showed [${psCards(showed)}]`;
    }
    if (won > 0) {
      line += ` and won (${fmt(won)})`;
    } else if (actions.some((a) => a.player === p.name && a.action === 'folds')) {
      line += ' folded';
    }
    lines.push(line);
  }

  // Provably Fair footer (non-standard comment)
  if (input.publicHash || input.publicCode) {
    lines.push('');
    lines.push(
      `# Provably Fair: code=${input.publicCode || '-'} hash=${input.publicHash || '-'}`
    );
  }

  return `${lines.join('\n')}\n`;
}

function formatActionLine(a, fmt) {
  const name = a.player || 'Unknown';
  const act = String(a.action || '').toLowerCase();
  const allIn = a.isAllIn ? ' and is all-in' : '';

  switch (act) {
    case 'folds':
    case 'fold':
      return `${name}: folds`;
    case 'checks':
    case 'check':
      return `${name}: checks`;
    case 'calls':
    case 'call':
      return `${name}: calls ${fmt(a.amount)}${allIn}`;
    case 'bets':
    case 'bet':
      return `${name}: bets ${fmt(a.amount)}${allIn}`;
    case 'raises':
    case 'raise':
      return `${name}: raises ${fmt(a.amount)} to ${fmt(a.raiseTo ?? a.amount)}${allIn}`;
    case 'all-in':
    case 'all_in':
    case 'allin':
      return `${name}: bets ${fmt(a.amount)} and is all-in`;
    case 'shows':
    case 'show':
      return `${name}: shows [${a.cards || ''}]`;
    case 'mucks':
      return `${name}: mucks hand`;
    case 'collected':
    case 'collect':
      return `${name} collected ${fmt(a.amount)} from pot`;
    case 'posts':
    case 'post':
      return `${name}: posts ${a.note || 'blind'} ${fmt(a.amount)}${allIn}`;
    default:
      return `${name}: ${act}${a.amount != null ? ` ${fmt(a.amount)}` : ''}`;
  }
}

function formatPsDate(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const pad = (n) => String(n).padStart(2, '0');
  // 2024/03/15 12:34:56 ET
  return (
    `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ET`
  );
}

/**
 * 从状态机/引擎快照 + 行动日志构建 HH 输入
 *
 * @param {object} opts
 * @param {object} opts.snapshot     getSnapshot()
 * @param {Array}  opts.actionLog    标准化行动
 * @param {object} [opts.meta]
 */
export function buildHandHistoryInputFromSnapshot(opts) {
  const snap = opts.snapshot || {};
  const meta = opts.meta || {};
  const players = (snap.players || []).map((p) => ({
    name: p.name || p.id,
    seat: p.seat,
    chips: (p.chips || 0) + (p.betTotal || 0), // 近似开局
  }));

  const nameById = Object.fromEntries(
    (snap.players || []).map((p) => [p.id, p.name || p.id])
  );

  const actions = (opts.actionLog || []).map((a) => ({
    street: a.street || a.phase || 'preflop',
    player: nameById[a.playerId] || a.player || a.playerId,
    action: mapEngineAction(a.type || a.action),
    amount: a.amount,
    raiseTo: a.raiseTo,
    isAllIn: a.type === 'all_in' || a.isAllIn,
    cards: a.cards,
  }));

  const holeCards = {};
  if (snap.holes) {
    for (const [id, cards] of Object.entries(snap.holes)) {
      if (cards) holeCards[nameById[id] || id] = cards;
    }
  }

  return {
    handId: meta.handId || snap.handId || Date.now(),
    tableName: meta.tableName || 'Tea Parlor',
    smallBlind: snap.smallBlind || meta.smallBlind || 5,
    bigBlind: snap.bigBlind || meta.bigBlind || 10,
    currency: meta.currency ?? '',
    timestamp: meta.timestamp || new Date(),
    buttonSeat: snap.buttonSeat ?? 0,
    sbSeat: snap.sbSeat,
    bbSeat: snap.bbSeat,
    players,
    holeCards,
    board: snap.board || [],
    actions,
    pots: (snap.settlement?.awards
      ? Object.entries(snap.settlement.awards)
        .filter(([, v]) => v > 0)
        .map(([id, amount]) => ({ player: nameById[id] || id, amount }))
      : meta.pots) || [],
    totalPot: snap.pot || meta.totalPot,
    rake: meta.rake || 0,
    publicHash: meta.publicHash,
    publicCode: meta.publicCode,
    hero: meta.hero || players[0]?.name,
  };
}

function mapEngineAction(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('fold')) return 'folds';
  if (t.includes('check')) return 'checks';
  if (t.includes('call')) return 'calls';
  if (t.includes('raise')) return 'raises';
  if (t.includes('bet') && !t.includes('all')) return 'bets';
  if (t.includes('all')) return 'all-in';
  if (t.includes('post_sb') || t === 'post_sb') return 'posts';
  if (t.includes('post_bb') || t === 'post_bb') return 'posts';
  if (t.includes('show')) return 'shows';
  if (t.includes('collect')) return 'collected';
  return t;
}

/**
 * 便捷：直接输出字符串
 */
export function generateHandHistory(input) {
  return formatPokerStarsHandHistory(input);
}
