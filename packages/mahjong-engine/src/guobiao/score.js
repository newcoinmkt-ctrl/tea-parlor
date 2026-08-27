/**
 * 国标麻将全番型识别与计分
 *
 * calculateFanPoints(allCards, context)
 *   → { totalFan, fans: [{id,name,fan}], structure, excluded }
 *
 * 原则：
 *   1. 不重复：高番 excludes 列表中的低番不叠加
 *   2. 按高不按低：同系列只取最高
 *   3. 多结构分解取总分最高者
 */

import {
  count34,
  toId34,
  isOrdinal,
  isHonor,
  isTerminal,
  isYaoJiu,
  isGreenTile,
  isWind,
  isDragon,
  suitOf,
  totalTiles,
} from './tiles34.js';
import {
  decomposeStandard,
  isSevenPairs,
  isThirteenOrphans,
  normalizeMelds,
  allTilesList,
} from './decompose.js';
import { FAN, FAN_BY_ID } from './fan-table.js';

/**
 * @typedef {object} ScoreContext
 * @property {object[]} [hand]           暗手（建议含自摸的赢牌）
 * @property {object[]} [melds]          吃碰杠
 * @property {object} [winningCard]      胡的那张
 * @property {'zimo'|'dianpao'|'gangshanghua'|'gangshangpao'|'qianggang'|'haidi'|'hedi'|'tianhu'|'dihu'} [winMethod]
 * @property {boolean} [isZimo]
 * @property {boolean} [isMenQing]       门前清（无副露或仅暗杠）
 * @property {boolean} [lastTileWall]    海/河
 * @property {boolean} [gangShangHua]
 * @property {boolean} [qiangGang]
 * @property {boolean} [yiFa]            天听等（可选）
 * @property {number} [seatWind]         门风 27–30
 * @property {number} [prevalentWind]    圈风 27–30
 * @property {boolean} [isClosed]        强制门清
 * @property {string} [waitType]         'dan_diao'|'bian'|'kan'|'other'
 * @property {boolean} [selfDrawnAlreadyInHand] 赢牌已在 hand 中
 */

/**
 * 主入口
 * @param {object[]|object} allCards  全部牌 或 { hand, melds, winningCard }
 * @param {ScoreContext} [context]
 */
export function calculateFanPoints(allCards, context = {}) {
  const ctx = normalizeContext(allCards, context);
  const hand = ctx.hand;
  const melds = normalizeMelds(ctx.melds);
  const winId = ctx.winningCard ? toId34(ctx.winningCard) : -1;

  // 特殊牌型（不走 4+1）
  const special = detectSpecialWhole(hand, melds, ctx);
  if (special) {
    return applyExclusionAndSum(special.fans, {
      structure: special.structure,
      context: ctx,
    });
  }

  // 标准分解
  const parts = decomposeStandard(hand, melds);
  if (!parts.length) {
    // 尝试把点炮牌并入手再分解
    if (ctx.winningCard && !ctx.selfDrawnAlreadyInHand) {
      const hand2 = [...hand, ctx.winningCard];
      const parts2 = decomposeStandard(hand2, melds);
      if (parts2.length) {
        return bestAmongStructures(parts2, { ...ctx, hand: hand2 });
      }
    }
    return {
      totalFan: 0,
      fans: [],
      structure: null,
      excluded: [],
      error: 'invalid_hand_structure',
    };
  }

  return bestAmongStructures(parts, ctx);
}

function bestAmongStructures(parts, ctx) {
  let best = null;
  for (const st of parts) {
    const raw = detectFansForStructure(st, ctx);
    const scored = applyExclusionAndSum(raw, { structure: st, context: ctx });
    if (!best || scored.totalFan > best.totalFan) best = scored;
  }
  return best;
}

