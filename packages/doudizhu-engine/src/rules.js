/**
 * JJ 经典斗地主牌型规则（旧版实现，@deprecated）
 *
 * @deprecated 新代码请使用 hand-types.js 中的 identifyHandType / compareHands。
 *   本模块保留用于向后兼容，后续版本将逐步迁移并移除。
 *
 * 牌型：单/对/三/三带一/三带对/顺子/连对/飞机/飞机带翅/四带二/四带两对/炸弹/火箭
 */

import { groupByRank } from './card.js';

export const HandType = {
  INVALID: 'invalid',
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  TRIPLE_ONE: 'triple_one',     // 三带一
  TRIPLE_PAIR: 'triple_pair',   // 三带对
  STRAIGHT: 'straight',         // 单顺 ≥5
  PAIR_STRAIGHT: 'pair_straight', // 双顺 ≥3 对
  PLANE: 'plane',               // 飞机不带
  PLANE_ONE: 'plane_one',       // 飞机带单
  PLANE_PAIR: 'plane_pair',     // 飞机带对
  FOUR_TWO: 'four_two',         // 四带二单
  FOUR_PAIR: 'four_pair',       // 四带两对
  BOMB: 'bomb',
  ROCKET: 'rocket',
};

/**
 * 解析一手牌
 * @returns {{ type, weight, length, cards } | null}
 * weight: 用于比较大小的主牌点数
 * length: 主牌长度（顺子张数、飞机段数等）
 */
