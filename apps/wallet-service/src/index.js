export const Currency = {
  SHADOW_POINTS: 'SHADOW_POINTS',
  USDT_SHADOW: 'USDT_SHADOW',
  TON_SHADOW: 'TON_SHADOW',
  STARS: 'STARS',
  BTC_SHADOW: 'BTC_SHADOW',
};

export const CHIP_CURRENCIES = Object.freeze([
  { id: Currency.SHADOW_POINTS, label: '影子积分', withdrawable: false },
  { id: Currency.USDT_SHADOW, label: 'USDT', withdrawable: false },
  { id: Currency.TON_SHADOW, label: 'TON', withdrawable: false },
  { id: Currency.STARS, label: 'Telegram Stars', withdrawable: false },
  { id: Currency.BTC_SHADOW, label: 'BTC', withdrawable: false },
]);


export const LedgerEntryType = {
  ISSUE: 'issue',
  LOCK: 'lock',
  SETTLEMENT: 'settlement',
  RAKE: 'rake',
};

export const PLATFORM_USER_ID = 'ops:platform';

export function createWalletService(options = {}) {
  return new WalletService(options);
}

export class WalletService {
  constructor(options = {}) {
    this.accounts = new Map();
    this.ledgerEntries = [];
    this.idempotencyResults = new Map();
    this.locksByReference = new Map();
    this.nextEntryId = 1;
    this.clock = options.clock || (() => new Date().toISOString());
    this.failureCacheTtlMs = options.failureCacheTtlMs ?? 60_000;
  }

  getAccount(userId, unit = Currency.SHADOW_POINTS) {
    const account = this.#ensureAccount(userId, unit);
    return snapshotAccount(account);
  }

