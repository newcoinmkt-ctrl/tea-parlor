# play9t1 — unified Design Tokens + tp-bridge

Cache: `play9t1` · lobby / DDZ / MJ / Guandan shared control language

## Changes
- Append `--tp-*` tokens (+ theme aliases) to `apps/web-lobby/src/themes/tokens.css`
- New `apps/web-lobby/src/themes/tp-bridge.css` mapping gold pills / play / pass / hint / hu / tabs to tokens
- `index.html`: tokens+bridge `?v=play9t1`; bump prior `play9d1`/`play9k1` CSS/JS + `hand-layout.js` stamp → `play9t1`
- Bridge loaded **last** with higher-specificity restores so token fills win over legacy `!important` gradients (timer / mj hu|qi)

## Not changed
- Table backgrounds / avatars / yard art
- Gameplay logic
- play9h2/i1/j1/k1 layout behaviors (HUD more menu, lobby IA, mj act sizing, gd thumb dock)

## 414 self-test
| Check | Result |
|---|---|
| tokens `--tp-gold` / `--tp-gold-ink` loaded | PASS |
| lobby gold chip dark ink | PASS `rgb(61,46,0)` on gold grad |
| lobby p0-primary action orange | PASS |
| lobby tab active gold | PASS `--tp-gold` |
| DDZ play orange / pass blue / hint+timer gold dark ink | PASS |
| DDZ more menu opens | PASS |
| MJ `#mgSub` gold ink / qi blue / hu gold ink | PASS |
| GD restore gold ink / sort blue | PASS |
| GD toolbar in hand dock / above hand / seat0≤56 | PASS |
| no white-on-yellow on gold surfaces | PASS |

Shots: `docs/qa/play9t1/lobby-414.png`, `gd-414-tokens.png`, `mj-414-tokens.png`, `ddz-414-tokens.png`, `ddz-414-more-menu.png`

Overall: **PASS** (`report.json` allPass true)
