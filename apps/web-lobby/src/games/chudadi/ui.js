/**
 * 锄大D H5 UI
 */
import { createChudadiTable, cardText, typeName } from './engine.js';
import { decideChudadi } from './ai.js';

const DEFAULT_NAMES = ['茶馆', '茶友A', '茶友B', '茶友C'];
const AVATARS = [
  './public/characters/male-hero.png',
  './public/characters/female-glam.png',
  './public/characters/male-charm.png',
  './public/characters/animal-fox.png',
];

export function createChudadiUI(options = {}) {
  const onSettle = options.onSettle || (() => {});
  const onExit = options.onExit || (() => {});
  const getStake = options.getStake || (() => ({ stake: 100, label: '锄大D' }));

  let table = null;
  let aiTimer = null;
  let selected = new Set();
  let roomLabel = '锄大D';
  let settleReported = false;

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
    modalTitle: root.querySelector('#mgResultTitle'),
    modalBanner: root.querySelector('#mgResultBanner'),
    modalSub: root.querySelector('#mgResultSub'),
    modalBody: root.querySelector('#mgResultBody'),
    modalYou: root.querySelector('#mgResultYou'),
    modalAgain: root.querySelector('#mgResultAgain'),
    modalLobby: root.querySelector('#mgResultLobby'),
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
    onExit();
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

  function show() {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'chudadi';
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'multi-active');
    // 4 人座位
    el.seats.forEach((s, i) => {
      if (s.panel) s.panel.hidden = false;
      if (s.panel) s.panel.style.display = '';
    });
  }

  function hide() {
    stopAi();
    hideResult();
    root.hidden = true;
    root.setAttribute('hidden', '');
    document.querySelector('.lobby-shell')?.classList.remove('table-active', 'multi-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.pointerEvents = 'auto';
      stage.style.display = '';
    }
  }

  function stopAi() {
    if (aiTimer) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  function hideResult() {
    if (el.modal) {
      el.modal.hidden = true;
      el.modal.setAttribute('hidden', '');
    }
  }

  function start() {
    const stake = getStake();
    roomLabel = stake.label || '锄大D';
    settleReported = false;
    selected = new Set();
    table = createChudadiTable({
      names: DEFAULT_NAMES,
      stake: stake.stake || 100,
    });
    table.deal();
    show();
    render();
    scheduleAi();
  }

  function scheduleAi() {
    stopAi();
    const snap = table.snapshot();
    if (snap.phase === 'settle') {
      showSettle(snap);
      return;
    }
    if (snap.phase !== 'play') return;
    if (snap.current === 0) return;
    aiTimer = setTimeout(() => {
      const s = table.snapshot();
      if (s.phase !== 'play' || s.current === 0) return;
      const dec = decideChudadi(s, s.current);
      if (dec.action === 'play') table.play(s.current, dec.cardIds);
      else table.pass(s.current);
      selected = new Set();
      render();
      scheduleAi();
    }, 700 + Math.random() * 500);
  }

  function render() {
    const snap = table.snapshot();
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) {
      el.sub.textContent = snap.mustIncludeDiamond3
        ? '♦3 先出 · 首出须含方块3'
        : snap.freeLead
          ? '自由出牌'
          : `压 ${snap.lastPlay?.typeName || ''} · ${snap.lastPlay?.text || ''}`;
    }
    if (el.status) {
      el.status.textContent =
        snap.phase === 'settle'
          ? `本局结束 · ${snap.names[snap.winner] || ''} 胜`
          : snap.current === 0
            ? '轮到你出牌'
            : `等待 ${snap.names[snap.current]}…`;
    }

    // seats
    for (let i = 0; i < 4; i++) {
      const s = el.seats[i];
      if (!s.panel) continue;
      s.panel.classList.toggle('is-turn', snap.current === i && snap.phase === 'play');
      s.panel.classList.toggle('is-winner', snap.winner === i);
      if (s.meta) {
        s.meta.innerHTML = `<strong>${snap.names[i]}</strong><span>余 ${snap.counts[i]}</span>`;
      }
      if (s.count) s.count.textContent = String(snap.counts[i]);
      if (s.play) {
        if (snap.lastPlay && snap.lastPlay.player === i) {
          s.play.innerHTML = snap.lastPlay.cards
            .map((c) => `<span class="mg-card ${c.isRed ? 'red' : ''}">${cardText(c)}</span>`)
            .join('');
        } else {
          s.play.innerHTML = '';
        }
      }
    }

    // center last play
    if (el.center) {
      if (snap.lastPlay) {
        el.center.innerHTML =
          `<div class="mg-last-label">${snap.names[snap.lastPlay.player]} · ${snap.lastPlay.typeName}</div>`
          + `<div class="mg-last-cards">${snap.lastPlay.cards
            .map((c) => `<span class="mg-card ${c.isRed ? 'red' : ''}">${cardText(c)}</span>`)
            .join('')}</div>`;
      } else {
        el.center.innerHTML = '<div class="mg-last-label">桌面 · 锄大D</div>';
      }
    }

    // hand
    if (el.hand) {
      const hand = snap.hands[0];
      el.hand.innerHTML = hand
        .map(
          (c) =>
            `<button type="button" class="mg-hand-card ${c.isRed ? 'red' : ''} ${selected.has(c.id) ? 'selected' : ''}" data-card-id="${c.id}">${cardText(c)}</button>`
        )
        .join('');
      el.hand.querySelectorAll('[data-card-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-card-id');
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          render();
        });
      });
    }

    // actions
    if (el.actions) {
      if (snap.phase === 'settle') {
        el.actions.innerHTML = '';
        el.actions.hidden = true;
        if (el.settleRow) el.settleRow.hidden = false;
      } else if (snap.current === 0 && snap.phase === 'play') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const canPass = !snap.freeLead && !snap.mustIncludeDiamond3 && snap.lastPlay;
        el.actions.innerHTML =
          `${canPass ? '<button type="button" class="qq-btn qq-btn-blue" data-cd-act="pass">不出</button>' : ''}`
          + '<button type="button" class="qq-btn qq-btn-gold" data-cd-act="play">出牌</button>'
          + '<button type="button" class="qq-btn qq-btn-blue" data-cd-act="hint">提示</button>';
        el.actions.querySelector('[data-cd-act="play"]')?.addEventListener('click', onPlay);
        el.actions.querySelector('[data-cd-act="pass"]')?.addEventListener('click', onPass);
        el.actions.querySelector('[data-cd-act="hint"]')?.addEventListener('click', onHint);
      } else {
        el.actions.innerHTML = '';
        el.actions.hidden = true;
        if (el.settleRow) el.settleRow.hidden = true;
      }
    }
  }

  function onPlay() {
    const ids = [...selected];
    if (!ids.length) {
      if (el.status) el.status.textContent = '请先点选手牌';
      return;
    }
    const r = table.play(0, ids);
    if (!r.ok) {
      const msg = {
        invalid: '牌型不合法（支持单/对/三/顺/炸）',
        cannot_beat: '压不住上家',
        need_d3: '首出须包含 ♦3',
        not_turn: '还没轮到你',
      }[r.reason] || `无法出牌：${r.reason}`;
      if (el.status) el.status.textContent = msg;
      return;
    }
    selected = new Set();
    render();
    scheduleAi();
  }

  function onPass() {
    const r = table.pass(0);
    if (!r.ok) {
      if (el.status) el.status.textContent = r.reason === 'must_play' ? '必须出牌' : '现在不能过';
      return;
    }
    selected = new Set();
    render();
    scheduleAi();
  }

  function onHint() {
    const snap = table.snapshot();
    const dec = decideChudadi(snap, 0);
    if (dec.action === 'play') {
      selected = new Set(dec.cardIds);
      render();
      if (el.status) el.status.textContent = '已提示可出牌型';
    } else {
      if (el.status) el.status.textContent = '建议：不出';
    }
  }

  function showSettle(snap) {
    if (el.settleRow) el.settleRow.hidden = false;
    if (el.actions) el.actions.hidden = true;
    const deltas = snap.deltas || [0, 0, 0, 0];
    if (el.modalBody) {
      el.modalBody.innerHTML = snap.names
        .map((name, i) => {
          const d = deltas[i] || 0;
          const cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
          return `<tr class="${cls}"><td>${name}${i === 0 ? '（我）' : ''}</td><td>余 ${snap.counts[i]}</td><td>${d > 0 ? '+' : ''}${d}</td></tr>`;
        })
        .join('');
    }
    const you = deltas[0] || 0;
    if (el.modalTitle) el.modalTitle.textContent = snap.winner === 0 ? '胜利！' : '本局结束';
    if (el.modalBanner) el.modalBanner.className = `tx-result-banner ${snap.winner === 0 ? 'win' : 'lose'}`;
    if (el.modalSub) el.modalSub.textContent = `${snap.names[snap.winner] || ''} 出完 · 底分 ${snap.stake}`;
    if (el.modalYou) {
      el.modalYou.textContent = you >= 0 ? `你本局 +${you} 金币` : `你本局 ${you} 金币`;
    }
    if (el.modal) {
      el.modal.hidden = false;
      el.modal.removeAttribute('hidden');
    }
    if (!settleReported) {
      settleReported = true;
      onSettle({ deltas, winner: snap.winner, roomLabel });
    }
  }

  return { start, hide, show };
}
