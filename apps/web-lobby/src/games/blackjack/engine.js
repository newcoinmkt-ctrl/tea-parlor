/**
 * 二十一点多人引擎（2–7 名玩家 + 庄家）
 *
 * - 每人各发 2 张，庄家 1 明 1 暗
 * - 从座位 0（真人）起依次行动，AI 自动要/停（软 17 停）
 * - 庄家 S17；黑杰克 3:2；加倍/分牌仅真人；保险仅真人
 * - 钱包只结算真人净输赢
 */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;

const AI_NAMES = ['茶友A', '茶友B', '茶友C', '茶友D', '茶友E', '茶友F', '茶友G', '阿茶', '小金', '老K'];

let _uid = 0;

export function createCard(rank, suit) {
  return {
    id: `bj_${rank}_${suit}_${_uid++}`,
    rank,
    suit,
    isRed: suit === 0 || suit === 2,
  };
}

export function createDeck52() {
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) deck.push(createCard(rank, suit));
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
  if (rank >= 11 && rank <= 13) return 10;
  if (rank === 14) return 11;
  return rank;
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards || []) {
    if (!c) continue;
    if (c.rank === 14) {
      aces += 1;
      total += 11;
    } else {
      total += pipValue(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return {
    total,
    soft: aces > 0 && total <= 21,
    bust: total > 21,
  };
}

export function isBlackjack(cards) {
  return Array.isArray(cards) && cards.length === 2 && handValue(cards).total === 21;
}

export function isPair(cards) {
  if (!cards || cards.length !== 2) return false;
  return pipValue(cards[0].rank) === pipValue(cards[1].rank);
}

function clampPlayers(n) {
  const v = Math.round(Number(n) || 4);
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, v));
}

function makeHand(bet) {
  return {
    cards: [],
    bet,
    stood: false,
    doubled: false,
    fromSplit: false,
    done: false,
    result: null,
    payout: null,
  };
}

/**
 * @param {object} options
 * @param {number} [options.playerCount=4] 2–7 名玩家（含真人，不含庄家）
 * @param {number} [options.minBet]
 * @param {number} [options.maxBet]
 * @param {number} [options.chips] 真人筹码
 * @param {string} [options.label]
 * @param {string} [options.humanName]
 */
