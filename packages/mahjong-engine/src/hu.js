/**
 * 四川麻将胡牌判定（定缺后）
 * - 手牌不得含定缺花色
 * - 4 面子 + 1 将（含已亮碰/杠的面子数）
 */

import { tileKey } from './tiles.js';

/**
 * @param {object[]} concealed  暗手（含刚摸入）
 * @param {number} completedMelds  已亮面子数（碰/杠各算 1）
 * @param {number|null} missingSuit  定缺 0/1/2；null 表示未定缺 → 不可胡
 */
export function canHu(concealed, completedMelds = 0, missingSuit = null) {
  if (missingSuit == null) return false;
  if (!Array.isArray(concealed)) return false;

  // 未打缺：手中仍有定缺花色则不可胡
  if (concealed.some((t) => t.suit === missingSuit)) return false;

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
  return false;
}

/**
 * 听牌：打出一张后，存在某种摸入可胡
 * @returns {object[]}  可打出的牌（去重按 key）
 */
export function findTingDiscards(concealed, completedMelds, missingSuit) {
  if (missingSuit == null) return [];
  const results = [];
  const seen = new Set();
  for (let i = 0; i < concealed.length; i++) {
    const discard = concealed[i];
    const rest = concealed.filter((_, j) => j !== i);
    // 枚举可能进张（简化：同花色 1–9 + 他色）
    for (let suit = 0; suit < 3; suit++) {
      if (suit === missingSuit) continue;
      for (let rank = 1; rank <= 9; rank++) {
        const trial = [...rest, { id: `probe_${suit}_${rank}`, suit, rank }];
        if (canHu(trial, completedMelds, missingSuit)) {
          const k = tileKey(discard);
          if (!seen.has(k)) {
            seen.add(k);
            results.push(discard);
          }
          break;
        }
      }
    }
  }
  return results;
}

/**
 * 是否听某张具体牌（进张）
 */
export function isWaitingFor(concealed, completedMelds, missingSuit, tile) {
  if (!tile || missingSuit == null) return false;
  if (tile.suit === missingSuit) return false;
  return canHu([...concealed, tile], completedMelds, missingSuit);
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
  // 刻子
  if (cnt >= 3) {
    counts.set(first, cnt - 3);
    if (canFormNMelds(counts, n - 1)) {
      counts.set(first, cnt);
      return true;
    }
    counts.set(first, cnt);
  }
  // 顺子（万条筒 rank 1–7）
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
