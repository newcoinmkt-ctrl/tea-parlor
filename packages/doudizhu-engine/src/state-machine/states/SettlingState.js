import { BaseState } from '../BaseState.js';
import { GamePhase } from '../GamePhase.js';
import {
  detectSpring,
  calculateMultiplier,
} from '../../settlement.js';
import { calculateFinalMultipliers } from '../../huanle-auction.js';

/**
 * Settling — 结算
 *
 * 公共倍率 shared = baseScore * 2^(bombCount+spring) * baseRoomScore
 * 每条农民线 stake = shared * farmerDouble * landlordDouble
 * 地主总分为两条线之和（农民可因加倍不同而不等额）
 */
export class SettlingState extends BaseState {
  constructor() {
    super(GamePhase.SETTLING);
  }

  enter(machine, payload = {}) {
    const ctx = machine.ctx;
    const winnerIndex = payload.winnerIndex ?? ctx.winnerIndex;
    if (winnerIndex < 0 || winnerIndex > 2) {
      machine.emit('error', { reason: 'invalid_winner' });
      return;
    }
    ctx.winnerIndex = winnerIndex;

    const spring = detectSpring({
      landlordIndex: ctx.landlordIndex,
      winnerIndex,
      turnPlayCount: ctx.turnPlayCount,
    });
    ctx.spring = spring;

    const bombSpringMult = calculateMultiplier({
      baseMultiplier: 1,
      bombCount: ctx.bombCount,
      spring,
    });
    const doubleProduct = ctx.doubleFactors.reduce((a, b) => a * b, 1);

    const result = calculateFinalMultipliers({
      landlordIndex: ctx.landlordIndex,
      winnerIndex,
      baseScore: ctx.baseScore,
      callMultiplier: 1,
      bombCount: ctx.bombCount,
      spring,
      baseRoomScore: ctx.baseRoomScore,
      doubleFactors: ctx.doubleFactors,
      carryScores: payload.carryScores || null,
      idempotencyKey: payload.idempotencyKey || `round_${Date.now()}`,
    });

    ctx.multiplier = result.sharedMultiplier;
    ctx.settlement = {
      idempotencyKey: result.idempotencyKey,
      winnerSide: result.winnerSide,
      winnerIndex,
      landlordIndex: ctx.landlordIndex,
      scores: result.scores.slice(),
      rawScores: result.rawScores.slice(),
      baseScore: ctx.baseScore,
      baseRoomScore: ctx.baseRoomScore,
      multiplier: result.sharedMultiplier,
      spring,
      bombCount: ctx.bombCount,
      unit: result.sharedMultiplier,
      doubleFactors: result.doubleFactors.slice(),
      doubleProduct,
      bombSpringMult,
      lines: result.lines,
      formula: {
        baseScore: ctx.baseScore,
        baseRoomScore: ctx.baseRoomScore,
        bombCount: ctx.bombCount,
        spring,
        doubleProduct,
        sharedMultiplier: result.sharedMultiplier,
        unit: result.sharedMultiplier,
      },
    };
    ctx.winnerSide = result.winnerSide;

    machine.emit('settled', { settlement: ctx.settlement });
  }

  handle(machine, event, payload = {}) {
    switch (event) {
      case 'rematch':
      case 'backToWaiting':
        return machine.transitionTo(GamePhase.WAITING);
      case 'getSettlement':
        return { ok: true, data: machine.ctx.settlement };
      default:
        return super.handle(machine, event, payload);
    }
  }
}
