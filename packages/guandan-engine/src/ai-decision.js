/**
 * 掼蛋 2v2 AI + 简易防通牌检测
 */

import { teammateOf, sameTeam } from './tribute.js';
import {
  identifyGuanDanHand,
  bestGuanDanHand,
  canSuppress,
  HandType,
  isBombLike,
} from './hand-types.js';
import { isWild } from './card.js';

/** @enum {string} */
export const GuanDanAIAction = Object.freeze({
  PASS: 'PASS',
  PLAY: 'PLAY',
});

/**
 * @typedef {object} GuanDanAIPlayer
 * @property {number} seat
 * @property {import('./card.js').Card[]} hand
 * @property {string} [id]
 */

/**
 * @typedef {object} GuanDanGameState
 * @property {number} currentRank
 * @property {number} currentSeat
 * @property {number|null} lastPlaySeat
 * @property {object|null} lastHand  HandResult
 * @property {import('./card.js').Card[]|null} lastCards
 * @property {number[]} handCounts  四人剩余张数
 * @property {number[]} [activeSeats]
 * @property {Array<object>} [legalPlays]  可选预计算合法出牌 HandResult[]
 */

/**
 * 主决策
 * @param {GuanDanAIPlayer} aiPlayer
 * @param {GuanDanGameState} gameState
 */
export function makeGuanDanAIDecision(aiPlayer, gameState) {
  const seat = Number(aiPlayer.seat);
  const mate = teammateOf(seat);
  const hand = aiPlayer.hand || [];
  const rank = gameState.currentRank ?? 2;
  const counts = gameState.handCounts || [hand.length, 0, 0, 0];
  const mateCount = counts[mate] ?? 27;
  const enemies = [0, 1, 2, 3].filter((s) => !sameTeam(s, seat));
  const enemyMin = Math.min(...enemies.map((s) => counts[s] ?? 27));

  const last = gameState.lastHand || null;
  const lastSeat = gameState.lastPlaySeat;
  const free = !last || lastSeat == null || lastSeat === seat;

  // 队友刚出且牌少 → 尽量过牌
  if (!free && lastSeat != null && sameTeam(lastSeat, seat) && mateCount <= 8) {
    // 除非自己能一次出完
    const finish = findFinishingPlay(hand, rank, last);
    if (finish) {
      return playResult(finish, 'finish_now');
    }
    return { action: GuanDanAIAction.PASS, reason: 'protect_teammate', mateCount };
  }

  const candidates = listCandidatePlays(hand, rank, last, free);
  if (!candidates.length) {
    return { action: GuanDanAIAction.PASS, reason: free ? 'no_legal' : 'cannot_beat' };
  }

  // 敌方 1–2 张：优先多张牌型压制
  if (!free && enemyMin <= 2) {
    const multi = candidates
      .filter((h) => (h.cards?.length || h.length || 0) >= 2 || isBombLike(h))
      .sort((a, b) => scorePlay(b, rank, { crush: true }) - scorePlay(a, rank, { crush: true }));
    if (multi[0]) {
      return playResult(multi[0], 'crush_short_enemy');
    }
  }

  // 自由出牌：少拆逢人配、优先非炸走牌
  if (free) {
    const sorted = candidates.slice().sort((a, b) =>
      scorePlay(b, rank, { free: true }) - scorePlay(a, rank, { free: true }));
    return playResult(sorted[0], 'free_lead');
  }

  // 跟牌：最小能压的一手，保留大炸
  const sorted = candidates.slice().sort((a, b) =>
    scorePlay(a, rank, { follow: true }) - scorePlay(b, rank, { follow: true }));
  // 队友出的中大牌：若非短牌已在上面 pass；此处是敌方
  return playResult(sorted[0], 'follow_min');
}

function playResult(hand, reason) {
  return {
    action: GuanDanAIAction.PLAY,
    hand,
    cards: hand.cards || [],
    reason,
  };
}

function findFinishingPlay(hand, rank, last) {
  const all = identifyGuanDanHand(hand, rank);
  for (const h of all) {
    if ((h.cards?.length || hand.length) !== hand.length) continue;
    if (!last || canSuppress(h, last, rank)) return h;
  }
  // 整手识别
  const best = bestGuanDanHand(hand, rank);
  if (best && best.cards?.length === hand.length) {
    if (!last || canSuppress(best, last, rank)) return best;
  }
  return null;
}

/**
 * 合法候选（简化：整手子集过大时用启发式）
 */
