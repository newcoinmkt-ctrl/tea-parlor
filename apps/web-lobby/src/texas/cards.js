/** 德州扑克 52 张（无王） */

export const SUITS = ['♦', '♣', '♥', '♠'];
export const RANK_LABEL = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

let _uid = 0;

export function createCard(rank, suit) {
  return {
    id: `t${rank}_${suit}_${_uid++}`,
    rank,
    suit,
    isRed: suit === 0 || suit === 2,
  };
}

export function createDeck() {
  _uid = 0;
  const deck = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardText(card) {
  if (!card) return '';
  return `${SUITS[card.suit] || ''}${RANK_LABEL[card.rank] || card.rank}`;
}
