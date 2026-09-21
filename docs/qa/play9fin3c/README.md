# play9fin3c QA

## Goal
1. **Dual-session smoke**: two clients same room for DDZ + Mahjong, play several steps, assert settle — automated via `scripts/dual-session-smoke.mjs`
2. **Full regression**: DDZ / MJ / NN + five lobby tabs; no Stars / chain / rotate / withdraw; ship3b `--tg-vh`

## Cache
`?v=play9fin3c`

## Run
```bash
# Dual smoke (in-process two clients)
cd apps/colyseus-tea-parlor && npm run smoke:dual
# optional live hint:
LIVE_COLYSEUS_URL=wss://colyseus-production-9b53.up.railway.app npm run smoke:dual

# Full regression suite
cd apps/web-lobby && npm run test:fin3c
cd apps/colyseus-tea-parlor && npm run test:fin3c
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | DDZ dual join + ≥2 steps + settle | smoke script PASS |
| 2 | MJ dual join + ≥2 steps + settle | smoke script PASS |
| 3 | Five tabs + DDZ/MJ/NN | play9fin3c-regression.test.js |
| 4 | No Stars/chain/rotate/withdraw | regression + fin2c |
| 5 | fin3a trustee + fin3b ads preserved | regression |
| 6 | `--tg-vh` | table-orient.js |

## Preserve
ship3b `--tg-vh`; fin1 reconnect/dual/yaku; fin2 logos/trustee UI/five-tabs; fin3a server trustee; fin3b ad config.
