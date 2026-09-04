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

export const GoldLedgerType = {
  RECHARGE: 'recharge',
  GAME_WIN: 'game_win',
  GAME_LOSE: 'game_lose',
  TABLE_FEE: 'table_fee',
  SHARE: 'share',
  INVITE_SUCCESS: 'invite_success',
  NEWBIE_INVITE: 'newbie_invite',
  NEWBIE_ORGANIC: 'newbie_organic',
  RELIEF: 'relief',
  INVITE_MILESTONE: 'invite_milestone',
  DAILY_SUPPLY: 'daily_supply',
};

export const DailySupplyPolicy = Object.freeze({
  LIMIT: 4,
  AMOUNT: 4000,
  TIME_ZONE: 'Asia/Shanghai',
});

export const InviteGoldPolicy = Object.freeze({
  SHARE_DAILY_AMOUNT: 1000,
  INVITE_SUCCESS_AMOUNT: 4000,
  NEWBIE_INVITE_AMOUNT: 2000,
  NEWBIE_ORGANIC_AMOUNT: 1000,
  RELIEF_DAILY_AMOUNT: 800,
  RELIEF_THRESHOLD: 1,
  BIND_WINDOW_MS: 10 * 60 * 1000,
  BIND_WINDOW_LIMIT: 8,
  MILESTONES: Object.freeze([
    { count: 3, amount: 0 },
    { count: 5, amount: 2000 },
    { count: 10, amount: 5000 },
  ]),
});

export const PLATFORM_USER_ID = 'ops:platform';

export {
  attachFilePersistence,
  readWalletSnapshot,
  writeWalletSnapshot,
} from './persistence.js';
import { attachFilePersistence } from './persistence.js';

export function createWalletService(options = {}) {
  return new WalletService(options);
}

/**
 * 创建带文件持久化的钱包服务（评审 P0 #2）。
 * options.file 必填：快照文件路径。启动时加载已有快照，
 * 任何余额/流水变更后原子写盘，进程重启不丢账本。
 */
export function createPersistentWalletService(options = {}) {
  const { file, logger, ...walletOptions } = options;
  return attachFilePersistence(new WalletService(walletOptions), file, { logger });
}

export class WalletService {
  constructor(options = {}) {
    this.accounts = new Map();
    this.ledgerEntries = [];
    this.users = new Map();
    this.goldLedger = [];
    this.notifications = [];
    this.inviteRiskLogs = [];
    this.inviteRewardReviews = new Map();
    this.inviteQualifyResults = new Set();
    this.newbieGrantResults = new Set();
    this.inviteMilestoneResults = new Set();
    this.idempotencyResults = new Map();
    this.locksByReference = new Map();
    this.nextEntryId = 1;
    this.clock = options.clock || (() => new Date().toISOString());
    this.failureCacheTtlMs = options.failureCacheTtlMs ?? 60_000;
    this.inviteBindWindowMs = options.inviteBindWindowMs ?? InviteGoldPolicy.BIND_WINDOW_MS;
    this.inviteBindWindowLimit = options.inviteBindWindowLimit ?? InviteGoldPolicy.BIND_WINDOW_LIMIT;
  }

  getAccount(userId, unit = Currency.SHADOW_POINTS) {
    const account = this.#ensureAccount(userId, unit);
    return snapshotAccount(account);
  }

