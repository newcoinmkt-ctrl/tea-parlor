import { createWalletService, LedgerEntryType } from '@tea-parlor/wallet-service';

export const BotCallback = {
  BALANCE: 'lobby:balance',
  RECORDS: 'lobby:records',
  SUPPORT: 'lobby:support',
  INVITE: 'lobby:invite',
};

export function createBotConfig(options = {}) {
  const miniAppUrl = options.miniAppUrl || process.env.MINI_APP_URL || 'http://localhost:5173';
  return Object.freeze({
    miniAppUrl,
    supportUrl: options.supportUrl || process.env.SUPPORT_URL || null,
    supportText: options.supportText || '请在客服入口留言，运营人员会在工作时间内处理。',
    inviteText: options.inviteText || '来 Tea Parlor H5 棋牌室一起打牌，当前仅使用内部试玩影子积分。',
    initialShadowPoints: options.initialShadowPoints ?? 3000,
  });
}

export function createBotServices(options = {}) {
  const walletService = options.walletService || createWalletService(options.walletOptions);
  const records = new Map(options.records || []);

  return {
    walletService,

    async getBalance(user) {
      const userId = telegramUserId(user);
      walletService.issuePoints({
        userId,
        amount: options.initialShadowPoints ?? 3000,
        idempotencyKey: `bot:shadow-points-grant:${userId}`,
        reason: 'bot_lobby_entry_grant',
        metadata: { surface: 'telegram_bot', policy: 'shadow_points_only' },
      });
      return walletService.getAccount(userId);
    },

    async getRecentRecords(user) {
      const userId = telegramUserId(user);
      return (records.get(userId) || defaultRecords()).slice(0, 5);
    },

    async getLedgerSummary(user) {
      const userId = telegramUserId(user);
      const ledger = walletService.queryLedger({ userId });
      return {
        total: ledger.length,
        issue: ledger.filter((entry) => entry.type === LedgerEntryType.ISSUE).length,
        lock: ledger.filter((entry) => entry.type === LedgerEntryType.LOCK).length,
        settlement: ledger.filter((entry) => entry.type === LedgerEntryType.SETTLEMENT).length,
      };
    },
  };
}

export function registerBotHandlers(bot, options = {}) {
  const config = createBotConfig(options);
  const services = options.services || createBotServices({
    initialShadowPoints: config.initialShadowPoints,
    records: options.records,
  });

  bot.start((ctx) => handleStart(ctx, { config }));
  bot.command('help', (ctx) => handleHelp(ctx, { config }));
  bot.command('balance', (ctx) => handleBalance(ctx, { services }));
  bot.command('records', (ctx) => handleRecords(ctx, { services }));
  bot.command('support', (ctx) => handleSupport(ctx, { config }));
  bot.command('invite', (ctx) => handleInvite(ctx, { config, botInfo: bot.botInfo }));

  bot.action(BotCallback.BALANCE, (ctx) => handleBalance(ctx, { services }));
  bot.action(BotCallback.RECORDS, (ctx) => handleRecords(ctx, { services }));
  bot.action(BotCallback.SUPPORT, (ctx) => handleSupport(ctx, { config }));
  bot.action(BotCallback.INVITE, (ctx) => handleInvite(ctx, { config, botInfo: bot.botInfo }));

  return { bot, config, services };
}

export async function handleStart(ctx, { config }) {
  return ctx.reply(buildStartText(ctx.from), {
    parse_mode: 'HTML',
    reply_markup: buildMainKeyboard(config),
  });
}

export async function handleHelp(ctx, { config }) {
  return ctx.reply(buildHelpText(), {
    parse_mode: 'HTML',
    reply_markup: buildMainKeyboard(config),
  });
}

export async function handleBalance(ctx, { services }) {
  await answerCallback(ctx, '积分已更新');
  const account = await services.getBalance(ctx.from);
  const summary = services.getLedgerSummary ? await services.getLedgerSummary(ctx.from) : null;
  return replyOrEdit(ctx, buildBalanceText(account, summary), { parse_mode: 'HTML' });
}

export async function handleRecords(ctx, { services }) {
  await answerCallback(ctx, '最近战绩');
  const records = await services.getRecentRecords(ctx.from);
  return replyOrEdit(ctx, buildRecordsText(records), { parse_mode: 'HTML' });
}

export async function handleSupport(ctx, { config }) {
  await answerCallback(ctx, '客服入口');
  return replyOrEdit(ctx, buildSupportText(config), {
    parse_mode: 'HTML',
    reply_markup: buildSupportKeyboard(config),
  });
}

export async function handleInvite(ctx, { config, botInfo }) {
  await answerCallback(ctx, '分享邀请');
  return replyOrEdit(ctx, buildInviteText(config, botInfo), {
    parse_mode: 'HTML',
    reply_markup: buildInviteKeyboard(config, botInfo),
  });
}

export function buildStartText(user = {}) {
  const name = escapeHtml(user.first_name || user.username || '玩家');
  return [
    `欢迎，<b>${name}</b>。`,
    '',
    '点开始打牌，进入 Tea Parlor H5 Mini App。',
    '<b>实时牌桌、叫分、出牌和托管都在 H5 中完成。</b>',
    '',
    '当前仅使用内部试玩影子积分，不支持充值、提现或真实资金玩法。',
  ].join('\n');
}

