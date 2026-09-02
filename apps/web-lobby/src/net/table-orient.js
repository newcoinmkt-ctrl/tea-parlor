/** Table viewport: Telegram.WebApp.viewportStableHeight, never 100vh, never CSS-rotate. */

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

export function syncViewportHeight() {
  const root = document.documentElement;
  const tg = window.Telegram?.WebApp;
  const vv = window.visualViewport;
  let h = window.innerHeight || 0;
  try {
    if (tg) {
      tg.ready?.();
      tg.expand?.();
      const inset = tg.safeAreaInset || tg.contentSafeAreaInset || {};
      if (inset.top != null) root.style.setProperty("--safe-top", inset.top + "px");
      if (inset.bottom != null) root.style.setProperty("--safe-bottom", inset.bottom + "px");
      if (tg.viewportStableHeight) h = tg.viewportStableHeight;
    } else if (vv && vv.height) {
      h = vv.height;
    }
  } catch (_) {}
  if (h > 0) {
    const next = Math.round(h) + "px";
    if (root.style.getPropertyValue("--tg-vh") !== next) {
      root.style.setProperty("--tg-vh", next);
    }
  }
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
  const tg = window.Telegram?.WebApp;
  root.classList.toggle("table-landscape", on);
  body?.classList.toggle("table-landscape", on);
  root.classList.toggle("table-portrait-dock", on);
  body?.classList.toggle("table-portrait-dock", on);

  if (on) {
    try { tg?.expand?.(); } catch (_) {}
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
  return run;
}