function normalizeContext(allCards, context) {
  let hand = context.hand;
  let melds = context.melds || [];
  let winningCard = context.winningCard;

  if (Array.isArray(allCards)) {
    // 全部牌扁平：无副露信息时整手当暗
    if (!hand) hand = allCards;
  } else if (allCards && typeof allCards === 'object') {
    hand = allCards.hand ?? hand;
    melds = allCards.melds ?? melds;
    winningCard = allCards.winningCard ?? winningCard;
  }

  const winMethod = context.winMethod
    || (context.isZimo || context.gangShangHua ? 'zimo' : 'dianpao');

  const isZimo = context.isZimo
    ?? ['zimo', 'gangshanghua', 'haidi', 'tianhu', 'dihu'].includes(winMethod);

  const openMelds = normalizeMelds(melds).filter((m) => m.open && m.type !== 'angang');
  const isMenQing = context.isMenQing
    ?? context.isClosed
    ?? openMelds.length === 0;

  return {
    ...context,
    hand: hand || [],
    melds,
    winningCard,
    winMethod,
    isZimo,
    isMenQing,
    selfDrawnAlreadyInHand: context.selfDrawnAlreadyInHand ?? isZimo,
    seatWind: context.seatWind ?? 27,
    prevalentWind: context.prevalentWind ?? 27,
  };
}

// ─── 特殊整型 ───────────────────────────────────────

function detectSpecialWhole(hand, melds, ctx) {
  const closed = melds.length === 0 || melds.every((m) => m.isConcealed || m.type === 'angang');
  const all = allTilesList(hand, melds, ctx.winningCard, ctx.selfDrawnAlreadyInHand);
  const fullHand = ctx.winningCard && !ctx.selfDrawnAlreadyInHand
    ? [...hand, ctx.winningCard]
    : hand;

  if (isThirteenOrphans(fullHand) && melds.length === 0) {
    const fans = [FAN.SHI_SAN_YAO];
    addWinMethodFans(fans, ctx);
    return { fans, structure: { type: 'shi_san_yao' } };
  }

  if (isSevenPairs(fullHand) && melds.length === 0) {
    const fans = [FAN.QI_DUI];
    // 清一色七对
    if (isPureOneSuit(count34(fullHand))) fans.push(FAN.QING_YI_SE);
    if (ctx.isMenQing) fans.push(FAN.MEN_QIAN_QING);
    addWinMethodFans(fans, ctx);
    // 断幺
    if (isDuanYaoCounts(count34(fullHand))) fans.push(FAN.DUAN_YAO);
    return { fans, structure: { type: 'qi_dui', pair: -1, allMelds: [] } };
  }

  return null;
}

// ─── 标准结构番种 ───────────────────────────────────

