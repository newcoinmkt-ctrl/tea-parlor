/**
 * 红中百搭 / 鬼牌 胡牌判定引擎（高性能）
 *
 * 规则：
 *   - 红中（或外部给定 wildcardsCount）可充当任意序数牌（万/条/筒 1–9）
 *   - 标准胡：4 面子 + 1 将；面子=刻子或同色顺子
 *
 * 算法：
 *   1. 将普通牌压成 3 门 × 9 点的 count 数组（0–4）
 *   2. 枚举将牌来源（某点对 / 纯双鬼）
 *   3. 每门花色独立求「凑成完整面子」所需最小鬼数（递归+base5 记忆化）
 *   4. 三门最小鬼数之和 ≤ 剩余鬼牌 → 可胡
 *
 * 复杂度：单门状态 ≤ 5^9≈2e5 理论上界，实际手牌稀疏，单次判定通常 << 0.1ms
 */

/** 红中默认编码：suit=4, rank=1（与四川 0–2 序数牌区分） */
export const ZHONG_SUIT = 4;
export const ZHONG_RANK = 1;

export const HuType = Object.freeze({
  STANDARD: 'standard',           // 标准 4 面子+1 将（含鬼）
  HARD_HU: 'hard_hu',             // 硬胡：无鬼参与（wild 全未使用）
  ZHONG_PAIR: 'zhong_as_pair',    // 红中作将
  ZHONG_GANG: 'zhong_gang',       // 红中杠（四红中亮杠形）
  FOUR_ZHONG: 'four_zhong',       // 四红中暴胡
  SEVEN_PAIRS: 'seven_pairs',     // 七对（可选，鬼补对）
  PURE_WILD_PAIR: 'pure_wild_pair', // 将为双鬼
  ALL_PUNGS: 'all_pungs',         // 碰碰胡（面子全为刻）
});

/**
 * @typedef {object} Card
 * @property {number} suit
 * @property {number} rank
 * @property {boolean} [isWild]
 * @property {boolean} [isZhong]
 */

/**
 * @typedef {object} HuResult
 * @property {boolean} isHu
 * @property {string[]} huTypes
 * @property {number} [minWildsNeeded]
 * @property {number} [wildsUsed]
 * @property {number} [wildsSpare]
 * @property {object} [detail]
 */

/**
 * 是否红中 / 百搭牌
 * @param {Card} c
 * @param {{ wildSuits?: number[], wildRanks?: number[] }} [opts]
 */
export function isWildcardTile(c, opts = {}) {
  if (!c) return false;
  if (c.isWild === true || c.isZhong === true) return true;
  if (c.suit === ZHONG_SUIT && (c.rank === ZHONG_RANK || c.rank == null)) return true;
  // 兼容 suit=3/4 的「中」
  if ((c.suit === 3 || c.suit === 4) && (c.rank === 1 || c.rank === '中' || c.rank === 5)) {
    // 仅当明确是中：四川字牌中= suit4 rank1；部分库用 rank 中文
    if (c.rank === 1 || c.rank === '中') return true;
  }
  if (opts.wildSuits && opts.wildSuits.includes(c.suit)) return true;
  return false;
}

/**
 * 从手牌统计：普通序数 count[3][9]、鬼牌数量
 * @param {Card[]} handCards
 * @param {number} [wildcardsCount]  若给定则覆盖手牌内红中计数（手牌中的红中仍应先剔除）
 * @param {object} [opts]
 * @returns {{ counts: Int8Array, wilds: number, zhongInHand: number, totalTiles: number }}
 */
export function splitHandAndWilds(handCards, wildcardsCount, opts = {}) {
  const counts = new Int8Array(27); // 3*9
  let zhongInHand = 0;
  let normal = 0;

  for (const c of handCards || []) {
    if (isWildcardTile(c, opts)) {
      zhongInHand += 1;
      continue;
    }
    if (c.suit < 0 || c.suit > 2 || c.rank < 1 || c.rank > 9) continue;
    counts[c.suit * 9 + (c.rank - 1)] += 1;
    normal += 1;
  }

  // wildcardsCount 优先；否则用手牌内红中数。
  // 注意：红中已从 counts 剥离，不可再把 zhong 算进 normal。
  const wilds = wildcardsCount != null && Number.isFinite(wildcardsCount)
    ? Math.max(0, wildcardsCount | 0)
    : zhongInHand;

  return {
    counts,
    wilds,
    zhongInHand,
    totalTiles: normal + wilds,
    normalCount: normal,
  };
}

