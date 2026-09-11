# play9nn1b QA — 牛牛「游戏不能玩」fix

Fixes the existing lobby **牛牛** plugin after play9nn1. No second tile/icon, no Cocos, no rotate90, no chain/USDT, no gl_mj port.

## Root cause
Mobile `#multiGameView.nn-active` inherited `html.table-landscape .multi-active .mg-table { display:grid }` (and `table-active` shell class from nn `show()`), so the 6-seat absolute layout collided with MJ/DDZ chrome. AI instant-`liangpai` during 搓牌 made seats look settled while 搓/开 remained; 搓牌 was a no-op (5th already face-up). Dock lacked safe-area / pointer hardening for TG Mini App.

## Fix
- Force `.nn-active .mg-table { display:block; grid:none }` + hide `.mg-footer`
- Felt / seats `pointer-events:none`; `#nnActions` z-index + `pointerup`+click debounce
- `show()` → `multi-active` only (not `table-active`)
- 搓牌 keeps 5th hole until kan/liang; AI opens only after human 搓/开 (or timeout)
- Cache bust `?v=play9nn1b`

## Self-test
```bash
cd apps/web-lobby && node --test tests/niuniu-engine.test.js tests/niuniu-lobby.test.js tests/table-orient-upright.test.js
python3 docs/qa/play9nn1b/qa_play9nn1b.py   # serves via PORT=5252
```

Manual: 大厅→牛牛→新手场→匹配中→抢庄→下注→搓/开牌→niu stamp→settle；414 upright + 896 letterbox；DDZ/MJ smoke.

## Evidence
See screenshots + `report.json` in this folder.
