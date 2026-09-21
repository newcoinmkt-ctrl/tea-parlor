# play9fin4b QA

## Goal
Expand riichi yaku beyond fin1c/fin3 common set with judgeable rarer yaku:
三色同顺 / 一气通贯 / 混全带幺九 / 对对和 / 七对子 / 清一色 / 混一色.
Settle still non-empty with yaku list + fu/points.

## Cache
`?v=play9fin4b`

## Run
```bash
cd apps/web-lobby && npm run test:fin4b
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | 清一色 / 三色同顺 / 一气通贯 | play9fin4b-rarer-yaku.test.js |
| 2 | 对对和 / 七对子 / 混全带幺九 / 混一色 | same |
| 3 | Non-empty settle + fu/points | settle() helper asserts |
| 4 | Cache `?v=play9fin4b` | index.html |

## Preserve
fin1c empty-settle forbidden; fin4a activity entry; ship3b `--tg-vh`.
