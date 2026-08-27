/**
 * 德州扑克 · 主池 / 多重边池拆分与分配
 *
 * calculatePots(playersState)  — 按累计投入拆 Main + Side Pots
 * distributePots(pots, rankings, options) — 按牌力排名发奖（平局均分，奇数筹码靠 SB）
 */

/**
 * @typedef {object} PotPlayerState
 * @property {string|number} id
 * @property {number} betTotal          本局累计投入（所有街之和）
 * @property {boolean} [folded]         已弃牌 → 无资格赢池，但筹码仍在池中
 * @property {boolean} [allIn]
 * @property {number} [seat]            座位 0..n-1
 * @property {string} [status]          'active'|'folded'|'all_in' 等
 */

/**
 * @typedef {object} TexasPot
 * @property {number} index
 * @property {boolean} isMain
 * @property {string} name              'main' | 'side_1' | ...
 * @property {number} amount
 * @property {number} level             本层累计投入上限
 * @property {number} layer             level - prev
 * @property {Array<string|number>} contributorIds
 * @property {Array<string|number>} eligibleIds   有资格分此池的玩家（未弃牌且投入≥level）
 */

/**
 * 是否有资格赢池
 * @param {PotPlayerState} p
 */
export function isEligibleForPots(p) {
  if (!p) return false;
  if (p.folded === true) return false;
  const st = String(p.status || '').toLowerCase();
  if (st === 'folded' || st === 'out') return false;
  return true;
}

/**
 * 动态边池计算器
 *
 * 例：A 全押 50，B 全押 100，C 投入 200（均未弃）
 *   Main   50×3=150  eligible A,B,C
 *   Side1  50×2=100  eligible B,C
 *   Side2 100×1=100  eligible C
 *
 * @param {PotPlayerState[]} playersState
 * @returns {TexasPot[]}
 */
export function calculatePots(playersState) {
  if (!Array.isArray(playersState) || !playersState.length) return [];

  const list = playersState.map((p, i) => ({
    id: p.id != null ? p.id : i,
    betTotal: Math.max(0, Math.floor(Number(p.betTotal) || 0)),
    folded: !!p.folded || String(p.status || '').toLowerCase() === 'folded',
    allIn: !!p.allIn || String(p.status || '').toLowerCase() === 'all_in',
    seat: p.seat != null ? Number(p.seat) : i,
    status: p.status,
  }));

  const levels = [...new Set(list.map((p) => p.betTotal))]
    .filter((x) => x > 0)
    .sort((a, b) => a - b);

  if (!levels.length) return [];

  /** @type {TexasPot[]} */
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
    if (amount <= 0) {
      prev = level;
      continue;
    }
    const eligible = contributors.filter((p) => isEligibleForPots(p));
    const isMain = pots.length === 0;
    pots.push({
      index: pots.length,
      isMain,
      name: isMain ? 'main' : `side_${pots.length}`,
      amount,
      level,
      layer,
      contributorIds: contributors.map((c) => c.id),
      eligibleIds: eligible.map((c) => c.id),
    });
    prev = level;
  }

  // 校验总和
  const sumPots = pots.reduce((s, p) => s + p.amount, 0);
  const sumBets = list.reduce((s, p) => s + p.betTotal, 0);
  if (sumPots !== sumBets && pots.length) {
    pots[0].amount += sumBets - sumPots;
  }

  return pots;
}

/**
 * @typedef {object} PlayerRanking
 * @property {string|number} id
 * @property {number} rank          名次，1 最好；同牌力同 rank
 * @property {number} [seat]
 * @property {number} [score]       可选：越大越好，用于自动生成 rank
 */

/**
 * 在 eligible 中按 rank 找最优（rank 数字越小越好；若用 score 则越大越好）
 * @param {Array<string|number>} eligibleIds
 * @param {PlayerRanking[]} rankings
 * @returns {Array<string|number>} 并列第一的 id 列表
 */
export function pickWinnersForPot(eligibleIds, rankings) {
  const byId = new Map((rankings || []).map((r) => [String(r.id), r]));
  const elig = (eligibleIds || []).map(String);
  if (!elig.length) return [];

  // 优先用 rank（1=最好）；否则用 score
  let useScore = rankings?.length && rankings.every((r) => r.rank == null && r.score != null);

  /** @type {string[]} */
  let bestIds = [];
  let bestKey = useScore ? -Infinity : Infinity;

  for (const id of elig) {
    const r = byId.get(id);
    if (!r) {
      // 无排名信息：视为并列最差，仅当全无排名时均分
      continue;
    }
    if (useScore) {
      const sc = Number(r.score) || 0;
      if (sc > bestKey) {
        bestKey = sc;
        bestIds = [id];
      } else if (sc === bestKey) {
        bestIds.push(id);
      }
    } else {
      const rk = r.rank != null ? Number(r.rank) : 9999;
      if (rk < bestKey) {
        bestKey = rk;
        bestIds = [id];
      } else if (rk === bestKey) {
        bestIds.push(id);
      }
    }
  }

  // 全无 ranking 条目：eligible 均分
  if (!bestIds.length) {
    return elig.slice();
  }
  return bestIds;
}

/**
 * 按「从 SB 起的顺位」排序：seat 相对 sbSeat 的顺时针距离升序
 * @param {Array<string|number>} ids
 * @param {Map<string, number>} seatById
 * @param {number} sbSeat
 * @param {number} playerCount
 */