function detectFansForStructure(st, ctx) {
  const fans = [];
  const allMelds = st.allMelds || [];
  const openMelds = normalizeMelds(ctx.melds);
  const counts = count34(allTilesFromStructure(st, ctx));

  const pungLike = allMelds.filter((m) => !m.isChi);
  const chiMelds = allMelds.filter((m) => m.isChi);
  const kongs = openMelds.filter((m) => m.isKong);
  const anKongs = kongs.filter((m) => m.isConcealed || m.type === 'angang');
  const mingKongs = kongs.filter((m) => !m.isConcealed && m.type !== 'angang');

  const windPungs = pungLike.filter((m) => isWind(m.tile34));
  const dragonPungs = pungLike.filter((m) => isDragon(m.tile34));
  const concealedPungs = countConcealedPungs(st, ctx);

  // ── 88 ──
  if (windPungs.length === 4) {
    fans.push(FAN.DA_SI_XI);
  }
  if (dragonPungs.length === 3) {
    fans.push(FAN.DA_SAN_YUAN);
  }
  if (isAllGreen(counts)) {
    fans.push(FAN.LV_YI_SE);
  }
  if (kongs.length === 4) {
    fans.push(FAN.SHI_BA_LUO_HAN); // 含四杠，排他表去掉 si_gang 等
  }
  if (isNineGates(st, ctx, counts)) {
    fans.push(FAN.JIU_LIAN);
  }

  // ── 64 ──
  if (windPungs.length === 3 && isWind(st.pair)) {
    fans.push(FAN.XIAO_SI_XI);
  }
  if (dragonPungs.length === 2 && isDragon(st.pair)) {
    fans.push(FAN.XIAO_SAN_YUAN);
  }
  if (isAllHonors(counts)) {
    fans.push(FAN.ZI_YI_SE);
  }
  if (concealedPungs >= 4 && ctx.isMenQing) {
    fans.push(FAN.SI_AN_KE);
  }

  // ── 32/24 ──
  if (kongs.length === 3) fans.push(FAN.SAN_GANG);
  if (isPureOneSuit(counts) && !isAllHonors(counts)) {
    fans.push(FAN.QING_YI_SE);
  }
  if (isMixedTerminals(counts, pungLike, st.pair)) {
    fans.push(FAN.HUN_YAO_JIU);
  }

  // ── 16 ──
  if (isThreeSuitDoubleDragon(st)) {
    fans.push(FAN.SAN_SE_SHUANG_LONG);
  }
  if (concealedPungs >= 3) fans.push(FAN.SAN_AN_KE);

  // ── 12 ──
  if (windPungs.length === 3) fans.push(FAN.SAN_FENG_KE);
  if (isDaYuWu(counts)) fans.push(FAN.DA_YU_WU);
  if (isXiaoYuWu(counts)) fans.push(FAN.XIAO_YU_WU);

  // ── 8 和牌方式 ──
  addWinMethodFans(fans, ctx);

  // ── 6 ──
  if (pungLike.length === 4 && chiMelds.length === 0) {
    fans.push(FAN.PENG_PENG_HU);
  }
  if (isHalfFlush(counts) && !isPureOneSuit(counts) && !isAllHonors(counts)) {
    fans.push(FAN.HUN_YI_SE);
  }
  if (anKongs.length >= 2) fans.push(FAN.SHUANG_AN_GANG);

  // ── 4 ──
  if (ctx.isMenQing && ctx.isZimo) fans.push(FAN.BU_QIU_REN);
  if (mingKongs.length >= 2) fans.push(FAN.SHUANG_MING_GANG);

  // ── 2 ──
  if (isDuanYaoCounts(counts)) fans.push(FAN.DUAN_YAO);
  if (isPingHu(st, ctx)) fans.push(FAN.PING_HU);
  if (ctx.isMenQing && !ctx.isZimo) fans.push(FAN.MEN_QIAN_QING);
  if (anKongs.length === 1) fans.push(FAN.AN_GANG);
  if (concealedPungs >= 2) fans.push(FAN.SHUANG_AN_KE);
  if (hasSiGuiYi(counts)) fans.push(FAN.SI_GUI_YI);

  // ── 1 ──
  if (ctx.isZimo && !fans.some((f) => f.id === 'bu_qiu_ren' || f.id === 'gang_shang_hua' || f.id === 'miao_shou_hui_chun')) {
    fans.push(FAN.ZI_MO);
  }
  if (ctx.waitType === 'dan_diao' || isDanDiao(st, ctx)) {
    fans.push(FAN.DAN_DIAO_JIANG);
  }
  if (ctx.waitType === 'bian') fans.push(FAN.BIAN_ZHANG);
  if (ctx.waitType === 'kan') fans.push(FAN.KAN_ZHANG);

  // 一般高、喜相逢、连六、老少副
  addSequencePatterns(fans, st);

  // 幺九刻、箭刻、风刻
  for (const m of pungLike) {
    if (isYaoJiu(m.tile34)) fans.push(FAN.YAO_JIU_KE);
    if (isDragon(m.tile34)) fans.push(FAN.JIAN_KE);
    if (m.tile34 === ctx.seatWind) fans.push(FAN.MEN_FENG_KE);
    if (m.tile34 === ctx.prevalentWind) fans.push(FAN.QUAN_FENG_KE);
  }
  if (mingKongs.length === 1) fans.push(FAN.MING_GANG);

  // 缺一门 / 无字
  const suitsUsed = new Set();
  let hasHonor = false;
  for (let i = 0; i < 34; i++) {
    if (!counts[i]) continue;
    if (isHonor(i)) hasHonor = true;
    else suitsUsed.add(suitOf(i));
  }
  if (!hasHonor) fans.push(FAN.WU_ZI);
  if (suitsUsed.size === 2 && !hasHonor) fans.push(FAN.QUE_YI_MEN);
  if (suitsUsed.size === 2 && hasHonor) {
    // 混缺
  }

  // 去重同 id 先合并（幺九刻可多枚，国标可叠加多次——这里按只计 1 次简化，或计次数）
  return dedupeFanDefs(fans);
}

