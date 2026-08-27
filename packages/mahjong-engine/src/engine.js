/**
 * 四川麻将核心引擎 · 血战到底 / 血流成河
 *
 * 阶段：
 *   exchange → dingque → playing → finished
 *
 * 血战：胡牌者退场（status=hu_out），最多 3 家胡或荒庄
 * 血流：胡牌者留场（status=hu_stay），可多次胡
 *
 * 主 API：
 *   createSichuanTable(options)
 *   exchangeCards / chooseMissingSuit（re-export）
 *   checkMahjongSettlements(table) — 汇总状态机得分
 */

import {
  createSichuanDeck,
  shuffle,
  sortHand,
  sameTile,
  tileKey,
} from './tiles.js';
import { canHu, isWaitingFor } from './hu.js';
import {
  exchangeCards as doExchange,
  chooseMissingSuit,
  suggestExchangeTiles,
  EXCHANGE_DIR,
} from './exchange.js';
import {
  GangType,
  settleGangImmediate,
  findAnGangCandidates,
  findBuGangCandidates,
} from './gang.js';

export const GameMode = Object.freeze({
  XUEZHAN: 'xuezhan', // 血战到底
  XUELIU: 'xueliu',   // 血流成河
});

export const Phase = Object.freeze({
  EXCHANGE: 'exchange',
  DINGQUE: 'dingque',
  PLAYING: 'playing',
  FINISHED: 'finished',
});

export const PlayerStatus = Object.freeze({
  ACTIVE: 'active',
  HU_OUT: 'hu_out',   // 血战退场
  HU_STAY: 'hu_stay', // 血流留场可再胡
});

/**
 * @param {{
 *   mode?: 'xuezhan'|'xueliu',
 *   baseScore?: number,
 *   dealer?: number,
 *   random?: () => number,
 *   playerNames?: string[],
 * }} [options]
 */
export function createSichuanTable(options = {}) {
  const mode = options.mode === GameMode.XUELIU ? GameMode.XUELIU : GameMode.XUEZHAN;
  const baseScore = options.baseScore ?? 1;
  const random = options.random || Math.random;
  const dealer = options.dealer != null ? options.dealer : Math.floor(random() * 4);

  const deck = shuffle(createSichuanDeck(), random);
  const hands = [[], [], [], []];
  // 各 13 张
  let idx = 0;
  for (let r = 0; r < 13; r++) {
    for (let p = 0; p < 4; p++) {
      hands[p].push(deck[idx++]);
    }
  }
  for (let p = 0; p < 4; p++) hands[p] = sortHand(hands[p]);

  const wall = deck.slice(idx);

  return {
    mode,
    phase: Phase.EXCHANGE,
    baseScore,
    dealer,
    currentPlayer: dealer,
    wall,
    hands,
    melds: [[], [], [], []], // { id, type:'peng'|'gang', suit, rank, open, from? }
    missingSuits: [null, null, null, null],
    status: [
      PlayerStatus.ACTIVE,
      PlayerStatus.ACTIVE,
      PlayerStatus.ACTIVE,
      PlayerStatus.ACTIVE,
    ],
    scores: [0, 0, 0, 0],
    /** 流水：杠分、胡分 */
    ledger: [],
    huOrder: [], // 血战胡牌顺序
    huCount: [0, 0, 0, 0], // 血流可多次
    lastDiscard: null, // { player, tile }
    drawnTile: null,
    playerNames: options.playerNames || ['东', '南', '西', '北'],
    exchangeDone: false,
    dingqueDone: false,
    finishedReason: null,
    _meldSeq: 0,
  };
}

// ─── 换三张 / 定缺 ───────────────────────────────────

/**
 * @param {object} table
 * @param {object[][]} exchangeSets
 * @param {{ direction?: string }} [opts]
 */
export function applyExchange(table, exchangeSets, opts = {}) {
  if (table.phase !== Phase.EXCHANGE) {
    return { ok: false, reason: 'not_exchange_phase', table };
  }
  const r = doExchange(table.hands, exchangeSets, opts);
  if (!r.ok) return { ok: false, reason: r.reason, table };

  table.hands = r.hands;
  table.exchangeDone = true;
  table.phase = Phase.DINGQUE;
  table.ledger.push({
    kind: 'exchange',
    direction: r.direction,
    received: r.received.map((set) => set.map((t) => ({ suit: t.suit, rank: t.rank }))),
  });
  return { ok: true, table, received: r.received, direction: r.direction };
}

