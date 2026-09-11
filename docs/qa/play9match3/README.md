# play9match3 QA

- Goal: after tap 匹配, **≤3s** to table/start (AI fill if needed)
- Cache: `?v=play9match3` (web-lobby auth-gate fix)
- Colyseus: `MATCH_MS=3000` (unchanged from #28); `/health.matchMs` for live verify

## Root cause

Live Colyseus logs already showed `deltaMs: 3000` after #28 deploy — server was fine.
Client `startRoomOnline` awaited full `telegramLoginPromise`, which also syncs wallet/daily-supply
**after** the session token is set, so 「匹配中」stayed up well past the 3s match clock.

## Fix

1. Colyseus: `resolveMatchMs` (cap ≤3000), expose `matchMs` on `/health` + match `publicState`
2. web-lobby: `waitForMatchSessionToken` — proceed as soon as token exists (do not wait wallet sync)
3. UI still silent 「匹配中…」 only (no AI/countdown)

## Self-test

```bash
cd apps/colyseus-tea-parlor && node --test tests/match-3p.test.js
cd ../web-lobby && node --test tests/ddz-match-auth-fast.test.js tests/ddz-match-copy.test.js tests/table-orient-upright.test.js
curl -sS https://colyseus-production-9b53.up.railway.app/health   # expect matchMs:3000 after Colyseus redeploy
```

## Deploy

- **Dual-deploy required**: web-lobby (cache stamp) **and** Colyseus (health.matchMs + resolveMatchMs)
- Railway project `46ea1f0e-f8da-4a74-88c2-98a3101c0cc9` · colyseus `c3b58a61-6000-4468-81a5-3b90545db303`
- No `MATCH_MS` env on live Colyseus today (code default 3000); if set later, values >3000 are capped
