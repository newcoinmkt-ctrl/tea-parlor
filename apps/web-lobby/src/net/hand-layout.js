/** Fit overlapping hands/tiles into the visible width for every table game. */

function padX(el) {
  const s = getComputedStyle(el);
  return (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
}

/** available = min(dock.width, innerWidth-8) - pad, also capped so last.right <= innerWidth-4. */
function measureHandAvailable(area) {
  const dock = area.closest(".mg-hand-dock, .self-slot, .hand-wrap") || area.parentElement || area;
  const dockRect = (dock.getBoundingClientRect && dock.getBoundingClientRect()) || { width: dock.clientWidth || 0, left: 0, right: 0 };
  const areaRect = (area.getBoundingClientRect && area.getBoundingClientRect()) || dockRect;
  const viewW = Math.max(0, window.innerWidth);
  const pad = padX(area);
  let available = Math.min(dockRect.width || 0, Math.max(0, viewW - 8)) - pad;
  const rightLimit = Math.min(dockRect.right || viewW, viewW - 4);
  const left = areaRect.left || dockRect.left || 0;
  if (rightLimit > left) available = Math.min(available, rightLimit - left);
  if (available < 8) {
    available = Math.max(0, (dock.clientWidth || 0) - pad);
  }
  if (available < 8) available = Math.min(360, Math.max(240, viewW - 24));
  return { available, dock, dockRect, viewW, pad };
}

/**
 * Pack n overlapping cards into `available` px.
 * total = (n-1)*peek + cardW <= available; peek stays >= minPeek when possible.
 */
function packOverlap(n, available, opts = {}) {
  const minW = opts.minW ?? 22;
  const maxW = opts.maxW ?? 52;
  const minPeek = opts.minPeek ?? 12;
  const ratio = opts.ratio ?? 1.45;
  if (n <= 0) return { cardW: minW, peek: minPeek, overlap: 0, height: Math.round(minW * ratio), total: 0 };
  if (n === 1) {
    const cardW = Math.min(maxW, Math.max(minW, Math.floor(available)));
    return { cardW, peek: cardW, overlap: 0, height: Math.round(cardW * ratio), total: cardW };
  }
  const slots = n - 1;
  let cardW = Math.min(maxW, Math.max(minW, Math.floor(available - slots * minPeek)));
  let peek = Math.max(minPeek, Math.floor((available - cardW) / slots));
  peek = Math.min(peek, Math.max(minPeek, cardW - 2));
  if (cardW + slots * peek > available) {
    peek = Math.max(minPeek, Math.floor((available - minW) / slots));
    cardW = Math.max(minW, available - slots * peek);
  }
  if (cardW + slots * peek > available) {
    peek = Math.max(1, Math.floor((available - minW) / slots));
    cardW = Math.max(minW, available - slots * peek);
  }
  const total = cardW + slots * peek;
  const overlap = Math.max(0, Math.round(cardW - peek));
  return { cardW, peek, overlap, height: Math.round(cardW * ratio), total };
}

function applyOverlapItems(items, pack, zBase = 20) {
  items.forEach((el, i) => {
    el.style.setProperty("width", pack.cardW + "px", "important");
    el.style.setProperty("min-width", pack.cardW + "px", "important");
    el.style.setProperty("max-width", pack.cardW + "px", "important");
    el.style.setProperty("height", pack.height + "px", "important");
    el.style.setProperty("margin-top", "0px", "important");
    el.style.setProperty("margin-bottom", "0px", "important");
    el.style.setProperty("margin-left", i === 0 ? "0px" : "-" + pack.overlap + "px", "important");
    el.style.setProperty("flex", "0 0 " + pack.cardW + "px", "important");
    el.style.setProperty("z-index", String(zBase + i), "important");
  });
}

export function layoutOverlapRow(area, items, opts = {}) {
  const n = items.length;
  if (!area || n === 0) return;
  const measured = measureHandAvailable(area);
  let available = measured.available;
  const left = (area.getBoundingClientRect && area.getBoundingClientRect().left) || 0;
  const maxRight = Math.max(0, window.innerWidth - 6);
  if (maxRight > left) available = Math.min(available, maxRight - left);
  const pack = packOverlap(n, available, {
    maxW: opts.maxW ?? 40,
    minW: opts.minW ?? 22,
    minPeek: opts.minPeek ?? 12,
    ratio: opts.ratio ?? 1.45,
  });

  area.style.removeProperty("gap");
  area.classList.add("hand-fitted");
  area.classList.remove("gd-hand-2row");
  area.style.setProperty("display", "flex", "important");
  area.style.setProperty("flex-direction", "row", "important");
  area.style.setProperty("flex-wrap", "nowrap", "important");
  area.style.setProperty("overflow-x", "hidden", "important");
  area.style.setProperty("position", "relative", "important");
  applyOverlapItems(items, pack);
  items.forEach((el) => {
    el.style.removeProperty("position");
    el.style.removeProperty("left");
    el.style.removeProperty("top");
  });
  const last = items[items.length - 1];
  const lastRight = last.getBoundingClientRect ? last.getBoundingClientRect().right : 0;
  const limit = window.innerWidth - 4;
  if (lastRight > limit && n > 1) {
    const overflow = lastRight - limit;
    const peek = Math.max(8, pack.peek - Math.ceil(overflow / (n - 1)));
    const overlap = Math.max(0, pack.cardW - peek);
    items.forEach((el, i) => {
      if (i === 0) return;
      el.style.setProperty("margin-left", "-" + overlap + "px", "important");
    });
  }
}

/**
 * Pure planner for Guandan hero hand rows.
 * Always packs large hands into exactly two balanced overlapping rows (absolute coords).
 * Never emits a lone single-card row when n >= 3.
 */
export function computeGuandanRows(n, available, opts = {}) {
  const minPeek = opts.minPeek ?? 14;
  const minW = opts.minW ?? 28;
  const maxW = opts.maxW ?? 44;
  const ratio = opts.ratio ?? 1.4;
  const leftPad = opts.leftPad ?? 4;
  const rowOverlapY = opts.rowOverlapY ?? 22;
  const selectLift = opts.selectLift ?? 14;
  const usable = Math.max(8, available - leftPad);

  if (n <= 0) {
    return {
      rowCount: 0,
      rows: [],
      packs: [],
      leftPad,
      cardW: minW,
      height: Math.round(minW * ratio),
      areaHeight: 0,
      positions: [],
      lastRight: 0,
    };
  }

  const packOpts = { minW, maxW, minPeek, ratio };
  const onePack = packOverlap(n, usable, packOpts);
  const oneFits = onePack.total <= usable + 0.5;

  // Full Guandan deal (~27) and any hand that won't fit: exactly two rows.
  // n < 4: keep a single row so we never create a length-1 second row.
  let useTwo = n >= 20 || (n >= 4 && !oneFits);
  if (n < 4) useTwo = false;

  /** @type {number[][]} */
  let rows;
  /** @type {ReturnType<typeof packOverlap>[]} */
  let packs;

  if (!useTwo) {
    rows = [Array.from({ length: n }, (_, i) => i)];
    packs = [onePack];
  } else {
    let n1 = Math.ceil(n / 2);
    let n2 = n - n1;
    // Guard: never leave a lone card on its own row when n >= 3.
    if (n2 === 1 && n1 >= 2) {
      n1 -= 1;
      n2 += 1;
    }
    if (n1 === 1 && n2 >= 2) {
      n2 -= 1;
      n1 += 1;
    }
    rows = [
      Array.from({ length: n1 }, (_, i) => i),
      Array.from({ length: n2 }, (_, i) => n1 + i),
    ];
    const p1 = packOverlap(n1, usable, packOpts);
    const p2 = packOverlap(n2, usable, packOpts);
    const cardW = Math.min(p1.cardW, p2.cardW);
    const height = Math.round(cardW * ratio);
    packs = [
      { ...p1, cardW, height, overlap: Math.max(0, cardW - p1.peek), total: cardW + (n1 - 1) * p1.peek },
      { ...p2, cardW, height, overlap: Math.max(0, cardW - p2.peek), total: cardW + (n2 - 1) * p2.peek },
    ];
  }

  const cardW = packs[0].cardW;
  const height = packs[0].height;
  const positions = [];
  let lastRight = leftPad;

  rows.forEach((row, rowIdx) => {
    const pack = packs[rowIdx];
    const top = rowIdx === 0 ? selectLift : selectLift + Math.max(8, height - rowOverlapY);
    row.forEach((cardIndex, i) => {
      const left = leftPad + i * pack.peek;
      positions.push({
        index: cardIndex,
        row: rowIdx,
        left,
        top,
        z: 20 + rowIdx * 40 + i,
        width: pack.cardW,
        height: pack.height,
      });
      lastRight = Math.max(lastRight, left + pack.cardW);
    });
  });

  const areaHeight = (rows.length === 1
    ? selectLift + height
    : selectLift + Math.max(8, height - rowOverlapY) + height) + 4;

  return {
    rowCount: rows.length,
    rows,
    packs,
    leftPad,
    cardW,
    height,
    areaHeight,
    positions,
    lastRight,
    available: usable + leftPad,
  };
}

export function layoutGuandanCols(area) {
  // Only the hero hand. Opponent .gd-card live elsewhere and must not be packed.
  const cards = [...area.querySelectorAll(".gd-card")];
  if (!cards.length) return;

  cards.forEach((card) => {
    if (card.parentElement !== area) area.appendChild(card);
  });
  area.querySelectorAll(".gd-col, .gd-bomb-tag").forEach((el) => el.remove());
  area.querySelectorAll(":scope > .gd-row-break").forEach((el) => el.remove());

  const { available, dock } = measureHandAvailable(area);

  // Prefer CSS dock inset (~56px) over a tight 118px so 14+13 can breathe on 414.
  if (dock && dock.style) {
    dock.style.setProperty("top", "50%", "important");
    dock.style.setProperty("bottom", "calc(52px + env(safe-area-inset-bottom, 0px))", "important");
    dock.style.setProperty("left", "56px", "important");
    dock.style.setProperty("right", "8px", "important");
    dock.style.setProperty("height", "auto", "important");
    dock.style.setProperty("max-height", "50%", "important");
    dock.style.setProperty("display", "flex", "important");
    dock.style.setProperty("flex-direction", "column", "important");
    dock.style.setProperty("justify-content", "flex-end", "important");
    dock.style.setProperty("overflow-x", "hidden", "important");
    dock.style.setProperty("overflow-y", "visible", "important");
  }

  const plan = computeGuandanRows(cards.length, available, {
    minPeek: 14,
    minW: 28,
    maxW: 44,
    ratio: 1.4,
    leftPad: 4,
    rowOverlapY: 22,
    selectLift: 14,
  });

  area.classList.add("hand-fitted");
  area.classList.toggle("gd-hand-2row", plan.rowCount === 2);
  area.style.removeProperty("gap");
  area.style.setProperty("display", "block", "important");
  area.style.setProperty("position", "relative", "important");
  area.style.setProperty("flex-wrap", "nowrap", "important");
  area.style.setProperty("overflow-x", "hidden", "important");
  area.style.setProperty("overflow-y", "visible", "important");
  area.style.setProperty("width", Math.min(available, Math.max(plan.lastRight + 2, 8)) + "px", "important");
  area.style.setProperty("max-width", available + "px", "important");
  area.style.setProperty("height", plan.areaHeight + "px", "important");
  area.style.setProperty("min-height", plan.areaHeight + "px", "important");

  // Absolute placement: selection translateY must not reflow / split rows.
  plan.positions.forEach((pos) => {
    const el = cards[pos.index];
    if (!el) return;
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("left", pos.left + "px", "important");
    el.style.setProperty("top", pos.top + "px", "important");
    el.style.setProperty("width", pos.width + "px", "important");
    el.style.setProperty("min-width", pos.width + "px", "important");
    el.style.setProperty("max-width", pos.width + "px", "important");
    el.style.setProperty("height", pos.height + "px", "important");
    el.style.setProperty("margin", "0px", "important");
    el.style.setProperty("flex", "none", "important");
    el.style.setProperty("z-index", String(pos.z), "important");
  });
}

export function layoutTexasHero(area) {
  const cards = [...area.querySelectorAll(".tx-card")];
  if (!cards.length) return;
  const available = Math.max(0, area.clientWidth - padX(area));
  const n = cards.length;
  const w = Math.min(56, Math.max(36, Math.floor((available - 12) / Math.max(n + 0.4, 1))));
  const h = Math.round(w * 1.38);
  cards.forEach((c) => {
    c.style.setProperty("width", w + "px", "important");
    c.style.setProperty("min-width", w + "px", "important");
    c.style.setProperty("height", h + "px", "important");
  });
}

export function fitAllHands(root = document) {
  const handArea = root.querySelector("#handArea");
  if (handArea) {
    const wide = (handArea.clientWidth || 360) > 520;
    layoutOverlapRow(handArea, [...handArea.querySelectorAll(".playing-card")], {
      maxW: wide ? 52 : 40,
      minW: 24,
      minPeek: wide ? 18 : 12,
      ratio: 1.42,
      gap: false,
    });
  }

  const mg = root.querySelector("#mgHand");
  if (mg) {
    if (mg.classList.contains("gd-hand-cols") || mg.querySelector(".gd-col")) {
      layoutGuandanCols(mg);
    } else {
      const items = [...mg.querySelectorAll(".mg-hand-tile, .mj-tile, .mg-hand-card, .bj-card, .mg-card")];
      if (items.length) {
        const isTile = items.some((el) => el.classList.contains("mg-hand-tile") || el.classList.contains("mj-tile"));
        layoutOverlapRow(mg, items, {
          maxW: isTile ? 36 : 40,
          minW: isTile ? 26 : 20,
          minPeek: isTile ? 18 : 12,
          ratio: isTile ? 1.45 : 1.42,
          gap: false,
        });
      }
    }
  }

  root.querySelectorAll(".bj-hand-wrap").forEach((wrap) => {
    const items = [...wrap.querySelectorAll(".mg-card, .bj-card, .playing-card")];
    if (items.length) layoutOverlapRow(wrap, items, { maxW: 44, minW: 28, minPeek: 16, ratio: 1.4 });
  });

  const hero = root.querySelector("#texasHole0") || root.querySelector(".tx-hole-hero");
  if (hero) layoutTexasHero(hero);
}

export function initHandFit() {
  let fitting = false;
  const run = () => {
    if (fitting) return;
    fitting = true;
    try { fitAllHands(); } catch (err) { console.warn("[hand-fit]", err); }
    finally { fitting = false; }
  };
  run();
  requestAnimationFrame(run);
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", run);

  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    if (fitting) return;
    obs._t = setTimeout(run, 32);
  });
  ["#handArea", "#mgHand", "#texasHole0", "#tableView", "#multiGameView", "#mgActions"]
    .map((sel) => document.querySelector(sel))
    .filter(Boolean)
    .forEach((el) => obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] }));
  return run;
}
