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
  const { available } = measureHandAvailable(area);
  const landscape = document.documentElement.classList.contains("table-landscape")
    || document.documentElement.classList.contains("css-landscape")
    || (window.innerWidth > window.innerHeight);
  const pack = packOverlap(n, available, {
    maxW: opts.maxW ?? (landscape ? 56 : 52),
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
  applyOverlapItems(items, pack);
}

function ensureRowBreak(area, beforeEl) {
  let br = area.querySelector(":scope > .gd-row-break");
  if (!beforeEl) {
    area.querySelectorAll(".gd-row-break").forEach((el) => el.remove());
    return;
  }
  const host = area;
  if (!br || br.parentElement !== host) {
    if (br) br.remove();
    br = document.createElement("span");
    br.className = "gd-row-break";
    br.setAttribute("aria-hidden", "true");
    host.insertBefore(br, beforeEl);
  } else if (br.nextSibling !== beforeEl) {
    host.insertBefore(br, beforeEl);
  }
  br.style.setProperty("display", "block", "important");
  br.style.setProperty("flex-basis", "100%", "important");
  br.style.setProperty("width", "100%", "important");
  br.style.setProperty("height", "0px", "important");
  br.style.setProperty("margin", "0px", "important");
  br.style.setProperty("padding", "0px", "important");
  br.style.setProperty("border", "0", "important");
  br.style.setProperty("overflow", "hidden", "important");
  br.style.setProperty("pointer-events", "none", "important");
}

export function layoutGuandanCols(area) {
  // Only the hero hand. Opponent .gd-card live elsewhere (y~140) and must not be packed.
  const cards = [...area.querySelectorAll(".gd-card")];
  if (!cards.length) return;

  cards.forEach((card) => {
    if (card.parentElement !== area) area.appendChild(card);
  });
  area.querySelectorAll(".gd-col, .gd-bomb-tag").forEach((el) => el.remove());
  area.querySelectorAll(":scope > .gd-row-break").forEach((el) => el.remove());

  const { available, dock } = measureHandAvailable(area);

  area.style.removeProperty("gap");
  area.style.setProperty("display", "flex", "important");
  area.style.setProperty("flex-direction", "row", "important");
  area.style.setProperty("justify-content", "flex-start", "important");
  area.style.setProperty("align-items", "flex-end", "important");
  area.style.setProperty("align-content", "flex-end", "important");
  area.classList.add("hand-fitted");

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

  const n = cards.length;
  const minPeek = 24;
  const minW = 28;
  const maxW = 44;
  const ratio = 1.4;
  const probe = packOverlap(n, available, { minW, maxW, minPeek, ratio });
  // Prefer 2 overlapping rows over a too-tight single row if n*peek + (cardW-peek) > dock.
  const oneRowNeed = n * minPeek + (probe.cardW - minPeek);
  const twoRows = n > 1 && oneRowNeed > available;

  if (!twoRows) {
    area.classList.remove("gd-hand-2row");
    area.style.setProperty("flex-wrap", "nowrap", "important");
    area.style.setProperty("overflow-x", "hidden", "important");
    const br = area.querySelector(".gd-row-break");
    if (br) br.remove();
    applyOverlapItems(cards, probe);
    return;
  }

  const n1 = Math.ceil(n / 2);
  const n2 = Math.floor(n / 2);
  const row1 = cards.slice(0, n1);
  const row2 = cards.slice(n1);
  const pack1 = packOverlap(n1, available, { minW, maxW, minPeek, ratio });
  const pack2 = n2 ? packOverlap(n2, available, { minW, maxW, minPeek, ratio }) : pack1;
  const cardW = Math.min(pack1.cardW, pack2.cardW);
  const height = Math.round(cardW * ratio);
  const p1 = { ...pack1, cardW, height, overlap: Math.max(0, cardW - pack1.peek) };
  const p2 = { ...pack2, cardW, height, overlap: Math.max(0, cardW - pack2.peek) };

  area.classList.add("gd-hand-2row");
  area.style.setProperty("flex-wrap", "wrap", "important");
  area.style.setProperty("align-content", "flex-end", "important");
  area.style.setProperty("align-items", "flex-end", "important");
  area.style.setProperty("overflow-x", "hidden", "important");
  area.style.setProperty("overflow-y", "visible", "important");
  area.style.setProperty("width", Math.min(available, Math.max(p1.total, p2.total)) + "px", "important");
  area.style.setProperty("max-width", available + "px", "important");
  if (dock && dock.style) {
    dock.style.setProperty("overflow-x", "hidden", "important");
    dock.style.setProperty("overflow-y", "visible", "important");
  }

  applyOverlapItems(row1, p1, 20);
  applyOverlapItems(row2, p2, 20 + n1);
  ensureRowBreak(area, row2[0] || null);
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
          maxW: isTile ? 34 : 40,
          minW: 20,
          minPeek: isTile ? 14 : 12,
          ratio: isTile ? 1.28 : 1.42,
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
