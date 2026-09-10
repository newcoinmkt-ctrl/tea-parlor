# play9v3g QA

- ok: **True**
- cache: `play9v3g` viewport `[414, 896]` `is_mobile` + `has_touch`
- Real touch (Playwright `touchscreen.tap`) — not only `__teaParlor.play()` API

## Ed TG Mini App vs-AI repro
1. Hard refresh Mini App: `?v=play9v3g`
2. Portrait phone → 人机畅玩 / local-doudizhu
3. Table content rotates to landscape stage (usable stage W>H) while Telegram stays portrait
4. Tap one hand card — it must **stay raised** (not flash back down)
5. 「出牌」lights orange when legal; tap it → hand **17→16**, lastPlay shows in front of seat
6. Illegal A+10 keeps 「出牌」grey with hint

Fail on play9v3f: touchstart selected then compat `mousedown` undid the raise; prior QA only exercised the JS API so live TG still could not play.

## Pass
- touch_select_stays: PASS
- illegal_play_disabled: PASS
- touch_play_17_to_16: PASS
- landscape_stage: PASS
- seat_cardbacks: PASS

## Root causes fixed
1. **Compat mouse after touch** — Chromium/TG emits `mousedown` with `sourceCapabilities.firesTouchEvents` after `touchstart`; second `toggleHandCard` cleared selection before click
2. **Action bar z-index under hand** — `pinP0ActionBar` forced z=6 while hand cards were z~90; raised cards could swallow「出牌」taps
3. **Portrait cramped bottom** — force landscape via **`#tableView` content rotate** (not whole-page `html` rotate)

## Self-test
```bash
cd apps/web-lobby && node --test tests/ddz-hand-touch.test.js tests/ddz-play-validate.test.js tests/ddz-table-acts.test.js tests/hand-layout-pack-overlap.test.js
PORT=5225 python3 ../../docs/qa/play9v3g/qa_play9v3g.py
```

## Shots
- `lobby-414-home.png`
- `ddz-414-landscape-stage.png`
- `ddz-414-touch-selected.png`
- `ddz-414-illegal-play-disabled.png`
- `ddz-414-after-legal-play.png`
- `ddz-414-seat-cardbacks.png`
