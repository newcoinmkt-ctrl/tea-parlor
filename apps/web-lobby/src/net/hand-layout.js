/** Fit overlapping hands/tiles into the visible width for every table game. */

function padX(el) {
  const s = getComputedStyle(el);
  return (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
}

export function layoutOverlapRow(area, items, opts = {}) {
  const n = items.length;
  if (!area || n === 0) return;
  const available = Math.max(0, area.clientWidth - padX(area));
  if (available < 8) return;

  const maxW = opts.maxW ?? 52;
  const minW = opts.minW ?? 28;
  const minPeek = opts.minPeek ?? 18;
  const ratio = opts.ratio ?? 1.45;

  let cardW = Math.min(maxW, Math.max(minW, Math.round(available / Math.min(n, 8))));
  let peek = n === 1 ? cardW : (available - cardW) / (n - 1);
  if (peek > cardW - 2) peek = Math.max(minPeek, cardW - 8);
  if (n > 1 && peek < minPeek) {
    cardW = Math.max(minW, Math.floor(available - (n - 1) * minPeek));
    peek = (available - cardW) / (n - 1);
  }
  peek = Math.max(12, Math.min(peek, cardW - 2));
  const overlap = Math.max(0, Math.round(cardW - peek));
  const height = Math.round(cardW * ratio);

  area.classList.add("hand-fitted");
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
  const available = Math.max(0, area.clientWidth - padX(area));
  const n = cols.length;
  const colW = Math.min(48, Math.max(26, Math.floor((available - (n - 1) * 2) / n)));
  const gap = n > 1 ? Math.max(2, Math.min(6, (available - colW * n) / (n - 1))) : 0;
  area.style.setProperty("gap", gap + "px", "important");
  area.classList.add("hand-fitted");
  cols.forEach((col) => {
    col.style.setProperty("width", colW + "px", "important");
    col.querySelectorAll(".gd-card").forEach((card, i) => {
      card.style.setProperty("width", colW + "px", "important");
      card.style.setProperty("min-width", colW + "px", "important");
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
    layoutOverlapRow(handArea, [...handArea.querySelectorAll(".playing-card")], {
      maxW: 50, minW: 30, minPeek: 18, ratio: 1.46,
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
          maxW: isTile ? 42 : 48,
          minW: isTile ? 26 : 28,
          minPeek: isTile ? 16 : 18,
          ratio: isTile ? 1.28 : 1.42,
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
