export const PLATFORM_USER_ID = 'ops:platform';

export const DEFAULT_REVENUE_POLICY = Object.freeze({
  goldMode: 'base_score',
  seasonPointWinnerRate: 0.01,
  platformUserId: PLATFORM_USER_ID,
  label: '金币局按底分估算服务费；链游测试区仅记录待审核赛季积分事件',
  policy: 'shadow_points_only_pending_review',
});

export function quotePlatformFee({
  currency = 'ingot',
  baseScore = 0,
  winAmount = 0,
  rate = DEFAULT_REVENUE_POLICY.seasonPointWinnerRate,
} = {}) {
  if (currency === 'season_points' || currency === 'crypto') {
    const win = Math.max(0, Number(winAmount) || 0);
    const fee = roundMoney(win * Number(rate || 0), 2);
    return {
      kind: 'season_point_test_fee',
      fee,
      rate: Number(rate || 0),
      baseScore: 0,
      charged: fee > 0,
    };
  }
  const fee = Math.max(0, Number(baseScore) || 0);
  return {
    kind: 'gold_table_fee',
    fee,
    rate: null,
    baseScore: fee,
    charged: fee > 0,
  };
}

export function roundMoney(value, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
