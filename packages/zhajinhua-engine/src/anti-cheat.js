/**
 * 炸金花异常行为检测 · 同 IP/设备多开与协同作弊告警
 *
 * 检测维度：
 *   1. 同桌同 IP / 同设备多开
 *   2. 喂筹码（持续弃牌把池让给关联账号）
 *   3. 透视式比牌（关联账号之间高频比牌且结果一边倒）
 *   4. 关联账号同进同出、胜率异常等
 *
 * 用法：
 *   const det = createCollusionDetector();
 *   det.registerSession({ playerId, ip, deviceId, tableId });
 *   det.recordAction({ ... });
 *   det.analyzeTable(tableId) → { alerts, riskScore }
 */

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

export const AlertType = Object.freeze({
  MULTI_ACCOUNT_SAME_IP: 'multi_account_same_ip',
  MULTI_ACCOUNT_SAME_DEVICE: 'multi_account_same_device',
  CHIP_FEEDING: 'chip_feeding',
  COLLUSIVE_COMPARE: 'collusive_compare',
  COORDINATED_ENTRY: 'coordinated_entry',
  WINRATE_OUTLIER: 'winrate_outlier',
});

export const AlertSeverity = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  HIGH: 'high',
  CRITICAL: 'critical',
});

// ─────────────────────────────────────────────
// 检测器
// ─────────────────────────────────────────────

/**
 * @typedef {object} SessionInfo
 * @property {string} playerId
 * @property {string} [ip]
 * @property {string} [deviceId]
 * @property {string} [tableId]
 * @property {number} [joinedAt]
 * @property {object} [meta]
 */

/**
 * @typedef {object} CheatAlert
 * @property {string} type
 * @property {string} severity
 * @property {string} message
 * @property {string} [tableId]
 * @property {string[]} playerIds
 * @property {object} [evidence]
 * @property {number} ts
 * @property {number} score  0–100 单项风险
 */

/**
 * @param {{
 *   chipFeedFoldThreshold?: number,
 *   comparePairMin?: number,
 *   compareOneSideRatio?: number,
 *   winRateSampleMin?: number,
 *   winRateHigh?: number,
 *   now?: () => number,
 * }} [options]
 */
