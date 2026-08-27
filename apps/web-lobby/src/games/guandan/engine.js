/**
 * 掼蛋 H5 对局引擎（2v2 · 可玩精简桌）
 * 规则核心来自 @tea-parlor/guandan-engine（/vendor）
 */

import {
  createGuanDanDeck,
  cardText,
  isWild,
  identifyGuanDanHand,
  bestGuanDanHand,
  canSuppress,
  HandType,
  HAND_TYPE_NAME,
  teammateOf,
  sameTeam,
  TributeStateMachine,
  TributePhase,
  listReturnableCards,
  resolvePassWind,
  GuanDanSettlement,
  calculateLevelProgress,
  makeGuanDanAIDecision,
  GuanDanAIAction,
} from '/vendor/guandan-engine/index.js';
// 依赖 apps/web-lobby/server.js 的 /vendor/guandan-engine 映射

export {
  cardText,
  isWild,
  HandType,
  HAND_TYPE_NAME,
  teammateOf,
  sameTeam,
  TributePhase,
  GuanDanAIAction,
};

export const Phase = Object.freeze({
  IDLE: 'idle',
  TRIBUTE: 'tribute',
  PLAY: 'play',
  SETTLE: 'settle',
});

const NAMES = ['茶馆', '茶友A', '茶友B', '茶友C'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(cards, currentRank) {
  return cards.slice().sort((a, b) => {
    // 大→小展示
    const ra = a.rank === 17 ? 100 : a.rank === 16 ? 99 : (a.rank === currentRank ? 15 : a.rank);
    const rb = b.rank === 17 ? 100 : b.rank === 16 ? 99 : (b.rank === currentRank ? 15 : b.rank);
    if (rb !== ra) return rb - ra;
    return (b.suit || 0) - (a.suit || 0);
  });
}

/**
 * @param {object} [opts]
 * @param {number} [opts.stake=100]
 * @param {number} [opts.currentRank=2]
 * @param {boolean} [opts.skipTribute=false]  首局可跳过进贡
 * @param {number[]} [opts.prevFinishOrder]  上局名次用于进贡
 */
export function createGuanDanTable(opts = {}) {
  const stake = opts.stake ?? 100;
  const names = (opts.names || NAMES).slice(0, 4);
  /** @type {GuanDanSettlement} */
  const career = opts.settlement instanceof GuanDanSettlement
    ? opts.settlement
    : new GuanDanSettlement({
      team0Level: opts.team0Level ?? 2,
      team1Level: opts.team1Level ?? 2,
      bankerTeam: opts.bankerTeam ?? 0,
    });

  let phase = Phase.IDLE;
  let currentRank = career.currentRank();
  /** @type {import('/vendor/guandan-engine/card.js').Card[][]} */
  let hands = [[], [], [], []];
  let finished = /** @type {number[]} */ ([]); // 出完顺序
  let currentSeat = 0;
  let lastPlay = /** @type {{ seat: number, hand: object, cards: object[] }|null} */ (null);
  let seatPlays = /** @type {(null|{ seat: number, cards: object[] })[]} */ ([null, null, null, null]);
  let passStreak = 0;
  let leadSeat = 0;
  /** @type {TributeStateMachine|null} */
  let tribute = null;
  let lastRecord = null;
  let message = '';

  function deal() {
    currentRank = career.currentRank();
    const deck = shuffle(shuffle(createGuanDanDeck()));
    hands = [[], [], [], []];
    for (let i = 0; i < 108; i++) {
      hands[i % 4].push(deck[i]);
    }
    hands = hands.map((h) => sortHand(h, currentRank));
    finished = [];
    lastPlay = null;
    seatPlays = [null, null, null, null];
    passStreak = 0;
    // 红心级牌拥有者（非逢人配本身）先手：有红心级牌的最小座位
    leadSeat = 0;
    for (let s = 0; s < 4; s++) {
      if (hands[s].some((c) => isWild(c, currentRank))) {
        leadSeat = s;
        break;
      }
    }
    currentSeat = leadSeat;
  }

  function activeSeats() {
    return [0, 1, 2, 3].filter((s) => hands[s].length > 0 && !finished.includes(s));
  }

  function start(options = {}) {
    deal();
    lastRecord = null;
    message = `打 ${rankLabel(currentRank)} · 每人 ${hands[0].length} 张`;

    const prev = options.prevFinishOrder || opts.prevFinishOrder;
    const skipTribute = options.skipTribute ?? opts.skipTribute ?? !prev;

    if (!skipTribute && prev && prev.length >= 4) {
      const handsMap = { 0: hands[0], 1: hands[1], 2: hands[2], 3: hands[3] };
      tribute = new TributeStateMachine({
        finishOrder: prev,
        hands: handsMap,
        currentRank,
      });
      const snap = tribute.start();
      // 同步手牌
      for (let s = 0; s < 4; s++) {
        hands[s] = sortHand(snap.hands[s] || [], currentRank);
      }
      if (snap.anti) {
        message = '抗贡！取消进贡，直接开打';
        phase = Phase.PLAY;
        tribute = null;
      } else if (snap.phase === TributePhase.RETURNING || snap.phase === TributePhase.EXECUTING) {
        phase = Phase.TRIBUTE;
        message = snap.kind === 'double' ? '双进贡 · 请收贡方还贡' : '单进贡 · 请收贡方还贡';
        // 自动完成 AI 还贡，真人若是收贡方则等待
        autoResolveTributeReturns();
      } else {
        phase = Phase.PLAY;
        tribute = null;
      }
    } else {
      phase = Phase.PLAY;
      tribute = null;
    }

    if (phase === Phase.PLAY) {
      message = `${names[currentSeat]} 先出 · 打 ${rankLabel(currentRank)}`;
    }
    return snapshot(0);
  }

  function autoResolveTributeReturns() {
    if (!tribute) return;
    let guard = 0;
    while (tribute.phase === TributePhase.RETURNING && guard++ < 8) {
      const seat = tribute.currentReturnSeat();
      if (seat == null) break;
      if (seat === 0) break; // 真人还贡
      const r = tribute.autoReturn(seat);
      if (!r.ok) break;
    }
    if (tribute.phase === TributePhase.GAME_START) {
      for (let s = 0; s < 4; s++) {
        hands[s] = sortHand(tribute.hands[s] || [], currentRank);
      }
      tribute = null;
      phase = Phase.PLAY;
      message = `${names[currentSeat]} 先出 · 打 ${rankLabel(currentRank)}`;
    }
  }

  /**
   * 真人还贡
   * @param {object|string} cardOrId
   */
  function humanReturnTribute(cardOrId) {
    if (phase !== Phase.TRIBUTE || !tribute) {
      return { ok: false, reason: 'not_tribute' };
    }
    if (tribute.currentReturnSeat() !== 0) {
      return { ok: false, reason: 'not_your_return' };
    }
    const r = tribute.returnTribute(0, cardOrId);
    if (!r.ok) return r;
    autoResolveTributeReturns();
    if (tribute && tribute.phase === TributePhase.GAME_START) {
      for (let s = 0; s < 4; s++) hands[s] = sortHand(tribute.hands[s] || [], currentRank);
      tribute = null;
      phase = Phase.PLAY;
    } else if (tribute) {
      for (let s = 0; s < 4; s++) hands[s] = sortHand(tribute.hands[s] || [], currentRank);
    }
    return { ok: true, snapshot: snapshot(0) };
  }

  /**
   * 解析选中牌为 HandResult
   * @param {object[]} cards
   */
  function parsePlay(cards) {
    if (!cards?.length) return null;
    return bestGuanDanHand(cards, currentRank);
  }

  /**
   * @param {number} seat
   * @param {object[]|null} cards  null = pass
   */
  function act(seat, cards) {
    if (phase !== Phase.PLAY) return { ok: false, reason: 'not_play' };
    if (Number(seat) !== currentSeat) return { ok: false, reason: 'not_turn' };
    if (finished.includes(seat)) return { ok: false, reason: 'already_finished' };

    // 过牌
    if (!cards || cards.length === 0) {
      if (!lastPlay) return { ok: false, reason: 'must_lead' };
      passStreak += 1;
      const lastSeat = lastPlay.seat;
      const others = activeSeats().filter((s) => s !== lastSeat);
      if (passStreak >= others.length || others.length === 0) {
        // 一圈无人压：领出者继续；若领出者已出完则队友接风
        const finisherLead = finished.includes(lastSeat);
        lastPlay = null;
        seatPlays = [null, null, null, null];
        passStreak = 0;
        if (finisherLead) {
          const pw = resolvePassWind({
            finishedSeat: lastSeat,
            lastPlaySeat: lastSeat,
            wasBeaten: false,
            activeSeats: activeSeats(),
          });
          if (pw.passWind && pw.nextSeat != null && activeSeats().includes(pw.nextSeat)) {
            currentSeat = pw.nextSeat;
            message = `${names[seat]} 过 · 接风 ${names[currentSeat]}`;
          } else {
            currentSeat = nextActive(lastSeat);
            message = `${names[seat]} 过 · ${names[currentSeat]} 自由出牌`;
          }
        } else {
          currentSeat = (hands[lastSeat]?.length > 0 && !finished.includes(lastSeat))
            ? lastSeat
            : nextActive(lastSeat);
          message = `${names[seat]} 过 · ${names[currentSeat]} 自由出牌`;
        }
      } else {
        currentSeat = nextActive(seat);
        message = `${names[seat]} 过`;
      }
      return { ok: true, snapshot: snapshot(0) };
    }

    // 校验牌在手中且无重复
    const hand = hands[seat];
    const used = new Set();
    for (const c of cards) {
      if (!c || c.id == null || used.has(c.id) || !hand.some((h) => h.id === c.id)) {
        return { ok: false, reason: 'not_in_hand' };
      }
      used.add(c.id);
    }
    const parsed = parsePlay(cards);
    if (!parsed) return { ok: false, reason: 'invalid_hand' };

    if (lastPlay) {
      if (!canSuppress(parsed, lastPlay.hand, currentRank)) {
        return { ok: false, reason: 'cannot_beat' };
      }
    }

    // 扣牌
    const ids = new Set(cards.map((c) => c.id));
    hands[seat] = hand.filter((c) => !ids.has(c.id));
    lastPlay = { seat, hand: parsed, cards: cards.map((c) => ({ ...c })) };
    seatPlays[seat] = { seat, cards: lastPlay.cards };
    passStreak = 0;
    leadSeat = seat;
    message = `${names[seat]} 出 ${parsed.name || ''}`;

    if (hands[seat].length === 0) {
      finished.push(seat);
      message = `${names[seat]} · 第 ${finished.length} 名`;
      const mate = teammateOf(seat);
      if (finished.includes(mate) || finished.length >= 3) {
        completeRanking();
        return { ok: true, finished: true, snapshot: snapshot(0) };
      }
      // 接风须等这手牌无人压过；先交给下家跟牌
      currentSeat = nextActive(seat);
    } else {
      currentSeat = nextActive(seat);
    }
    return { ok: true, snapshot: snapshot(0) };
  }

  function nextActive(from) {
    for (let i = 1; i <= 4; i++) {
      const s = (from + i) % 4;
      if (hands[s].length > 0 && !finished.includes(s)) return s;
    }
    return from;
  }

  function completeRanking() {
    const rest = [0, 1, 2, 3].filter((s) => !finished.includes(s));
    // 剩余按手牌少者优先，否则按座位
    rest.sort((a, b) => hands[a].length - hands[b].length || a - b);
    finished = [...finished, ...rest];
    settle();
  }

  function settle() {
    phase = Phase.SETTLE;
    const order = finished.slice(0, 4);
    while (order.length < 4) {
      for (let s = 0; s < 4; s++) {
        if (!order.includes(s)) order.push(s);
      }
    }
    const rec = career.settleHand(order);
    lastRecord = rec;
    const progress = calculateLevelProgress(order, { currentLevel: rec.levelBefore });
    const winTeam = rec.winTeam;
    const humanWin = winTeam === 0; // seat 0 team
    const mult = progress.pattern === 'double_down' ? 3
      : progress.pattern === 'one_three' ? 2
        : 1;
    const deltaHuman = humanWin ? stake * mult : -stake * mult;
    const deltas = [0, 1, 2, 3].map((s) => {
      const team = s % 2;
      return team === winTeam ? stake * mult : -stake * mult;
    });
    message = humanWin
      ? `胜 · ${patternLabel(progress.pattern)} · +${deltas[0]}`
      : `负 · ${patternLabel(progress.pattern)} · ${deltas[0]}`;
    lastRecord = {
      ...rec,
      deltas,
      stake,
      mult,
      names: names.slice(),
      finishOrder: order,
      currentRank,
      nextRank: career.currentRank(),
      winnerTeam: winTeam,
    };
  }

  /**
   * AI 一步
   * @param {number} seat
   */
  function aiAct(seat) {
    if (phase === Phase.TRIBUTE && tribute) {
      autoResolveTributeReturns();
      return snapshot(0);
    }
    if (phase !== Phase.PLAY || currentSeat !== seat) return snapshot(0);

    const dec = makeGuanDanAIDecision(
      { seat, hand: hands[seat] },
      {
        currentRank,
        currentSeat: seat,
        lastPlaySeat: lastPlay?.seat ?? null,
        lastHand: lastPlay?.hand ?? null,
        handCounts: hands.map((h) => h.length),
        activeSeats: activeSeats(),
      },
    );

    if (dec.action === GuanDanAIAction.PASS || !dec.hand) {
      act(seat, null);
    } else {
      // 从手牌取真实 card 对象
      const need = dec.cards?.length || dec.hand.cards?.length || 0;
      let playCards = [];
      if (dec.cards?.length) {
        playCards = dec.cards.map((c) => hands[seat].find((h) => h.id === c.id || (h.rank === c.rank && h.suit === c.suit))).filter(Boolean);
      }
      if (playCards.length < need) {
        // 回退：用 hand 的 pattern 从手牌凑
        playCards = pickCardsForHand(hands[seat], dec.hand);
      }
      if (!playCards.length) act(seat, null);
      else {
        const r = act(seat, playCards);
        if (!r.ok) act(seat, null);
      }
    }
    return snapshot(0);
  }

  function pickCardsForHand(hand, handResult) {
    if (!handResult) return [];
    const n = handResult.length || handResult.cards?.length || 0;
    if (handResult.cards?.length) {
      const ids = new Set(handResult.cards.map((c) => c.id).filter(Boolean));
      const byId = hand.filter((c) => ids.has(c.id));
      if (byId.length === handResult.cards.length) return byId;
    }
    // 按点数取
    const pattern = handResult.pattern || [];
    const pool = hand.slice();
    const out = [];
    for (const r of pattern) {
      const idx = pool.findIndex((c) => c.rank === r);
      if (idx >= 0) out.push(pool.splice(idx, 1)[0]);
    }
    if (out.length === pattern.length && pattern.length) return out;
    // 炸弹等同点
    if (handResult.type === HandType.BOMB || handResult.type === HandType.PAIR
      || handResult.type === HandType.TRIPLE || handResult.type === HandType.SINGLE) {
      const same = hand.filter((c) => c.rank === handResult.primary);
      const need = handResult.bombSize || handResult.length || n || 1;
      if (same.length >= need) return same.slice(0, need);
    }
    return [];
  }

  function remainMeter() {
    const ranks = [17, 16, currentRank, 14, 13, 12, 11];
    const all = hands.flat();
    const counts = {};
    for (const r of ranks) counts[r] = all.filter((c) => c.rank === r).length;
    return counts;
  }

  /**
   * 合法提示：能压上家的一手（或自由最小）
   * @param {number} seat
   */
  function hint(seat) {
    const hand = hands[seat] || [];
    // 单张提示
    const singles = hand.map((c) => bestGuanDanHand([c], currentRank)).filter(Boolean);
    if (!lastPlay) {
      return singles.sort((a, b) => a.primary - b.primary)[0] || bestGuanDanHand(hand.slice(0, 1), currentRank);
    }
    for (const c of hand) {
      const h = bestGuanDanHand([c], currentRank);
      if (h && canSuppress(h, lastPlay.hand, currentRank)) return h;
    }
    // 尝试整手炸弹
    const all = identifyGuanDanHand(hand, currentRank);
    for (const h of all) {
      if (canSuppress(h, lastPlay.hand, currentRank)) return h;
    }
    return null;
  }

  function snapshot(viewSeat = 0) {
    const tributeSnap = tribute?.snapshot?.() || null;
    return {
      phase,
      currentRank,
      currentSeat,
      leadSeat,
      lastPlay: lastPlay
        ? {
          seat: lastPlay.seat,
          name: lastPlay.hand?.name,
          type: lastPlay.hand?.type,
          cards: lastPlay.cards,
          text: (lastPlay.cards || []).map(cardText).join(' '),
        }
        : null,
      seatPlays: seatPlays.map((p) => (p ? { seat: p.seat, cards: p.cards } : null)),
      remainMeter: remainMeter(),
      finished: finished.slice(),
      hands: hands.map((h, i) => (
        i === viewSeat || phase === Phase.SETTLE
          ? h.map((c) => ({ ...c }))
          : h.map((c) => ({ id: c.id, hidden: true }))
      )),
      handCounts: hands.map((h) => h.length),
      names: names.slice(),
      message,
      stake,
      tribute: tributeSnap,
      returnable: phase === Phase.TRIBUTE && tribute?.currentReturnSeat() === 0
        ? listReturnableCards(hands[0])
        : [],
      settlement: career.snapshot(),
      lastRecord,
      active: activeSeats(),
      humanTurn: phase === Phase.PLAY && currentSeat === 0,
      humanReturn: phase === Phase.TRIBUTE && tribute?.currentReturnSeat() === 0,
    };
  }

  return {
    start,
    act,
    aiAct,
    hint,
    humanReturnTribute,
    snapshot,
    get phase() { return phase; },
    get career() { return career; },
    parsePlay,
  };
}

function rankLabel(r) {
  const m = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  return m[r] || String(r);
}

function patternLabel(p) {
  if (p === 'double_down') return '双下升3';
  if (p === 'one_three') return '1+3 升2';
  if (p === 'one_four') return '1+4 升1';
  return p || '';
}
