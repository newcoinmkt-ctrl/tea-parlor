# play9ship3 QA

Improve playability + archive-gap fixes on tea-parlor 推倒胡 (keep 日麻).

## Root causes fixed
1. 碰/杠: hand deduct hardened; claimed tile removed from river; `#mgMelds` shows 副露.
2. Settlement: `render()` always calls `showSettle` (not only `scheduleAi`); ledger/scores fallback so panel never empty.
3. 定缺: discard rejects non-que while que remains (`must_discard_dingque`).
4. Countdown: visible + auto soft-play on 0 so turns rotate.
5. Disconnect: `visibilitychange` soft trustee — table does not freeze (full 托管 deferred).

## Must-ship verified
- **A DDZ:** select raise → legal 17→16; illegal grey; 414+896; no play9fix2 regress.
- **B Mahjong:** 推倒胡 + 日麻 enter/discard; settle non-empty; peng deduct.
- **C 牛牛:** enter + engine 抢庄→下注→开牌→settle non-empty.

## Forbidden / deferred
- Stars / TON / USDT / mall NFT / sponsor: zero
- Full 托管: deferred (soft disconnect only)
- Colyseus: unchanged this ship

## Cache
`?v=play9ship3` · matchMs=3000 · no rotate90

## Run
```bash
cd apps/web-lobby && PORT=5293 node server.js
PORT=5293 python3 docs/qa/play9ship3/qa_play9ship3.py
node --test tests/mahjong-ship3.test.js tests/ddz-play-validate.test.js tests/niuniu-lobby.test.js
```
