# play9fin1c QA

## Gaps
1. `estimateFu` — 七对25 / 门清荣和30 / 平和自摸20 / 自摸+2
2. `evaluateYaku` never returns empty on a winning hand
3. Settle builder + UI always show 番 + 符 + 点; ura row when riichi
4. Common set: 立直/一发/门清/平和/断幺/役牌/宝牌/里宝牌

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin1c-yaku-fu.test.js tests/riichi-engine.test.js tests/mahjong-play9mj3.test.js
```
