import { RANK_LABEL, SUITS } from '../../jj/card.js';
import { HandType } from '../../jj/rules.js';

export function typeLabel(type, parsed) {
  if (parsed?.soft && type === HandType.BOMB) return '软炸';
  if (parsed?.soft && type === HandType.PAIR) return '癞子对';
  if (parsed?.soft && type === HandType.STRAIGHT) return '癞子顺';
  if (type === HandType.CHAIN_BOMB || type === 'chain_bomb') {
    const n = parsed?.length || 2;
    return `${n}连炸`;
  }
  const map = {
    [HandType.SINGLE]: '单张',
    [HandType.PAIR]: '对子',
    [HandType.TRIPLE]: '三张',
    [HandType.TRIPLE_ONE]: '三带一',
    [HandType.TRIPLE_PAIR]: '三带二',
    [HandType.STRAIGHT]: '顺子',
    [HandType.PAIR_STRAIGHT]: '连对',
    [HandType.PLANE]: '飞机',
    [HandType.PLANE_ONE]: '飞机带单',
    [HandType.PLANE_PAIR]: '飞机带对',
    [HandType.FOUR_TWO]: '四带二',
    [HandType.FOUR_PAIR]: '四带两对',
    [HandType.BOMB]: '炸弹',
    [HandType.CHAIN_BOMB]: '连炸',
    [HandType.ROCKET]: '火箭',
  };
  return map[type] || type || '';
}

export function cardText(card) {
  if (card.rank === 16) return '小王';
  if (card.rank === 17) return '大王';
  const suit = typeof card.suit === 'number' && card.suit < 4 ? SUITS[card.suit] : '';
  return suit + (RANK_LABEL[card.rank] || card.rank);
}

export function cardFaceHtml(card, { wild = false, brandBadgeHtml = '' } = {}) {
  const wildTag = wild ? '<i class="pc-wild-tag">癞</i>' : '';
  if (card.rank === 16) return `<span class="pc-joker">小王</span>${brandBadgeHtml}`;
  if (card.rank === 17) return `<span class="pc-joker">大王</span>${brandBadgeHtml}`;
  const suit = typeof card.suit === 'number' && card.suit < 4 ? SUITS[card.suit] : '';
  const rank = RANK_LABEL[card.rank] || String(card.rank);
  return `<span class="pc-rank">${rank}</span><span class="pc-suit">${suit}</span>${wildTag}${brandBadgeHtml}`;
}
