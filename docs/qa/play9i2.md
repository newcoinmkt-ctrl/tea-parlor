# play9i2 — 斗地主「更多」菜单可展开

## 根因
牌桌 `.qq-hud` 在横屏/harbor 规则里 `overflow: hidden` + 固定高度，绝对定位的 `#hudMoreMenu` 被裁切，看起来像点不开。

## 修复
- `table-play.css`：HUD / tools / more-wrap `overflow: visible`，菜单 z-index 抬高
- `app.js`：toggle 用 capture + `hidden`/`aria-expanded`/`is-open`；牌桌内允许 `#hudMoreMenu [data-lobby-action]`（礼包）
- cache `play9i2`

不动牌宽 / 出牌逻辑。不接链。