  getUser(userId) {
    return snapshotUser(this.#ensureUser(userId));
  }

  registerUser({ userId, startParam = '', idempotencyKey = null, ip = '', deviceHash = '', source = 'unknown' } = {}) {
    assertUserId(userId);
    const inviterId = parseInviteStartParam(startParam);
    const key = idempotencyKey || `gold:newbie:${userId}`;

    return this.#idempotent(key, () => {
      const user = this.#ensureUser(userId);
      let bindResult = { ok: true, bound: false, reason: user.referredBy ? 'already_bound' : 'no_invite_param' };
      let grantResult = null;

      if (inviterId) {
        bindResult = this.#bindInvite({ userId, inviterId, ip, deviceHash, source });
      }

      const freshUser = this.#ensureUser(userId);
      if (!this.newbieGrantResults.has(userId)) {
        if (freshUser.referredBy) {
          grantResult = this.#creditGold({
            userId,
            amount: InviteGoldPolicy.NEWBIE_INVITE_AMOUNT,
            type: GoldLedgerType.NEWBIE_INVITE,
            refUserId: freshUser.referredBy,
            idempotencyKey: `gold:newbie_invite:${userId}`,
            extraJson: { policy: 'first_login_invite_newbie_gift' },
          });
        } else {
          grantResult = this.#creditGold({
            userId,
            amount: InviteGoldPolicy.NEWBIE_ORGANIC_AMOUNT,
            type: GoldLedgerType.NEWBIE_ORGANIC,
            idempotencyKey: `gold:newbie_organic:${userId}`,
            extraJson: { policy: 'first_login_organic_newbie_gift' },
          });
        }
        this.newbieGrantResults.add(userId);
      }

      return {
        ok: true,
        user: snapshotUser(this.#ensureUser(userId)),
        bind: bindResult,
        grant: grantResult,
        account: this.getAccount(userId),
      };
    });
  }

  bindInvite({ userId, inviterId, startParam = '', ip = '', deviceHash = '', source = 'unknown' } = {}) {
    assertUserId(userId);
    const parsedInviterId = inviterId || parseInviteStartParam(startParam);
    assertUserId(parsedInviterId);
    return this.#bindInvite({ userId, inviterId: parsedInviterId, ip, deviceHash, source });
  }

  claimShareReward({ userId, date = currentDateKey(this.clock()), idempotencyKey } = {}) {
    assertUserId(userId);
    const normalizedDate = sanitizeDate(date);
    const key = idempotencyKey || `gold:share:${userId}:${normalizedDate}`;

    return this.#idempotent(key, () => {
      const user = this.#ensureUser(userId);
      if (user.shareRewardDate === normalizedDate) {
        return {
          ok: false,
          reason: 'share_reward_already_claimed_today',
          user: snapshotUser(user),
          account: this.getAccount(userId),
        };
      }
      const credit = this.#creditGold({
        userId,
        amount: InviteGoldPolicy.SHARE_DAILY_AMOUNT,
        type: GoldLedgerType.SHARE,
        idempotencyKey: key,
        extraJson: { date: normalizedDate, policy: 'one_share_reward_per_natural_day' },
      });
      user.shareRewardDate = normalizedDate;
      return {
        ok: true,
        amount: InviteGoldPolicy.SHARE_DAILY_AMOUNT,
        user: snapshotUser(user),
        account: credit.account,
        ledgerEntry: credit.goldLedgerEntry,
      };
    });
  }

  qualifyInvite({ inviteeUserId, idempotencyKey } = {}) {
    assertUserId(inviteeUserId);
    const key = idempotencyKey || `gold:invite_success:${inviteeUserId}`;

    return this.#idempotent(key, () => {
      const invitee = this.#ensureUser(inviteeUserId);
      if (!invitee.referredBy) {
        return { ok: false, reason: 'invitee_not_bound', invitee: snapshotUser(invitee) };
      }
      if (this.inviteQualifyResults.has(inviteeUserId)) {
        return { ok: false, reason: 'invite_success_already_credited', invitee: snapshotUser(invitee) };
      }
      if (invitee.inviteRiskStatus === 'abnormal') {
        const review = this.#queueInviteRewardReview({
          inviteeUserId,
          inviterUserId: invitee.referredBy,
          reason: invitee.inviteRiskReason || 'abnormal_invite_bind_rate',
        });
        return {
          ok: true,
          pendingReview: true,
          pending_review: true,
          reason: 'invite_reward_pending_review',
          review,
          invitee: snapshotUser(invitee),
        };
      }

      return this.#payInviteSuccessReward(invitee, key, { policy: 'invitee_finished_first_round' });
    });
  }

  approveInviteReward({ reviewId, inviteeUserId, operatorId = 'ops', reason = '', idempotencyKey } = {}) {
    const review = this.#resolveInviteReview(reviewId, inviteeUserId);
    if (!review) return { ok: false, reason: 'invite_review_not_found' };
    if (review.status === 'paid') return { ok: false, reason: 'invite_success_already_credited', review: { ...review } };
    if (review.status === 'frozen') return { ok: false, reason: 'invite_reward_frozen', review: { ...review } };
    const invitee = this.#ensureUser(review.inviteeUserId);
    if (this.inviteQualifyResults.has(invitee.userId)) return { ok: false, reason: 'invite_success_already_credited', review: { ...review } };
    const paid = this.#payInviteSuccessReward(invitee, idempotencyKey || `gold:invite_success:${invitee.userId}:manual:${review.id}`, {
      policy: 'ops_manual_invite_reward_approval',
      operatorId: sanitizeText(operatorId),
      reviewId: review.id,
      reason: sanitizeReviewReason(reason),
    });
    review.status = 'paid';
    review.paidAt = this.clock();
    review.operatorId = sanitizeText(operatorId);
    review.reason = sanitizeReviewReason(reason);
    review.ledgerEntryId = paid.ledgerEntry?.id || null;
    return { ok: true, review: { ...review }, ...paid };
  }

  freezeInviteReward({ ledgerId, reason, operatorId = 'ops', idempotencyKey } = {}) {
    const cleanReason = sanitizeReviewReason(reason);
    if (!cleanReason) return { ok: false, reason: 'freeze_reason_required' };
    const entry = this.goldLedger.find((item) => item.id === ledgerId);
    if (!entry || entry.type !== GoldLedgerType.INVITE_SUCCESS || Number(entry.amount) <= 0) {
      return { ok: false, reason: 'invite_success_ledger_not_found' };
    }
    if (this.goldLedger.some((item) => item.extraJson?.reversalOf === ledgerId)) {
      return { ok: false, reason: 'invite_reward_already_frozen' };
    }
    const reversal = this.#adjustGoldBalance({
      userId: entry.userId,
      amount: -Number(entry.amount),
      type: GoldLedgerType.INVITE_SUCCESS,
      refUserId: entry.refUserId,
      idempotencyKey: idempotencyKey || `gold:invite_success:freeze:${ledgerId}`,
      extraJson: {
        policy: 'ops_invite_reward_freeze_reversal',
        reversalOf: ledgerId,
        operatorId: sanitizeText(operatorId),
        reason: cleanReason,
      },
    });
    const review = this.#queueInviteRewardReview({
      inviteeUserId: entry.refUserId,
      inviterUserId: entry.userId,
      reason: cleanReason,
      status: 'frozen',
    });
    review.frozenAt = this.clock();
    review.status = 'frozen';
    review.reason = cleanReason;
    review.operatorId = sanitizeText(operatorId);
    review.reversalLedgerEntryId = reversal.goldLedgerEntry.id;
    return { ok: true, review: { ...review }, reversal };
  }

  claimRelief({ userId, date = currentDateKey(this.clock()), idempotencyKey } = {}) {
    assertUserId(userId);
    const normalizedDate = sanitizeDate(date);
    const key = idempotencyKey || `gold:relief:${userId}:${normalizedDate}`;

    return this.#idempotent(key, () => {
      const account = this.getAccount(userId);
      if (account.available >= InviteGoldPolicy.RELIEF_THRESHOLD) {
        return { ok: false, reason: 'relief_balance_not_low_enough', account };
      }
      const credit = this.#creditGold({
        userId,
        amount: InviteGoldPolicy.RELIEF_DAILY_AMOUNT,
        type: GoldLedgerType.RELIEF,
        idempotencyKey: key,
        extraJson: { date: normalizedDate, policy: 'one_relief_grant_per_day' },
      });
      return {
        ok: true,
        amount: InviteGoldPolicy.RELIEF_DAILY_AMOUNT,
        account: credit.account,
        ledgerEntry: credit.goldLedgerEntry,
      };
    });
  }

  getDailySupplyStatus({ userId } = {}) {
    assertUserId(userId);
    const date = currentDateKey(this.clock());
    const user = this.#ensureUser(userId);
    const claimed = user.dailySupplyDate === date
      ? (Number(user.dailySupplyCount) || 0)
      : 0;
    const limit = DailySupplyPolicy.LIMIT;
    const remaining = Math.max(0, limit - claimed);
    return {
      ok: true,
      date,
      claimed,
      remaining,
      limit,
      amount: DailySupplyPolicy.AMOUNT,
      account: this.getAccount(userId),
    };
  }

  claimDailySupply({ userId, idempotencyKey } = {}) {
    assertUserId(userId);
    const date = currentDateKey(this.clock());
    const user = this.#ensureUser(userId);
    if (user.dailySupplyDate !== date) {
      user.dailySupplyDate = date;
      user.dailySupplyCount = 0;
    }
    const claimed = Number(user.dailySupplyCount) || 0;
    if (claimed >= DailySupplyPolicy.LIMIT) {
      return {
        ...this.getDailySupplyStatus({ userId }),
        ok: false,
        reason: 'daily_supply_exhausted',
      };
    }
    const nextIndex = claimed + 1;
    const key = idempotencyKey || `gold:daily_supply:${userId}:${date}:${nextIndex}`;

    return this.#idempotent(key, () => {
      const fresh = this.#ensureUser(userId);
      if (fresh.dailySupplyDate !== date) {
        fresh.dailySupplyDate = date;
        fresh.dailySupplyCount = 0;
      }
      const currentCount = Number(fresh.dailySupplyCount) || 0;
      if (currentCount >= DailySupplyPolicy.LIMIT) {
        return {
          ...this.getDailySupplyStatus({ userId }),
          ok: false,
          reason: 'daily_supply_exhausted',
        };
      }
      const claimIndex = currentCount + 1;
      const credit = this.#creditGold({
        userId,
        amount: DailySupplyPolicy.AMOUNT,
        type: GoldLedgerType.DAILY_SUPPLY,
        idempotencyKey: `gold:daily_supply:${userId}:${date}:${claimIndex}`,
        extraJson: {
          date,
          claimIndex,
          policy: 'daily_supply_4x_shanghai_shadow_non_withdrawable',
        },
      });
      fresh.dailySupplyCount = claimIndex;
      fresh.dailySupplyDate = date;
      const status = this.getDailySupplyStatus({ userId });
      return {
        ...status,
        ok: true,
        amount: DailySupplyPolicy.AMOUNT,
        claimIndex,
        account: credit.account,
        ledgerEntry: credit.goldLedgerEntry,
      };
    });
  }

  recordGoldPurchaseCredit({
    userId,
    amount,
    idempotencyKey,
    asset = 'USDT',
    provider = 'payment_adapter_placeholder',
    externalOrderId = '',
    metadata = {},
  } = {}) {
    assertUserId(userId);
    assertPositiveAmount(amount);
    assertIdempotencyKey(idempotencyKey);
    const normalizedAsset = assertPurchaseAsset(asset);

    return this.#idempotent(idempotencyKey, () => {
      const credit = this.#creditGold({
        userId,
        amount,
        type: GoldLedgerType.RECHARGE,
        idempotencyKey,
        extraJson: {
          ...metadata,
          asset: normalizedAsset,
          provider: sanitizeText(provider),
          externalOrderId: sanitizeText(externalOrderId),
          policy: 'one_way_gold_purchase_no_withdrawal_no_transfer',
        },
      });
      return {
        ok: true,
        amount: normalizeAmount(amount),
        asset: normalizedAsset,
        account: credit.account,
        ledgerEntry: credit.goldLedgerEntry,
      };
    });
  }

  recordGoldGameLedger({ userId, amount, type, idempotencyKey, referenceId, metadata = {} } = {}) {
    assertUserId(userId);
    assertIdempotencyKey(idempotencyKey);
    if (![GoldLedgerType.GAME_WIN, GoldLedgerType.GAME_LOSE, GoldLedgerType.TABLE_FEE].includes(type)) {
      throw new Error('unsupported_gold_game_ledger_type');
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) === 0) throw new Error('non_zero_amount_required');
    return this.#idempotent(idempotencyKey, () => {
      const entry = this.#appendGoldLedgerEntry({
        userId,
        amount,
        type,
        extraJson: {
          ...metadata,
          referenceId: sanitizeText(referenceId),
          policy: 'audit_mirror_only_game_settlement_core_unchanged',
        },
      });
      return { ok: true, ledgerEntry: entry };
    });
  }

  getInviteSummary({ userId, inviteLink = '', date = currentDateKey(this.clock()) } = {}) {
    assertUserId(userId);
    const user = this.#ensureUser(userId);
    const normalizedDate = sanitizeDate(date);
    const inviteTypes = new Set([
      GoldLedgerType.SHARE,
      GoldLedgerType.INVITE_SUCCESS,
      GoldLedgerType.NEWBIE_INVITE,
      GoldLedgerType.NEWBIE_ORGANIC,
      GoldLedgerType.RELIEF,
      GoldLedgerType.INVITE_MILESTONE,
    ]);
    const totalInviteGold = this.goldLedger
      .filter((entry) => entry.userId === userId && inviteTypes.has(entry.type))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      ok: true,
      inviteLink,
      invite_link: inviteLink,
      validInviteCount: user.validInviteCount,
      valid_invite_count: user.validInviteCount,
      totalInviteGold: normalizeAmount(totalInviteGold),
      total_invite_gold: normalizeAmount(totalInviteGold),
      shareClaimedToday: user.shareRewardDate === normalizedDate,
      share_claimed_today: user.shareRewardDate === normalizedDate,
      milestones: InviteGoldPolicy.MILESTONES.map((milestone) => ({
        ...milestone,
        reached: user.validInviteCount >= milestone.count,
        claimed: this.inviteMilestoneResults.has(`${userId}:${milestone.count}`),
      })),
      recentInvites: [...this.users.values()]
        .filter((item) => item.referredBy === userId)
        .slice(-20)
        .reverse()
        .map((item) => ({
          userId: item.userId,
          user_id: item.userId,
          maskedName: maskInviteeName(item.userId),
          masked_name: maskInviteeName(item.userId),
          boundAt: item.inviteBoundAt,
          bound_at: item.inviteBoundAt,
          firstRoundCompleted: this.inviteQualifyResults.has(item.userId),
          first_round_completed: this.inviteQualifyResults.has(item.userId),
          rewardSettled: this.goldLedger.some((entry) => (
            entry.userId === userId
            && entry.refUserId === item.userId
            && entry.type === GoldLedgerType.INVITE_SUCCESS
          )),
          reward_settled: this.goldLedger.some((entry) => (
            entry.userId === userId
            && entry.refUserId === item.userId
            && entry.type === GoldLedgerType.INVITE_SUCCESS
          )),
        })),
      user: snapshotUser(user),
      account: this.getAccount(userId),
    };
  }

  queryGoldLedger(filter = {}) {
    const limit = Number(filter.limit) || this.goldLedger.length;
    return this.goldLedger
      .filter((entry) => !filter.userId || entry.userId === filter.userId)
      .filter((entry) => !filter.type || entry.type === filter.type)
      .filter((entry) => !filter.refUserId || entry.refUserId === filter.refUserId)
      .slice(-limit)
      .map(snapshotGoldLedgerEntry);
  }

  listInvitees({ inviterUserId, limit = 100 } = {}) {
    assertUserId(inviterUserId);
    return [...this.users.values()]
      .filter((user) => user.referredBy === inviterUserId)
      .slice(-Number(limit || 100))
      .reverse()
      .map((user) => ({
        userId: user.userId,
        user_id: user.userId,
        maskedName: maskInviteeName(user.userId),
        masked_name: maskInviteeName(user.userId),
        referredBy: user.referredBy,
        referred_by: user.referredBy,
        inviteBoundAt: user.inviteBoundAt,
        invite_bound_at: user.inviteBoundAt,
        firstGameFinishedAt: user.firstGameFinishedAt,
        first_game_finished_at: user.firstGameFinishedAt,
        riskStatus: user.inviteRiskStatus || 'normal',
        risk_status: user.inviteRiskStatus || 'normal',
        riskReason: user.inviteRiskReason || null,
        risk_reason: user.inviteRiskReason || null,
        rewardSettled: this.inviteQualifyResults.has(user.userId),
        reward_settled: this.inviteQualifyResults.has(user.userId),
        pendingReview: [...this.inviteRewardReviews.values()].find((review) => review.inviteeUserId === user.userId) || null,
      }));
  }

  listInviteRewardReviews(filter = {}) {
    return [...this.inviteRewardReviews.values()]
      .filter((review) => !filter.status || review.status === filter.status)
      .filter((review) => !filter.inviterUserId || review.inviterUserId === filter.inviterUserId)
      .filter((review) => !filter.inviteeUserId || review.inviteeUserId === filter.inviteeUserId)
      .slice(-Number(filter.limit || this.inviteRewardReviews.size || 100))
      .map((review) => ({ ...review }));
  }

  queryNotifications(filter = {}) {
    const limit = Number(filter.limit) || this.notifications.length;
    return this.notifications
      .filter((entry) => !filter.userId || entry.userId === filter.userId)
      .slice(-limit)
      .map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } }));
  }

  queryInviteRiskLogs(filter = {}) {
    const limit = Number(filter.limit) || this.inviteRiskLogs.length;
    return this.inviteRiskLogs
      .filter((entry) => !filter.userId || entry.userId === filter.userId)
      .filter((entry) => !filter.refUserId || entry.refUserId === filter.refUserId)
      .slice(-limit)
      .map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } }));
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
        inviteResults: this.#completeFirstGamesForInvitees({
          intent,
          participants,
          participantMeta: options.participantMeta || options.players || [],
        }),
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
      users: [...this.users.values()].map((user) => ({ ...user })),
      goldLedger: this.goldLedger.map((entry) => ({
        ...entry,
        extraJson: { ...(entry.extraJson || {}) },
      })),
      notifications: this.notifications.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } })),
      inviteRiskLogs: this.inviteRiskLogs.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } })),
      inviteRewardReviews: [...this.inviteRewardReviews.entries()].map(([key, value]) => [key, { ...value }]),
      inviteQualifyResults: [...this.inviteQualifyResults],
      newbieGrantResults: [...this.newbieGrantResults],
      inviteMilestoneResults: [...this.inviteMilestoneResults],
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
    this.users = new Map();
    for (const user of snapshot.users || []) {
      if (!user?.userId && !user?.user_id) continue;
      const record = normalizeUserRecord(user);
      this.users.set(record.userId, record);
    }
    this.goldLedger = Array.isArray(snapshot.goldLedger)
      ? snapshot.goldLedger.map((entry) => ({
        ...entry,
        userId: entry.userId || entry.user_id,
        refUserId: entry.refUserId || entry.ref_user_id || null,
        extraJson: { ...(entry.extraJson || entry.extra_json || {}) },
        createdAt: entry.createdAt || entry.created_at,
      }))
      : [];
    this.notifications = Array.isArray(snapshot.notifications)
      ? snapshot.notifications.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } }))
      : [];
    this.inviteRiskLogs = Array.isArray(snapshot.inviteRiskLogs)
      ? snapshot.inviteRiskLogs.map((entry) => ({ ...entry, metadata: { ...(entry.metadata || {}) } }))
      : [];
    this.inviteRewardReviews = new Map((snapshot.inviteRewardReviews || []).map(([key, value]) => [key, { ...value }]));
    this.inviteQualifyResults = new Set(snapshot.inviteQualifyResults || []);
    this.newbieGrantResults = new Set(snapshot.newbieGrantResults || []);
    this.inviteMilestoneResults = new Set(snapshot.inviteMilestoneResults || []);
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

  #ensureUser(userId) {
    assertUserId(userId);
    if (!this.users.has(userId)) {
      this.users.set(userId, normalizeUserRecord({ userId }));
    }
    return this.users.get(userId);
  }

  #bindInvite({ userId, inviterId, ip = '', deviceHash = '', source = 'unknown' }) {
    const invitee = this.#ensureUser(userId);
    const inviter = this.#ensureUser(inviterId);
    this.#appendInviteRiskLog({
      userId: invitee.userId,
      refUserId: inviter.userId,
      ip,
      deviceHash,
      source,
      result: invitee.userId === inviter.userId
        ? 'cannot_bind_self'
        : invitee.referredBy
          ? 'invite_already_bound'
          : 'attempt',
    });
    if (invitee.userId === inviter.userId) {
      return { ok: false, bound: false, reason: 'cannot_bind_self', user: snapshotUser(invitee) };
    }
    if (invitee.referredBy) {
      return { ok: false, bound: false, reason: 'invite_already_bound', user: snapshotUser(invitee) };
    }
    invitee.referredBy = inviter.userId;
    invitee.inviteBoundAt = this.clock();
    const bindRate = this.#inviteBindRate(inviter.userId);
    if (bindRate.count > this.inviteBindWindowLimit) {
      invitee.inviteRiskStatus = 'abnormal';
      invitee.inviteRiskReason = 'abnormal_invite_bind_rate';
    }
    this.#appendInviteRiskLog({
      userId: invitee.userId,
      refUserId: inviter.userId,
      ip,
      deviceHash,
      source,
      result: invitee.inviteRiskStatus === 'abnormal' ? 'abnormal' : 'bound',
      metadata: {
        bindWindowMs: this.inviteBindWindowMs,
        bindWindowLimit: this.inviteBindWindowLimit,
        bindWindowCount: bindRate.count,
      },
    });
    this.#appendNotification({
      userId: inviter.userId,
      type: 'invite_entered',
      title: '好友进入游戏室',
      body: '有好友通过你的链接进入游戏室',
      metadata: { inviteeUserId: invitee.userId },
    });
    return { ok: true, bound: true, user: snapshotUser(invitee) };
  }

  #inviteBindRate(inviterUserId) {
    const current = Date.parse(this.clock());
    const since = current - this.inviteBindWindowMs;
    const count = [...this.users.values()].filter((user) => (
      user.referredBy === inviterUserId
      && user.inviteBoundAt
      && Date.parse(user.inviteBoundAt) >= since
      && Date.parse(user.inviteBoundAt) <= current
    )).length;
    return { count, since: new Date(since).toISOString() };
  }

  #payInviteSuccessReward(invitee, idempotencyKey, extraJson = {}) {
    const inviter = this.#ensureUser(invitee.referredBy);
    const credit = this.#creditGold({
      userId: inviter.userId,
      amount: InviteGoldPolicy.INVITE_SUCCESS_AMOUNT,
      type: GoldLedgerType.INVITE_SUCCESS,
      refUserId: invitee.userId,
      idempotencyKey,
      extraJson,
    });
    this.inviteQualifyResults.add(invitee.userId);
    inviter.validInviteCount += 1;
    const milestones = this.#claimInviteMilestones(inviter);
    this.#appendNotification({
      userId: inviter.userId,
      type: 'invite_success_paid',
      title: '邀请奖励到账',
      body: '好友已完成首局，4000 金币已到账',
      metadata: { inviteeUserId: invitee.userId, amount: InviteGoldPolicy.INVITE_SUCCESS_AMOUNT },
    });

    return {
      ok: true,
      inviter: snapshotUser(inviter),
      invitee: snapshotUser(invitee),
      account: credit.account,
      ledgerEntry: credit.goldLedgerEntry,
      milestones,
    };
  }

  #queueInviteRewardReview({ inviteeUserId, inviterUserId, reason, status = 'pending_review' }) {
    const key = `invite_reward:${inviteeUserId}`;
    const current = this.inviteRewardReviews.get(key);
    if (current) return current;
    const review = {
      id: key,
      inviteeUserId,
      inviterUserId,
      status,
      reason: sanitizeReviewReason(reason),
      amount: InviteGoldPolicy.INVITE_SUCCESS_AMOUNT,
      createdAt: this.clock(),
      policy: 'manual_review_before_invite_success_credit',
    };
    this.inviteRewardReviews.set(key, review);
    return review;
  }

  #resolveInviteReview(reviewId, inviteeUserId) {
    const key = reviewId || (inviteeUserId ? `invite_reward:${inviteeUserId}` : '');
    return key ? this.inviteRewardReviews.get(key) : null;
  }

  #adjustGoldBalance({ userId, amount, type, idempotencyKey, refUserId = null, extraJson = {} }) {
    assertUserId(userId);
    assertGoldLedgerType(type);
    assertIdempotencyKey(idempotencyKey);
    if (!Number.isFinite(Number(amount)) || Number(amount) === 0) throw new Error('non_zero_amount_required');
    return this.#idempotent(idempotencyKey, () => {
      const account = this.#ensureAccount(userId);
      const delta = normalizeAmount(amount);
      if (account.available + delta < 0) {
        return { ok: false, reason: 'insufficient_available_balance_for_reversal', account: snapshotAccount(account) };
      }
      account.available += delta;
      const ledgerEntry = this.#appendEntry({
        userId,
        type: LedgerEntryType.ISSUE,
        amount: delta,
        availableDelta: delta,
        lockedDelta: 0,
        idempotencyKey,
        referenceType: 'gold_reward_adjustment',
        referenceId: extraJson.reversalOf || type,
        metadata: {
          ...extraJson,
          goldLedgerType: type,
          refUserId,
          policy: extraJson.policy || 'gold_reward_adjustment_with_ledger',
        },
      });
      ledgerEntry.balanceAfter = account.available;
      ledgerEntry.lockedAfter = account.locked;
      const goldLedgerEntry = this.#appendGoldLedgerEntry({
        userId,
        amount: delta,
        type,
        refUserId,
        extraJson,
        sourceLedgerEntryId: ledgerEntry.id,
      });
      return { ok: true, account: snapshotAccount(account), ledgerEntries: [ledgerEntry], goldLedgerEntry };
    });
  }

  #completeFirstGamesForInvitees({ intent, participants, participantMeta = [] }) {
    const metaByUserId = new Map(
      (Array.isArray(participantMeta) ? participantMeta : [])
        .map((item, index) => [String(item.userId || item.user_id || item.id || participants[index] || ''), item])
        .filter(([userId]) => userId)
    );
    const results = [];
    for (const userId of participants) {
      const meta = metaByUserId.get(userId) || {};
      if (isBotParticipant(userId, meta)) {
        results.push({ ok: false, userId, reason: 'bot_participant_skipped' });
        continue;
      }
      const user = this.#ensureUser(userId);
      if (!user.referredBy) {
        results.push({ ok: false, userId, reason: 'invitee_not_bound' });
        continue;
      }
      if (user.firstGameFinishedAt) {
        results.push({ ok: false, userId, reason: 'first_game_already_finished' });
        continue;
      }
      user.firstGameFinishedAt = this.clock();
      const qualify = this.qualifyInvite({
        inviteeUserId: userId,
        idempotencyKey: `gold:invite_success:${userId}`,
      });
      results.push({
        ok: qualify.ok,
        userId,
        inviterUserId: user.referredBy,
        inviter_user_id: user.referredBy,
        firstGameFinishedAt: user.firstGameFinishedAt,
        first_game_finished_at: user.firstGameFinishedAt,
        roundId: intent.roundId || null,
        roomId: intent.roomId || null,
        gameId: intent.gameId || null,
        reason: qualify.reason || null,
        ledgerEntry: qualify.ledgerEntry || null,
        milestones: qualify.milestones || [],
      });
    }
    return results;
  }

  #creditGold({ userId, amount, type, idempotencyKey, refUserId = null, extraJson = {} }) {
    assertGoldLedgerType(type);
    const result = this.issuePoints({
      userId,
      amount,
      idempotencyKey,
      reason: `gold_${type}`,
      metadata: {
        ...extraJson,
        goldLedgerType: type,
        refUserId,
        policy: extraJson.policy || 'gold_balance_non_withdrawable',
      },
    });
    const entry = this.#appendGoldLedgerEntry({
      userId,
      amount,
      type,
      refUserId,
      extraJson,
      sourceLedgerEntryId: result.ledgerEntries?.[0]?.id || null,
    });
    return { ...result, goldLedgerEntry: entry };
  }

  #claimInviteMilestones(user) {
    const credits = [];
    for (const milestone of InviteGoldPolicy.MILESTONES) {
      const key = `${user.userId}:${milestone.count}`;
      if (user.validInviteCount < milestone.count || this.inviteMilestoneResults.has(key)) continue;
      let credit = null;
      if (milestone.amount > 0) {
        credit = this.#creditGold({
          userId: user.userId,
          amount: milestone.amount,
          type: GoldLedgerType.INVITE_MILESTONE,
          idempotencyKey: `gold:invite_milestone:${user.userId}:${milestone.count}`,
          extraJson: {
            milestoneCount: milestone.count,
            policy: 'valid_invite_count_milestone',
          },
        });
      }
      this.inviteMilestoneResults.add(key);
      if (credit) credits.push(credit.goldLedgerEntry);
    }
    return credits;
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

  #appendGoldLedgerEntry(entry) {
    const goldEntry = {
      id: `gold_ledger_${this.goldLedger.length + 1}`,
      userId: entry.userId,
      amount: normalizeAmount(entry.amount),
      type: entry.type,
      refUserId: entry.refUserId || null,
      extraJson: { ...(entry.extraJson || {}) },
      createdAt: this.clock(),
      sourceLedgerEntryId: entry.sourceLedgerEntryId || null,
    };
    this.goldLedger.push(goldEntry);
    return snapshotGoldLedgerEntry(goldEntry);
  }

  #appendNotification(entry) {
    const notification = {
      id: `notification_${this.notifications.length + 1}`,
      userId: entry.userId,
      type: entry.type,
      title: entry.title,
      body: entry.body,
      metadata: { ...(entry.metadata || {}) },
      createdAt: this.clock(),
      readAt: null,
    };
    this.notifications.push(notification);
    return { ...notification, metadata: { ...notification.metadata } };
  }

  #appendInviteRiskLog(entry) {
    const riskLog = {
      id: `invite_risk_${this.inviteRiskLogs.length + 1}`,
      userId: entry.userId,
      refUserId: entry.refUserId,
      ip: sanitizeRiskValue(entry.ip),
      deviceHash: sanitizeRiskValue(entry.deviceHash),
      source: sanitizeRiskValue(entry.source),
      result: sanitizeRiskValue(entry.result),
      metadata: { ...(entry.metadata || {}) },
      createdAt: this.clock(),
    };
    this.inviteRiskLogs.push(riskLog);
    return { ...riskLog };
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