export function createCollusionDetector(options = {}) {
  const opts = {
    chipFeedFoldThreshold: options.chipFeedFoldThreshold ?? 4,
    comparePairMin: options.comparePairMin ?? 3,
    compareOneSideRatio: options.compareOneSideRatio ?? 0.85,
    winRateSampleMin: options.winRateSampleMin ?? 8,
    winRateHigh: options.winRateHigh ?? 0.82,
    now: options.now || Date.now,
  };

  /** @type {Map<string, SessionInfo>} playerId → session */
  const sessions = new Map();
  /** @type {Map<string, Set<string>>} tableId → playerIds */
  const tables = new Map();
  /** @type {Array<object>} */
  const actions = [];
  /** @type {CheatAlert[]} */
  const alertLog = [];

  // 比牌边对边统计 key = sorted(a,b)
  /** @type {Map<string, { a: string, b: string, n: number, aWins: number, bWins: number }>} */
  const comparePairs = new Map();

  // 弃牌「受益」统计：folder → beneficiary → count
  /** @type {Map<string, Map<string, number>>} */
  const foldTo = new Map();

  // 胜负样本 playerId → { wins, total }
  /** @type {Map<string, { wins: number, total: number }>} */
  const outcomes = new Map();

  function pairKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function pushAlert(alert) {
    const full = {
      ...alert,
      ts: opts.now(),
      playerIds: [...new Set(alert.playerIds || [])],
    };
    alertLog.push(full);
    if (alertLog.length > 500) alertLog.shift();
    return full;
  }

  /**
   * 注册/更新会话（入座时调用）
   * @param {SessionInfo} session
   */
  function registerSession(session) {
    if (!session?.playerId) throw new TypeError('playerId required');
    const s = {
      playerId: String(session.playerId),
      ip: session.ip ? String(session.ip) : '',
      deviceId: session.deviceId ? String(session.deviceId) : '',
      tableId: session.tableId ? String(session.tableId) : '',
      joinedAt: session.joinedAt ?? opts.now(),
      meta: session.meta || {},
    };
    sessions.set(s.playerId, s);
    if (s.tableId) {
      if (!tables.has(s.tableId)) tables.set(s.tableId, new Set());
      tables.get(s.tableId).add(s.playerId);
    }
    return s;
  }

  /**
   * 离桌
   * @param {string} playerId
   * @param {string} [tableId]
   */
  function unregisterSession(playerId, tableId) {
    const id = String(playerId);
    const s = sessions.get(id);
    const tid = tableId || s?.tableId;
    if (tid && tables.has(tid)) {
      tables.get(tid).delete(id);
    }
    // 保留 session 指纹用于跨桌关联，仅清 table
    if (s) s.tableId = '';
  }

  /**
   * 记录牌局动作
   * @param {{
   *   type: string,
   *   playerId: string,
   *   tableId?: string,
   *   targetId?: string,
   *   winnerId?: string,
   *   loserId?: string,
   *   amount?: number,
   *   pot?: number,
   *   beneficiaryId?: string,
   *   meta?: object,
   * }} action
   *
   * type 建议：
   *   fold | bet | raise | compare | showdown | transfer | sit | leave
   */
  function recordAction(action) {
    if (!action?.type || !action?.playerId) return;
    const row = {
      ...action,
      playerId: String(action.playerId),
      targetId: action.targetId != null ? String(action.targetId) : undefined,
      winnerId: action.winnerId != null ? String(action.winnerId) : undefined,
      loserId: action.loserId != null ? String(action.loserId) : undefined,
      beneficiaryId: action.beneficiaryId != null ? String(action.beneficiaryId) : undefined,
      tableId: action.tableId != null ? String(action.tableId) : sessions.get(String(action.playerId))?.tableId,
      ts: opts.now(),
    };
    actions.push(row);
    if (actions.length > 5000) actions.shift();

    // 比牌
    if (row.type === 'compare' && row.winnerId && row.loserId) {
      const a = row.playerId;
      const b = row.targetId || (row.winnerId === a ? row.loserId : row.winnerId);
      if (b) {
        const k = pairKey(a, b);
        let st = comparePairs.get(k);
        if (!st) {
          st = { a: a < b ? a : b, b: a < b ? b : a, n: 0, aWins: 0, bWins: 0 };
          // 统一：st.a = min id 字典序
          const [lo, hi] = a < b ? [a, b] : [b, a];
          st = { a: lo, b: hi, n: 0, aWins: 0, bWins: 0 };
          comparePairs.set(k, st);
        }
        st.n += 1;
        if (row.winnerId === st.a) st.aWins += 1;
        else if (row.winnerId === st.b) st.bWins += 1;
      }
    }

    // 弃牌 → 推断受益人（同桌仍存活的关联号或显式 beneficiary）
    if (row.type === 'fold') {
      const ben = row.beneficiaryId;
      if (ben) {
        if (!foldTo.has(row.playerId)) foldTo.set(row.playerId, new Map());
        const m = foldTo.get(row.playerId);
        m.set(ben, (m.get(ben) || 0) + 1);
      }
    }

    // 结算胜负
    if (row.type === 'showdown' || row.type === 'settle') {
      const pid = row.playerId;
      if (!outcomes.has(pid)) outcomes.set(pid, { wins: 0, total: 0 });
      const o = outcomes.get(pid);
      o.total += 1;
      if (row.winnerId === pid || row.meta?.won) o.wins += 1;
    }

    return row;
  }

  /**
   * 判断两玩家是否「关联」（同 IP 或同设备）
   * @param {string} a
   * @param {string} b
   */
  function areLinked(a, b) {
    const sa = sessions.get(String(a));
    const sb = sessions.get(String(b));
    if (!sa || !sb) return { linked: false, by: [] };
    const by = [];
    if (sa.ip && sb.ip && sa.ip === sb.ip) by.push('ip');
    if (sa.deviceId && sb.deviceId && sa.deviceId === sb.deviceId) by.push('device');
    return { linked: by.length > 0, by };
  }

  /**
   * 同桌关联簇
   * @param {string} tableId
   */
  function findLinkedClusters(tableId) {
    const ids = [...(tables.get(String(tableId)) || [])];
    /** @type {string[][]} */
    const clusters = [];
    const used = new Set();

    // IP 簇
    /** @type {Map<string, string[]>} */
    const byIp = new Map();
    /** @type {Map<string, string[]>} */
    const byDev = new Map();
    for (const id of ids) {
      const s = sessions.get(id);
      if (!s) continue;
      if (s.ip) {
        if (!byIp.has(s.ip)) byIp.set(s.ip, []);
        byIp.get(s.ip).push(id);
      }
      if (s.deviceId) {
        if (!byDev.has(s.deviceId)) byDev.set(s.deviceId, []);
        byDev.get(s.deviceId).push(id);
      }
    }

    for (const [ip, group] of byIp) {
      if (group.length >= 2) {
        clusters.push({ key: `ip:${ip}`, playerIds: group, by: 'ip' });
        group.forEach((g) => used.add(g));
      }
    }
    for (const [dev, group] of byDev) {
      if (group.length >= 2) {
        clusters.push({ key: `device:${dev}`, playerIds: group, by: 'device' });
      }
    }
    return clusters;
  }

  /**
   * 分析单桌，返回告警列表
   * @param {string} tableId
   * @returns {{ tableId: string, alerts: CheatAlert[], riskScore: number, linkedClusters: object[] }}
   */
  function analyzeTable(tableId) {
    const tid = String(tableId);
    /** @type {CheatAlert[]} */
    const alerts = [];
    const clusters = findLinkedClusters(tid);

    // 1) 多开
    for (const c of clusters) {
      if (c.by === 'ip' && c.playerIds.length >= 2) {
        alerts.push(pushAlert({
          type: AlertType.MULTI_ACCOUNT_SAME_IP,
          severity: c.playerIds.length >= 3 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
          message: `同桌检测同 IP 多开：${c.playerIds.join(', ')}`,
          tableId: tid,
          playerIds: c.playerIds,
          evidence: { ip: c.key.replace(/^ip:/, ''), count: c.playerIds.length },
          score: Math.min(100, 40 + c.playerIds.length * 20),
        }));
      }
      if (c.by === 'device' && c.playerIds.length >= 2) {
        alerts.push(pushAlert({
          type: AlertType.MULTI_ACCOUNT_SAME_DEVICE,
          severity: AlertSeverity.CRITICAL,
          message: `同桌检测同设备多开：${c.playerIds.join(', ')}`,
          tableId: tid,
          playerIds: c.playerIds,
          evidence: { deviceId: c.key.replace(/^device:/, ''), count: c.playerIds.length },
          score: Math.min(100, 50 + c.playerIds.length * 20),
        }));
      }
    }

    // 关联玩家集合（扁平）
    const linkedPairs = [];
    const ids = [...(tables.get(tid) || [])];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const rel = areLinked(ids[i], ids[j]);
        if (rel.linked) linkedPairs.push({ a: ids[i], b: ids[j], by: rel.by });
      }
    }

    // 2) 喂筹码：关联对之间 fold 指向
    for (const { a, b } of linkedPairs) {
      const ab = foldTo.get(a)?.get(b) || 0;
      const ba = foldTo.get(b)?.get(a) || 0;
      const feeds = Math.max(ab, ba);
      if (feeds >= opts.chipFeedFoldThreshold) {
        const feeder = ab >= ba ? a : b;
        const receiver = ab >= ba ? b : a;
        alerts.push(pushAlert({
          type: AlertType.CHIP_FEEDING,
          severity: feeds >= opts.chipFeedFoldThreshold * 2 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
          message: `疑似喂筹码：${feeder} 多次弃牌让利 ${receiver}（${feeds} 次）`,
          tableId: tid,
          playerIds: [feeder, receiver],
          evidence: { folds: feeds, direction: `${feeder}->${receiver}` },
          score: Math.min(100, 30 + feeds * 10),
        }));
      }
    }

    // 3) 透视比牌：关联账号之间高频比牌且一边倒
    for (const { a, b } of linkedPairs) {
      const st = comparePairs.get(pairKey(a, b));
      if (!st || st.n < opts.comparePairMin) continue;
      const ratio = Math.max(st.aWins, st.bWins) / st.n;
      if (ratio >= opts.compareOneSideRatio) {
        const dominant = st.aWins >= st.bWins ? st.a : st.b;
        alerts.push(pushAlert({
          type: AlertType.COLLUSIVE_COMPARE,
          severity: AlertSeverity.HIGH,
          message: `疑似协同比牌：${a}↔${b} 共 ${st.n} 次，${dominant} 胜率 ${(ratio * 100).toFixed(0)}%`,
          tableId: tid,
          playerIds: [a, b],
          evidence: {
            compares: st.n,
            aWins: st.aWins,
            bWins: st.bWins,
            oneSideRatio: ratio,
          },
          score: Math.min(100, 35 + Math.floor(ratio * 50) + st.n * 3),
        }));
      }
    }

    // 4) 协同入座：关联账号几乎同时入桌
    for (const { a, b } of linkedPairs) {
      const sa = sessions.get(a);
      const sb = sessions.get(b);
      if (sa?.joinedAt && sb?.joinedAt) {
        const dt = Math.abs(sa.joinedAt - sb.joinedAt);
        if (dt <= 15_000) {
          alerts.push(pushAlert({
            type: AlertType.COORDINATED_ENTRY,
            severity: AlertSeverity.WARN,
            message: `关联账号协同入座：${a} 与 ${b} 间隔 ${dt}ms`,
            tableId: tid,
            playerIds: [a, b],
            evidence: { deltaMs: dt },
            score: 25,
          }));
        }
      }
    }

    // 5) 胜率异常（样本足够）
    for (const id of ids) {
      const o = outcomes.get(id);
      if (!o || o.total < opts.winRateSampleMin) continue;
      const wr = o.wins / o.total;
      // 若与同桌关联号一起且胜率畸高
      const hasLink = linkedPairs.some((p) => p.a === id || p.b === id);
      if (hasLink && wr >= opts.winRateHigh) {
        alerts.push(pushAlert({
          type: AlertType.WINRATE_OUTLIER,
          severity: AlertSeverity.WARN,
          message: `关联账号胜率异常：${id} ${o.wins}/${o.total} = ${(wr * 100).toFixed(1)}%`,
          tableId: tid,
          playerIds: [id],
          evidence: { wins: o.wins, total: o.total, winRate: wr },
          score: Math.min(100, 20 + Math.floor((wr - 0.5) * 100)),
        }));
      }
    }

    const riskScore = Math.min(
      100,
      alerts.reduce((s, a) => s + (a.score || 0) * 0.35, 0)
    );

    return {
      tableId: tid,
      alerts,
      riskScore: Math.round(riskScore),
      linkedClusters: clusters,
      linkedPairs,
    };
  }

  /**
   * 快捷：多开即时检测（入座时）
   * @param {string} tableId
   */
  function checkMultiSeatOnJoin(tableId) {
    return analyzeTable(tableId).alerts.filter(
      (a) =>
        a.type === AlertType.MULTI_ACCOUNT_SAME_IP
        || a.type === AlertType.MULTI_ACCOUNT_SAME_DEVICE
        || a.type === AlertType.COORDINATED_ENTRY
    );
  }

  /**
   * 导出状态（调试/持久化）
   */
  function exportState() {
    return {
      sessions: [...sessions.entries()],
      tables: [...tables.entries()].map(([k, v]) => [k, [...v]]),
      actionCount: actions.length,
      alertCount: alertLog.length,
      comparePairs: [...comparePairs.entries()],
    };
  }

  return {
    registerSession,
    unregisterSession,
    recordAction,
    areLinked,
    findLinkedClusters,
    analyzeTable,
    checkMultiSeatOnJoin,
    getAlerts: () => alertLog.slice(),
    exportState,
    /** 供测试重置 */
    _reset() {
      sessions.clear();
      tables.clear();
      actions.length = 0;
      alertLog.length = 0;
      comparePairs.clear();
      foldTo.clear();
      outcomes.clear();
    },
  };
}

/**
 * 无状态快捷：仅根据会话列表检测同桌多开
 * @param {Array<SessionInfo>} sessionList
 * @param {string} tableId
 */
export function detectMultiAccountAtTable(sessionList, tableId) {
  const det = createCollusionDetector();
  for (const s of sessionList || []) {
    if (String(s.tableId) === String(tableId) || !s.tableId) {
      det.registerSession({ ...s, tableId });
    }
  }
  return det.analyzeTable(tableId);
}