export function parseHand(cards) {
  if (!cards || cards.length === 0) return null;
  const n = cards.length;
  const groups = groupByRank(cards);
  const ranks = [...groups.keys()].sort((a, b) => a - b);
  const counts = ranks.map((r) => groups.get(r).length);
  const byCount = (c) => ranks.filter((r) => groups.get(r).length === c);

  // 火箭
  if (n === 2 && ranks.includes(16) && ranks.includes(17)) {
    return { type: HandType.ROCKET, weight: 17, length: 2, cards };
  }

  // 炸弹
  if (n === 4 && byCount(4).length === 1) {
    return { type: HandType.BOMB, weight: byCount(4)[0], length: 4, cards };
  }

  // 单牌
  if (n === 1) {
    return { type: HandType.SINGLE, weight: cards[0].rank, length: 1, cards };
  }

  // 对子
  if (n === 2 && byCount(2).length === 1) {
    return { type: HandType.PAIR, weight: byCount(2)[0], length: 2, cards };
  }

  // 三张
  if (n === 3 && byCount(3).length === 1) {
    return { type: HandType.TRIPLE, weight: byCount(3)[0], length: 3, cards };
  }

  // 三带一
  if (n === 4 && byCount(3).length === 1 && byCount(1).length === 1) {
    return { type: HandType.TRIPLE_ONE, weight: byCount(3)[0], length: 4, cards };
  }

  // 三带对
  if (n === 5 && byCount(3).length === 1 && byCount(2).length === 1) {
    return { type: HandType.TRIPLE_PAIR, weight: byCount(3)[0], length: 5, cards };
  }

  // 四带二（两张单，可同可不同；不可带双王）
  if (n === 6 && byCount(4).length === 1) {
    const kickers = cards.filter((c) => groups.get(c.rank).length !== 4);
    if (kickers.length === 2 && !isRocketKickers(kickers)) {
      return { type: HandType.FOUR_TWO, weight: byCount(4)[0], length: 6, cards };
    }
  }

  // 四带两对
  if (n === 8 && byCount(4).length === 1 && byCount(2).length === 2) {
    return { type: HandType.FOUR_PAIR, weight: byCount(4)[0], length: 8, cards };
  }
  // 也允许 4+4 拆成四带两对的一种形式？JJ 一般要求两个对子作带牌
  if (n === 8 && byCount(4).length === 2) {
    // 两个炸弹不能当四带两对出，必须当炸弹或拆
    // skip
  }

  // 单顺：≥5，不含 2 和王，连续
  if (n >= 5 && counts.every((c) => c === 1)) {
    if (isConsecutive(ranks) && ranks.every((r) => r >= 3 && r <= 14)) {
      return { type: HandType.STRAIGHT, weight: ranks[ranks.length - 1], length: n, cards };
    }
  }

  // 双顺：≥3 对，连续，不含 2 王
  if (n >= 6 && n % 2 === 0 && counts.every((c) => c === 2)) {
    if (isConsecutive(ranks) && ranks.every((r) => r >= 3 && r <= 14) && ranks.length >= 3) {
      return { type: HandType.PAIR_STRAIGHT, weight: ranks[ranks.length - 1], length: ranks.length, cards };
    }
  }

  // 飞机（不带）：≥2 个连续三张
  const triples = byCount(3).sort((a, b) => a - b);
  const pureTriples = triples.filter((r) => r >= 3 && r <= 14);

  // 飞机不带
  if (n >= 6 && n % 3 === 0) {
    const need = n / 3;
    const seq = longestConsecutive(pureTriples);
    if (seq.length >= need && need >= 2) {
      // 取最大合适连续段
      for (let i = 0; i <= seq.length - need; i++) {
        const seg = seq.slice(i, i + need);
        if (isConsecutive(seg) && cards.every((c) => seg.includes(c.rank))) {
          return { type: HandType.PLANE, weight: seg[seg.length - 1], length: need, cards };
        }
      }
      // 全部都是三张且连续
      if (pureTriples.length === need && isConsecutive(pureTriples) && byCount(3).length === need) {
        return { type: HandType.PLANE, weight: pureTriples[need - 1], length: need, cards };
      }
    }
  }

  // 飞机带单：3*k + 1*k 张
  if (n >= 8 && n % 4 === 0) {
    const k = n / 4;
    if (k >= 2) {
      const seq = findPlaneBody(groups, k);
      if (seq) {
        return { type: HandType.PLANE_ONE, weight: seq[seq.length - 1], length: k, cards };
      }
    }
  }

  // 飞机带对：3*k + 2*k 张
  if (n >= 10 && n % 5 === 0) {
    const k = n / 5;
    if (k >= 2) {
      const seq = findPlaneBody(groups, k);
      if (seq) {
        // 剩余必须能组成 k 个对
        const restRanks = [];
        for (const [r, cs] of groups) {
          if (seq.includes(r)) {
            if (cs.length === 4) {
              // 炸弹拆：三张作飞机，一张不能作对
              // 若该 rank 有 4 张，用 3 张作 body，剩 1 张不能单独成对
            }
            continue;
          }
          restRanks.push(...Array(cs.length).fill(r));
        }
        // 简化：检查非 body 的牌是否正好 k 对
        if (canFormPairs(cards, seq, k)) {
          return { type: HandType.PLANE_PAIR, weight: seq[seq.length - 1], length: k, cards };
        }
      }
    }
  }

  // 特殊：4 张当三带一（不合法）等已排除

  // 再处理含炸弹拆成飞机带的情况 — findPlaneBody 已处理部分

  return null;
}

function isRocketKickers(kickers) {
  const ranks = new Set(kickers.map((c) => c.rank));
  return ranks.has(16) && ranks.has(17);
}

function isConsecutive(sortedAsc) {
  if (sortedAsc.length < 2) return true;
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] !== sortedAsc[i - 1] + 1) return false;
  }
  return true;
}

function longestConsecutive(sortedAsc) {
  if (!sortedAsc.length) return [];
  let best = [sortedAsc[0]];
  let cur = [sortedAsc[0]];
  for (let i = 1; i < sortedAsc.length; i++) {
    if (sortedAsc[i] === sortedAsc[i - 1] + 1) {
      cur.push(sortedAsc[i]);
    } else {
      if (cur.length > best.length) best = cur;
      cur = [sortedAsc[i]];
    }
  }
  if (cur.length > best.length) best = cur;
  return best;
}

/** 找 k 个连续三张（点数 3-A）作为飞机主体 */
function findPlaneBody(groups, k) {
  const candidates = [];
  for (const [r, cs] of groups) {
    if (r >= 3 && r <= 14 && cs.length >= 3) candidates.push(r);
  }
  candidates.sort((a, b) => a - b);
  // 找长度为 k 的连续段，优先较大的
  for (let i = candidates.length - k; i >= 0; i--) {
    const seg = candidates.slice(i, i + k);
    if (isConsecutive(seg)) return seg;
  }
  return null;
}

