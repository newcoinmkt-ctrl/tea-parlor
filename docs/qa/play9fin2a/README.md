# play9fin2a QA

## Goal
Ad logo slots on **skin / card face / table felt / clothes** visible in play; must **not** block clicks.
Placeholder logos OK (`./public/assets/logos/btc.svg`); real ad network later via `adsUrl`.

## Cache
`?v=play9fin2a`

## Checks
1. DOM: `doudizhu-table-skin`, `doudizhu-card-face`, `doudizhu-table-center`, costume seats
2. `defaultBrandPlacements` enables those surfaces; lobby banners stay off
3. CSS: slots visible under `.table-active`; `pointer-events: none`
4. JJ stage no longer hard-hides logo slots
5. Chest logos (`char-chest-logos`) remain `pointer-events: none`
6. Preserve ship3b `--tg-vh` (untouched)

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin2a-ad-logos.test.js tests/lobby.test.js
```
