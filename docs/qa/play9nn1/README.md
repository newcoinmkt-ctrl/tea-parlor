# play9nn1 QA — 牛牛 into tea-parlor

Merge 看牌抢庄 牛牛 (rules + stamps + 6-seat layout) into the web-lobby plugin + Colyseus listing. No Cocos, no old Node8 lobby.

## Play
- 6 seats, 底分 5 / 10 / 20 / 50 (影子金币)
- Phases: idle → 抢庄 → 定庄 → 下注 → 搓牌/开牌 → 结算
- Match: client-side ≤3s AI fill, overlay copy **only** 「匹配中」
- Table: landscape letterbox + portrait upright; **never** `rotate(90deg)` on page / `#tableView` / `#multiGameView`

## Encoding
Source `wd_nn.js` card string `""+rank+suit` (rank 1–13, suit 1–4; pip rank>10→10).
Tea-parlor: `{ rank:1–13, suit:0–3 }` with `toSourceCard` = `rank + (suit+1)`.

## typeResult
7–8×2, 9×3, 10×4, >10×5, else ×1 (incl 没牛 -1).
Pay: `score1(庄抢)×score2(闲注)×difen×beishu(winner type)`.

## Noted source quirks (ported as-is)
- **轮庄**: conf exists in source but never branches — this ship is 看牌抢庄 only.
- **compare**: special kicker when `point==13||15` (葫芦/五花), **not** 炸弹 16.

## Cache
`?v=play9nn1`

## Colyseus
`/health` `games` includes `niuniu` for dual-deploy. No `NnRoom` in v1 (local vs-AI). `MATCH_MS` remains 3000.

## Self-test
```bash
cd apps/web-lobby && npm test
node --test tests/niuniu-engine.test.js tests/niuniu-lobby.test.js tests/table-orient-upright.test.js
cd ../colyseus-tea-parlor && npm test
```

Manual:
1. Serve `apps/web-lobby`, open `index.html?v=play9nn1`
2. 大厅 牛牛 → 新手场 → 「匹配中」→ deal 5 → 抢庄 → 下注 → 开牌 see niu stamp → settle +/-
3. Portrait upright + landscape letterbox; no page rotate90
4. DDZ play + MJ enter still load

## Layout fix (PR #42 follow-up)
- FAIL was 抢庄栏「4倍」overlapping「不抢」 on 414 portrait (global `.qq-btn` min-width/padding + wide beishu art → wrap/overlap).
- Fix: `#nnActions` / `.nn-bei` forced single horizontal row (`flex-wrap: nowrap`, `flex: 1 1 0`, capped width, override padding/min-width). Same pattern for 下注 1–5倍.
- Uniform `bei1–4` + `buqiang` assets; duplicate caption under art hidden (aria-label kept).
- QA: `04-table.png`, `04b-qiang-bar.png`, `06-xia-bar.png` @ 414×896. Gaps 8px, no overlap.
- Cache stays `?v=play9nn1`.
