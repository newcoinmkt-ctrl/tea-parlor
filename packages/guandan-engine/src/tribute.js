/**
 * 掼蛋开局前「进贡 / 退贡 / 抗贡」状态机
 *
 * WaitingTribute → CheckingAntiTribute → ExecutingTribute → ReturningTribute → GameStart
 */

import { isWild, isJoker } from './card.js';
import { rankStrength } from './hand-types.js';

/** @enum {string} */
export const TributePhase = Object.freeze({
  WAITING: 'WaitingTribute',
  CHECKING_ANTI: 'CheckingAntiTribute',
  EXECUTING: 'ExecutingTribute',
  RETURNING: 'ReturningTribute',
  GAME_START: 'GameStart',
});

/** @enum {string} */
export const TributeKind = Object.freeze({
  NONE: 'none',
  SINGLE: 'single',   // 单下：末游 → 头游
  DOUBLE: 'double',   // 双下：末游→头游、三游→二游
});

/**
 * 座位 0+2 一队，1+3 一队（标准 2v2）
 * @param {number} seat
 */
export function teammateOf(seat) {
  return (Number(seat) + 2) % 4;
}

/**
 * @param {number} a
 * @param {number} b
 */
export function sameTeam(a, b) {
  return teammateOf(a) === Number(b) || Number(a) === Number(b);
}

/**
 * 根据上一局名次判定进贡类型
 * @param {number[]} finishOrder  出完顺序 seat 数组，[0]=头游 … [3]=末游；可仅 4 人
 * @returns {{ kind: string, pairs: Array<{ from: number, to: number }> }}
 */
export function resolveTributeKind(finishOrder) {
  if (!Array.isArray(finishOrder) || finishOrder.length < 2) {
    return { kind: TributeKind.NONE, pairs: [] };
  }
  const order = finishOrder.map(Number);
  const place = new Map();
  order.forEach((seat, i) => place.set(seat, i + 1)); // 1=头游

  const head = order[0];
  const second = order[1];
  const third = order[2];
  const last = order[order.length - 1];

  // 双下：头游+二游同队（对家包揽 1、2）
  if (second != null && sameTeam(head, second)) {
    // 末游 → 头游，三游 → 二游
    const pairs = [];
    if (last != null && last !== head) pairs.push({ from: last, to: head });
    if (third != null && second != null && third !== second) {
      pairs.push({ from: third, to: second });
    }
    return { kind: TributeKind.DOUBLE, pairs };
  }

  // 单下：仅末游向头游进贡
  if (last != null && last !== head) {
    return { kind: TributeKind.SINGLE, pairs: [{ from: last, to: head }] };
  }
  return { kind: TributeKind.NONE, pairs: [] };
}

/**
 * 统计大王张数
 * @param {import('./card.js').Card[]} cards
 */
export function countBigJokers(cards) {
  return (cards || []).filter((c) => c && c.rank === 17).length;
}

/**
 * 抗贡判定
 * - 双进贡：两名进贡方手牌合计 2 张大王
 * - 单进贡：进贡方手牌有 2 张大王
 *
 * @param {string} kind
 * @param {Array<{ from: number, to: number }>} pairs
 * @param {Record<number, import('./card.js').Card[]>} handsBySeat
 */
export function checkAntiTribute(kind, pairs, handsBySeat) {
  if (!pairs?.length || kind === TributeKind.NONE) {
    return { anti: false, bigJokers: 0 };
  }
  const givers = [...new Set(pairs.map((p) => p.from))];
  let total = 0;
  for (const s of givers) {
    total += countBigJokers(handsBySeat[s] || []);
  }
  if (kind === TributeKind.DOUBLE) {
    return { anti: total >= 2, bigJokers: total };
  }
  // 单进贡：进贡方（通常 1 人）有 2 大王
  return { anti: total >= 2, bigJokers: total };
}

