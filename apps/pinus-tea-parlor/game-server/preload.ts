import { Promise } from 'bluebird';
import 'reflect-metadata';
import { pinus } from 'pinus';

/**
 * 全局 Promise / sourcemap / 异常捕获（Pinus 标准 preload）
 */
export function preload() {
  (global as any).Promise = Promise as any;
  Promise.config({
    warnings: true,
    longStackTraces: true,
    cancellation: true,
    monitoring: true,
  });

  require('source-map-support').install({
    handleUncaughtExceptions: false,
  });

  process.on('uncaughtException', function (err) {
    console.error(
      pinus.app ? pinus.app.getServerId() : 'unknownServerId',
      'uncaughtException:',
      err,
    );
  });

  process.on('unhandledRejection', (reason: any, p) => {
    console.error(
      pinus.app ? pinus.app.getServerId() : 'unknownServerId',
      'unhandledRejection:',
      p,
      'reason:',
      reason,
    );
  });
}