function listCandidatePlays(hand, rank, last, free) {
  /** @type {object[]} */
  const out = [];
  // 1) 整手
  const whole = identifyGuanDanHand(hand, rank);
  for (const h of whole) {
    if (free || (last && canSuppress(h, last, rank))) out.push(h);
  }

  // 2) 单张 / 对子 / 三张 快速枚举
  const byRank = new Map();
  for (const c of hand) {
    if (!c) continue;
    const r = c.rank;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(c);
  }
  for (const [, cards] of byRank) {
    for (const n of [1, 2, 3]) {
      if (cards.length < n) continue;
      const slice = cards.slice(0, n);
      const hs = identifyGuanDanHand(slice, rank);
      for (const h of hs) {
        if (free || (last && canSuppress(h, last, rank))) out.push(h);
      }
    }
  }

  // 3) 炸弹 4+
  for (const [, cards] of byRank) {
    if (cards.length >= 4) {
      const hs = identifyGuanDanHand(cards, rank);
      for (const h of hs) {
        if (free || (last && canSuppress(h, last, rank))) out.push(h);
      }
    }
  }

  // 去重
  const seen = new Set();
  return out.filter((h) => {
    const key = `${h.type}|${h.primary}|${h.length}|${h.bombSize}|${(h.pattern || []).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 分越高越优先（free）；follow 时分越低越好
 */
function scorePlay(h, currentRank, mode = {}) {
  let s = 0;
  const n = h.cards?.length || h.length || 1;
  const usesWild = !!h.usesWild;
  const bomb = isBombLike(h);

  if (mode.crush) {
    s += n * 10;
    if (bomb) s += 50;
    if (h.type === HandType.CONSEC_PAIRS || h.type === HandType.CONSEC_TRIPLES) s += 30;
    return s;
  }

  if (mode.free) {
    // 非炸优先；少用逢人配；中等张数
    if (bomb) s -= 100;
    if (usesWild) s -= 40;
    if (h.type === HandType.STRAIGHT_FLUSH) s -= 80;
    // 偏好 2–5 张中小牌
    s += Math.min(n, 5) * 3;
    s -= (h.primary || 0);
    return s;
  }

  // follow：最小压制
  if (bomb) s += 200; // 跟牌尽量不用炸 → 排序时分高更差，wait follow 用升序 scorePlay(a)-scorePlay(b) 即低分优先
  if (usesWild) s += 30;
  s += n;
  s += (h.primary || 0);
  if (mode.follow) return s;
  return s;
}

/**
 * 逢人配组牌建议：优先同花顺/大炸，其次钢板木板
 * @param {import('./card.js').Card[]} cards
 * @param {number} currentRank
 */
export function suggestWildComposition(cards, currentRank) {
  const all = identifyGuanDanHand(cards, currentRank);
  const wildCount = (cards || []).filter((c) => isWild(c, currentRank)).length;
  if (!wildCount) {
    return { best: all[0] || null, all, priority: 'no_wild' };
  }
  const score = (h) => {
    if (!h) return -1;
    if (h.type === HandType.JOKER_BOMB) return 1000;
    if (h.type === HandType.STRAIGHT_FLUSH) return 900;
    if (h.type === HandType.BOMB) return 800 + (h.bombSize || 0) * 10;
    if (h.type === HandType.CONSEC_TRIPLES) return 700;
    if (h.type === HandType.CONSEC_PAIRS) return 600;
    if (h.type === HandType.TRIPLE_PAIR) return 500;
    if (h.type === HandType.SINGLE) return 10; // 避免
    return 100 + (h.type || 0);
  };
  const sorted = all.slice().sort((a, b) => score(b) - score(a));
  return { best: sorted[0] || null, all: sorted, priority: 'wild_optimal' };
}

// ─── 防通牌 / 合谋告警 ───

/**
 * @typedef {object} CollusionEvent
 * @property {string} type
 * @property {string} severity  info|warn|critical
 * @property {string} message
 * @property {object} [meta]
 */

/**
 * 服务端侧行为检测（纯函数，可累积 state）
 *
 * @param {object} state
 * @param {Array<{ playerId: string, ip?: string, geo?: string, seat?: number }>} state.players
 * @param {Array<{ from: string, to: string, type: string, meaningless?: boolean }>} [state.feedActions]
 * @param {Array<{ playerId: string, joinedAt: number }>} [state.joinLog]
 */
export function detectGuanDanCollusion(state = {}) {
  /** @type {CollusionEvent[]} */
  const alerts = [];
  const players = state.players || [];

  // 同 IP 多开
  const byIp = new Map();
  for (const p of players) {
    if (!p.ip) continue;
    if (!byIp.has(p.ip)) byIp.set(p.ip, []);
    byIp.get(p.ip).push(p);
  }
  for (const [ip, list] of byIp) {
    if (list.length >= 2) {
      alerts.push({
        type: 'same_ip_table',
        severity: list.length >= 3 ? 'critical' : 'warn',
        message: `同 IP 同桌 ${list.length} 人`,
        meta: { ip, playerIds: list.map((p) => p.playerId) },
      });
    }
  }

  // 同 geo 粗粒度（可选）
  const byGeo = new Map();
  for (const p of players) {
    if (!p.geo) continue;
    if (!byGeo.has(p.geo)) byGeo.set(p.geo, []);
    byGeo.get(p.geo).push(p);
  }
  for (const [geo, list] of byGeo) {
    if (list.length >= 3) {
      alerts.push({
        type: 'same_geo_cluster',
        severity: 'info',
        message: `同地区聚集 ${list.length} 人`,
        meta: { geo, playerIds: list.map((p) => p.playerId) },
      });
    }
  }

  // 无意义喂牌：固定 to 多次
  const feeds = state.feedActions || [];
  const feedCount = new Map();
  for (const f of feeds) {
    if (!f.meaningless) continue;
    const key = `${f.from}->${f.to}`;
    feedCount.set(key, (feedCount.get(key) || 0) + 1);
  }
  for (const [key, n] of feedCount) {
    if (n >= 3) {
      alerts.push({
        type: 'feed_cards',
        severity: n >= 5 ? 'critical' : 'warn',
        message: `频繁无意义喂牌 ${key} ×${n}`,
        meta: { key, count: n },
      });
    }
  }

  // 短间隔协同入座
  const joins = (state.joinLog || []).slice().sort((a, b) => a.joinedAt - b.joinedAt);
  for (let i = 1; i < joins.length; i++) {
    const dt = joins[i].joinedAt - joins[i - 1].joinedAt;
    if (dt >= 0 && dt < 3000) {
      alerts.push({
        type: 'sync_join',
        severity: 'warn',
        message: '短间隔协同入座',
        meta: {
          a: joins[i - 1].playerId,
          b: joins[i].playerId,
          dt,
        },
      });
    }
  }

  return {
    alerts,
    risk: alerts.some((a) => a.severity === 'critical')
      ? 'critical'
      : alerts.some((a) => a.severity === 'warn')
        ? 'warn'
        : alerts.length
          ? 'info'
          : 'clean',
  };
}