// ─── 单门最小鬼数（仅面子） ─────────────────────────

/** base5 编码 9 位 count（每格 0–4） */
function encode9(c) {
  // c: array-like length 9
  let k = 0;
  // 低位 = rank1，便于调试
  for (let i = 0; i < 9; i++) k = k * 5 + (c[i] | 0);
  return k;
}

/**
 * 计算将一门花色「全部吃成面子（无将、无孤张）」所需最小鬼牌数。
 * @param {Int8Array|number[]} src  length 9
 * @param {Map<number, number>} memo
 * @returns {number}  0..∞(99)
 */
export function minWildsForSuitMelds(src, memo = new Map()) {
  const counts = new Int8Array(9);
  for (let i = 0; i < 9; i++) counts[i] = src[i] | 0;
  return minWildsMeldsDfs(counts, memo);
}

function minWildsMeldsDfs(counts, memo) {
  const key = encode9(counts);
  if (memo.has(key)) return memo.get(key);

  // 定位第一张非 0
  let i = 0;
  while (i < 9 && counts[i] === 0) i += 1;
  if (i === 9) {
    memo.set(key, 0);
    return 0;
  }

  let best = 99;
  const c = counts[i];

  // —— 刻子：需要 3 张，现有 c，缺 max(0,3-c)，但若 c>=4 可先拆 1 刻留下 c-3
  // 对当前点尝试做 1 个刻子（最常用）
  {
    const need = Math.max(0, 3 - c);
    // 即使 c=0 不会进到这里
    const useTiles = Math.min(c, 3);
    counts[i] = c - useTiles;
    const sub = minWildsMeldsDfs(counts, memo);
    counts[i] = c;
    best = Math.min(best, need + sub);
  }

  // c >= 4：再试拆 1 刻后剩 c-3（上面 useTiles=3 已覆盖 c>=3 的剩 c-3）
  // c==2 或 1 时上面 need>0 已覆盖用鬼补刻

  // 若 c >= 6，两个刻：可选再试（一般 4 张上限，四川/标准每点最多 4）
  if (c === 4) {
    // 一个刻 + 剩 1：上面刻后剩 1，会由后续顺/刻处理
    // 也可用 2 鬼补成两个刻：need=2，剩 0
    counts[i] = 0;
    const sub = minWildsMeldsDfs(counts, memo);
    counts[i] = c;
    best = Math.min(best, 2 + sub); // 4+2鬼=2刻
  }

  // —— 顺子 i, i+1, i+2
  if (i <= 6) {
    // 至少用 1 张当前牌进顺（否则死循环用纯鬼开顺无意义，由刻处理）
    // 枚举「这一组顺」消耗当前点 1 张（若 c>0）
    if (c > 0) {
      const a = i;
      const b = i + 1;
      const d = i + 2;
      const cb = counts[b];
      const cd = counts[d];
      // 各位置缺
      // 必须用掉至少一张 a
      counts[a] = c - 1;
      let need = 0;
      if (cb > 0) counts[b] = cb - 1;
      else need += 1;
      if (cd > 0) counts[d] = cd - 1;
      else need += 1;
      const sub = minWildsMeldsDfs(counts, memo);
      counts[a] = c;
      counts[b] = cb;
      counts[d] = cd;
      best = Math.min(best, need + sub);
    }
  }

  // —— 若当前点很多，也可先拆顺再处理（上面只减 1 递归会继续）

  memo.set(key, best);
  return best;
}

/**
 * 全局：在已去掉将牌后，三门面子所需最小鬼
 * @param {Int8Array} counts27
 * @param {Map} memo
 */
function minWildsAllMelds(counts27, memo) {
  let sum = 0;
  for (let s = 0; s < 3; s++) {
    const slice = counts27.subarray(s * 9, s * 9 + 9);
    sum += minWildsForSuitMelds(slice, memo);
    if (sum >= 99) return 99;
  }
  return sum;
}