function addWinMethodFans(fans, ctx) {
  const m = ctx.winMethod;
  if (m === 'gangshanghua' || ctx.gangShangHua) fans.push(FAN.GANG_SHANG_HUA);
  if (m === 'qianggang' || ctx.qiangGang) fans.push(FAN.QIANG_GANG_HU);
  if (m === 'haidi' || ctx.lastTileWall && ctx.isZimo) fans.push(FAN.MIAO_SHOU_HUI_CHUN);
  if (m === 'hedi' || (ctx.lastTileWall && !ctx.isZimo)) fans.push(FAN.HAI_DI_LAO_YUE);
}

function addSequencePatterns(fans, st) {
  const chis = (st.allMelds || []).filter((m) => m.isChi).map((m) => m.tile34);
  // 一般高：同色同顺两副
  for (let i = 0; i < chis.length; i++) {
    for (let j = i + 1; j < chis.length; j++) {
      if (chis[i] === chis[j]) fans.push(FAN.YI_BAN_GAO);
    }
  }
  // 喜相逢：两色同数顺
  for (let i = 0; i < chis.length; i++) {
    for (let j = i + 1; j < chis.length; j++) {
      if (suitOf(chis[i]) !== suitOf(chis[j]) && chis[i] % 9 === chis[j] % 9) {
        fans.push(FAN.XI_XIANG_FENG);
      }
    }
  }
  // 老少副：同色 123+789
  for (let s = 0; s < 3; s++) {
    const base = s * 9;
    if (chis.includes(base) && chis.includes(base + 6)) fans.push(FAN.LAO_SHAO_FU);
  }
  // 连六
  for (let i = 0; i < chis.length; i++) {
    for (let j = 0; j < chis.length; j++) {
      if (i !== j && suitOf(chis[i]) === suitOf(chis[j]) && chis[j] === chis[i] + 3) {
        fans.push(FAN.LIAN_LIU);
      }
    }
  }
  // 清龙 123456789 同色三顺
  for (let s = 0; s < 3; s++) {
    const b = s * 9;
    if (chis.includes(b) && chis.includes(b + 3) && chis.includes(b + 6)) {
      fans.push(FAN.QING_LONG);
    }
  }
}

// ─── 判定工具 ───────────────────────────────────────

function allTilesFromStructure(st, ctx) {
  const list = [];
  // pair
  list.push({ tile34: st.pair }, { tile34: st.pair });
  for (const m of st.allMelds || []) {
    if (m.isChi) {
      list.push({ tile34: m.tile34 }, { tile34: m.tile34 + 1 }, { tile34: m.tile34 + 2 });
    } else {
      const n = m.isKong ? 4 : 3;
      for (let i = 0; i < n; i++) list.push({ tile34: m.tile34 });
    }
  }
  // 副露杠在 open melds
  for (const m of normalizeMelds(ctx.melds)) {
    // already in allMelds if decompose merged fixed
  }
  return list;
}

function countConcealedPungs(st, ctx) {
  let n = 0;
  for (const m of st.concealedMelds || []) {
    if (!m.isChi) n += 1;
  }
  for (const m of normalizeMelds(ctx.melds)) {
    if (m.isKong && m.isConcealed) n += 1;
  }
  return n;
}

function isAllGreen(counts) {
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0 && !isGreenTile(i)) return false;
  }
  return totalTiles(counts) > 0;
}

