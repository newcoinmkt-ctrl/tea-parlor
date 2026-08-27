/**
 * 天地癞子 · 简化可玩规则
 * - 某一点数（3–2）为癞子，大小王不是癞子
 * - 癞子可当任意牌（除与王组火箭）
 * - 支持：单、对、三、三带、顺子、连对、炸弹（软炸/硬炸）
 * - 硬炸（纯 4 张）> 软炸（带癞子）> 同型比较
 */

import { groupByRank } from './card.js';
import { HandType, parseHand, canBeat as canBeatClassic } from './rules.js';

export function isWildCard(card, wildRank) {
  if (!card || wildRank == null) return false;
  if (card.rank >= 16) return false; // 王不是癞子
  return card.rank === wildRank;
}

/**
 * 解析一手牌（癞子模式）
 * @returns {{ type, weight, length, cards, soft?, wildUsed? } | null}
 */
export function parseHandLaizi(cards, wildRank) {
  if (!cards?.length) return null;
  if (wildRank == null) return parseHand(cards);

  // 先按经典解析（硬牌型优先）
  const pure = parseHand(cards);
  if (pure) {
    return { ...pure, soft: false, wildUsed: 0 };
  }

  const wilds = cards.filter((c) => isWildCard(c, wildRank));
  const normals = cards.filter((c) => !isWildCard(c, wildRank));
  const nW = wilds.length;
  const n = cards.length;
  if (nW === 0) return null;

  // 火箭不能用癞子凑
  // 软炸弹：4 张，用癞子凑齐同一 rank
  if (n === 4) {
    const groups = groupByRank(normals);
    const ranks = [...groups.keys()];
    if (ranks.length === 0) {
      // 4 癞子 = 软炸最大之一
      return { type: HandType.BOMB, weight: wildRank, length: 4, cards, soft: true, wildUsed: nW };
    }
    if (ranks.length === 1) {
      const r = ranks[0];
      const have = groups.get(r).length;
      if (have + nW === 4) {
        return { type: HandType.BOMB, weight: r, length: 4, cards, soft: true, wildUsed: nW };
      }
    }
    // 3+1 癞子当三带一
    if (ranks.length === 1 && groups.get(ranks[0]).length + nW === 4 && nW >= 1) {
      // 可能是三带一或炸弹已上
    }
  }

  // 单牌：1 癞子 or 1 普通
  if (n === 1) {
    const r = normals[0]?.rank ?? wildRank;
    return { type: HandType.SINGLE, weight: r, length: 1, cards, soft: nW > 0, wildUsed: nW };
  }

  // 对子：2 同点 + 癞子凑
  if (n === 2) {
    if (normals.length === 0) {
      return { type: HandType.PAIR, weight: wildRank, length: 2, cards, soft: true, wildUsed: 2 };
    }
    if (normals.length === 1 && nW === 1) {
      return { type: HandType.PAIR, weight: normals[0].rank, length: 2, cards, soft: true, wildUsed: 1 };
    }
    if (normals.length === 2 && normals[0].rank === normals[1].rank) {
      return { type: HandType.PAIR, weight: normals[0].rank, length: 2, cards, soft: false, wildUsed: 0 };
    }
    return null;
  }

  // 三张
  if (n === 3) {
    const g = groupByRank(normals);
    const ranks = [...g.keys()];
    if (ranks.length <= 1) {
      const r = ranks[0] ?? wildRank;
      const have = ranks[0] ? g.get(r).length : 0;
      if (have + nW === 3) {
        return { type: HandType.TRIPLE, weight: r, length: 3, cards, soft: nW > 0, wildUsed: nW };
      }
    }
    return null;
  }

  // 三带一
  if (n === 4) {
    // 尝试每个可能的 triple rank
    const g = groupByRank(normals);
    const ranks = [...g.keys()];
    for (const r of ranks) {
      const need = 3 - (g.get(r)?.length || 0);
      if (need < 0 || need > nW) continue;
      const leftWild = nW - need;
      const otherCount = normals.length - (g.get(r)?.length || 0);
      if (otherCount + leftWild === 1) {
        return { type: HandType.TRIPLE_ONE, weight: r, length: 4, cards, soft: nW > 0, wildUsed: nW };
      }
    }
    if (normals.length === 0 && nW === 4) {
      return { type: HandType.BOMB, weight: wildRank, length: 4, cards, soft: true, wildUsed: 4 };
    }
    // 1 普通 + 3 癞子 → 可当炸弹或三带一
    if (normals.length === 1 && nW === 3) {
      return { type: HandType.BOMB, weight: normals[0].rank, length: 4, cards, soft: true, wildUsed: 3 };
    }
  }

  // 三带对
  if (n === 5) {
    const g = groupByRank(normals);
    const ranks = [...g.keys()];
    for (const tr of ranks) {
      const tHave = g.get(tr).length;
      const tNeed = Math.max(0, 3 - tHave);
      if (tNeed > nW) continue;
      let wLeft = nW - tNeed;
      // 其余成对
      const others = ranks.filter((r) => r !== tr);
      if (others.length === 1) {
        const pr = others[0];
        const pHave = g.get(pr).length;
        const pNeed = Math.max(0, 2 - pHave);
        if (pNeed === wLeft && pHave + pNeed === 2) {
          return { type: HandType.TRIPLE_PAIR, weight: tr, length: 5, cards, soft: nW > 0, wildUsed: nW };
        }
      }
      if (others.length === 0 && wLeft === 2) {
        return { type: HandType.TRIPLE_PAIR, weight: tr, length: 5, cards, soft: true, wildUsed: nW };
      }
    }
  }

  // 顺子 ≥5：用癞子填洞，不含 2 王，癞子本身若是 2 可当洞
  if (n >= 5) {
    const st = tryStraight(normals, nW, n, cards);
    if (st) return st;
  }

  // 连对 ≥3 对
  if (n >= 6 && n % 2 === 0) {
    const ps = tryPairStraight(normals, nW, n / 2, cards);
    if (ps) return ps;
  }

  return null;
}

