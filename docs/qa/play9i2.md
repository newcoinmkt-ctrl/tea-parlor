# play9i2 — Dou Dizhu more menu open/close

Cache: `play9i2` · `#hudMoreToggle` ↔ `#hudMoreMenu`

## Root cause
Landscape HUD used `overflow: hidden` + fixed height on `.qq-hud`, so the dropdown opened in the DOM (`hidden` cleared) but was clipped and not hittable under the felt.

## Fix
- CSS: `overflow: visible` on `.qq-hud` / `.qq-hud-tools` / `.qq-more-wrap`; menu `z-index: 80+`; HUD `z-index: 60`
- JS: idempotent bind, capture toggle + stopPropagation, outside click closes
- Cache bump `play9i2` (index CSS/JS + hand-layout stamp)

## 414 self-test (人机畅玩)
| Check | Result |
|---|---|
| more opens (礼包+托管) | PASS |
| hud overflow visible | PASS |
| menu hittable | PASS |
| close via toggle | PASS |
| close via outside | PASS |

Shot: `docs/qa/play9i2/ddz-414-more-open.png`

Overall: PASS