/**
 * 计算凑成 4 面子 + 1 将所需最小鬼牌数
 * @param {Int8Array} counts27  会被复制
 * @param {number} wilds
 * @returns {{ ok: boolean, minWilds: number, pairKind: string, pairKey: number, allPungs: boolean }}
 */
export function minWildsForStandardHu(counts27, wilds) {
  const memo = new Map();
  let best = 99;
  let bestMeta = { pairKind: 'none', pairKey: -1 };

  // 1) 纯双鬼作将
  if (wilds >= 2) {
    const need = minWildsAllMelds(counts27, memo);
    const used = 2 + need;
    if (used < best) {
      best = used;
      bestMeta = { pairKind: 'pure_wild', pairKey: -1 };
    }
  }

  // 2) 某点作将
  for (let k = 0; k < 27; k++) {
    const c = counts27[k];
    if (c <= 0 && wilds < 2) continue;
    const needPair = Math.max(0, 2 - c);
    if (needPair > wilds) continue;

    const saved = counts27[k];
    counts27[k] = Math.max(0, c - 2);
    const needMelds = minWildsAllMelds(counts27, memo);
    counts27[k] = saved;

    const used = needPair + needMelds;
    if (used < best) {
      best = used;
      bestMeta = { pairKind: 'tile', pairKey: k };
    }
  }

  return {
    ok: best <= wilds,
    minWilds: best,
    pairKind: bestMeta.pairKind,
    pairKey: bestMeta.pairKey,
    allPungs: false, // 下面可选检测
  };
}

/**
 * 碰碰胡：全刻 + 将（顺子不允许）— 快速路径
 */
function minWildsAllPungs(counts27, wilds) {
  let best = 99;
  let pairKind = 'none';
  let pairKey = -1;

  const scorePungs = (pairCost, counts) => {
    let need = pairCost;
    for (let k = 0; k < 27; k++) {
      const c = counts[k];
      if (c === 0) continue;
      if (c === 1) need += 2;
      else if (c === 2) need += 1;
      else if (c === 3) need += 0;
      else if (c === 4) need += 2;
      else need += 99;
    }
    return need;
  };

  if (wilds >= 2) {
    const need = scorePungs(2, counts27);
    if (need < best) {
      best = need;
      pairKind = 'pure_wild';
      pairKey = -1;
    }
  }
  for (let k = 0; k < 27; k++) {
    const c = counts27[k];
    const pairCost = Math.max(0, 2 - c);
    if (pairCost > wilds) continue;
    const copy = counts27.slice();
    copy[k] = Math.max(0, c - 2);
    const need = scorePungs(pairCost, copy);
    if (need < best) {
      best = need;
      pairKind = 'tile';
      pairKey = k;
    }
  }
  return { ok: best <= wilds, minWilds: best, pairKind, pairKey };
}

/**
 * 七对：7 个对子，鬼可补
 */
function minWildsSevenPairs(counts27, wilds) {
  let odd = 0;
  let tiles = 0;
  for (let i = 0; i < 27; i++) {
    const c = counts27[i];
    tiles += c;
    if (c & 1) odd += 1;
    // 4 张 = 2 对，ok；3 张 = 1 对 + 1 单
  }
  // 需要 14 张：normal + wilds
  // 每个奇数点需要 1 鬼凑对；凑完对后对子数 = (tiles + wilds_used_for_pair) / 2
  // 七对：最终 7 对。若某点 4 张算 2 对。
  // 简化：孤张数 odd，需要至少 odd 个鬼把奇数抹平；
  // 抹平后对子数 pairs = (tiles + odd) / 2 = ceil 处理
  // 总张数 N = tiles + wilds 必须为 14
  // 鬼用于：补奇数 + 补全新对
  if ((tiles + wilds) !== 14 && (tiles + wilds) !== 16) {
    // 允许 14 标准七对
  }
  const total = tiles + wilds;
  if (total !== 14) {
    return { ok: false, minWilds: 99 };
  }
  // 需要的最小鬼：至少 odd（凑成偶数张每点），且 (tiles+used) 能形成 7 对
  // 对子数 = (tiles + used) / 2，且 used >= odd，(tiles+used) even
  // used ≡ odd (mod 1) already used>=odd and tiles+used even → used%2 == (14-tiles)%2
  const needParity = wilds; // we'll compute min used
  let minUsed = odd;
  if ((tiles + minUsed) % 2 === 1) minUsed += 1;
  // 对子数
  const pairs = (tiles + minUsed) / 2;
  // 若 pairs < 7，需要额外 2 鬼加一对
  if (pairs < 7) {
    minUsed += (7 - pairs) * 2;
  }
  // 若某点超 2 对（4 张=2），已计入 pairs
  return { ok: minUsed <= wilds, minWilds: minUsed };
}

