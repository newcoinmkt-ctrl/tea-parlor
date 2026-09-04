/**
 * Pure copy helpers for 每日补给 UI (server-authoritative, shadow / non-cash).
 */
export const DAILY_SUPPLY_LIMIT = 4;
export const DAILY_SUPPLY_AMOUNT = 4000;

export const DAILY_SUPPLY_TG_PROMPT = '请从 Telegram 打开茶馆领取每日补给';
export const DAILY_SUPPLY_EXHAUSTED = '今日补给次数已用完';
export const DAILY_SUPPLY_NON_CASH = '影子金币 · 不可提现';

export function formatDailySupplyStatus({ remaining, limit = DAILY_SUPPLY_LIMIT, amount = DAILY_SUPPLY_AMOUNT, hasSession = true } = {}) {
  if (!hasSession) return DAILY_SUPPLY_TG_PROMPT;
  const left = Math.max(0, Number(remaining ?? limit) || 0);
  if (left <= 0) return `${DAILY_SUPPLY_EXHAUSTED} · 明日再来 · ${DAILY_SUPPLY_NON_CASH}`;
  return `今日还可领 ${left}/${limit} 次 · 每次 ${Number(amount).toLocaleString('zh-CN')} · ${DAILY_SUPPLY_NON_CASH}`;
}

export function formatDailySupplyClaimSuccess({ amount = DAILY_SUPPLY_AMOUNT, remaining = 0 } = {}) {
  return `已领取 ${Number(amount).toLocaleString('zh-CN')} 影子金币（不可提现）· 今日剩余 ${Math.max(0, Number(remaining) || 0)} 次`;
}

export function formatDailySupplyExhaustedReason(reason) {
  if (reason === 'daily_supply_exhausted') return '今日补给次数已用完';
  return reason || '领取失败';
}

export function claimButtonLabel({ remaining, amount = DAILY_SUPPLY_AMOUNT, hasSession = true } = {}) {
  if (!hasSession) return '请从 Telegram 打开';
  const left = Math.max(0, Number(remaining) || 0);
  if (left <= 0) return '今日已领完';
  return `领取 ${Number(amount).toLocaleString('zh-CN')}`;
}
