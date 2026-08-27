/**
 * Provably Fair 洗牌 · Fisher-Yates + 暗盐哈希
 *
 * 流程：
 *   1. 服务端生成 serverSeed（保密）+ salt
 *   2. 发牌前公开 commitHash = SHA256(serverSeed + ":" + salt)
 *   3. 结合 clientSeed / nonce 派生确定性 PRNG，Fisher-Yates 洗牌
 *   4. 局结束后公开 serverSeed + salt，客户端可复现牌序并校验 commit
 *
 * 验证码（公开防篡改）：
 *   - commitHash：开局承诺
 *   - deckFingerprint：洗牌后牌序指纹（可只在结束后公布）
 *   - proofToken：HMAC 绑定桌号/局号，防替换
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createDeck52, createCard } from './card.js';

// ─────────────────────────────────────────────
// 哈希 / 编码
// ─────────────────────────────────────────────

/**
 * @param {string|Buffer} data
 * @returns {string} hex sha256
 */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * @param {string} key
 * @param {string|Buffer} data
 * @returns {string} hex hmac-sha256
 */
export function hmacSha256Hex(key, data) {
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * 标准化牌面键（不含运行时 id）
 * @param {{ rank: number, suit: number }} c
 */
export function cardKey(c) {
  return `${Number(c.rank)}_${Number(c.suit)}`;
}

/**
 * 牌序指纹
 * @param {Array<{ rank: number, suit: number }>} deck
 */
export function deckFingerprint(deck) {
  const payload = (deck || []).map(cardKey).join('|');
  return sha256Hex(payload);
}

// ─────────────────────────────────────────────
// 种子与承诺
// ─────────────────────────────────────────────

/**
 * 生成服务端种子材料
 * @param {number} [bytes=32]
 */
export function generateServerSeed(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

/**
 * 生成暗盐
 * @param {number} [bytes=16]
 */
export function generateSalt(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

/**
 * 开局承诺哈希（公开）
 * commitHash = SHA256(serverSeed + ":" + salt)
 *
 * @param {string} serverSeed
 * @param {string} salt
 */
export function computeCommitHash(serverSeed, salt) {
  if (!serverSeed || !salt) {
    throw new TypeError('serverSeed and salt required');
  }
  return sha256Hex(`${serverSeed}:${salt}`);
}

/**
 * 校验承诺
 * @param {string} serverSeed
 * @param {string} salt
 * @param {string} commitHash
 */
export function verifyCommit(serverSeed, salt, commitHash) {
  if (!commitHash) return false;
  const expected = computeCommitHash(serverSeed, salt);
  // 常量时间比较
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(commitHash), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return expected === commitHash;
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

/**
 * 绑定桌局的防篡改 token
 * proofToken = HMAC(serverSeed, tableId|handId|commitHash|nonce)
 *
 * @param {{
 *   serverSeed: string,
 *   tableId?: string,
 *   handId?: string,
 *   commitHash: string,
 *   nonce?: number|string,
 * }} p
 */
export function computeProofToken(p) {
  const msg = [
    p.tableId || '',
    p.handId || '',
    p.commitHash || '',
    String(p.nonce ?? 0),
  ].join('|');
  return hmacSha256Hex(p.serverSeed, msg);
}

// ─────────────────────────────────────────────
// 确定性 PRNG（HMAC 计数器模式）
// ─────────────────────────────────────────────

/**
 * 从种子材料派生 32 字节主密钥
 * seedMaterial = serverSeed:salt:clientSeed:nonce
 *
 * @param {{
 *   serverSeed: string,
 *   salt: string,
 *   clientSeed?: string,
 *   nonce?: number|string,
 * }} opts
 */
export function deriveShuffleKey(opts) {
  const material = [
    opts.serverSeed,
    opts.salt,
    opts.clientSeed || 'default',
    String(opts.nonce ?? 0),
  ].join(':');
  return sha256Hex(material);
}

/**
 * HMAC-DRBG 风格：每次返回 [0,1)
 * @param {string} keyHex
 * @returns {() => number}
 */
export function createHmacRng(keyHex) {
  let counter = 0;
  /** @type {Buffer} */
  let buf = Buffer.alloc(0);
  let offset = 0;

  const refill = () => {
    const block = createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(Buffer.from(String(counter++), 'utf8'))
      .digest();
    buf = block;
    offset = 0;
  };

  return () => {
    if (offset + 4 > buf.length) refill();
    const n = buf.readUInt32BE(offset);
    offset += 4;
    // [0, 1)
    return n / 4294967296;
  };
}

// ─────────────────────────────────────────────
// Fisher-Yates + Fair Shuffle
// ─────────────────────────────────────────────

/**
 * Fisher-Yates 洗牌（可注入 random ∈ [0,1)）
 * @template T
 * @param {T[]} arr
 * @param {() => number} random
 * @returns {T[]}
 */
export function fisherYatesShuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const r = random();
    const j = Math.floor(r * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * @typedef {object} FairShuffleResult
 * @property {Array<{ rank: number, suit: number, id?: string }>} deck
 * @property {string} commitHash          开局公开
 * @property {string} salt                结束后公开
 * @property {string} serverSeed          结束后公开（开局保密）
 * @property {string} [clientSeed]
 * @property {number|string} nonce
 * @property {string} shuffleKey          派生键（可内部保留）
 * @property {string} deckFingerprint     牌序指纹
 * @property {string} proofToken          桌局绑定
 * @property {string} publicCode          用户可见防篡改码（短码）
 */

/**
 * 执行可验证公平洗牌
 *
 * @param {{
 *   serverSeed?: string,
 *   salt?: string,
 *   clientSeed?: string,
 *   nonce?: number|string,
 *   tableId?: string,
 *   handId?: string,
 *   deck?: Array<{ rank: number, suit: number }>,
 *   withIds?: boolean,
 * }} [options]
 * @returns {FairShuffleResult}
 */
export function fairShuffle(options = {}) {
  const serverSeed = options.serverSeed || generateServerSeed();
  const salt = options.salt || generateSalt();
  const clientSeed = options.clientSeed || 'tea-parlor';
  const nonce = options.nonce != null ? options.nonce : 0;

  const commitHash = computeCommitHash(serverSeed, salt);
  const shuffleKey = deriveShuffleKey({ serverSeed, salt, clientSeed, nonce });
  const rng = createHmacRng(shuffleKey);

  const base = options.deck
    ? options.deck.map((c) => ({ rank: c.rank, suit: c.suit }))
    : createDeck52().map((c) => ({ rank: c.rank, suit: c.suit }));

  const shuffled = fisherYatesShuffle(base, rng);

  // 可选挂 id（引擎用）
  const deck = options.withIds === false
    ? shuffled
    : shuffled.map((c) => createCard(c.rank, c.suit));

  const fp = deckFingerprint(shuffled);
  const proofToken = computeProofToken({
    serverSeed,
    tableId: options.tableId,
    handId: options.handId,
    commitHash,
    nonce,
  });

  // 公开短码：commit 前 8 + fingerprint 前 8
  const publicCode = `${commitHash.slice(0, 8)}-${fp.slice(0, 8)}`.toUpperCase();

  return {
    deck,
    commitHash,
    salt,
    serverSeed,
    clientSeed,
    nonce,
    shuffleKey,
    deckFingerprint: fp,
    proofToken,
    publicCode,
  };
}

/**
 * 局后完整校验
 *
 * @param {{
 *   serverSeed: string,
 *   salt: string,
 *   commitHash: string,
 *   clientSeed?: string,
 *   nonce?: number|string,
 *   deckFingerprint?: string,
 *   finalDeck?: Array<{ rank: number, suit: number }>,
 *   tableId?: string,
 *   handId?: string,
 *   proofToken?: string,
 * }} proof
 * @returns {{
 *   ok: boolean,
 *   commitOk: boolean,
 *   deckOk: boolean,
 *   proofOk: boolean,
 *   expectedFingerprint?: string,
 *   reasons: string[],
 * }}
 */
export function verifyFairShuffle(proof) {
  const reasons = [];
  const commitOk = verifyCommit(proof.serverSeed, proof.salt, proof.commitHash);
  if (!commitOk) reasons.push('commit_mismatch');

  let deckOk = true;
  let expectedFingerprint;
  if (proof.finalDeck || proof.deckFingerprint) {
    const rebuilt = fairShuffle({
      serverSeed: proof.serverSeed,
      salt: proof.salt,
      clientSeed: proof.clientSeed || 'tea-parlor',
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

  let proofOk = true;
  if (proof.proofToken) {
    const expected = computeProofToken({
      serverSeed: proof.serverSeed,
      tableId: proof.tableId,
      handId: proof.handId,
      commitHash: proof.commitHash,
      nonce: proof.nonce,
    });
    if (expected !== proof.proofToken) {
      proofOk = false;
      reasons.push('proof_token_mismatch');
    }
  }

  return {
    ok: commitOk && deckOk && proofOk,
    commitOk,
    deckOk,
    proofOk,
    expectedFingerprint,
    reasons,
  };
}

/**
 * 开局只返回公开部分（不含 serverSeed）
 * @param {FairShuffleResult} full
 */
export function toPublicFairProof(full) {
  return {
    commitHash: full.commitHash,
    publicCode: full.publicCode,
    clientSeed: full.clientSeed,
    nonce: full.nonce,
    // salt / serverSeed / deckFingerprint 局后公布
  };
}

/**
 * 局后公布完整验证材料
 * @param {FairShuffleResult} full
 */
export function toRevealFairProof(full) {
  return {
    commitHash: full.commitHash,
    publicCode: full.publicCode,
    serverSeed: full.serverSeed,
    salt: full.salt,
    clientSeed: full.clientSeed,
    nonce: full.nonce,
    deckFingerprint: full.deckFingerprint,
    proofToken: full.proofToken,
  };
}
