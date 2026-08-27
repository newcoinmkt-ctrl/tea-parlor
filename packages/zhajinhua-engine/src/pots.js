/**
 * 炸金花 · 主池 / 边池拆分与奖池分配
 *
 * buildSidePots(players)  — 按投入层级切分 Main Pot + Side Pots
 * settleAllPots(players)  — 按牌力把各池分给有资格的玩家
 *
 * 规则：
 *   - 奖池按 betTotal 升序分层；每层仅「投入 ≥ 该层」的玩家出资
 *   - 弃牌 / 比牌输 玩家的筹码仍在池中，但无获奖资格
 *   - All-in 玩家有资格分得其全押金额所覆盖的各层奖池
 *   - 同池多人牌力相同则均分（余数给座位靠前 / id 序靠前者）
 */

import { compareHands, hasLeopardAmong } from './hand-types.js';
import { PlayerStatus, isContendingStatus, isOutStatus } from './constants.js';

/**
 * @typedef {object} PotPlayer
 * @property {string} id
 * @property {number} betTotal   本局累计投入（≥0）
 * @property {string} [status]   men|looked|all_in|folded|lost
 * @property {boolean} [allIn]
 * @property {object[]} [cards]  三张牌（结算比牌用）
 * @property {number} [seat]     可选座位序（均分余数）
 */

/**
 * @typedef {object} SidePot
 * @property {number} index
 * @property {boolean} isMain     是否主池（第一层）
 * @property {number} amount
 * @property {number} level       本层累计投入上限
 * @property {number} layer       本层厚度（level - prev）
 * @property {string[]} contributorIds  出资玩家（含已出局）
 * @property {string[]} eligibleIds     有资格赢本池的玩家
 */

/**
 * 是否有资格赢池（未弃牌、未比牌淘汰）
 * All-in / 闷 / 看 均可
 * @param {PotPlayer} p
 */
export function canWinPot(p) {
  if (!p) return false;
  if (p.status != null) {
    if (isOutStatus(p.status)) return false;
    if (isContendingStatus(p.status)) return true;
    // 未知状态：有牌且非明确出局则允许
  }
  if (p.allIn) return true;
  return false;
}

/**
 * 按投入拆分主池 + 边池（纯函数，不改玩家筹码）
 *
 * 例：A 投 30, B 投 50, C 投 100
 *   Main  : 30×3 = 90  · eligible A,B,C
 *   Side1 : 20×2 = 40  · eligible B,C
 *   Side2 : 50×1 = 50  · eligible C
 *
 * @param {PotPlayer[]} players
 * @returns {SidePot[]}
 */
export function buildSidePots(players) {
  if (!Array.isArray(players) || players.length === 0) return [];

  const list = players.map((p, i) => ({
    id: String(p.id),
    betTotal: Math.max(0, Math.floor(Number(p.betTotal) || 0)),
    status: p.status,
    allIn: !!p.allIn || p.status === PlayerStatus.ALL_IN,
    cards: p.cards,
    seat: p.seat != null ? p.seat : i,
  }));

  const levels = [...new Set(list.map((p) => p.betTotal))]
    .filter((x) => x > 0)
    .sort((a, b) => a - b);

  if (levels.length === 0) return [];

  /** @type {SidePot[]} */
  const pots = [];
  let prev = 0;

  for (const level of levels) {
    const layer = level - prev;
    if (layer <= 0) {
      prev = level;
      continue;
    }
    const contributors = list.filter((p) => p.betTotal >= level);
    // 实际本层也可能有人只投到 (prev, level) 之间——用「betTotal > prev」计数更稳
    // 标准算法：每个 betTotal >= level 的人出 layer；
    // 对于 betTotal 恰好在中间的人，会在更低 level 被截住。
    // 若存在 betTotal 不在 levels 集合？已用 Set 覆盖所有 betTotal。
    const amount = layer * contributors.length;
    if (amount <= 0) {
      prev = level;
      continue;
    }

    const eligible = contributors.filter((p) => canWinPot(p));
    pots.push({
      index: pots.length,
      isMain: pots.length === 0,
      amount,
      level,
      layer,
      contributorIds: contributors.map((p) => p.id),
      eligibleIds: eligible.map((p) => p.id),
    });
    prev = level;
  }

  // 校验：各池之和 == 总投入
  const totalPots = pots.reduce((s, p) => s + p.amount, 0);
  const totalBets = list.reduce((s, p) => s + p.betTotal, 0);
  if (totalPots !== totalBets) {
    // 理论上相等；若浮点/异常，把差额并入主池
    const diff = totalBets - totalPots;
    if (diff !== 0 && pots.length) {
      pots[0].amount += diff;
    } else if (diff > 0) {
      pots.push({
        index: 0,
        isMain: true,
        amount: diff,
        level: diff,
        layer: diff,
        contributorIds: list.filter((p) => p.betTotal > 0).map((p) => p.id),
        eligibleIds: list.filter((p) => p.betTotal > 0 && canWinPot(p)).map((p) => p.id),
      });
    }
  }

  return pots;
}

