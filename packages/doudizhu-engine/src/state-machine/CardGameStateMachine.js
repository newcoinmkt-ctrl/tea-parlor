/**
 * CardGameStateMachine — 斗地主单局核心流程控制器
 *
 * 状态：Waiting → Dealing → Bidding → Doubling → Playing → Settling
 *
 * 用法：
 *   const sm = new CardGameStateMachine({ playTimeoutMs: 15000 });
 *   sm.on((event, data, snapshot) => { ... });
 *   sm.dispatch('startMatch', { force: true });
 *   sm.dispatch('bid', { playerIndex: 0, score: 2 });
 *   sm.dispatch('play', { playerIndex: 0, cards: [...] });
 */

import { GamePhase, canTransition } from './GamePhase.js';
import { createEmptyContext, snapshotContext } from './GameContext.js';
import { TurnTimer } from './TurnTimer.js';
import { WaitingState } from './states/WaitingState.js';
import { DealingState } from './states/DealingState.js';
import { BiddingState } from './states/BiddingState.js';
import { DoublingState } from './states/DoublingState.js';
import { PlayingState } from './states/PlayingState.js';
import { SettlingState } from './states/SettlingState.js';

export { GamePhase } from './GamePhase.js';
export { TurnTimer } from './TurnTimer.js';
export { snapshotContext } from './GameContext.js';

export class CardGameStateMachine {
  /**
   * @param {{
   *   playerNames?: string[],
   *   baseRoomScore?: number,
   *   playTimeoutMs?: number,
   *   bidTimeoutMs?: number,
   *   doubleTimeoutMs?: number,
   *   allowSuperDouble?: boolean,
   *   timerDeps?: ConstructorParameters<typeof TurnTimer>[0],
   * }} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.ctx = createEmptyContext(options);
    this.timer = new TurnTimer(options.timerDeps || {});
    this._listeners = new Set();
    this._transitioning = false;

    /** @type {Map<string, import('./BaseState.js').BaseState>} */
    this._states = new Map([
      [GamePhase.WAITING, new WaitingState()],
      [GamePhase.DEALING, new DealingState()],
      [GamePhase.BIDDING, new BiddingState()],
      [GamePhase.DOUBLING, new DoublingState()],
      [GamePhase.PLAYING, new PlayingState()],
      [GamePhase.SETTLING, new SettlingState()],
    ]);

    /** @type {import('./BaseState.js').BaseState} */
    this._state = this._states.get(GamePhase.WAITING);
    this._state.enter(this, {});
  }

  // ───────── 观察者 ─────────

  /**
   * @param {(event: string, data: object, snapshot: object) => void} fn
   */
  on(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(event, data = {}) {
    this.ctx.eventLog.push({ event, data, t: Date.now() });
    if (this.ctx.eventLog.length > 200) this.ctx.eventLog.shift();
    const snap = this.getSnapshot();
    for (const fn of this._listeners) {
      try {
        fn(event, data, snap);
      } catch (err) {
        // 监听器异常不打断状态机
        console.error('[CardGameStateMachine] listener error', err);
      }
    }
  }

  // ───────── 查询 ─────────

  get phase() {
    return this.ctx.phase;
  }

  get currentPlayerIndex() {
    return this.ctx.currentPlayerIndex;
  }

  get lastPlayHand() {
    return this.ctx.lastPlayHand;
  }

  getSnapshot() {
    return snapshotContext(this.ctx);
  }

  // ───────── 调度 ─────────

  /**
   * 统一事件入口
   * @param {string} event
   * @param {object} [payload]
   */
  dispatch(event, payload = {}) {
    if (this._transitioning) {
      return { ok: false, reason: 'transition_in_progress' };
    }
    return this._state.handle(this, event, payload);
  }

  /**
   * 状态迁移（仅状态对象或内部调用）
   * @param {string} nextPhase
   * @param {object} [payload]
   */
  transitionTo(nextPhase, payload = {}) {
    const from = this.ctx.phase;
    if (from === nextPhase) {
      return { ok: true, reason: 'same_phase' };
    }
    if (!canTransition(from, nextPhase)) {
      this.emit('illegal_transition', { from, to: nextPhase });
      return { ok: false, reason: 'illegal_transition', data: { from, to: nextPhase } };
    }

    const next = this._states.get(nextPhase);
    if (!next) {
      return { ok: false, reason: 'unknown_phase' };
    }

    this._transitioning = true;
    try {
      this._state.exit(this);
      this.ctx.phase = nextPhase;
      this._state = next;
      this.emit('phase_changed', { from, to: nextPhase });
      this._state.enter(this, payload);
    } finally {
      this._transitioning = false;
    }
    return { ok: true, data: { phase: nextPhase } };
  }

  // ───────── 计时器（供状态使用） ─────────

  startPhaseTimer(durationMs, onTimeout) {
    this.timer.start(durationMs, () => {
      // 超时统一走当前状态 handle('timeout') 或直接回调
      if (typeof onTimeout === 'function') onTimeout();
    });
  }

  stopPhaseTimer() {
    this.timer.stop();
  }

  /** 剩余思考时间 */
  getTimerRemainingMs() {
    return this.timer.remainingMs();
  }

  // ───────── 扩展：注册自定义状态 ─────────

  /**
   * 替换或扩展状态实现（开闭原则）
   * @param {string} phase
   * @param {import('./BaseState.js').BaseState} stateInstance
   */
  registerState(phase, stateInstance) {
    this._states.set(phase, stateInstance);
    if (this.ctx.phase === phase) {
      this._state = stateInstance;
    }
  }

  /** 销毁：停表、清监听 */
  dispose() {
    this.stopPhaseTimer();
    this._listeners.clear();
  }
}

export default CardGameStateMachine;
