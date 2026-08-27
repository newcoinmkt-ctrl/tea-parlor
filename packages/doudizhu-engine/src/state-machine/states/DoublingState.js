import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';

/**
 * Doubling — 加倍阶段
 * 每人可选择 factor: 1（不加倍）或 2（加倍）；可选 4（超级加倍，需 allowSuper）
 * 全部决定后进入 Playing，地主先出
 */
export class DoublingState extends BaseState {
  constructor() {
    super(GamePhase.DOUBLING);
  }

  enter(machine) {
    const ctx = machine.ctx;
    ctx.doubleFactors = [1, 1, 1];
    ctx.doubleDecided = [false, false, false];
    machine.emit('doubling_start', { landlordIndex: ctx.landlordIndex });
    machine.startPhaseTimer(ctx.doubleTimeoutMs, () => this._onTimeout(machine));
  }

  exit(machine) {
    machine.stopPhaseTimer();
  }

  handle(machine, event, payload = {}) {
    switch (event) {
      case 'double':
        return this._double(machine, payload.playerIndex, payload.factor ?? 1);
      case 'timeout':
        return this._onTimeout(machine);
      default:
        return super.handle(machine, event, payload);
    }
  }

  _double(machine, player, factor) {
    const ctx = machine.ctx;
    if (!Number.isInteger(player) || player < 0 || player > 2) {
      return { ok: false, reason: 'invalid_player' };
    }
    if (ctx.doubleDecided[player]) {
      return { ok: false, reason: 'already_doubled' };
    }
    const allowSuper = machine.options.allowSuperDouble === true;
    const legal = allowSuper ? [1, 2, 4] : [1, 2];
    if (!legal.includes(factor)) {
      return { ok: false, reason: 'invalid_double_factor' };
    }

    ctx.doubleFactors[player] = factor;
    ctx.doubleDecided[player] = true;
    machine.emit('double', { playerIndex: player, factor });

    if (ctx.doubleDecided.every(Boolean)) {
      return this._finish(machine);
    }
    return { ok: true };
  }

  _onTimeout(machine) {
    const ctx = machine.ctx;
    // 未决定者默认不加倍
    for (let i = 0; i < 3; i++) {
      if (!ctx.doubleDecided[i]) {
        ctx.doubleFactors[i] = 1;
        ctx.doubleDecided[i] = true;
      }
    }
    return this._finish(machine);
  }

  _finish(machine) {
    const ctx = machine.ctx;
    ctx.currentPlayerIndex = ctx.landlordIndex;
    ctx.lastPlayHand = null;
    ctx.passCount = 0;
    machine.emit('doubling_finished', {
      doubleFactors: ctx.doubleFactors.slice(),
      firstPlayer: ctx.currentPlayerIndex,
    });
    return machine.transitionTo(GamePhase.PLAYING);
  }
}
