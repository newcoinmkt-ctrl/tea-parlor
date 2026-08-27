import {
  createBotConfig,
  createBotServices,
  handleStart,
  handleBalance,
  handleRecords,
  handleInvite,
  handleSupport,
} from '../src/index.js';

const messages = [];
const ctx = {
  from: { id: 10001, first_name: 'Demo玩家', username: 'demo_player' },
  reply: async (text, options) => {
    messages.push({ mode: 'reply', text, options });
  },
  editMessageText: async (text, options) => {
    messages.push({ mode: 'edit', text, options });
  },
  answerCbQuery: async () => {},
};

const config = createBotConfig({
  miniAppUrl: 'http://localhost:5173',
  supportText: '本地 demo 客服入口：请在正式环境配置客服链接。',
});
const services = createBotServices({ initialShadowPoints: 3000 });

await handleStart(ctx, { config });
ctx.callbackQuery = { message: { message_id: 1 } };
await handleBalance(ctx, { services });
await handleRecords(ctx, { services });
await handleInvite(ctx, { config, botInfo: { username: 'TeaParlorDemoBot' } });
await handleSupport(ctx, { config });

for (const [index, message] of messages.entries()) {
  console.log(`\n--- Bot demo message ${index + 1} (${message.mode}) ---`);
  console.log(message.text);
  if (message.options?.reply_markup) {
    console.log('keyboard:', JSON.stringify(message.options.reply_markup));
  }
}
