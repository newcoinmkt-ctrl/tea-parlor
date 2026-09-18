# play9fix2 QA

```bash
PORT=5280 HOST=127.0.0.1 node apps/web-lobby/server.js &
PORT=5280 python3 docs/qa/play9fix2/qa_play9fix2.py
```

Acceptance: DDZ select→出牌 17→16; illegal grey; touch≠mousedown; MJ 推倒胡+日麻 both enter+discard; no rotate90; matchMs=3000.
