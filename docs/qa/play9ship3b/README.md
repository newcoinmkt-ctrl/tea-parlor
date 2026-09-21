# play9ship3b — DDZ playable on Telegram Mini App

## Root cause
`--tg-vh` / stage height used `Math.max(innerHeight, viewportStableHeight, viewportHeight)`.
On TG Mini App, `innerHeight` is taller than the **usable** `viewportStableHeight`, so the
Dou Dizhu hand +「出牌」dock sat under bottom chrome where touches are swallowed.
`applyTelegramSafeArea` also recomputed `--tg-vh` with the same Math.max and overwrote
`syncViewportHeight`. Forced `--safe-bottom: 168px` did not lift the fixed stage hand.

## Fix
1. `resolveTelegramViewportHeight`: prefer **stable → live → inner** (never max-with-inner).
2. When stable is trusted, `--safe-bottom` = real safe-area inset only (not 168px).
3. `applyTelegramSafeArea` delegates to `syncViewportHeight` (single source of truth).
4. Self-slot pad uses capped real inset; online play clears selection immediately.
5. TG match token wait 4s (cold `/auth`).
6. Cache `?v=play9ship3b`.

## Must-ship verified
- **A DDZ (TG mock stable=720):** hand inside stable vh; select → legal lit / illegal grey → 出牌 → 17→16; opponent turn advances; 414+896.
- **B Mahjong:** 推倒胡 + 日麻 enter.
- **C 牛牛:** enter + dock (抢庄/下注/搓牌 path smoke).

## Forbidden
- No Stars / TON / USDT / chain
- No whole-page CSS rotate
- No stack change

## Run
```bash
cd apps/web-lobby && PORT=5293 node server.js
PORT=5293 python3 - <<'PY'  # see report.json producer in this folder
node --test tests/tg-viewport-stable.test.js tests/ddz-play-validate.test.js tests/table-orient-upright.test.js tests/mahjong-ship3.test.js
```

## Cache
`?v=play9ship3b` · matchMs=3000 · no rotate90
