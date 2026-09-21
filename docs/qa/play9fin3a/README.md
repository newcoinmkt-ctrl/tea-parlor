# play9fin3a QA

## Goal
托管状态与代打由 **Colyseus 权威**：客户端联网局只发 `trustee` 消息，禁止纯本地 auto-play。
断线重连后 `fullTrustee` 保持一致，服务端继续 `driveAi`。

## Cache
`?v=play9fin3a`

## Checks
1. DDZ `DdzTable.setFullTrustee` → `seat.fullTrustee` + `trustee`; `publicState.myFullTrustee`
2. Soft `applyTrustee` (disconnect) ≠ full; reconnect clears soft, keeps full
3. `DoudizhuRoom` / `MahjongRoom` message `trustee` `{ on }`
4. Client `ddzSetTrustee` / `mjSetTrustee`; online `onToggleTrustee` sends to server
5. `scheduleAi` returns early when `game.online` (no client auto-play)
6. Preserve ship3b `--tg-vh`; fin1 reconnect/dual/yaku; fin2 logos/trustee UI/five-tabs

## Run
```bash
cd apps/colyseus-tea-parlor && node --test tests/trustee-authoritative.test.js tests/dual-session.test.js
cd apps/web-lobby && node --test tests/play9fin3a-trustee-auth.test.js tests/play9fin2b-full-trustee.test.js tests/play9fin1a-reconnect.test.js
```
