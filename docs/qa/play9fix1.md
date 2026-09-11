# play9fix1 — DDZ play + MJ enter + adaptive portrait/landscape

Live fails on `?v=play9mj1` / `fa01555`: (1) 斗地主无法出牌 (2) 麻将无法进入 (3) 横竖屏都要可用.

## Strategy (documented)
- **Landscape (W≥H):** JJ letterbox `translate(-50%,-50%) scale(...)` — keep jj1b zone lock. Never rotate.
- **Portrait (H>W):** upright full-viewport fill `transform:none` — cards stay finger-sized. **Not** a tiny letterboxed landscape strip (play9mj1 FAIL @414).
- TG `expand` rate-limited + once-per-session to stop mahjong enter freeze.

## QA
See `docs/qa/play9fix1/report.json` — both 896 landscape and 414 portrait pass (DDZ 17→16, MJ enter+discard).
