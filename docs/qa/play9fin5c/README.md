# play9fin5c QA

## Goal
1. Lobby or health shows version/cache stamp
2. Key room API errors distinguishable in logs (`[room-api:<code>]`)
3. Full regression green: three games + trustee + ads + five tabs; no Stars/chain/whole-page rotate/withdraw
4. Preserve fin5a + fin5b

## Cache
`?v=play9fin5c`

## Run
```bash
cd apps/web-lobby && npm run test:fin5c
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | `#lobbyVersionStamp` + `/health` version/cache | play9fin5c-regression.test.js |
| 2 | `logRoomApiError` codes for DDZ/MJ join/reconnect/timeout/leave | colyseus-client.js |
| 3 | Five tabs + DDZ/MJ/NN + trustee + ads + `--tg-vh` | regression |
| 4 | fin5a recent + fin5b activity/yaku | regression |

## Preserve
ship3b `--tg-vh`; fin1–fin5b.
