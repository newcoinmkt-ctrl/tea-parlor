# play9fin5b QA

## Goal
1. **Activity claim robust**: clear prompt + retry when TG session missing (no silent fail); with session can claim non-withdrawable chips
2. **Yaku decompose thicken**: less lumping; settle lists each judgeable yaku separately within current engine
3. Preserve fin5a server-backed recent same-table

## Cache
`?v=play9fin5b`

## Run
```bash
cd apps/web-lobby && npm run test:fin5b
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | `#activitySessionRetryBtn` + clear TG prompt | play9fin5b-activity-yaku.test.js |
| 2 | `retryActivityTelegramSession` wired | app.js |
| 3 | `findAllMeldDecompositions` + best-of rarer yaku | riichi-engine.js |
| 4 | Settle lists 清一色 + 断幺九 separately | activity-yaku test |
| 5 | Cache `?v=play9fin5b` | index.html |

## Preserve
ship3b `--tg-vh`; fin1–fin5a features.
