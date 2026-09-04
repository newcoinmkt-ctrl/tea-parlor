/**
 * 炸金花 UI — QQ 风格不变
 * 玩法：看牌×2、比牌×2 单注、All-in、235、边池、胜率、公平校验码
 */
import { createZhajinhuaTable, cardText, evalHand, PlayerStatus } from './engine.js';
import { decideZhajinhua } from './ai.js';
import { resultPlayerHtml, getResultSeatSrc } from '../../shared/result-avatar.js';
import { brandMgCardBadgeHtml, brandMgCardBackBadgeHtml } from '../../shared/branding.js';

const DEFAULT_NAMES = ['茶馆', '茶友A', '茶友B'];
let _instance = null;

export function createZhajinhuaUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({ ante: 50, stake: 50, label: '炸金花' })),
  };

  let table = null;
  let aiTimer = null;
  let roomLabel = '炸金花';
  let settleReported = false;
  let busy = false;

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
    opts.onExit();
  };

  el.back?.addEventListener('click', exitToLobby);
  el.lobby?.addEventListener('click', exitToLobby);
  el.modalLobby?.addEventListener('click', exitToLobby);
  el.again?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideResult();
    start();
  });
  el.modalAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
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

  function show() {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'zhajinhua';
    // 清掉掼蛋/麻将布局残留，避免牌面被挤没
    root.classList.remove('gd-active', 'mj-4p', 'mj-2p');
    root.classList.add('zjh-active');
    const shell = document.querySelector('.lobby-shell');
    shell?.classList.add('table-active', 'multi-active');
    root.style.pointerEvents = 'auto';
    root.style.display = 'flex';
    root.style.visibility = 'visible';
    root.style.zIndex = '200';
    el.seats.forEach((s, i) => {
      if (!s.panel) return;
      const on = i < 3;
      s.panel.hidden = !on;
      if (on) {
        s.panel.removeAttribute('hidden');
        s.panel.style.display = '';
        s.panel.style.visibility = 'visible';
      } else {
        s.panel.setAttribute('hidden', '');
        s.panel.style.display = 'none';
        s.panel.style.visibility = 'hidden';
      }
    });
    // 确保手牌容器可见
    if (el.hand) {
      el.hand.hidden = false;
      el.hand.style.display = 'flex';
      el.hand.style.visibility = 'visible';
      el.hand.style.minHeight = '72px';
    }
    const dock = root.querySelector('.mg-hand-dock');
    if (dock) {
      dock.hidden = false;
      dock.style.display = '';
      dock.style.visibility = 'visible';
    }
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
    // play9g1TearDown: clear tap HUD on table switch
    if (el.actions) { el.actions.hidden = true; el.actions.innerHTML = ''; }
    if (el.hand) el.hand.innerHTML = '';
    if (el.center) el.center.innerHTML = '';
    if (el.settleRow) { el.settleRow.hidden = true; el.settleRow.setAttribute('hidden', ''); }
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.classList.remove('zjh-active', 'gd-active', 'mj-4p', 'mj-2p');
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
  }

  function hideResult() {
    if (el.modal) {
      el.modal.hidden = true;
      el.modal.setAttribute('hidden', '');
    }
  }

  function start() {
    const stake = opts.getStake();
    roomLabel = stake.label || '炸金花';
    settleReported = false;
    busy = false;
    stopAi();
    table = createZhajinhuaTable({
      names: DEFAULT_NAMES,
      ante: stake.ante || 50,
      stake: stake.stake || 50,
      maxRounds: 8,
    });
    table.deal();
    show();
    render();
    scheduleAi();
  }

  function reasonText(reason) {
    return {
      not_play: '不在对局中',
      not_turn: '还没轮到你',
      folded: '已出局',
      self: '不能和自己比',
      too_early: '第一圈不能比牌，请先跟注',
      bad_target: '对手无效',
      insufficient_chips: '筹码不足，请 All-in',
      no_chips: '没有筹码',
    }[reason] || reason || '无法操作';
  }

  function statusTag(snap, i) {
    if (snap.status?.[i] === PlayerStatus.LOST || (snap.folded[i] && snap.compareLog?.some((c) => c.loser === i))) {
      return '输';
    }
    if (snap.folded[i] || snap.status?.[i] === PlayerStatus.FOLDED) return '弃';
    if (snap.allIn?.[i] || snap.status?.[i] === PlayerStatus.ALL_IN) return '全押';
    if (snap.looked[i]) return '看';
    return '闷';
  }

  function doHuman(act, target) {
    if (!table || busy) return;
    const snap = table.snapshot(0);
    if (snap.phase !== 'play' || snap.current !== 0 || snap.folded[0]) return;
    if (snap.allIn?.[0]) return;
    busy = true;
    let r = { ok: false, reason: 'unknown' };
    try {
      if (act === 'look') r = table.look(0);
      else if (act === 'call') r = table.call(0);
      else if (act === 'raise') r = table.raise(0, 2);
      else if (act === 'allin') r = table.allIn(0);
      else if (act === 'fold') r = table.fold(0);
      else if (act === 'compare') r = table.compare(0, target);
      else if (act === 'open') r = table.showdownAll();
    } catch (err) {
      r = { ok: false, reason: String(err?.message || err) };
    }
    busy = false;
    if (!r.ok) {
      if (el.status) {
        el.status.textContent = r.canAllIn
          ? '筹码不足当前单注，请点「孤注一掷」'
          : reasonText(r.reason);
      }
      render();
      return;
    }
    render();
    scheduleAi();
  }

  function runAiAction(seat, dec) {
    if (dec.action === 'look') return table.look(seat);
    if (dec.action === 'fold') return table.fold(seat);
    if (dec.action === 'allin') return table.allIn(seat);
    if (dec.action === 'raise') {
      const r = table.raise(seat, 2);
      if (!r.ok && r.canAllIn) return table.allIn(seat);
      if (!r.ok) return table.call(seat);
      return r;
    }
    if (dec.action === 'compare') {
      const r = table.compare(seat, dec.target);
      if (!r.ok) {
        if (r.canAllIn) return table.allIn(seat);
        return table.call(seat);
      }
      return r;
    }
    if (dec.action === 'pass') return { ok: true };
    const r = table.call(seat);
    if (!r.ok && r.canAllIn) return table.allIn(seat);
    return r;
  }

  function scheduleAi() {
    stopAi();
    if (!table) return;
    const snap = table.snapshot(0);
    if (snap.phase === 'settle') {
      showSettle(snap);
      return;
    }
    if (snap.current === 0 && !snap.folded[0] && !snap.allIn?.[0]) return;
    // 全员 all-in 或仅剩 AI 需推进
    if (snap.current === 0 && (snap.folded[0] || snap.allIn?.[0])) {
      // 若当前指向已弃/全押的 0，引擎应已 advance；兜底
    }

    aiTimer = setTimeout(() => {
      if (!table) return;
      let s = table.snapshot(0);
      if (s.phase === 'settle') {
        render();
        showSettle(s);
        return;
      }
      if (s.current === 0 && !s.folded[0] && !s.allIn?.[0]) {
        render();
        return;
      }
      let guard = 0;
      while (
        s.phase === 'play'
        && s.current !== 0
        && !s.folded[s.current]
        && !(s.allIn?.[s.current])
        && guard++ < 8
      ) {
        const seat = s.current;
        let dec = decideZhajinhua(s, seat);
        if (dec.action === 'look') {
          table.look(seat);
          s = table.snapshot(0);
          dec = decideZhajinhua(s, seat);
          if (dec.action === 'look') dec = { action: 'call' };
        }
        runAiAction(seat, dec);
        s = table.snapshot(0);
      }
      // 若轮到 0 但 0 已全押/弃，引擎应跳过；若卡死则 force
      if (s.phase === 'play' && (s.folded[s.current] || s.allIn?.[s.current])) {
        table.showdownAll?.('all_in_showdown');
        s = table.snapshot(0);
      }
      render();
      scheduleAi();
    }, 480 + Math.random() * 320);
  }

  function renderCards(cards, faceUp) {
    if (!faceUp) {
      // 牌背：深蓝 + 中央实心 BTC 广告
      const backAd = brandMgCardBackBadgeHtml();
      return [0, 1, 2].map(() => (
        `<span class="mg-card mg-card-face back mg-card-back" aria-label="暗牌">`
        + backAd
        + `</span>`
      )).join('');
    }
    const faceAd = brandMgCardBadgeHtml();
    const list = (cards || []).filter(Boolean);
    if (!list.length) {
      return '<span class="mg-card mg-card-empty">无牌</span>';
    }
    return list.map((c) => {
      const t = cardText(c);
      const red = c.isRed ? ' red' : '';
      // 花色 + 点数分行，避免挤成空白
      const suit = t.slice(0, 1);
      const rank = t.slice(1) || t;
      return (
        `<span class="mg-card mg-card-face${red}" title="${t}">`
        + `<span class="mg-card-rank">${rank}</span>`
        + `<span class="mg-card-suit">${suit}</span>`
        + faceAd
        + `</span>`
      );
    }).join('');
  }

  function render() {
    if (!table) return;
    const snap = table.snapshot(0);
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) {
      const men = snap.currentMenStake || snap.stake;
      // 顶栏不展示校验码 / 公平码
      el.sub.textContent =
        `底池 ${snap.pot} · 底注 ${snap.ante} · 闷 ${men} / 看 ${men * 2}`
        + (snap.canCompare ? ' · 可比牌' : ' · 首圈跟注');
    }
    if (el.status) {
      if (snap.phase === 'settle') {
        el.status.textContent = `${snap.names[snap.winner] || '—'} 赢下底池 ${snap.pot}`;
      } else if (snap.current === 0 && !snap.folded[0] && !snap.allIn?.[0]) {
        const wp = snap.winProb;
        const wpTxt = wp ? ` · 估胜 ${(wp.equity * 100).toFixed(0)}%` : '';
        el.status.textContent = snap.looked[0]
          ? `轮到你（已看）· 跟 ${snap.betUnit} / 比 ${snap.compareCost}${wpTxt}`
          : `轮到你（闷）· 闷跟 ${snap.betUnit} / 看牌 / 弃牌`;
      } else if (snap.folded[0] && snap.phase === 'play') {
        el.status.textContent = '你已出局，等待本局结束…';
      } else if (snap.allIn?.[0] && snap.phase === 'play') {
        el.status.textContent = '你已全押，等待开牌…';
      } else {
        {
          const act = String(snap.lastAction || '').replace(/[·\s]*校验\s*\S+/g, '').replace(/Pinus|Colyseus|checksum|hash/gi, '').trim();
          el.status.textContent = `${act || '等待'} · ${snap.names[snap.current] || ''}`.replace(/\s·\s*$/, '');
        }
      }
    }

    for (let i = 0; i < 3; i++) {
      const s = el.seats[i];
      if (!s.panel) continue;
      const out = snap.folded[i];
      const turn = snap.current === i && snap.phase === 'play' && !out && !snap.allIn?.[i];
      s.panel.classList.toggle('is-turn', turn);
      s.panel.classList.toggle('is-winner', snap.winner === i);
      s.panel.classList.toggle('is-folded', !!out);
      if (s.meta) {
        const tag = statusTag(snap, i);
        const ch = snap.chips?.[i];
        s.meta.innerHTML =
          `<strong>${snap.names[i]}${i === 0 ? '（我）' : ''}</strong>`
          + `<span>${tag} · 下 ${snap.bets[i]}${ch != null ? ` · 筹 ${ch}` : ''}</span>`;
      }
      if (s.count) {
        s.count.textContent = out ? statusTag(snap, i) : (snap.allIn?.[i] ? '全' : '3');
      }
      if (s.play) {
        // 自己手牌只在底栏 mgHand 展示，座位区不重复画牌
        if (i === 0) {
          s.play.innerHTML = '';
          s.play.style.display = 'none';
        } else {
          s.play.hidden = false;
          s.play.style.display = 'flex';
          s.play.style.visibility = 'visible';
          if (out) {
            s.play.innerHTML = `<span class="muted">${statusTag(snap, i)}</span>`;
          } else {
            const faceUp = snap.phase === 'settle'
              || !!(snap.hands[i] && snap.hands[i].every(Boolean));
            s.play.innerHTML = renderCards(snap.hands[i] || [null, null, null], faceUp);
          }
        }
      }
    }

    if (el.center) {
      const myEv = snap.evals[0];
      const wp = snap.winProb;
      const pots = snap.pots || [];
      const potHint = pots.length > 1
        ? `主池 ${pots[0]?.amount || 0}`
          + pots.slice(1).map((p, i) => ` · 边${i + 1} ${p.amount}`).join('')
        : '';
      // 中间只显示底池与简要状态，不展示校验码 / 公平码
      el.center.innerHTML =
        `<div class="zjh-pot-card">`
        + `<div class="zjh-pot-label">底池</div>`
        + `<div class="mg-pot-big">${snap.pot}</div>`
        + `<div class="zjh-pot-action">${snap.lastAction || '—'}</div>`
        + (potHint ? `<div class="zjh-pot-type muted">${potHint}</div>` : '')
        + (myEv
          ? `<div class="zjh-pot-type">我的牌型 · <b>${myEv.name}</b>`
            + (wp ? ` · 胜率约 <b>${(wp.equity * 100).toFixed(0)}%</b>` : '')
            + `</div>`
          : `<div class="zjh-pot-type">闷牌中 · 点「看牌」</div>`)
        + `</div>`;
    }

    if (el.hand) {
      el.hand.hidden = false;
      el.hand.style.display = 'flex';
      el.hand.style.visibility = 'visible';
      // 自己手牌：未看牌也显示 3 张牌背，看牌后显示点数
      const myFace = snap.looked[0] || snap.phase === 'settle';
      const myCards = myFace
        ? (snap.hands[0] || snap.rawHands?.[0] || [])
        : [null, null, null];
      el.hand.innerHTML = renderCards(myCards, myFace);
    }

    if (el.actions) {
      el.actions.style.pointerEvents = 'auto';
      el.actions.style.position = 'relative';
      el.actions.style.zIndex = '220';
      if (snap.phase === 'settle') {
        el.actions.hidden = true;
        el.actions.innerHTML = '';
        if (el.settleRow) {
          el.settleRow.hidden = false;
          el.settleRow.style.pointerEvents = 'auto';
        }
      } else if (snap.current === 0 && !snap.folded[0] && !snap.allIn?.[0] && snap.phase === 'play') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const targets = [1, 2].filter((i) => !snap.folded[i]);
        const lookBtn = snap.looked[0]
          ? ''
          : '<button type="button" class="qq-btn qq-btn-blue" data-zj-act="look">看牌</button>';
        const callLabel = snap.looked[0] ? `跟注 ${snap.betUnit}` : `闷跟 ${snap.betUnit}`;
        const raiseMen = Math.min(
          (snap.currentMenStake || snap.stake) * 2,
          (snap.currentMenStake || snap.stake) * 10
        );
        const raiseAmt = snap.looked[0] ? raiseMen * 2 : raiseMen;
        const cmpCost = snap.compareCost || snap.betUnit * 2;
        const cmpBtns = snap.canCompare
          ? targets.map((i) => (
            `<button type="button" class="qq-btn qq-btn-gold" data-zj-act="compare" data-target="${i}">`
            + `比${snap.names[i]}(${cmpCost})</button>`
          )).join('')
          : '<button type="button" class="qq-btn qq-btn-blue" disabled title="首圈需先跟注">暂不可比</button>';
        const allInBtn = (snap.canAllIn || (snap.chips?.[0] > 0 && snap.chips[0] < snap.betUnit))
          ? `<button type="button" class="qq-btn qq-btn-gold" data-zj-act="allin">孤注一掷</button>`
          : `<button type="button" class="qq-btn qq-btn-blue" data-zj-act="allin">全押 ${snap.chips?.[0] ?? ''}</button>`;
        el.actions.innerHTML =
          lookBtn
          + `<button type="button" class="qq-btn qq-btn-gold" data-zj-act="call">${callLabel}</button>`
          + `<button type="button" class="qq-btn qq-btn-gold" data-zj-act="raise">加注 ${raiseAmt}</button>`
          + cmpBtns
          + allInBtn
          + '<button type="button" class="qq-btn qq-btn-blue" data-zj-act="fold">弃牌</button>';
        el.actions.querySelectorAll('[data-zj-act]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const act = btn.getAttribute('data-zj-act');
            const t = Number(btn.getAttribute('data-target'));
            doHuman(act, t);
          });
        });
      } else {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        if (snap.folded[0]) {
          el.actions.innerHTML = '<span class="mg-last-label">已出局，等待结算…</span>';
        } else if (snap.allIn?.[0]) {
          el.actions.innerHTML = '<span class="mg-last-label">已全押，等待开牌…</span>';
        } else {
          el.actions.innerHTML = `<span class="mg-last-label">等待 ${snap.names[snap.current]} 行动…</span>`;
        }
      }
    }
  }

  function showSettle(snap) {
    if (el.settleRow) {
      el.settleRow.hidden = false;
      el.settleRow.style.pointerEvents = 'auto';
    }
    if (el.actions) el.actions.hidden = true;
    const deltas = snap.deltas || [0, 0, 0];
    if (el.modalBody) {
      el.modalBody.innerHTML = snap.names
        .map((name, i) => {
          const d = deltas[i] || 0;
          const ev = evalHand(snap.rawHands[i]);
          const cards = (snap.rawHands[i] || []).map(cardText).join(' ');
          const cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
          const win = snap.winner === i || (snap.winners || []).includes(i);
          let badge = win ? '胜' : '';
          if (!badge && snap.folded?.[i]) {
            badge = statusTag(snap, i);
          }
          const player = resultPlayerHtml({
            seat: i,
            name,
            isMe: i === 0,
            src: getResultSeatSrc(i),
            badge,
          });
          return `<tr class="${cls}${win ? ' is-winner' : ''}${i === 0 ? ' is-me' : ''}">`
            + `<td>${player}</td>`
            + `<td class="zjh-settle-hand"><div class="zjh-type">${ev.name}</div>`
            + `<div class="zjh-cards-text">${cards}</div></td>`
            + `<td>${d > 0 ? '+' : ''}${d}</td></tr>`;
        })
        .join('');
    }
    const you = deltas[0] || 0;
    const youWin = snap.winner === 0 || (snap.winners || []).includes(0);
    if (el.modalTitle) el.modalTitle.textContent = youWin ? '胜利！' : '本局结束';
    if (el.modalBanner) el.modalBanner.className = `tx-result-banner ${youWin || you > 0 ? 'win' : 'lose'}`;
    const potLine = (snap.pots || []).length > 1
      ? (snap.pots || []).map((p, i) =>
        `${p.isMain ? '主池' : `边池${i}`}${p.amount}→${(p.winners || []).map((w) => snap.names[w]).join('/') || '-'}`
      ).join(' · ')
      : `${snap.names[snap.winner] || '—'} 赢得底池 ${snap.pot}`;
    if (el.modalSub) {
      el.modalSub.textContent = potLine + (snap.publicCode ? ` · ${snap.publicCode}` : '');
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
      opts.onSettle({ deltas, winner: snap.winner, roomLabel });
    }
  }

  _instance = { start, hide, show, setOptions };
  return _instance;
}