function normalizeUserRecord(user) {
  return {
    userId: String(user.userId || user.user_id),
    referredBy: user.referredBy || user.referred_by || null,
    inviteBoundAt: user.inviteBoundAt || user.invite_bound_at || null,
    validInviteCount: Number(user.validInviteCount ?? user.valid_invite_count ?? 0) || 0,
    shareRewardDate: user.shareRewardDate || user.share_reward_date || null,
    firstGameFinishedAt: user.firstGameFinishedAt || user.first_game_finished_at || null,
    inviteRiskStatus: user.inviteRiskStatus || user.invite_risk_status || 'normal',
    inviteRiskReason: user.inviteRiskReason || user.invite_risk_reason || null,
    dailySupplyDate: user.dailySupplyDate || user.daily_supply_date || null,
    dailySupplyCount: Number(user.dailySupplyCount ?? user.daily_supply_count ?? 0) || 0,
  };
}

function snapshotUser(user) {
  return Object.freeze({
    userId: user.userId,
    user_id: user.userId,
    referredBy: user.referredBy,
    referred_by: user.referredBy,
    inviteBoundAt: user.inviteBoundAt,
    invite_bound_at: user.inviteBoundAt,
    validInviteCount: user.validInviteCount,
    valid_invite_count: user.validInviteCount,
    shareRewardDate: user.shareRewardDate,
    share_reward_date: user.shareRewardDate,
    firstGameFinishedAt: user.firstGameFinishedAt,
    first_game_finished_at: user.firstGameFinishedAt,
    inviteRiskStatus: user.inviteRiskStatus || 'normal',
    invite_risk_status: user.inviteRiskStatus || 'normal',
    inviteRiskReason: user.inviteRiskReason || null,
    invite_risk_reason: user.inviteRiskReason || null,
    dailySupplyDate: user.dailySupplyDate || null,
    daily_supply_date: user.dailySupplyDate || null,
    dailySupplyCount: Number(user.dailySupplyCount) || 0,
    daily_supply_count: Number(user.dailySupplyCount) || 0,
  });
}