/**
 * 选出进贡牌：除红心级牌（逢人配）外最大的单张
 * @param {import('./card.js').Card[]} hand
 * @param {number} currentRank
 */
export function pickTributeCard(hand, currentRank) {
  const candidates = (hand || []).filter((c) => c && !isWild(c, currentRank));
  if (!candidates.length) {
    // 全是逢人配时只能进非王优先的最大（不应发生）
    const any = (hand || []).slice();
    if (!any.length) return null;
    return pickMaxCard(any, currentRank);
  }
  return pickMaxCard(candidates, currentRank);
}

/**
 * @param {import('./card.js').Card[]} cards
 * @param {number} currentRank
 */
export function pickMaxCard(cards, currentRank) {
  let best = null;
  let bestS = -1;
  for (const c of cards) {
    // 同点时：大王 > 小王 > 黑桃 > 红心 > 梅花 > 方块（简化：rankStrength 后用 suit 降序）
    const s = rankStrength(c.rank, currentRank) * 10 + (c.suit || 0);
    if (s > bestS) {
      bestS = s;
      best = c;
    }
  }
  return best;
}

/**
 * 还贡可选：点数 ≤ 10 的非王牌（2–10）
 * @param {import('./card.js').Card[]} hand
 */
export function listReturnableCards(hand) {
  return (hand || []).filter((c) => c && !isJoker(c) && c.rank >= 2 && c.rank <= 10);
}

/**
 * @param {import('./card.js').Card} card
 */
export function isValidReturnCard(card) {
  return !!(card && !isJoker(card) && card.rank >= 2 && card.rank <= 10);
}

/**
 * 进贡状态机
 */
export class TributeStateMachine {
  /**
   * @param {object} opts
   * @param {number[]} opts.finishOrder  上一局出完顺序
   * @param {Record<number, import('./card.js').Card[]>} opts.hands  本局已发手牌 seat→cards
   * @param {number} [opts.currentRank=2]
   */
  constructor(opts = {}) {
    this.currentRank = opts.currentRank ?? 2;
    this.finishOrder = (opts.finishOrder || []).map(Number);
    this.hands = cloneHands(opts.hands || {});
    this.phase = TributePhase.WAITING;
    this.kind = TributeKind.NONE;
    this.pairs = [];
    this.anti = false;
    this.antiDetail = null;
    /** @type {Array<{ from: number, to: number, card: import('./card.js').Card }>} */
    this.tributes = [];
    /** @type {Array<{ from: number, to: number, card: import('./card.js').Card }>} */
    this.returns = [];
    this._returnQueue = []; // 收贡方还需要还贡的列表
    this.error = null;
  }

  /** 进入抗贡检查 */
  start() {
    this.phase = TributePhase.CHECKING_ANTI;
    const resolved = resolveTributeKind(this.finishOrder);
    this.kind = resolved.kind;
    this.pairs = resolved.pairs;

    if (this.kind === TributeKind.NONE || !this.pairs.length) {
      this.phase = TributePhase.GAME_START;
      return this.snapshot();
    }

    this.antiDetail = checkAntiTribute(this.kind, this.pairs, this.hands);
    this.anti = this.antiDetail.anti;
    if (this.anti) {
      this.phase = TributePhase.GAME_START;
      return this.snapshot();
    }

    this.phase = TributePhase.EXECUTING;
    this._autoExecuteTributes();
    return this.snapshot();
  }

  /** 自动执行全部进贡 */
  _autoExecuteTributes() {
    this.tributes = [];
    for (const pair of this.pairs) {
      const hand = this.hands[pair.from] || [];
      const card = pickTributeCard(hand, this.currentRank);
      if (!card) {
        this.error = `seat ${pair.from} 无进贡牌`;
        continue;
      }
      this.hands[pair.from] = removeCard(hand, card);
      this.hands[pair.to] = [...(this.hands[pair.to] || []), card];
      this.tributes.push({ from: pair.from, to: pair.to, card: { ...card } });
    }
    // 收贡方按进贡顺序还贡
    this._returnQueue = this.tributes.map((t) => ({
      from: t.to,   // 收贡方还
      to: t.from,   // 还给进贡方
    }));
    this.phase = this._returnQueue.length ? TributePhase.RETURNING : TributePhase.GAME_START;
  }