export function buildHelpText() {
  return [
    '<b>可用命令</b>',
    '/start - 打开棋牌室入口',
    '/balance - 查询影子积分',
    '/records - 查看最近战绩',
    '/invite - 分享邀请',
    '/support - 客服入口',
    '',
    'Bot 不承载高速牌桌 UI。进入斗地主、德州、麻将入口后，请在 H5 大厅和牌桌内操作。',
  ].join('\n');
}

export function buildBalanceText(account, summary = null) {
  const lines = [
    '<b>影子积分</b>',
    `可用：${formatPoints(account.available)}`,
    `锁定：${formatPoints(account.locked)}`,
    `合计：${formatPoints(account.total)}`,
    '',
    '仅限内部试玩和功能验证，不可充值、不可提现、不可兑换真实资产。',
  ];
  if (summary) {
    lines.push('', `流水：${summary.total} 条（发放 ${summary.issue} / 锁定 ${summary.lock} / 结算 ${summary.settlement}）`);
  }
  return lines.join('\n');
}

export function buildRecordsText(records) {
  if (!records.length) {
    return [
      '<b>最近战绩</b>',
      '暂无对局记录。',
      '',
      '进入 H5 大厅后，可在斗地主三人房完成实时对局并产生结算记录。',
    ].join('\n');
  }
  return [
    '<b>最近战绩</b>',
    ...records.map((record, index) => {
      const score = record.score > 0 ? `+${record.score}` : String(record.score);
      return `${index + 1}. ${record.gameName} ${record.roomName}：${record.result} ${score} 分`;
    }),
  ].join('\n');
}

export function buildSupportText(config) {
  return [
    '<b>客服入口</b>',
    escapeHtml(config.supportText),
    '',
    '请勿在聊天中发送密码、私钥、助记词或任何真实资金凭据。',
  ].join('\n');
}

export function buildInviteText(config, botInfo = null) {
  const botName = botInfo?.username ? `@${botInfo.username}` : 'Tea Parlor Bot';
  return [
    '<b>分享邀请</b>',
    `邀请好友打开 ${escapeHtml(botName)}，进入 H5 棋牌室大厅。`,
    '',
    escapeHtml(config.inviteText),
  ].join('\n');
}

export function buildSettleMessage(score = 12400) {
  const n = Number(score) || 0;
  const signed = n > 0 ? `+${n.toLocaleString('zh-CN')}` : n.toLocaleString('zh-CN');
  return `本局 ${signed} 影子积分`;
}

export function buildSettleKeyboard(config) {
  return {
    inline_keyboard: [
      [{ text: '再来一局', web_app: { url: config.miniAppUrl } }],
      [{ text: '分享战绩', callback_data: BotCallback.INVITE }],
    ],
  };
}

export function buildMainKeyboard(config) {
  return {
    inline_keyboard: [
      [{ text: '开始打牌', web_app: { url: config.miniAppUrl } }],
      [
        { text: '查询积分', callback_data: BotCallback.BALANCE },
        { text: '最近战绩', callback_data: BotCallback.RECORDS },
      ],
      [
        { text: '分享邀请', callback_data: BotCallback.INVITE },
        { text: '客服入口', callback_data: BotCallback.SUPPORT },
      ],
    ],
  };
}

export function buildSupportKeyboard(config) {
  if (!config.supportUrl) return buildMainKeyboard(config);
  return {
    inline_keyboard: [
      [{ text: '打开客服', url: config.supportUrl }],
      [{ text: '开始打牌', web_app: { url: config.miniAppUrl } }],
    ],
  };
}

export function buildInviteKeyboard(config, botInfo = null) {
  const shareUrl = new URL('https://t.me/share/url');
  const inviteUrl = botInfo?.username ? `https://t.me/${botInfo.username}` : config.miniAppUrl;
  shareUrl.searchParams.set('url', inviteUrl);
  shareUrl.searchParams.set('text', config.inviteText);
  return {
    inline_keyboard: [
      [{ text: '转发给好友', url: shareUrl.toString() }],
      [{ text: '开始打牌', web_app: { url: config.miniAppUrl } }],
    ],
  };
}

async function replyOrEdit(ctx, text, options = {}) {
  if (ctx.callbackQuery?.message && typeof ctx.editMessageText === 'function') {
    try {
      return await ctx.editMessageText(text, options);
    } catch (error) {
      if (!String(error?.message || '').includes('message is not modified')) {
        return ctx.reply(text, options);
      }
    }
  }
  return ctx.reply(text, options);
}

async function answerCallback(ctx, text = '') {
  if (!ctx.callbackQuery || typeof ctx.answerCbQuery !== 'function') return;
  try {
    await ctx.answerCbQuery(text);
  } catch {
    // Telegram may reject late callback answers; the user-facing message still matters.
  }
}

function telegramUserId(user = {}) {
  return `tg:${user.id || user.username || 'anonymous'}`;
}

function defaultRecords() {
  return [
    { gameName: '斗地主', roomName: '新手场', result: '地主胜', score: 4 },
    { gameName: '斗地主', roomName: '经典场', result: '农民胜', score: -2 },
  ];
}

function formatPoints(value) {
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
