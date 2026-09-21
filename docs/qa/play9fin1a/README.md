# play9fin1a QA

## Gaps filled
1. **DDZ Colyseus soft park**: `parkColyseus()` → `room.leave(false)` keeps `allowReconnection` seat; token in `sessionStorage` via `table-session.js`.
2. **Lobby leave mid-hand**: `showLobby()` parks (not forfeit); settle/explicit quit uses `showLobby({ forfeit: true })`.
3. **Re-enter**: `startColyseusDdzSession({ fresh: false })` reconnects → hint「已重连回桌」.
4. **Mahjong / 日麻**: soft hide persists engine `state` snapshot; start hydrates same table; status「已重连回桌」.
5. **Countdown wall-clock**: DDZ `ddzTurnEndsAt` + MJ/riichi `turnEndsAt` + `remainSeconds()` — tab hide does not freeze remaining seconds.

## Must-ship
- A DDZ: leave mid-hand → lobby → re-enter same room (token); countdown ticks by wall clock
- B 推倒胡 / 日麻: leave → re-enter resumes phase/hands (not fresh deal)
- C ship3b `--tg-vh` intact; no new lobby icons; no Stars/chain

## Cache
`?v=play9fin1a`

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin1a-reconnect.test.js tests/mahjong-play9mj3.test.js tests/tg-viewport-stable.test.js
cd apps/colyseus-tea-parlor && node --test tests/match-3p.test.js
```
