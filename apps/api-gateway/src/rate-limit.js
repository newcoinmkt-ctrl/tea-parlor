/**
 * 网关内存滑动窗口限流器（评审 P1 #9）。
 *
 * initData 校验带 HMAC 计算成本，登录/邀请等写端点可被脚本刷取，
 * 需要按来源限速。这里实现轻量的固定窗口计数（按 key），足以挡住
 * 单机刷接口；生产多实例部署时应换成 Redis 集中式限流。
 *
 * 红线：限流只做访问控制，不涉及资产或真实资金。
 */
export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 30;
  const clock = options.clock || (() => Date.now());
  const buckets = new Map();

  function consume(key) {
    const nowMs = clock();
    const windowStart = nowMs - (nowMs % windowMs);
    let bucket = buckets.get(key);
    if (!bucket || bucket.windowStart !== windowStart) {
      bucket = { windowStart, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const allowed = bucket.count <= maxRequests;
    return {
      allowed,
      remaining: Math.max(0, maxRequests - bucket.count),
      retryAfterMs: allowed ? 0 : windowStart + windowMs - nowMs,
    };
  }

  // 周期性清理过期桶，防止内存随 key 数无限增长
  function prune() {
    const nowMs = clock();
    const windowStart = nowMs - (nowMs % windowMs);
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.windowStart !== windowStart) buckets.delete(key);
    }
  }
  const pruneInterval = setInterval(prune, Math.max(windowMs, 1000));
  pruneInterval.unref?.();

  return { consume, prune, _buckets: buckets };
}

export function rateLimitKey(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 64) || 'unknown';
  const remote = String(req.socket?.remoteAddress || req.connection?.remoteAddress || '');
  return remote.slice(0, 64) || 'unknown';
}