export function createBlackjackTable(options = {}) {
  const minBet = Math.max(1, Number(options.minBet) || 50);
  const maxBet = Math.max(minBet, Number(options.maxBet) || minBet * 100);
  let chips = Math.max(0, Number(options.chips) || 2000);
  const label = options.label || '二十一点';
  const humanName = options.humanName || '玩家';
  let playerCount = clampPlayers(options.playerCount ?? 4);

  /** @type {{ seat: number, name: string, isHuman: boolean, hands: ReturnType<typeof makeHand>[], aiChips: number }[]} */
  let seats = [];
  const forcedShoe = Array.isArray(options.shoe);
  let shoe = forcedShoe ? options.shoe.slice() : [];
  let phase = 'betting'; // betting | insurance | player | dealer | settle
  let dealer = [];
  let dealerHoleHidden = true;
  let activeSeat = 0;
  let activeHand = 0;
  let pendingBet = minBet;
  let insuranceBet = 0;
  let lastMsg = '选择人数并下注后发牌';
  let roundDelta = 0;
  let sessionDelta = 0;

  function buildSeats(count) {
    playerCount = clampPlayers(count);
    const pool = shuffle(AI_NAMES.slice());
    seats = [];
    for (let i = 0; i < playerCount; i++) {
      seats.push({
        seat: i,
        name: i === 0 ? humanName : (pool[i - 1] || `茶友${i}`),
        isHuman: i === 0,
        hands: [],
        aiChips: 5000 + Math.floor(Math.random() * 5000),
      });
    }
  }

  function ensureShoe(n = 20) {
    if (forcedShoe && shoe.length > 0) return;
    if (shoe.length < n) {
      _uid = 0;
      // 多人多靴
      const decks = playerCount >= 5 ? 4 : 2;
      let d = [];
      for (let i = 0; i < decks; i++) d = d.concat(createDeck52());
      shoe = shoe.concat(shuffle(shuffle(d)));
    }
  }

  function draw() {
    ensureShoe(12);
    return shoe.pop();
  }

  function resetRoundKeepChips() {
    dealer = [];
    dealerHoleHidden = true;
    activeSeat = 0;
    activeHand = 0;
    insuranceBet = 0;
    phase = 'betting';
    roundDelta = 0;
    pendingBet = Math.min(maxBet, Math.max(minBet, pendingBet || minBet));
    if (pendingBet > chips) pendingBet = Math.min(Math.max(chips, 0), minBet) || minBet;
    seats.forEach((s) => { s.hands = []; });
    lastMsg = chips < minBet ? '筹码不足，请回大厅补给' : `本桌 ${playerCount} 人 · 请下注后发牌`;
  }

  function setPlayerCount(n) {
    if (phase !== 'betting') return { ok: false, reason: 'not_betting' };
    buildSeats(n);
    lastMsg = `已选 ${playerCount} 人桌 · 请下注后发牌`;
    return { ok: true, playerCount };
  }

  function setBet(amount) {
    if (phase !== 'betting') return { ok: false, reason: 'not_betting' };
    let a = Math.round(Number(amount) || 0);
    if (a < minBet) return { ok: false, reason: 'min_bet', minBet };
    if (a > maxBet) a = maxBet;
    if (a > chips) return { ok: false, reason: 'no_chips', chips };
    pendingBet = a;
    lastMsg = `已选注码 ${pendingBet} · ${playerCount} 人桌`;
    return { ok: true, bet: pendingBet };
  }

  function deal() {
    if (phase !== 'betting') return { ok: false, reason: 'not_betting' };
    if (!seats.length) buildSeats(playerCount);
    if (chips < minBet) return { ok: false, reason: 'no_chips' };

    let humanBet = Math.min(maxBet, Math.max(minBet, pendingBet || minBet));
    if (humanBet > chips) humanBet = chips;
    if (humanBet < minBet) return { ok: false, reason: 'no_chips' };

    ensureShoe(playerCount * 4 + 10);
    // 每人下主注（真人扣钱包筹码，AI 扣虚拟筹）
    seats.forEach((s) => {
      const bet = s.isHuman ? humanBet : Math.min(maxBet, minBet * (1 + Math.floor(Math.random() * 3)));
      if (s.isHuman) {
        chips -= bet;
        roundDelta -= bet;
        sessionDelta -= bet;
      } else {
        s.aiChips = Math.max(0, s.aiChips - bet);
      }
      s.hands = [makeHand(bet)];
    });
    pendingBet = humanBet;

    // 发牌：先各一张，再各一张（标准轮发）
    dealer = [];
    for (let r = 0; r < 2; r++) {
      for (const s of seats) s.hands[0].cards.push(draw());
      dealer.push(draw());
    }

    dealerHoleHidden = true;
    insuranceBet = 0;
    activeSeat = 0;
    activeHand = 0;

    const dBj = isBlackjack(dealer);

    // 明牌 A 必须先买保险，再看暗牌是否 BJ（保险只在庄家 BJ 时才赢）
    if (dealer[0].rank === 14) {
      phase = 'insurance';
      lastMsg = '庄家明牌 A · 可买保险或跳过';
      return { ok: true, phase };
    }

    if (dBj || seats.every((s) => isBlackjack(s.hands[0].cards))) {
      return finishNaturalsRound(dBj);
    }

    // 跳过已 BJ 的座位
    phase = 'player';
    beginPlayerTurns();
    return { ok: true, phase };
  }

  function finishNaturalsRound(dBj) {
    dealerHoleHidden = false;
    phase = 'settle';
    for (const s of seats) {
      for (const h of s.hands) {
        const pBj = isBlackjack(h.cards) && !h.fromSplit;
        settleOneHand(s, h, dBj, handValue(dealer), true);
        if (pBj && !dBj && s.isHuman) {
          // already handled in settleOneHand
        }
        h.done = true;
        h.stood = true;
      }
    }
    lastMsg = dBj
      ? `庄家黑杰克 · 你 ${roundDelta >= 0 ? '+' : ''}${roundDelta}`
      : `天然牌结算 · 你 ${roundDelta >= 0 ? '+' : ''}${roundDelta}`;
    return { ok: true, phase: 'settle' };
  }

  function beginPlayerTurns() {
    // 找第一个需要行动的座位
    activeSeat = -1;
    activeHand = 0;
    for (let i = 0; i < seats.length; i++) {
      const h = seats[i].hands[0];
      if (!h) continue;
      if (isBlackjack(h.cards)) {
        h.done = true;
        h.stood = true;
        continue;
      }
      if (!h.done && !h.stood) {
        activeSeat = i;
        activeHand = 0;
        break;
      }
    }
    if (activeSeat < 0) {
      runDealer();
      return;
    }
    if (seats[activeSeat].isHuman) {
      lastMsg = '轮到你 · 要牌 / 停牌 / 加倍';
    } else {
      lastMsg = `${seats[activeSeat].name} 行动中…`;
    }
  }

  function currentSeat() {
    return seats[activeSeat] || null;
  }

  function currentHand() {
    const s = currentSeat();
    if (!s) return null;
    return s.hands[activeHand] || null;
  }

  function advanceTurn() {
    // 当前座位是否还有未完成手
    const s = currentSeat();
    if (s) {
      for (let i = activeHand + 1; i < s.hands.length; i++) {
        const h = s.hands[i];
        const hv = handValue(h.cards);
        if (!h.done && !h.stood && !hv.bust) {
          activeHand = i;
          if (s.isHuman) lastMsg = `请操作第 ${i + 1} 手`;
          return;
        }
      }
    }
    // 下一座位
    for (let i = activeSeat + 1; i < seats.length; i++) {
      const seat = seats[i];
      for (let j = 0; j < seat.hands.length; j++) {
        const h = seat.hands[j];
        const hv = handValue(h.cards);
        if (isBlackjack(h.cards) && h.cards.length === 2 && !h.fromSplit) {
          h.done = true;
          h.stood = true;
          continue;
        }
        if (!h.done && !h.stood && !hv.bust) {
          activeSeat = i;
          activeHand = j;
          if (seat.isHuman) lastMsg = '轮到你';
          else lastMsg = `${seat.name} 行动中…`;
          return;
        }
      }
    }
    runDealer();
  }

  function offerInsurance(take) {
    if (phase !== 'insurance') return { ok: false, reason: 'no_insurance' };
    const humanHand = seats[0]?.hands[0];
    if (take && humanHand) {
      const cost = Math.floor(humanHand.bet / 2);
      if (cost > chips) return { ok: false, reason: 'no_chips' };
      chips -= cost;
      insuranceBet = cost;
      roundDelta -= cost;
      sessionDelta -= cost;
      lastMsg = `已买保险 ${cost}`;
    } else {
      lastMsg = '已跳过保险';
    }
    return resolveInsurance();
  }

  function resolveInsurance() {
    const dBj = isBlackjack(dealer);
    if (dBj) {
      dealerHoleHidden = false;
      if (insuranceBet > 0) {
        const pay = insuranceBet * 3;
        chips += pay;
        roundDelta += pay;
        sessionDelta += pay;
      }
      return finishNaturalsRound(true);
    }
    // 无 BJ
    const humanBj = isBlackjack(seats[0]?.hands[0]?.cards);
    if (humanBj && seats.every((s) => isBlackjack(s.hands[0]?.cards))) {
      return finishNaturalsRound(false);
    }
    phase = 'player';
    beginPlayerTurns();
    lastMsg = insuranceBet > 0 ? '庄家非 BJ · 保险输掉 · 请行动' : '请要牌、停牌或加倍';
    return { ok: true, phase };
  }

  function hit() {
    if (phase !== 'player') return { ok: false, reason: 'not_player' };
    const s = currentSeat();
    const h = currentHand();
    if (!s?.isHuman || !h || h.stood || h.done) return { ok: false, reason: 'not_your_turn' };
    h.cards.push(draw());
    const hv = handValue(h.cards);
    if (hv.bust) {
      h.done = true;
      h.stood = true;
      h.result = 'bust';
      h.payout = -h.bet;
      lastMsg = `爆牌 ${hv.total}`;
      advanceTurn();
      return { ok: true, bust: true };
    }
    if (hv.total === 21) {
      h.done = true;
      h.stood = true;
      lastMsg = '21 点 · 自动停牌';
      advanceTurn();
      return { ok: true };
    }
    lastMsg = `手牌 ${hv.total} 点`;
    return { ok: true, total: hv.total };
  }

  function stand() {
    if (phase !== 'player') return { ok: false, reason: 'not_player' };
    const s = currentSeat();
    const h = currentHand();
    if (!s?.isHuman || !h || h.stood || h.done) return { ok: false, reason: 'not_your_turn' };
    h.stood = true;
    h.done = true;
    lastMsg = `停牌 ${handValue(h.cards).total} 点`;
    advanceTurn();
    return { ok: true };
  }

  function doubleDown() {
    if (phase !== 'player') return { ok: false, reason: 'not_player' };
    const s = currentSeat();
    const h = currentHand();
    if (!s?.isHuman || !h || h.stood || h.done) return { ok: false, reason: 'not_your_turn' };
    if (h.cards.length !== 2) return { ok: false, reason: 'not_two_cards' };
    if (h.fromSplit && h.cards[0].rank === 14) return { ok: false, reason: 'split_ace' };
    if (chips < h.bet) return { ok: false, reason: 'no_chips' };
    chips -= h.bet;
    roundDelta -= h.bet;
    sessionDelta -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw());
    const hv = handValue(h.cards);
    h.stood = true;
    h.done = true;
    if (hv.bust) {
      h.result = 'bust';
      h.payout = -h.bet;
      lastMsg = `加倍后爆牌 ${hv.total}`;
    } else {
      lastMsg = `加倍 · ${hv.total} 点`;
    }
    advanceTurn();
    return { ok: true };
  }

  function split() {
    if (phase !== 'player') return { ok: false, reason: 'not_player' };
    const s = currentSeat();
    const h = currentHand();
    if (!s?.isHuman || !h) return { ok: false, reason: 'not_your_turn' };
    if (s.hands.length > 1) return { ok: false, reason: 'already_split' };
    if (h.cards.length !== 2 || !isPair(h.cards)) return { ok: false, reason: 'not_pair' };
    if (chips < h.bet) return { ok: false, reason: 'no_chips' };
    chips -= h.bet;
    roundDelta -= h.bet;
    sessionDelta -= h.bet;
    const c1 = h.cards[0];
    const c2 = h.cards[1];
    h.cards = [c1, draw()];
    h.fromSplit = true;
    const h2 = makeHand(h.bet);
    h2.cards = [c2, draw()];
    h2.fromSplit = true;
    s.hands.push(h2);
    activeHand = 0;
    if (c1.rank === 14) {
      s.hands.forEach((x) => { x.stood = true; x.done = true; });
      lastMsg = '分牌 A · 各一张后停牌';
      advanceTurn();
      return { ok: true };
    }
    lastMsg = '已分牌 · 先打第一手';
    return { ok: true };
  }

  /** AI：硬 17+ 停，软 18+ 停，否则要 */
  function playAiHand(seat, hand) {
    let guard = 0;
    while (!hand.done && !hand.stood && guard++ < 12) {
      const hv = handValue(hand.cards);
      if (hv.bust) {
        hand.done = true;
        hand.stood = true;
        hand.result = 'bust';
        hand.payout = -hand.bet;
        break;
      }
      const stop = hv.total >= 17 || (hv.soft && hv.total >= 18);
      if (stop || hv.total === 21) {
        hand.stood = true;
        hand.done = true;
        break;
      }
      hand.cards.push(draw());
    }
    hand.done = true;
    hand.stood = true;
  }

  function runAiIfNeeded() {
    // 连续推进 AI 座位
    let guard = 0;
    while (phase === 'player' && guard++ < 20) {
      const s = currentSeat();
      if (!s) break;
      if (s.isHuman) return; // 等真人
      const h = currentHand();
      if (!h || h.done || h.stood) {
        advanceTurn();
        continue;
      }
      playAiHand(s, h);
      advanceTurn();
    }
  }

  function runDealer() {
    phase = 'dealer';
    dealerHoleHidden = false;
    const anyAlive = seats.some((s) => s.hands.some((h) => !handValue(h.cards).bust));
    if (anyAlive) {
      let hv = handValue(dealer);
      while (hv.total < 17) {
        dealer.push(draw());
        hv = handValue(dealer);
      }
    }
    settleAll();
  }

  function settleOneHand(seat, h, dBj, dVal, forceNatural = false) {
    if (h.result === 'bust') {
      if (h.payout == null) h.payout = -h.bet;
      return;
    }
    const pVal = handValue(h.cards);
    const pBj = isBlackjack(h.cards) && h.cards.length === 2 && !h.fromSplit;

    const credit = (amount) => {
      if (seat.isHuman) {
        chips += amount;
        roundDelta += amount;
        sessionDelta += amount;
      } else {
        seat.aiChips += amount;
      }
    };

    if (pVal.bust) {
      h.result = 'bust';
      h.payout = -h.bet;
      return;
    }
    if (pBj && !dBj) {
      const win = h.bet + Math.floor(h.bet * 1.5);
      credit(win);
      h.result = 'blackjack';
      h.payout = Math.floor(h.bet * 1.5);
      return;
    }
    if (dBj && !pBj) {
      h.result = 'lose';
      h.payout = -h.bet;
      return;
    }
    if (dVal.bust || pVal.total > dVal.total) {
      credit(h.bet * 2);
      h.result = 'win';
      h.payout = h.bet;
    } else if (pVal.total < dVal.total) {
      h.result = 'lose';
      h.payout = -h.bet;
    } else {
      credit(h.bet);
      h.result = 'push';
      h.payout = 0;
    }
  }

  function settleAll() {
    phase = 'settle';
    const dVal = handValue(dealer);
    const dBj = isBlackjack(dealer) && dealer.length === 2;
    for (const s of seats) {
      for (const h of s.hands) {
        if (h.result === 'bust') continue;
        settleOneHand(s, h, dBj, dVal);
        h.done = true;
        h.stood = true;
      }
    }
    const map = { blackjack: '黑杰克', win: '赢', lose: '输', bust: '爆牌', push: '平局' };
    const mine = seats[0]?.hands[0];
    lastMsg = `本局你${map[mine?.result] || '结束'} · 庄家 ${dVal.bust ? '爆' : dVal.total} · 净 ${roundDelta >= 0 ? '+' : ''}${roundDelta}`;
  }

  function nextRound() {
    if (phase !== 'settle' && phase !== 'betting') return { ok: false, reason: 'busy' };
    resetRoundKeepChips();
    return { ok: true };
  }

  function snapshot() {
    const dPublic = dealerHoleHidden
      ? [dealer[0] || null, null]
      : dealer.slice();
    const dVal = dealerHoleHidden
      ? (dealer[0] ? handValue([dealer[0]]) : { total: 0, soft: false, bust: false })
      : handValue(dealer);

    const seatSnaps = seats.map((s, si) => ({
      seat: si,
      name: s.name,
      isHuman: s.isHuman,
      aiChips: s.aiChips,
      hands: s.hands.map((h, hi) => {
        const hv = handValue(h.cards);
        return {
          index: hi,
          cards: h.cards.slice(),
          bet: h.bet,
          total: hv.total,
          soft: hv.soft,
          bust: hv.bust,
          stood: h.stood,
          doubled: h.doubled,
          fromSplit: h.fromSplit,
          done: h.done,
          result: h.result || null,
          payout: h.payout ?? null,
          isBj: isBlackjack(h.cards) && !h.fromSplit && h.cards.length === 2,
          active: phase === 'player' && si === activeSeat && hi === activeHand,
        };
      }),
    }));

    const humanHands = seats[0]?.hands || [];
    const humanActive = phase === 'player' && activeSeat === 0;
    const curH = humanActive ? humanHands[activeHand] : null;

    return {
      phase,
      label,
      playerCount,
      minBet,
      maxBet,
      chips,
      pendingBet,
      insuranceBet,
      canInsure: phase === 'insurance',
      dealer: dPublic,
      dealerFull: dealerHoleHidden ? null : dealer.slice(),
      dealerHoleHidden,
      dealerTotal: dVal.total,
      dealerSoft: dVal.soft,
      dealerBust: dVal.bust,
      seats: seatSnaps,
      activeSeat,
      activeHand,
      // 兼容旧 UI：hands = 真人的手
      hands: humanHands.map((h, i) => {
        const hv = handValue(h.cards);
        return {
          index: i,
          cards: h.cards.slice(),
          bet: h.bet,
          total: hv.total,
          soft: hv.soft,
          bust: hv.bust,
          stood: h.stood,
          doubled: h.doubled,
          fromSplit: h.fromSplit,
          done: h.done,
          result: h.result || null,
          payout: h.payout ?? null,
          isBj: isBlackjack(h.cards) && !h.fromSplit && h.cards.length === 2,
          active: humanActive && i === activeHand,
        };
      }),
      lastMsg,
      roundDelta,
      sessionDelta,
      deltas: [roundDelta, 0],
      winner: roundDelta > 0 ? 0 : roundDelta < 0 ? 1 : -1,
      pot: seats.reduce((sum, s) => sum + s.hands.reduce((a, h) => a + (h.bet || 0), 0), 0) + insuranceBet,
      canHit: !!(curH && !curH.stood && !curH.done),
      canStand: !!(curH && !curH.stood && !curH.done),
      canDouble: !!(curH && curH.cards.length === 2 && !curH.stood && chips >= curH.bet),
      canSplit: !!(humanActive && humanHands.length === 1 && curH && curH.cards.length === 2 && isPair(curH.cards) && chips >= curH.bet),
      isHumanTurn: humanActive,
    };
  }

  // init
  buildSeats(playerCount);
  resetRoundKeepChips();

  return {
    setPlayerCount,
    setBet,
    deal,
    hit,
    stand,
    doubleDown,
    split,
    offerInsurance,
    runAiIfNeeded,
    nextRound,
    snapshot,
    get chips() { return chips; },
    get phase() { return phase; },
    get playerCount() { return playerCount; },
  };
}