/**
 * 设定定缺；四家齐后进入 playing，庄家摸第 14 张
 * @param {object} table
 * @param {number} player
 * @param {number} suit  0/1/2；-1 表示自动推荐
 */
export function applyDingque(table, player, suit) {
  if (table.phase !== Phase.DINGQUE) {
    return { ok: false, reason: 'not_dingque_phase', table };
  }
  if (player < 0 || player > 3) return { ok: false, reason: 'bad_player', table };

  let s = suit;
  if (s === -1 || s == null) s = chooseMissingSuit(table.hands[player]);
  if (s < 0 || s > 2) return { ok: false, reason: 'bad_suit', table };

  table.missingSuits[player] = s;
  if (table.missingSuits.every((x) => x != null)) {
    table.dingqueDone = true;
    table.phase = Phase.PLAYING;
    // 庄家摸牌
    drawFor(table, table.dealer);
  }
  return { ok: true, table, suit: s };
}

/**
 * 批量定缺（测试/AI）
 * @param {object} table
 * @param {(number|null)[]} suits  长度 4，null 自动
 */
export function applyDingqueAll(table, suits = [null, null, null, null]) {
  for (let i = 0; i < 4; i++) {
    if (table.missingSuits[i] != null) continue;
    const r = applyDingque(table, i, suits[i] ?? -1);
    if (!r.ok) return r;
  }
  return { ok: true, table };
}

// ─── 摸打 / 碰杠胡 ───────────────────────────────────

function activePlayers(table) {
  return [0, 1, 2, 3].filter((i) => table.status[i] === PlayerStatus.ACTIVE
    || table.status[i] === PlayerStatus.HU_STAY);
}

function playingPlayers(table) {
  // 仍参与摸打：active；血流 hu_stay 也参与
  if (table.mode === GameMode.XUELIU) {
    return [0, 1, 2, 3].filter(
      (i) => table.status[i] === PlayerStatus.ACTIVE || table.status[i] === PlayerStatus.HU_STAY
    );
  }
  return [0, 1, 2, 3].filter((i) => table.status[i] === PlayerStatus.ACTIVE);
}

function drawFor(table, player) {
  if (table.wall.length === 0) {
    finishTable(table, 'wall_empty');
    return null;
  }
  const t = table.wall.shift();
  table.hands[player] = sortHand([...table.hands[player], t]);
  table.drawnTile = { player, tile: t };
  table.currentPlayer = player;
  return t;
}

/**
 * 打牌
 */
export function discardTile(table, player, tileIdOrTile) {
  if (table.phase !== Phase.PLAYING) return { ok: false, reason: 'not_playing', table };
  if (player !== table.currentPlayer) return { ok: false, reason: 'not_your_turn', table };
  if (table.status[player] === PlayerStatus.HU_OUT) {
    return { ok: false, reason: 'player_out', table };
  }

  const hand = table.hands[player];
  let idx = -1;
  if (typeof tileIdOrTile === 'string') {
    idx = hand.findIndex((t) => t.id === tileIdOrTile);
  } else if (tileIdOrTile && tileIdOrTile.id) {
    idx = hand.findIndex((t) => t.id === tileIdOrTile.id);
  } else if (tileIdOrTile) {
    idx = hand.findIndex((t) => sameTile(t, tileIdOrTile));
  }
  if (idx < 0) return { ok: false, reason: 'tile_not_in_hand', table };

  const tile = hand[idx];
  table.hands[player] = hand.filter((_, i) => i !== idx);
  table.lastDiscard = { player, tile };
  table.drawnTile = null;

  // 检查其他玩家是否可胡/碰/杠（点炮）
  const claims = scanClaims(table, player, tile);

  // 血战/血流：优先结算所有可胡（一炮多响）
  const huClaimants = claims.filter((c) => c.type === 'hu');
  if (huClaimants.length) {
    for (const c of huClaimants) {
      applyHu(table, c.player, {
        fromDiscard: true,
        discarder: player,
        tile,
      });
    }
    if (table.phase === Phase.FINISHED) {
      return { ok: true, table, claims: huClaimants, multiHu: true };
    }
    // 下一手：点炮者下家（仍在场）摸牌
    const next = nextActive(table, player);
    if (next < 0 || table.wall.length === 0) {
      finishTable(table, 'wall_empty');
    } else {
      drawFor(table, next);
    }
    return { ok: true, table, claims: huClaimants, multiHu: huClaimants.length > 1 };
  }

  return { ok: true, table, claims, pendingClaims: claims };
}

