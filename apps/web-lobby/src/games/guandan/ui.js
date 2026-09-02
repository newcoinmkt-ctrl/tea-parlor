/**
 * 掼蛋 UI — 绿毡桌 · 重叠手牌 · 桌面结算
 */
import { createGuanDanTable, cardText, Phase, isWild } from './engine.js';
import { fitAllHands } from '../../net/hand-layout.js';
import { stripGuandanChrome } from '../../net/strip-gd-chrome.js';

let _instance = null;

export function createGuanDanUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({ stake: 100, label: '掼蛋', currency: 'ingot' })),
  };

  let table = null;
  let career = null;
  let aiTimer = null;
  let turnTimer = null;
  let turnLeft = 15;
  let roomLabel = '掼蛋';
  let selected = new Set();
  let settleReported = false;
  let prevFinish = null;
  let suitFilter = null;
  let arrangeMode = 'auto';
  let rawOrder = [];

  const root = document.getElementById('multiGameView');
  if (!root) throw new Error('multiGameView missing');

  const el = {
    root,
    back: root.querySelector('#mgBackBtn'),
    title: root.querySelector('#mgTitle'),
    status: root.querySelector('#mgStatus'),
    sub: root.querySelector('#mgSub'),
    center: root.querySelector('#mgCenter'),
    hand: root.querySelector('#mgHand'),
    actions: root.querySelector('#mgActions'),
    settleRow: root.querySelector('#mgSettleRow'),
    again: root.querySelector('#mgAgainBtn'),
    lobby: root.querySelector('#mgLobbyBtn'),
    modal: root.querySelector('#mgResultModal'),
    seats: [0, 1, 2, 3].map((i) => ({
      panel: root.querySelector(`[data-mg-seat="${i}"]`),
      meta: root.querySelector(`#mgMeta${i}`),
      count: root.querySelector(`#mgCount${i}`),
      play: root.querySelector(`#mgPlay${i}`),
    })),
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
  el.modal?.querySelector('#mgResultLobby')?.addEventListener('click', exitToLobby);
  el.again?.addEventListener('click', (e) => {
    e.preventDefault();
    hideResult();
    startNext();
  });
  el.modal?.querySelector('#mgResultAgain')?.addEventListener('click', (e) => {
    e.preventDefault();
    hideResult();
    startNext();
  });

  function setOptions(next = {}) {
    if (next.onSettle) opts.onSettle = next.onSettle;
    if (next.onExit) opts.onExit = next.onExit;
    if (next.getStake) opts.getStake = next.getStake;
  }

  function ensureChrome() {
    let bg = root.querySelector('.gd-yard-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.className = 'gd-yard-bg';
      bg.setAttribute('aria-hidden', 'true');
      root.querySelector('.mg-table')?.prepend(bg);
    }
    let tableTop = root.querySelector('.gd-stone-table');
    if (!tableTop) {
      tableTop = document.createElement('div');
      tableTop.className = 'gd-stone-table';
      tableTop.setAttribute('aria-hidden', 'true');
      root.querySelector('.mg-table')?.prepend(tableTop);
    }
    if (!root.querySelector('.gd-level-chip')) {
      const chip = document.createElement('div');
      chip.className = 'gd-level-chip';
      chip.innerHTML = '<small>级牌</small><b data-gd-level>5</b>';
      root.appendChild(chip);
    }
    if (!root.querySelector('.gd-remain-meter')) {
      const meter = document.createElement('div');
      meter.className = 'gd-remain-meter';
      meter.setAttribute('data-gd-meter', '');
      root.appendChild(meter);
    }
    if (!root.querySelector('.gd-toolbar')) {
      const bar = document.createElement('div');
      bar.className = 'gd-toolbar';
      bar.innerHTML = `
        <div class="gd-suit-bar" data-gd-suits>
          <button type="button" data-gd-suit="3">♠</button>
          <button type="button" data-gd-suit="2">♣</button>
          <button type="button" data-gd-suit="0">♦</button>
          <button type="button" data-gd-suit="1">♥</button>
        </div>
        <button type="button" class="gd-tool-restore" data-gd-restore>恢复</button>
        <button type="button" class="gd-tool-sort" data-gd-sort>一键理牌</button>
      `;
      const dock = root.querySelector('.mg-hand-dock');
      (dock || root).appendChild(bar);
      bar.querySelectorAll('[data-gd-suit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const s = Number(btn.getAttribute('data-gd-suit'));
          suitFilter = suitFilter === s ? null : s;
          render();
        });
      });
      bar.querySelector('[data-gd-restore]')?.addEventListener('click', () => {
        arrangeMode = 'raw';
        render();
      });
      bar.querySelector('[data-gd-sort]')?.addEventListener('click', () => {
        arrangeMode = 'auto';
        render();
      });
    }
    if (!root.querySelector('.gd-again-pill')) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'gd-again-pill';
      pill.hidden = true;
      pill.textContent = '再来一局';
      pill.addEventListener('click', () => {
        hideResult();
        startNext();
      });
      root.appendChild(pill);
    }
  }

  function show() {
    ensureChrome();
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'guandan';
    root.classList.remove('zjh-active', 'mj-2p', 'mj-4p');
    root.classList.add('gd-active', 'gd-4p', 'gd-yard');
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'multi-active');
    root.style.pointerEvents = 'auto';
    root.style.display = 'flex';
    root.style.visibility = 'visible';
    root.style.zIndex = '200';
    el.seats.forEach((s) => {
      if (!s.panel) return;
      s.panel.hidden = false;
      s.panel.removeAttribute('hidden');
      s.panel.style.display = '';
      s.panel.style.visibility = 'visible';
    });
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = 'none';
      stage.style.visibility = 'hidden';
      stage.style.pointerEvents = 'none';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display = 'none';
  }

  function hide() {
    stopAi();
    hideResult();
    stripGuandanChrome(root);
    if (el.hand) el.hand.innerHTML = '';
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.classList.remove('gd-active', 'gd-4p', 'gd-yard', 'gd-settling', 'mj-4p', 'mj-2p', 'zjh-active');
    delete root.dataset.game;
    root.style.zIndex = '';
    root.style.pointerEvents = 'none';
    root.style.display = 'none';
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

  function stopAi() {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    if (turnTimer) {
      clearInterval(turnTimer);
      turnTimer = null;
    }
  }

  function start() {
    const st = opts.getStake() || {};
    roomLabel = st.label || '掼蛋';
    settleReported = false;
    selected = new Set();
    prevFinish = null;
    suitFilter = null;
    arrangeMode = 'raw';
    rawOrder = [];
    career = null;
    table = createGuanDanTable({
      stake: st.stake ?? 100,
      team0Level: st.level ?? 2,
      team1Level: 2,
      skipTribute: true,
    });
    career = table.career;
    table.start({ skipTribute: true });
    captureRawOrder();
    show();
    render();
    scheduleAi();
  }

  function startNext() {
    if (!table) {
      start();
      return;
    }
    settleReported = false;
    selected = new Set();
    suitFilter = null;
    arrangeMode = 'raw';
    const last = table.snapshot(0).lastRecord;
    prevFinish = last?.finishOrder || prevFinish;
    table = createGuanDanTable({
      stake: (opts.getStake() || {}).stake ?? 100,
      settlement: career || table.career,
      prevFinishOrder: prevFinish,
      skipTribute: false,
    });
    career = table.career;
    table.start({ prevFinishOrder: prevFinish, skipTribute: !prevFinish });
    captureRawOrder();
    show();
    render();
    scheduleAi();
  }

  function captureRawOrder() {
    const snap = table?.snapshot(0);
    rawOrder = (snap?.hands?.[0] || []).filter((c) => !c.hidden).map((c) => c.id);
  }

  function scheduleAi() {
    stopAi();
    if (!table) return;
    const snap = table.snapshot(0);
    if (snap.phase === Phase.SETTLE) {
      showSettle(snap);
      return;
    }
    startTurnClock(snap);
    if (snap.phase === Phase.TRIBUTE) {
      if (snap.humanReturn) {
        render();
        return;
      }
      aiTimer = setTimeout(() => {
        table.aiAct(snap.tribute?.pendingReturns?.[0]?.from ?? 1);
        render();
        scheduleAi();
      }, 400);
      return;
    }
    if (snap.phase === Phase.PLAY && snap.currentSeat !== 0) {
      const seat = snap.currentSeat;
      aiTimer = setTimeout(() => {
        table.aiAct(seat);
        render();
        scheduleAi();
      }, 480 + Math.random() * 420);
    }
  }

  function startTurnClock(snap) {
    turnLeft = 15;
    if (turnTimer) clearInterval(turnTimer);
    if (snap.phase !== Phase.PLAY) return;
    turnTimer = setInterval(() => {
      turnLeft -= 1;
      const clock = root.querySelector('.gd-clock');
      if (clock) clock.textContent = String(Math.max(0, turnLeft));
      if (turnLeft <= 0) {
        clearInterval(turnTimer);
        turnTimer = null;
        if (snap.currentSeat === 0 && table?.snapshot(0).humanTurn) {
          const r = table.act(0, null);
          if (!r.ok) {
            const h = table.hint(0);
            const hand = (table.snapshot(0).hands[0] || []).filter((c) => !c.hidden);
            let cards = [];
            if (h?.cards?.length) {
              cards = h.cards.map((c) => hand.find((x) => x.id === c.id)).filter(Boolean);
            }
            if (cards.length) table.act(0, cards);
          }
          selected = new Set();
          render();
          scheduleAi();
        }
      }
    }, 1000);
  }

  function rankLabel(r) {
    const m = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小', 17: '大' };
    return m[r] || String(r);
  }

  function cardFace(c, currentRank) {
    const t = cardText(c);
    const wild = table && isWild(c, currentRank);
    const red = c.suit === 0 || c.suit === 2 || c.rank === 17;
    let rank = t;
    let suit = '';
    if (c.rank === 16) rank = 'JOK';
    else if (c.rank === 17) rank = 'JOK';
    else {
      suit = t.match(/[♠♥♣♦]/)?.[0] || '';
      rank = t.replace(/[♠♥♣♦]/g, '') || String(c.rank);
    }
    return { rank, suit, red, wild, joker: c.rank >= 16, bigJoker: c.rank === 17 };
  }

  function cardHtml(c, opts = {}) {
    const { selectable, selectedOn, currentRank, dim } = opts;
    const face = cardFace(c, currentRank);
    const cls = [
      'gd-card',
      face.red ? 'is-red' : '',
      face.wild ? 'is-wild' : '',
      face.joker ? 'is-joker' : '',
      face.bigJoker ? 'is-big' : '',
      selectable ? 'is-sel' : '',
      selectedOn ? 'is-on' : '',
      dim ? 'is-dim' : '',
    ].filter(Boolean).join(' ');
    const title = `${cardText(c)}${face.wild ? ' · 逢人配' : ''}`;
    if (face.joker) {
      return `<button type="button" class="${cls}" data-card-id="${c.id}" ${selectable ? '' : 'disabled'} title="${title}">
        <span class="gd-joker-mark">${face.bigJoker ? '大王' : '小王'}</span>
      </button>`;
    }
    return `<button type="button" class="${cls}" data-card-id="${c.id}" ${selectable ? '' : 'disabled'} title="${title}">
      <span class="gd-rank">${face.rank}${face.wild ? '<i>★</i>' : ''}</span>
      <span class="gd-suit">${face.suit}</span>
    </button>`;
  }

  function groupHand(hand, currentRank) {
    const map = new Map();
    const seen = [];
    const src = arrangeMode === 'raw'
      ? [...hand].sort((a, b) => rawOrder.indexOf(a.id) - rawOrder.indexOf(b.id))
      : [...hand].sort((a, b) => {
        const bomb = (hand.filter((x) => x.rank === b.rank).length >= 4 ? 1 : 0)
          - (hand.filter((x) => x.rank === a.rank).length >= 4 ? 1 : 0);
        if (bomb) return bomb;
        if (a.rank !== b.rank) return b.rank - a.rank;
        return a.suit - b.suit;
      });
    for (const c of src) {
      if (!map.has(c.rank)) {
        map.set(c.rank, []);
        seen.push(c.rank);
      }
      map.get(c.rank).push(c);
    }
    if (arrangeMode === 'auto') {
      seen.sort((a, b) => {
        const ca = map.get(a).length;
        const cb = map.get(b).length;
        const ba = ca >= 4 ? 1 : 0;
        const bb = cb >= 4 ? 1 : 0;
        if (ba !== bb) return bb - ba;
        if ((a >= 16) !== (b >= 16)) return a >= 16 ? -1 : 1;
        if (a === currentRank && b !== currentRank) return -1;
        if (b === currentRank && a !== currentRank) return 1;
        return b - a;
      });
    }
    return seen.map((r) => ({ rank: r, cards: map.get(r) }));
  }

  function goldFor(seat, snap) {
    const base = 500;
    const d = snap.phase === Phase.SETTLE ? (snap.lastRecord?.deltas?.[seat] || 0) : 0;
    return Math.max(0, base + d);
  }

  function renderMeter(snap) {
    const meter = root.querySelector('[data-gd-meter]');
    if (!meter) return;
    const m = snap.remainMeter || {};
    const items = [
      ['大', 17], ['小', 16], [rankLabel(snap.currentRank) + '★', snap.currentRank],
      ['A', 14], ['K', 13], ['Q', 12], ['J', 11],
    ];
    meter.innerHTML = items.map(([lab, r], i) => (
      `<span class="gd-m-item ${i === 2 ? 'is-level' : ''}"><small>${lab}</small><b>${m[r] ?? 0}</b></span>`
    )).join('');
  }

  function render() {
    if (!table) return;
    const snap = table.snapshot(0);
    const settling = snap.phase === Phase.SETTLE;
    root.classList.toggle('gd-settling', settling);
    if (el.title) el.title.textContent = roomLabel;
    const lvChip = root.querySelector('[data-gd-level]');
    if (lvChip) lvChip.textContent = rankLabel(snap.currentRank);
    renderMeter(snap);
    root.querySelectorAll('[data-gd-suit]').forEach((b) => {
      b.classList.toggle('is-on', suitFilter === Number(b.getAttribute('data-gd-suit')));
    });
    const pill = root.querySelector('.gd-again-pill');
    if (pill) pill.hidden = !settling;
    const bar = root.querySelector('.gd-toolbar');
    if (bar) bar.hidden = settling;
    bar?.querySelector('[data-gd-restore]')?.classList.toggle('is-on', arrangeMode === 'raw');
    bar?.querySelector('[data-gd-sort]')?.classList.toggle('is-on', arrangeMode === 'auto');

    const places = ['头游', '二游', '三游', '末游'];
    for (let i = 0; i < 4; i++) {
      const s = el.seats[i];
      if (!s.panel) continue;
      const isTurn = snap.currentSeat === i && snap.phase === Phase.PLAY;
      s.panel.classList.toggle('is-turn', isTurn);
      s.panel.classList.toggle('is-self', i === 0);
      s.panel.classList.toggle('is-partner', i === 2);
      const place = snap.finished.indexOf(i);
      if (s.meta) {
        const gold = goldFor(i, snap);
        const d = snap.lastRecord?.deltas?.[i];
        s.meta.innerHTML =
          `<span class="gd-gold">${gold}</span>`
          + (settling && d != null ? `<em class="gd-delta ${d >= 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${d}</em>` : '')
          + (settling && place >= 0 ? `<span class="gd-place p${place}">${places[place]}</span>` : '');
      }
      if (s.count) {
        s.count.textContent = `${snap.handCounts[i] ?? 0}`;
        s.count.hidden = settling;
      }
      if (s.play) {
        if (settling && place === 0 && snap.lastRecord) {
          s.play.innerHTML = '';
        } else if (isTurn) {
          s.play.innerHTML = `<span class="gd-clock" aria-label="倒计时">${turnLeft}</span>`;
        } else {
          const played = snap.seatPlays?.[i]?.cards || [];
          s.play.innerHTML = played.length
            ? `<div class="gd-played">${played.map((c) => cardHtml(c, { currentRank: snap.currentRank })).join('')}</div>`
            : '';
        }
      }
    }

    if (el.center) {
      if (settling) {
        el.center.innerHTML = '';
      } else if (snap.phase === Phase.TRIBUTE) {
        el.center.innerHTML = `<div class="gd-center-tip">${snap.message || '进贡'}</div>`;
      } else {
        el.center.innerHTML = '';
      }
    }

    if (el.hand) {
      const hand = (snap.hands[0] || []).filter((c) => !c.hidden);
      if (!rawOrder.length) rawOrder = hand.map((c) => c.id);
      const canSel = snap.humanTurn || snap.humanReturn;
      const groups = groupHand(hand, snap.currentRank);
      el.hand.className = 'mg-hand gd-hand-cols';
      el.hand.hidden = settling;
      el.hand.innerHTML = groups.map((g) => {
        const bomb = g.cards.length >= 4;
        const dimCol = suitFilter != null && g.cards.every((c) => c.suit !== suitFilter && c.rank < 16);
        return `<div class="gd-col ${bomb ? 'is-bomb' : ''}">`
          + g.cards.map((c) => cardHtml(c, {
            selectable: canSel,
            selectedOn: selected.has(c.id),
            currentRank: snap.currentRank,
            dim: dimCol || (suitFilter != null && c.suit !== suitFilter && c.rank < 16),
          })).join('')
          + (bomb ? `<span class="gd-bomb-tag">${g.cards.length === 4 ? '四炸' : g.cards.length + '炸'}</span>` : '')
          + `</div>`;
      }).join('');
      el.hand.querySelectorAll('[data-card-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!canSel) return;
          const id = btn.getAttribute('data-card-id');
          if (snap.humanReturn) {
            const card = hand.find((c) => c.id === id);
            const r = table.humanReturnTribute(card);
            if (r.ok) {
              selected = new Set();
              render();
              scheduleAi();
            }
            return;
          }
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          render();
        });
      });
    }

    if (el.actions) {
      el.actions.innerHTML = '';
      if (snap.phase === Phase.PLAY && snap.humanTurn) {
        el.actions.innerHTML = `
          <button type="button" class="gd-act gd-act-pass" data-gd="pass">不出</button>
          <button type="button" class="gd-act gd-act-play" data-gd="play">出牌</button>
        `;
        el.actions.querySelector('[data-gd="pass"]')?.addEventListener('click', () => {
          const r = table.act(0, null);
          if (!r.ok && el.status) el.status.textContent = r.reason === 'must_lead' ? '首出必须出牌' : '不能过';
          selected = new Set();
          render();
          scheduleAi();
        });
        el.actions.querySelector('[data-gd="play"]')?.addEventListener('click', () => {
          const hand = (snap.hands[0] || []).filter((c) => !c.hidden);
          const cards = hand.filter((c) => selected.has(c.id));
          const r = table.act(0, cards);
          if (!r.ok) {
            const map = {
              invalid_hand: '牌型不合法',
              cannot_beat: '压不住上家',
              not_in_hand: '选牌有误',
              must_lead: '请先出牌',
            };
            if (el.status) el.status.textContent = map[r.reason] || r.reason || '不能出';
            return;
          }
          selected = new Set();
          render();
          scheduleAi();
        });
      } else if (snap.phase === Phase.TRIBUTE && snap.humanReturn) {
        el.actions.innerHTML = '<span class="gd-wait">点选 ≤10 的牌还贡</span>';
      } else {
        el.actions.innerHTML = '';
      }
    }
    if (el.settleRow) el.settleRow.hidden = true;
    if (el.modal) el.modal.hidden = true;
    try {
      requestAnimationFrame(() => {
        try { fitAllHands(root); } catch (_) {}
      });
    } catch (_) {}
  }

  function showSettle(snap) {
    const rec = snap.lastRecord;
    if (!rec) return;
    if (!settleReported) {
      settleReported = true;
      opts.onSettle({
        deltas: rec.deltas,
        winner: rec.winnerTeam === 0 ? 0 : 1,
        roomLabel,
        finishOrder: rec.finishOrder,
        pattern: rec.pattern,
      });
    }
    render();
  }

  function hideResult() {
    if (el.modal) el.modal.hidden = true;
    root.classList.remove('gd-settling');
    const pill = root.querySelector('.gd-again-pill');
    if (pill) pill.hidden = true;
  }

  _instance = { start, hide, show, render, setOptions, startNext };
  return _instance;
}
