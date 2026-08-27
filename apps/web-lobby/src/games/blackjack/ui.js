/**
 * 二十一点 H5 UI — 2～7 人桌 · 按人数排布座位 · 人人发牌
 */
import { createBlackjackTable, cardText, MIN_PLAYERS, MAX_PLAYERS } from './engine.js';
import { resultPlayerHtml, getResultSeatSrc } from '../../shared/result-avatar.js';
import { brandMgCardBadgeHtml, brandMgCardBackBadgeHtml } from '../../shared/branding.js';
import { playCharAction, playSettleActions, playFromPokerAct } from '../../shared/char-motion.js';

const SEAT_IMGS = [
  './public/characters/m-ea-suit.png?v=male-fix1',
  './public/characters/f-ea-red-qipao.png?v=male-fix1',
  './public/characters/m-ea-casual.png?v=male-fix1',
  './public/characters/f-ea-black-dress.png?v=male-fix1',
  './public/characters/m-ea-cool.png?v=male-fix1',
  './public/characters/f-ea-gold-dress.png?v=male-fix1',
  './public/characters/m-ea-sport.png?v=male-fix1',
];

let _instance = null;

export function createBlackjackUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({
      minBet: 50, maxBet: 2000, chips: 2000, label: '二十一点', playerCount: 4,
    })),
  };

  let table = null;
  let roomLabel = '二十一点';
  let settleReported = false;
  let busy = false;
  let aiTimer = null;
  let chosenPlayers = 4;

  const root = document.getElementById('multiGameView');
  if (!root) throw new Error('multiGameView missing');

  // 注入专属布局层（结构变更时强制重建）
  let bjRoot = root.querySelector('#bjLayout');
  const needRebuild = !bjRoot || !bjRoot.querySelector('#bjSelfRail') || !bjRoot.querySelector('.bj-table-wrap');
  if (needRebuild) {
    bjRoot?.remove();
    bjRoot = document.createElement('div');
    bjRoot.id = 'bjLayout';
    bjRoot.className = 'bj-layout';
    bjRoot.hidden = true;
    bjRoot.innerHTML = `
      <div class="bj-table-wrap">
        <div class="bj-felt" data-bj-count="4">
          <div class="bj-dealer" id="bjDealer">
            <div class="bj-dealer-label">庄家</div>
            <div class="bj-dealer-cards" id="bjDealerCards"></div>
            <div class="bj-dealer-pts" id="bjDealerPts">—</div>
          </div>
          <div class="bj-center-info" id="bjCenterInfo"></div>
          <div class="bj-seats" id="bjSeats" aria-label="对手座位"></div>
        </div>
        <div class="bj-self-rail" id="bjSelfRail" aria-label="我的座位"></div>
      </div>
    `;
    const tableEl = root.querySelector('.mg-table') || root;
    tableEl.appendChild(bjRoot);
  }

  const el = {
    root,
    bjRoot,
    felt: bjRoot.querySelector('.bj-felt'),
    seatsHost: bjRoot.querySelector('#bjSeats'),
    selfRail: bjRoot.querySelector('#bjSelfRail'),
    dealerCards: bjRoot.querySelector('#bjDealerCards'),
    dealerPts: bjRoot.querySelector('#bjDealerPts'),
    centerInfo: bjRoot.querySelector('#bjCenterInfo'),
    back: root.querySelector('#mgBackBtn'),
    title: root.querySelector('#mgTitle'),
    status: root.querySelector('#mgStatus'),
    sub: root.querySelector('#mgSub'),
    hand: root.querySelector('#mgHand'),
    actions: root.querySelector('#mgActions'),
    settleRow: root.querySelector('#mgSettleRow'),
    again: root.querySelector('#mgAgainBtn'),
    lobby: root.querySelector('#mgLobbyBtn'),
    modal: root.querySelector('#mgResultModal'),
    modalTitle: root.querySelector('#mgResultTitle'),
    modalBanner: root.querySelector('#mgResultBanner'),
    modalSub: root.querySelector('#mgResultSub'),
    modalBody: root.querySelector('#mgResultBody'),
    modalYou: root.querySelector('#mgResultYou'),
    modalAgain: root.querySelector('#mgResultAgain'),
    modalLobby: root.querySelector('#mgResultLobby'),
  };

  const exitToLobby = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    stopAi();
    hideResult();
    hide();
    opts.onExit();
  };

  el.back?.addEventListener('click', exitToLobby);
  el.lobby?.addEventListener('click', exitToLobby);
  el.modalLobby?.addEventListener('click', exitToLobby);
  el.again?.addEventListener('click', (e) => {
    e.preventDefault();
    hideResult();
    nextOrStart();
  });
  el.modalAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    hideResult();
    nextOrStart();
  });
  el.modal?.querySelectorAll('[data-mg-result-dismiss]').forEach((n) => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      hideResult();
    });
  });

  function setOptions(next = {}) {
    if (next.onSettle) opts.onSettle = next.onSettle;
    if (next.onExit) opts.onExit = next.onExit;
    if (next.getStake) opts.getStake = next.getStake;
  }

  function stopAi() {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  function show() {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'blackjack';
    root.classList.remove('gd-active', 'mj-4p', 'mj-2p', 'zjh-active');
    root.classList.add('bj-active');
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'multi-active');
    root.style.cssText = 'display:flex;visibility:visible;pointer-events:auto;z-index:200';

    // 彻底隐藏 multi 通用座位/广告，避免叠在 BJ 桌上
    root.querySelectorAll(
      '.mg-row-top, .mg-center, .mg-ad-bar, .table-center-ad, .mg-table-center-ad, .mg-seat, .char-figure-wrap, .costume-chip',
    ).forEach((n) => {
      n.style.setProperty('display', 'none', 'important');
      n.style.setProperty('visibility', 'hidden', 'important');
      n.style.setProperty('pointer-events', 'none', 'important');
    });
    const hero = root.querySelector('.mg-row-hero');
    if (hero) {
      hero.style.setProperty('display', 'flex', 'important');
      hero.style.setProperty('visibility', 'visible', 'important');
      hero.style.setProperty('min-height', '0', 'important');
      hero.style.setProperty('justify-content', 'center', 'important');
    }
    // 底栏手牌区隐藏：牌只在各座位面前显示
    const dock = root.querySelector('.mg-hand-dock');
    if (dock) {
      dock.style.setProperty('display', 'none', 'important');
      dock.style.setProperty('visibility', 'hidden', 'important');
      dock.hidden = true;
    }
    if (el.hand) {
      el.hand.style.display = 'none';
      el.hand.hidden = true;
      el.hand.innerHTML = '';
    }
    bjRoot.hidden = false;
    bjRoot.style.setProperty('display', 'flex', 'important');
    bjRoot.style.setProperty('visibility', 'visible', 'important');
    bjRoot.style.setProperty('flex', '1 1 auto', 'important');
    // 保证 BJ 桌在 multi 层最前
    const tableEl = root.querySelector('.mg-table');
    if (tableEl && bjRoot.parentElement === tableEl) {
      tableEl.appendChild(bjRoot);
    }

    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = 'none';
      stage.style.pointerEvents = 'none';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display = 'none';
  }

  function hide() {
    stopAi();
    hideResult();
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.classList.remove('bj-active');
    delete root.dataset.game;
    root.style.display = 'none';
    bjRoot.hidden = true;
    bjRoot.style.display = 'none';
    root.querySelectorAll(
      '.mg-row-top, .mg-row-hero, .mg-center, .mg-hand-dock, .mg-seat, .mg-ad-bar, .table-center-ad, .mg-table-center-ad, .char-figure-wrap, .costume-chip, .mg-play, .mg-count, .mg-meta',
    ).forEach((n) => {
      n.style.removeProperty('display');
      n.style.removeProperty('visibility');
      n.style.removeProperty('pointer-events');
      n.style.removeProperty('height');
      n.style.removeProperty('min-height');
      n.style.removeProperty('opacity');
      n.style.removeProperty('overflow');
      n.style.removeProperty('justify-content');
    });
    document.querySelector('.lobby-shell')?.classList.remove('table-active', 'multi-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = '';
      stage.style.pointerEvents = 'auto';
      stage.style.visibility = '';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.setProperty('display', 'none', 'important');
  }

  function hideResult() {
    if (el.modal) {
      el.modal.hidden = true;
      el.modal.setAttribute('hidden', '');
    }
  }

  function start() {
    const stake = opts.getStake();
    roomLabel = stake.label || '二十一点';
    chosenPlayers = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(stake.playerCount) || chosenPlayers || 4));
    settleReported = false;
    busy = false;
    stopAi();
    table = createBlackjackTable({
      minBet: stake.minBet || 50,
      maxBet: stake.maxBet || 5000,
      chips: stake.chips || stake.minEntry || 2000,
      label: roomLabel,
      playerCount: chosenPlayers,
      humanName: '我',
    });
    show();
    render();
  }

  function nextOrStart() {
    if (!table) {
      start();
      return;
    }
    if (table.snapshot().phase === 'settle') {
      table.nextRound();
      settleReported = false;
      // 可选：每局随机人数增加变化
      render();
      return;
    }
    start();
  }

  function renderCards(cards, faceUp, compact = false) {
    const faceAd = brandMgCardBadgeHtml();
    const backAd = brandMgCardBackBadgeHtml();
    const list = cards || [];
    if (!list.length) return '<span class="mg-card mg-card-empty">—</span>';
    return list.map((c) => {
      if (!c || !faceUp) {
        return `<span class="mg-card mg-card-face back mg-card-back bj-card${compact ? ' bj-card-sm' : ''}">${backAd}</span>`;
      }
      const t = cardText(c);
      const red = c.isRed ? ' red' : '';
      return (
        `<span class="mg-card mg-card-face${red} bj-card${compact ? ' bj-card-sm' : ''}" title="${t}">`
        + `<span class="mg-card-rank">${t.slice(1) || t}</span>`
        + `<span class="mg-card-suit">${t.slice(0, 1)}</span>`
        + faceAd
        + `</span>`
      );
    }).join('');
  }

  /**
   * 庄家独占顶部；玩家只坐在下半弧（左→底→右）均匀分散，绝不进庄家区
   * 视觉从左到右排布；seat0（我）永远在弧底正中
   * 角度：x 向右、y 向下；90°=底，180°=左，0°=右
   */
  function playerArcStyles(total) {
    const n = Math.max(1, total);
    // 左→右视觉顺序的 seat 编号：左半 AI、我、右半 AI
    const leftN = Math.floor((n - 1) / 2);
    const rightN = n - 1 - leftN;
    const visualSeats = [];
    for (let i = 0; i < leftN; i++) visualSeats.push(i + 1);
    visualSeats.push(0);
    for (let i = 0; i < rightN; i++) visualSeats.push(leftN + 1 + i);

    // 弧：约 200°（左下）→ 90°（底）→ -20°（右下），不进顶部庄家
    const startDeg = 200;
    const endDeg = -20;
    const rx = n >= 7 ? 41 : n >= 5 ? 42 : 43;
    const ry = n >= 7 ? 36 : n >= 5 ? 37 : 38;

    /** @type {Record<number, {left:string,top:string,right:string,bottom:string,transform:string}>} */
    const map = {};
    for (let v = 0; v < n; v++) {
      const seat = visualSeats[v];
      const t = n === 1 ? 0.5 : v / (n - 1);
      const deg = startDeg + t * (endDeg - startDeg);
      const rad = (deg * Math.PI) / 180;
      let x = 50 + rx * Math.cos(rad);
      let y = 50 + ry * Math.sin(rad);
      x = Math.max(8, Math.min(92, x));
      y = Math.max(28, Math.min(88, y)); // 上界 28%：庄家区以下
      map[seat] = {
        left: `${x.toFixed(2)}%`,
        top: `${y.toFixed(2)}%`,
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)',
      };
    }
    return map;
  }

  function seatCardHtml(i) {
    // 上：人物 | 信息；下：手牌（含点数/爆）——互不重叠
    return `
      <div class="bj-seat-inner">
        <div class="bj-seat-head">
          <div class="bj-seat-char">
            <img class="bj-seat-img char-figure-live char-act-idle char-nobg" src="${SEAT_IMGS[i % SEAT_IMGS.length]}" alt="" width="56" height="84" />
          </div>
          <div class="bj-seat-meta" data-bj-meta></div>
        </div>
        <div class="bj-seat-cards-row">
          <div class="bj-seat-cards" data-bj-cards></div>
          <div class="bj-seat-pts" data-bj-pts hidden></div>
        </div>
      </div>
    `;
  }

  function buildSeatsDom(count) {
    if (!el.seatsHost) return;
    el.felt?.setAttribute('data-bj-count', String(count));
    el.seatsHost.innerHTML = '';
    if (el.selfRail) {
      el.selfRail.innerHTML = '';
      el.selfRail.hidden = true;
      el.selfRail.style.display = 'none';
    }

    const styles = playerArcStyles(count);
    for (let i = 0; i < count; i++) {
      const node = document.createElement('div');
      node.className = `bj-seat bj-seat-${i}${i === 0 ? ' bj-seat-self' : ''}`;
      node.dataset.bjSeat = String(i);
      node.innerHTML = seatCardHtml(i);
      const st = styles[i];
      node.style.left = st.left;
      node.style.right = st.right;
      node.style.top = st.top;
      node.style.bottom = st.bottom;
      node.style.transform = st.transform;
      el.seatsHost.appendChild(node);
    }
  }

  function doAct(act, payload) {
    if (!table || busy) return;
    busy = true;
    let r = { ok: false };
    try {
      if (act === 'players') r = table.setPlayerCount(payload);
      else if (act === 'bet') r = table.setBet(payload);
      else if (act === 'deal') r = table.deal();
      else if (act === 'hit') r = table.hit();
      else if (act === 'stand') r = table.stand();
      else if (act === 'double') r = table.doubleDown();
      else if (act === 'split') r = table.split();
      else if (act === 'insure') r = table.offerInsurance(true);
      else if (act === 'noinsure') r = table.offerInsurance(false);
    } catch (err) {
      r = { ok: false, reason: String(err?.message || err) };
    }
    busy = false;
    if (!r.ok && el.status) {
      const map = {
        no_chips: '筹码不足',
        min_bet: '未达最低注',
        not_betting: '当前不可操作',
        not_your_turn: '还没轮到你',
        not_pair: '不能分牌',
        not_two_cards: '仅首两张可加倍',
      };
      el.status.textContent = map[r.reason] || r.reason || '无法操作';
    }
    if (act === 'players' && r.ok) chosenPlayers = r.playerCount || payload;
    // 情景动作（非漂浮）
    try {
      if (act === 'deal' && r.ok) {
        (table.snapshot().seats || []).forEach((_, i) => playCharAction(i, 'deal'));
      } else if (r.ok && ['hit', 'double', 'stand', 'split', 'bet', 'insure', 'noinsure'].includes(act)) {
        playFromPokerAct(0, act === 'double' ? 'allin' : act === 'hit' ? 'play' : act === 'bet' ? 'bet' : act === 'stand' ? 'think' : 'play');
      }
    } catch (_) { /* ignore */ }
    render();
    scheduleAi();
    const snap = table.snapshot();
    if (snap.phase === 'settle') showSettle(snap);
  }

  function scheduleAi() {
    stopAi();
    if (!table) return;
    const snap = table.snapshot();
    if (snap.phase !== 'player' || snap.isHumanTurn) return;
    aiTimer = setTimeout(() => {
      if (!table) return;
      table.runAiIfNeeded();
      render();
      const s2 = table.snapshot();
      if (s2.phase === 'settle') showSettle(s2);
      else if (s2.phase === 'player' && !s2.isHumanTurn) scheduleAi();
    }, 380 + Math.random() * 280);
  }

  function render() {
    if (!table) return;
    const snap = table.snapshot();
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) {
      el.sub.textContent = `${snap.playerCount} 人桌 · 筹 ${snap.chips} · 注 ${snap.minBet}–${snap.maxBet} · BJ 3:2`;
    }
    if (el.status) el.status.textContent = snap.lastMsg || '—';

    // 人数变化时重建座位 DOM（全员椭圆均分）
    const need = snap.playerCount || chosenPlayers;
    const seatDom = el.seatsHost?.children.length || 0;
    if (seatDom !== need) {
      buildSeatsDom(need);
    }
    el.felt?.setAttribute('data-bj-count', String(need));

    // 庄家
    if (el.dealerCards) {
      const dCards = snap.dealerHoleHidden
        ? [snap.dealer[0], null]
        : (snap.dealerFull || snap.dealer);
      el.dealerCards.innerHTML = dCards.map((c, i) => {
        if (!c || (snap.dealerHoleHidden && i === 1)) return renderCards([null], false, true);
        return renderCards([c], true, true);
      }).join('');
    }
    if (el.dealerPts) {
      el.dealerPts.textContent = snap.dealerHoleHidden
        ? (snap.dealer[0] ? `明 ${cardText(snap.dealer[0])}` : '庄家')
        : (snap.dealerBust ? '爆牌' : `${snap.dealerTotal} 点`);
    }

    // 各座位
    (snap.seats || []).forEach((s, i) => {
      const node = bjRoot.querySelector(`[data-bj-seat="${i}"]`);
      if (!node) return;
      node.classList.toggle('is-turn', s.hands.some((h) => h.active));
      node.classList.toggle('is-human', s.isHuman);
      const meta = node.querySelector('[data-bj-meta]');
      const cardsEl = node.querySelector('[data-bj-cards]');
      const ptsEl = node.querySelector('[data-bj-pts]');
      const main = s.hands[0];
      const betSum = s.hands.reduce((a, h) => a + (h.bet || 0), 0);
      if (meta) {
        const name = s.isHuman ? '我' : (s.name || `茶友${i}`);
        meta.innerHTML = `<strong>${name}</strong>`
          + `<span>${main ? `注 ${betSum}` : '等待'}${s.isHuman ? ` · 筹 ${snap.chips}` : ''}</span>`;
      }
      if (cardsEl) {
        if (!s.hands.length) {
          cardsEl.innerHTML = '<span class="bj-waiting">待发牌</span>';
        } else {
          // 牌只在座位前显示（不再底栏重复）；点数/爆贴在牌组右侧
          const big = true; // 座位牌加大
          cardsEl.innerHTML = s.hands.map((h) => {
            const faceAll = s.isHuman || snap.phase === 'settle' || h.bust || h.stood;
            return `<div class="bj-mini-hand${h.active ? ' is-active' : ''}${h.bust ? ' is-bust' : ''}">${
              h.cards.map((c, idx) => {
                const show = faceAll || idx === 0;
                return renderCards([show ? c : null], show, !big);
              }).join('')
            }</div>`;
          }).join('');
        }
      }
      if (ptsEl) {
        if (!main) {
          ptsEl.hidden = true;
          ptsEl.textContent = '';
        } else {
          ptsEl.hidden = false;
          let txt = '';
          if (s.hands.length === 1) {
            txt = main.bust ? '爆' : `${main.total}${main.isBj ? ' BJ' : ''}`;
          } else {
            txt = s.hands.map((h) => (h.bust ? '爆' : h.total)).join('/');
          }
          if (main?.result && snap.phase === 'settle') {
            const map = { blackjack: 'BJ', win: '赢', lose: '输', bust: '爆', push: '平' };
            txt = map[main.result] || txt;
          }
          ptsEl.textContent = txt;
          ptsEl.classList.toggle('is-bust', !!main.bust || main?.result === 'bust');
          ptsEl.classList.toggle('is-win', main?.result === 'win' || main?.result === 'blackjack');
        }
      }
    });

    // 中央提示
    if (el.centerInfo) {
      if (snap.phase === 'betting') {
        el.centerInfo.innerHTML = `<div class="bj-pot-chip">${snap.playerCount} 人桌<br/><b>注 ${snap.pendingBet}</b></div>`;
      } else {
        el.centerInfo.innerHTML = `<div class="bj-pot-chip">桌注 ${snap.pot}<br/><small>${snap.lastMsg || ''}</small></div>`;
      }
    }

    // 底栏手牌：不再单独展示，牌只在座位上
    if (el.hand) {
      el.hand.innerHTML = '';
      el.hand.hidden = true;
      el.hand.style.display = 'none';
    }
    const dock = root.querySelector('.mg-hand-dock');
    if (dock) {
      dock.style.setProperty('display', 'none', 'important');
      dock.hidden = true;
    }

    // 操作
    if (el.actions) {
      el.actions.style.pointerEvents = 'auto';
      el.actions.style.zIndex = '220';
      if (snap.phase === 'settle') {
        el.actions.hidden = true;
        el.actions.innerHTML = '';
        if (el.settleRow) el.settleRow.hidden = false;
      } else if (snap.phase === 'betting') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const pBtns = [];
        for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
          pBtns.push(
            `<button type="button" class="qq-btn qq-btn-blue${n === snap.playerCount ? ' is-on' : ''}" data-bj-act="players" data-n="${n}">${n}人</button>`,
          );
        }
        const bets = uniqueBets(snap.minBet, snap.maxBet, snap.chips);
        el.actions.innerHTML =
          `<div class="bj-act-row"><span class="bj-act-label">人数</span>${pBtns.join('')}</div>`
          + `<div class="bj-act-row"><span class="bj-act-label">注码</span>${
            bets.map((b) => (
              `<button type="button" class="qq-btn qq-btn-blue${b === snap.pendingBet ? ' is-on' : ''}" data-bj-act="bet" data-bet="${b}">${b}</button>`
            )).join('')
          }</div>`
          + `<button type="button" class="qq-btn qq-btn-gold" data-bj-act="deal" ${snap.chips < snap.minBet ? 'disabled' : ''}>发牌（${snap.playerCount}人）</button>`;
        bindActs();
      } else if (snap.phase === 'insurance') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const cost = Math.floor((snap.hands[0]?.bet || 0) / 2);
        el.actions.innerHTML =
          `<button type="button" class="qq-btn qq-btn-gold" data-bj-act="insure">买保险 ${cost}</button>`
          + `<button type="button" class="qq-btn qq-btn-blue" data-bj-act="noinsure">不买</button>`;
        bindActs();
      } else if (snap.phase === 'player' && snap.isHumanTurn) {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        el.actions.innerHTML =
          `<button type="button" class="qq-btn qq-btn-gold" data-bj-act="hit" ${snap.canHit ? '' : 'disabled'}>要牌</button>`
          + `<button type="button" class="qq-btn qq-btn-blue" data-bj-act="stand" ${snap.canStand ? '' : 'disabled'}>停牌</button>`
          + `<button type="button" class="qq-btn qq-btn-gold" data-bj-act="double" ${snap.canDouble ? '' : 'disabled'}>加倍</button>`
          + `<button type="button" class="qq-btn qq-btn-blue" data-bj-act="split" ${snap.canSplit ? '' : 'disabled'}>分牌</button>`;
        bindActs();
      } else {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const who = snap.seats?.[snap.activeSeat]?.name || '他人';
        el.actions.innerHTML = `<span class="mg-last-label">${who} 行动中…</span>`;
      }
    }
  }

  function uniqueBets(minB, maxB, chips) {
    const base = [minB, minB * 2, minB * 5, minB * 10, minB * 20];
    const out = [];
    for (const b of base) {
      if (b >= minB && b <= maxB && b <= chips && !out.includes(b)) out.push(b);
    }
    if (!out.length) out.push(Math.min(minB, Math.max(1, chips)));
    return out.slice(0, 5);
  }

  function bindActs() {
    el.actions.querySelectorAll('[data-bj-act]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.disabled) return;
        const act = btn.getAttribute('data-bj-act');
        if (act === 'players') doAct('players', Number(btn.getAttribute('data-n')));
        else if (act === 'bet') doAct('bet', Number(btn.getAttribute('data-bet')));
        else doAct(act);
      });
    });
  }

  function showSettle(snap) {
    if (settleReported) {
      render();
      return;
    }
    settleReported = true;
    if (el.settleRow) el.settleRow.hidden = false;
    if (el.actions) el.actions.hidden = true;

    const delta = snap.roundDelta || 0;
    opts.onSettle({
      deltas: [delta, -delta],
      winner: snap.winner,
      roomLabel,
      game: 'blackjack',
    });
    try {
      const seatDeltas = (snap.seats || []).map((s) => s.hands?.[0]?.payout ?? 0);
      if (seatDeltas.length) playSettleActions(seatDeltas);
      else playCharAction(0, delta > 0 ? 'win' : delta < 0 ? 'lose' : 'idle');
    } catch (_) { /* ignore */ }

    if (el.modal) {
      el.modal.hidden = false;
      el.modal.removeAttribute('hidden');
    }
    if (el.modalBanner) {
      el.modalBanner.classList.remove('is-win', 'is-lose', 'is-draw');
      el.modalBanner.classList.add(delta > 0 ? 'is-win' : delta < 0 ? 'is-lose' : 'is-draw');
    }
    if (el.modalTitle) {
      el.modalTitle.textContent = delta > 0 ? '胜利' : delta < 0 ? '失败' : '平局';
    }
    if (el.modalSub) {
      el.modalSub.textContent =
        `${snap.playerCount} 人桌 · 庄家 ${snap.dealerBust ? '爆牌' : snap.dealerTotal + ' 点'} · 净 ${delta >= 0 ? '+' : ''}${delta}`;
    }
    const resMap = { blackjack: '黑杰克', win: '赢', lose: '输', bust: '爆牌', push: '平局' };
    if (el.modalBody) {
      el.modalBody.innerHTML = (snap.seats || []).map((s, idx) => {
        const h = s.hands[0];
        const d = h?.payout ?? 0;
        const cards = (h?.cards || []).map(cardText).join(' ');
        const totalTxt = h?.bust ? '爆牌' : (h?.total != null ? `${h.total}点` : '—');
        const resTxt = resMap[h?.result] || totalTxt;
        const status = cards ? `${resTxt} · ${cards}` : resTxt;
        const cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
        const isMe = !!s.isHuman || s.seat === 0 || idx === 0;
        const name = isMe ? (s.name || '我') : (s.name || `茶友${s.seat || idx}`);
        return (
          `<tr class="${cls}">`
          + `<td>${resultPlayerHtml({
            seat: s.seat ?? idx,
            name,
            isMe,
            src: isMe ? getResultSeatSrc(0) : getResultSeatSrc((s.seat ?? idx) || (idx + 1)),
          })}</td>`
          + `<td class="tx-result-status">${status}</td>`
          + `<td class="tx-result-delta">${d > 0 ? '+' : ''}${d}</td>`
          + `</tr>`
        );
      }).join('')
      + `<tr class="tx-result-dealer">`
      + `<td>${resultPlayerHtml({ seat: 1, name: '庄家', badge: '庄' })}</td>`
      + `<td class="tx-result-status">${snap.dealerBust ? '爆牌' : `${snap.dealerTotal}点`}`
      + ` · ${(snap.dealerFull || []).map(cardText).join(' ')}</td>`
      + `<td class="tx-result-delta">—</td></tr>`;
    }
    if (el.modalYou) {
      el.modalYou.textContent = `你本局 ${delta >= 0 ? '+' : ''}${delta} · 剩余筹码 ${snap.chips}`;
    }
    render();
  }

  _instance = { start, hide, show, setOptions, nextOrStart };
  return _instance;
}