/**
 * 碰
 */
export function applyPeng(table, player, tile) {
  if (table.phase !== Phase.PLAYING) return { ok: false, reason: 'not_playing', table };
  const disc = table.lastDiscard;
  if (!disc || !sameTile(disc.tile, tile)) {
    return { ok: false, reason: 'no_matching_discard', table };
  }
  if (disc.player === player) return { ok: false, reason: 'self', table };

  const hand = table.hands[player];
  const matches = hand.filter((t) => sameTile(t, tile));
  if (matches.length < 2) return { ok: false, reason: 'need_two', table };

  const take = matches.slice(0, 2);
  table.hands[player] = hand.filter((t) => !take.includes(t));
  table.melds[player].push({
    id: `m_${++table._meldSeq}`,
    type: 'peng',
    suit: tile.suit,
    rank: tile.rank,
    open: true,
    from: disc.player,
  });
  table.lastDiscard = null;
  table.currentPlayer = player;
  table.drawnTile = null;
  // 碰后须打牌（不摸）
  return { ok: true, table };
}

/**
 * 杠：type = ming_zhi | ming_bu | an
 */
export function applyGang(table, player, opts = {}) {
  if (table.phase !== Phase.PLAYING) return { ok: false, reason: 'not_playing', table };
  const type = opts.type;
  const tile = opts.tile;

  if (type === GangType.MING_ZHI) {
    const disc = table.lastDiscard;
    if (!disc || !sameTile(disc.tile, tile)) {
      return { ok: false, reason: 'no_discard_for_gang', table };
    }
    const hand = table.hands[player];
    const matches = hand.filter((t) => sameTile(t, tile));
    if (matches.length < 3) return { ok: false, reason: 'need_three', table };
    const take = matches.slice(0, 3);
    table.hands[player] = hand.filter((t) => !take.includes(t));
    table.melds[player].push({
      id: `m_${++table._meldSeq}`,
      type: 'gang',
      gangType: GangType.MING_ZHI,
      suit: tile.suit,
      rank: tile.rank,
      open: true,
      from: disc.player,
    });
    table.lastDiscard = null;
    const pay = settleGangImmediate({
      type: GangType.MING_ZHI,
      ganger: player,
      discarder: disc.player,
      baseScore: table.baseScore,
      activePlayers: playingPlayers(table),
    });
    applyScoreDeltas(table, pay.deltas, pay.records);
    // 杠后补牌
    table.currentPlayer = player;
    drawFor(table, player);
    return { ok: true, table, gangPay: pay };
  }

  if (type === GangType.AN) {
    const cands = findAnGangCandidates(table.hands[player]);
    const cand = tile
      ? cands.find((c) => c.suit === tile.suit && c.rank === tile.rank)
      : cands[0];
    if (!cand) return { ok: false, reason: 'no_an_gang', table };
    const takeIds = new Set(cand.tiles.map((t) => t.id));
    table.hands[player] = table.hands[player].filter((t) => !takeIds.has(t.id));
    table.melds[player].push({
      id: `m_${++table._meldSeq}`,
      type: 'gang',
      gangType: GangType.AN,
      suit: cand.suit,
      rank: cand.rank,
      open: false,
    });
    const pay = settleGangImmediate({
      type: GangType.AN,
      ganger: player,
      baseScore: table.baseScore,
      activePlayers: playingPlayers(table),
    });
    applyScoreDeltas(table, pay.deltas, pay.records);
    drawFor(table, player);
    return { ok: true, table, gangPay: pay };
  }

  if (type === GangType.MING_BU) {
    const pengs = table.melds[player].filter((m) => m.type === 'peng');
    const cands = findBuGangCandidates(table.hands[player], pengs);
    const cand = tile
      ? cands.find((c) => c.suit === tile.suit && c.rank === tile.rank)
      : cands[0];
    if (!cand) return { ok: false, reason: 'no_bu_gang', table };
    table.hands[player] = table.hands[player].filter((t) => t.id !== cand.tile.id);
    const meld = table.melds[player].find(
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
      baseScore: table.baseScore,
      activePlayers: playingPlayers(table),
    });
    applyScoreDeltas(table, pay.deltas, pay.records);
    drawFor(table, player);
    return { ok: true, table, gangPay: pay };
  }

  return { ok: false, reason: 'unknown_gang_type', table };
}

