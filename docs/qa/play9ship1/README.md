# play9ship1 QA

Residuals on top of play9fix1 (`a7b5398`): card face 「10」 clipped to 「1」, illegal「出牌」occasionally not grey.

## Fixes
- **A) Ten face:** `cardFaceHtml` adds `pc-rank--ten` when `rank===10` (RANK_LABEL stays `'10'`). CSS: `white-space:nowrap; letter-spacing:-0.08em; transform:scaleX(0.88); transform-origin:left top` so both digits fit the fan peek strip. Also `#bottomCards` / `#lastPlayFan` / `jj-mini-card` / hand `is-ten`.
- **B) Illegal grey:** stronger `#playButton:disabled` / `[aria-disabled="true"]` (opacity + grayscale + no box-shadow/animation). `syncPlayButtonFromSelection` at end of render when `phase===play`; clear `pulse-hint` when disabled. `shouldDisablePlayButton` helper.

## Regression guards (do not break play9fix1)
- DDZ legal play 17→16; illegal grey
- MJ enter + deal + discard
- Portrait upright `transform:none`; landscape letterbox; **no** `rotate(90deg)`
- touch≠mousedown guard; TG expand rate-limit; action bar z≥220

## Cache
`?v=play9ship1`

## Self-test (no live TG required)
```bash
cd apps/web-lobby && npm test
# focused:
node --test tests/play9ship1-ten-grey.test.js tests/ddz-play-validate.test.js tests/table-orient-upright.test.js
```

Code asserts:
- `RANK_LABEL[10]==='10'` and face HTML contains `pc-rank--ten` + `>10<`
- CSS contains `pc-rank--ten`, `scaleX(0.88)`, `#playButton:disabled` grey rules
- grep: no `rotate(90deg)` applied via `setProperty` in `table-orient.js`
- `syncPlayButtonFromSelection` after play-phase render

Manual (optional, Playwright / prior `docs/qa/play9fix1/qa_play9fix1.py` pattern):
1. Serve web-lobby, open `index.html?v=play9ship1`
2. DDZ bot: find a 「10」 in hand — both digits visible in fan
3. Select illegal combo (e.g. A+10) — 「出牌」clearly grey / not tappable
4. Legal single — play enables, 17→16
5. Portrait 414 + landscape 896: upright / letterbox; no page rotate90
