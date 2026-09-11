/** Table viewport: Telegram.WebApp.viewportStableHeight, never 100vh, never whole-page CSS-rotate.
 *  play9jj1/jj1b: landscape coordinate stage (width > height), letterbox center-scale into the
 *  Mini App viewport. NEVER rotate #tableView / content (play9v3g FAIL).
 *  Text/cards/buttons stay upright relative to the stage; Ed holds phone landscape to align.
 *  play9jj1b: pin self-slot/felt/avatar absolute-to-stage on every sync (beat position:fixed drift).
 */

/** Extra bottom clearance so hand/bid sit above TG chat bar + leftover Bot reply keyboard. */
const TG_BOT_KEYBOARD_CLEARANCE_PX = 168;
const MIN_TG_VH_PX = 240;

let lastStageKey = '';
let expandedOnce = false;

function isPlayingTable() {
  const shell = document.querySelector(".lobby-shell");
  if (!shell) return false;
  return shell.classList.contains("table-active")
    || shell.classList.contains("texas-active")
    || shell.classList.contains("multi-active");
}

function isDdzTableActive() {
  const shell = document.querySelector(".lobby-shell");
  if (!shell?.classList.contains("table-active")) return false;
  if (shell.classList.contains("texas-active") || shell.classList.contains("multi-active")) return false;
  const tv = document.getElementById("tableView");
  return Boolean(tv && !tv.hidden);
}

function isMobileish() {
  const w = Math.min(window.innerWidth || 400, window.innerHeight || 700);
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
  return coarse || w <= 900 || Boolean(window.Telegram?.WebApp);
}

