# play9mj2 — Pocket 日麻 merge into 麻将

- Cache: `?v=play9mj2`
- Lobby: still one 「麻将」 icon — room card 「日麻」 beside default 「四人麻将」(推倒胡)
- Table: wood frame + blue felt, yellow-back walls, wind compass, dora bar, dial 和/鸣/切, Pocket settle overlay
- Engine: local vs-AI riichi (draw/discard/riichi/tsumo/ron + simplified yaku/han)
- **No** Cocos 3.7 runtime; assets ported under `public/assets/mahjong-pocket/`
- Landscape letterbox / portrait upright — **never** rotate90
- Do not regress 牛牛 / DDZ / matchMs=3000

## Refs
- `ref-room.jpg` — Pocket table
- `ref-over.jpg` — Pocket settle

## Repro
1. Open `index.html?v=play9mj2`
2. 大厅 → 麻将 → **日麻** → deal → tap tile twice to discard; 立直/自摸 when lit
3. Back → **四人麻将** still enters 推倒胡 JJ table

## QA
```bash
cd apps/web-lobby && node server.js &
PORT=5262 python3 docs/qa/play9mj2/qa_play9mj2.py
```
