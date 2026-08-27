import { evaluateHand } from './hand.js';

/** 极简 AI：根据胜率粗估与底池赔率决定 */
export function decideTexasAction(pub, seat) {
  const legal = [];
  // 从引擎侧应传入 legal；此处用 pub.legal 若是当前位
  const acts = pub.current === seat ? (pub.legal || []) : [];
  if (!acts.length) return { type: 'check' };

  const hole = pub.holesRevealed?.[seat] || pub.holes?.[seat]?.filter(Boolean) || [];
  // 未亮牌时 AI 自己知道底牌：调用方应传入 privateHole
  const myHole = pub._privateHoles?.[seat] || hole;
  const board = pub.board || [];
  const need = Math.max(0, pub.toCall - (pub.bets[seat] || 0));
  const stack = pub.stacks[seat] || 0;
  const pot = pub.pot || 0;

  const score = handStrength(myHole, board);
  const potOdds = need > 0 ? need / (pot + need) : 0;

  const has = (t) => acts.some((a) => a.type === t);
  const find = (t) => acts.find((a) => a.type === t);

  // 很弱：弃牌或过牌
  if (score < 0.18) {
    if (need === 0 && has('check')) return { type: 'check' };
    if (has('fold') && need > 0) return { type: 'fold' };
    if (has('check')) return { type: 'check' };
    return find('call') || find('fold') || acts[0];
  }

  // 中等：便宜就跟
  if (score < 0.45) {
    if (need === 0 && has('check')) return { type: 'check' };
    if (need > 0 && potOdds < score + 0.05 && has('call')) return { type: 'call' };
    if (need > 0 && has('fold')) return { type: 'fold' };
    return find('check') || find('call') || acts[0];
  }

  // 强牌：下注/加注
  if (score >= 0.45) {
    if (has('bet')) {
      const bet = find('bet');
      const amt = clamp(
        Math.floor(pot * (score > 0.7 ? 0.75 : 0.5)),
        bet.min || pub.bigBlind,
        Math.min(bet.max || stack, stack),
      );
      return { type: 'bet', amount: amt };
    }
    if (has('raise')) {
      const r = find('raise');
      const target = clamp(
        pub.toCall + Math.floor((pub.minRaise || pub.bigBlind) * (score > 0.75 ? 2.5 : 1.5)),
        r.min || pub.toCall + pub.minRaise,
        r.max || (pub.bets[seat] + stack),
      );
      return { type: 'raise', amount: target };
    }
    if (need === 0 && has('check')) return { type: 'check' };
    if (has('call')) return { type: 'call' };
    if (has('allin') && score > 0.85) return { type: 'allin' };
  }

  if (need === 0 && has('check')) return { type: 'check' };
  if (has('call')) return { type: 'call' };
  return acts[0];
}

function handStrength(hole, board) {
  if (!hole || hole.length < 2) return 0.1;
  const e = evaluateHand(hole, board);
  // 粗映射 0-1
  const base = e.category / 8;
  const k0 = (e.kickers[0] || 0) / 14;
  let s = base * 0.75 + k0 * 0.2;
  // preflop 口袋对加成
  if (board.length === 0 && hole[0].rank === hole[1].rank) s = Math.max(s, 0.35 + hole[0].rank / 40);
  if (board.length === 0 && hole[0].suit === hole[1].suit) s += 0.03;
  return Math.min(0.98, Math.max(0.05, s));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
