# play9mj2b — Pocket 日麻桌面布局抛光

- Cache: `?v=play9mj2b`
- Scope: **LAYOUT ONLY** — 四面黄背双层牌墙、四家河朝向、木框蓝毡、中心罗盘分/倒计时
- Still one 「麻将」 entry; 推倒胡 default; 日麻 option kept
- **No** Cocos 3D parallax chase; 2D/CSS overhead matching Pocket zones
- NEVER rotate90; landscape letterbox / portrait upright
- Do not regress 牛牛 / DDZ / matchMs=3000; no new lobby icon; no chain

## Refs
- `ref-room.jpg` — Pocket table
- `ref-over.jpg` — Pocket settle (unchanged this ticket)

## Compare
- `compare-table.jpg` — left ours / right Pocket room
- `compare-settle.jpg` — settle side-by-side (settle chrome unchanged)

## Shots
- `03-riichi-table-896.png` / `04-riichi-after-discard-896.png` / `07-riichi-414-portrait.png`
- `06-tuidaohu-table-896.png` — 推倒胡 still enters

## Repro
1. Open `index.html?v=play9mj2b`
2. 大厅 → 麻将 → **日麻** → 进桌
3. Confirm: yellow double walls on 4 sides (incl. south), 4 kawa seats, wood+navy felt, dora top-left, hand tappable
4. Back → **四人麻将** still 推倒胡

## QA
```bash
cd apps/web-lobby && PORT=5263 node server.js &
PORT=5263 python3 docs/qa/play9mj2b/qa_play9mj2b.py
```
`report.json` → all pass (four_walls / four_kawa / compass_scores / no_rotate / tuidaohu).

## Still missing (ok for this ticket)
- Full Cocos 3D perspective / parallax warp
- Exact Pocket wall length pixel-match under all aspect ratios
- Riichi stick placement animation; call melds layout polish
