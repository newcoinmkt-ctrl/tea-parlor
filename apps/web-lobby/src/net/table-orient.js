/** Table viewport: Telegram.WebApp.viewportStableHeight, never 100vh, never whole-page CSS-rotate.
 *  play9v3h: upright coordinate system — full-viewport JJ zones in portrait.
 *  Never rotate #tableView / content container to fake landscape (play9v3g FAIL).
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

function isPortraitViewport() {
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return h > w + 8;
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

function clearTableViewGeometry(tv) {
  if (!tv) return;
  tv.classList.remove("table-stage-land-target", "table-stage-upright-target");
  [
    "position", "top", "left", "right", "bottom", "width", "height",
    "max-width", "max-height", "transform", "transform-origin", "margin",
  ].forEach((k) => tv.style.removeProperty(k));
}

/**
 * Portrait Mini App → upright full-viewport stage with JJ landscape zones (no rotate).
 * Does NOT rotate #tableView, html, or body. All text/avatars/buttons stay upright to eyes.
 * Idempotent: skips DOM writes when geometry unchanged.
 */
export function syncTableStageLandscape() {
  const root = document.documentElement;
  const body = document.body;
  const tv = document.getElementById("tableView");
  const portrait = isPortraitViewport();
  const want = isDdzTableActive() && isMobileish() && portrait;

  // Drop legacy rotate class from play9v3g
  root.classList.remove("table-stage-land");
  body?.classList.remove("table-stage-land");
  root.classList.toggle("table-stage-upright", want);
  body?.classList.toggle("table-stage-upright", want);

  if (!tv) {
    lastStageKey = '';
    return want;
  }

  if (!want) {
    if (lastStageKey !== 'off') {
      clearTableViewGeometry(tv);
      root.style.removeProperty("--table-stage-w");
      root.style.removeProperty("--table-stage-h");
      root.style.removeProperty("--table-letterbox-pad");
      lastStageKey = 'off';
    }
    return false;
  }

  const vw = Math.max(1, window.innerWidth || 1);
  const vh = Math.max(1, Number.parseFloat(root.style.getPropertyValue("--tg-vh")) || window.innerHeight || 1);
  // Portrait upright fill: use full viewport with JJ zones (never rotate).
  // Strict landscape-aspect letterbox is too short on phones; prefer playable upright HUD.
  const stageW = Math.round(vw);
  const stageH = Math.round(vh);
  const key = `upright-fill:${stageW}x${stageH}`;
  if (key === lastStageKey && tv.classList.contains("table-stage-upright-target")) {
    return true;
  }
  lastStageKey = key;
  root.style.setProperty("--table-stage-w", `${stageW}px`);
  root.style.setProperty("--table-stage-h", `${stageH}px`);
  root.style.setProperty("--table-letterbox-pad", `0px`);
  tv.classList.remove("table-stage-land-target");
  tv.classList.add("table-stage-upright-target");
  tv.style.setProperty("position", "fixed", "important");
  tv.style.setProperty("top", "0", "important");
  tv.style.setProperty("left", "0", "important");
  tv.style.setProperty("right", "0", "important");
  tv.style.setProperty("bottom", "0", "important");
  tv.style.setProperty("width", `${stageW}px`, "important");
  tv.style.setProperty("height", `${stageH}px`, "important");
  tv.style.setProperty("max-width", "none", "important");
  tv.style.setProperty("max-height", "none", "important");
  // CRITICAL: no rotate — upright to user's eyes
  tv.style.setProperty("transform", "none", "important");
  tv.style.removeProperty("transform-origin");
  tv.style.setProperty("z-index", "400", "important");
  // Hide overflow so bottom-bar / char art cannot stray outside stage
  tv.style.setProperty("overflow", "hidden", "important");
  return true;
}

/** @deprecated alias — name kept so call sites compile; no longer rotates. */
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
