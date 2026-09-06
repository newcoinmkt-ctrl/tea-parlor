# play9v3 QA

- ok: **True**
- cache: `play9v3` viewport `[414, 896]` `is_mobile` + `has_touch`

## Pass
- lobby grid / no CTA / chain: PASS
- DDZ JJ fan (not grid), minW≥36, minPeek≥14: PASS
- selected≥1, play enabled, after-play count drop: PASS
- MJ / GD fan layouts: PASS
- match silent (no AI copy / countdown): PASS
- shots distinct (incl. hand close-up 特写): PASS

## Root cause
`packOverlap` could inflate `cardW` above `maxW`; overflow correction refused to shrink peek below `minPeek` while `#handArea` used `overflow-x: hidden` — trailing cards clipped (“incomplete”) and untappable on TG phone WebView. Touch `elementFromPoint` also missed under HUD/ads.

## Fix
Readable floor + `needsScroll` / `overflow-x: auto`; hand z-index / pointer-events; `fanCardAtPoint`; sync 出牌 on touch; cache `?v=play9v3`.
