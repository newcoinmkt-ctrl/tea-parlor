/**
 * 日麻 Pocket 风 UI — 挂入既有 #multiGameView，不另建大厅图标。
 */
import {
  createRiichiTable,
  tileAssetName,
  tileName,
  START_POINTS,
  WINDS,
} from './riichi-engine.js';
import { riichiAiStep } from './riichi-ai.js';

const ASSET = './public/assets/mahjong-pocket';
const TILE = `${ASSET}/tiles`;

import {
  saveMjSession,
  peekMjSession,
  clearMjSession,
  remainSeconds,
} from '../../net/table-session.js';

let _instance = null;

function tileImg(t, cls = '') {
  if (!t || t.suit < 0) {
    return `<span class="rk-tile-back ${cls}" aria-hidden="true"></span>`;
  }
  const src = `${TILE}/${tileAssetName(t)}`;
  return `<img class="${cls}" src="${src}" alt="${tileName(t)}" draggable="false" />`;
}

export function createRiichiUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({ stake: 100, label: '日麻', mode: 'riichi', variant: 'riichi' })),
  };

  let table = null;
  let aiTimer = null;
  let selected = null;
  let pendingRiichi = false;
  let settleReported = false;
  let turnSeconds = 34;
  let turnTimer = null;
  let turnEndsAt = 0;
  let openSeq = 0;
  let softTrustee = false;
  let disconnectBound = false;

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
  };

  function ensureChrome() {
    let dora = root.querySelector('#rkDoraBar');
    if (!dora) {
      dora = document.createElement('div');
      dora.id = 'rkDoraBar';
      dora.className = 'rk-dora-bar';
      dora.innerHTML = '<div class="rk-dora-tiles" id="rkDoraTiles"></div><div class="rk-dora-meta" id="rkDoraMeta"></div>';
      root.querySelector('.mg-table')?.appendChild(dora);
    }
    let dial = root.querySelector('#rkDial');
    if (!dial) {
      dial = document.createElement('div');
      dial.id = 'rkDial';
      dial.className = 'rk-dial';
      dial.innerHTML = `
        <button type="button" class="rk-dial-hu" id="rkDialHu" title="和">和</button>
        <button type="button" class="rk-dial-call" id="rkDialCall" title="鸣" disabled>鸣</button>
        <button type="button" class="rk-dial-cut" id="rkDialCut" title="切">切</button>`;
      root.querySelector('.mg-table')?.appendChild(dial);
    }
    let ops = root.querySelector('#rkOps');
    if (!ops) {
      ops = document.createElement('div');
      ops.id = 'rkOps';
      ops.className = 'rk-ops';
      ops.innerHTML = `
        <button type="button" id="rkBtnRiichi">立直</button>
        <button type="button" id="rkBtnTsumo" class="is-primary">自摸</button>
        <button type="button" id="rkBtnRon" class="is-primary">荣和</button>
        <button type="button" id="rkBtnChi">吃</button>
        <button type="button" id="rkBtnPeng">碰</button>
        <button type="button" id="rkBtnGang">杠</button>
        <button type="button" id="rkBtnSkip">跳过</button>`;
      root.querySelector('.mg-table')?.appendChild(ops);
    }
    let settle = root.querySelector('#rkSettle');
    if (!settle) {
      settle = document.createElement('div');
      settle.id = 'rkSettle';
      settle.hidden = true;
      settle.innerHTML = `<div class="rk-settle-panel" id="rkSettlePanel"></div>`;
      root.querySelector('.mg-table')?.appendChild(settle);
    }
    return { dora, dial, ops, settle };
  }

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

  function stopTurnTimer() {
    if (turnTimer) {
      clearInterval(turnTimer);
      turnTimer = null;
    }
  }

  function pickTimeoutDiscardId(snap) {
    const hand = snap.hands?.[0] || [];
    if (!hand.length) return null;
    if (snap.riichi?.[0] && snap.drawn?.id) return snap.drawn.id;
    if (selected && hand.some((c) => c.id === selected)) return selected;
    return hand[hand.length - 1]?.id || hand[0]?.id || null;
  }

  function autoTimeoutAct(reason = 'timeout') {
    if (!table) return;
    const snap = table.snapshot();
    if (!snap || snap.phase === 'settle') return;
    softTrustee = true;
    if (el.status) {
      el.status.textContent = reason === 'disconnect'
        ? '连接中断 · 已软代打（完整托管后补）'
        : '倒计时到 · 系统代打';
    }
    if (snap.phase === 'call') {
      table.humanCall?.('pass') || table.skipRon?.();
      pendingRiichi = false;
      selected = null;
      render();
      return;
    }
    if (snap.phase === 'discard' && snap.current === 0) {
      if (snap.canTsumo) {
        table.tsumo();
        selected = null;
        pendingRiichi = false;
        render();
        return;
      }
      const id = pickTimeoutDiscardId(snap);
      if (!id) return;
      const r = table.discard(id, { riichiDeclare: pendingRiichi });
      pendingRiichi = false;
      selected = null;
      if (r?.ok) render();
    }
  }

  function bindDisconnectGuard() {
    if (disconnectBound) return;
    disconnectBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!table) return;
      const snap = table.snapshot();
      if (!snap || snap.phase === 'settle') return;
      if (document.hidden) {
        softTrustee = true;
        if (snap.current === 0 || snap.phase === 'call') autoTimeoutAct('disconnect');
        else scheduleAi();
      }
    });
  }

  function startTurnTimer() {
    stopTurnTimer();
    if (!table) return;
    const snap = table.snapshot();
    if (!snap || snap.phase === 'settle') return;
    const budget = softTrustee ? 3 : 15;
    turnEndsAt = Date.now() + budget * 1000;
    turnSeconds = budget;
    const cd = document.getElementById('mjCountdown');
    if (cd) {
      cd.textContent = String(turnSeconds).padStart(2, '0');
      cd.hidden = false;
      cd.removeAttribute('hidden');
    }
    turnTimer = setInterval(() => {
      turnSeconds = remainSeconds(turnEndsAt, 0);
      if (cd) cd.textContent = String(turnSeconds).padStart(2, '0');
      if (turnSeconds <= 0) {
        stopTurnTimer();
        autoTimeoutAct('timeout');
      }
    }, 250);
  }

  function show() {
    ensureChrome();
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'mahjong';
    root.dataset.mjVariant = 'riichi';
    root.classList.remove('zjh-active', 'gd-active', 'is-hu-settle', 'gd-4p', 'nn-active');
    root.classList.add('mj-4p', 'riichi-active');
    root.style.pointerEvents = 'auto';
    root.style.display = 'flex';
    root.style.visibility = 'visible';
    root.style.zIndex = '400';
    document.querySelector('.lobby-shell')?.classList.add('multi-active');
    document.querySelector('.lobby-shell')?.classList.remove('table-active', 'texas-active');
    root.querySelectorAll('[data-mg-seat]').forEach((p, i) => {
      const on = i < 4;
      p.hidden = !on;
      if (on) {
        p.removeAttribute('hidden');
        p.style.display = '';
      }
    });
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.display = 'none';
      stage.style.visibility = 'hidden';
      stage.style.pointerEvents = 'none';
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.display = 'none';
    const wm = root.querySelector('.mj-watermark');
    if (wm) wm.textContent = '口袋日麻';
    try { window.dispatchEvent(new Event('resize')); } catch (_) { /* ignore */ }
  }


  function persistSoftSession() {
    if (!table) return;
    const snap = table.snapshot();
    if (!snap || snap.phase === 'settle') {
      clearMjSession('riichi');
      return;
    }
    try {
      const stake = opts.getStake();
      saveMjSession('riichi', {
        mode: 'riichi',
        label: stake.label || '日麻',
        state: JSON.parse(JSON.stringify(table.state)),
        turnEndsAt,
        softTrustee,
      });
    } catch (e) {
      console.warn('[riichi] persistSoftSession', e);
    }
  }

  function tryRestoreSession() {
    const stake = opts.getStake();
    const saved = peekMjSession('riichi', 'riichi');
    if (!saved?.state) return false;
    table = createRiichiTable({
      stake: stake.stake || 100,
      names: saved.state.names || ['茶馆', '东家', '南家', '西家'],
    });
    try {
      const st = saved.state;
      for (const k of Object.keys(st)) table.state[k] = st[k];
    } catch (e) {
      console.warn('[riichi] hydrate failed', e);
      clearMjSession('riichi');
      return false;
    }
    softTrustee = !!saved.softTrustee;
    turnEndsAt = Number(saved.turnEndsAt) || 0;
    if (el.status) el.status.textContent = '已重连回桌';
    return true;
  }

  function hide() {
    persistSoftSession();
    openSeq += 1;
    stopAi();
    stopTurnTimer();
    selected = null;
    pendingRiichi = false;
    root.classList.remove('riichi-active', 'mj-4p', 'mj-2p');
    delete root.dataset.mjVariant;
    const settle = root.querySelector('#rkSettle');
    if (settle) {
      settle.hidden = true;
      settle.setAttribute('hidden', '');
    }
    root.hidden = true;
    root.setAttribute('hidden', '');
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
  }

  function syncScores(snap) {
    for (let i = 0; i < 4; i++) {
      const node = root.querySelector(`[data-mj-score="${i}"]`);
      if (!node) continue;
      const sc = Number(snap.scores?.[i] ?? START_POINTS);
      node.textContent = String(sc);
      node.classList.toggle('is-neg', sc < START_POINTS);
    }
    // Compass-hugging scores (Pocket)
    const compass = root.querySelector('.mj-compass');
    if (compass) {
      let box = compass.querySelector('.rk-compass-scores');
      if (!box) {
        box = document.createElement('div');
        box.className = 'rk-compass-scores';
        box.innerHTML = [0, 1, 2, 3].map((i) => `<span class="rk-cscore" data-seat="${i}">25000</span>`).join('');
        compass.appendChild(box);
      }
      box.querySelectorAll('.rk-cscore').forEach((elScore) => {
        const i = Number(elScore.getAttribute('data-seat'));
        const sc = Number(snap.scores?.[i] ?? START_POINTS);
        elScore.textContent = String(sc);
        elScore.classList.toggle('is-neg', sc < START_POINTS);
      });
    }
  }

  function syncWinds(snap) {
    const dealer = Number(snap.dealer || 0);
    const current = Number(snap.current || 0);
    const winds = ['e', 's', 'w', 'n'];
    const seatWind = {};
    for (let i = 0; i < 4; i++) {
      seatWind[i] = winds[(i - dealer + 4) % 4];
    }
    const active = seatWind[current] || 'e';
    root.querySelectorAll('.mj-wind').forEach((elWind) => {
      elWind.classList.toggle('is-active', elWind.getAttribute('data-wind') === active);
    });
  }

  function renderWalls(left) {
    const per = Math.max(0, Math.floor(left / 4));
    const rem = Math.max(0, left - per * 4);
    const counts = [per + (rem > 0 ? 1 : 0), per + (rem > 1 ? 1 : 0), per + (rem > 2 ? 1 : 0), per];
    // Pocket: double-layer stacks (up to 17) wrapping N/W/E/S
    ['mjWallN', 'mjWallW', 'mjWallE', 'mjWallS'].forEach((id, i) => {
      const node = document.getElementById(id);
      if (!node) return;
      const sideTiles = counts[i] || 0;
      const stacks = Math.min(17, Math.ceil(sideTiles / 2));
      let used = 0;
      const parts = [];
      for (let s = 0; s < stacks; s++) {
        const remain = sideTiles - used;
        const n = remain >= 2 ? 2 : 1;
        used += n;
        const tiles = Array.from({ length: n }, () => '<i class="mj-wall-tile"></i>').join('');
        parts.push(`<span class="mj-wall-stack">${tiles}</span>`);
      }
      node.innerHTML = parts.join('');
    });
    const wc = document.getElementById('mjWallCount');
    if (wc) wc.textContent = String(left);
  }

  function renderDora(snap) {
    const box = document.getElementById('rkDoraTiles');
    const meta = document.getElementById('rkDoraMeta');
    if (!box) return;
    const inds = snap.doraIndicators || [];
    let html = inds.map((t) => tileImg(t)).join('');
    for (let i = inds.length; i < 5; i++) html += '<span class="rk-tile-back"></span>';
    box.innerHTML = html;
    if (meta) {
      meta.textContent = `${snap.roundLabel || '东1局'} ${snap.honba || 0}本场`;
      if (snap.riichiSticks) {
        meta.innerHTML += ` · ${'<i class="rk-riichi-stick"></i>'.repeat(Math.min(4, snap.riichiSticks))}`;
      }
    }
  }

  function renderRivers(snap) {
    if (!el.center) return;
    // 四家河：0自 / 1下家右 / 2对家 / 3上家左 — orientation via CSS
    const seats = [0, 1, 2, 3];
    const parts = seats.map((s) => {
      const riv = snap.rivers?.[s] || [];
      const riichi = !!snap.riichi?.[s];
      // Mark first discard as riichi-declaration tile when seat is in riichi (Pocket sideways)
      const ridx = snap.riichiDiscardIndex?.[s];
      const tiles = riv.map((t, idx) => {
        const isDecl = riichi && ((ridx != null && ridx >= 0) ? idx === ridx : idx === 0);
        const cls = isDecl ? 'rk-tile-mini is-riichi-discard' : 'rk-tile-mini';
        return tileImg(t, cls);
      }).join('');
      return `<div class="rk-kawa-seat" data-seat="${s}">${tiles}</div>`;
    }).join('');
    el.center.innerHTML = `<div class="rk-kawa" aria-label="四家河">${parts}</div>`;

    // Clear seat play zones (rivers live in center)
    for (let s = 0; s < 4; s++) {
      const play = root.querySelector(`#mgPlay${s}`);
      if (play) play.innerHTML = '';
    }
  }

  function renderHand(snap) {
    if (!el.hand) return;
    const hand = snap.hands?.[0] || [];
    const drawnId = snap.drawn?.id;
    el.hand.innerHTML = hand.map((t) => {
      const drawn = drawnId && t.id === drawnId ? ' is-drawn' : '';
      const sel = selected === t.id ? ' is-selected' : '';
      return `<button type="button" class="rk-tile${drawn}${sel}" data-tile-id="${t.id}" aria-label="${tileName(t)}">${tileImg(t)}</button>`;
    }).join('');
  }

  function renderOps(snap) {
    const btnRiichi = document.getElementById('rkBtnRiichi');
    const btnTsumo = document.getElementById('rkBtnTsumo');
    const btnRon = document.getElementById('rkBtnRon');
    const btnChi = document.getElementById('rkBtnChi');
    const btnPeng = document.getElementById('rkBtnPeng');
    const btnGang = document.getElementById('rkBtnGang');
    const btnSkip = document.getElementById('rkBtnSkip');
    const dialHu = document.getElementById('rkDialHu');
    const dialCut = document.getElementById('rkDialCut');
    const dialCall = document.getElementById('rkDialCall');
    const pending = pendingRiichi || !!snap.pendingRiichi;
    const co = snap.callOptions || {};
    if (btnRiichi) {
      const can = (snap.canRiichi || pending) && snap.phase === 'discard' && snap.current === 0 && !snap.riichi?.[0];
      btnRiichi.disabled = !can;
      btnRiichi.classList.toggle('is-primary', pending);
      btnRiichi.classList.toggle('is-riichi-armed', pending);
      btnRiichi.textContent = pending ? '立直中…' : '立直';
      btnRiichi.setAttribute('aria-pressed', pending ? 'true' : 'false');
    }
    if (btnTsumo) {
      btnTsumo.disabled = !snap.canTsumo;
      btnTsumo.hidden = snap.phase === 'call';
    }
    if (btnRon) {
      btnRon.disabled = !(snap.canRon || co.canRon);
      btnRon.hidden = snap.phase !== 'call';
    }
    if (btnChi) {
      btnChi.disabled = !co.canChi;
      btnChi.hidden = snap.phase !== 'call';
    }
    if (btnPeng) {
      btnPeng.disabled = !co.canPeng;
      btnPeng.hidden = snap.phase !== 'call';
    }
    if (btnGang) {
      btnGang.disabled = !co.canGang;
      btnGang.hidden = snap.phase !== 'call';
    }
    if (btnSkip) {
      btnSkip.hidden = snap.phase !== 'call';
      btnSkip.disabled = snap.phase !== 'call';
    }
    if (dialHu) dialHu.disabled = !(snap.canTsumo || snap.canRon || co.canRon);
    if (dialCut) dialCut.disabled = snap.phase !== 'discard' || snap.current !== 0;
    if (dialCall) {
      const canCall = snap.phase === 'call' && (co.canChi || co.canPeng || co.canGang);
      dialCall.disabled = !canCall;
    }
    if (el.actions) {
      el.actions.hidden = true;
      el.actions.innerHTML = '';
    }
  }

  function showSettle(snap) {
    const layer = document.getElementById('rkSettle');
    const panel = document.getElementById('rkSettlePanel');
    if (!layer || !panel) return;
    const s = snap.settle;
    if (!s) {
      layer.hidden = true;
      return;
    }
    if (s.kind === 'draw') {
      panel.innerHTML = `
        <div class="rk-settle-top"><div class="rk-settle-points">流局</div></div>
        <p style="text-align:center">牌山耗尽</p>
        <div class="rk-settle-actions"><button type="button" id="rkSettleOk">确认</button></div>`;
    } else {
      let yaku = Array.isArray(s.yaku) ? s.yaku.slice() : [];
      // play9fin1c: empty settle forbidden — synthesize common yaku line
      if (!yaku.length) {
        yaku = [{ name: s.title || '和了', han: Math.max(1, Number(s.han) || 1) }];
        if (Number(s.fu) > 0) {
          /* keep fu from settle */
        }
      }
      const fu = Math.max(20, Number(s.fu) || 30);
      const han = Math.max(1, Number(s.han) || yaku.reduce((a, y) => a + (y.han || 0), 0));
      const points = Math.max(1, Math.abs(Number(s.total) || 0));
      const mid = Math.ceil(yaku.length / 2) || 0;
      const left = yaku.slice(0, mid);
      const right = yaku.slice(mid);
      const yakuHtml = (arr) => arr.map((y) => `<div class="rk-yaku-tag"><span>${y.name}</span><b>${y.han} 番</b></div>`).join('') || '<div class="rk-yaku-tag"><span>和了</span><b>1 番</b></div>';
      const doraRow = (s.doraIndicators || []).map((t) => tileImg(t)).join('');
      const uraRow = (s.uraDoraIndicators || []).map((t) => tileImg(t)).join('');
      panel.innerHTML = `
        <div class="rk-settle-top">
          <div class="rk-settle-points">${points} 点</div>
          <div class="rk-settle-stamp">${s.title || (s.kind === 'tsumo' ? '自摸' : '荣和')}</div>
        </div>
        <div class="rk-settle-han"><strong>${han} 番</strong><span>${fu} 符</span><em>${points} 点</em></div>
        <div class="rk-yaku-cols"><div>${yakuHtml(left)}</div><div>${yakuHtml(right)}</div></div>
        <div class="rk-settle-dora"><span>宝牌</span>${doraRow || '—'}</div>
        ${uraRow ? `<div class="rk-settle-dora rk-settle-ura"><span>里宝牌</span>${uraRow}</div>` : ''}
        <div class="rk-settle-hand">
          ${(s.hand || []).map((t) => tileImg(t)).join('')}
          <span class="rk-win-sep"></span>
          ${s.winTile ? tileImg(s.winTile) : ''}
        </div>
        <div class="rk-settle-tier">${s.tier || ''}</div>
        <div class="rk-settle-actions"><button type="button" id="rkSettleOk">确认</button></div>`;
    }
    layer.hidden = false;
    layer.removeAttribute('hidden');
    document.getElementById('rkSettleOk')?.addEventListener('click', () => {
      layer.hidden = true;
      if (el.settleRow) {
        el.settleRow.hidden = false;
        el.settleRow.removeAttribute('hidden');
      }
    }, { once: true });

    if (!settleReported) {
      settleReported = true;
      clearMjSession('riichi');
      opts.onSettle({
        deltas: s.deltas || [0, 0, 0, 0],
        winner: snap.winner,
        roomLabel: '日麻',
        mode: 'riichi',
      });
    }
  }

  function render() {
    if (!table) return;
    const snap = table.snapshot();
    syncScores(snap);
    syncWinds(snap);
    renderWalls(snap.wallLeft);
    renderDora(snap);
    renderRivers(snap);
    renderHand(snap);
    renderOps(snap);
    startTurnTimer();

    if (el.status) {
      if (snap.phase === 'settle') el.status.textContent = snap.winKind === 'draw' ? '流局' : (snap.settle?.title || '和了');
      else if (snap.phase === 'call') {
        const co = snap.callOptions || {};
        const bits = [];
        if (snap.canRon || co.canRon) bits.push('荣和');
        if (co.canChi) bits.push('吃');
        if (co.canPeng) bits.push('碰');
        if (co.canGang) bits.push('杠');
        el.status.textContent = bits.length ? `可${bits.join('/')} · 点选或跳过` : '可应答 · 跳过';
      }
      else if (snap.current === 0) el.status.textContent = (pendingRiichi || snap.pendingRiichi) ? '立直宣言 · 选择打出的牌' : (snap.riichi?.[0] ? '立直中 · 模切' : '点选手牌打出 · 可立直/自摸');
      else el.status.textContent = `${snap.names[snap.current]} 行牌中`;
    }
    if (el.sub) {
      el.sub.textContent = `${snap.roundLabel || '东1局'} · ${WINDS[(snap.seatWinds?.[0] || 1) - 1]}家`;
    }
    for (let i = 0; i < 4; i++) {
      const meta = root.querySelector(`#mgMeta${i}`);
      if (meta) {
        const stick = snap.riichi?.[i] ? ' <span class="rk-riichi-stick" title="立直"></span>' : '';
        const ip = snap.ippatsu?.[i] && snap.riichi?.[i] ? ' <em class="rk-ippatsu">一发</em>' : '';
        meta.innerHTML = `<strong>${snap.names[i]}${i === 0 ? '（我）' : ''}</strong>${stick}${ip}`;
      }
      root.querySelector(`[data-mg-seat="${i}"]`)?.classList.toggle('is-riichi', !!snap.riichi?.[i]);
      const count = root.querySelector(`#mgCount${i}`);
      if (count) {
        count.textContent = `${snap.handCounts?.[i] ?? '—'}张`;
        count.hidden = false;
      }
      root.querySelector(`[data-mg-seat="${i}"]`)?.classList.toggle('is-turn', snap.current === i && snap.phase !== 'settle');
      root.querySelector(`[data-mg-seat="${i}"]`)?.classList.toggle('is-dealer', snap.dealer === i);
    }

    if (snap.phase === 'settle') {
      stopAi();
      showSettle(snap);
      return;
    }
    scheduleAi();
  }

  function scheduleAi() {
    stopAi();
    if (!table) return;
    const snap = table.snapshot();
    if (snap.phase === 'settle') return;
    if (snap.phase === 'call') return; // wait player
    if (snap.current === 0) return;
    aiTimer = setTimeout(() => {
      riichiAiStep(table, snap.current);
      pendingRiichi = false;
      selected = null;
      render();
    }, 480 + Math.random() * 420);
  }

  function onDiscardSelected() {
    if (!table || !selected) return;
    const r = table.discard(selected, { riichiDeclare: pendingRiichi });
    pendingRiichi = false;
    selected = null;
    if (r?.ok) render();
  }

  function bind() {
    el.back?.addEventListener('click', (e) => {
      e.preventDefault();
      hide();
      opts.onExit();
    });
    el.again?.addEventListener('click', () => start());
    el.lobby?.addEventListener('click', () => {
      hide();
      opts.onExit();
    });
    el.hand?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tile-id]');
      if (!btn || !table) return;
      const id = btn.getAttribute('data-tile-id');
      const snap = table.snapshot();
      if (snap.current !== 0 || snap.phase !== 'discard') return;
      if (selected === id) {
        onDiscardSelected();
        return;
      }
      selected = id;
      renderHand(snap);
    });
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.id === 'rkBtnRiichi' || t.closest('#rkBtnRiichi')) {
        if (!table) return;
        const r = table.declareRiichi();
        if (r?.ok) {
          pendingRiichi = true;
          if (el.status) el.status.textContent = '立直宣言 · 选择打出的牌';
          render();
        }
        return;
      }
      if (t.id === 'rkBtnTsumo' || t.closest('#rkBtnTsumo') || t.id === 'rkDialHu') {
        if (!table) return;
        const snap = table.snapshot();
        if (snap.canRon) table.ron();
        else table.tsumo();
        render();
        return;
      }
      if (t.id === 'rkBtnRon' || t.closest('#rkBtnRon')) {
        table?.ron();
        render();
        return;
      }
      if (t.id === 'rkBtnChi' || t.closest('#rkBtnChi')) {
        table?.humanCall?.('chi');
        render();
        return;
      }
      if (t.id === 'rkBtnPeng' || t.closest('#rkBtnPeng')) {
        table?.humanCall?.('peng');
        render();
        return;
      }
      if (t.id === 'rkBtnGang' || t.closest('#rkBtnGang')) {
        table?.humanCall?.('gang');
        render();
        return;
      }
      if (t.id === 'rkBtnSkip' || t.closest('#rkBtnSkip') || t.id === 'rkDialCall') {
        table?.humanCall?.('pass') || table?.skipRon?.();
        render();
        return;
      }
      if (t.id === 'rkDialCut' || t.closest('#rkDialCut')) {
        onDiscardSelected();
      }
    });
  }

  function start() {
    const stake = opts.getStake();
    settleReported = false;
    selected = null;
    pendingRiichi = false;
    softTrustee = false;
    bindDisconnectGuard();
    stopAi();
    const settle = document.getElementById('rkSettle');
    if (settle) {
      settle.hidden = true;
      settle.setAttribute('hidden', '');
    }
    if (el.settleRow) {
      el.settleRow.hidden = true;
      el.settleRow.setAttribute('hidden', '');
    }
    show();
    if (el.title) el.title.textContent = stake.label || '日麻';
    if (el.status) el.status.textContent = '发牌中…';
    // play9fin1a: resume parked riichi table
    if (tryRestoreSession()) {
      show();
      render();
      scheduleAi();
      startTurnTimer();
      return;
    }
    clearMjSession('riichi');
    table = createRiichiTable({
      names: ['茶馆', '茶友A', '茶友B', '茶友C'],
    });
    const seq = ++openSeq;
    // brief delay then deal
    setTimeout(() => {
      if (seq !== openSeq) return;
      table.deal({ dealer: Math.floor(Math.random() * 4) });
      render();
    }, 200);
  }

  bind();
  _instance = { start, hide, setOptions, get root() { return root; } };
  return _instance;
}
