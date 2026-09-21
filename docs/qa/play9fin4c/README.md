# play9fin4c QA

## Goal
1. Light social entry: room code / invite OR recent same-table list openable; NO full IM/moments
2. Full regression: DDZ/MJ/NN + server trustee + ads config + five tabs; no whole-page rotate
3. Preserve fin4a activity + fin4b rarer yaku

## Cache
`?v=play9fin4c`

## Run
```bash
cd apps/web-lobby && npm run test:fin4c
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | Social entry + friend room + recent list | play9fin4c-regression.test.js |
| 2 | No full IM / moments | regression |
| 3 | Five tabs + DDZ/MJ/NN | regression |
| 4 | Trustee + ads + --tg-vh | regression |
| 5 | fin4a activity + fin4b yaku | regression |

## Preserve
ship3b `--tg-vh`; fin1–fin3; fin4a activity; fin4b rarer yaku.
