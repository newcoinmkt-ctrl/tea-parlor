/**
 * 牛牛 UI — 6 座看牌抢庄 · #multiGameView
 * 匹配中 ≤3s AI 补位；抢庄倍数 / 下注 / 牛型章 / 飘分
 */
import {
  createNiuniuTable,
  cardText,
  niuStampSrc,
  niuName,
  MATCH_MS,
  PHASE,
  QIANG_OPTIONS,
  XIA_OPTIONS,
} from './engine.js';
import { decideWithNiu } from './ai.js';
import { resultPlayerHtml, getResultSeatSrc } from '../../shared/result-avatar.js';
import { brandMgCardBadgeHtml, brandMgCardBackBadgeHtml } from '../../shared/branding.js';

const SEAT_IMGS = [
  './public/characters/m-ea-suit.png?v=play9nn1b',
  './public/characters/f-ea-red-qipao.png?v=play9nn1b',
  './public/characters/m-ea-casual.png?v=play9nn1b',
  './public/characters/f-ea-black-dress.png?v=play9nn1b',
  './public/characters/m-ea-cool.png?v=play9nn1b',
  './public/characters/f-ea-gold-dress.png?v=play9nn1b',
];

/* Uniform 110x50 ovals so 5-up row sizes evenly on 414 */
const BEI_SRC = {
  0: './public/assets/niuniu/beishu/buqiang.png?v=play9nn1b',
  1: './public/assets/niuniu/beishu/bei1.png?v=play9nn1b',
  2: './public/assets/niuniu/beishu/bei2.png?v=play9nn1b',
  3: './public/assets/niuniu/beishu/bei3.png?v=play9nn1b',
  4: './public/assets/niuniu/beishu/bei4.png?v=play9nn1b',
};

let _instance = null;