function readInsetPx(inset, key) {
  if (!inset || inset[key] == null) return 0;
  const n = Number(inset[key]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function syncViewportHeight() {
  const root = document.documentElement;
  const tg = window.Telegram?.WebApp;
  const vv = window.visualViewport;
  let h = window.innerHeight || 0;
  try {
    if (tg) {
      tg.ready?.();
      const safe = tg.safeAreaInset || {};
      const content = tg.contentSafeAreaInset || {};
      const top = Math.max(readInsetPx(safe, "top"), readInsetPx(content, "top"));
      const bottomInset = Math.max(
        readInsetPx(safe, "bottom"),
        readInsetPx(content, "bottom"),
      );
      const bottom = Math.max(bottomInset, isPlayingTable() ? TG_BOT_KEYBOARD_CLEARANCE_PX : bottomInset);
      root.style.setProperty("--safe-top", `${top}px`);
      root.style.setProperty("--safe-bottom", `${bottom}px`);
      root.style.setProperty("--tg-keyboard-clearance", `${TG_BOT_KEYBOARD_CLEARANCE_PX}px`);
      const stable = Number(tg.viewportStableHeight) || 0;
      const live = Number(tg.viewportHeight) || 0;
      const candidate = Math.max(stable, live, h, MIN_TG_VH_PX);
      if (candidate > 0) h = candidate;
    } else if (vv && vv.height) {
      h = vv.height;
    }
  } catch (err) {
    console.warn("[table-orient] viewport", err);
  }
  if (h > 0) {
    const next = `${Math.round(Math.max(h, MIN_TG_VH_PX))}px`;
    if (root.style.getPropertyValue("--tg-vh") !== next) {
      root.style.setProperty("--tg-vh", next);
    }
  }
}

export function expandTelegramTable() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try { tg.ready?.(); } catch (_) {}
  try { tg.expand?.(); } catch (_) {}
  if (!expandedOnce) {
    expandedOnce = true;
    try { tg.disableVerticalSwipes?.(); } catch (_) {}
  }
  syncViewportHeight();
}

function clearPinnedJjZones(tv) {
  if (!tv) return;
  const slot = tv.querySelector(".self-slot");
  if (slot) {
    ["position", "top", "left", "right", "bottom", "width", "height", "z-index", "padding", "padding-bottom", "inset"].forEach((k) => {
      slot.style.removeProperty(k);
    });
  }
  const bar = tv.querySelector(".qq-bottom-bar");
  if (bar) {
    ["position", "top", "left", "right", "bottom", "width", "height", "z-index", "inset", "padding"].forEach((k) => {
      bar.style.removeProperty(k);
    });
  }
  const felt = tv.querySelector(".ddz-table.qq-felt, .ddz-table");
  if (felt) {
    ["position", "top", "left", "right", "bottom", "width", "height", "inset", "display"].forEach((k) => {
      felt.style.removeProperty(k);
    });
  }
  tv.querySelectorAll(".side-slot.left-slot, .side-slot.right-slot").forEach((el) => {
    ["position", "top", "left", "right", "bottom", "inset"].forEach((k) => el.style.removeProperty(k));
  });
}

/** Pin HUD children absolute-to-stage so table-play position:fixed + safe-area cannot drift. */
function pinJjZoneGeometry(tv) {
  if (!tv) return;
  const felt = tv.querySelector(".ddz-table.qq-felt, .ddz-table");
  if (felt) {
    felt.style.setProperty("position", "absolute", "important");
    felt.style.setProperty("inset", "0", "important");
    felt.style.setProperty("top", "0", "important");
    felt.style.setProperty("left", "0", "important");
    felt.style.setProperty("right", "0", "important");
    felt.style.setProperty("bottom", "0", "important");
    felt.style.setProperty("width", "100%", "important");
    felt.style.setProperty("height", "100%", "important");
    felt.style.setProperty("display", "block", "important");
  }
  const slot = tv.querySelector(".self-slot");
  if (slot) {
    slot.style.setProperty("position", "absolute", "important");
    slot.style.setProperty("left", "0", "important");
    slot.style.setProperty("right", "0", "important");
    slot.style.setProperty("bottom", "0", "important");
    slot.style.setProperty("top", "auto", "important");
    slot.style.setProperty("width", "100%", "important");
    slot.style.setProperty("z-index", "20", "important");
    // No safe-area pad — letterbox stage already clears TG chrome
    slot.style.setProperty("padding-bottom", "4px", "important");
  }
  const bar = tv.querySelector(".qq-bottom-bar");
  if (bar) {
    bar.style.setProperty("position", "absolute", "important");
    bar.style.setProperty("left", "8px", "important");
    bar.style.setProperty("bottom", "6px", "important");
    bar.style.setProperty("top", "auto", "important");
    bar.style.setProperty("right", "auto", "important");
    bar.style.setProperty("width", "68px", "important");
    bar.style.setProperty("height", "92px", "important");
    bar.style.setProperty("z-index", "18", "important");
  }
  const left = tv.querySelector(".side-slot.left-slot");
  if (left) {
    left.style.setProperty("position", "absolute", "important");
    left.style.setProperty("top", "16%", "important");
    left.style.setProperty("left", "1.2%", "important");
    left.style.setProperty("right", "auto", "important");
    left.style.setProperty("bottom", "auto", "important");
    left.style.removeProperty("inset");
  }
  const right = tv.querySelector(".side-slot.right-slot");
  if (right) {
    right.style.setProperty("position", "absolute", "important");
    right.style.setProperty("top", "16%", "important");
    right.style.setProperty("right", "1.2%", "important");
    right.style.setProperty("left", "auto", "important");
    right.style.setProperty("bottom", "auto", "important");
    right.style.removeProperty("inset");
  }
}

function clearTableViewGeometry(tv) {
  if (!tv) return;
  clearPinnedJjZones(tv);
  tv.classList.remove("table-stage-land-target", "table-stage-upright-target");
  [
    "position", "top", "left", "right", "bottom", "width", "height",
    "max-width", "max-height", "transform", "transform-origin", "margin",
    "z-index", "overflow",
  ].forEach((k) => tv.style.removeProperty(k));
}

/**
 * DDZ table → landscape coordinate stage (W > H), letterboxed into the viewport.
 * Uses translate + scale only — NEVER apply 90-degree content rotation (play9v3g FAIL).
 * On portrait Mini App the stage is a centered landscape band; Ed holds landscape to align.
 * Idempotent: skips DOM writes when geometry unchanged.
 */
export function syncTableStageLandscape() {
  const root = document.documentElement;
  const body = document.body;
  const tv = document.getElementById("tableView");
  const want = isDdzTableActive() && isMobileish();

  // Drop play9v3h upright-fill class; landscape letterbox is the JJ truth.
  root.classList.remove("table-stage-upright");
  body?.classList.remove("table-stage-upright");
  root.classList.toggle("table-stage-land", want);
  body?.classList.toggle("table-stage-land", want);
  root.classList.toggle("table-stage-jj", want);
  body?.classList.toggle("table-stage-jj", want);

  if (!tv) {
    lastStageKey = '';
    return want;
  }

  if (!want) {
    if (lastStageKey !== 'off') {
      clearTableViewGeometry(tv);
      root.style.removeProperty("--table-stage-w");
      root.style.removeProperty("--table-stage-h");
      root.style.removeProperty("--table-stage-scale");
      root.style.removeProperty("--table-letterbox-pad");
      lastStageKey = 'off';
    }
    return false;
  }

  const vw = Math.max(1, window.innerWidth || 1);
  const vh = Math.max(1, Number.parseFloat(root.style.getPropertyValue("--tg-vh")) || window.innerHeight || 1);

  // Landscape stage matches device long×short edge (always W > H).
  let stageW = Math.round(Math.max(vw, vh));
  let stageH = Math.round(Math.min(vw, vh));
  if (stageW <= stageH) {
    stageW = Math.round(stageH * (16 / 9));
  }
  // Fit entire landscape stage inside viewport (letterbox), no rotate.
  const scale = Math.min(vw / stageW, vh / stageH);
  const key = `jj-land:${stageW}x${stageH}@${scale.toFixed(4)}:${vw}x${vh}`;
  if (key === lastStageKey && tv.classList.contains("table-stage-land-target")) {
    pinJjZoneGeometry(tv);
    return true;
  }
  lastStageKey = key;

  root.style.setProperty("--table-stage-w", `${stageW}px`);
  root.style.setProperty("--table-stage-h", `${stageH}px`);
  root.style.setProperty("--table-stage-scale", String(scale));
  const padY = Math.max(0, (vh - stageH * scale) / 2);
  root.style.setProperty("--table-letterbox-pad", `${Math.round(padY)}px`);

  tv.classList.remove("table-stage-upright-target");
  tv.classList.add("table-stage-land-target");
  tv.style.setProperty("position", "fixed", "important");
  tv.style.setProperty("top", "50%", "important");
  tv.style.setProperty("left", "50%", "important");
  tv.style.setProperty("right", "auto", "important");
  tv.style.setProperty("bottom", "auto", "important");
  tv.style.setProperty("width", `${stageW}px`, "important");
  tv.style.setProperty("height", `${stageH}px`, "important");
  tv.style.setProperty("max-width", "none", "important");
  tv.style.setProperty("max-height", "none", "important");
  tv.style.setProperty("margin", "0", "important");
  // CRITICAL: letterbox via translate+scale ONLY — never rotate
  tv.style.setProperty(
    "transform",
    `translate(-50%, -50%) scale(${scale})`,
    "important",
  );
  tv.style.setProperty("transform-origin", "center center", "important");
  tv.style.setProperty("z-index", "400", "important");
  tv.style.setProperty("overflow", "hidden", "important");
  pinJjZoneGeometry(tv);
  return true;
}

/** @deprecated alias — name kept so call sites compile; letterbox landscape, no rotate. */
export const syncTableStageUpright = syncTableStageLandscape;

export function syncTableLandscape() {
  syncViewportHeight();
  const on = isPlayingTable() && isMobileish();
  const root = document.documentElement;
  const body = document.body;
  root.classList.toggle("table-landscape", on);
  body?.classList.toggle("table-landscape", on);
  root.classList.toggle("table-portrait-dock", on);
  body?.classList.toggle("table-portrait-dock", on);

  if (on) {
    expandTelegramTable();
  }

  root.classList.remove("css-landscape");
  document.body?.classList.remove("css-landscape");

  syncTableStageLandscape();
  window.dispatchEvent(new Event("table-orient"));
}

export function initTableOrientation() {
  const shell = document.querySelector(".lobby-shell");
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    try { syncTableLandscape(); } catch (err) { console.warn("[table-orient]", err); }
    finally { running = false; }
  };
  run();
  if (shell) {
    new MutationObserver(run).observe(shell, { attributes: true, attributeFilter: ["class"] });
  }
  const tv = document.getElementById("tableView");
  if (tv) {
    new MutationObserver(run).observe(tv, { attributes: true, attributeFilter: ["hidden", "class"] });
  }
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", () => setTimeout(run, 80));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", run);
  try { window.Telegram?.WebApp?.onEvent?.("viewportChanged", run); } catch (_) {}
  try { window.Telegram?.WebApp?.onEvent?.("safeAreaChanged", run); } catch (_) {}
  try { window.Telegram?.WebApp?.onEvent?.("contentSafeAreaChanged", run); } catch (_) {}
  return run;
}
