/**
 * 换三张 + 定缺
 */

import { countBySuit, sortHand, tileKey } from './tiles.js';

export const EXCHANGE_DIR = Object.freeze({
  CLOCKWISE: 'clockwise',       // 下家：0→1→2→3→0
  COUNTER: 'counterclockwise',  // 上家
  ACROSS: 'across',             // 对家 0↔2, 1↔3
});

/**
 * 自动推荐定缺花色：张数最少；并列时优先万(0)<条(1)<筒(2) 或优先「价值低」
 * @param {object[]} hand
 * @returns {number} 0 万 / 1 条 / 2 筒
 */
export function chooseMissingSuit(hand) {
  if (!Array.isArray(hand) || !hand.length) return 0;
  const counts = countBySuit(hand);
  let best = 0;
  let min = counts[0];
  for (let s = 1; s < 3; s++) {
    if (counts[s] < min) {
      min = counts[s];
      best = s;
    }
  }
  return best;
}

/**
 * 为换三张推荐 3 张同花色（优先定缺色；不足则选张数最多花色）
 * @param {object[]} hand
 * @param {number} [preferSuit]
 * @returns {object[]}  最多 3 张
 */
export function suggestExchangeTiles(hand, preferSuit = null) {
  const bySuit = [[], [], []];
  for (const t of hand) {
    if (t.suit >= 0 && t.suit <= 2) bySuit[t.suit].push(t);
  }
  let suit = preferSuit;
  if (suit == null || bySuit[suit].length < 3) {
    // 选张数 ≥3 且最多的
    let bestS = -1;
    let bestN = -1;
    for (let s = 0; s < 3; s++) {
      if (bySuit[s].length >= 3 && bySuit[s].length > bestN) {
        bestN = bySuit[s].length;
        bestS = s;
      }
    }
    if (bestS < 0) {
      // 不足 3 张同色：从最多色取能取的（规则上通常必须同色 3 张）
      for (let s = 0; s < 3; s++) {
        if (bySuit[s].length > bestN) {
          bestN = bySuit[s].length;
          bestS = s;
        }
      }
    }
    suit = Math.max(0, bestS);
  }
  return bySuit[suit].slice(0, 3);
}

/**
 * 校验换出 3 张是否同门花色
 * @param {object[]} tiles
 */
export function isValidExchangeSet(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 3) return false;
  const s0 = tiles[0].suit;
  return tiles.every((t) => t.suit === s0 && t.suit >= 0 && t.suit <= 2);
}

/**
 * 换三张核心
 *
 * @param {object[][]} playersHands  4 家手牌（开局 13 张）
 * @param {object[][]} exchangeSets  各家交出的 3 张（须同花色且属于该玩家）
 * @param {{ direction?: string }} [options]
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   hands?: object[][],
 *   received?: object[][],
 *   direction: string,
 * }}
 */
export function exchangeCards(playersHands, exchangeSets, options = {}) {
  if (!Array.isArray(playersHands) || playersHands.length !== 4) {
    return { ok: false, reason: 'need_4_players', direction: options.direction || EXCHANGE_DIR.CLOCKWISE };
  }
  if (!Array.isArray(exchangeSets) || exchangeSets.length !== 4) {
    return { ok: false, reason: 'need_4_exchange_sets', direction: options.direction || EXCHANGE_DIR.CLOCKWISE };
  }

  const direction = options.direction || EXCHANGE_DIR.CLOCKWISE;

  // 校验
  for (let i = 0; i < 4; i++) {
    const set = exchangeSets[i];
    if (!isValidExchangeSet(set)) {
      return { ok: false, reason: `invalid_set_player_${i}`, direction };
    }
    if (!tilesBelongToHand(playersHands[i], set)) {
      return { ok: false, reason: `tiles_not_in_hand_${i}`, direction };
    }
  }

  const hands = playersHands.map((h) => h.slice());
  const given = exchangeSets.map((s) => s.slice());
  const received = [[], [], [], []];

  // 从手牌移除
  for (let i = 0; i < 4; i++) {
    hands[i] = removeTiles(hands[i], given[i]);
  }

  // 分配
  for (let i = 0; i < 4; i++) {
    const target = exchangeTarget(i, direction);
    received[target] = given[i].slice();
    hands[target] = sortHand(hands[target].concat(given[i]));
  }

  return {
    ok: true,
    hands,
    received,
    direction,
  };
}

function exchangeTarget(from, direction) {
  if (direction === EXCHANGE_DIR.COUNTER) return (from + 3) % 4; // 上家
  if (direction === EXCHANGE_DIR.ACROSS) return (from + 2) % 4;
  return (from + 1) % 4; // 下家
}

function tilesBelongToHand(hand, tiles) {
  const bag = new Map();
  for (const t of hand) {
    const k = t.id || `${tileKey(t)}_${t.id}`;
    bag.set(k, (bag.get(k) || 0) + 1);
  }
  // 优先按 id
  const byId = hand.every((t) => t.id) && tiles.every((t) => t.id);
  if (byId) {
    const ids = new Set(hand.map((t) => t.id));
    const used = new Set();
    for (const t of tiles) {
      if (!ids.has(t.id) || used.has(t.id)) return false;
      used.add(t.id);
    }
    return true;
  }
  // 按 suit+rank 计数
  const counts = new Map();
  for (const t of hand) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const t of tiles) {
    const k = tileKey(t);
    const c = counts.get(k) || 0;
    if (c < 1) return false;
    counts.set(k, c - 1);
  }
  return true;
}

function removeTiles(hand, tiles) {
  const result = hand.slice();
  for (const t of tiles) {
    let idx = -1;
    if (t.id) idx = result.findIndex((x) => x.id === t.id);
    if (idx < 0) idx = result.findIndex((x) => tileKey(x) === tileKey(t));
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

export { sortHand };
