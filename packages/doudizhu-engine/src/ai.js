/**
 * 斗地主 AI
 * - decideBid：叫分
 * - makeAIDecision / decidePlay：出牌（见 ai-decision.js）
 */

import { groupByRank } from './card.js';

export {
  makeAIDecision,
  decidePlay,
  estimateMinHands,
  isControlHand,
  isTeammateLastPlay,
  normalizeLastHand,
} from './ai-decision.js';

/** 叫分：0 不叫，1–3 分 */
export function decideBid(hand, currentBid) {
  const score = evaluateHandStrength(hand);
  let want = 0;
  if (score >= 14) want = 3;
  else if (score >= 10) want = 2;
  else if (score >= 6) want = 1;

  if (want > currentBid) return want;
  if (want === currentBid && want < 3 && score >= currentBid * 4 + 2) {
    return Math.min(3, want + 1);
  }
  return 0;
}

function evaluateHandStrength(hand) {
  let s = 0;
  const groups = groupByRank(hand);
  const hasBig = (r) => (groups.get(r) || []).length > 0;
  const count = (r) => (groups.get(r) || []).length;

  if (hasBig(17) && hasBig(16)) s += 8;
  else {
    if (hasBig(17)) s += 3;
    if (hasBig(16)) s += 2;
  }

  for (const [r, cs] of groups) {
    if (cs.length === 4) s += 5;
    if (r === 15) s += cs.length * 1.5;
    if (r === 14) s += cs.length * 0.8;
    if (r === 13) s += cs.length * 0.4;
  }

  let run = 0;
  for (let r = 3; r <= 14; r++) {
    if (count(r) >= 1) {
      run++;
      if (run >= 5) s += 0.5;
    } else run = 0;
  }

  return s;
}

export function bidLabel(score) {
  if (score === 0) return '不叫';
  return `${score}分`;
}
