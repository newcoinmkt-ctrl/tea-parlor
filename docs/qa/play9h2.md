# play9h2 — Dou Dizhu HUD polish

Cache: `play9h2` · timer above actions + more menu

## Changes
- `#turnTimer` stacked above 不出/提示/出牌 (not between hint)
- Top bar: only「更多」; 礼包/托管 in `#hudMoreMenu`
- `playButton` disabled when `selected.size === 0`

## 414 self-test (人机畅玩)
| Check | Result |
|---|---|
| timer above three buttons | PASS |
| more menu open (礼包/托管) | PASS |
| playButton disabled (no selection) | PASS |

Shots: `docs/qa/play9h2/ddz-414-play-timer-above.png`, `docs/qa/play9h2/ddz-414-more-menu.png`

Overall: PASS
