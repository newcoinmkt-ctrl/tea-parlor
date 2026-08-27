import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';

/**
 * Waiting — 等待 3 人入座 / 匹配完成
 * 事件: seat, unseat, startMatch
 */
export class WaitingState extends BaseState {
  constructor() {
    super(GamePhase.WAITING);
  }

  enter(machine) {
    const ctx = machine.ctx;
    ctx.settlement = null;
    ctx.winnerIndex = -1;
    ctx.winnerSide = null;
    machine.emit('waiting', { seated: ctx.seated.slice() });
  }

  handle(machine, event, payload = {}) {
    const ctx = machine.ctx;
    switch (event) {
      case 'seat': {
        const i = payload.playerIndex;
        if (!isSeat(i)) return { ok: false, reason: 'invalid_seat' };
        ctx.seated[i] = true;
        if (payload.name) ctx.playerNames[i] = payload.name;
        machine.emit('player_seated', { playerIndex: i });
        if (ctx.seated.every(Boolean) && payload.autoStart !== false) {
          return machine.transitionTo(GamePhase.DEALING);
        }
        return { ok: true, data: { seated: ctx.seated.slice() } };
      }
      case 'unseat': {
        const i = payload.playerIndex;
        if (!isSeat(i)) return { ok: false, reason: 'invalid_seat' };
        ctx.seated[i] = false;
        return { ok: true };
      }
      case 'startMatch': {
        // 强制开局（测试/单机可不满座）
        if (payload.force) {
          ctx.seated = [true, true, true];
        }
        if (!ctx.seated.every(Boolean) && !payload.force) {
          return { ok: false, reason: 'not_enough_players' };
        }
        return machine.transitionTo(GamePhase.DEALING);
      }
      default:
        return super.handle(machine, event, payload);
    }
  }
}

function isSeat(i) {
  return Number.isInteger(i) && i >= 0 && i <= 2;
}
