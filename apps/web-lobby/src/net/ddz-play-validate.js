/**
 * Pure Dou Dizhu play-button / selection legality helpers (testable).
 * Does not touch DOM — callers pass parse/canBeat + selection cards.
 */

/**
 * @param {object} opts
 * @param {any[]} opts.selectedCards
 * @param {{ player?: number, parsed?: any } | null} opts.lastPlay
 * @param {number} [opts.humanSeat=0]
 * @param {(cards:any[]) => any|null} opts.parseHand
 * @param {(prev:any, next:any) => boolean} opts.canBeat
 * @returns {{ allowPlay: boolean, reason: string, parsed: any|null, message: string }}
 */
export function evaluatePlaySelection({
  selectedCards,
  lastPlay = null,
  humanSeat = 0,
  parseHand,
  canBeat,
}) {
  const cards = Array.isArray(selectedCards) ? selectedCards.filter(Boolean) : [];
  if (!cards.length) {
    return {
      allowPlay: false,
      reason: 'empty',
      parsed: null,
      message: '请先点选手牌，再点「出牌」',
    };
  }
  if (typeof parseHand !== 'function') {
    return {
      allowPlay: false,
      reason: 'no_parser',
      parsed: null,
      message: '牌型解析不可用',
    };
  }
  const parsed = parseHand(cards);
  if (!parsed) {
    return {
      allowPlay: false,
      reason: 'illegal_pattern',
      parsed: null,
      message: '牌型不合法：请选 单/对/三带/顺子/连对/飞机/四带二/炸弹/连炸/火箭',
    };
  }

  const prevParsed = lastPlay && lastPlay.player !== humanSeat
    ? (lastPlay.parsed || null)
    : null;
  if (prevParsed && typeof canBeat === 'function' && !canBeat(prevParsed, parsed)) {
    return {
      allowPlay: false,
      reason: 'cannot_beat',
      parsed,
      message: '压不过上一手，请改选或点「不出」',
    };
  }
  return {
    allowPlay: true,
    reason: 'ok',
    parsed,
    message: '',
  };
}

/**
 * DOM-free: play button must stay disabled unless evaluatePlaySelection.allowPlay.
 * @param {{ allowPlay?: boolean } | null | undefined} verdict
 * @returns {boolean}
 */
export function shouldDisablePlayButton(verdict) {
  return !verdict || verdict.allowPlay !== true;
}