// ─── 主 API ─────────────────────────────────────────

/**
 * 红中百搭胡牌判定
 *
 * @param {Card[]} handCards
 * @param {number} wildcardsCount  鬼牌数量（若 hand 已含红中，引擎会剥离并保证 wilds≥红中数）
 * @param {{
 *   allowSevenPairs?: boolean,
 *   completedMelds?: number,
 *   autoZhong?: boolean,
 * }} [options]
 * @returns {HuResult}
 */
export function canHuWithWildcards(handCards, wildcardsCount, options = {}) {
  const allowSevenPairs = options.allowSevenPairs !== false;
  const completedMelds = options.completedMelds ?? 0;

  const { counts, wilds, zhongInHand, normalCount } = splitHandAndWilds(
    handCards,
    wildcardsCount,
    options
  );

  const totalTiles = normalCount + wilds;
  const needMelds = 4 - completedMelds;
  const expectLen = needMelds * 3 + 2;

  const huTypes = [];
  const detail = {
    wilds,
    zhongInHand,
    normalCount,
    totalTiles,
    minWildsStandard: 99,
  };

  // —— 特殊：四红中暴胡 ——
  // 至少 4 张红中/鬼，且总张数满足可胡长度（14 或 expectLen）
  if (wilds >= 4 && (totalTiles === 14 || totalTiles === expectLen)) {
    // 四红中直接胡：剩余 10 张也须能与 0 鬼形成结构，或全部为鬼
    if (wilds >= 4) {
      huTypes.push(HuType.FOUR_ZHONG);
      // 剩余牌 + (wilds-4) 做标准胡
      const restWilds = wilds - 4;
      if (normalCount === 0 && wilds >= 14) {
        // 全鬼
        return {
          isHu: true,
          huTypes: unique([HuType.FOUR_ZHONG, HuType.STANDARD, HuType.PURE_WILD_PAIR]),
          minWildsNeeded: 0,
          wildsUsed: wilds,
          wildsSpare: 0,
          detail,
        };
      }
      const sub = minWildsForStandardHu(counts, restWilds);
      detail.minWildsStandard = sub.minWilds + 4;
      if (sub.ok || normalCount + restWilds === 10 && sub.minWilds <= restWilds) {
        if (sub.ok) {
          huTypes.push(HuType.STANDARD);
          if (sub.pairKind === 'pure_wild') huTypes.push(HuType.PURE_WILD_PAIR);
          if (sub.pairKind === 'tile' && wilds >= 4) {
            // 四红中 + 红中可能还作将 → 若 will use wilds for pair
          }
        }
      }
      // 四红中本身即可暴胡（部分规则剩余任意+鬼凑满）
      // 严格：四红中 + 剩余合法
      if (sub.ok) {
        tagZhongPair(huTypes, sub, wilds);
        return finalize(true, huTypes, sub.minWilds, wilds, detail);
      }
      // 宽松暴胡：仅要求有 4 红中且总 14 张（其余用鬼自由）
      if (totalTiles === 14 && wilds >= 4) {
        // 再验一次标准
        const full = minWildsForStandardHu(counts, wilds);
        if (full.ok) {
          huTypes.push(HuType.STANDARD);
          tagZhongPair(huTypes, full, wilds);
          return finalize(true, unique(huTypes), full.minWilds, wilds, detail);
        }
      }
    }
  }

  // —— 红中杠：4 红中（不一定胡）识别为番型标记（胡时附带）
  if (zhongInHand >= 4 || wilds >= 4) {
    // 仅标记，不单独返回
    detail.hasZhongGang = true;
  }

  // 张数门控
  if (totalTiles !== expectLen && totalTiles !== 14) {
    // 七对必须 14
    if (!(allowSevenPairs && totalTiles === 14)) {
      return { isHu: false, huTypes: [], minWildsNeeded: 99, wildsUsed: 0, wildsSpare: wilds, detail };
    }
  }

  // —— 标准胡 ——
  if (totalTiles === expectLen || totalTiles === 14) {
    // completedMelds>0 时 expectLen 更短，counts 仅暗牌
    const std = minWildsForStandardHu(counts, wilds);
    detail.minWildsStandard = std.minWilds;
    if (std.ok) {
      huTypes.push(HuType.STANDARD);
      if (std.minWilds === 0) huTypes.push(HuType.HARD_HU);
      tagZhongPair(huTypes, std, wilds);
      // 碰碰胡
      const pung = minWildsAllPungs(counts, wilds);
      if (pung.ok) huTypes.push(HuType.ALL_PUNGS);
      if (detail.hasZhongGang) huTypes.push(HuType.ZHONG_GANG);
      return finalize(true, unique(huTypes), std.minWilds, wilds, detail);
    }
  }

  // —— 七对 ——
  if (allowSevenPairs && totalTiles === 14 && completedMelds === 0) {
    const sp = minWildsSevenPairs(counts, wilds);
    detail.minWildsSevenPairs = sp.minWilds;
    if (sp.ok) {
      huTypes.push(HuType.SEVEN_PAIRS);
      if (sp.minWilds === 0) huTypes.push(HuType.HARD_HU);
      if (wilds >= 4) huTypes.push(HuType.FOUR_ZHONG);
      if (detail.hasZhongGang) huTypes.push(HuType.ZHONG_GANG);
      return finalize(true, unique(huTypes), sp.minWilds, wilds, detail);
    }
  }

  return {
    isHu: false,
    huTypes: [],
    minWildsNeeded: detail.minWildsStandard,
    wildsUsed: 0,
    wildsSpare: wilds,
    detail,
  };
}