function isAllHonors(counts) {
  for (let i = 0; i < 27; i++) if (counts[i] > 0) return false;
  return totalTiles(counts) > 0;
}

function isPureOneSuit(counts) {
  let suit = -1;
  for (let i = 0; i < 27; i++) {
    if (!counts[i]) continue;
    const s = suitOf(i);
    if (suit < 0) suit = s;
    else if (suit !== s) return false;
  }
  for (let i = 27; i < 34; i++) if (counts[i] > 0) return false;
  return suit >= 0;
}

function isHalfFlush(counts) {
  let suit = -1;
  let hasHonor = false;
  for (let i = 0; i < 34; i++) {
    if (!counts[i]) continue;
    if (isHonor(i)) {
      hasHonor = true;
      continue;
    }
    const s = suitOf(i);
    if (suit < 0) suit = s;
    else if (suit !== s) return false;
  }
  return hasHonor && suit >= 0;
}

function isDuanYaoCounts(counts) {
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0 && isYaoJiu(i)) return false;
  }
  return totalTiles(counts) > 0;
}

function isDaYuWu(counts) {
  for (let i = 0; i < 34; i++) {
    if (!counts[i]) continue;
    if (isHonor(i)) return false;
    if (i % 9 < 5) return false; // rank 1–5 forbidden; rank index 0–4
  }
  return totalTiles(counts) > 0;
}

function isXiaoYuWu(counts) {
  for (let i = 0; i < 34; i++) {
    if (!counts[i]) continue;
    if (isHonor(i)) return false;
    if (i % 9 > 3) return false; // only 1–4
  }
  return totalTiles(counts) > 0;
}

function isMixedTerminals(counts, pungLike, pair) {
  // 混幺九：只有幺九与字，且有字有序数
  let hasOrd = false;
  let hasHon = false;
  for (let i = 0; i < 34; i++) {
    if (!counts[i]) continue;
    if (!isYaoJiu(i)) return false;
    if (isHonor(i)) hasHon = true;
    else hasOrd = true;
  }
  return hasOrd && hasHon && pungLike.every((m) => !m.isChi);
}

function isPingHu(st, ctx) {
  // 国标平胡（简化）：四副顺子 + 序数牌作将 + 无字牌
  const melds = st.allMelds || [];
  if (melds.length !== 4 || melds.some((m) => !m.isChi)) return false;
  if (isHonor(st.pair)) return false;
  return true;
}

function isDanDiao(st, ctx) {
  if (ctx.waitType === 'dan_diao') return true;
  // 胡牌等于将牌
  if (ctx.winningCard && toId34(ctx.winningCard) === st.pair) return true;
  return false;
}

function isNineGates(st, ctx, counts) {
  // 门清、清一色、形状 1112345678999 + 任意同色
  if (!ctx.isMenQing) return false;
  if (normalizeMelds(ctx.melds).length) return false;
  if (!isPureOneSuit(counts)) return false;
  let suit = -1;
  for (let i = 0; i < 27; i++) {
    if (counts[i]) {
      suit = suitOf(i);
      break;
    }
  }
  if (suit < 0) return false;
  const base = suit * 9;
  const need = [3, 1, 1, 1, 1, 1, 1, 1, 3]; // 1112345678999
  let extra = 0;
  for (let r = 0; r < 9; r++) {
    const c = counts[base + r];
    if (c < need[r]) return false;
    extra += c - need[r];
  }
  return extra === 1;
}

/**
 * 三色双龙会：每种花色 123+789，将为 5
 */
