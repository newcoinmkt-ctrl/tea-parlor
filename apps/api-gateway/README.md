# API Gateway

Gateway for Telegram Mini App `initData` validation and public API routing.

Current endpoints:

- `POST /auth/telegram` with JSON body `{ "initData": "..." }`
- `GET /me` with `Authorization: Bearer <sessionToken>`

Security notes:

- `BOT_TOKEN` is read from `process.env.BOT_TOKEN` only.
- `.env` files are not read by this package.
- Telegram initData hash is verified with the official `WebAppData` HMAC derivation.
- Session tokens are HMAC signed. Set `API_GATEWAY_SESSION_SECRET` in the runtime environment to separate session signing from the Bot Token.
