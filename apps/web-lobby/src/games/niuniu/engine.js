/**
 * 牛牛 H5 引擎 — 看牌抢庄（port of niuniu_server/.../wd_nn.js）
 *
 * Encoding
 * --------
 * Source card string: "" + rank + suit
 *   rank 1–13 (1=A … 10, 11=J, 12=Q, 13=K)
 *   suit 1–4
 *   parseInt then floor(/10)=rank, %10=suit
 *   pip: rank > 10 → 10 (A counts as 1)
 *
 * Tea-parlor internal: { rank: 1–13, suit: 0–3, isRed }
 *   suit 0=♦ source1, 1=♣ source2, 2=♥ source3, 3=♠ source4
 *   toSourceCard(c) = String(rank) + String(suit + 1)
 *
 * typeResult (beishu of winner's niu type):
 *   7–8 ×2, 9 ×3, 10 ×4, >10 ×5, else ×1 (incl 没牛 -1)
 *
 * Pay: score1(庄抢) × score2(闲注) × difen × beishu(winner type)
 *
 * 轮庄: source conf exists but never branches — this table is 看牌抢庄 only.
 *
 * compare quirk: special kicker only when point==13||15 (葫芦 / 五花),
 * NOT 炸弹 16. Ported as-is from wd_nn.js.
 *
 * Phases: idle → qiangzhuang → dingzhuang → xiazhu → cuopai → bipai → settle
 */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const RANK_LABEL = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K',
};

export const PHASE = Object.freeze({
  idle: 'idle',
  qiangzhuang: 'qiangzhuang',
  dingzhuang: 'dingzhuang',
  xiazhu: 'xiazhu',
  cuopai: 'cuopai',
  bipai: 'bipai',
  settle: 'settle',
});

/** Source numeric states (wd_nn.js allState) */
export const PHASE_CODE = Object.freeze({
  idle: 0,
  qiangzhuang: 1,
  dingzhuang: 2,
  xiazhu: 3,
  cuopai: 4,
  bipai: 5,
});

export const NIU_NAME = Object.freeze({
  [-1]: '没牛',
  1: '牛1',
  2: '牛2',
  3: '牛3',
  4: '牛4',
  5: '牛5',
  6: '牛6',
  7: '牛7',
  8: '牛8',
  9: '牛9',
  10: '牛牛',
  11: '顺子牛',
  12: '同花牛',
  13: '葫芦牛',
  14: '五小牛',
  15: '五花牛',
  16: '炸弹牛',
  17: '同花顺牛',
});

export const SEAT_COUNT = 6;
export const QIANG_OPTIONS = [0, 1, 2, 3, 4];
export const XIA_OPTIONS = [1, 2, 3, 4, 5];
export const MATCH_MS = 3000;
export const MATCH_MS_MAX = 3000;

export const TIMERS = Object.freeze({
  qiangzhuang: 6,
  dingzhuang: 5,
  xiazhu: 7,
  cuopai: 10,
  liangpai: 4,
  nextGame: 5,
});

const DEFAULT_AI_NAMES = ['茶友A', '茶友B', '茶友C', '茶友D', '茶友E', '阿茶', '小金'];

let _uid = 0;

export function createCard(rank, suit) {
  const r = Number(rank);
  const s = Number(suit);
  return {
    id: `nn_${r}_${s}_${_uid++}`,
    rank: r,
    suit: s,
    isRed: s === 0 || s === 2,
  };
}

/** Source string ""+rank+suit (rank 1–13, suit 1–4). */
export function toSourceCard(card) {
  if (card == null) return '';
  if (typeof card === 'string' || typeof card === 'number') return String(card);
  const rank = Number(card.rank);
  const suit = Number(card.suit);
  const srcSuit = suit >= 0 && suit <= 3 ? suit + 1 : suit;
  return `${rank}${srcSuit}`;
}

