/**
 * 可注入的出牌/操作计时器（便于单测替换 clock）
 *
 * 默认使用 setTimeout；测试可传入 { setTimeout, clearTimeout, now }
 */
export class TurnTimer {
  /**
   * @param {{
   *   setTimeout?: typeof setTimeout,
   *   clearTimeout?: typeof clearTimeout,
   *   now?: () => number,
   * }} [deps]
   */
  constructor(deps = {}) {
    this._setTimeout = deps.setTimeout || setTimeout;
    this._clearTimeout = deps.clearTimeout || clearTimeout;
    this._now = deps.now || (() => Date.now());
    this._handle = null;
    this._deadline = 0;
    this._durationMs = 0;
    this._onTimeout = null;
  }

  /**
   * 启动/重置倒计时
   * @param {number} durationMs
   * @param {() => void} onTimeout
   */
  start(durationMs, onTimeout) {
    this.stop();
    this._durationMs = Math.max(0, durationMs | 0);
    this._onTimeout = onTimeout;
    this._deadline = this._now() + this._durationMs;
    if (this._durationMs === 0) {
      // 立即超时（同步调用，避免 re-entrancy 问题时可用 queueMicrotask）
      queueMicrotask(() => {
        if (this._onTimeout === onTimeout) this._fire();
      });
      return;
    }
    this._handle = this._setTimeout(() => this._fire(), this._durationMs);
  }

  stop() {
    if (this._handle != null) {
      this._clearTimeout(this._handle);
      this._handle = null;
    }
    this._onTimeout = null;
    this._deadline = 0;
  }

  /** 剩余毫秒 */
  remainingMs() {
    if (!this._onTimeout) return 0;
    return Math.max(0, this._deadline - this._now());
  }

  isRunning() {
    return this._onTimeout != null;
  }

  _fire() {
    const cb = this._onTimeout;
    this._handle = null;
    this._onTimeout = null;
    this._deadline = 0;
    if (cb) cb();
  }
}