function tryStraight(normals, nW, n, cards) {
  // 只能用 3-A
  const ranks = normals.map((c) => c.rank).filter((r) => r >= 3 && r <= 14);
  if (normals.some((c) => c.rank === 15 || c.rank >= 16)) return null;
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  if (uniq.length + nW < n) return null;
  // 枚举顺子终点 high（3+n-1 .. 14）
  for (let high = 14; high >= 3 + n - 1; high--) {
    const low = high - n + 1;
    if (low < 3) continue;
    const need = [];
    for (let r = low; r <= high; r++) need.push(r);
    let missing = 0;
    const have = new Set(uniq);
    for (const r of need) {
      if (!have.has(r)) missing += 1;
    }
    // 不能有 need 外的普通牌
    if (uniq.some((r) => r < low || r > high)) continue;
    // 重复普通牌不行（顺子每点最多 1）
    const cnt = {};
    for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
    if (Object.values(cnt).some((c) => c > 1)) continue;
    if (missing <= nW && uniq.length + missing === n) {
      return {
        type: HandType.STRAIGHT,
        weight: high,
        length: n,
        cards,
        soft: nW > 0,
        wildUsed: missing,
      };
    }
  }
  return null;
}

function tryPairStraight(normals, nW, pairCount, cards) {
  if (pairCount < 3) return null;
  if (normals.some((c) => c.rank === 15 || c.rank >= 16)) return null;
  const g = groupByRank(normals);
  const ranks = [...g.keys()].filter((r) => r >= 3 && r <= 14).sort((a, b) => a - b);
  for (let high = 14; high >= 3 + pairCount - 1; high--) {
    const low = high - pairCount + 1;
    if (low < 3) continue;
    let needWild = 0;
    let ok = true;
    for (let r = low; r <= high; r++) {
      const have = g.get(r)?.length || 0;
      if (have > 2) {
        ok = false;
        break;
      }
      needWild += 2 - have;
    }
    // 区间外不能有普通牌
    if (ranks.some((r) => r < low || r > high)) continue;
    if (ok && needWild === nW) {
      return {
        type: HandType.PAIR_STRAIGHT,
        weight: high,
        length: pairCount,
        cards,
        soft: nW > 0,
        wildUsed: nW,
      };
    }
  }
  return null;
}

