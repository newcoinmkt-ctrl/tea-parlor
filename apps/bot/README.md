# Bot App

Telegram Bot entrypoint for the Tea Parlor H5 Mini App lobby.

Current scope:

- `/start` remains the primary entry command.
- The first action opens the H5 Mini App lobby.
- Bot supports shadow-points balance, recent records, invite sharing, and support entry.
- Realtime table play stays in H5. Bot does not render fast game-table controls.
- No recharge, withdrawal, real-money, or crypto flow is exposed.

Runtime configuration is read from environment variables:

- `BOT_TOKEN` for Telegram launch.
- `MINI_APP_URL` for the H5 lobby URL.
- `SUPPORT_URL` for an optional support link.

Local checks:

```bash
npm test -w @tea-parlor/bot
npm run demo -w @tea-parlor/bot
```