function snapshotGoldLedgerEntry(entry) {
  return Object.freeze({
    id: entry.id,
    userId: entry.userId,
    user_id: entry.userId,
    amount: normalizeAmount(entry.amount),
    type: entry.type,
    refUserId: entry.refUserId || null,
    ref_user_id: entry.refUserId || null,
    extraJson: { ...(entry.extraJson || {}) },
    extra_json: { ...(entry.extraJson || {}) },
    createdAt: entry.createdAt,
    created_at: entry.createdAt,
    sourceLedgerEntryId: entry.sourceLedgerEntryId || null,
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

function assertGoldLedgerType(type) {
  if (!Object.values(GoldLedgerType).includes(type)) {
    throw new Error('unsupported_gold_ledger_type');
  }
}

function assertPurchaseAsset(asset) {
  const normalized = String(asset || '').toUpperCase();
  if (!['USDT', 'USDC'].includes(normalized)) {
    throw new Error('unsupported_purchase_asset');
  }
  return normalized;
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

function currentDateKey(isoString) {
  const raw = isoString || new Date().toISOString();
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return String(raw).slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DailySupplyPolicy.TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sanitizeDate(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('invalid_date');
  return text;
}

function parseInviteStartParam(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(?:inv|invite|ref)_([0-9]{1,20})$/);
  return match ? match[1] : '';
}

function maskInviteeName(userId) {
  const text = String(userId || '').trim();
  if (!text) return '玩家 ****';
  return `玩家 ****${text.slice(-4)}`;
}

function isBotParticipant(userId, meta = {}) {
  return Boolean(
    meta.isBot
    || meta.is_bot
    || meta.bot
    || String(userId || '').startsWith('bot-')
    || String(userId || '').startsWith('ai-')
  );
}

function sanitizeText(value) {
  return String(value || '').replace(/[^\w:.-]/g, '').slice(0, 96);
}

function sanitizeReviewReason(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
}

function sanitizeRiskValue(value) {
  return String(value || '').replace(/[^\w:./-]/g, '').slice(0, 128);
}
