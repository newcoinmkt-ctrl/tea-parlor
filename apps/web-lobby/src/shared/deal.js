/**
 * 真人桌发牌：加密随机洗牌 + 按圈轮发。
 * 不洗牌也从乱序收墩，禁止按厂牌顺序整段发给同一人。
 */

export function cryptoRandom() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

export function fisherYates(arr, random = cryptoRandom) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cutDeck(arr, random = cryptoRandom) {
  if (!arr || arr.length < 8) return (arr || []).slice();
  const lo = Math.max(1, Math.floor(arr.length * 0.18));
  const hi = Math.min(arr.length - 1, Math.floor(arr.length * 0.82));
  const cut = lo + Math.floor(random() * (hi - lo + 1));
  return arr.slice(cut).concat(arr.slice(0, cut));
}

/** 真人洗牌：洗 2～4 遍再切一刀 */
export function riffleShuffle(arr, random = cryptoRandom, times) {
  const n = times == null ? 2 + Math.floor(random() * 3) : times;
  let d = arr.slice();
  for (let i = 0; i < n; i++) d = fisherYates(d, random);
  return cutDeck(d, random);
}

/**
 * 不洗牌：先彻底打乱（模拟上一局出牌后的乱序），再收成 3～8 张一墩叠起来切牌。
 * 保留局部连贯，但每局花色/点数都不同。
 */
export function unwashedShuffle(arr, random = cryptoRandom) {
  let cards = fisherYates(arr, random);
  const piles = [];
  let i = 0;
  while (i < cards.length) {
    const remain = cards.length - i;
    const n = remain <= 4 ? remain : Math.min(remain, 3 + Math.floor(random() * 6));
    piles.push(cards.slice(i, i + n));
    i += n;
  }
  for (let a = piles.length - 1; a > 0; a--) {
    const b = Math.floor(random() * (a + 1));
    [piles[a], piles[b]] = [piles[b], piles[a]];
  }
  return cutDeck(piles.flat(), random);
}

/**
 * 按圈轮发（一张一张，从 startSeat 起顺时针）。
 * @returns {{ hands: any[][], rest: any[], dealt: number }}
 */
export function dealRoundRobin(deck, playerCount, cardsEach, startSeat = 0) {
  const n = Math.max(1, Number(playerCount) || 1);
  const each = Math.max(0, Number(cardsEach) || 0);
  const start = ((Number(startSeat) || 0) % n + n) % n;
  const hands = Array.from({ length: n }, () => []);
  let i = 0;
  for (let r = 0; r < each; r++) {
    for (let p = 0; p < n; p++) {
      if (i >= deck.length) break;
      hands[(start + p) % n].push(deck[i++]);
    }
  }
  return { hands, rest: deck.slice(i), dealt: i };
}
