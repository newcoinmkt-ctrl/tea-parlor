# play9fin1b QA

## Gaps filled
1. **DDZ friend/dual**: `roomKey=friend|dual_*` waits for ≥2 humans (30s window) then AI-fills 3rd and deals.
2. **Mahjong Colyseus room**: `mahjong` room + `MjTable` — 2 humans + AI fill to finish a hand.
3. **Client**: `startColyseusMjSession`, `makeDualRoomKey`, friend panel「进入同桌」+ deep-link `t_<roomKey>`.
4. **Tests**: `dual-session.test.js` proves two humans finish DDZ + MJ hands.

## Must-ship
- A Two clients / dual session DDZ same room finish a hand
- B Two clients Mahjong (推倒胡) same room finish a hand
- C Cache `?v=play9fin1b`; ship3b tg-vh intact

## Run
```bash
cd apps/colyseus-tea-parlor && node --test tests/dual-session.test.js
cd apps/web-lobby && node --test tests/play9fin1b-dual.test.js tests/play9fin1a-reconnect.test.js tests/tg-viewport-stable.test.js
```
