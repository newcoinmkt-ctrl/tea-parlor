/**
 * 牛牛 AI — 看牌抢庄 / 下注 / 开牌
 * Uses 4 visible cards during 抢庄/下注 (5th hidden).
 */
import { calculate, pipValue } from './engine.js';

function visibleFour(holds) {
  const list = (holds || []).filter(Boolean);
  return list.slice(0, Math.min(4, list.length));
}

function guessStrength(four) {
  if (!four || four.length < 4) return 0;
  const pips = four.map((c) => pipValue(c.rank));
  const s = pips.reduce((a, b) => a + b, 0);
  const point = s % 10;
  // How close is a 3-card 10-combo among the 4
  let combo = 0;
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      for (let c = b + 1; c < 4; c++) {
        if ((pips[a] + pips[b] + pips[c]) % 10 === 0) combo = 1;
      }
    }
  }
  return combo * 6 + (point === 0 ? 4 : Math.floor(point / 3));
}

/**
 * @param {object} snap snapshot(0) (AI uses rawHolds when present)
 * @param {number} seat
 * @returns {{ action: string, value?: number }}
 */
export function decideNiuniu(snap, seat) {
  const sd = snap.seats?.[seat];
  if (!sd || sd.sit === 0) return { action: 'pass' };
  const four = visibleFour(sd.rawHolds || sd.holds);
  const strength = guessStrength(four);

  if (snap.phase === 'qiangzhuang') {
    if (sd.hasQiang) return { action: 'pass' };
    let v = 0;
    if (strength >= 10) v = 4;
    else if (strength >= 8) v = 3;
    else if (strength >= 6) v = 2;
    else if (strength >= 3) v = 1;
    else v = Math.random() < 0.25 ? 1 : 0;
    return { action: 'qiang', value: v };
  }

  if (snap.phase === 'xiazhu') {
    if (seat === snap.button || sd.hasXia) return { action: 'pass' };
    let v = 2;
    if (strength >= 10) v = 5;
    else if (strength >= 8) v = 4;
    else if (strength >= 6) v = 3;
    else if (strength >= 3) v = 2;
    else v = 1;
    return { action: 'xia', value: v };
  }

  if (snap.phase === 'cuopai') {
    if (sd.hasLiang) return { action: 'pass' };
    return { action: 'liang' };
  }

  return { action: 'pass' };
}

/** Optional: if AI already has 5 cards, bias using real niu. */
export function decideWithNiu(snap, seat) {
  const dec = decideNiuniu(snap, seat);
  const sd = snap.seats?.[seat];
  const holds = sd?.rawHolds;
  if (!holds || holds.filter(Boolean).length !== 5) return dec;
  const niu = calculate(holds);
  if (snap.phase === 'qiangzhuang' && dec.action === 'qiang') {
    if (niu >= 10) return { action: 'qiang', value: 4 };
    if (niu >= 7) return { action: 'qiang', value: Math.max(dec.value, 2) };
    if (niu < 0) return { action: 'qiang', value: Math.min(dec.value, 1) };
  }
  if (snap.phase === 'xiazhu' && dec.action === 'xia') {
    if (niu >= 10) return { action: 'xia', value: 5 };
    if (niu < 0) return { action: 'xia', value: 1 };
  }
  return dec;
}
