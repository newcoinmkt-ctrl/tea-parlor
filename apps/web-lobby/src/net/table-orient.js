/** Landscape table: native lock when possible, CSS rotate fallback in portrait Mini Apps. */

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

function physicalLandscape() {
  return (window.innerWidth || 0) > (window.innerHeight || 0);
}

export function syncTableLandscape() {
  const on = isPlayingTable() && isMobileish();
  const root = document.documentElement;
  const body = document.body;
  const tg = window.Telegram?.WebApp;
  root.classList.toggle("table-landscape", on);
  body?.classList.toggle("table-landscape", on);

  if (on) {
    try { tg?.expand?.(); } catch (_) {}
    try { tg?.requestFullscreen?.(); } catch (_) {}
    try { tg?.lockOrientation?.("landscape"); } catch (_) {}
    try { screen.orientation?.lock?.("landscape").catch(() => {}); } catch (_) {}
    try { screen.orientation?.lock?.("landscape-primary").catch(() => {}); } catch (_) {}
  } else {
    try { screen.orientation?.unlock?.(); } catch (_) {}
    try { tg?.unlockOrientation?.(); } catch (_) {}
    try { tg?.exitFullscreen?.(); } catch (_) {}
  }

  const fake = on && !physicalLandscape();
  root.classList.toggle("css-landscape", fake);
  body?.classList.toggle("css-landscape", fake);
  window.dispatchEvent(new Event("table-orient"));
}

export function initTableOrientation() {
  const shell = document.querySelector(".lobby-shell");
  const run = () => {
    try { syncTableLandscape(); } catch (err) { console.warn("[table-orient]", err); }
  };
  run();
  if (shell) {
    new MutationObserver(run).observe(shell, { attributes: true, attributeFilter: ["class"] });
  }
  window.addEventListener("resize", run);
  window.addEventListener("orientationchange", () => setTimeout(run, 80));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", run);
  return run;
}