export function orderBySbProximity(ids, seatById, sbSeat, playerCount) {
  const n = Math.max(1, playerCount || (seatById.size || 1));
  const sb = ((sbSeat % n) + n) % n;
  return ids.slice().sort((a, b) => {
    const sa = seatById.has(String(a)) ? seatById.get(String(a)) : 0;
    const sb_ = seatById.has(String(b)) ? seatById.get(String(b)) : 0;
    const da = (sa - sb + n) % n;
    const db = (sb_ - sb + n) % n;
    if (da !== db) return da - db;
    return String(a).localeCompare(String(b));
  });
}

/**
 * 结算分池：从最外层边池 → 主池依次分配
 *
 * 平局均分；不可整除的奇数筹码按「靠近小盲位」顺序每次 +1。
 *
 * @param {TexasPot[]} pots
 * @param {PlayerRanking[]} playerRankings
 * @param {{
 *   sbSeat?: number,
 *   seats?: Record<string, number>|Map<string,number>|Array<{id,seat}>,
 *   playerCount?: number,
 * }} [options]
 * @returns {{
 *   pots: Array<TexasPot & { winnerIds: Array<string|number>, shares: Record<string, number> }>,
 *   awards: Record<string, number>,
 *   totalDistributed: number,
 * }}
 */
export function distributePots(pots, playerRankings, options = {}) {
  const sbSeat = options.sbSeat != null ? Number(options.sbSeat) : 0;
  /** @type {Map<string, number>} */
  const seatById = new Map();

  if (options.seats instanceof Map) {
    for (const [k, v] of options.seats) seatById.set(String(k), Number(v));
  } else if (Array.isArray(options.seats)) {
    for (const row of options.seats) {
      if (row && row.id != null) seatById.set(String(row.id), Number(row.seat) || 0);
    }
  } else if (options.seats && typeof options.seats === 'object') {
    for (const [k, v] of Object.entries(options.seats)) {
      seatById.set(String(k), Number(v));
    }
  }
  for (const r of playerRankings || []) {
    if (r.seat != null && !seatById.has(String(r.id))) {
      seatById.set(String(r.id), Number(r.seat));
    }
  }

  const playerCount = options.playerCount
    || Math.max(seatById.size, ...(seatById.size ? [...seatById.values()].map((x) => x + 1) : [1]));

  /** @type {Record<string, number>} */
  const awards = {};
  // 预填 0，便于调用方严格相等
  for (const r of playerRankings || []) {
    awards[String(r.id)] = 0;
  }
  for (const pot of pots || []) {
    for (const id of pot.contributorIds || []) awards[String(id)] = awards[String(id)] || 0;
    for (const id of pot.eligibleIds || []) awards[String(id)] = awards[String(id)] || 0;
  }

  // 从最小边池（最后一层）到主池
  const ordered = (pots || []).slice().sort((a, b) => b.index - a.index);

  const settled = ordered.map((pot) => {
    /** @type {Record<string, number>} */
    const shares = {};
    let winnerIds = [];

    if (!pot || pot.amount <= 0) {
      return { ...pot, winnerIds, shares };
    }

    // 无人有资格：退还贡献者（极少见）
    if (!pot.eligibleIds?.length) {
      winnerIds = (pot.contributorIds || []).map(String);
      splitAmount(pot.amount, winnerIds, shares, awards, seatById, sbSeat, playerCount);
      return { ...pot, winnerIds, shares, refund: true };
    }

    winnerIds = pickWinnersForPot(pot.eligibleIds, playerRankings).map(String);
    if (!winnerIds.length) {
      winnerIds = pot.eligibleIds.map(String);
    }

    splitAmount(pot.amount, winnerIds, shares, awards, seatById, sbSeat, playerCount);
    return { ...pot, winnerIds, shares };
  });

  // 恢复 index 升序输出
  settled.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const totalDistributed = Object.values(awards).reduce((s, v) => s + v, 0);

  return {
    pots: settled,
    awards,
    totalDistributed,
  };
}

/**
 * 均分 amount 给 winners；余数按 SB 近到远每次 +1
 */
function splitAmount(amount, winnerIds, shares, awards, seatById, sbSeat, playerCount) {
  const n = winnerIds.length;
  if (n === 0 || amount <= 0) return;

  const ordered = orderBySbProximity(winnerIds, seatById, sbSeat, playerCount);
  const each = Math.floor(amount / n);
  let rem = amount - each * n;

  for (const id of ordered) {
    let get = each;
    if (rem > 0) {
      get += 1;
      rem -= 1;
    }
    shares[id] = (shares[id] || 0) + get;
    awards[id] = (awards[id] || 0) + get;
  }
}

/**
 * 一步到位：拆池 + 按排名发奖
 * @param {PotPlayerState[]} playersState
 * @param {PlayerRanking[]} rankings
 * @param {object} [options]
 */
export function settleTexasPots(playersState, rankings, options = {}) {
  const pots = calculatePots(playersState);
  // seats 从 playersState 补全
  const seats = {};
  for (let i = 0; i < (playersState || []).length; i++) {
    const p = playersState[i];
    seats[String(p.id != null ? p.id : i)] = p.seat != null ? p.seat : i;
  }
  return {
    pots: calculatePots(playersState),
    ...distributePots(pots, rankings, {
      ...options,
      seats: options.seats || seats,
      playerCount: options.playerCount || playersState.length,
    }),
  };
}