function canFormPairs(cards, bodyRanks, k) {
  const groups = groupByRank(cards);
  let pairSlots = 0;
  for (const [r, cs] of groups) {
    let count = cs.length;
    if (bodyRanks.includes(r)) {
      count -= 3;
    }
    if (count < 0) return false;
    // 剩余牌必须成对使用
    if (count % 2 !== 0) return false;
    pairSlots += count / 2;
  }
  return pairSlots === k;
}

/**
 * 比较两手牌：next 能否压过 prev
 * @returns boolean
 */
export function canBeat(prev, next) {
  if (!next) return false;
  if (!prev) return next.type !== HandType.INVALID;

  // 火箭最大
  if (prev.type === HandType.ROCKET) return false;
  if (next.type === HandType.ROCKET) return true;

  // 炸弹压非炸弹
  if (next.type === HandType.BOMB && prev.type !== HandType.BOMB) return true;
  if (prev.type === HandType.BOMB && next.type !== HandType.BOMB) return false;

  // 同型同长度比 weight
  if (next.type === prev.type && next.length === prev.length) {
    return next.weight > prev.weight;
  }

  // 两个炸弹比 weight
  if (next.type === HandType.BOMB && prev.type === HandType.BOMB) {
    return next.weight > prev.weight;
  }

  return false;
}

/**
 * 从手牌中枚举所有能压过 prev 的出法（用于提示与 AI）
 * prev = null 表示自由出牌
 */
export function findBeatingHands(hand, prevHand) {
  const results = [];
  const cards = hand.slice();
  const n = cards.length;

  if (!prevHand) {
    // 自由出：枚举基本牌型（优先小牌）
    return enumerateAllPlays(cards);
  }

  const prev = prevHand;

  // 同型压制
  switch (prev.type) {
    case HandType.SINGLE:
      results.push(...findCombos(cards, 1, 1, prev.weight));
      break;
    case HandType.PAIR:
      results.push(...findCombos(cards, 2, 1, prev.weight));
      break;
    case HandType.TRIPLE:
      results.push(...findCombos(cards, 3, 1, prev.weight));
      break;
    case HandType.TRIPLE_ONE:
      results.push(...findTripleWith(cards, 1, prev.weight));
      break;
    case HandType.TRIPLE_PAIR:
      results.push(...findTripleWith(cards, 2, prev.weight));
      break;
    case HandType.STRAIGHT:
      results.push(...findStraights(cards, prev.length, prev.weight, 1));
      break;
    case HandType.PAIR_STRAIGHT:
      results.push(...findStraights(cards, prev.length, prev.weight, 2));
      break;
    case HandType.PLANE:
      results.push(...findPlanes(cards, prev.length, prev.weight, 0));
      break;
    case HandType.PLANE_ONE:
      results.push(...findPlanes(cards, prev.length, prev.weight, 1));
      break;
    case HandType.PLANE_PAIR:
      results.push(...findPlanes(cards, prev.length, prev.weight, 2));
      break;
    case HandType.FOUR_TWO:
      results.push(...findFourWith(cards, 2, false, prev.weight));
      break;
    case HandType.FOUR_PAIR:
      results.push(...findFourWith(cards, 2, true, prev.weight));
      break;
    case HandType.BOMB:
      // 更大炸弹或火箭
      break;
    case HandType.ROCKET:
      return [];
    default:
      break;
  }

  // 炸弹与火箭（除非 prev 是火箭）
  if (prev.type !== HandType.ROCKET) {
    results.push(...findBombs(cards, prev.type === HandType.BOMB ? prev.weight : 0));
    const rocket = findRocket(cards);
    if (rocket) results.push(rocket);
  }

  // 过滤合法解析
  return results
    .map((c) => {
      const p = parseHand(c);
      return p && canBeat(prev, p) ? p : null;
    })
    .filter(Boolean);
}

