/**
 * 掼蛋单局结算：接风 + 升级 + 过 A
 */

import { teammateOf, sameTeam } from './tribute.js';

/** 等级：2–14(A) 循环；通关后 finished */
export const LEVEL_A = 14;
export const LEVEL_MIN = 2;

/**
 * 接风：某人打完最后一手后，若无人压牌，下一出牌权给其队友
 *
 * @param {object} ctx
 * @param {number} ctx.finishedSeat  刚出完的座位
 * @param {number|null} ctx.lastPlaySeat  最后一手出牌座位（通常=finishedSeat）
 * @param {boolean} ctx.wasBeaten  是否有人压过该最后一手
 * @param {number[]} [ctx.activeSeats]  仍有手牌的座位
 * @returns {{ nextSeat: number|null, passWind: boolean, reason: string }}
 */
export function resolvePassWind(ctx) {
  const seat = Number(ctx.finishedSeat);
  const last = ctx.lastPlaySeat == null ? seat : Number(ctx.lastPlaySeat);
  const mate = teammateOf(seat);

  // 最后一手不是该玩家打的，不接风
  if (last !== seat) {
    return { nextSeat: null, passWind: false, reason: 'last_play_not_finisher' };
  }
  // 有人压过 → 正常从压牌者下家继续（由外层决定）
  if (ctx.wasBeaten) {
    return { nextSeat: null, passWind: false, reason: 'was_beaten' };
  }

  const active = new Set((ctx.activeSeats || []).map(Number));
  // 队友仍在场才接风
  if (active.size && !active.has(mate)) {
    return { nextSeat: null, passWind: false, reason: 'teammate_finished' };
  }
  return { nextSeat: mate, passWind: true, reason: 'pass_wind_to_teammate' };
}

/**
 * 名次对 → 升级档
 * ranks: 长度 4 的 finishOrder，[0]=头游 seat
 *
 * @param {number[]} finishOrder
 * @returns {{ winTeam: number, places: number[], upgrade: number, pattern: string }}
 *
 * winTeam: 头游所在队 0 表示 seats%2 队标识用 head%2 简化，或用 head seat 的队
 * places: 胜方两名次 [1,2] / [1,3] / [1,4]
 */
export function analyzeFinish(finishOrder) {
  const order = (finishOrder || []).map(Number);
  if (order.length < 2) {
    return { winTeamSeats: [], places: [], upgrade: 0, pattern: 'invalid' };
  }
  const head = order[0];
  const mate = teammateOf(head);
  const placeOf = new Map(order.map((s, i) => [s, i + 1]));
  const headPlace = placeOf.get(head) || 1;
  const matePlace = placeOf.get(mate) || 4;
  const places = [headPlace, matePlace].sort((a, b) => a - b);

  let upgrade = 0;
  let pattern = 'other';
  if (places[0] === 1 && places[1] === 2) {
    upgrade = 3;
    pattern = 'double_down'; // 双下
  } else if (places[0] === 1 && places[1] === 3) {
    upgrade = 2;
    pattern = 'one_three';
  } else if (places[0] === 1 && places[1] === 4) {
    upgrade = 1;
    pattern = 'one_four';
  } else {
    // 头游方必有 1；若算法异常
    upgrade = places[0] === 1 ? 1 : 0;
    pattern = 'fallback';
  }

  return {
    winTeamSeats: [head, mate],
    loseTeamSeats: [0, 1, 2, 3].filter((s) => !sameTeam(s, head)),
    places,
    upgrade,
    pattern,
    head,
    mate,
  };
}

/**
 * 计算本局升级（含打 A 限制）
 *
 * @param {number[]} finishOrder
 * @param {object} [opts]
 * @param {number} [opts.currentLevel=2]  胜方当前级 2–14
 * @param {boolean} [opts.winnerIsBanker=true]  是否打自己的级（打 A 方）
 * @returns {{
 *   upgrade: number,
 *   appliedUpgrade: number,
 *   pattern: string,
 *   passedA: boolean,
 *   continueOnA: boolean,
 *   nextLevel: number,
 *   cleared: boolean,
 *   winTeamSeats: number[],
 * }}
 */
