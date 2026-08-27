import { registerGame, createUnavailableGameAdapter } from '@tea-parlor/game-adapter';
const GAME_ID = process.env.GAME_ID || 'new-game';
registerGame({
  id: GAME_ID,
  engine: process.env.GAME_ENGINE || null,
  status: 'placeholder',
  playable: '未接通',
  createAdapter: async () => createUnavailableGameAdapter(GAME_ID, 'copy_template_and_implement'),
});
console.log('[game-server-template] registered', GAME_ID);
