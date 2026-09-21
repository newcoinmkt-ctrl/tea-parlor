# play9fin6a QA

## Goal
1. Visible room / field selection (DDZ + NiuNiu/Mahjong highlight)
2. Quick match clear waiting feedback (room · seats · ETA ≤3s)
3. Match target still ≤3s (AI fill kept)
4. Failure retryable without freeze (`#ddzMatchRetry`)

## Cache
`?v=play9fin6a`

## Run
```bash
cd apps/web-lobby && npm run test:fin6a
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | `#ddzFieldSelect` + `.room-card.is-selected` | play9fin6a-room-match.test.js |
| 2 | `#ddzMatchSeats` / `#ddzMatchEta` / waiting copy | ddz-match-copy + overlay |
| 3 | `MATCH_MS_MAX=3000` | colyseus ddzLogic |
| 4 | `#ddzMatchRetry` + `retryDdzMatch` | failure path |

## Preserve
ship3b `--tg-vh`; fin1–fin5c (reconnect, dual, yaku/fu, logos, trustee, ads, five tabs, activity, recent-tables, version stamp).