/**
 * 自摸胡 / 点炮胡
 */
export function applyHu(table, player, opts = {}) {
  if (table.phase !== Phase.PLAYING) return { ok: false, reason: 'not_playing', table };
  if (table.status[player] === PlayerStatus.HU_OUT) {
    return { ok: false, reason: 'already_out', table };
  }

  const missing = table.missingSuits[player];
  if (missing == null) return { ok: false, reason: 'no_dingque', table };

  const meldsCount = table.melds[player].length;
  let hand = table.hands[player];
  let tile = opts.tile;

  if (opts.fromDiscard) {
    tile = opts.tile || table.lastDiscard?.tile;
    if (!tile) return { ok: false, reason: 'no_hu_tile', table };
    hand = [...hand, tile];
  }

  if (!canHu(hand, meldsCount, missing)) {
    return { ok: false, reason: 'cannot_hu', table };
  }

  // 计分：自摸三家付；点炮点炮者付；血流可多次
  const isZimo = !opts.fromDiscard;
  const fan = opts.fan ?? 1; // 简化倍数
  const base = table.baseScore * fan * (table.mode === GameMode.XUELIU && table.huCount[player] > 0 ? 2 : 1);
  const deltas = [0, 0, 0, 0];
  const records = [];

  if (isZimo) {
    const payers = playingPlayers(table).filter((i) => i !== player);
    for (const i of payers) {
      const amt = base * 2; // 自摸双倍（简化）
      deltas[i] -= amt;
      deltas[player] += amt;
      records.push({
        kind: 'hu',
        mode: table.mode,
        zimo: true,
        from: i,
        to: player,
        amount: amt,
        order: table.huOrder.length + 1,
      });
    }
  } else {
    const discarder = opts.discarder;
    const amt = base;
    deltas[discarder] -= amt;
    deltas[player] += amt;
    records.push({
      kind: 'hu',
      mode: table.mode,
      zimo: false,
      from: discarder,
      to: player,
      amount: amt,
      order: table.huOrder.length + 1,
    });
    // 点炮牌从弃牌区进入（手牌展示可含）
    if (table.lastDiscard) table.lastDiscard = null;
  }

  applyScoreDeltas(table, deltas, records);
  table.huCount[player] += 1;
  if (!table.huOrder.includes(player)) table.huOrder.push(player);

  if (table.mode === GameMode.XUEZHAN) {
    table.status[player] = PlayerStatus.HU_OUT;
    // 手牌锁定
    table.hands[player] = sortHand(hand);
  } else {
    // 血流：盖牌留场，可继续摸打；手牌保持听牌型（去掉胡的那张的简化：保留 hand 去最后摸）
    table.status[player] = PlayerStatus.HU_STAY;
    table.hands[player] = sortHand(
      isZimo ? hand.slice(0, -1) : table.hands[player]
    );
  }

  // 结束条件
  const huPlayers = table.huOrder.length;
  if (table.mode === GameMode.XUEZHAN && huPlayers >= 3) {
    finishTable(table, 'three_hu');
  } else if (playingPlayers(table).length <= 1 && table.mode === GameMode.XUEZHAN) {
    finishTable(table, 'one_left');
  }

  return { ok: true, table, deltas, records };
}

function scanClaims(table, discarder, tile) {
  const claims = [];
  for (const i of playingPlayers(table)) {
    if (i === discarder) continue;
    const meldsCount = table.melds[i].length;
    const missing = table.missingSuits[i];
    // 胡
    if (canHu([...table.hands[i], tile], meldsCount, missing)) {
      // 血流已胡也可再胡
      if (table.status[i] !== PlayerStatus.HU_OUT) {
        claims.push({ type: 'hu', player: i });
      }
    }
    // 碰/杠：血战/血流不能碰杠定缺花色
    const dingque = missing != null && missing >= 0 && missing <= 2 && tile.suit === missing;
    const n = table.hands[i].filter((t) => sameTile(t, tile)).length;
    if (!dingque && n >= 2 && table.status[i] === PlayerStatus.ACTIVE) {
      claims.push({ type: 'peng', player: i });
    }
    // 直杠
    if (!dingque && n >= 3 && table.status[i] === PlayerStatus.ACTIVE) {
      claims.push({ type: 'gang', player: i, gangType: GangType.MING_ZHI });
    }
  }
  return claims;
}

