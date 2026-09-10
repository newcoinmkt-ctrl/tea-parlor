# play9v3h QA

- ok: see `report.json`
- cache: `play9v3h` viewport `[414, 896]` `is_mobile` + `has_touch`

## Ed upright-hold acceptance

1. Hard refresh Mini App: `?v=play9v3h`
2. Hold phone **upright (portrait)** → 人机畅玩 / local-doudizhu
3. **All text / avatars / bid·play buttons must be upright relative to your eyes** — never sideways
4. Bid bar is a **horizontal row** (不叫/1/2/3) centered above the hand — not a vertical stack blocking the oval
5. Tap one hand card — it stays raised; 「出牌」lights when legal; play removes cards (17→16)
6. No `#tableView` / whole-page `transform: rotate(...)`

Fail on play9v3g: `#tableView` content rotate made everything sideways on portrait hold; bid buttons became a vertical bar.

## A/B/C/D coverage

| Track | Result |
|-------|--------|
| **A layout** | Removed `#tableView` rotate; upright full-viewport JJ zones |
| **B random** | Local lobby `shared/deal.js` crypto + engine `randomFloat` for dealStart/bidStarter; 5 deals differ |
| **C human play** | Kept v3g touch select; AI think 0.8–2s (`aiThinkMs` / Colyseus `_pumpAi`) |
| **D match ≤3s** | `MATCH_MS = 3000` still in Colyseus `ddzLogic.js` (verified tests) |

## Self-test

```bash
cd apps/web-lobby && node --test tests/table-orient-upright.test.js tests/deal.test.js tests/ddz-hand-touch.test.js tests/ddz-play-validate.test.js tests/ddz-table-acts.test.js tests/ddz-match-copy.test.js tests/hand-layout-pack-overlap.test.js
cd ../colyseus-tea-parlor && node --test tests/match-3p.test.js tests/ddzLogic.test.js
cd ../../packages/doudizhu-engine && node --test tests/deal.test.js
PORT=5228 python3 ../../docs/qa/play9v3h/qa_play9v3h.py
```

## Shots

- `lobby-414-home.png`
- `ddz-414-bid-upright.png`
- `ddz-414-play-upright.png`
- `ddz-414-touch-selected.png`
- `ddz-414-illegal-play-disabled.png`
- `ddz-414-after-legal-play.png`
- `ddz-414-seat-cardbacks.png`