/**
 * 癞子模式压制
 * 火箭 > 硬炸 > 软炸 > 同型比 weight
 */
export function canBeatLaizi(prev, next) {
  if (!next) return false;
  if (!prev) return next.type !== HandType.INVALID;

  if (prev.type === HandType.ROCKET) return false;
  if (next.type === HandType.ROCKET) return true;

  if (next.type === HandType.BOMB && prev.type !== HandType.BOMB) return true;
  if (prev.type === HandType.BOMB && next.type !== HandType.BOMB) return false;

  if (next.type === HandType.BOMB && prev.type === HandType.BOMB) {
    // 硬炸大于软炸
    const prevSoft = !!prev.soft;
    const nextSoft = !!next.soft;
    if (prevSoft !== nextSoft) return prevSoft && !nextSoft; // next 硬炸压软炸
    return next.weight > prev.weight;
  }

  if (next.type !== prev.type) return false;
  if (next.length !== prev.length) return false;
  return next.weight > prev.weight;
}

/** 统一入口：按是否癞子选择解析 */
export function parseHandMode(cards, wildRank = null) {
  if (wildRank != null) return parseHandLaizi(cards, wildRank);
  return parseHand(cards);
}

export function canBeatMode(prev, next, wildRank = null) {
  if (wildRank != null) return canBeatLaizi(prev, next);
  return canBeatClassic(prev, next);
}

/**
 * 癞子提示：从手牌找一手能压 prev 的（简化穷举组合上限）
 */
export function getHintLaizi(hand, prev, wildRank) {
  if (!hand?.length) return null;

  // 跟牌时优先尝试炸弹/火箭能压住的
  if (prev) {
    const bombs = findLaiziBombs(hand, wildRank);
    for (const b of bombs) {
      const p = parseHandLaizi(b, wildRank);
      if (p && canBeatLaizi(prev, p)) return p;
    }
  }

  // 枚举小组合（自由出优先非炸）
  const maxN = prev ? Math.min(hand.length, Math.max(prev.length || 1, 8)) : Math.min(hand.length, 6);
  const combos = enumCombos(hand, maxN, 120);
  let best = null;
  for (const cards of combos) {
    const p = parseHandLaizi(cards, wildRank);
    if (!p) continue;
    if (p.type === HandType.ROCKET || p.type === HandType.BOMB) continue;
    if (prev && !canBeatLaizi(prev, p)) continue;
    if (!best) best = p;
    else if (p.length < best.length) best = p;
    else if (p.length === best.length && p.weight < best.weight) best = p;
  }
  if (best) return best;

  // 自由出：最小单
  if (!prev) {
    const sorted = hand.slice().sort((a, b) => a.rank - b.rank);
    return parseHandLaizi([sorted[0]], wildRank);
  }

  // 跟牌无普通牌型可压：再试炸弹
  const bombs = findLaiziBombs(hand, wildRank);
  for (const b of bombs) {
    const p = parseHandLaizi(b, wildRank);
    if (p && canBeatLaizi(prev, p)) return p;
  }
  return null;
}

function findLaiziBombs(hand, wildRank) {
  const wilds = hand.filter((c) => isWildCard(c, wildRank));
  const normals = hand.filter((c) => !isWildCard(c, wildRank));
  const g = groupByRank(normals);
  const out = [];
  for (const [r, cs] of g) {
    if (cs.length === 4) out.push(cs.slice(0, 4));
    else if (cs.length + wilds.length >= 4) {
      const need = 4 - cs.length;
      out.push([...cs, ...wilds.slice(0, need)]);
    }
  }
  if (wilds.length >= 4) out.push(wilds.slice(0, 4));
  return out;
}

function enumCombos(hand, maxN, limit) {
  const res = [];
  const n = hand.length;
  function rec(start, acc) {
    if (res.length >= limit) return;
    if (acc.length > 0 && acc.length <= maxN) res.push(acc.slice());
    if (acc.length >= maxN) return;
    for (let i = start; i < n; i++) {
      acc.push(hand[i]);
      rec(i + 1, acc);
      acc.pop();
      if (res.length >= limit) return;
    }
  }
  rec(0, []);
  return res;
}