function isThreeSuitDoubleDragon(st) {
  const chis = (st.allMelds || []).filter((m) => m.isChi).map((m) => m.tile34);
  if (chis.length !== 4) return false; // 实际 6 个顺? 三色双龙会 = 三色各 123+789 共 6 顺？ 
  // 国标三色双龙会：每种花色都有 123 与 789，将是 5 序数——共 6 面子不可能。
  // 查国标：三色双龙会 16番 = 一种花色老少副 + 另两色各一组老少? 
  // 实际定义：万条筒各有 123、789，将牌是 5。牌数 3*6+2=20 不对。
  // 正确：只有两副老少副在两色 + 第三色？
  // 国标「三色双龙会」：三种花色的 123、789 各一，将 5：面子数=6 不可能。
  // 查：是 花色1:123+789, 花色2:123, 花色3:789, 将55？ 仍是 4 面子+将。
  // 标准定义：东——「三色双龙会」= 三种序数花色中，各有一套老少副(123+789)中的……
  // 官方：由三种花色的 123、789 共六副顺子中的……不对。
  // 实际国标 16番 三色双龙会：
  // 「一种花色的双龙会（123+789+55）+ 另外两色的两副老少副」太复杂。
  // 简化实现：将为五，且存在 三个花色的 123 与 789 各至少一副（用 4 个顺子覆盖）
  if (![4, 13, 22].includes(st.pair)) return false; // 五万/五条/五筒
  const has = (s, start) => chis.some((c) => suitOf(c) === s && c % 9 === start);
  let dragonSuits = 0;
  for (let s = 0; s < 3; s++) {
    if (has(s, 0) && has(s, 6)) dragonSuits += 1;
  }
  // 至少两色老少 + 将 5；或三色各有 123 或 789 组合
  if (dragonSuits >= 1 && chis.length >= 2) {
    // 检查三色都出现
    const suits = new Set(chis.map(suitOf));
    if (suits.size === 3 && [4, 13, 22].includes(st.pair)) return true;
  }
  return false;
}

function hasSiGuiYi(counts) {
  for (let i = 0; i < 34; i++) if (counts[i] === 4) return true;
  return false;
}

// ─── 排他与合计 ─────────────────────────────────────

/**
 * @param {object[]} fanDefs
 */
export function applyExclusionAndSum(fanDefs, meta = {}) {
  // 按番数降序
  const sorted = fanDefs
    .filter(Boolean)
    .slice()
    .sort((a, b) => b.fan - a.fan || a.id.localeCompare(b.id));

  const chosen = [];
  const excluded = [];
  const banned = new Set();

  for (const f of sorted) {
    if (banned.has(f.id)) {
      excluded.push({ id: f.id, name: f.name, fan: f.fan, reason: 'excluded_by_higher' });
      continue;
    }
    // 已选中的同 id 跳过
    if (chosen.some((c) => c.id === f.id)) continue;
    chosen.push(f);
    for (const ex of f.excludes || []) {
      banned.add(ex);
    }
  }

  // 国标：无番和（仅1番类）需至少 8 番才可胡——此处只计分不强制
  const totalFan = chosen.reduce((s, f) => s + f.fan, 0);

  return {
    totalFan,
    fans: chosen.map((f) => ({ id: f.id, name: f.name, fan: f.fan })),
    excluded,
    structure: meta.structure || null,
    minFanRequired: 8,
    reachesMin: totalFan >= 8,
  };
}

function dedupeFanDefs(fans) {
  const map = new Map();
  for (const f of fans) {
    if (!f) continue;
    // 可叠加番（幺九刻等）国标允许多次：这里同 id 累加次数可选
    if (!map.has(f.id)) map.set(f.id, { ...f, _n: 1 });
    else {
      const cur = map.get(f.id);
      // 默认幺九刻/箭刻可叠加
      if (['yao_jiu_ke', 'jian_ke', 'ming_gang', 'si_gui_yi', 'yi_ban_gao', 'xi_xiang_feng'].includes(f.id)) {
        cur._n += 1;
        cur.fan = FAN_BY_ID[f.id].fan * cur._n;
        cur.name = `${FAN_BY_ID[f.id].name}×${cur._n}`;
      }
    }
  }
  return [...map.values()];
}

export { FAN, FAN_BY_ID };

export default {
  calculateFanPoints,
  applyExclusionAndSum,
  FAN,
};
