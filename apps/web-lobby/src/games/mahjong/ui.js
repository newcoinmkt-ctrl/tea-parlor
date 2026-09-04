/**
 * 麻将 H5 UI（二人 / 四人 / 血战 / 血流）— 单例绑定，可重复 start
 */
import {
  createMahjongTable,
  tileName,
  modeName,
  suitLabel,
  PlayerStatus,
  suggestExchangeTiles,
} from './engine.js';
import { decideMahjongDiscard } from './ai.js';
import { resultPlayerHtml, getResultSeatSrc } from '../../shared/result-avatar.js';
import { brandTileBadgeHtml } from '../../shared/branding.js';

let _instance = null;

export function createMahjongUI(options = {}) {
  if (_instance) {
    _instance.setOptions(options);
    return _instance;
  }

  const opts = {
    onSettle: options.onSettle || (() => {}),
    onExit: options.onExit || (() => {}),
    getStake: options.getStake || (() => ({ stake: 100, label: '麻将', mode: 'xuezhan' })),
  };

  let table = null;
  let aiTimer = null;
  let selected = null;
  let roomLabel = '麻将';
  let settleReported = false;
  let moveCount = 0;
  /** 开局掷骰/发牌动画进行中 */
  let opening = false;
  let openTimers = [];
  /** 防止连点「再来一局」时旧动画回调覆盖新局 */
  let openSeq = 0;

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

  function show(playerCount) {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.dataset.game = 'mahjong';
    root.classList.remove('zjh-active', 'gd-active');
    root.classList.toggle('mj-2p', playerCount === 2);
    root.classList.toggle('mj-4p', playerCount === 4);
    root.style.pointerEvents = 'auto';
    root.style.display = 'flex';
    root.style.visibility = 'visible';
    root.style.zIndex = '200';
    document.querySelector('.lobby-shell')?.classList.add('table-active', 'multi-active');
    el.seats.forEach((s, i) => {
      if (!s.panel) return;
      const on = i < playerCount;
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
    openSeq += 1;
    opening = false;
    stopAi();
    clearOpenTimers();
    hideOpenLayer();
    hideResult();
    // play9g1TearDown: clear tap HUD on table switch
    selected = null;
    if (el.actions) { el.actions.hidden = true; el.actions.innerHTML = ''; }
    if (el.hand) el.hand.innerHTML = '';
    if (el.settleRow) { el.settleRow.hidden = true; el.settleRow.setAttribute('hidden', ''); }
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.classList.remove('zjh-active', 'gd-active', 'mj-2p', 'mj-4p');
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

  function clearOpenTimers() {
    openTimers.forEach((t) => {
      clearTimeout(t.id);
      t.abort?.();
    });
    openTimers = [];
  }

  function waitMs(ms) {
    return new Promise((resolve) => {
      const entry = { id: 0, abort: resolve };
      entry.id = setTimeout(() => {
        entry.abort = null;
        resolve();
      }, ms);
      openTimers.push(entry);
    });
  }

  function ensureOpenLayer() {
    let layer = root.querySelector('#mjOpenLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'mjOpenLayer';
      layer.className = 'mj-open-layer';
      layer.setAttribute('aria-live', 'polite');
      root.appendChild(layer);
    }
    return layer;
  }

  function hideOpenLayer() {
    const layer = root.querySelector('#mjOpenLayer');
    if (layer) {
      layer.hidden = true;
      layer.setAttribute('hidden', '');
      layer.innerHTML = '';
      layer.classList.remove('is-active');
    }
    opening = false;
    root.classList.remove('mj-opening');
  }

  function diceFaceHtml(n, land = false) {
    // 标准骰子点位 1–6
    const map = {
      1: [5],
      2: [1, 9],
      3: [1, 5, 9],
      4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9],
      6: [1, 3, 4, 6, 7, 9],
    };
    const dots = (map[n] || map[1]).map((i) => `<i class="mj-die-dot d${i}"></i>`).join('');
    const cls = land ? 'mj-die mj-die-land' : 'mj-die';
    return `<div class="${cls}" data-face="${n}" aria-label="${n}点"><div class="mj-die-face">${dots}</div></div>`;
  }

  /**
   * 开局仪式：掷骰定庄 → 分轮发牌动画 → 进入对局
   * @returns {Promise<number>} dealer seat
   */
  async function runOpeningCeremony({ playerCount, names }) {
    opening = true;
    root.classList.add('mj-opening');
    const layer = ensureOpenLayer();
    layer.hidden = false;
    layer.removeAttribute('hidden');
    layer.classList.add('is-active');

    // ── 1) 掷骰 ──
    if (el.status) el.status.textContent = '掷骰定庄…';
    layer.innerHTML =
      `<div class="mj-open-panel">`
      + `<p class="mj-open-title">掷骰定庄</p>`
      + `<div class="mj-open-dice" id="mjOpenDice">`
      + `<div class="mj-die mj-die-spin" data-face="?"><div class="mj-die-face"><i class="mj-die-dot d5"></i></div></div>`
      + `<div class="mj-die mj-die-spin" data-face="?"><div class="mj-die-face"><i class="mj-die-dot d5"></i></div></div>`
      + `</div>`
      + `<p class="mj-open-tip" id="mjOpenTip">摇骰中…</p>`
      + `</div>`;

    // 滚动点动画
    const diceBox = layer.querySelector('#mjOpenDice');
    for (let i = 0; i < 8; i++) {
      await waitMs(70);
      if (!opening) return 0;
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      if (diceBox) diceBox.innerHTML = diceFaceHtml(a) + diceFaceHtml(b);
    }

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const sum = d1 + d2;
    // 从自家（0）起顺时针数 sum 点定庄
    const dealer = (sum - 1) % playerCount;
    if (diceBox) {
      diceBox.innerHTML = `${diceFaceHtml(d1, true)}${diceFaceHtml(d2, true)}`;
    }
    const dealerName = names[dealer] || `座位${dealer}`;
    const tip = layer.querySelector('#mjOpenTip');
    if (tip) {
      tip.innerHTML =
        `骰点 <b>${d1}</b> + <b>${d2}</b> = <b>${sum}</b>`
        + `<br/><span class="mj-open-dealer">庄家 · ${dealerName}${dealer === 0 ? '（我）' : ''}</span>`;
    }
    if (el.status) el.status.textContent = `庄家：${dealerName}`;
    // 高亮庄家座位
    el.seats.forEach((s, i) => {
      s.panel?.classList.toggle('is-dealer', i === dealer && i < playerCount);
    });
    await waitMs(1100);
    if (!opening) return dealer;

    // ── 2) 发牌动画（三轮×4 + 一轮×1，从庄家起）──
    if (el.status) el.status.textContent = '发牌中…';
    const batches = [4, 4, 4, 1];
    const seatOrder = Array.from({ length: playerCount }, (_, i) => (dealer + i) % playerCount);
    const handCounts = Array.from({ length: playerCount }, () => 0);

    layer.innerHTML =
      `<div class="mj-open-panel mj-open-deal">`
      + `<p class="mj-open-title">发牌</p>`
      + `<p class="mj-open-tip">从庄家起 · 每次 4 张 · 共 13 张</p>`
      + `<div class="mj-open-deal-grid" id="mjOpenDealGrid"></div>`
      + `<div class="mj-open-fly" id="mjOpenFly" aria-hidden="true"></div>`
      + `</div>`;

    const grid = layer.querySelector('#mjOpenDealGrid');
    const fly = layer.querySelector('#mjOpenFly');

    function renderDealGrid(activeSeat, flashN) {
      if (!grid) return;
      grid.innerHTML = seatOrder.map((seat) => {
        const isMe = seat === 0;
        const label = isMe ? '我' : (names[seat] || `座${seat}`);
        const n = handCounts[seat];
        const backs = Array.from({ length: n }, (_, k) => {
          const flash = seat === activeSeat && k >= n - flashN ? ' is-new' : '';
          return `<span class="mj-tile-back${flash}"></span>`;
        }).join('');
        return (
          `<div class="mj-open-seat-hand${seat === activeSeat ? ' is-active' : ''}${seat === dealer ? ' is-dealer' : ''}" data-seat="${seat}">`
          + `<span class="mj-open-seat-label">${seat === dealer ? '庄·' : ''}${label} <em>${n}</em></span>`
          + `<div class="mj-open-backs">${backs}</div>`
          + `</div>`
        );
      }).join('');
    }

    renderDealGrid(-1, 0);

    for (let bi = 0; bi < batches.length; bi++) {
      const n = batches[bi];
      for (const seat of seatOrder) {
        if (!opening) return dealer;
        // 飞牌动画
        if (fly) {
          fly.innerHTML = Array.from({ length: Math.min(n, 4) }, () => '<span class="mj-tile-back mj-fly-tile"></span>').join('');
          fly.className = `mj-open-fly fly-to-${seat} is-flying`;
        }
        await waitMs(160);
        handCounts[seat] += n;
        renderDealGrid(seat, n);
        if (fly) {
          fly.classList.remove('is-flying');
          fly.innerHTML = '';
        }
        // 更新座位张数角标
        const sc = el.seats[seat];
        if (sc?.count) {
          sc.count.hidden = false;
          sc.count.removeAttribute('hidden');
          sc.count.textContent = `${handCounts[seat]}张`;
        }
        if (el.status) {
          const who = seat === 0 ? '我' : (names[seat] || `座${seat}`);
          el.status.textContent = `发牌 · ${who} +${n}（${handCounts[seat]}/13）`;
        }
        await waitMs(90);
      }
      await waitMs(120);
    }

    if (layer.querySelector('.mj-open-tip')) {
      layer.querySelector('.mj-open-tip').textContent = '发牌完成 · 理牌中…';
    }
    if (el.status) el.status.textContent = '理牌…';
    await waitMs(550);
    hideOpenLayer();
    return dealer;
  }

  function hideResult() {
    if (el.modal) {
      el.modal.hidden = true;
      el.modal.setAttribute('hidden', '');
    }
  }

  function start() {
    const stake = opts.getStake();
    roomLabel = stake.label || modeName(stake.mode || 'xuezhan');
    settleReported = false;
    selected = null;
    moveCount = 0;
    stopAi();
    clearOpenTimers();
    hideOpenLayer();
    hideResult();

    const names = ['茶馆', '茶友A', '茶友B', '茶友C'];
    const seq = ++openSeq;
    table = createMahjongTable({
      mode: stake.mode || 'xuezhan',
      stake: stake.stake || 100,
      names,
    });
    const playerCount = table.snapshot().playerCount;
    show(playerCount);

    // 清空手牌区，先走开局仪式
    if (el.hand) el.hand.innerHTML = '';
    if (el.center) {
      el.center.innerHTML =
        '<div class="mg-last-label">开局准备</div>'
        + '<div class="muted mg-empty-tip">掷骰定庄 · 发牌中</div>';
    }
    if (el.actions) {
      el.actions.hidden = true;
      el.actions.innerHTML = '';
    }
    if (el.settleRow) el.settleRow.hidden = true;
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) el.sub.textContent = `${modeName(stake.mode || 'xuezhan')} · 底分 ${stake.stake || 100}`;
    if (el.status) el.status.textContent = '掷骰定庄…';
    el.seats.forEach((s, i) => {
      if (i >= playerCount) return;
      s.panel?.classList.remove('is-dealer', 'is-turn', 'is-winner');
      if (s.meta) {
        s.meta.innerHTML = `<strong>${names[i] || ''}${i === 0 ? '（我）' : ''}</strong><span class="mg-meta-line">待发牌</span>`;
      }
      if (s.play) s.play.innerHTML = '';
      if (s.count) {
        s.count.hidden = false;
        s.count.removeAttribute('hidden');
        s.count.textContent = '0张';
      }
    });

    runOpeningCeremony({ playerCount, names: names.slice(0, playerCount) })
      .then((dealer) => {
        if (seq !== openSeq || !table) return;
        table.deal({ dealer });
        // 保持庄家标记
        el.seats.forEach((s, i) => {
          s.panel?.classList.toggle('is-dealer', i === dealer && i < playerCount);
        });
        render();
        scheduleAi();
      })
      .catch(() => {
        if (seq !== openSeq || !table) return;
        table.deal({ dealer: 0 });
        hideOpenLayer();
        render();
        scheduleAi();
      });
  }

  /** 手牌花色 class */
  function tileSuitClass(tile) {
    if (!tile || tile.suit == null) return '';
    if (tile.suit === 0) return 'suit-wan';
    if (tile.suit === 1) return 'suit-tiao';
    if (tile.suit === 2) return 'suit-tong';
    return 'suit-zi';
  }

  /** 筒：圆点坐标（参考传统麻将 1–9） viewBox 0..100 */
  const TONG_DOTS = {
    1: [[50, 50]],
    2: [[32, 32], [68, 68]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[32, 32], [68, 32], [32, 68], [68, 68]],
    5: [[32, 28], [68, 28], [50, 50], [32, 72], [68, 72]],
    6: [[32, 26], [68, 26], [32, 50], [68, 50], [32, 74], [68, 74]],
    7: [[28, 24], [50, 24], [72, 24], [50, 50], [28, 76], [50, 76], [72, 76]],
    8: [[32, 22], [68, 22], [32, 40], [68, 40], [32, 60], [68, 60], [32, 78], [68, 78]],
    9: [[28, 22], [50, 22], [72, 22], [28, 50], [50, 50], [72, 50], [28, 78], [50, 78], [72, 78]],
  };

  function svgDot(x, y, r = 11) {
    return (
      `<circle cx="${x}" cy="${y}" r="${r}" fill="#0f4a2c"/>`
      + `<circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="#072818"/>`
      + `<circle cx="${x - r * 0.22}" cy="${y - r * 0.22}" r="${r * 0.2}" fill="#1f7a45" opacity="0.85"/>`
    );
  }

  function tongFaceSvg(rank) {
    const dots = TONG_DOTS[rank] || TONG_DOTS[1];
    const body = dots.map(([x, y]) => svgDot(x, y, rank === 1 ? 18 : 11)).join('');
    return `<svg class="mj-svg" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
  }

  /** 条：竹节图案（加粗、高对比） */
  function bamStick(x, y0, y1, bird = false) {
    if (bird) {
      return (
        `<ellipse cx="${x}" cy="36" rx="16" ry="12" fill="#0f6a30"/>`
        + `<ellipse cx="${x - 3}" cy="32" rx="5" ry="4" fill="#1a8a42" opacity="0.6"/>`
        + `<path d="M${x - 10} 36 Q${x} 18 ${x + 12} 34" stroke="#084820" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
        + `<line x1="${x}" y1="46" x2="${x}" y2="86" stroke="#0f6a30" stroke-width="7" stroke-linecap="round"/>`
        + `<line x1="${x - 5.5}" y1="58" x2="${x + 5.5}" y2="58" stroke="#084820" stroke-width="2.2"/>`
        + `<line x1="${x - 5.5}" y1="72" x2="${x + 5.5}" y2="72" stroke="#084820" stroke-width="2.2"/>`
      );
    }
    const mid = (y0 + y1) / 2;
    return (
      `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#0f6a30" stroke-width="7.2" stroke-linecap="round"/>`
      + `<line x1="${x - 6}" y1="${mid - 9}" x2="${x + 6}" y2="${mid - 9}" stroke="#084820" stroke-width="2.2"/>`
      + `<line x1="${x - 6}" y1="${mid + 9}" x2="${x + 6}" y2="${mid + 9}" stroke="#084820" stroke-width="2.2"/>`
    );
  }

  function tiaoFaceSvg(rank) {
    let body = '';
    if (rank === 1) body = bamStick(50, 20, 84, true);
    else if (rank === 2) body = bamStick(38, 18, 84) + bamStick(62, 18, 84);
    else if (rank === 3) body = bamStick(28, 18, 84) + bamStick(50, 18, 84) + bamStick(72, 18, 84);
    else if (rank === 4) {
      body = bamStick(35, 16, 48) + bamStick(65, 16, 48) + bamStick(35, 54, 86) + bamStick(65, 54, 86);
    } else if (rank === 5) {
      body = bamStick(30, 14, 46) + bamStick(70, 14, 46) + bamStick(50, 38, 62)
        + bamStick(30, 56, 88) + bamStick(70, 56, 88);
    } else if (rank === 6) {
      for (const x of [30, 50, 70]) {
        body += bamStick(x, 14, 48) + bamStick(x, 54, 88);
      }
    } else if (rank === 7) {
      body = bamStick(28, 12, 42) + bamStick(50, 12, 42) + bamStick(72, 12, 42)
        + bamStick(50, 40, 58)
        + bamStick(28, 60, 90) + bamStick(50, 60, 90) + bamStick(72, 60, 90);
    } else if (rank === 8) {
      for (const x of [32, 52, 68]) {
        /* 2 cols of 4 is more accurate as 2x4 */
      }
      for (const x of [35, 65]) {
        body += bamStick(x, 12, 30) + bamStick(x, 34, 52) + bamStick(x, 56, 74) + bamStick(x, 76, 92);
      }
    } else {
      for (const x of [28, 50, 72]) {
        body += bamStick(x, 12, 38) + bamStick(x, 42, 66) + bamStick(x, 70, 92);
      }
    }
    return `<svg class="mj-svg" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
  }

  /** 万：红字传统「一/萬」— SVG 矢量放大，字迹更锐利 */
  const WAN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const MJ_FONT = '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif';
  function wanFaceHtml(rank) {
    const n = WAN_NUM[rank] || String(rank);
    return (
      `<svg class="mj-svg mj-wan-svg" viewBox="0 0 100 100" aria-hidden="true">`
      + `<text x="50" y="44" text-anchor="middle" dominant-baseline="middle"`
      + ` font-size="48" font-weight="900" fill="#b01010" stroke="#8a0a0a" stroke-width="0.6"`
      + ` paint-order="stroke fill" font-family='${MJ_FONT}'>${n}</text>`
      + `<text x="50" y="82" text-anchor="middle" dominant-baseline="middle"`
      + ` font-size="42" font-weight="900" fill="#b01010" stroke="#8a0a0a" stroke-width="0.55"`
      + ` paint-order="stroke fill" font-family='${MJ_FONT}'>萬</text>`
      + `</svg>`
    );
  }

  const WIND_ZI = ['', '東', '南', '西', '北'];
  function windFaceHtml(rank) {
    const ch = WIND_ZI[rank] || '';
    return (
      `<svg class="mj-svg mj-zi-svg" viewBox="0 0 100 100" aria-hidden="true">`
      + `<text x="50" y="58" text-anchor="middle" dominant-baseline="middle"`
      + ` font-size="68" font-weight="900" fill="#121212" stroke="#000" stroke-width="0.7"`
      + ` paint-order="stroke fill" font-family='${MJ_FONT}'>${ch}</text>`
      + `</svg>`
    );
  }

  function dragFaceHtml(rank) {
    if (rank === 1) {
      return (
        `<svg class="mj-svg mj-zi-svg" viewBox="0 0 100 100" aria-hidden="true">`
        + `<text x="50" y="58" text-anchor="middle" dominant-baseline="middle"`
        + ` font-size="72" font-weight="900" fill="#b01010" stroke="#8a0a0a" stroke-width="0.7"`
        + ` paint-order="stroke fill" font-family='${MJ_FONT}'>中</text>`
        + `</svg>`
      );
    }
    if (rank === 2) {
      return (
        `<svg class="mj-svg mj-fa-svg" viewBox="0 0 100 100" aria-hidden="true">`
        + `<text x="50" y="58" text-anchor="middle" dominant-baseline="middle"`
        + ` font-size="70" font-weight="900" fill="#0d6a2e" stroke="#084820" stroke-width="0.7"`
        + ` paint-order="stroke fill" font-family='${MJ_FONT}'>發</text>`
        + `</svg>`
      );
    }
    // 白板
    return (
      `<span class="mj-print mj-print-bai">`
      + `<span class="mj-bai-box"></span>`
      + `</span>`
    );
  }

  /** 传统印刷麻将牌面（参考标准万条筒字）+ 品牌角标 BTC */
  function tileFaceHtml(tile) {
    if (!tile) return '';
    const ad = brandTileBadgeHtml();
    const sc = tileSuitClass(tile);
    if (tile.suit === 0) {
      return `<span class="mj-face ${sc} mj-face-print">${wanFaceHtml(tile.rank)}${ad}</span>`;
    }
    if (tile.suit === 1) {
      return `<span class="mj-face ${sc} mj-face-print">${tiaoFaceSvg(tile.rank)}${ad}</span>`;
    }
    if (tile.suit === 2) {
      return `<span class="mj-face ${sc} mj-face-print">${tongFaceSvg(tile.rank)}${ad}</span>`;
    }
    if (tile.suit === 3) {
      return `<span class="mj-face ${sc} mj-face-print">${windFaceHtml(tile.rank)}${ad}</span>`;
    }
    if (tile.suit === 4) {
      const zi = tile.rank === 1 ? ' mj-zhong' : tile.rank === 2 ? ' mj-fa' : ' mj-bai';
      return `<span class="mj-face ${sc} mj-face-print${zi}">${dragFaceHtml(tile.rank)}${ad}</span>`;
    }
    return `<span class="mj-face">${tileName(tile)}${ad}</span>`;
  }

  function scheduleAi() {
    stopAi();
    if (!table || opening) return;
    const snap = table.snapshot();
    if (snap.phase === 'settle') {
      showSettle(snap);
      return;
    }
    // 换三张 / 定缺：等真人操作
    if (snap.phase === 'exchange' || snap.phase === 'dingque') return;
    if (snap.phase === 'call') return;
    if (snap.current === 0) return;
    if (snap.phase !== 'discard' && snap.phase !== 'draw') return;
    if (snap.status?.[snap.current] === PlayerStatus.HU_OUT) return;
    if (moveCount > 600) {
      if (el.status) el.status.textContent = '本局过长，已结束';
      return;
    }

    aiTimer = setTimeout(() => {
      if (!table) return;
      const s = table.snapshot();
      if (s.phase === 'settle') {
        render();
        showSettle(s);
        return;
      }
      if (s.current === 0 || s.phase === 'call' || s.phase === 'exchange' || s.phase === 'dingque') {
        render();
        return;
      }
      if (s.status?.[s.current] === PlayerStatus.HU_OUT) {
        render();
        scheduleAi();
        return;
      }
      const dec = decideMahjongDiscard(s, s.current);
      if (!dec) {
        const id = s.hands[s.current]?.[0]?.id;
        if (id) table.discard(s.current, id);
      } else if (dec.action === 'hu') {
        const r = table.huSelf(s.current);
        if (!r.ok) {
          const id = s.hands[s.current]?.[0]?.id;
          if (id) table.discard(s.current, id);
        }
      } else if (dec.action === 'gang') {
        const r = table.gangSelf(s.current, {
          type: dec.type === 'ming_bu' ? 'ming_bu' : 'an',
          tile: dec.tile,
        });
        if (!r.ok) {
          const id = s.hands[s.current]?.[0]?.id;
          if (id) table.discard(s.current, id);
        }
      } else {
        let r = table.discard(s.current, dec.tileId);
        if (!r.ok) {
          const id = s.hands[s.current]?.[0]?.id;
          if (id) table.discard(s.current, id);
        }
      }
      moveCount += 1;
      selected = null;
      render();
      scheduleAi();
    }, 380 + Math.random() * 280);
  }

  function statusBadge(status, missing) {
    const parts = [];
    if (status === PlayerStatus.HU_OUT) parts.push('已胡·退场');
    else if (status === PlayerStatus.HU_STAY) parts.push('已胡·留场');
    if (missing != null && missing >= 0 && missing <= 2) parts.push(`缺${suitLabel(missing)}`);
    return parts.length ? parts.join(' · ') : '';
  }

  function render() {
    if (!table || opening) return;
    const snap = table.snapshot();
    if (el.title) el.title.textContent = roomLabel;
    if (el.sub) {
      const scoreHint = snap.isSichuan
        ? ` · 积分 ${snap.scores?.[0] >= 0 ? '+' : ''}${snap.scores?.[0] ?? 0}`
        : '';
      el.sub.textContent = `${snap.modeName} · 底分 ${snap.stake}${scoreHint}`;
    }
    renderWalls(snap.wallLeft, snap.playerCount);
    const goldEl = document.getElementById('mjGold');
    const srcGold = document.getElementById('ingotBalance');
    if (goldEl && srcGold) goldEl.textContent = srcGold.textContent;
    if (el.status) {
      if (snap.phase === 'settle') {
        const reason = snap.finishedReason;
        if (snap.winner < 0 || reason === 'wall_empty') {
          el.status.textContent = '流局';
        } else if (snap.huOrder?.length > 1) {
          el.status.textContent = `本局结束 · 胡序 ${snap.huOrder.map((i) => snap.names[i]).join('→')}`;
        } else {
          el.status.textContent = `${snap.names[snap.winner]} 胡牌！`;
        }
      } else if (snap.phase === 'exchange') {
        const n = (snap.exchangeSelected || []).length;
        el.status.textContent = `换三张：点选 3 张同花色（已选 ${n}/3）`;
      } else if (snap.phase === 'dingque') {
        el.status.textContent = '定缺：选择不要的一门（万/条/筒）';
      } else if (snap.phase === 'call') {
        el.status.textContent = '可碰/杠/胡，或点过';
      } else if (snap.current === 0) {
        el.status.textContent = snap.canHuSelf
          ? '可自摸胡，或点选一张打出'
          : '点选一张麻将打出（可双击）';
      } else {
        el.status.textContent = `等待 ${snap.names[snap.current]}…`;
      }
    }

    for (let i = 0; i < 4; i++) {
      const s = el.seats[i];
      if (!s.panel || i >= snap.playerCount) continue;
      const st = snap.status?.[i];
      const isTurn = snap.current === i
        && snap.phase !== 'settle'
        && snap.phase !== 'exchange'
        && snap.phase !== 'dingque'
        && st !== PlayerStatus.HU_OUT;
      const isDealer = snap.dealer === i;
      s.panel.classList.toggle('is-turn', isTurn);
      s.panel.classList.toggle('is-winner', (snap.huOrder || []).includes(i) || snap.winner === i);
      s.panel.classList.toggle('is-dealer', isDealer);
      if (s.meta) {
        const melds = (snap.melds[i] || []).length;
        const me = i === 0 ? '（我）' : '';
        const badge = statusBadge(st, snap.missingSuits?.[i]);
        const n = snap.counts[i] ?? 0;
        const sc = snap.scores?.[i];
        const scTxt = typeof sc === 'number' ? `${sc >= 0 ? '+' : ''}${sc}` : '—';
        // 完整分行：昵称 / 张数 / 状态 / 积分（不省略）
        const lines = [
          `<strong title="${snap.names[i]}">${isDealer ? '<em class="mj-dealer-tag">庄</em>' : ''}${snap.names[i]}${me}</strong>`,
          `<span class="mg-meta-line mg-meta-count">${n}张</span>`,
        ];
        if (badge) lines.push(`<span class="mg-meta-line mg-meta-status">${badge}</span>`);
        if (melds) lines.push(`<span class="mg-meta-line">副露${melds}</span>`);
        if (isTurn) lines.push(`<span class="mg-meta-line mg-meta-turn">出牌中</span>`);
        lines.push(`<span class="mg-meta-score">积分 ${scTxt}</span>`);
        s.meta.innerHTML = lines.join('');
      }
      // 张数已在 meta 中完整展示，角标隐藏避免重复裁切
      if (s.count) {
        s.count.hidden = true;
        s.count.setAttribute('hidden', '');
        s.count.textContent = '';
      }
      if (s.play) {
        const last = snap.lastDiscard;
        if (last && last.player === i) {
          s.play.innerHTML =
            `<span class="mg-tile mj-tile ${tileSuitClass(last.tile)} mj-just-out" title="刚打出 · ${last.name}">${tileFaceHtml(last.tile)}</span>`;
        } else {
          s.play.innerHTML = '';
        }
      }
    }

    if (el.center) {
      const all = snap.discards || [];
      const total = all.length;
      let phaseTip = snap.modeName;
      if (snap.phase === 'exchange') phaseTip = '换三张';
      else if (snap.phase === 'dingque') phaseTip = '定缺';
      const nSeats = snap.playerCount || 4;
      // 按座位分区：谁打的一目了然
      const bySeat = Array.from({ length: nSeats }, () => []);
      for (const d of all) {
        if (d.player >= 0 && d.player < nSeats) bySeat[d.player].push(d);
      }
      // 展示顺序：对家 → 左/右 → 自己（四人）或 对家 → 自己（二人）
      const seatOrder = nSeats === 2 ? [1, 0] : [2, 1, 3, 0];
      const seatShort = (i) => {
        if (i === 0) return '我';
        const nm = snap.names[i] || `座${i}`;
        return nm.length > 3 ? nm.slice(-2) : nm;
      };
      const emptyTip = snap.phase === 'exchange'
        ? '请选择 3 张同花色换出'
        : snap.phase === 'dingque'
          ? '请选择定缺花色'
          : '暂无弃牌 · 开打后按座位分区显示';
      const rowsHtml = total
        ? seatOrder.filter((i) => i < nSeats).map((seat) => {
          const tiles = bySeat[seat] || [];
          const lastId = snap.lastDiscard?.player === seat
            ? (snap.lastDiscard.tile?.id ?? null)
            : null;
          const tilesHtml = tiles.length
            ? tiles.map((d, idx) => {
              const isLast = lastId != null && d.tile?.id === lastId && idx === tiles.length - 1;
              return (
                `<span class="mg-tile mj-tile mj-discard-tile ${tileSuitClass(d.tile)}${isLast ? ' is-last-out' : ''}" `
                + `data-seat="${seat}" title="${snap.names[seat]} · ${d.name}">${tileFaceHtml(d.tile)}</span>`
              );
            }).join('')
            : '<span class="mj-river-empty">—</span>';
          return (
            `<div class="mj-river-row seat-${seat}${snap.current === seat ? ' is-current' : ''}" data-river-seat="${seat}">`
            + `<span class="mj-river-name" title="${snap.names[seat]}">${seatShort(seat)}`
            + `<em>${tiles.length}</em></span>`
            + `<div class="mj-river-tiles">${tilesHtml}</div>`
            + `</div>`
          );
        }).join('')
        : `<div class="muted mg-empty-tip">${emptyTip}</div>`;
      el.center.innerHTML =
        `<div class="mg-last-cards mg-tiles mj-discard-board">${rowsHtml}</div>`;
    }

    if (el.hand) {
      const hand = snap.hands[0] || [];
      const exSel = new Set(snap.exchangeSelected || []);
      const canDiscard = snap.current === 0 && snap.phase === 'discard';
      const canExchange = snap.phase === 'exchange';
      const canClick = canDiscard || canExchange;
      el.hand.innerHTML = hand
        .map((c) => {
          const name = tileName(c);
          const sc = tileSuitClass(c);
          const isSel = canExchange ? exSel.has(c.id) : selected === c.id;
          const miss = snap.missingSuits?.[0];
          const isQue = miss != null && miss >= 0 && miss <= 2 && c.suit === miss;
          return (
            `<button type="button" class="mg-hand-tile mj-tile ${sc} ${isSel ? 'selected' : ''}${isQue ? ' mj-que' : ''}" `
            + `data-tile-id="${c.id}" ${canClick ? '' : 'disabled'} title="${name}${isQue ? '（缺）' : ''}">${tileFaceHtml(c)}</button>`
          );
        })
        .join('');
      el.hand.querySelectorAll('[data-tile-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!canClick) return;
          const id = btn.getAttribute('data-tile-id');
          if (canExchange) {
            const r = table.toggleExchangeTile(id);
            if (!r.ok && r.reason === 'same_suit') {
              if (el.status) el.status.textContent = '换三张须同花色 3 张';
            } else if (!r.ok && r.reason === 'max_3') {
              if (el.status) el.status.textContent = '最多选 3 张，可点已选牌取消';
            }
            render();
            return;
          }
          selected = id;
          render();
        });
        btn.addEventListener('dblclick', () => {
          if (!canDiscard) return;
          selected = btn.getAttribute('data-tile-id');
          onDiscard();
        });
      });
    }

    if (el.actions) {
      if (snap.phase === 'settle') {
        el.actions.hidden = true;
        el.actions.innerHTML = '';
        if (el.settleRow) el.settleRow.hidden = false;
      } else if (snap.phase === 'exchange') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const n = (snap.exchangeSelected || []).length;
        el.actions.innerHTML =
          `<button type="button" class="qq-btn qq-btn-gold" data-mj-act="confirm-ex" ${n === 3 ? '' : 'disabled'}>确认换三张</button>`
          + '<button type="button" class="qq-btn qq-btn-blue" data-mj-act="auto-ex">智能推荐</button>';
        el.actions.querySelector('[data-mj-act="confirm-ex"]')?.addEventListener('click', () => {
          const r = table.confirmExchange();
          if (!r.ok) {
            if (el.status) el.status.textContent = `无法换牌（${r.reason || ''}）`;
            return;
          }
          render();
        });
        el.actions.querySelector('[data-mj-act="auto-ex"]')?.addEventListener('click', () => {
          const hand = snap.hands[0] || [];
          const cur = [...(snap.exchangeSelected || [])];
          for (const id of cur) table.toggleExchangeTile(id);
          const set = suggestExchangeTiles(hand);
          for (const t of set) table.toggleExchangeTile(t.id);
          render();
        });
      } else if (snap.phase === 'dingque') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        el.actions.innerHTML =
          '<button type="button" class="qq-btn qq-btn-gold" data-mj-dq="0">定缺 · 万</button>'
          + '<button type="button" class="qq-btn qq-btn-gold" data-mj-dq="1">定缺 · 条</button>'
          + '<button type="button" class="qq-btn qq-btn-gold" data-mj-dq="2">定缺 · 筒</button>'
          + '<button type="button" class="qq-btn qq-btn-blue" data-mj-dq="-1">智能定缺</button>';
        el.actions.querySelectorAll('[data-mj-dq]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const suit = Number(btn.getAttribute('data-mj-dq'));
            table.chooseDingque(0, suit);
            selected = null;
            render();
            scheduleAi();
          });
        });
      } else if (snap.phase === 'call' && snap.callOptions) {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        const o = snap.callOptions;
        el.actions.innerHTML =
          (o.canHu ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-hu" data-mj-act="hu">胡</button>' : '')
          + (o.canPeng ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-side" data-mj-act="peng">碰</button>' : '')
          + (o.canGang ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-side" data-mj-act="gang">杠</button>' : '')
          + '<button type="button" class="qq-btn qq-btn-blue mj-btn-qi" data-mj-act="pass">过</button>';
        el.actions.querySelectorAll('[data-mj-act]').forEach((btn) => {
          btn.addEventListener('click', () => {
            table.humanCall(btn.getAttribute('data-mj-act'));
            selected = null;
            moveCount += 1;
            render();
            scheduleAi();
          });
        });
      } else if (snap.current === 0 && snap.phase === 'discard') {
        el.actions.hidden = false;
        if (el.settleRow) el.settleRow.hidden = true;
        el.actions.innerHTML =
          (snap.canHuSelf ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-hu" data-mj-act="hu-self">胡</button>' : '')
          + (snap.canAnGang ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-side" data-mj-act="an-gang">暗杠</button>' : '')
          + (snap.canBuGang ? '<button type="button" class="qq-btn qq-btn-gold mj-btn-side" data-mj-act="bu-gang">补杠</button>' : '')
          + '<button type="button" class="qq-btn qq-btn-blue mj-btn-qi" data-mj-act="discard">弃</button>';
        el.actions.querySelector('[data-mj-act="discard"]')?.addEventListener('click', onDiscard);
        el.actions.querySelector('[data-mj-act="hu-self"]')?.addEventListener('click', () => {
          const r = table.huSelf(0);
          if (!r.ok) {
            if (el.status) el.status.textContent = '当前不能自摸';
            return;
          }
          render();
          scheduleAi();
        });
        el.actions.querySelector('[data-mj-act="an-gang"]')?.addEventListener('click', () => {
          const r = table.gangSelf(0, { type: 'an' });
          if (!r.ok) {
            if (el.status) el.status.textContent = '无法暗杠';
            return;
          }
          render();
          scheduleAi();
        });
        el.actions.querySelector('[data-mj-act="bu-gang"]')?.addEventListener('click', () => {
          const r = table.gangSelf(0, { type: 'ming_bu' });
          if (!r.ok) {
            if (el.status) el.status.textContent = '无法补杠';
            return;
          }
          render();
          scheduleAi();
        });
      } else {
        el.actions.hidden = true;
        el.actions.innerHTML = '';
        if (el.settleRow) el.settleRow.hidden = true;
      }
    }
  }

  function renderWalls(left, playerCount) {
    const n = Math.max(0, Number(left) || 0);
    const ids = playerCount === 2
      ? ['mjWallN', 'mjWallS']
      : ['mjWallN', 'mjWallW', 'mjWallE', 'mjWallS'];
    const per = Math.floor(n / ids.length);
    const rem = n % ids.length;
    ids.forEach((id, i) => {
      const node = document.getElementById(id);
      if (!node) return;
      const count = Math.min(22, per + (i < rem ? 1 : 0));
      node.innerHTML = Array.from({ length: count }, () => '<i class="mj-wall-tile"></i>').join('');
    });
    ['mjWallN', 'mjWallW', 'mjWallE', 'mjWallS'].forEach((id) => {
      if (ids.includes(id)) return;
      const node = document.getElementById(id);
      if (node) node.innerHTML = '';
    });
    const countEl = document.getElementById('mjWallCount');
    if (countEl) countEl.textContent = String(n);
  }

  function onDiscard() {
    if (!selected) {
      if (el.status) el.status.textContent = '请先点选一张牌';
      return;
    }
    const r = table.discard(0, selected);
    if (!r.ok) {
      if (el.status) el.status.textContent = `无法打出（${r.reason || '错误'}）`;
      return;
    }
    selected = null;
    moveCount += 1;
    render();
    scheduleAi();
  }

  function showSettle(snap) {
    if (el.settleRow) el.settleRow.hidden = false;
    if (el.actions) el.actions.hidden = true;
    const deltas = snap.deltas || snap.scores || [];
    const huSet = new Set(snap.huOrder || (snap.winner >= 0 ? [snap.winner] : []));
    if (el.modalBody) {
      el.modalBody.innerHTML = snap.names
        .map((name, i) => {
          const d = deltas[i] || 0;
          const cls = d > 0 ? 'win' : d < 0 ? 'lose' : '';
          const win = huSet.has(i);
          const order = (snap.huOrder || []).indexOf(i);
          const huLabel = win
            ? (order >= 0 ? `胡${order + 1}` : '胡')
            : (snap.status?.[i] === PlayerStatus.HU_STAY ? '留场' : '—');
          const player = resultPlayerHtml({
            seat: i,
            name,
            isMe: i === 0,
            src: getResultSeatSrc(i),
            badge: win ? '胡' : '',
          });
          return `<tr class="${cls}${win ? ' is-winner' : ''}${i === 0 ? ' is-me' : ''}">`
            + `<td>${player}</td>`
            + `<td>${huLabel}</td>`
            + `<td>${d > 0 ? '+' : ''}${d}</td></tr>`;
        })
        .join('');
    }
    const you = deltas[0] || 0;
    const win = huSet.has(0);
    const isDraw = snap.winner < 0 && !huSet.size;
    if (el.modalTitle) {
      el.modalTitle.textContent = isDraw ? '流局' : win ? '胡牌！' : '本局结束';
    }
    if (el.modalBanner) el.modalBanner.className = `tx-result-banner ${win || you > 0 ? 'win' : 'lose'}`;
    if (el.modalSub) {
      const reasonMap = {
        wall_empty: '牌墙耗尽',
        three_hu: '三家胡牌',
        one_left: '仅剩一家',
        first_hu: '首胡结算',
      };
      const reasonTxt = reasonMap[snap.finishedReason] || '';
      if (isDraw) {
        el.modalSub.textContent = `${snap.modeName} · ${reasonTxt || '流局'}`;
      } else if (snap.huOrder?.length > 1) {
        el.modalSub.textContent =
          `胡序 ${snap.huOrder.map((i) => snap.names[i]).join('→')} · ${snap.modeName} · 底分 ${snap.stake}`;
      } else {
        el.modalSub.textContent =
          `${snap.names[snap.winner] || ''} 胡 · ${snap.modeName} · 底分 ${snap.stake}${reasonTxt ? ` · ${reasonTxt}` : ''}`;
      }
    }
    if (el.modalYou) {
      el.modalYou.textContent =
        isDraw && you === 0 ? '流局无输赢' : you >= 0 ? `你本局 +${you}` : `你本局 ${you}`;
    }
    if (el.modal) {
      el.modal.hidden = false;
      el.modal.removeAttribute('hidden');
    }
    if (!settleReported) {
      settleReported = true;
      opts.onSettle({
        deltas,
        winner: snap.winner,
        winners: snap.huOrder || [],
        roomLabel,
        mode: snap.mode,
      });
    }
  }

  _instance = { start, hide, show, setOptions };
  return _instance;
}