  issuePoints({ userId, amount, idempotencyKey, reason = 'internal_grant', metadata = {}, unit = Currency.SHADOW_POINTS }) {
    assertUserId(userId);
    assertPositiveAmount(amount);
    assertIdempotencyKey(idempotencyKey);
    const currency = assertChipCurrency(unit);

    return this.#idempotent(idempotencyKey, () => {
      const account = this.#ensureAccount(userId, currency);
      const entry = this.#appendEntry({
        userId,
        type: LedgerEntryType.ISSUE,
        amount,
        availableDelta: amount,
        lockedDelta: 0,
        idempotencyKey,
        referenceType: 'internal_shadow_points',
        referenceId: reason,
        metadata,
        currency,
      });
      account.available += amount;
      entry.balanceAfter = account.available;
      entry.lockedAfter = account.locked;
      return { ok: true, account: snapshotAccount(account), ledgerEntries: [entry] };
    });
  }

  lockPoints({ userId, amount, idempotencyKey, referenceId, metadata = {}, unit = Currency.SHADOW_POINTS }) {
    assertUserId(userId);
    assertPositiveAmount(amount);
    assertIdempotencyKey(idempotencyKey);
    assertReferenceId(referenceId);
    const currency = assertChipCurrency(unit);

    return this.#idempotent(idempotencyKey, () => {
      const account = this.#ensureAccount(userId, currency);
      if (account.available < amount) {
        return { ok: false, reason: 'insufficient_available_balance', account: snapshotAccount(account) };
      }

      account.available -= amount;
      account.locked += amount;
      this.#setLockedForReference(userId, referenceId, this.#getLockedForReference(userId, referenceId) + amount);

      const entry = this.#appendEntry({
        userId,
        type: LedgerEntryType.LOCK,
        amount,
        availableDelta: -amount,
        lockedDelta: amount,
        idempotencyKey,
        referenceType: 'game_round_lock',
        referenceId,
        metadata,
        currency,
      });
      entry.balanceAfter = account.available;
      entry.lockedAfter = account.locked;
      return { ok: true, account: snapshotAccount(account), ledgerEntries: [entry] };
    });
  }

  collectPlatformFee({
    fromUserId,
    amount,
    idempotencyKey,
    kind = 'gold_table_fee',
    currency = Currency.SHADOW_POINTS,
    referenceId,
    metadata = {},
    platformUserId = PLATFORM_USER_ID,
  }) {
    assertUserId(fromUserId);
    assertUserId(platformUserId);
    assertPositiveAmount(amount);
    assertIdempotencyKey(idempotencyKey);

    return this.#idempotent(idempotencyKey, () => {
      const payer = this.#ensureAccount(fromUserId);
      if (payer.available < amount) {
        return { ok: false, reason: 'insufficient_available_balance', account: snapshotAccount(payer) };
      }
      const fee = normalizeAmount(amount);
      const house = this.#ensureAccount(platformUserId);
      payer.available -= fee;
      house.available += fee;

      const payerEntry = this.#appendEntry({
        userId: fromUserId,
        type: LedgerEntryType.RAKE,
        amount: -fee,
        availableDelta: -fee,
        lockedDelta: 0,
        idempotencyKey: `${idempotencyKey}:payer`,
        referenceType: kind,
        referenceId: referenceId || idempotencyKey,
        metadata: { ...metadata, kind, currency, side: 'payer' },
      });
      payerEntry.balanceAfter = payer.available;
      payerEntry.lockedAfter = payer.locked;

      const houseEntry = this.#appendEntry({
        userId: platformUserId,
        type: LedgerEntryType.RAKE,
        amount: fee,
        availableDelta: fee,
        lockedDelta: 0,
        idempotencyKey: `${idempotencyKey}:house`,
        referenceType: kind,
        referenceId: referenceId || idempotencyKey,
        metadata: { ...metadata, kind, currency, side: 'platform', fromUserId },
      });
      houseEntry.balanceAfter = house.available;
      houseEntry.lockedAfter = house.locked;

      return {
        ok: true,
        fee,
        kind,
        payer: snapshotAccount(payer),
        platform: snapshotAccount(house),
        ledgerEntries: [payerEntry, houseEntry],
      };
    });
  }

  applySettlementIntent(intent, options = {}) {
    assertSettlementIntent(intent);
    assertIdempotencyKey(intent.idempotencyKey);
    const scoreSum = normalizeAmount(intent.scores.reduce((sum, score) => sum + Number(score || 0), 0));
    if (scoreSum !== 0) {
      return {
        ok: false,
        reason: 'settlement_scores_not_zero_sum',
        scoreSum,
        settlementId: intent.idempotencyKey,
      };
    }
    const participants = options.participants || intent.participants;
    if (!Array.isArray(participants) || participants.length !== intent.scores.length) {
      throw new Error('settlement_participants_must_match_scores');
    }
    participants.forEach(assertUserId);

    return this.#idempotent(intent.idempotencyKey, () => {
      const referenceId = intent.roundId || intent.roomId || intent.idempotencyKey;
      const planned = participants.map((userId, seatIndex) => {
        const account = this.#ensureAccount(userId);
        const lockedForRound = this.#getLockedForReference(userId, referenceId);
        const score = normalizeAmount(intent.scores[seatIndex]);
        const availableDelta = lockedForRound + score;
        const lockedDelta = -lockedForRound;

        if (account.available + availableDelta < 0) {
          return {
            ok: false,
            reason: 'insufficient_available_balance_for_settlement',
            userId,
            account: snapshotAccount(account),
          };
        }

        return {
          ok: true,
          userId,
          seatIndex,
          score,
          lockedForRound,
          availableDelta,
          lockedDelta,
        };
      });

      const failure = planned.find((item) => !item.ok);
      if (failure) return failure;

      const entries = [];
      for (const item of planned) {
        const account = this.#ensureAccount(item.userId);
        account.available += item.availableDelta;
        account.locked += item.lockedDelta;
        this.#setLockedForReference(item.userId, referenceId, 0);

        if (item.availableDelta !== 0 || item.lockedDelta !== 0) {
          const entry = this.#appendEntry({
            userId: item.userId,
            type: LedgerEntryType.SETTLEMENT,
            amount: item.score,
            availableDelta: item.availableDelta,
            lockedDelta: item.lockedDelta,
            idempotencyKey: intent.idempotencyKey,
            referenceType: 'game_settlement_intent',
            referenceId,
            metadata: {
              gameId: intent.gameId,
              roomId: intent.roomId,
              roundId: intent.roundId,
              seatIndex: item.seatIndex,
              lockedReleased: item.lockedForRound,
              winnerSide: intent.winnerSide,
              ledgerPolicy: intent.ledgerPolicy,
            },
          });
          entry.balanceAfter = account.available;
          entry.lockedAfter = account.locked;
          entries.push(entry);
        }
      }

      return {
        ok: true,
        settlementId: intent.idempotencyKey,
        accounts: Object.fromEntries(participants.map((userId) => [userId, this.getAccount(userId)])),
        ledgerEntries: entries,
      };
    });
  }

  queryLedger(filter = {}) {
    return this.ledgerEntries
      .filter((entry) => !filter.userId || entry.userId === filter.userId)
      .filter((entry) => !filter.type || entry.type === filter.type)
      .filter((entry) => !filter.referenceId || entry.referenceId === filter.referenceId)
      .map((entry) => ({ ...entry, metadata: { ...entry.metadata } }));
  }

  listAccounts(filter = {}) {
    return [...this.accounts.values()]
      .filter((account) => !filter.userId || account.userId === filter.userId)
      .map(snapshotAccount);
  }

  exportSnapshot() {
    return {
      nextEntryId: this.nextEntryId,
      accounts: [...this.accounts.values()].map((account) => ({
        userId: account.userId,
        currency: account.currency,
        available: account.available,
        locked: account.locked,
      })),
      ledgerEntries: this.ledgerEntries.map((entry) => ({
        ...entry,
        metadata: { ...(entry.metadata || {}) },
      })),
      locksByReference: [...this.locksByReference.entries()],
      idempotencyKeys: [...this.idempotencyResults.keys()],
      idempotencyResults: [...this.idempotencyResults.entries()].map(([key, value]) => [
        key,
        cloneJson(value),
      ]),
    };
  }

  importSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    this.accounts = new Map();
    for (const account of snapshot.accounts || []) {
      if (!account?.userId) continue;
      const currency = account.currency || Currency.SHADOW_POINTS;
      this.accounts.set(this.#accountKey(account.userId, currency), {
        userId: account.userId,
        currency,
        available: Number(account.available) || 0,
        locked: Number(account.locked) || 0,
      });
    }
    this.ledgerEntries = Array.isArray(snapshot.ledgerEntries)
      ? snapshot.ledgerEntries.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } }))
      : [];
    this.locksByReference = new Map(snapshot.locksByReference || []);
    this.nextEntryId = Number(snapshot.nextEntryId) || this.ledgerEntries.length + 1;
    this.idempotencyResults = new Map();
    if (Array.isArray(snapshot.idempotencyResults)) {
      for (const row of snapshot.idempotencyResults) {
        const key = Array.isArray(row) ? row[0] : row?.key;
        const value = Array.isArray(row) ? row[1] : row?.value;
        if (key && value && typeof value === 'object') {
          // 兼容新旧格式：新格式 {result, expiresAt}，旧格式直接 result
          const entry = value.result !== undefined
            ? { result: cloneJson(value.result), expiresAt: value.expiresAt ?? Infinity }
            : { result: cloneJson(value), expiresAt: Infinity };
          this.idempotencyResults.set(key, entry);
        }
      }
    }
    for (const key of snapshot.idempotencyKeys || []) {
      if (key && !this.idempotencyResults.has(key)) {
        this.idempotencyResults.set(key, { result: { ok: true, restored: true }, expiresAt: Infinity });
      }
    }
  }

  #accountKey(userId, unit) {
    return `${userId}:${unit || Currency.SHADOW_POINTS}`;
  }

  #ensureAccount(userId, unit = Currency.SHADOW_POINTS) {
    assertUserId(userId);
    const currency = assertChipCurrency(unit);
    const key = this.#accountKey(userId, currency);
    if (!this.accounts.has(key)) {
      this.accounts.set(key, {
        userId,
        currency,
        available: 0,
        locked: 0,
      });
    }
    return this.accounts.get(key);
  }

  #appendEntry(entry) {
    const ledgerEntry = {
      id: `ledger_${this.nextEntryId++}`,
      currency: entry.currency || Currency.SHADOW_POINTS,
      createdAt: this.clock(),
      balanceAfter: null,
      lockedAfter: null,
      metadata: {},
      ...entry,
    };
    this.ledgerEntries.push(ledgerEntry);
    return ledgerEntry;
  }

  #idempotent(idempotencyKey, fn) {
    const cached = this.idempotencyResults.get(idempotencyKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }
    if (cached) this.idempotencyResults.delete(idempotencyKey);

    const result = fn();
    const expiresAt = result.ok ? Infinity : Date.now() + this.failureCacheTtlMs;
    this.idempotencyResults.set(idempotencyKey, { result, expiresAt });
    return result;
  }

  #lockKey(userId, referenceId) {
    return `${userId}:${referenceId}`;
  }

  #getLockedForReference(userId, referenceId) {
    return this.locksByReference.get(this.#lockKey(userId, referenceId)) || 0;
  }

  #setLockedForReference(userId, referenceId, amount) {
    const key = this.#lockKey(userId, referenceId);
    if (amount > 0) this.locksByReference.set(key, amount);
    else this.locksByReference.delete(key);
  }
}

