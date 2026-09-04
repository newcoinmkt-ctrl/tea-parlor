/**
 * 钱包文件持久化 — 影子积分账本的进程重启保护。
 *
 * 设计（评审 P0 #2：钱包纯内存存储，重启丢账本）：
 * - 启动加载：文件存在则 importSnapshot；文件损坏时 fail-fast，
 *   绝不静默以空账本启动（否则每日发放等幂等保护会失效、可被重复领取）。
 * - 变更即落盘：任何非只读方法执行后立即 exportSnapshot 并原子写
 *   （写临时文件 + rename），保证任意时刻崩溃都不丢已确认的流水。
 * - 只读方法不触发写盘。
 *
 * 红线：持久化只做影子积分内部账本，不涉及真实资金/链上资产。
 * 本模块不依赖 index.js（无循环依赖），由 index.js 组合出持久化服务。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SNAPSHOT_SCHEMA_VERSION = 1;

/** 只读方法：调用后不需要落盘 */
const READONLY_METHODS = new Set([
  'getAccount',
  'getUser',
  'queryLedger',
  'queryGoldLedger',
  'listAccounts',
  'listInvitees',
  'listInviteRewardReviews',
  'queryNotifications',
  'queryInviteRiskLogs',
  'getInviteSummary',
  'getDailySupplyStatus',
  'exportSnapshot',
]);

/**
 * 读取钱包快照。文件不存在返回 null；文件损坏抛错（禁止静默降级为空账本）。
 * 返回内层 snapshot（不含包装元信息）。
 */
export function readWalletSnapshot(filePath) {
  if (!existsSync(filePath)) return null;
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`WALLET_SNAPSHOT_UNREADABLE:${error.code || error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('WALLET_SNAPSHOT_CORRUPT');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('WALLET_SNAPSHOT_CORRUPT');
  }
  // 兼容两种格式：带包装 {schemaVersion, snapshot} 与裸 snapshot
  const snapshot = parsed.snapshot ?? parsed;
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('WALLET_SNAPSHOT_CORRUPT');
  }
  return snapshot;
}

/** 原子写快照：先写临时文件再 rename，避免写一半崩溃留下损坏文件 */
export function writeWalletSnapshot(filePath, snapshot) {
  const payload = JSON.stringify({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    snapshot,
  });
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, payload, 'utf8');
  renameSync(tmpPath, filePath);
}

/**
 * 给钱包实例挂上文件持久化，返回持久化代理。
 * 代理与钱包实例接口完全一致，可直接替换使用。
 *
 * @param {object} walletService WalletService 实例
 * @param {string} filePath 快照文件路径
 * @param {{ logger?: (msg: string) => void }} [options]
 */
export function attachFilePersistence(walletService, filePath, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('wallet_persistence_file_required');
  }
  const logger = options.logger || ((message) => console.warn(message));
  const existing = readWalletSnapshot(filePath);
  if (existing) {
    walletService.importSnapshot(existing);
  }

  const flush = () => {
    writeWalletSnapshot(filePath, walletService.exportSnapshot());
  };

  const proxy = new Proxy(walletService, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (typeof prop === 'symbol' || READONLY_METHODS.has(prop)) {
        return value.bind(target);
      }
      return (...args) => {
        const result = value.apply(target, args);
        try {
          flush();
        } catch (error) {
          // 落盘失败不能吞掉：账本写入失败属于可审计红线事故，必须可见
          logger(`[wallet-persistence] flush failed: ${error.message}`);
          throw error;
        }
        return result;
      };
    },
  });

  return Object.assign(proxy, {
    persistence: { filePath, flush, loaded: Boolean(existing) },
  });
}
