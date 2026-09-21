/**
 * Pure copy helpers for Dou Dizhu quick-match overlay.
 * Matching stays online-only; local 「人机畅玩」 uses separate entry + wording.
 * play9fin6a: waiting feedback (room/seats/ETA) + retryable failure.
 */

export function isDdzAuthFailureMessage(msg) {
  return /auth/i.test(String(msg || ''));
}

/** Overlay body when quick-match fails (no silent local fallback). */
export function ddzMatchFailureCopy(msg) {
  const text = String(msg || '');
  if (text === 'match_cancelled') return '已取消匹配';
  if (text === 'match_window_skipped') return '匹配窗口异常，请重试';
  if (isDdzAuthFailureMessage(text)) return '登录校验失败，请从 Telegram 打开';
  return '联网匹配失败，请重试（未开人机局）';
}

export function ddzMatchFailureTitle(msg) {
  const text = String(msg || '');
  if (text === 'match_cancelled') return '已取消';
  return '匹配失败';
}

/**
 * Waiting overlay body — clear room + seats + ETA (≤3s AI fill).
 * @param {{ roomLabel?: string, humans?: number, seats?: number, leftMs?: number, status?: string }} opts
 */
export function ddzMatchWaitingCopy(opts = {}) {
  const label = String(opts.roomLabel || '场次').trim() || '场次';
  const seats = Math.max(2, Number(opts.seats) || 3);
  const humans = Math.max(0, Math.min(seats, Number(opts.humans) || 1));
  const leftMs = Number(opts.leftMs);
  const hasEta = Number.isFinite(leftMs) && leftMs >= 0;
  const sec = hasEta ? Math.max(0, Math.ceil(leftMs / 1000)) : null;
  const seatBit = `座位 ${humans}/${seats}`;
  if (sec != null) return `${label} · ${seatBit} · 约 ${sec}s`;
  return `${label} · ${seatBit} · 匹配中…`;
}

export function ddzMatchWaitingTitle() {
  return '匹配中';
}

/** Honest local-entry labels — must not say 匹配 / 匹配中. */
export const DDZ_LOCAL_PLAY_LABEL = '人机畅玩';
export const DDZ_LOCAL_PLAY_HINT = '经典叫分 · 人机畅玩';
