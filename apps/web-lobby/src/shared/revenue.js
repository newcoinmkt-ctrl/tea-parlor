/** 平台抽成：金币局按底分收台费；真金局对赢家净赢利收 1%。 */

export const REVENUE_POLICY = Object.freeze({
  goldMode: 'base_score',
  cryptoWinnerRate: 0.01,
});

export function quotePlatformFee({
  currency = 'ingot',
  baseScore = 0,
  winAmount = 0,
  rate = REVENUE_POLICY.cryptoWinnerRate,
} = {}) {
  if (currency === 'crypto') {
    const win = Math.max(0, Number(winAmount) || 0);
    const fee = Math.round(win * Number(rate || 0) * 100) / 100;
    return { kind: 'crypto_winner_fee', fee, charged: fee > 0 };
  }
  const fee = Math.max(0, Number(baseScore) || 0);
  return { kind: 'gold_table_fee', fee, charged: fee > 0 };
}
