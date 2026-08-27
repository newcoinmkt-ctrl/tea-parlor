import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BotCallback,
  buildBalanceText,
  buildHelpText,
  buildMainKeyboard,
  buildRecordsText,
  buildStartText,
  createBotConfig,
  createBotServices,
  handleBalance,
  handleInvite,
  handleRecords,
  handleStart,
  handleSupport,
  registerBotHandlers,
} from '../src/index.js';

test('/start message presents H5 lobby entry and not in-bot table controls', () => {
  const text = buildStartText({ first_name: 'Alice' });
  assert.match(text, /H5 Mini App/);
  assert.match(text, /实时牌桌.*H5/);
  assert.doesNotMatch(text, /\/play/);
  assert.doesNotMatch(text, /出牌按钮|叫分按钮/);
});

test('main keyboard exposes Mini App, balance, records, invite, and support', () => {
  const config = createBotConfig({ miniAppUrl: 'https://example.test/lobby' });
  const keyboard = buildMainKeyboard(config);
  assert.deepEqual(keyboard.inline_keyboard[0][0], {
    text: '开始打牌',
    web_app: { url: 'https://example.test/lobby' },
  });
  const serialized = JSON.stringify(keyboard);
  assert.match(serialized, new RegExp(BotCallback.BALANCE));
  assert.match(serialized, new RegExp(BotCallback.RECORDS));
  assert.match(serialized, new RegExp(BotCallback.INVITE));
  assert.match(serialized, new RegExp(BotCallback.SUPPORT));
});

test('balance handler uses shadow wallet service and ledger summary', async () => {
  const services = createBotServices({ initialShadowPoints: 3000 });
  const ctx = createFakeContext();
  await handleBalance(ctx, { services });

  assert.equal(ctx.edits.length, 0);
  assert.equal(ctx.replies.length, 1);
  assert.match(ctx.replies[0].text, /影子积分/);
  assert.match(ctx.replies[0].text, /3,000/);
  assert.match(ctx.replies[0].text, /不可充值、不可提现/);

  await handleBalance(ctx, { services });
  const account = await services.getBalance(ctx.from);
  assert.equal(account.available, 3000);
});

test('records, invite, support, and help copy stay lobby-oriented', async () => {
  const config = createBotConfig({
    miniAppUrl: 'https://example.test/lobby',
    supportUrl: 'https://example.test/support',
  });
  const services = createBotServices({
    records: [['tg:42', [{ gameName: '斗地主', roomName: '新手场', result: '胜', score: 8 }]]],
  });
  const ctx = createFakeContext({ callback: true });

  await handleRecords(ctx, { services });
  await handleInvite(ctx, { config, botInfo: { username: 'TeaParlorBot' } });
  await handleSupport(ctx, { config });

  assert.match(ctx.edits[0].text, /最近战绩/);
  assert.match(ctx.edits[0].text, /斗地主/);
  assert.match(ctx.edits[1].text, /分享邀请/);
  assert.match(JSON.stringify(ctx.edits[1].options.reply_markup), /t\.me\/share\/url/);
  assert.match(ctx.edits[2].text, /客服入口/);
  assert.match(JSON.stringify(ctx.edits[2].options.reply_markup), /example\.test\/support/);
  assert.match(buildHelpText(), /Bot 不承载高速牌桌 UI/);
});

test('registerBotHandlers keeps /start and command surface for lobby operations', () => {
  const bot = createFakeBot();
  registerBotHandlers(bot, {
    miniAppUrl: 'https://example.test/lobby',
    services: createBotServices(),
  });

  assert.equal(typeof bot.handlers.start, 'function');
  assert.equal(typeof bot.handlers.command.get('balance'), 'function');
  assert.equal(typeof bot.handlers.command.get('records'), 'function');
  assert.equal(typeof bot.handlers.command.get('invite'), 'function');
  assert.equal(typeof bot.handlers.command.get('support'), 'function');
  assert.equal(typeof bot.handlers.action.get(BotCallback.BALANCE), 'function');
});

test('text builders do not describe real-money or crypto capability', () => {
  const combined = [
    buildStartText(),
    buildBalanceText({ available: 1, locked: 0, total: 1 }),
    buildRecordsText([]),
    buildHelpText(),
  ].join('\n');
  assert.doesNotMatch(combined, /提现成功|充值入口|USDT|TON|真钱/);
  assert.match(combined, /内部试玩影子积分|不可充值、不可提现/);
});

function createFakeContext(options = {}) {
  const ctx = {
    from: { id: 42, first_name: '测试用户', username: 'tester' },
    replies: [],
    edits: [],
    callbackAnswers: [],
    reply: async (text, replyOptions = {}) => {
      ctx.replies.push({ text, options: replyOptions });
      return { message_id: ctx.replies.length };
    },
    editMessageText: async (text, replyOptions = {}) => {
      ctx.edits.push({ text, options: replyOptions });
      return { message_id: ctx.edits.length };
    },
    answerCbQuery: async (text) => {
      ctx.callbackAnswers.push(text);
    },
  };
  if (options.callback) ctx.callbackQuery = { message: { message_id: 1 } };
  return ctx;
}

function createFakeBot() {
  return {
    botInfo: { username: 'TeaParlorBot' },
    handlers: {
      command: new Map(),
      action: new Map(),
      start: null,
    },
    start(fn) {
      this.handlers.start = fn;
    },
    command(name, fn) {
      this.handlers.command.set(name, fn);
    },
    action(name, fn) {
      this.handlers.action.set(name, fn);
    },
  };
}