export function calculateLevelProgress(finishOrder, opts = {}) {
  const currentLevel = clampLevel(opts.currentLevel ?? 2);
  const analysis = analyzeFinish(finishOrder);
  let { upgrade, pattern } = analysis;

  let appliedUpgrade = upgrade;
  let passedA = false;
  let continueOnA = false;
  let cleared = false;

  // 打 A 限制：仅双下或 1+3 过 A；1+4 不升级继续打 A
  if (currentLevel === LEVEL_A) {
    if (pattern === 'double_down' || pattern === 'one_three') {
      passedA = true;
      cleared = true;
      appliedUpgrade = upgrade; // 通关
    } else if (pattern === 'one_four') {
      appliedUpgrade = 0;
      continueOnA = true;
      passedA = false;
    } else {
      appliedUpgrade = 0;
      continueOnA = true;
    }
  }

  let nextLevel = currentLevel;
  if (!continueOnA && !cleared) {
    nextLevel = advanceLevel(currentLevel, appliedUpgrade);
    // 升到/超过 A 后停在 A（未通关则下一局打 A）
    if (nextLevel > LEVEL_A) nextLevel = LEVEL_A;
  } else if (cleared) {
    nextLevel = LEVEL_A; // 通关保持 A 展示
  } else if (continueOnA) {
    nextLevel = LEVEL_A;
  }

  return {
    upgrade,
    appliedUpgrade,
    pattern,
    passedA,
    continueOnA,
    nextLevel,
    cleared,
    winTeamSeats: analysis.winTeamSeats,
    loseTeamSeats: analysis.loseTeamSeats,
    places: analysis.places,
    currentLevel,
  };
}

/**
 * @param {number} level
 * @param {number} steps
 */
export function advanceLevel(level, steps) {
  let lv = clampLevel(level);
  const n = Math.max(0, Number(steps) || 0);
  for (let i = 0; i < n; i++) {
    if (lv >= LEVEL_A) break;
    lv += 1;
  }
  return lv;
}

function clampLevel(lv) {
  const n = Number(lv);
  if (!Number.isFinite(n)) return LEVEL_MIN;
  if (n < LEVEL_MIN) return LEVEL_MIN;
  if (n > LEVEL_A) return LEVEL_A;
  return n;
}

/**
 * 多局累计比分与通关
 */
export class GuanDanSettlement {
  /**
   * @param {object} [opts]
   * @param {number} [opts.team0Level=2]  队 seats 0+2
   * @param {number} [opts.team1Level=2]  队 seats 1+3
   * @param {number} [opts.bankerTeam=0]  当前打级方 0|1
   */
  constructor(opts = {}) {
    this.teamLevels = [
      clampLevel(opts.team0Level ?? 2),
      clampLevel(opts.team1Level ?? 2),
    ];
    this.bankerTeam = opts.bankerTeam === 1 ? 1 : 0;
    this.history = [];
    this.clearedTeam = null;
  }

  teamOf(seat) {
    return Number(seat) % 2 === 0 ? 0 : 1;
  }

  currentRank() {
    return this.teamLevels[this.bankerTeam];
  }

  /**
   * 一局结束
   * @param {number[]} finishOrder
   */
  settleHand(finishOrder) {
    const analysis = analyzeFinish(finishOrder);
    const winTeam = this.teamOf(analysis.head);
    const isBankerWin = winTeam === this.bankerTeam;
    const levelBefore = this.teamLevels[winTeam];

    // 升级针对胜方；打 A 限制仅当胜方正在打 A（banker 且级为 A，或胜方级为 A）
    const progress = calculateLevelProgress(finishOrder, {
      currentLevel: levelBefore,
      winnerIsBanker: isBankerWin,
    });

    // 非 A 时正常升级；A 时用 progress 规则
    let applied = progress.appliedUpgrade;
    if (levelBefore !== LEVEL_A) {
      applied = progress.upgrade;
    }

    const next = levelBefore === LEVEL_A
      ? progress.nextLevel
      : advanceLevel(levelBefore, applied);

    const cleared = levelBefore === LEVEL_A && progress.passedA;
    if (cleared) this.clearedTeam = winTeam;

    this.teamLevels[winTeam] = cleared ? LEVEL_A : next;

    // 庄家：胜方继续打自己的级（常见规则：升级方下局为庄）
    if (!progress.continueOnA || levelBefore !== LEVEL_A) {
      this.bankerTeam = winTeam;
    }

    const record = {
      finishOrder: finishOrder.map(Number),
      winTeam,
      pattern: progress.pattern,
      upgrade: progress.upgrade,
      appliedUpgrade: levelBefore === LEVEL_A ? progress.appliedUpgrade : applied,
      levelBefore,
      levelAfter: this.teamLevels[winTeam],
      teamLevels: [...this.teamLevels],
      bankerTeam: this.bankerTeam,
      passedA: !!cleared,
      continueOnA: levelBefore === LEVEL_A && progress.continueOnA,
      cleared,
      passWindNote: 'use resolvePassWind during play',
    };
    this.history.push(record);
    return record;
  }

  snapshot() {
    return {
      teamLevels: [...this.teamLevels],
      bankerTeam: this.bankerTeam,
      currentRank: this.currentRank(),
      clearedTeam: this.clearedTeam,
      history: this.history.map((h) => ({ ...h, teamLevels: [...h.teamLevels] })),
      gameOver: this.clearedTeam != null,
    };
  }
}
