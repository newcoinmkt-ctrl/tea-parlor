# play9fin2b QA

## Goal
完整托管: player taps 托管 → auto 行牌 until cancel or leave table.
Stronger than fin1 soft-park; survives disconnect reconnect.

## Cache
`?v=play9fin2b`

## Checks
1. DDZ `#trusteeButton` toggles full trustee; persists via `__ddzFullTrustee` + reconnect blob
2. Mahjong/日麻 `#mgTrusteeBtn` + `multiUI.toggleFullTrustee`
3. fullTrustee auto-acts human turns; softTrustee remains timeout/disconnect fallback
4. Session `fullTrustee` flag in `table-session` for MJ/riichi
5. Preserve ship3b `--tg-vh`

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin2b-full-trustee.test.js tests/play9fin1a-reconnect.test.js
```