  /**
   * 收贡方选择还贡牌
   * @param {number} fromSeat  还贡者（收贡方）
   * @param {import('./card.js').Card|string} cardOrId
   */
  returnTribute(fromSeat, cardOrId) {
    if (this.phase !== TributePhase.RETURNING) {
      return { ok: false, reason: 'not_returning', snapshot: this.snapshot() };
    }
    const idx = this._returnQueue.findIndex((q) => q.from === Number(fromSeat));
    if (idx < 0) {
      return { ok: false, reason: 'not_your_return', snapshot: this.snapshot() };
    }
    const job = this._returnQueue[idx];
    const hand = this.hands[fromSeat] || [];
    const card = findCard(hand, cardOrId);
    if (!card) {
      return { ok: false, reason: 'card_not_in_hand', snapshot: this.snapshot() };
    }
    if (!isValidReturnCard(card)) {
      return { ok: false, reason: 'invalid_return_rank', snapshot: this.snapshot() };
    }
    this.hands[fromSeat] = removeCard(hand, card);
    this.hands[job.to] = [...(this.hands[job.to] || []), card];
    this.returns.push({ from: job.from, to: job.to, card: { ...card } });
    this._returnQueue.splice(idx, 1);
    if (!this._returnQueue.length) {
      this.phase = TributePhase.GAME_START;
    }
    return { ok: true, snapshot: this.snapshot() };
  }

  /** 当前应还贡的座位（可多人时返回第一个） */
  currentReturnSeat() {
    return this._returnQueue[0]?.from ?? null;
  }

  /**
   * AI / 系统自动还贡一张最小合法牌
   * @param {number} fromSeat
   */
  autoReturn(fromSeat) {
    const hand = this.hands[fromSeat] || [];
    const options = listReturnableCards(hand);
    const pick = options.slice().sort((a, b) => a.rank - b.rank)[0];
    if (!pick) return { ok: false, reason: 'no_return_card', snapshot: this.snapshot() };
    return this.returnTribute(fromSeat, pick);
  }

  snapshot() {
    return {
      phase: this.phase,
      kind: this.kind,
      pairs: this.pairs.map((p) => ({ ...p })),
      anti: this.anti,
      antiDetail: this.antiDetail,
      tributes: this.tributes.map((t) => ({ ...t, card: { ...t.card } })),
      returns: this.returns.map((t) => ({ ...t, card: { ...t.card } })),
      pendingReturns: this._returnQueue.map((q) => ({ ...q })),
      hands: cloneHands(this.hands),
      currentRank: this.currentRank,
      error: this.error,
      gameReady: this.phase === TributePhase.GAME_START,
    };
  }
}

function cloneHands(hands) {
  /** @type {Record<number, import('./card.js').Card[]>} */
  const out = {};
  for (const [k, v] of Object.entries(hands || {})) {
    out[Number(k)] = (v || []).map((c) => ({ ...c }));
  }
  return out;
}

function removeCard(hand, card) {
  const id = card.id;
  if (id) return hand.filter((c) => c.id !== id);
  let removed = false;
  return hand.filter((c) => {
    if (removed) return true;
    if (c.rank === card.rank && c.suit === card.suit) {
      removed = true;
      return false;
    }
    return true;
  });
}

function findCard(hand, cardOrId) {
  if (!cardOrId) return null;
  if (typeof cardOrId === 'string') {
    return hand.find((c) => c.id === cardOrId) || null;
  }
  if (cardOrId.id) {
    return hand.find((c) => c.id === cardOrId.id) || cardOrId;
  }
  return hand.find((c) => c.rank === cardOrId.rank && c.suit === cardOrId.suit) || null;
}
