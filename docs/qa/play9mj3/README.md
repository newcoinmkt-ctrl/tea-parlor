# play9mj3 QA

## Root gaps filled
1. **日麻立直**: declare tappable + `is-riichi-armed` / pending state; seat `is-riichi`; riichi discard index.
2. **番结算**: 立直/一发/门清自摸/宝牌/里宝牌 → non-empty yaku + points; settle shows ura row.
3. **吃碰杠**: 推倒胡 `chi` (classic only) + 日麻鸣牌; hand deduct; buttons only when legal.
4. **软代打**: 日麻 countdown auto + `visibilitychange` soft trustee (extend ship3).

## Must-ship
- A DDZ: select → play 17→16; ship3b safe-area intact
- B 推倒胡 enter + countdown; 日麻 table + settle yaku
- C 牛牛: enter + 抢庄→下注→搓牌→亮牌 smoke

## Cache
`?v=play9mj3` · matchMs=3000 · no rotate90

## Run
```bash
cd apps/web-lobby && PORT=5294 node server.js
PORT=5294 python3 docs/qa/play9mj3/qa_play9mj3.py
node --test tests/mahjong-play9mj3.test.js tests/mahjong-ship3.test.js tests/ddz-play-validate.test.js tests/niuniu-lobby.test.js tests/tg-viewport-stable.test.js
```
