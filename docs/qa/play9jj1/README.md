# play9jj1 QA — JJ Dou Dizhu landscape letterbox

- ok: see `report.json`
- cache: `play9jj1`
- primary viewport: `[896, 414]` landscape (Ed landscape-hold)
- portrait check: `[414, 896]` letterbox band (no rotate)

## Ed landscape-hold path

1. Hard refresh Mini App: `?v=play9jj1`
2. **Hold phone landscape** so the landscape stage fills the screen (text/cards/buttons upright to your eyes)
3. Open 人机畅玩 / local-doudizhu
4. Confirm JJ zones:
   - Top-center: landlord 3 hole cards + card-counter (王/2/A/K/Q/J/炸)
   - Top-left / top-right: avatar + wood remain count; played cards toward center
   - Bottom-left: self avatar;「不出」bubble by avatar when pass
   - Bottom-center: JJ fan hand; action bar (不出/提示/出牌) horizontal row above hand
5. Tap a card → raised; legal「出牌」removes cards (17→16); illegal stays grey
6. On **portrait** hold: stage is a centered landscape letterbox (translate+scale) — **never** `#tableView` `rotate(90deg)` (play9v3g FAIL)

## Letterbox without rotate

- Stage coords always `W > H` (device long × short edge)
- Fit with `transform: translate(-50%, -50%) scale(s)` only
- Letterbox bars are dark (`#060e1c`); cruise-deck SVG skin on the stage

## Assets

- Used: `apps/web-lobby/public/assets/skins/jj-cruise/game_background.svg` (placeholder night cruise composition)
- Deferred: live bomb counts in meter; photoreal JJ character poses; live XP bar

## Self-test

```bash
cd apps/web-lobby && node --test tests/table-orient-upright.test.js tests/ddz-hand-touch.test.js tests/ddz-play-validate.test.js tests/ddz-table-acts.test.js tests/hand-layout-pack-overlap.test.js tests/deal.test.js
PORT=5231 python3 ../../docs/qa/play9jj1/qa_play9jj1.py
```

## Shots

- `lobby-896-home.png`
- `ddz-896-landscape-zones.png`
- `ddz-896-touch-selected.png`
- `ddz-896-illegal-play-disabled.png`
- `ddz-896-after-legal-play.png`
- `ddz-896-pass-by-avatar.png`
- `ddz-896-settle-triangle.png`
- `ddz-414-portrait-letterbox.png`
