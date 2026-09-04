/**
 * 德州扑克 H5 UI 控制
 */
import { createTexasTable, Phase, CATEGORY_NAME } from './engine.js';
import { cardText } from './cards.js';
import { decideTexasAction } from './ai.js';
import { resultPlayerHtml, getResultSeatSrc } from '../shared/result-avatar.js';
import { brandCardBadgeHtml, brandCardBackBadgeHtml } from '../shared/branding.js';
import { playCharAction, playSettleActions, playFromPokerAct } from '../shared/char-motion.js';

const NAMES = ['茶馆', '茶友A', '茶友B'];

let _texasInstance = null;

export function createTexasUI(options = {}) {
  // 单例：避免每次 startTexas 重复 addEventListener，导致「再来一局」连触发两次
  if (_texasInstance) {
    _texasInstance.setOptions(options);
    return _texasInstance;
  }

  let onSettle = options.onSettle || (() => {});
  let onExit = options.onExit || (() => {});
  let getStake = options.getStake || (() => ({ buyIn: 1000, sb: 10, bb: 20, label: '常规桌' }));

  let table = null;
  let aiTimer = null;
  let roomLabel = '德州常规桌';
  /** 本局开局前筹码（用于计算输赢） */
  let handStartStacks = [0, 0, 0];
  let settleShown = false;
  /** 防止 nextHand / 结算弹窗连点 */
  let nextHandBusy = false;
  /** 跨局延续筹码 */
  let carryStacks = null;

  const root = document.getElementById('texasTableView');
  if (!root) throw new Error('texasTableView missing');

  const el = {
    root,
    back: root.querySelector('#texasBackBtn'),
    status: root.querySelector('#texasStatus'),
    pot: root.querySelector('#texasPot'),
    potChip: root.querySelector('#texasPotChip'),
    phase: root.querySelector('#texasPhase'),
    board: root.querySelector('#texasBoard'),
    log: null, // 底部日志已移除
    actions: root.querySelector('#texasActions'),
    again: root.querySelector('#texasAgainBtn'),
    toLobby: root.querySelector('#texasLobbyBtn'),
    settleRow: root.querySelector('#texasSettleRow'),
    modal: root.querySelector('#texasResultModal'),
    modalTitle: root.querySelector('#txResultTitle'),
    modalBanner: root.querySelector('#txResultBanner'),
    modalSub: root.querySelector('#txResultSub'),
    modalBody: root.querySelector('#txResultBody'),
    modalYou: root.querySelector('#txResultYou'),
    modalAgain: root.querySelector('#txResultAgain'),
    modalLobby: root.querySelector('#txResultLobby'),
    seats: [0, 1, 2].map((i) => ({
      panel: root.querySelector(`[data-texas-seat="${i}"]`),
      hole: root.querySelector(`#texasHole${i}`),
      meta: root.querySelector(`#texasMeta${i}`),
      bet: root.querySelector(`#texasBet${i}`),
      tag: root.querySelector(`#texasTag${i}`),
    })),
  };

  // 返回 / 结算：捕获阶段绑定，避免结算遮罩吞掉点击
  const exitToLobby = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    hideResultModal();
    stopAi();
    hide();
    onExit();
  };
  const bindExit = (node) => {
    node?.addEventListener('click', exitToLobby, true);
  };
  bindExit(el.back);
  bindExit(el.toLobby);
  bindExit(el.modalLobby);
  el.again?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    requestNextHand();
  });
  el.modalAgain?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    requestNextHand();
  });
  el.modal?.querySelectorAll('[data-tx-result-dismiss]').forEach((n) => {
    n.addEventListener('click', (e) => {
      e.preventDefault();
      // 点遮罩不关局，仅收起弹窗（仍可用底部再来一局）
      hideResultModal();
    });
  });

  function setOptions(next = {}) {
    if (next.onSettle) onSettle = next.onSettle;
    if (next.onExit) onExit = next.onExit;
    if (next.getStake) getStake = next.getStake;
  }

  /** 统一入口：关弹窗 + 防连点开下一局 */
  function requestNextHand() {
    if (nextHandBusy) return;
    hideResultModal();
    nextHand();
  }

  function show() {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.style.setProperty('display', 'flex', 'important');
    root.style.setProperty('visibility', 'visible', 'important');
    root.style.setProperty('pointer-events', 'auto', 'important');
    root.style.setProperty('z-index', '400', 'important');
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'texas-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.setProperty('display', 'none', 'important');
      stage.style.setProperty('visibility', 'hidden', 'important');
      stage.style.setProperty('pointer-events', 'none', 'important');
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.setProperty('display', 'none', 'important');
  }

  function hide() {
    stopAi();
    hideResultModal();
    // play9g1TearDown: clear tap HUD on table switch
    if (el.actions) el.actions.innerHTML = '';
    if (el.seats?.[0]?.hole) el.seats[0].hole.innerHTML = '';
    if (el.settleRow) { el.settleRow.hidden = true; el.settleRow.setAttribute('hidden', ''); }
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.style.setProperty('display', 'none', 'important');
    root.style.setProperty('visibility', 'hidden', 'important');
    root.style.setProperty('pointer-events', 'none', 'important');
    root.style.removeProperty('z-index');
    document.querySelector('.lobby-shell')?.classList.remove('table-active', 'texas-active');
    const stage = document.querySelector('.lobby-stage');
    if (stage) {
      stage.style.removeProperty('pointer-events');
      stage.style.removeProperty('display');
      stage.style.removeProperty('visibility');
    }
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.style.setProperty('display', 'none', 'important');
  }

  function start() {
    const stake = getStake();
    roomLabel = stake.label || '德州桌';
    settleShown = false;
    nextHandBusy = false;
    stopAi();
    hideResultModal();
    carryStacks = null;
    table = createTexasTable({
      names: NAMES,
      humanIndex: 0,
      smallBlind: stake.sb,
      bigBlind: stake.bb,
      buyIn: stake.buyIn,
    });
    beginHand();
    show();
  }

  /** 同一桌上再来一局（筹码延续） */
  function nextHand() {
    if (nextHandBusy) return;
    nextHandBusy = true;
    settleShown = false;
    stopAi();
    hideResultModal();
    try {
      if (!table) {
        start();
        return;
      }
      // 用当前 stacks 续局（engine.startHand 会继承 state.stacks）
      const pub = table.getPublicState(0);
      if (pub?.stacks) carryStacks = pub.stacks.slice();
      table.startHand();
      captureHandStart();
      render();
      scheduleAi();
    } finally {
      // 短防抖：避免连点 / 双监听重复开局
      setTimeout(() => { nextHandBusy = false; }, 400);
    }
  }

  function beginHand() {
    table.startHand();
    captureHandStart();
    render();
    scheduleAi();
  }

  function captureHandStart() {
    const pub = table.getPublicState(0);
    if (!pub) {
      handStartStacks = [0, 0, 0];
      return;
    }
    // 开局后已下盲：起始筹码 = 当前筹码 + 本街注额
    handStartStacks = pub.stacks.map((s, i) => s + (pub.bets?.[i] || 0));
  }

  function stopAi() {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = null;
  }

  function scheduleAi() {
    stopAi();
    const pub = table.getPublicState(0);
    if (!pub || pub.phase === Phase.SETTLE) return;
    if (pub.current === 0) return;
    aiTimer = setTimeout(runAi, 450);
  }

  function runAi() {
    const st = table.state;
    if (!st || st.phase === Phase.SETTLE) {
      render();
      return;
    }
    const pub = table.getPublicState(0);
    if (!pub || pub.phase === Phase.SETTLE) {
      render();
      return;
    }
    if (pub.current === 0) {
      render();
      return;
    }
    const seat = pub.current;
    const legal = table.getLegalActions(seat);
    const view = {
      ...pub,
      legal,
      _privateHoles: st.holes,
    };
    const act = decideTexasAction(view, seat);
    if ((act.type === 'bet' || act.type === 'raise') && act.amount != null) {
      table.applyAction(seat, { type: act.type, amount: act.amount });
    } else {
      table.applyAction(seat, act);
    }
    render();
    const after = table.getPublicState(0);
    if (after?.phase === Phase.SETTLE) {
      handleSettle(after);
      return;
    }
    if (after && after.current !== 0) scheduleAi();
  }

  function humanAct(type, amount) {
    if (!table) return;
    const pub = table.getPublicState(0);
    if (!pub || pub.current !== 0) return;
    let payload = { type };
    if (type === 'bet') {
      // engine: target = street total bet
      payload.amount = amount;
    } else if (type === 'raise') {
      payload.amount = amount;
    }
    const res = table.applyAction(0, payload);
    if (!res.ok) {
      if (el.status) el.status.textContent = `操作无效：${res.reason}`;
      render();
      return;
    }
    try {
      playFromPokerAct(0, type);
    } catch (_) { /* ignore */ }
    render();
    const after = table.getPublicState(0);
    if (after?.phase === Phase.SETTLE) {
      handleSettle(after);
      return;
    }
    scheduleAi();
  }

  function handleSettle(pub) {
    // 同一局结算只处理一次（AI 与 humanAct 可能几乎同时进入 SETTLE）
    if (settleShown) return;
    settleShown = true;
    const deltas = pub.stacks.map((s, i) => s - (handStartStacks[i] || 0));
    try {
      onSettle({
        stacks: pub.stacks.slice(),
        winners: pub.winners,
        log: pub.log,
        deltas,
        showdown: pub.showdown,
      });
    } catch (e) {
      console.warn('[texas] onSettle', e);
    }
    try { playSettleActions(deltas); } catch (_) { /* ignore */ }
    showResultModal(pub, deltas);
  }

  function showResultModal(pub, deltas) {
    if (!el.modal) return;
    // settleShown 已在 handleSettle 置位；此处只负责展示

    const humanWin = (pub.winners || []).includes(0);
    const humanDelta = deltas[0] || 0;
    const isDraw = (pub.winners || []).length > 1 && humanWin;

    if (el.modalBanner) {
      el.modalBanner.classList.remove('is-win', 'is-lose', 'is-draw');
      if (isDraw) el.modalBanner.classList.add('is-draw');
      else if (humanWin) el.modalBanner.classList.add('is-win');
      else el.modalBanner.classList.add('is-lose');
    }
    if (el.modalTitle) {
      if (isDraw) el.modalTitle.textContent = '平局分池';
      else if (humanWin) el.modalTitle.textContent = '胜利';
      else el.modalTitle.textContent = '失败';
    }

    const winNames = (pub.winners || []).map((i) => NAMES[i]).join('、');
    let handName = '';
    if (pub.showdown?.length) {
      const best = pub.showdown.find((r) => (pub.winners || []).includes(r.seat));
      handName = best?.eval?.name || CATEGORY_NAME[best?.eval?.category] || '';
    }
    if (el.modalSub) {
      el.modalSub.textContent = handName
        ? `${winNames} 获胜 · ${handName}`
        : `${winNames || '—'} 获胜（无人跟注）`;
    }

    if (el.modalBody) {
      const showdownMap = Object.create(null);
      for (const row of (pub.showdown || [])) {
        showdownMap[row.seat] = row.eval?.name || CATEGORY_NAME[row.eval?.category] || '—';
      }
      // 自己名字跟随个人设置
      const myName = document.getElementById('playerName')?.textContent?.trim() || NAMES[0];
      const seatNames = [myName, NAMES[1], NAMES[2]];
      el.modalBody.innerHTML = [0, 1, 2].map((i) => {
        const d = deltas[i] || 0;
        const dCls = d > 0 ? 'pos' : (d < 0 ? 'neg' : 'flat');
        const dTxt = d > 0 ? `+${d}` : String(d);
        const win = (pub.winners || []).includes(i);
        const hand = showdownMap[i] || (pub.folded?.[i] ? '弃牌' : '—');
        return `<tr class="${win ? 'is-winner' : ''} ${i === 0 ? 'is-me' : ''}">
          <td>${resultPlayerHtml({ seat: i, name: seatNames[i], isMe: i === 0, src: getResultSeatSrc(i) })}</td>
          <td>${escapeHtml(hand)}</td>
          <td>${pub.stacks[i]}</td>
          <td class="${dCls}">${dTxt}</td>
        </tr>`;
      }).join('');
    }

    if (el.modalYou) {
      const d = humanDelta;
      if (d > 0) {
        el.modalYou.innerHTML = `本局你 <strong class="pos">+${d}</strong> 筹码`;
      } else if (d < 0) {
        el.modalYou.innerHTML = `本局你 <strong class="neg">${d}</strong> 筹码`;
      } else {
        el.modalYou.innerHTML = '本局你 <strong class="flat">0</strong> 筹码（持平）';
      }
    }

    el.modal.hidden = false;
    el.modal.removeAttribute('hidden');
    el.modal.classList.add('is-open');
  }

  function hideResultModal() {
    if (!el.modal) return;
    el.modal.hidden = true;
    el.modal.setAttribute('hidden', '');
    el.modal.classList.remove('is-open');
  }

  function render() {
    const pub = table.getPublicState(0);
    if (!pub) return;

    if (el.phase) {
      const map = {
        preflop: '翻牌前',
        flop: '翻牌',
        turn: '转牌',
        river: '河牌',
        showdown: '摊牌',
        settle: '结算',
      };
      el.phase.textContent = map[pub.phase] || pub.phase;
    }
    if (el.pot) el.pot.textContent = `底池 ${pub.pot}`;
    if (el.potChip) el.potChip.textContent = String(pub.pot || 0);
    const timer = document.getElementById('texasTimer');
    if (timer) {
      timer.hidden = false;
      timer.removeAttribute('hidden');
      timer.textContent = pub.current === 0 ? '●' : String(Math.max(0, 24));
    }
    if (el.status) {
      if (pub.phase === Phase.SETTLE) {
        const w = (pub.winners || []).map((i) => NAMES[i]).join('、');
        el.status.textContent = `本局结束 · ${w} 获胜`;
      } else if (pub.current === 0) {
        const need = Math.max(0, pub.toCall - pub.bets[0]);
        el.status.textContent = need > 0 ? `轮到你 · 跟注需 ${need}` : '轮到你 · 可过牌或下注';
      } else {
        el.status.textContent = `轮到 ${NAMES[pub.current]} 行动中…`;
      }
    }

    // board：只渲染已发出的公共牌 + 淡化占位
    if (el.board) {
      el.board.innerHTML = '';
      for (const c of pub.board) {
        if (!c) continue;
        const span = document.createElement('span');
        span.className = 'tx-card' + (c.isRed ? ' red-card' : '');
        span.innerHTML = faceHtml(c);
        el.board.appendChild(span);
      }
    }

    // seats
    for (let i = 0; i < 3; i++) {
      const s = el.seats[i];
      if (!s.panel) continue;
      s.panel.classList.toggle('is-turn', pub.current === i && pub.phase !== Phase.SETTLE);
      s.panel.classList.toggle('is-folded', pub.folded[i]);
      s.panel.classList.toggle('is-winner', Boolean(pub.winners?.includes(i)));

      if (s.tag) {
        const tags = [];
        if (i === pub.sb) tags.push('SB');
        if (i === pub.bb) tags.push('BB');
        if (pub.folded[i]) tags.push('弃');
        if (pub.allIn[i]) tags.push('全下');
        s.tag.textContent = tags.join(' · ') || '';
        s.tag.hidden = !tags.length;
      }
      const dealerMark = s.panel.querySelector('[data-tx-dealer]');
      if (dealerMark) {
        const on = i === pub.button;
        dealerMark.hidden = !on;
        if (on) dealerMark.removeAttribute('hidden');
        else dealerMark.setAttribute('hidden', '');
      }
      if (s.meta) {
        const myName = i === 0
          ? (document.getElementById('playerName')?.textContent?.trim() || NAMES[0])
          : NAMES[i];
        s.meta.innerHTML = `<strong>${myName}</strong><span>${pub.stacks[i]}</span>`;
      }
      if (s.bet) {
        s.bet.textContent = pub.bets[i] > 0 ? `注 ${pub.bets[i]}` : '';
      }
      if (s.hole) {
        s.hole.innerHTML = '';
        const reveal = pub.phase === Phase.SETTLE || pub.phase === Phase.SHOWDOWN;
        const cards = reveal
          ? (pub.holesRevealed?.[i] || [])
          : (i === 0 ? (pub.holes[0] || []).filter(Boolean) : [null, null]);
        for (let k = 0; k < 2; k++) {
          const c = cards[k];
          const span = document.createElement('span');
          if (c) {
            span.className = 'tx-card' + (c.isRed ? ' red-card' : '');
            span.innerHTML = faceHtml(c);
            span.title = cardText(c);
          } else {
            span.className = 'tx-card back';
            span.title = i === 0 ? '手牌' : '暗牌';
            span.innerHTML = cardBackHtml();
          }
          s.hole.appendChild(span);
        }
      }
    }

    // 摊牌牌力
    if (el.log) {
      const lines = pub.log.slice(0, 6);
      if (pub.showdown) {
        for (const row of pub.showdown) {
          lines.unshift(`${NAMES[row.seat]}：${row.eval.name || CATEGORY_NAME[row.eval.category]}`);
        }
      }
      el.log.innerHTML = lines.map((t) => `<div>${escapeHtml(t)}</div>`).join('');
    }

    // actions
    renderActions(pub);
  }

  function renderActions(pub) {
    if (!el.actions) return;
    el.actions.innerHTML = '';
    el.actions.classList.add('tx-actions-compact');
    el.actions.style.pointerEvents = 'auto';
    const settleRow = el.settleRow || root.querySelector('#texasSettleRow');
    if (pub.phase === Phase.SETTLE) {
      if (settleRow) {
        settleRow.hidden = false;
        settleRow.removeAttribute('hidden');
        settleRow.style.display = '';
        settleRow.style.pointerEvents = 'auto';
      }
      return;
    }
    if (settleRow) {
      settleRow.hidden = true;
      settleRow.setAttribute('hidden', '');
    }
    if (pub.current !== 0) {
      el.actions.innerHTML = '<span class="tx-wait">等待对手行动…</span>';
      return;
    }

    // 优先用引擎实时 legal，避免 pub.legal 过期
    const legal = (table.getLegalActions(0) || pub.legal || []);

    // 主操作行顺序对齐参考图：让牌 / 加注到 / 全下 / 弃牌 / 跟注
    const primary = document.createElement('div');
    primary.className = 'tx-act-primary';
    el.actions.appendChild(primary);

    const foldAct = legal.find((a) => a.type === 'fold');
    const checkAct = legal.find((a) => a.type === 'check');
    const callAct = legal.find((a) => a.type === 'call');
    const allinAct = legal.find((a) => a.type === 'allin');
    let raiseAction = legal.find((a) => a.type === 'raise') || legal.find((a) => a.type === 'bet');
    if (raiseAction?.type === 'bet') raiseAction = { ...raiseAction, type: 'bet' };

    if (!legal.length) {
      el.actions.innerHTML = '<span class="tx-wait">暂无可操作</span>';
      return;
    }

    if (checkAct) addBtn(primary, '让牌', 'tx-btn-check', () => humanAct('check'));
    if (raiseAction && Number.isFinite(raiseAction.min) && Number.isFinite(raiseAction.max) && raiseAction.max >= raiseAction.min) {
      renderBetSlider(raiseAction, pub, primary);
    }
    if (allinAct) addBtn(primary, '全下', 'danger tx-btn-allin', () => humanAct('allin'));
    if (foldAct) addBtn(primary, '弃牌', 'muted tx-btn-fold', () => humanAct('fold'));
    if (callAct) addBtn(primary, `跟注 ${callAct.amount}`, 'tx-btn-call', () => humanAct('call'));
  }

  function renderBetSlider(act, pub, host) {
    const min = Math.max(0, Math.floor(act.min));
    const max = Math.max(min, Math.floor(act.max));
    const pot = Math.max(0, Math.floor(pub.pot || 0));
    const current = Math.min(max, Math.max(min, pot > 0 ? Math.min(max, Math.max(min, pot)) : min));
    const label = '加注到';
    const panel = document.createElement('div');
    panel.className = 'bet-slider-panel bet-slider-compact';
    panel.innerHTML = `
      <div class="bet-slider-main">
        <span class="bet-slider-label">${label} <output>${current}</output></span>
        <input type="range" min="${min}" max="${max}" step="1" value="${current}" aria-label="${label}金额" />
        <button type="button" class="tx-btn-confirm" data-submit>加注到 <output class="tx-raise-echo">${current}</output></button>
      </div>
      <div class="bet-quick-row">
        <button type="button" data-pot="0.333">⅓池</button>
        <button type="button" data-pot="0.5">½池</button>
        <button type="button" data-pot="0.667">⅔池</button>
        <button type="button" data-pot="1">满池</button>
        <button type="button" data-min>最小</button>
        <button type="button" data-pot="allin" class="danger">All-in</button>
      </div>
    `;
    const input = panel.querySelector('input');
    const outputs = panel.querySelectorAll('output');
    const setAmount = (value) => {
      const next = Math.min(max, Math.max(min, Math.floor(value)));
      input.value = String(next);
      outputs.forEach((node) => { node.textContent = String(next); });
    };
    // pot 快捷：加注/下注目标额 = max(min, pot*ratio)，raise 时用 toCall+pot*ratio 更合理
    const potTarget = (ratio) => {
      if (act.type === 'raise') {
        const base = Math.max(0, Math.floor(pub.toCall || 0));
        return Math.max(min, Math.min(max, base + Math.floor(pot * ratio)));
      }
      return Math.max(min, Math.min(max, Math.floor(pot * ratio) || min));
    };
    input.addEventListener('input', () => setAmount(Number(input.value)));
    panel.querySelectorAll('[data-pot]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-pot');
        if (key === 'allin') humanAct('allin');
        else setAmount(potTarget(Number(key)));
      });
    });
    panel.querySelector('[data-min]')?.addEventListener('click', () => setAmount(min));
    panel.querySelector('[data-submit]')?.addEventListener('click', () => humanAct(act.type, Number(input.value)));
    (host || el.actions).appendChild(panel);
  }

  function addBtn(parent, text, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls || '';
    b.textContent = text;
    b.style.cursor = 'pointer';
    b.style.pointerEvents = 'auto';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    (parent || el.actions).appendChild(b);
  }

  function faceHtml(card) {
    if (!card) return '';
    const t = cardText(card);
    const suit = t.slice(0, 1);
    const rank = t.slice(1) || t;
    return `<span class="tx-rank">${rank}</span><span class="tx-suit">${suit}</span>`;
  }

  /** 牌背：斜纹底 + 中央实心 BTC 广告 */
  function cardBackHtml() {
    return '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  _texasInstance = { start, hide, show, render, nextHand, setOptions };
  return _texasInstance;
}
