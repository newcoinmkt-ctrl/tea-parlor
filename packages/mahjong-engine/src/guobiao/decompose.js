/**
 * 国标手牌结构分解：4 面子 + 1 将 / 七对 / 十三幺
 */

import {
  count34,
  isOrdinal,
  isHonor,
  toId34,
} from './tiles34.js';

/**
 * @typedef {'chi'|'peng'|'minggang'|'angang'} MeldType
 * @typedef {{ type: MeldType, tiles?: object[], tile34?: number, open?: boolean }} Meld
 */

/**
 * 规范化副露
 * @param {Meld[]} melds
 * @returns {{ type: string, tile34: number, open: boolean, isKong: boolean, isConcealed: boolean }[]}
 */
export function normalizeMelds(melds = []) {
  return (melds || []).map((m, i) => {
    let tile34 = m.tile34;
    if (tile34 == null && m.tiles?.length) {
      tile34 = toId34(m.tiles[0]);
    }
    if (tile34 == null && m.suit != null) {
      tile34 = toId34(m);
    }
    const type = String(m.type || 'peng').toLowerCase();
    const isKong = type.includes('gang') || type === 'kong';
    const isConcealed = type === 'angang' || type === 'an_gang' || m.open === false;
    const isChi = type === 'chi' || type === 'chow';
    return {
      id: m.id || `meld_${i}`,
      type: isChi ? 'chi' : isKong ? (isConcealed ? 'angang' : 'minggang') : 'peng',
      tile34: tile34 ?? 0,
      tiles: m.tiles,
      open: m.open !== false && !isConcealed,
      isKong,
      isConcealed,
      isChi,
      isPung: !isChi && !isKong,
    };
  });
}

/**
 * 尝试分解标准型
 * @returns {Array<{ pair: number, melds: object[], concealedMelds: object[] }>}
 */
export function decomposeStandard(concealedCards, openMelds = []) {
  const fixed = normalizeMelds(openMelds);
  const needConcealedMelds = 4 - fixed.length;
  if (needConcealedMelds < 0) return [];

  const counts = count34(concealedCards);
  const expect = needConcealedMelds * 3 + 2;
  let n = 0;
  for (let i = 0; i < 34; i++) n += counts[i];
  if (n !== expect) return [];

  const results = [];
  const seen = new Set();

  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const found = [];
    searchMelds(counts, needConcealedMelds, [], found);
    counts[pair] += 2;

    for (const cm of found) {
      const key = `${pair}|${cm.map((m) => `${m.k}:${m.t}`).sort().join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        pair,
        melds: [...fixed, ...cm.map(expandMeld)],
        concealedMelds: cm.map(expandMeld),
        allMelds: [...fixed, ...cm.map(expandMeld)],
      });
    }
  }
  return results;
}

function expandMeld(m) {
  return {
    type: m.t === 'c' ? 'chi' : m.t === 'k' ? 'peng' : 'peng',
    tile34: m.k,
    isChi: m.t === 'c',
    isPung: m.t === 'k',
    isKong: false,
    isConcealed: true,
    open: false,
  };
}

function searchMelds(counts, remain, path, out) {
  if (remain === 0) {
    let empty = true;
    for (let i = 0; i < 34; i++) if (counts[i] > 0) empty = false;
    if (empty) out.push(path.slice());
    return;
  }

  let i = 0;
  while (i < 34 && counts[i] === 0) i += 1;
  if (i >= 34) return;

  // 刻子
  if (counts[i] >= 3) {
    counts[i] -= 3;
    path.push({ k: i, t: 'k' });
    searchMelds(counts, remain - 1, path, out);
    path.pop();
    counts[i] += 3;
  }

  // 顺子
  if (isOrdinal(i) && i % 9 <= 6) {
    const a = i;
    const b = i + 1;
    const c = i + 2;
    if (counts[a] > 0 && counts[b] > 0 && counts[c] > 0) {
      counts[a]--; counts[b]--; counts[c]--;
      path.push({ k: i, t: 'c' });
      searchMelds(counts, remain - 1, path, out);
      path.pop();
      counts[a]++; counts[b]++; counts[c]++;
    }
  }
}

/** 七对 */
export function isSevenPairs(concealedCards) {
  if (!concealedCards || concealedCards.length !== 14) return false;
  const c = count34(concealedCards);
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (c[i] === 2) pairs += 1;
    else if (c[i] === 4) pairs += 2; // 国标七对允许两对相同（龙七对另计）
    else if (c[i] !== 0) return false;
  }
  return pairs === 7;
}

/** 十三幺 */
export function isThirteenOrphans(concealedCards) {
  if (!concealedCards || concealedCards.length !== 14) return false;
  const c = count34(concealedCards);
  const yao = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let pair = false;
  for (const id of yao) {
    if (c[id] === 0) return false;
    if (c[id] === 2) {
      if (pair) return false;
      pair = true;
    } else if (c[id] !== 1) return false;
  }
  for (let i = 0; i < 34; i++) {
    if (!yao.includes(i) && c[i] > 0) return false;
  }
  return pair;
}

/**
 * 全牌 count（手牌暗+副露展示牌+胡牌）
 */
export function allTilesList(hand, melds, winningCard, winFromWall = true) {
  const list = [...(hand || [])];
  // 若 winningCard 已在 hand 中（自摸），不重复
  if (winningCard && !winFromWall) {
    // 点炮：胡牌可能不在 hand
    const has = hand?.some((t) => toId34(t) === toId34(winningCard) && t.id === winningCard.id);
    if (!has) list.push(winningCard);
  }
  for (const m of normalizeMelds(melds)) {
    if (m.tiles?.length) list.push(...m.tiles);
    else {
      // 用 tile34 展开
      const n = m.isKong ? 4 : m.isChi ? 3 : 3;
      if (m.isChi) {
        for (let k = 0; k < 3; k++) {
          list.push({ tile34: m.tile34 + k, suit: Math.floor((m.tile34 + k) / 9), rank: ((m.tile34 + k) % 9) + 1 });
        }
      } else {
        for (let k = 0; k < n; k++) {
          list.push({ tile34: m.tile34 });
        }
      }
    }
  }
  return list;
}
