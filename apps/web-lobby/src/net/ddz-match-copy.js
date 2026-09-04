/**
 * Pure copy helpers for Dou Dizhu quick-match overlay.
 * Matching stays online-only; local 「人机畅玩」 uses separate entry + wording.
 */

export function isDdzAuthFailureMessage(msg) {
  return /auth/i.test(String(msg || ''));
}

/** Overlay body when quick-match fails (no silent local fallback). */
export function ddzMatchFailureCopy(msg) {
  const text = String(msg || '');
  if (text === 'match_cancelled') return '已取消匹配';
  if (isDdzAuthFailureMessage(text)) return '登录校验失败，请从 Telegram 打开';
  return '联网匹配失败，请重试（未开人机局）';
}

export function ddzMatchFailureTitle(msg) {
  const text = String(msg || '');
  if (text === 'match_cancelled') return '已取消';
  return '匹配失败';
}

/** Honest local-entry labels — must not say 匹配 / 匹配中. */
export const DDZ_LOCAL_PLAY_LABEL = '人机畅玩';
export const DDZ_LOCAL_PLAY_HINT = '经典叫分 · 人机畅玩';
