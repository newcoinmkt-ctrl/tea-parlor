/**
 * 状态基类 — 各阶段处理器继承此类
 * 状态机通过 enter / exit / handle 调度
 *
 * @typedef {import('./CardGameStateMachine.js').CardGameStateMachine} Machine
 */

export class BaseState {
  /** @param {string} name GamePhase 值 */
  constructor(name) {
    this.name = name;
  }

  /**
   * 进入状态
   * @param {Machine} machine
   * @param {object} [payload]
   */
  enter(_machine, _payload) {}

  /**
   * 离开状态
   * @param {Machine} machine
   */
  exit(_machine) {}

  /**
   * 处理领域事件
   * @param {Machine} machine
   * @param {string} event
   * @param {object} [payload]
   * @returns {{ ok: boolean, reason?: string, data?: object }}
   */
  handle(_machine, event, _payload) {
    return { ok: false, reason: `unhandled_event:${event}_in_${this.name}` };
  }
}
