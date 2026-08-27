import { Telegraf } from 'telegraf';
import { registerBotHandlers } from './index.js';

export function createTelegramBot(options = {}) {
  const token = options.token || process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN_required');
  const bot = new Telegraf(token);
  registerBotHandlers(bot, options);
  return bot;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bot = createTelegramBot();
  bot.launch();
  console.log('Tea Parlor Telegram Bot started');

  const shutdown = () => bot.stop('SIGTERM');
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
