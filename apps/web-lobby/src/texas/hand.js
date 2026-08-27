/**
 * 7 选 5 牌力评估（Texas Hold'em）
 * category: 8 同花顺 … 0 高牌
 * score: 可比较的大整数向量
 */

const CAT = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
};

export const CATEGORY_NAME = {
  0: '高牌',
  1: '一对',
  2: '两对',
  3: '三条',
  4: '顺子',
  5: '同花',
  6: '葫芦',
  7: '四条',
  8: '同花顺',
};

function combinations(arr, k) {
  const res = [];
  const path = [];
  function dfs(start) {
    if (path.length === k) {
      res.push(path.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      dfs(i + 1);
      path.pop();
    }
  }
  dfs(0);
  return res;
}

function evalFive(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  // rank counts
  const count = new Map();
  for (const r of ranks) count.set(r, (count.get(r) || 0) + 1);
  const byCount = [...count.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // straight (A can be 14 or 1)
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  const seqCheck = (list) => {
    for (let i = 0; i <= list.length - 5; i++) {
      let ok = true;
      for (let j = 1; j < 5; j++) {
        if (list[i + j] !== list[i] - j) {
          ok = false;
          break;
        }
      }
      if (ok) return list[i];
    }
    return 0;
  };
  straightHigh = seqCheck(uniq);
  if (!straightHigh && uniq.includes(14)) {
    // A-2-3-4-5
    const wheel = [14, 5, 4, 3, 2];
    if (wheel.every((r) => uniq.includes(r))) straightHigh = 5;
  }

  if (isFlush && straightHigh) {
    return { category: CAT.STRAIGHT_FLUSH, kickers: [straightHigh], name: straightHigh === 14 ? '皇家同花顺' : '同花顺' };
  }
  if (byCount[0][1] === 4) {
    const quad = byCount[0][0];
    const kicker = byCount.find((x) => x[0] !== quad)[0];
    return { category: CAT.QUADS, kickers: [quad, kicker], name: '四条' };
  }
  if (byCount[0][1] === 3 && byCount[1] && byCount[1][1] >= 2) {
    return { category: CAT.FULL_HOUSE, kickers: [byCount[0][0], byCount[1][0]], name: '葫芦' };
  }
  if (isFlush) {
    return { category: CAT.FLUSH, kickers: ranks.slice(), name: '同花' };
  }
  if (straightHigh) {
    return { category: CAT.STRAIGHT, kickers: [straightHigh], name: '顺子' };
  }
  if (byCount[0][1] === 3) {
    const trip = byCount[0][0];
    const kickers = byCount.filter((x) => x[0] !== trip).map((x) => x[0]).sort((a, b) => b - a);
    return { category: CAT.TRIPS, kickers: [trip, ...kickers], name: '三条' };
  }
  if (byCount[0][1] === 2 && byCount[1] && byCount[1][1] === 2) {
    const hi = Math.max(byCount[0][0], byCount[1][0]);
    const lo = Math.min(byCount[0][0], byCount[1][0]);
    const kicker = byCount.find((x) => x[1] === 1)[0];
    return { category: CAT.TWO_PAIR, kickers: [hi, lo, kicker], name: '两对' };
  }
  if (byCount[0][1] === 2) {
    const pair = byCount[0][0];
    const kickers = byCount.filter((x) => x[0] !== pair).map((x) => x[0]).sort((a, b) => b - a);
    return { category: CAT.PAIR, kickers: [pair, ...kickers], name: '一对' };
  }
  return { category: CAT.HIGH, kickers: ranks.slice(), name: '高牌' };
}

function compareEval(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < n; i++) {
    const da = a.kickers[i] || 0;
    const db = b.kickers[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** hole(2) + board(0-5) → 最佳 5 张 */
export function evaluateHand(hole, board) {
  const all = [...hole, ...board];
  if (all.length < 5) {
    // 不足 5 张时用已有牌估分（preflop 仅 hole）
    if (all.length === 2) {
      const [a, b] = all.map((c) => c.rank).sort((x, y) => y - x);
      const pair = a === b ? 1 : 0;
      return {
        category: pair ? CAT.PAIR : CAT.HIGH,
        kickers: [a, b],
        name: pair ? '口袋对' : '高牌',
        bestCards: all.slice(),
      };
    }
    const padded = all.slice();
    while (padded.length < 5) padded.push({ rank: 0, suit: 0, id: `pad${padded.length}` });
    const e = evalFive(padded);
    return { ...e, bestCards: all.slice() };
  }

  let best = null;
  let bestCards = null;
  for (const five of combinations(all, 5)) {
    const e = evalFive(five);
    if (!best || compareEval(e, best) > 0) {
      best = e;
      bestCards = five;
    }
  }
  return { ...best, bestCards };
}

export function compareHands(a, b) {
  return compareEval(a, b);
}

export { CAT };