export function createNiuniuUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({ difen: 5, chips: 2000, label: '牛牛' })),
  };

  let table = null;
  let roomLabel = '牛牛';
  let settleReported = false;
  let busy = false;
  let aiTimer = null;
  let phaseTimer = null;
  let matchTimer = null;
  let floatTimer = null;

  const root = document.getElementById('multiGameView');
  if (!root) throw new Error('multiGameView missing');

  let nnRoot = root.querySelector('#nnLayout');
  const needRebuild = !nnRoot || !nnRoot.querySelector('#nnHand') || !nnRoot.querySelector('#nnActions');
  if (needRebuild) {
    nnRoot?.remove();
    nnRoot = document.createElement('div');
    nnRoot.id = 'nnLayout';
    nnRoot.className = 'nn-layout';
    nnRoot.hidden = true;
    nnRoot.innerHTML = `
      <div class="nn-match" id="nnMatch" hidden>
        <div class="nn-match-card">
          <div class="nn-match-dot"></div>
          <h2>匹配中</h2>
          <p>匹配中…</p>
        </div>
      </div>
      <div class="nn-table-wrap">
        <div class="nn-felt" id="nnFelt">
          <div class="nn-center" id="nnCenter"></div>
          <div class="nn-floats" id="nnFloats" aria-hidden="true"></div>
          <div class="nn-seats" id="nnSeats"></div>
        </div>
        <div class="nn-self" id="nnSelf"></div>
        <div class="nn-dock">
          <div id="nnHand" class="nn-hand" aria-label="我的手牌"></div>
          <div id="nnActions" class="nn-actions" aria-label="操作"></div>
        </div>
      </div>
    `;
    const tableEl = root.querySelector('.mg-table') || root;
    tableEl.appendChild(nnRoot);
  }

  const el = {
    root,
    nnRoot,
    match: nnRoot.querySelector('#nnMatch'),
    felt: nnRoot.querySelector('#nnFelt'),
    center: nnRoot.querySelector('#nnCenter'),
    floats: nnRoot.querySelector('#nnFloats'),
    seatsHost: nnRoot.querySelector('#nnSeats'),
    self: nnRoot.querySelector('#nnSelf'),
    back: root.querySelector('#mgBackBtn'),
    title: root.querySelector('#mgTitle'),
    status: root.querySelector('#mgStatus'),
    sub: root.querySelector('#mgSub'),
    hand: nnRoot.querySelector('#nnHand') || root.querySelector('#mgHand'),
    actions: nnRoot.querySelector('#nnActions') || root.querySelector('#mgActions'),
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
    stopAll();
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
    start();
  });
  el.modalAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    hideResult();
    start();
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

  function stopAll() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    if (matchTimer) { clearTimeout(matchTimer); matchTimer = null; }
    if (floatTimer) { clearTimeout(floatTimer); floatTimer = null; }
  }

  function showMatch(on) {
    if (!el.match) return;
    el.match.hidden = !on;
    if (on) {
      el.match.removeAttribute('hidden');
      el.match.style.display = '';
      el.match.style.pointerEvents = 'auto';
      el.match.style.zIndex = '260';
    } else {
      el.match.setAttribute('hidden', '');
      el.match.style.display = 'none';
      el.match.style.pointerEvents = 'none';
      el.match.style.zIndex = '-1';
    }
  }

  function show() {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'niuniu';
    root.classList.remove('gd-active', 'mj-4p', 'mj-2p', 'zjh-active', 'bj-active');
    root.classList.add('nn-active');
    const shell = document.querySelector('.lobby-shell');
    // play9nn1b: multi-only — table-active pulls DDZ landscape grid/HUD rules onto nn
    shell?.classList.add('multi-active');
    shell?.classList.remove('table-active', 'texas-active');
    root.style.pointerEvents = 'auto';
    root.style.display = 'flex';
    root.style.visibility = 'visible';
    root.style.zIndex = '200';
    nnRoot.hidden = false;
    nnRoot.style.display = 'flex';
    const bj = root.querySelector('#bjLayout');
    if (bj) { bj.hidden = true; bj.style.display = 'none'; }
    root.querySelectorAll(
      '.mg-row-top, .mg-row-hero, .mg-center, .mj-felt, .mj-room-bg, .mj-compass, .mj-jj-topbar, .mj-watermark, .mj-jj-chat, .mg-ad-bar, .table-center-ad, .mg-table-center-ad',
    ).forEach((n) => {
      n.style.setProperty('display', 'none', 'important');
    });
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = 'none';
      stage.style.visibility = 'hidden';
      stage.style.pointerEvents = 'none';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display = 'none';
    try { window.dispatchEvent(new Event('table-orient')); } catch (_) { /* ignore */ }
  }

  function hide() {
    stopAll();
    hideResult();
    showMatch(false);
    if (el.actions) { el.actions.hidden = true; el.actions.innerHTML = ''; }
    if (el.hand) el.hand.innerHTML = '';
    if (el.settleRow) { el.settleRow.hidden = true; el.settleRow.setAttribute('hidden', ''); }
    nnRoot.hidden = true;
    nnRoot.style.display = 'none';
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.classList.remove('nn-active', 'zjh-active', 'bj-active', 'gd-active', 'mj-4p', 'mj-2p');
    delete root.dataset.game;
    root.style.zIndex = '';
    root.style.pointerEvents = 'none';
    root.style.display = 'none';
    root.querySelectorAll(
      '.mg-row-top, .mg-row-hero, .mg-center, .mj-felt, .mj-room-bg, .mj-compass, .mj-jj-topbar, .mj-watermark, .mj-jj-chat, .mg-ad-bar, .table-center-ad, .mg-table-center-ad',
    ).forEach((n) => {
      n.style.removeProperty('display');
    });
    document.querySelector('.lobby-shell')?.classList.remove('table-active', 'multi-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.pointerEvents = 'auto';
      stage.style.display = '';
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
    roomLabel = stake.label || '牛牛';
    settleReported = false;
    busy = false;
    stopAll();
    table = null;
    show();
    showMatch(true);
    if (el.title) el.title.textContent = roomLabel;
    if (el.status) el.status.textContent = '匹配中';
    if (el.sub) el.sub.textContent = `底分 ${stake.difen || 5}`;
    if (el.actions) { el.actions.hidden = true; el.actions.innerHTML = ''; }
    const wait = Math.min(MATCH_MS, 700 + Math.floor(Math.random() * 1100));
    matchTimer = setTimeout(() => {
      showMatch(false);
      table = createNiuniuTable({
        difen: stake.difen || 5,
        chips: stake.chips || stake.minEntry || 2000,
        label: roomLabel,
        humanName: '茶馆',
      });
      table.deal();
      render();
      armPhaseTimer();
      scheduleAi();
    }, wait);
  }

  function armPhaseTimer() {
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    if (!table) return;
    const s = table.snapshot(0);
    const sec = s.timers || {};
    let ms = 0;
    let fn = null;
    if (s.phase === PHASE.qiangzhuang) {
      ms = (sec.qiangzhuang || 6) * 1000;
      fn = () => { table.timeoutQiang(); afterAdvance(); };
    } else if (s.phase === PHASE.dingzhuang) {
      ms = (sec.dingzhuang || 5) * 1000;
      fn = () => { table.finishDingzhuang(); afterAdvance(); };
    } else if (s.phase === PHASE.xiazhu) {
      ms = (sec.xiazhu || 7) * 1000;
      fn = () => { table.timeoutXia(); afterAdvance(); };
    } else if (s.phase === PHASE.cuopai) {
      ms = (sec.cuopai || 10) * 1000;
      fn = () => { table.timeoutLiang(); afterAdvance(); };
    }
    if (fn && ms) phaseTimer = setTimeout(fn, ms);
  }

  function afterAdvance() {
    render();
    if (table?.snapshot(0).phase === PHASE.settle) {
      showSettle(table.snapshot(0));
      return;
    }
    armPhaseTimer();
    scheduleAi();
  }

  function doHuman(act, value) {
    if (!table || busy) return;
    const snap = table.snapshot(0);
    busy = true;
    let r = { ok: false };
    try {
      if (act === 'qiang') r = table.qiangzhuang(0, value);
      else if (act === 'xia') r = table.xiazhu(0, value);
      else if (act === 'kan') r = table.kanpai(0);
      else if (act === 'liang') r = table.liangpai(0);
    } catch (err) {
      r = { ok: false, reason: String(err?.message || err) };
    }
    busy = false;
    if (!r.ok) {
      render();
      return;
    }
    afterAdvance();
  }

  function runAiSeat(seat) {
    const snap = table.snapshot(0);
    const dec = decideWithNiu(snap, seat);
    if (dec.action === 'qiang') return table.qiangzhuang(seat, dec.value);
    if (dec.action === 'xia') return table.xiazhu(seat, dec.value);
    if (dec.action === 'liang') return table.liangpai(seat);
    if (dec.action === 'kan') return table.kanpai(seat);
    return { ok: true };
  }

  function scheduleAi() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (!table) return;
    const snap = table.snapshot(0);
    if (snap.phase === PHASE.settle) {
      showSettle(snap);
      return;
    }
    // play9nn1b: cuopai — keep AI closed until human 开牌/搓 or timeout; avoids
    // "everyone already stamped but I still have 搓/开" dead feel.
    const delay = snap.phase === PHASE.cuopai
      ? (1200 + Math.random() * 900)
      : (380 + Math.random() * 420);
    aiTimer = setTimeout(() => {
      if (!table) return;
      let s = table.snapshot(0);
      let guard = 0;
      let changed = false;
      while (guard++ < 12) {
        if (s.phase === PHASE.settle) break;
        if (s.phase === PHASE.dingzhuang) {
          table.finishDingzhuang();
          changed = true;
          s = table.snapshot(0);
          continue;
        }
        let acted = false;
        const me = s.seats[0];
        const humanOpened = !!(me && (me.hasLiang || me.hasKan));
        for (let i = 1; i < 6; i++) {
          const seat = s.seats[i];
          if (!seat) continue;
          if (s.phase === PHASE.qiangzhuang && !seat.hasQiang) {
            runAiSeat(i);
            acted = true;
          } else if (s.phase === PHASE.xiazhu && i !== s.button && !seat.hasXia) {
            runAiSeat(i);
            acted = true;
          } else if (s.phase === PHASE.cuopai && !seat.hasLiang && humanOpened) {
            // Only flip AI after human has 搓/开 — otherwise wait for phase timer
            runAiSeat(i);
            acted = true;
          }
        }
        s = table.snapshot(0);
        if (!acted) break;
        changed = true;
      }
      if (changed) {
        render();
        if (table.snapshot(0).phase === PHASE.settle) {
          showSettle(table.snapshot(0));
          return;
        }
        armPhaseTimer();
        // Keep draining AI cuopai after human opened
        if (table.snapshot(0).phase === PHASE.cuopai) scheduleAi();
      }
      render();
    }, delay);
  }

  function renderCards(cards, faceUp) {
    const faceAd = brandMgCardBadgeHtml();
    const backAd = brandMgCardBackBadgeHtml();
    const list = cards || [];
    if (!list.length) return '';
    return list.map((c) => {
      if (!c || !faceUp) {
        return `<span class="mg-card mg-card-face back mg-card-back nn-card">${backAd}</span>`;
      }
      const t = cardText(c);
      const red = c.isRed ? ' red' : '';
      return (
        `<span class="mg-card mg-card-face${red} nn-card" title="${t}">`
        + `<span class="mg-card-rank">${t.slice(1) || t}</span>`
        + `<span class="mg-card-suit">${t.slice(0, 1)}</span>`
        + faceAd
        + `</span>`
      );
    }).join('');
  }

  function stampHtml(niu, small) {
    if (niu == null) return '';
    const src = niuStampSrc(niu);
    return `<img class="nn-stamp${small ? ' is-sm' : ''}" src="${src}" alt="${niuName(niu)}" />`;
  }

  function seatPos(i) {
    // 6-seat oval: 1 left-low, 2 left, 3 top, 4 right, 5 right-low. 0 is self rail.
    const map = {
      1: { left: '4%', top: '58%' },
      2: { left: '6%', top: '22%' },
      3: { left: '50%', top: '4%', transform: 'translateX(-50%)' },
      4: { right: '6%', top: '22%' },
      5: { right: '4%', top: '58%' },
    };
    return map[i] || { left: '50%', top: '50%' };
  }

  function render() {
    if (!table) return;
    const snap = table.snapshot(0);
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) {
      el.sub.textContent = `底分 ${snap.difen} · 看牌抢庄`;
    }
    if (el.status) {
      const phaseHint = {
        qiangzhuang: '抢庄',
        dingzhuang: '定庄',
        xiazhu: '下注',
        cuopai: '搓牌 / 开牌',
        bipai: '比牌',
        settle: '结算',
      }[snap.phase] || snap.phase;
      el.status.textContent = `${phaseHint} · ${snap.lastAction || ''}`.replace(/\s·\s*$/, '');
    }

    const banker = snap.button >= 0 ? snap.seats[snap.button] : null;
    if (el.center) {
      el.center.innerHTML =
        `<div class="nn-pot-card">`
        + `<div class="nn-pot-label">底分 ${snap.difen}</div>`
        + (banker ? `<div class="nn-banker-tag">庄 ${banker.name} ×${banker.score1 || 1}</div>` : '<div class="nn-banker-tag">抢庄中</div>')
        + `<div class="nn-pot-action">${snap.lastAction || '—'}</div>`
        + `</div>`;
    }

    if (el.seatsHost) {
      el.seatsHost.innerHTML = snap.seats.slice(1).map((sd) => {
        const pos = seatPos(sd.seat);
        const style = Object.entries(pos).map(([k, v]) => `${k}:${v}`).join(';');
        const face = sd.hasLiang || snap.phase === PHASE.settle;
        const img = SEAT_IMGS[sd.seat % SEAT_IMGS.length];
        const qiang = sd.hasQiang ? (sd.score1 === 0 ? '不抢' : `抢×${sd.score1}`) : '';
        const xia = sd.hasXia ? `注×${sd.score2}` : '';
        return (
          `<div class="nn-seat${sd.isBanker ? ' is-banker' : ''}${sd.hasLiang ? ' is-open' : ''}" data-nn-seat="${sd.seat}" style="${style}">`
          + `<img class="nn-ava" src="${img}" alt="${sd.name}" />`
          + `<div class="nn-seat-meta"><strong>${sd.name}</strong>`
          + `<span>${qiang}${xia ? ' · ' + xia : ''} · ${sd.chips}</span></div>`
          + `<div class="nn-seat-cards">${renderCards(sd.holds, face)}</div>`
          + (sd.niu != null ? stampHtml(sd.niu, true) : '')
          + (sd.isBanker ? '<i class="nn-zhuang">庄</i>' : '')
          + `</div>`
        );
      }).join('');
    }

    const me = snap.seats[0];
    const myFace = me.hasKan || me.hasLiang || snap.phase === PHASE.cuopai || snap.phase === PHASE.settle
      || snap.phase === PHASE.qiangzhuang || snap.phase === PHASE.xiazhu || snap.phase === PHASE.dingzhuang;
    if (el.hand) {
      el.hand.hidden = false;
      el.hand.style.display = 'flex';
      el.hand.innerHTML = renderCards(me.holds, true);
      if (me.niu != null && (me.hasLiang || me.hasKan || snap.phase === PHASE.settle)) {
        el.hand.insertAdjacentHTML('beforeend', stampHtml(me.niu, false));
      }
    }
    if (el.self) {
      el.self.innerHTML =
        `<div class="nn-self-meta${me.isBanker ? ' is-banker' : ''}">`
        + `<strong>我</strong>`
        + `<span>筹 ${me.chips}${me.isBanker ? ' · 庄' : ''}`
        + `${me.hasQiang ? ` · 抢×${me.score1}` : ''}`
        + `${me.hasXia ? ` · 注×${me.score2}` : ''}</span>`
        + `</div>`;
    }

    renderActions(snap);
  }

  function renderActions(snap) {
    if (!el.actions) return;
    el.actions.style.pointerEvents = 'auto';
    el.actions.style.zIndex = '220';
    const me = snap.seats[0];
    if (snap.phase === PHASE.settle) {
      el.actions.hidden = true;
      el.actions.innerHTML = '';
      if (el.settleRow) {
        el.settleRow.hidden = false;
        el.settleRow.style.pointerEvents = 'auto';
      }
      return;
    }
    if (el.settleRow) el.settleRow.hidden = true;
    el.actions.hidden = false;

    if (snap.phase === PHASE.qiangzhuang && !me.hasQiang) {
      el.actions.innerHTML = QIANG_OPTIONS.map((v) => {
        const label = v === 0 ? '不抢' : `${v}倍`;
        const img = BEI_SRC[v] ? `<img src="${BEI_SRC[v]}" alt="" />` : '';
        return `<button type="button" class="qq-btn qq-btn-gold nn-bei" data-nn-act="qiang" data-v="${v}" aria-label="${label}">${img}<span class="nn-bei-label">${label}</span></button>`;
      }).join('');
    } else if (snap.phase === PHASE.xiazhu && snap.button !== 0 && !me.hasXia) {
      el.actions.innerHTML = XIA_OPTIONS.map((v) => (
        `<button type="button" class="qq-btn qq-btn-gold nn-bei" data-nn-act="xia" data-v="${v}" aria-label="${v}倍"><span class="nn-bei-label">${v}倍</span></button>`
      )).join('');
    } else if (snap.phase === PHASE.cuopai && !me.hasLiang) {
      el.actions.innerHTML =
        `<button type="button" class="qq-btn qq-btn-blue" data-nn-act="kan">搓牌</button>`
        + `<button type="button" class="qq-btn qq-btn-gold" data-nn-act="liang">开牌</button>`;
    } else if (snap.phase === PHASE.dingzhuang) {
      el.actions.innerHTML = '<span class="mg-last-label">定庄中…</span>';
    } else {
      el.actions.innerHTML = `<span class="mg-last-label">${snap.lastAction || '等待…'}</span>`;
    }
    el.actions.querySelectorAll('[data-nn-act]').forEach((btn) => {
      const fire = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const now = Date.now();
        if (now - (btn._nnLast || 0) < 450) return; // pointerup+click debounce
        btn._nnLast = now;
        doHuman(btn.getAttribute('data-nn-act'), Number(btn.getAttribute('data-v')));
      };
      // play9nn1b: pointerup for TG Mini App (compat mouse/click often dropped)
      btn.addEventListener('pointerup', fire, { passive: false });
      btn.addEventListener('click', fire);
    });
  }

  function spawnFloats(snap) {
    if (!el.floats) return;
    el.floats.innerHTML = snap.seats.map((sd) => {
      const d = sd.score || 0;
      if (!d) return '';
      const pos = sd.seat === 0 ? { left: '50%', bottom: '8%' } : seatPos(sd.seat);
      const style = Object.entries({ ...pos, transform: pos.transform || 'translateX(-50%)' })
        .map(([k, v]) => `${k}:${v}`).join(';');
      const cls = d > 0 ? 'win' : 'lose';
      const txt = d > 0 ? `+${d}` : `${d}`;
      return `<span class="nn-float ${cls}" style="${style}">${txt}</span>`;
    }).join('');
    if (floatTimer) clearTimeout(floatTimer);
    floatTimer = setTimeout(() => { if (el.floats) el.floats.innerHTML = ''; }, 2400);
  }

  function showSettle(snap) {
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    spawnFloats(snap);
    if (el.settleRow) {
      el.settleRow.hidden = false;
      el.settleRow.style.pointerEvents = 'auto';
    }
    if (el.actions) el.actions.hidden = true;
    const deltas = snap.deltas || snap.seats.map((s) => s.score);
    if (el.modalBody) {
      el.modalBody.innerHTML = snap.seats.map((sd, i) => {
        const d = deltas[i] || 0;
        const cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
        const player = resultPlayerHtml({
          seat: i,
          name: sd.name,
          isMe: i === 0,
          src: getResultSeatSrc(i),
          badge: sd.isBanker ? '庄' : (sd.niuName || ''),
        });
        const cards = (sd.rawHolds || sd.holds || []).filter(Boolean).map(cardText).join(' ');
        return `<tr class="${cls}${i === 0 ? ' is-me' : ''}">`
          + `<td>${player}</td>`
          + `<td class="zjh-settle-hand"><div class="zjh-type">${sd.niuName || '—'}</div>`
          + `<div class="zjh-cards-text">${cards}</div></td>`
          + `<td>${d > 0 ? '+' : ''}${d}</td></tr>`;
      }).join('');
    }
    const you = deltas[0] || 0;
    if (el.modalTitle) el.modalTitle.textContent = you > 0 ? '胜利！' : you < 0 ? '本局结束' : '打平';
    if (el.modalBanner) el.modalBanner.className = `tx-result-banner ${you > 0 ? 'win' : 'lose'}`;
    if (el.modalSub) {
      const banker = snap.seats[snap.button];
      el.modalSub.textContent = `庄 ${banker?.name || '—'} · 底分 ${snap.difen} · 影子金币`;
    }
    if (el.modalYou) el.modalYou.textContent = you >= 0 ? `你本局 +${you}` : `你本局 ${you}`;
    if (el.modal) {
      el.modal.hidden = false;
      el.modal.removeAttribute('hidden');
      el.modal.style.pointerEvents = 'auto';
      el.modal.style.zIndex = '300';
    }
    if (!settleReported) {
      settleReported = true;
      const winner = deltas[0] > 0 ? 0 : (deltas.reduce((best, d, i) => (d > (deltas[best] || 0) ? i : best), 0));
      opts.onSettle({ deltas, winner, roomLabel });
    }
  }

  _instance = { start, hide, show, setOptions };
  return _instance;
}