function enumerateAllPlays(cards) {
  const plays = [];
  // 单
  plays.push(...findCombos(cards, 1, 1, 0));
  // 对
  plays.push(...findCombos(cards, 2, 1, 0));
  // 三
  plays.push(...findCombos(cards, 3, 1, 0));
  // 三带
  plays.push(...findTripleWith(cards, 1, 0));
  plays.push(...findTripleWith(cards, 2, 0));
  // 顺子 5-12
  for (let len = 5; len <= 12; len++) plays.push(...findStraights(cards, len, 0, 1));
  // 连对 3-10
  for (let len = 3; len <= 10; len++) plays.push(...findStraights(cards, len, 0, 2));
  // 飞机
  for (let k = 2; k <= 6; k++) {
    plays.push(...findPlanes(cards, k, 0, 0));
    plays.push(...findPlanes(cards, k, 0, 1));
    plays.push(...findPlanes(cards, k, 0, 2));
  }
  // 四带
  plays.push(...findFourWith(cards, 2, false, 0));
  plays.push(...findFourWith(cards, 2, true, 0));
  // 炸弹火箭
  plays.push(...findBombs(cards, 0));
  const rocket = findRocket(cards);
  if (rocket) plays.push(rocket);

  const parsed = [];
  const seen = new Set();
  for (const c of plays) {
    const p = parseHand(c);
    if (!p) continue;
    const key = c.map((x) => x.id).sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(p);
  }
  // 自由出时按 weight 升序、张数升序，方便 AI 出小牌
  parsed.sort((a, b) => {
    const pa = bombPriority(a);
    const pb = bombPriority(b);
    if (pa !== pb) return pa - pb;
    if (a.cards.length !== b.cards.length) return a.cards.length - b.cards.length;
    return a.weight - b.weight;
  });
  return parsed;
}

function bombPriority(p) {
  if (p.type === HandType.ROCKET) return 2;
  if (p.type === HandType.BOMB) return 1;
  return 0;
}

/** countOfRank 张相同点数，需要 numGroups 组，weight > minWeight */
function findCombos(cards, countOfRank, numGroups, minWeight) {
  const groups = groupByRank(cards);
  const ranks = [...groups.keys()].filter((r) => groups.get(r).length >= countOfRank && r > minWeight).sort((a, b) => a - b);
  const results = [];
  if (numGroups === 1) {
    for (const r of ranks) {
      results.push(groups.get(r).slice(0, countOfRank));
    }
  }
  return results;
}

function findTripleWith(cards, kickerCount, minWeight) {
  const groups = groupByRank(cards);
  const triples = [...groups.keys()].filter((r) => groups.get(r).length >= 3 && r > minWeight).sort((a, b) => a - b);
  const results = [];
  for (const t of triples) {
    const body = groups.get(t).slice(0, 3);
    const rest = cards.filter((c) => !body.includes(c));
    if (kickerCount === 1) {
      for (const k of rest) {
        results.push([...body, k]);
      }
    } else if (kickerCount === 2) {
      const rg = groupByRank(rest);
      for (const [r, cs] of rg) {
        if (cs.length >= 2) results.push([...body, ...cs.slice(0, 2)]);
      }
    }
  }
  return results;
}

/** unit=1 单顺 length 张；unit=2 双顺 length 对 */
function findStraights(cards, length, minWeight, unit) {
  const groups = groupByRank(cards);
  const results = [];
  // 可用点数 3-A
  const available = [];
  for (let r = 3; r <= 14; r++) {
    if ((groups.get(r) || []).length >= unit) available.push(r);
  }
  for (let start = 3; start <= 14 - length + 1; start++) {
    const end = start + length - 1;
    if (end > 14) break;
    if (end <= minWeight) continue; // 最大张需 > minWeight
    let ok = true;
    const combo = [];
    for (let r = start; r <= end; r++) {
      const cs = groups.get(r) || [];
      if (cs.length < unit) {
        ok = false;
        break;
      }
      combo.push(...cs.slice(0, unit));
    }
    if (ok && end > minWeight) results.push(combo);
  }
  return results;
}