function snapshotAccount(account) {
  return Object.freeze({
    userId: account.userId,
    currency: account.currency,
    available: normalizeAmount(account.available),
    locked: normalizeAmount(account.locked),
    total: normalizeAmount(account.available + account.locked),
  });
}

function assertSettlementIntent(intent) {
  if (!intent || intent.type !== 'settlement_intent') {
    throw new Error('settlement_intent_required');
  }
  if (!Array.isArray(intent.scores) || intent.scores.length === 0) {
    throw new Error('settlement_scores_required');
  }
  intent.scores.forEach((score) => {
    if (!Number.isFinite(Number(score))) throw new Error('invalid_settlement_score');
  });
}

function assertUserId(userId) {
  if (!userId || typeof userId !== 'string') throw new Error('user_id_required');
}

function assertPositiveAmount(amount) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error('positive_amount_required');
  }
}

function assertIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new Error('idempotency_key_required');
  }
}

function assertReferenceId(referenceId) {
  if (!referenceId || typeof referenceId !== 'string') {
    throw new Error('reference_id_required');
  }
}


function assertChipCurrency(unit) {
  if (!unit) return Currency.SHADOW_POINTS;
  if (!Object.values(Currency).includes(unit)) {
    throw new Error('unsupported_chip_currency');
  }
  return unit;
}
function normalizeAmount(value) {
  return Number(Number(value).toFixed(8));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