export function fromSourceCard(src) {
  const n = parseInt(src, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const srcSuit = n % 10;
  const rank = Math.floor(n / 10);
  return createCard(rank, srcSuit - 1);
}

export function createDeck52() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 1; rank <= 13; rank++) deck.push(createCard(rank, suit));
  }
  return deck;
}

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardText(c) {
  if (!c) return '';
  return `${SUITS[c.suit] || ''}${RANK_LABEL[c.rank] || c.rank}`;
}

export function pipValue(rank) {
  const r = Number(rank);
  return r > 10 ? 10 : r;
}

export function niuStampIndex(point) {
  const p = Number(point);
  if (!Number.isFinite(p) || p < 0) return 0;
  return Math.min(17, Math.max(0, Math.floor(p)));
}

export function niuName(point) {
  if (point == null) return '—';
  return NIU_NAME[point] || (point === 0 ? '没牛' : String(point));
}

export function niuStampSrc(point) {
  const i = niuStampIndex(point);
  return `./public/assets/niuniu/niu/niu${i}.png?v=play9nn1b`;
}

function sourceList(cards) {
  return (cards || []).filter((c) => c != null && c !== -1).map(toSourceCard);
}

function rankOfSource(src) {
  return Math.floor(parseInt(src, 10) / 10);
}

function suitOfSource(src) {
  return parseInt(src, 10) % 10;
}

// 顺子 — five distinct ranks, max-min == 4 (A is low = 1; T-A not a straight)
function checkShunzi(cards) {
  const dict = {};
  for (let i = 0; i < cards.length; i++) {
    const value = rankOfSource(cards[i]);
    dict[value] = dict[value] === undefined ? 1 : dict[value] + 1;
  }
  const count = [];
  let max = 0;
  let min = 99;
  for (const i in dict) {
    const j = parseInt(i, 10);
    if (j > max) max = j;
    if (j < min) min = j;
    count.push(dict[i]);
  }
  return count.length === 5 && (max - min) === 4;
}

function checkTonghua(cards) {
  let hua = 0;
  for (let i = 0; i < cards.length; i++) {
    const type = suitOfSource(cards[i]);
    if (hua === 0) hua = type;
    else if (type !== hua) return false;
  }
  return true;
}

function checkHulu(cards) {
  const dict = {};
  for (let i = 0; i < cards.length; i++) {
    const value = rankOfSource(cards[i]);
    dict[value] = dict[value] === undefined ? 1 : dict[value] + 1;
  }
  const count = [];
  for (const i in dict) count.push(dict[i]);
  return count.length === 2 && (count[0] === 3 || count[1] === 3);
}

function checkZhadan(cards) {
  const dict = {};
  for (let i = 0; i < cards.length; i++) {
    const value = rankOfSource(cards[i]);
    dict[value] = dict[value] === undefined ? 1 : dict[value] + 1;
  }
  const count = [];
  for (const i in dict) count.push(dict[i]);
  return count.length === 2 && (count[0] === 4 || count[1] === 4);
}

function checkWuxiao(cards) {
  let total = 0;
  for (let i = 0; i < cards.length; i++) {
    total += rankOfSource(cards[i]);
  }
  return total <= 10;
}

function checkWuhua(cards) {
  for (let i = 0; i < cards.length; i++) {
    if (parseInt(cards[i], 10) <= 104) return false;
  }
  return true;
}

/**
 * Final niu type. Specials 17…11 first, else 1–10 or -1 (没牛).
 * Accepts tea-parlor cards or source strings.
 */
