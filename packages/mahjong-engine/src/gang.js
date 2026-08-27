/**
 * 刮风下雨 · 杠牌实时结算
 *
 * 明杠（刮风）：别人打出点杠 / 碰后补杠
 * 暗杠（下雨）：手中四张暗杠
 */

export const GangType = Object.freeze({
  /** 直杠：打出一张，三张手牌杠 */
  MING_ZHI: 'ming_zhi',
  /** 补杠/加杠：已碰再摸到第 4 张 */
  MING_BU: 'ming_bu',
  /** 暗杠 */
  AN: 'an',
});

/**
 * 默认杠分（底分倍数，可配置）
 * - 直杠：点杠者出 1 倍底分给杠者
 * - 补杠：其余三家各出 1 倍（简化为每家 1）
 * - 暗杠：其余三家各出 2 倍
 */
export const DEFAULT_GANG_PAY = Object.freeze({
  [GangType.MING_ZHI]: { fromDiscarder: 1, fromEachOther: 0 },
  [GangType.MING_BU]: { fromDiscarder: 0, fromEachOther: 1 },
  [GangType.AN]: { fromDiscarder: 0, fromEachOther: 2 },
});

/**
 * 计算一次杠的实时积分变动
 *
 * @param {{
 *   type: string,
 *   ganger: number,           杠牌玩家
 *   discarder?: number|null,  直杠点炮者
 *   baseScore?: number,       底分
 *   activePlayers?: number[], 仍在局中的座位（血战退场者不付）
 *   playerCount?: number,
 *   payTable?: object,
 * }} opts
 * @returns {{
 *   deltas: number[],
 *   records: object[],
 *   totalToGanger: number,
 * }}
 */
export function settleGangImmediate(opts) {
  const {
    type,
    ganger,
    discarder = null,
    baseScore = 1,
    playerCount = 4,
    payTable = DEFAULT_GANG_PAY,
  } = opts;

  const active = new Set(
    opts.activePlayers
      || Array.from({ length: playerCount }, (_, i) => i)
  );

  if (!active.has(ganger)) {
    return {
      deltas: Array(playerCount).fill(0),
      records: [],
      totalToGanger: 0,
    };
  }

  const pay = payTable[type] || DEFAULT_GANG_PAY[type] || { fromDiscarder: 0, fromEachOther: 0 };
  const deltas = Array(playerCount).fill(0);
  const records = [];
  let total = 0;

  if (type === GangType.MING_ZHI && discarder != null && active.has(discarder)) {
    const amt = pay.fromDiscarder * baseScore;
    deltas[discarder] -= amt;
    deltas[ganger] += amt;
    total += amt;
    records.push({
      kind: 'gang',
      gangType: type,
      from: discarder,
      to: ganger,
      amount: amt,
      label: '刮风(直杠)',
    });
  } else {
    // 补杠 / 暗杠：其余在场玩家付
    const each = pay.fromEachOther * baseScore;
    for (let i = 0; i < playerCount; i++) {
      if (i === ganger || !active.has(i)) continue;
      deltas[i] -= each;
      deltas[ganger] += each;
      total += each;
      records.push({
        kind: 'gang',
        gangType: type,
        from: i,
        to: ganger,
        amount: each,
        label: type === GangType.AN ? '下雨(暗杠)' : '刮风(补杠)',
      });
    }
  }

  return { deltas, records, totalToGanger: total };
}

/**
 * 检测暗杠候选（手中 4 张相同）
 * @param {object[]} concealed
 * @returns {{ suit: number, rank: number, tiles: object[] }[]}
 */
export function findAnGangCandidates(concealed) {
  const map = new Map();
  for (const t of concealed) {
    const k = `${t.suit}_${t.rank}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  const out = [];
  for (const tiles of map.values()) {
    if (tiles.length >= 4) {
      out.push({
        suit: tiles[0].suit,
        rank: tiles[0].rank,
        tiles: tiles.slice(0, 4),
      });
    }
  }
  return out;
}

/**
 * 检测补杠：已碰 + 手中有第 4 张
 */
export function findBuGangCandidates(concealed, pengMelds) {
  const out = [];
  for (const m of pengMelds || []) {
    if (m.type !== 'peng') continue;
    const extra = concealed.filter(
      (t) => t.suit === m.suit && t.rank === m.rank
    );
    if (extra.length >= 1) {
      out.push({
        suit: m.suit,
        rank: m.rank,
        tile: extra[0],
        meldId: m.id,
      });
    }
  }
  return out;
}
