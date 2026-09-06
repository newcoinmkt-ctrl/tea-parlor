# play9h1 — 斗地主手牌解锁 + 麻将可见

Cache: `play9h1` · base `main@08f95c0` (play9g1d) · PR #14

## 根因
1. **斗地主 CSS**：`table-play.css` 多处把 `#handArea .playing-card` 锁死为 **28×42**。
2. **斗地主 JS（关键）**：`hand-layout.js` `fitAllHands` 对 `#handArea` 用 `minW:24 / minPeek:12`，并写 **inline `width !important`**，会压过任何 CSS 40px。
3. **麻将**：play9g1d `translateY(-96px)` 抬过高，易「看不见」。

## 修复
- `hand-layout.js`：斗地主 pack **`minW≥40`、`minPeek≥16`**；overflow clamp 尊重 `opts.minPeek`。
- `table-play.css`：28×42 解锁为 40×56；麻将 raise **-28px** + opacity/visibility。
- `app.js` / `index.html`：cache `?v=play9h1`。

## 414 自测（人机畅玩）
| 项 | 结果 |
|---|---|
| idle 手牌 | n=17, **minW=48**, **minPeek=16**, inlineW=`48px` → size PASS |
| 出牌后 | hand **17→15**，见 `ddz-414-after-play.png` |
| 麻将 | tiles visible, opacity=1, w≈32 |

不接链；不动匹配/补给。三样齐再合。