export function calculate(cards) {
  const src = sourceList(cards);
  if (src.length !== 5) return -1;
  const isShunzi = checkShunzi(src);
  const isTonghua = checkTonghua(src);
  if (isShunzi && isTonghua) return 17;
  if (checkZhadan(src)) return 16;
  if (checkWuhua(src)) return 15;
  if (checkWuxiao(src)) return 14;
  if (checkHulu(src)) return 13;
  if (isTonghua) return 12;
  if (isShunzi) return 11;

  let s = 0;
  const dict = {};
  for (let i = 0; i < src.length; i++) {
    let ci = rankOfSource(src[i]);
    if (ci > 10) ci = 10;
    s += ci;
    dict[ci] = dict[ci] === undefined ? 1 : dict[ci] + 1;
  }
  let point = s % 10;
  let exists = false;
  for (const i in dict) {
    let other = (10 + point - i) % 10;
    if (other === 0) other = 10;
    if (dict[other]) {
      if ((other == i && dict[other] >= 2) || (other != i && dict[other] >= 1)) {
        exists = true;
        break;
      }
    }
  }
  if (point === 0) point = 10;
  return exists ? point : -1;
}

export function typeResult(point) {
  let beishu = 1;
  if (point === 7 || point === 8) beishu = 2;
  else if (point === 9) beishu = 3;
  else if (point === 10) beishu = 4;
  else if (point > 10) beishu = 5;
  return beishu;
}

/**
 * Compare two 5-card holds of equal niu type.
 * >0 holds1 wins, <0 holds2 wins.
 * Quirk: special most-frequent-rank kicker only for point 13 or 15, not 16.
 */
export function compare(holds1, holds2, point) {
  const src1 = sourceList(holds1);
  const src2 = sourceList(holds2);
  if (point === 13 || point === 15) {
    const dict1 = {};
    for (let i = 0; i < src1.length; i++) {
      const value = rankOfSource(src1[i]);
      dict1[value] = dict1[value] === undefined ? 1 : dict1[value] + 1;
    }
    let hold1 = 0;
    let count1 = 0;
    for (const i in dict1) {
      if (dict1[i] > count1) {
        count1 = dict1[i];
        hold1 = i;
      }
    }
    const dict2 = {};
    for (let i = 0; i < src2.length; i++) {
      const value = rankOfSource(src2[i]);
      dict2[value] = dict2[value] === undefined ? 1 : dict2[value] + 1;
    }
    let hold2 = 0;
    let count2 = 0;
    for (const i in dict2) {
      if (dict2[i] > count2) {
        count2 = dict2[i];
        hold2 = i;
      }
    }
    return hold1 - hold2;
  }
  let maxType1 = 0;
  let maxValue1 = 0;
  let maxType2 = 0;
  let maxValue2 = 0;
  for (let i = 0; i < src1.length; i++) {
    const value = Math.floor(src1[i] / 10);
    const type = src1[i] % 10;
    if (value > maxValue1) {
      maxValue1 = value;
      maxType1 = type;
    } else if (value === maxValue1 && type < maxType1) {
      maxType1 = type;
    }
  }
  for (let i = 0; i < src2.length; i++) {
    const value = Math.floor(src2[i] / 10);
    const type = src2[i] % 10;
    if (value > maxValue2) {
      maxValue2 = value;
      maxType2 = type;
    } else if (value === maxValue2 && type < maxType2) {
      maxType2 = type;
    }
  }
  if (maxValue1 > maxValue2) return 1;
  if (maxValue1 === maxValue2) return maxType1 < maxType2 ? 1 : -1;
  return -1;
}

/**
 * Banker vs each xian. Mutates seat.score / .niu / .isNiuniu.
 * Pay = score1 × score2 × difen × typeResult(winner niu).
 */