function findPlanes(cards, k, minWeight, wing) {
  // wing: 0 不带, 1 带单, 2 带对
  const groups = groupByRank(cards);
  const results = [];
  for (let start = 3; start <= 14 - k + 1; start++) {
    const end = start + k - 1;
    if (end > 14 || end <= minWeight) continue;
    let ok = true;
    const body = [];
    for (let r = start; r <= end; r++) {
      const cs = groups.get(r) || [];
      if (cs.length < 3) {
        ok = false;
        break;
      }
      body.push(...cs.slice(0, 3));
    }
    if (!ok) continue;

    if (wing === 0) {
      results.push(body);
      continue;
    }

    const used = new Set(body.map((c) => c.id));
    const rest = cards.filter((c) => !used.has(c.id));

    if (wing === 1) {
      // 选 k 张单牌
      if (rest.length < k) continue;
      const kickers = pickN(rest, k, (subset) => {
        // 允许任意 k 张
        return true;
      }, 8);
      for (const ks of kickers) {
        results.push([...body, ...ks]);
      }
    } else if (wing === 2) {
      const rg = groupByRank(rest);
      const pairRanks = [...rg.keys()].filter((r) => rg.get(r).length >= 2);
      if (pairRanks.length < k) continue;
      const pairCombos = combinations(pairRanks, k);
      for (const pr of pairCombos) {
        const ks = [];
        for (const r of pr) ks.push(...rg.get(r).slice(0, 2));
        results.push([...body, ...ks]);
      }
    }
  }
  return results;
}

function findFourWith(cards, kickerPairsOrSingles, asPairs, minWeight) {
  const groups = groupByRank(cards);
  const fours = [...groups.keys()].filter((r) => groups.get(r).length >= 4 && r > minWeight);
  const results = [];
  for (const f of fours) {
    const body = groups.get(f).slice(0, 4);
    const rest = cards.filter((c) => !body.includes(c));
    if (!asPairs) {
      // 两张单
      if (rest.length < 2) continue;
      for (let i = 0; i < rest.length; i++) {
        for (let j = i + 1; j < rest.length; j++) {
          results.push([...body, rest[i], rest[j]]);
        }
      }
    } else {
      const rg = groupByRank(rest);
      const pairRanks = [...rg.keys()].filter((r) => rg.get(r).length >= 2);
      if (pairRanks.length < 2) continue;
      for (let i = 0; i < pairRanks.length; i++) {
        for (let j = i + 1; j < pairRanks.length; j++) {
          results.push([
            ...body,
            ...rg.get(pairRanks[i]).slice(0, 2),
            ...rg.get(pairRanks[j]).slice(0, 2),
          ]);
        }
      }
    }
  }
  return results;
}

function findBombs(cards, minWeight) {
  const groups = groupByRank(cards);
  const results = [];
  for (const [r, cs] of groups) {
    if (cs.length >= 4 && r > minWeight) results.push(cs.slice(0, 4));
  }
  return results;
}

function findRocket(cards) {
  const jokers = cards.filter((c) => c.rank >= 16);
  if (jokers.length === 2) return jokers;
  return null;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const res = [];
  const helper = (start, path) => {
    if (path.length === k) {
      res.push(path.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      helper(i + 1, path);
      path.pop();
    }
  };
  helper(0, []);
  return res;
}

/** 简单取前若干组合，避免爆炸 */
function pickN(cards, n, _pred, limit = 20) {
  if (cards.length < n) return [];
  const res = [];
  const helper = (start, path) => {
    if (res.length >= limit) return;
    if (path.length === n) {
      res.push(path.slice());
      return;
    }
    for (let i = start; i < cards.length; i++) {
      path.push(cards[i]);
      helper(i + 1, path);
      path.pop();
      if (res.length >= limit) return;
    }
  };
  helper(0, []);
  return res;
}

/** 提示：返回一手建议 */
export function getHint(hand, prevHand) {
  const options = findBeatingHands(hand, prevHand);
  if (!options.length) return null;
  // 优先非炸弹最小
  const normal = options.filter((p) => p.type !== HandType.BOMB && p.type !== HandType.ROCKET);
  if (normal.length) return normal[0];
  return options[0];
}

export function removeCards(hand, played) {
  const ids = new Set(played.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
}

export function cardsEqualSet(a, b) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((c) => c.id));
  return b.every((c) => ids.has(c.id));
}
