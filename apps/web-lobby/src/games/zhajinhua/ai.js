/**
 * 炸金花 AI — 激进 / 保守性格（对齐 makeAIDecision 思路）
 */
import { evalHand, HandType, PlayerStatus } from './engine.js';

const PERSONALITIES = ['aggressive', 'aggressive', 'conservative', 'balanced'];

function profile(kind) {
  if (kind === 'aggressive') {
    return {
      kind, bluff: 0.28, lookEarly: 0.22, foldWeak: 0.15, raiseFreq: 0.4, compareAggro: 0.35, menLove: 0.7,
    };
  }
  if (kind === 'conservative') {
    return {
      kind, bluff: 0.04, lookEarly: 0.75, foldWeak: 0.7, raiseFreq: 0.1, compareAggro: 0.12, menLove: 0.2,
    };
  }
  return {
    kind: 'balanced', bluff: 0.12, lookEarly: 0.45, foldWeak: 0.4, raiseFreq: 0.22, compareAggro: 0.22, menLove: 0.45,
  };
}

/**
 * @param {object} snap snapshot(0) 或任意视角
 * @param {number} seat
 * @returns {{ action: string, target?: number, amount?: number, personality?: string }}
 */
export function decideZhajinhua(snap, seat) {
  if (snap.folded?.[seat] || snap.status?.[seat] === PlayerStatus.FOLDED
    || snap.status?.[seat] === PlayerStatus.LOST) {
    return { action: 'pass' };
  }
  if (snap.allIn?.[seat] || snap.status?.[seat] === PlayerStatus.ALL_IN) {
    return { action: 'pass' };
  }

  const p = profile(PERSONALITIES[seat % PERSONALITIES.length]);
  const hand = snap.rawHands?.[seat] || [];
  const looked = snap.looked[seat];
  const others = (snap.contending || snap.alive || [0, 1, 2])
    .filter((i) => i !== seat && !snap.folded[i]);
  const unit = snap.looked[seat]
    ? (snap.currentMenStake || snap.stake) * 2
    : (snap.currentMenStake || snap.stake);
  const chips = snap.chips?.[seat] ?? 9999;

  // 筹码不足 → All-in
  if (chips > 0 && chips < unit) {
    return { action: 'allin', personality: p.kind };
  }

  // 未看牌
  if (!looked) {
    if (Math.random() < p.lookEarly) return { action: 'look', personality: p.kind };
    if (p.kind === 'aggressive' && Math.random() < p.raiseFreq * 0.6) {
      return { action: 'raise', personality: p.kind };
    }
    if (snap.canCompare && others.length && Math.random() < p.compareAggro * 0.25) {
      return {
        action: 'compare',
        target: others[Math.floor(Math.random() * others.length)],
        personality: p.kind,
      };
    }
    if (Math.random() < p.foldWeak * 0.15) return { action: 'fold', personality: p.kind };
    return { action: 'call', personality: p.kind };
  }

  const ev = evalHand(hand);
  const t = ev.type;

  // 保守：散牌弃
  if (p.kind === 'conservative' && t === HandType.HIGH) {
    return { action: 'fold', personality: p.kind };
  }
  if (p.kind === 'conservative' && t === HandType.PAIR && (ev.primary || ev.ranks[0]) < 9) {
    if (Math.random() < 0.55) return { action: 'fold', personality: p.kind };
  }

  // 强牌
  if (t >= HandType.STRAIGHT_FLUSH) {
    if (snap.canCompare && others.length && Math.random() < 0.55 + p.compareAggro) {
      return { action: 'compare', target: pickTarget(others, snap), personality: p.kind };
    }
    if (Math.random() < p.raiseFreq + 0.2) return { action: 'raise', personality: p.kind };
    return { action: 'call', personality: p.kind };
  }
  if (t >= HandType.FLUSH || t === HandType.STRAIGHT) {
    if (snap.canCompare && others.length && Math.random() < 0.35 + p.compareAggro * 0.3) {
      return { action: 'compare', target: pickTarget(others, snap), personality: p.kind };
    }
    if (p.kind !== 'conservative' && Math.random() < p.raiseFreq) {
      return { action: 'raise', personality: p.kind };
    }
    return { action: 'call', personality: p.kind };
  }
  if (t === HandType.PAIR) {
    const pr = ev.primary || ev.ranks[0];
    if (pr >= 11 && snap.canCompare && others.length && Math.random() < 0.28) {
      return { action: 'compare', target: others[0], personality: p.kind };
    }
    if (pr < 8 && Math.random() < p.foldWeak * 0.5) return { action: 'fold', personality: p.kind };
    return { action: 'call', personality: p.kind };
  }

  // 弱牌诈唬（激进）
  if (p.kind === 'aggressive' && Math.random() < p.bluff) {
    if (Math.random() < 0.55) return { action: 'raise', personality: p.kind };
    if (snap.canCompare && others.length && Math.random() < 0.3) {
      return {
        action: 'compare',
        target: others[Math.floor(Math.random() * others.length)],
        personality: p.kind,
      };
    }
  }

  if (ev.ranks[0] < 10 && Math.random() < p.foldWeak) return { action: 'fold', personality: p.kind };
  if (ev.ranks[0] < 12 && Math.random() < p.foldWeak * 0.5) return { action: 'fold', personality: p.kind };
  return { action: 'call', personality: p.kind };
}

function pickTarget(others, snap) {
  let best = others[0];
  let bestBet = -1;
  for (const i of others) {
    const b = snap.bets?.[i] || 0;
    if (b > bestBet) {
      bestBet = b;
      best = i;
    }
  }
  return Math.random() < 0.7 ? best : others[Math.floor(Math.random() * others.length)];
}