export function calculateResult(seats, button, difen) {
  const seatData = seats[button];
  if (!seatData) return;
  const value = calculate(seatData.holds);
  seatData.niu = value;
  if (value >= 10) seatData.isNiuniu = true;
  const beishu = typeResult(value);
  for (let i = 0; i < seats.length; i++) {
    const sd = seats[i];
    if (!sd || sd.sit === 0 || i === button) continue;
    const value2 = calculate(sd.holds);
    sd.niu = value2;
    if (value2 >= 10) sd.isNiuniu = true;
    if (value > value2) {
      const score = seatData.score1 * sd.score2 * difen * beishu;
      seatData.score += score;
      sd.score -= score;
    } else if (value === value2) {
      const result = compare(seatData.holds, sd.holds, value);
      if (result > 0) {
        const score = seatData.score1 * sd.score2 * difen * beishu;
        seatData.score += score;
        sd.score -= score;
      } else if (result < 0) {
        const beishu2 = typeResult(value2);
        const score = seatData.score1 * sd.score2 * difen * beishu2;
        seatData.score -= score;
        sd.score += score;
      }
    } else {
      const beishu2 = typeResult(value2);
      const score = seatData.score1 * sd.score2 * difen * beishu2;
      seatData.score -= score;
      sd.score += score;
    }
  }
}

function cloneCard(c) {
  if (!c) return null;
  return { id: c.id, rank: c.rank, suit: c.suit, isRed: c.isRed };
}

/**
 * 看牌抢庄 table. 6 seats, local vs-AI. No 轮庄 branch.
 */