function tagZhongPair(huTypes, std, wilds) {
  if (std.pairKind === 'pure_wild') {
    huTypes.push(HuType.ZHONG_PAIR);
    huTypes.push(HuType.PURE_WILD_PAIR);
  } else if (std.pairKind === 'tile' && std.minWilds > 0) {
    // 用了鬼：可能补将对
    // 若 needPair>0 则红中作将
    huTypes.push(HuType.ZHONG_PAIR);
  }
  // 有鬼参与将：pure_wild 或 对子缺张
  if (wilds >= 4) huTypes.push(HuType.FOUR_ZHONG);
}

function finalize(isHu, huTypes, minWilds, wilds, detail) {
  return {
    isHu,
    huTypes,
    minWildsNeeded: minWilds,
    wildsUsed: Math.min(wilds, minWilds),
    wildsSpare: Math.max(0, wilds - minWilds),
    detail,
  };
}

function unique(arr) {
  return [...new Set(arr)];
}

/**
 * 构造含红中的牌库（序数 108 + 8 红中 = 116，常见红中麻将）
 * @param {typeof import('./tiles.js').createTile} createTile
 */
export function createZhongWildcardDeck(createNumberTiles, createZhong) {
  const deck = createNumberTiles();
  for (let i = 0; i < 8; i++) {
    deck.push(createZhong ? createZhong(i) : { id: `zhong_${i}`, suit: ZHONG_SUIT, rank: ZHONG_RANK, isZhong: true, isWild: true });
  }
  return deck;
}

/**
 * 性能测试辅助：连续判定
 */
export function benchmarkHu(handCards, wildcardsCount, times = 1000) {
  const t0 = performance.now();
  let ok = 0;
  for (let i = 0; i < times; i++) {
    if (canHuWithWildcards(handCards, wildcardsCount).isHu) ok += 1;
  }
  const ms = performance.now() - t0;
  return { totalMs: ms, avgMs: ms / times, hits: ok };
}

export default {
  canHuWithWildcards,
  minWildsForSuitMelds,
  minWildsForStandardHu,
  splitHandAndWilds,
  isWildcardTile,
  HuType,
  ZHONG_SUIT,
  ZHONG_RANK,
  createZhongWildcardDeck,
  benchmarkHu,
};
