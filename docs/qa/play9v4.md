# play9v4 — lobby grid + chain hint cleanup

- ok: **True**
- cache: `play9v4` viewport `[414, 896]` `is_mobile` + `has_touch`
- URL: `http://127.0.0.1:5196/index.html?v=play9v4`

## Pass
- no overlap user↔grid / points↔德州 / user↔德州: PASS (gap user→grid = 22px)
- hint subtitle only `USDT 专用 · 与金币场分开` (no duplicate 链游中心): PASS
- chain full-width row (~382px @ 414): PASS
- 6 games + 链游中心; no CTA; 5 bottom tabs: PASS
- shots: `docs/qa/play9v4/lobby-home-414.png`, `lobby-home-414-outline.png`

## Root cause
Legacy `.home-app:has(.home-hero) .home-icon-grid { margin-top: -40px…-78px }` still matched because `.home-hero` remains in hidden `.p0-legacy` DOM — negative margin pulled the 3-col grid under `.p0-home-user` / 金币胶囊 (压到「德州」). Chain tile sat alone in row-3 col-1; hint repeated 「链游中心」.

## Fix
- `lobby-ia.css`: higher-specificity zero margin on `.p0-home-chrome .home-icon-grid`; relative flow for user bar + points; chain `grid-column: 1 / -1` row; subtitle hint styles
- `index.html`: hint → `USDT 专用 · 与金币场分开`; cache `?v=play9v4` only (no play9v3d)
- Lobby only — no table-play / hand changes; branch from main `5f961d7` (play9v3c)