function nextActive(table, from) {
  for (let s = 1; s <= 4; s++) {
    const i = (from + s) % 4;
    if (table.mode === GameMode.XUEZHAN) {
      if (table.status[i] === PlayerStatus.ACTIVE) return i;
    } else if (table.status[i] !== PlayerStatus.HU_OUT) {
      return i;
    }
  }
  return -1;
}

/**
 * 过（无人碰杠胡）→ 下家摸牌
 */
export function passClaimsAndNext(table) {
  if (table.phase !== Phase.PLAYING) return { ok: false, reason: 'not_playing', table };
  const disc = table.lastDiscard;
  if (!disc) return { ok: false, reason: 'no_discard', table };
  const next = nextActive(table, disc.player);
  if (next < 0 || table.wall.length === 0) {
    finishTable(table, 'wall_empty');
    return { ok: true, table };
  }
  drawFor(table, next);
  return { ok: true, table };
}

function applyScoreDeltas(table, deltas, records) {
  for (let i = 0; i < 4; i++) {
    table.scores[i] += deltas[i] || 0;
  }
  for (const r of records) {
    table.ledger.push({ ...r, ts: table.ledger.length });
  }
}

function finishTable(table, reason) {
  table.phase = Phase.FINISHED;
  table.finishedReason = reason;
  table.ledger.push({ kind: 'finish', reason });
}

// ─── 结算状态机 ─────────────────────────────────────

/**
 * 汇总局内所有结算（杠分实时已入 scores；此处做校验与报告）
 *
 * @param {object} table
 * @returns {{
 *   mode: string,
 *   phase: string,
 *   scores: number[],
 *   huOrder: number[],
 *   huCount: number[],
 *   gangTotal: number[],
 *   huTotal: number[],
 *   ledger: object[],
 *   active: number[],
 *   finished: boolean,
 *   reason: string|null,
 * }}
 */
export function checkMahjongSettlements(table) {
  const gangTotal = [0, 0, 0, 0];
  const huTotal = [0, 0, 0, 0];

  for (const row of table.ledger || []) {
    if (row.kind === 'gang' && row.to != null && row.amount != null) {
      gangTotal[row.to] += row.amount;
      if (row.from != null) gangTotal[row.from] -= row.amount;
    }
    if (row.kind === 'hu' && row.to != null && row.amount != null) {
      huTotal[row.to] += row.amount;
      if (row.from != null) huTotal[row.from] -= row.amount;
    }
  }

  // scores 应 ≈ gangTotal + huTotal（浮点忽略）
  const reconstructed = [0, 1, 2, 3].map((i) => gangTotal[i] + huTotal[i]);

  return {
    mode: table.mode,
    phase: table.phase,
    scores: table.scores.slice(),
    reconstructed,
    huOrder: table.huOrder.slice(),
    huCount: table.huCount.slice(),
    gangTotal,
    huTotal,
    ledger: table.ledger.slice(),
    active: playingPlayers(table),
    status: table.status.slice(),
    missingSuits: table.missingSuits.slice(),
    finished: table.phase === Phase.FINISHED,
    reason: table.finishedReason,
    wallLeft: table.wall?.length ?? 0,
  };
}

/**
 * 工具：当前是否可自摸
 */
export function canPlayerHuNow(table, player) {
  if (table.phase !== Phase.PLAYING) return false;
  if (table.status[player] === PlayerStatus.HU_OUT) return false;
  const meldsCount = table.melds[player].length;
  return canHu(table.hands[player], meldsCount, table.missingSuits[player]);
}

export {
  chooseMissingSuit,
  suggestExchangeTiles,
  doExchange as exchangeCards,
  EXCHANGE_DIR,
  GangType,
  findAnGangCandidates,
  findBuGangCandidates,
  canHu,
  isWaitingFor,
};
