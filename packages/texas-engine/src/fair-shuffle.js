/**
 * 德州扑克 · Provably Fair 洗牌与验证
 *
 * 局前：
 *   serverSeed（保密）、clientSeed（玩家/客户端）、nonce
 *   publicHash = HMAC-SHA256(serverSeed, clientSeed:nonce)  ← 开局前公开
 *   用 HMAC-DRBG 派生 PRNG → Fisher-Yates 洗牌
 *
 * 局后：
 *   公开 serverSeed，玩家复算 publicHash 与牌序，确认未被篡改
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createDeck52, createCard } from './card.js';

// ─────────────────────────────────────────────
// 哈希
// ─────────────────────────────────────────────

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256Hex(key, data) {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function generateServerSeed(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function generateClientSeed(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

/**
 * 牌键（rank_suit）
 * @param {{ rank: number, suit: number }} c
 */
export function fairCardKey(c) {
  return `${Number(c.rank)}_${Number(c.suit)}`;
}

/**
 * 牌序指纹
 * @param {Array<{ rank: number, suit: number }>} deck
 */
export function deckFingerprint(deck) {
  return sha256Hex((deck || []).map(fairCardKey).join('|'));
}

/**
 * 局前公开承诺
 * publicHash = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`)
 *
 * @param {string} serverSeed
 * @param {string} clientSeed
 * @param {number|string} [nonce=0]
 */
export function computePublicHash(serverSeed, clientSeed, nonce = 0) {
  if (!serverSeed || clientSeed == null) {
    throw new TypeError('serverSeed and clientSeed required');
  }
  return hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
}

/**
 * 校验局前 Hash
 */
export function verifyPublicHash(serverSeed, clientSeed, nonce, publicHash) {
  if (!publicHash) return false;
  const expected = computePublicHash(serverSeed, clientSeed, nonce);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(publicHash), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return expected === publicHash;
  }
}

/**
 * 洗牌密钥派生
 * shuffleKey = HMAC-SHA256(serverSeed, `shuffle:${clientSeed}:${nonce}`)
 */
export function deriveShuffleKey(serverSeed, clientSeed, nonce = 0) {
  return hmacSha256Hex(serverSeed, `shuffle:${clientSeed}:${nonce}`);
}

/**
 * HMAC 计数器 PRNG → [0,1)
 * @param {string} keyHex
 */
export function createHmacRng(keyHex) {
  let counter = 0;
  let buf = Buffer.alloc(0);
  let offset = 0;
  const key = Buffer.from(keyHex, 'hex');

  const refill = () => {
    buf = createHmac('sha256', key).update(Buffer.from(String(counter++), 'utf8')).digest();
    offset = 0;
  };

  return () => {
    if (offset + 4 > buf.length) refill();
    const n = buf.readUInt32BE(offset);
    offset += 4;
    return n / 4294967296;
  };
}

/**
 * Fisher-Yates
 * @template T
 * @param {T[]} arr
 * @param {() => number} random
 */
export function fisherYatesShuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * @typedef {object} FairShuffleResult
 * @property {Array<{ rank: number, suit: number, id?: string }>} deck
 * @property {string} serverSeed
 * @property {string} clientSeed
 * @property {number|string} nonce
 * @property {string} publicHash       局前公开
 * @property {string} shuffleKey
 * @property {string} deckFingerprint  局后可公开
 * @property {string} publicCode       短码展示
 * @property {string} [tableId]
 * @property {string} [handId]
 */

/**
 * 执行可验证公平洗牌
 *
 * @param {{
 *   serverSeed?: string,
 *   clientSeed?: string,
 *   nonce?: number|string,
 *   tableId?: string,
 *   handId?: string,
 *   withIds?: boolean,
 * }} [options]
 * @returns {FairShuffleResult}
 */
export function fairShuffle(options = {}) {
  const serverSeed = options.serverSeed || generateServerSeed();
  const clientSeed = options.clientSeed != null ? String(options.clientSeed) : generateClientSeed();
  const nonce = options.nonce != null ? options.nonce : 0;

  const publicHash = computePublicHash(serverSeed, clientSeed, nonce);
  const shuffleKey = deriveShuffleKey(serverSeed, clientSeed, nonce);
  const rng = createHmacRng(shuffleKey);

  const base = createDeck52().map((c) => ({ rank: c.rank, suit: c.suit }));
  const shuffled = fisherYatesShuffle(base, rng);
  const deck = options.withIds === false
    ? shuffled
    : shuffled.map((c) => createCard(c.rank, c.suit));

  const fp = deckFingerprint(shuffled);
  const publicCode = `${publicHash.slice(0, 8)}-${fp.slice(0, 8)}`.toUpperCase();

  return {
    deck,
    serverSeed,
    clientSeed,
    nonce,
    publicHash,
    shuffleKey,
    deckFingerprint: fp,
    publicCode,
    tableId: options.tableId,
    handId: options.handId,
  };
}

/**
 * 局前只下发公开信息（不含 serverSeed）
 * @param {FairShuffleResult} full
 */
export function toPublicFairCommit(full) {
  return {
    publicHash: full.publicHash,
    publicCode: full.publicCode,
    clientSeed: full.clientSeed,
    nonce: full.nonce,
    tableId: full.tableId,
    handId: full.handId,
  };
}

/**
 * 局后完整揭示材料
 * @param {FairShuffleResult} full
 */
export function toFairReveal(full) {
  return {
    serverSeed: full.serverSeed,
    clientSeed: full.clientSeed,
    nonce: full.nonce,
    publicHash: full.publicHash,
    deckFingerprint: full.deckFingerprint,
    publicCode: full.publicCode,
    tableId: full.tableId,
    handId: full.handId,
  };
}

/**
 * 局后完整验证
 *
 * @param {{
 *   serverSeed: string,
 *   clientSeed: string,
 *   nonce?: number|string,
 *   publicHash: string,
 *   deckFingerprint?: string,
 *   finalDeck?: Array<{ rank: number, suit: number }>,
 * }} proof
 * @returns {{
 *   ok: boolean,
 *   hashOk: boolean,
 *   deckOk: boolean,
 *   expectedFingerprint?: string,
 *   reasons: string[],
 * }}
 */
export function verifyFairShuffle(proof) {
  const reasons = [];
  const hashOk = verifyPublicHash(
    proof.serverSeed,
    proof.clientSeed,
    proof.nonce ?? 0,
    proof.publicHash
  );
  if (!hashOk) reasons.push('public_hash_mismatch');

  let deckOk = true;
  let expectedFingerprint;
  if (proof.finalDeck || proof.deckFingerprint) {
    const rebuilt = fairShuffle({
      serverSeed: proof.serverSeed,
      clientSeed: proof.clientSeed,
      nonce: proof.nonce ?? 0,
      withIds: false,
    });
    expectedFingerprint = rebuilt.deckFingerprint;
    if (proof.deckFingerprint && proof.deckFingerprint !== expectedFingerprint) {
      deckOk = false;
      reasons.push('fingerprint_mismatch');
    }
    if (proof.finalDeck) {
      const given = deckFingerprint(proof.finalDeck);
      if (given !== expectedFingerprint) {
        deckOk = false;
        reasons.push('deck_order_mismatch');
      }
    }
  }

  return {
    ok: hashOk && deckOk,
    hashOk,
    deckOk,
    expectedFingerprint,
    reasons,
  };
}
