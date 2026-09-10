/** Table viewport: Telegram.WebApp.viewportStableHeight, never 100vh, never CSS-rotate. */

/** Extra bottom clearance so hand/bid sit above TG chat bar + leftover Bot reply keyboard. */
const TG_BOT_KEYBOARD_CLEARANCE_PX = 168;
const MIN_TG_VH_PX = 240;

function isPlayingTable() {
  const shell = document.querySelector(".lobby-shell");
  if (!shell) return false;
  return shell.classList.contains("table-active")
    || shell.classList.contains("texas-active")
    || shell.classList.contains("multi-active");
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
      tg.expand?.();
      const safe = tg.safeAreaInset || {};
      const content = tg.contentSafeAreaInset || {};
      const top = Math.max(readInsetPx(safe, "top"), readInsetPx(content, "top"));
      const bottomInset = Math.max(
        readInsetPx(safe, "bottom"),
        readInsetPx(content, "bottom"),
      );
      // Reply keyboard often overlays Mini App; pad hand/bid above it + chat bar.
      const bottom = Math.max(bottomInset, isPlayingTable() ? TG_BOT_KEYBOARD_CLEARANCE_PX : bottomInset);
      root.style.setProperty("--safe-top", `${top}px`);
      root.style.setProperty("--safe-bottom", `${bottom}px`);
      root.style.setProperty("--tg-keyboard-clearance", `${TG_BOT_KEYBOARD_CLEARANCE_PX}px`);
      const stable = Number(tg.viewportStableHeight) || 0;
      const live = Number(tg.viewportHeight) || 0;
      // Never publish 0/tiny --tg-vh (collapses shell → blank white WebView).
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
  try { tg.disableVerticalSwipes?.(); } catch (_) {}
  syncViewportHeight();
}

export function syncTableLandscape() {
  syncViewportHeight();
  // Class name is historical: product is PORTRAIT Mini App. We still tag
  // html/body so leftover play9 selectors apply, but we never lock landscape
  // or requestFullscreen (those made Telegram stay portrait while CSS waited
  // for a landscape viewport that never came).
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
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", () => setTimeout(run, 80));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", run);
  try { window.Telegram?.WebApp?.onEvent?.("viewportChanged", run); } catch (_) {}
  try { window.Telegram?.WebApp?.onEvent?.("safeAreaChanged", run); } catch (_) {}
  try { window.Telegram?.WebApp?.onEvent?.("contentSafeAreaChanged", run); } catch (_) {}
  return run;
}
