/** Fit overlapping hands/tiles into the visible width for every table game. */

function availableFallback(area) {
  return Math.max(0, area.clientWidth || 0);
}

function padX(el) {
  const s = getComputedStyle(el);
  return (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
}

export function layoutOverlapRow(area, items, opts = {}) {
  const n = items.length;
  if (!area || n === 0) return;
  let available = Math.max(0, area.clientWidth - padX(area));
  if (available < 8) {
    const parent = area.parentElement;
    available = Math.max(0, ((parent && parent.clientWidth) || 0) - padX(area));
  }
  if (available < 8) available = Math.min(360, Math.max(240, window.innerWidth - 24));

  const landscape = document.documentElement.classList.contains("table-landscape")
    || document.documentElement.classList.contains("css-landscape")
    || (window.innerWidth > window.innerHeight);
  const maxW = opts.maxW ?? (landscape ? 56 : 52);
  const minW = opts.minW ?? 22;
  const minPeek = opts.minPeek ?? 12;
  const ratio = opts.ratio ?? 1.45;

  area.style.removeProperty("gap");
  const slots = Math.max(n - 1, 1);
  let peek = Math.max(minPeek, Math.floor((available - minW) / slots));
  let cardW = Math.min(maxW, Math.max(minW, available - slots * peek));
  if (cardW + slots * peek > available) {
    peek = Math.max(8, Math.floor((available - minW) / slots));
    cardW = Math.max(minW, available - slots * peek);
  }
  peek = Math.min(peek, cardW - 2);
  const overlap = Math.max(0, Math.round(cardW - peek));
  const height = Math.round(cardW * ratio);

  area.classList.add("hand-fitted");
  area.style.setProperty("overflow-x", "hidden", "important");
  items.forEach((el, i) => {
    el.style.setProperty("width", cardW + "px", "important");
    el.style.setProperty("min-width", cardW + "px", "important");
    el.style.setProperty("height", height + "px", "important");
    el.style.setProperty("margin-left", i === 0 ? "0px" : "-" + overlap + "px", "important");
    el.style.setProperty("flex", "0 0 " + cardW + "px", "important");
    el.style.setProperty("z-index", String(20 + i), "important");
  });
}

export function layoutGuandanCols(area) {
  const cols = [...area.querySelectorAll(".gd-col")];
  if (!cols.length) return;
  const dock = area.closest(".mg-hand-dock") || area.parentElement || area;
  const dockW = Math.round((dock.getBoundingClientRect && dock.getBoundingClientRect().width) || dock.clientWidth || 0);
  const viewW = Math.max(0, window.innerWidth - 12);
  const available = Math.max(80, Math.min(dockW || availableFallback(area), viewW) - padX(area));
  const n = cols.length;
  const gapN = n > 1 ? 1 : 0;
  const colW = Math.min(32, Math.max(16, Math.floor((available - (n - 1) * gapN) / n)));
  const gap = n > 1 ? Math.max(0, Math.min(2, (available - colW * n) / (n - 1))) : 0;
  area.style.setProperty("gap", gap + "px", "important");
  area.classList.add("hand-fitted");
  cols.forEach((col) => {
    col.style.setProperty("width", colW + "px", "important");
    col.style.setProperty("min-width", "0", "important");
    col.style.setProperty("max-width", colW + "px", "important");
    col.style.setProperty("flex", "1 1 0", "important");
    col.querySelectorAll(".gd-card").forEach((card, i) => {
      card.style.setProperty("width", colW + "px", "important");
      card.style.setProperty("min-width", "0", "important");
      card.style.setProperty("max-width", colW + "px", "important");
      card.style.setProperty("height", Math.round(colW * 1.4) + "px", "important");
      if (i > 0) card.style.setProperty("margin-top", Math.round(-colW * 0.72) + "px", "important");
    });
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
  const run = () => {
    try { fitAllHands(); } catch (err) { console.warn("[hand-fit]", err); }
  };
  run();
  requestAnimationFrame(run);
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", run);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", run);

  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(run, 16);
  });
  ["#handArea", "#mgHand", "#texasHole0", "#tableView", "#multiGameView", "#mgActions"]
    .map((sel) => document.querySelector(sel))
    .filter(Boolean)
    .forEach((el) => obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] }));
  return run;
}
