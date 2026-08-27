/**
 * 德州扑克 · 公谋协同作弊实时检测
 *
 * - Chip Dumping：关联账号（同 IP/设备）之间频繁主动送筹
 * - Squeeze Fold：对夹击（squeeze）做出不合常理的弃牌
 * - 协同入座、异常让池等
 */

export const CollusionAlertType = Object.freeze({
  MULTI_ACCOUNT_SAME_IP: 'multi_account_same_ip',
  MULTI_ACCOUNT_SAME_DEVICE: 'multi_account_same_device',
  CHIP_DUMPING: 'chip_dumping',
  SQUEEZE_SOFT_FOLD: 'squeeze_soft_fold',
  COORDINATED_ENTRY: 'coordinated_entry',
  SOFT_PLAY: 'soft_play',
});

export const AlertSeverity = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  HIGH: 'high',
  CRITICAL: 'critical',
});

/**
 * @param {{
 *   dumpMinTransfers?: number,
 *   dumpMinAmount?: number,
 *   softFoldMin?: number,
 *   now?: () => number,
 * }} [options]
 */
export function createCollusionDetector(options = {}) {
  const opts = {
    dumpMinTransfers: options.dumpMinTransfers ?? 3,
    dumpMinAmount: options.dumpMinAmount ?? 0,
    softFoldMin: options.softFoldMin ?? 3,
    now: options.now || Date.now,
  };

  /** @type {Map<string, { playerId: string, ip: string, deviceId: string, tableId: string, joinedAt: number }>} */
  const sessions = new Map();
  /** @type {Map<string, Set<string>>} */
  const tables = new Map();
  /** @type {object[]} */
  const events = [];
  /** @type {object[]} */
  const alertLog = [];

  // feeder → beneficiary → { count, amount }
  /** @type {Map<string, Map<string, { count: number, amount: number }>>} */
  const dumpEdges = new Map();

  // pairKey → soft fold count (fold to squeeze involving linked partner)
  /** @type {Map<string, number>} */
  const squeezeFolds = new Map();

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
   * 入座注册
   * @param {{ playerId: string, ip?: string, deviceId?: string, tableId: string, joinedAt?: number }} session
   */
  function registerSession(session) {
    const s = {
      playerId: String(session.playerId),
      ip: session.ip ? String(session.ip) : '',
      deviceId: session.deviceId ? String(session.deviceId) : '',
      tableId: String(session.tableId || ''),
      joinedAt: session.joinedAt ?? opts.now(),
    };
    sessions.set(s.playerId, s);
    if (s.tableId) {
      if (!tables.has(s.tableId)) tables.set(s.tableId, new Set());
      tables.get(s.tableId).add(s.playerId);
    }
    return s;
  }

  function unregisterSession(playerId, tableId) {
    const id = String(playerId);
    const s = sessions.get(id);
    const tid = tableId || s?.tableId;
    if (tid && tables.has(String(tid))) tables.get(String(tid)).delete(id);
    if (s) s.tableId = '';
  }

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
   * 记录牌局事件
   *
   * type 建议：
   *   fold | call | raise | all_in | check | showdown |
   *   transfer | chip_dump | squeeze_fold
   *
   * squeeze 场景：
   *   { type: 'squeeze_fold', playerId, aggressorId, colluderId, tableId,
   *     potOdds?, equity?, invested? }
   *
   * chip dump：
   *   { type: 'chip_dump', playerId: feeder, beneficiaryId, amount, tableId }
   *   或 showdown 中 { type: 'showdown', playerId, winnerId, amount, softPlay: true }
   *
   * @param {object} event
   */
  function recordEvent(event) {
    if (!event?.type || !event?.playerId) return null;
    const row = {
      ...event,
      playerId: String(event.playerId),
      beneficiaryId: event.beneficiaryId != null ? String(event.beneficiaryId) : undefined,
      aggressorId: event.aggressorId != null ? String(event.aggressorId) : undefined,
      colluderId: event.colluderId != null ? String(event.colluderId) : undefined,
      winnerId: event.winnerId != null ? String(event.winnerId) : undefined,
      tableId: event.tableId != null
        ? String(event.tableId)
        : sessions.get(String(event.playerId))?.tableId,
      amount: Number(event.amount) || 0,
      ts: opts.now(),
    };
    events.push(row);
    if (events.length > 8000) events.shift();

    // Chip dumping edges
    if (
      row.type === 'chip_dump'
      || row.type === 'transfer'
      || (row.type === 'showdown' && row.softPlay && row.winnerId)
    ) {
      const feeder = row.playerId;
      const ben = row.beneficiaryId || row.winnerId;
      if (ben && feeder !== ben) {
        if (!dumpEdges.has(feeder)) dumpEdges.set(feeder, new Map());
        const m = dumpEdges.get(feeder);
        const cur = m.get(ben) || { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += row.amount;
        m.set(ben, cur);
      }
    }

    // Soft fold to squeeze：弃给夹击，且与其中一方关联
    if (row.type === 'squeeze_fold' || (row.type === 'fold' && row.squeeze)) {
      const partner = row.colluderId || row.beneficiaryId;
      if (partner) {
        const rel = areLinked(row.playerId, partner);
        if (rel.linked) {
          const k = pairKey(row.playerId, partner);
          squeezeFolds.set(k, (squeezeFolds.get(k) || 0) + 1);
        }
      }
    }

    // 主动弃牌送池（大池 + 低投入 + 关联赢家）
    if (row.type === 'fold' && row.winnerId && row.amount >= opts.dumpMinAmount) {
      const rel = areLinked(row.playerId, row.winnerId);
      if (rel.linked && (row.potOdds == null || row.potOdds < 0.35)) {
        if (!dumpEdges.has(row.playerId)) dumpEdges.set(row.playerId, new Map());
        const m = dumpEdges.get(row.playerId);
        const cur = m.get(row.winnerId) || { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += row.amount || row.pot || 0;
        m.set(row.winnerId, cur);
      }
    }

    return row;
  }

  function findLinkedPairs(tableId) {
    const ids = [...(tables.get(String(tableId)) || [])];
    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const rel = areLinked(ids[i], ids[j]);
        if (rel.linked) pairs.push({ a: ids[i], b: ids[j], by: rel.by });
      }
    }
    return pairs;
  }

  /**
   * 分析单桌
   * @param {string} tableId
   */
  function analyzeTable(tableId) {
    const tid = String(tableId);
    const alerts = [];
    const ids = [...(tables.get(tid) || [])];
    const pairs = findLinkedPairs(tid);

    // 同 IP / 设备多开
    const byIp = new Map();
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
        alerts.push(pushAlert({
          type: CollusionAlertType.MULTI_ACCOUNT_SAME_IP,
          severity: group.length >= 3 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
          message: `同桌同 IP 多开：${group.join(', ')} (${ip})`,
          tableId: tid,
          playerIds: group,
          evidence: { ip, count: group.length },
          score: Math.min(100, 40 + group.length * 20),
        }));
      }
    }
    for (const [dev, group] of byDev) {
      if (group.length >= 2) {
        alerts.push(pushAlert({
          type: CollusionAlertType.MULTI_ACCOUNT_SAME_DEVICE,
          severity: AlertSeverity.CRITICAL,
          message: `同桌同设备多开：${group.join(', ')}`,
          tableId: tid,
          playerIds: group,
          evidence: { deviceId: dev, count: group.length },
          score: Math.min(100, 55 + group.length * 15),
        }));
      }
    }

    // Chip dumping
    for (const { a, b } of pairs) {
      const ab = dumpEdges.get(a)?.get(b);
      const ba = dumpEdges.get(b)?.get(a);
      for (const [feeder, ben, edge] of [
        [a, b, ab],
        [b, a, ba],
      ]) {
        if (!edge) continue;
        if (edge.count >= opts.dumpMinTransfers
          || edge.amount >= opts.dumpMinAmount * opts.dumpMinTransfers) {
          alerts.push(pushAlert({
            type: CollusionAlertType.CHIP_DUMPING,
            severity: edge.count >= opts.dumpMinTransfers * 2
              ? AlertSeverity.CRITICAL
              : AlertSeverity.HIGH,
            message:
              `疑似 Chip Dumping：${feeder} → ${ben} `
              + `${edge.count} 次，合计 ${edge.amount}`,
            tableId: tid,
            playerIds: [feeder, ben],
            evidence: { count: edge.count, amount: edge.amount, direction: `${feeder}->${ben}` },
            score: Math.min(100, 35 + edge.count * 12),
          }));
        }
      }
    }

    // Squeeze soft fold
    for (const { a, b } of pairs) {
      const k = pairKey(a, b);
      const n = squeezeFolds.get(k) || 0;
      if (n >= opts.softFoldMin) {
        alerts.push(pushAlert({
          type: CollusionAlertType.SQUEEZE_SOFT_FOLD,
          severity: AlertSeverity.HIGH,
          message:
            `疑似夹击软弃：关联账号 ${a}↔${b} 在 squeeze 中不合理弃牌 ${n} 次`,
          tableId: tid,
          playerIds: [a, b],
          evidence: { squeezeFolds: n },
          score: Math.min(100, 30 + n * 15),
        }));
      }
    }

    // 协同入座
    for (const { a, b } of pairs) {
      const sa = sessions.get(a);
      const sb = sessions.get(b);
      if (sa?.joinedAt && sb?.joinedAt) {
        const dt = Math.abs(sa.joinedAt - sb.joinedAt);
        if (dt <= 15_000) {
          alerts.push(pushAlert({
            type: CollusionAlertType.COORDINATED_ENTRY,
            severity: AlertSeverity.WARN,
            message: `关联账号协同入座：${a} 与 ${b} 间隔 ${dt}ms`,
            tableId: tid,
            playerIds: [a, b],
            evidence: { deltaMs: dt },
            score: 22,
          }));
        }
      }
    }

    const riskScore = Math.min(
      100,
      Math.round(alerts.reduce((s, a) => s + (a.score || 0) * 0.35, 0))
    );

    return {
      tableId: tid,
      alerts,
      riskScore,
      linkedPairs: pairs,
    };
  }

  /**
   * 实时单事件评估（入桌/弃牌后立即调用）
   * @param {object} event
   * @returns {object[]} 新产生的告警
   */
  function evaluateEvent(event) {
    const before = alertLog.length;
    recordEvent(event);
    if (event.tableId) analyzeTable(event.tableId);
    return alertLog.slice(before);
  }

  return {
    registerSession,
    unregisterSession,
    recordEvent,
    evaluateEvent,
    areLinked,
    analyzeTable,
    getAlerts: () => alertLog.slice(),
    exportState: () => ({
      sessions: [...sessions.entries()],
      tables: [...tables.entries()].map(([k, v]) => [k, [...v]]),
      eventCount: events.length,
      alertCount: alertLog.length,
    }),
    _reset() {
      sessions.clear();
      tables.clear();
      events.length = 0;
      alertLog.length = 0;
      dumpEdges.clear();
      squeezeFolds.clear();
    },
  };
}

/**
 * 无状态：根据会话列表检测同桌多开
 */
export function detectMultiAccountAtTable(sessionList, tableId) {
  const det = createCollusionDetector();
  for (const s of sessionList || []) {
    det.registerSession({ ...s, tableId: s.tableId || tableId });
  }
  return det.analyzeTable(tableId);
}