export function createNiuniuTable(options = {}) {
  const n = SEAT_COUNT;
  const difen = Math.max(1, Number(options.difen) || 5);
  const startChips = Math.max(difen * 40, Number(options.chips) || 2000);
  const pool = shuffle(DEFAULT_AI_NAMES.slice(), Math.random);
  const names = [];
  for (let i = 0; i < n; i++) {
    names.push(i === 0 ? (options.humanName || '茶馆') : (options.names?.[i] || pool[i - 1] || `茶友${i}`));
  }

  const state = {
    names,
    difen,
    // 轮庄 conf exists in source but is never branched — 看牌抢庄 only.
    lunzhuang: false,
    seats: [],
    button: -1,
    phase: PHASE.idle,
    dingCandidates: [],
    lastAction: '',
    publicCode: '',
  };

  function resetSeats() {
    state.seats = [];
    for (let i = 0; i < n; i++) {
      state.seats.push({
        seatIndex: i,
        name: names[i],
        isHuman: i === 0,
        sit: 1,
        holds: [],
        score: 0,
        score1: 0,
        score2: 0,
        hasQiang: false,
        hasXia: false,
        hasLiang: false,
        hasKan: false,
        niu: null,
        isNiuniu: false,
        chips: startChips,
      });
    }
    state.button = -1;
    state.dingCandidates = [];
  }

  function sitting() {
    return state.seats.map((s, i) => (s && s.sit === 1 ? i : -1)).filter((i) => i >= 0);
  }

  function deal(forcedHolds) {
    resetSeats();
    let deck;
    if (Array.isArray(forcedHolds) && forcedHolds.length === n) {
      deck = [];
      for (let i = 0; i < n; i++) state.seats[i].holds = forcedHolds[i].map(cloneCard);
    } else {
      deck = shuffle(createDeck52());
      let di = 0;
      for (let r = 0; r < 5; r++) {
        for (let s = 0; s < n; s++) {
          state.seats[s].holds.push(deck[di++]);
        }
      }
    }
    state.phase = PHASE.qiangzhuang;
    state.lastAction = '发牌 · 看牌抢庄';
    return { ok: true };
  }

  function qiangzhuang(seat, value) {
    if (state.phase !== PHASE.qiangzhuang) return { ok: false, reason: 'not_qiang' };
    const sd = state.seats[seat];
    if (!sd || sd.sit === 0) return { ok: false, reason: 'empty' };
    if (sd.hasQiang) return { ok: false, reason: 'already' };
    const v = Math.max(0, Math.min(4, Math.floor(Number(value) || 0)));
    sd.score1 = v;
    sd.hasQiang = true;
    state.lastAction = `${sd.name}${v === 0 ? ' 不抢' : ` 抢 ${v} 倍`}`;
    const all = sitting().every((i) => state.seats[i].hasQiang);
    if (all) dingzhuang();
    return { ok: true, done: all };
  }

  function timeoutQiang() {
    if (state.phase !== PHASE.qiangzhuang) return { ok: false };
    for (const i of sitting()) {
      const sd = state.seats[i];
      if (!sd.hasQiang) {
        sd.score1 = 0;
        sd.hasQiang = true;
      }
    }
    dingzhuang();
    return { ok: true };
  }

  function dingzhuang() {
    let maxScore = 0;
    let indexArr = [];
    for (let i = 0; i < state.seats.length; i++) {
      const ddd = state.seats[i];
      if (!ddd || ddd.sit === 0) continue;
      if (ddd.score1 > maxScore) {
        maxScore = ddd.score1;
        indexArr = [i];
      } else if (ddd.score1 === maxScore) {
        indexArr.push(i);
      }
    }
    if (indexArr.length === 1) {
      state.button = indexArr[0];
      const sd = state.seats[state.button];
      if (sd.score1 === 0) sd.score1 = 1;
      state.dingCandidates = [state.button];
      state.lastAction = `${sd.name} 成为庄家 ×${sd.score1}`;
      beginXiazhu();
    } else {
      const random = Math.floor(Math.random() * indexArr.length);
      state.button = indexArr[random];
      state.dingCandidates = indexArr.slice();
      const sd = state.seats[state.button];
      if (sd.score1 === 0) sd.score1 = 1;
      state.phase = PHASE.dingzhuang;
      state.lastAction = `多人同倍 · 随机定庄 ${sd.name}`;
    }
    return { ok: true, button: state.button };
  }

  function finishDingzhuang() {
    if (state.phase !== PHASE.dingzhuang) return { ok: false };
    beginXiazhu();
    return { ok: true };
  }

  function beginXiazhu() {
    state.phase = PHASE.xiazhu;
    const sd = state.seats[state.button];
    state.lastAction = `庄 ${sd.name} ×${sd.score1} · 闲家下注`;
  }

  function xiazhu(seat, value) {
    if (state.phase !== PHASE.xiazhu) return { ok: false, reason: 'not_xia' };
    if (seat === state.button) return { ok: false, reason: 'banker' };
    const sd = state.seats[seat];
    if (!sd || sd.sit === 0) return { ok: false, reason: 'empty' };
    if (sd.hasXia) return { ok: false, reason: 'already' };
    const v = Math.max(1, Math.min(5, Math.floor(Number(value) || 1)));
    sd.score2 = v;
    sd.hasXia = true;
    state.lastAction = `${sd.name} 下 ${v} 倍`;
    const need = sitting().filter((i) => i !== state.button);
    const all = need.every((i) => state.seats[i].hasXia);
    if (all) cuopai();
    return { ok: true, done: all };
  }

  function timeoutXia() {
    if (state.phase !== PHASE.xiazhu) return { ok: false };
    for (const i of sitting()) {
      if (i === state.button) continue;
      const sd = state.seats[i];
      if (!sd.hasXia) {
        sd.score2 = 2; // source default
        sd.hasXia = true;
      }
    }
    cuopai();
    return { ok: true };
  }

  function cuopai() {
    state.phase = PHASE.cuopai;
    state.lastAction = '搓牌 / 开牌';
    for (const i of sitting()) {
      const sd = state.seats[i];
      sd.niu = calculate(sd.holds);
    }
  }

  function kanpai(seat) {
    if (state.phase !== PHASE.cuopai) return { ok: false, reason: 'not_cuo' };
    const sd = state.seats[seat];
    if (!sd) return { ok: false };
    sd.hasKan = true;
    state.lastAction = `${sd.name} 看牌`;
    return { ok: true };
  }

  function liangpai(seat) {
    if (state.phase !== PHASE.cuopai) return { ok: false, reason: 'not_cuo' };
    const sd = state.seats[seat];
    if (!sd || sd.hasLiang) return { ok: false, reason: 'already' };
    sd.hasLiang = true;
    sd.hasKan = true;
    sd.niu = calculate(sd.holds);
    state.lastAction = `${sd.name} 开牌 · ${niuName(sd.niu)}`;
    const all = sitting().every((i) => state.seats[i].hasLiang);
    if (all) bipai();
    return { ok: true, done: all, niu: sd.niu };
  }

  function timeoutLiang() {
    if (state.phase !== PHASE.cuopai) return { ok: false };
    for (const i of sitting()) {
      const sd = state.seats[i];
      if (!sd.hasLiang) {
        sd.hasLiang = true;
        sd.hasKan = true;
        sd.niu = calculate(sd.holds);
      }
    }
    bipai();
    return { ok: true };
  }

  function bipai() {
    state.phase = PHASE.bipai;
    state.lastAction = '比牌结算';
    doSettle();
  }

  function doSettle() {
    calculateResult(state.seats, state.button, state.difen);
    for (const sd of state.seats) {
      if (!sd || sd.sit === 0) continue;
      sd.chips += sd.score;
    }
    state.phase = PHASE.settle;
    const banker = state.seats[state.button];
    state.lastAction = `结算 · 庄 ${banker?.name || ''} ${banker?.score >= 0 ? '+' : ''}${banker?.score || 0}`;
    return { ok: true };
  }

  function snapshot(forSeat = 0) {
    const revealAll = state.phase === PHASE.bipai || state.phase === PHASE.settle;
    const cuo = state.phase === PHASE.cuopai;
    return {
      names: state.names.slice(),
      difen: state.difen,
      phase: state.phase,
      button: state.button,
      dingCandidates: state.dingCandidates.slice(),
      lastAction: state.lastAction,
      lunzhuang: false,
      qiangOptions: QIANG_OPTIONS.slice(),
      xiaOptions: XIA_OPTIONS.slice(),
      timers: { ...TIMERS },
      seats: state.seats.map((sd, i) => {
        const mine = i === forSeat;
        let holds;
        if (revealAll || sd.hasLiang) {
          holds = sd.holds.map(cloneCard);
        } else if (mine && (state.phase === PHASE.qiangzhuang
          || state.phase === PHASE.dingzhuang
          || state.phase === PHASE.xiazhu
          || cuo)) {
          holds = sd.holds.map(cloneCard);
          // play9nn1b: keep 5th hole until 搓牌/开牌 so 搓 is tappable+visible
          if (!sd.hasKan && !sd.hasLiang) {
            holds[holds.length - 1] = null;
          }
        } else if (mine && cuo) {
          holds = sd.holds.map(cloneCard);
          if (!sd.hasKan && !sd.hasLiang) holds[holds.length - 1] = null;
        } else {
          holds = sd.holds.map(() => null);
        }
        const showNiu = revealAll || sd.hasLiang || (mine && (sd.hasKan || sd.hasLiang));
        return {
          seat: i,
          name: sd.name,
          isHuman: sd.isHuman,
          sit: sd.sit,
          holds,
          rawHolds: (revealAll || mine) ? sd.holds.map(cloneCard) : null,
          score: sd.score,
          score1: sd.score1,
          score2: sd.score2,
          hasQiang: sd.hasQiang,
          hasXia: sd.hasXia,
          hasLiang: sd.hasLiang,
          hasKan: sd.hasKan,
          niu: showNiu ? sd.niu : null,
          niuName: showNiu ? niuName(sd.niu) : '',
          isNiuniu: !!sd.isNiuniu,
          chips: sd.chips,
          isBanker: state.button === i,
        };
      }),
      deltas: state.phase === PHASE.settle ? state.seats.map((s) => s.score) : state.seats.map(() => 0),
    };
  }

  return {
    deal,
    qiangzhuang,
    timeoutQiang,
    dingzhuang,
    finishDingzhuang,
    xiazhu,
    timeoutXia,
    kanpai,
    liangpai,
    timeoutLiang,
    snapshot,
    state,
    SEAT_COUNT: n,
  };
}
