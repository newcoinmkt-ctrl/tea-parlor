/**
 * Touch vs mouse guards for Dou Dizhu hand selection (testable).
 * Mobile WebViews (incl. Telegram Mini App) emit compatibility mouse events after
 * touchstart/touchend. If mousedown also toggles the card, the selection flips
 * back off before click — player cannot keep a raised card or light「出牌」.
 */

/** Ignore synthetic mouse after a real touch within this window (ms). */
export const TOUCH_MOUSE_GUARD_MS = 700;

/**
 * @param {Pick<MouseEvent, 'sourceCapabilities'> | null | undefined} event
 * @param {number} lastTouchTs
 * @param {number} [now]
 * @returns {boolean}
 */
export function shouldIgnoreMouseAfterTouch(event, lastTouchTs, now = Date.now()) {
  if (event?.sourceCapabilities?.firesTouchEvents) return true;
  const ts = Number(lastTouchTs) || 0;
  if (ts > 0 && now - ts < TOUCH_MOUSE_GUARD_MS) return true;
  return false;
}

/**
 * Treat as a tap (not a pan) when movement stays under the threshold.
 * @param {number} dx
 * @param {number} dy
 * @param {number} [thresholdPx=12]
 */
export function isTapGesture(dx, dy, thresholdPx = 12) {
  const t = Math.max(4, Number(thresholdPx) || 12);
  return Math.abs(dx) < t && Math.abs(dy) < t;
}