/**
 * 在 eligible 中按牌力找出胜者（可多人平分）
 * @param {PotPlayer[]} candidates
 * @param {boolean} hasLeopardInGame
 * @returns {PotPlayer[]}
 */
export function pickPotWinners(candidates, hasLeopardInGame = false) {
  if (!candidates.length) return [];
  if (candidates.length === 1) return candidates.slice();

  const hasLeo =
    hasLeopardInGame
    || hasLeopardAmong(candidates.map((p) => p.cards).filter((c) => c && c.length === 3));

  let best = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    const cur = candidates[i];
    const a = cur.cards;
    const b = best[0].cards;
    if (!a || a.length !== 3) continue;
    if (!b || b.length !== 3) {
      best = [cur];
      continue;
    }
    const cmp = compareHands(a, b, hasLeo);
    if (cmp > 0) best = [cur];
    else if (cmp === 0) best.push(cur);
  }
  // 座位稳定序
  best.sort((x, y) => (x.seat ?? 0) - (y.seat ?? 0) || String(x.id).localeCompare(String(y.id)));
  return best;
}

/**
 * 完整奖池分配
 *
 * @param {PotPlayer[]} players
 * @param {{
 *   hasLeopardInGame?: boolean,
 *   compareFn?: (a, b, hasLeo) => number,
 * }} [options]
 * @returns {{
 *   pots: Array<SidePot & { winnerIds: string[], shares: Record<string, number> }>,
 *   awards: Record<string, number>,
 *   deltas: Record<string, number>,
 *   totalPot: number,
 *   mainPot: number,
 *   sidePotsTotal: number,
 * }}
 */
export function settleAllPots(players, options = {}) {
  const list = (players || []).map((p, i) => ({
    id: String(p.id),
    betTotal: Math.max(0, Math.floor(Number(p.betTotal) || 0)),
    status: p.status,
    allIn: !!p.allIn || p.status === PlayerStatus.ALL_IN,
    cards: p.cards ? p.cards.map((c) => ({ ...c })) : null,
    seat: p.seat != null ? p.seat : i,
  }));

  const byId = new Map(list.map((p) => [p.id, p]));
  const rawPots = buildSidePots(list);
  const hasLeo = options.hasLeopardInGame != null
    ? !!options.hasLeopardInGame
    : hasLeopardAmong(
      list.filter((p) => canWinPot(p) && p.cards?.length === 3).map((p) => p.cards)
    );

  /** @type {Record<string, number>} */
  const awards = {};
  for (const p of list) awards[p.id] = 0;

  const settledPots = rawPots.map((pot) => {
    /** @type {Record<string, number>} */
    const shares = {};
    let winnerIds = [];

    if (pot.amount <= 0) {
      return { ...pot, winnerIds, shares };
    }

    const eligible = pot.eligibleIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (eligible.length === 0) {
      // 无人有资格：按出资比例退还（极少见；全弃时通常 last_standing 已处理）
      const contribs = pot.contributorIds.map((id) => byId.get(id)).filter(Boolean);
      if (contribs.length) {
        const each = Math.floor(pot.amount / contribs.length);
        let rem = pot.amount - each * contribs.length;
        for (const c of contribs) {
          let get = each;
          if (rem > 0) {
            get += 1;
            rem -= 1;
          }
          shares[c.id] = get;
          awards[c.id] = (awards[c.id] || 0) + get;
          winnerIds.push(c.id);
        }
      }
      return { ...pot, winnerIds, shares, refund: true };
    }

    const winners = pickPotWinners(eligible, hasLeo);
    winnerIds = winners.map((w) => w.id);

    if (winners.length === 1) {
      shares[winners[0].id] = pot.amount;
      awards[winners[0].id] = (awards[winners[0].id] || 0) + pot.amount;
    } else {
      const each = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - each * winners.length;
      for (const w of winners) {
        let get = each;
        if (rem > 0) {
          get += 1;
          rem -= 1;
        }
        shares[w.id] = get;
        awards[w.id] = (awards[w.id] || 0) + get;
      }
    }

    return { ...pot, winnerIds, shares };
  });

  const totalPot = list.reduce((s, p) => s + p.betTotal, 0);
  const mainPot = settledPots.find((p) => p.isMain)?.amount || 0;
  const sidePotsTotal = settledPots.filter((p) => !p.isMain).reduce((s, p) => s + p.amount, 0);

  /** @type {Record<string, number>} */
  const deltas = {};
  for (const p of list) {
    deltas[p.id] = (awards[p.id] || 0) - p.betTotal;
  }

  return {
    pots: settledPots,
    awards,
    deltas,
    totalPot,
    mainPot,
    sidePotsTotal,
  };
}

/**
 * 仅拆池预览（不比牌）
 * @param {PotPlayer[]} players
 */
export function previewPots(players) {
  const pots = buildSidePots(players);
  return {
    pots,
    totalPot: pots.reduce((s, p) => s + p.amount, 0),
    mainPot: pots.find((p) => p.isMain)?.amount || 0,
    sidePotsTotal: pots.filter((p) => !p.isMain).reduce((s, p) => s + p.amount, 0),
  };
}
