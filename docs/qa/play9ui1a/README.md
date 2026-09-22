# play9ui1a — DDZ JJ table layout

Cache: `?v=play9ui1a`

## Goals (Ed refs 01 / 06–09)
- Landscape oval cruise table via letterbox (NO whole-page CSS rotate)
- Top-center: 3 landlord/bottom cards + 记牌器 王/2/A/K/Q/J/炸
- Triangle seats: L/R opponents with remain badges; bottom self hand
- Bid bar: 不叫 + countdown clock + 1/2/3 (UI only; no 赖子 gameplay)
- Trustee: 「自动出牌中」 hint when full trustee during play
- Preserve ship3b `--tg-vh` (never Math.max(innerHeight, viewportStableHeight))
- Keep ads logo slots; preserve fin1–fin6 features

## Portrait
Letterbox landscape stage (translate+scale only).

## Viewports
- 896×414 landscape
- 414×896 portrait letterbox

## Refs
`/workspace/play9ui1-refs/01-ddz-table-jj.jpeg`, `06`–`09` cruise/bid/autoplay.
