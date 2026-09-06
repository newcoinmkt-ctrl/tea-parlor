# play9k1 — 掼蛋拇指区（理牌条上手牌 + seat0 让路）

Cache: `play9k1`

## 范围
仅 `gd-yard` / `gd-active`。不动麻将 play9j1 CSS、大厅 play9i1、斗地主 play9h2 HUD/more、hand-layout minW、出牌规则。保留 `data-gd-restore` / `data-gd-sort` / suit 监听。

## 改动
- `games/guandan/ui.js`：`ensureChrome` 将 `.gd-toolbar` `insertBefore` 进 `.mg-hand-dock` 首子；末尾再防掉回顶栏
- `table-play.css`：文末追加 `gd-thumb-patch`（工具条相对定位于 dock、seat0≤56、z-index/pointer-events 让牌可点；提高特异性压过既有 landscape 规则）
- cache `play9j1` → `play9k1`（index CSS/JS + hand-layout import stamp only）

## 414 自测摘要
| 项 | 结果 |
|----|------|
| toolbar 在 dock 内、#mgHand 之上 | ✓ barInDock + toolbarAboveHand |
| 恢复 / 一键理牌 + 花色筛选 | ✓ listenersKept |
| seat0 宽 ≤56 | ✓ width 56px / wrap 52×52 / transform none |
| 不挡最左牌 / 可点牌 | ✓ overlap 0；cardTapOk |
| 大厅 金币 + 六玩法 | ✓ |
| mj / ddz smoke | mj-4p 可开；ddz 入口仍在 |

## 截图
- `docs/qa/play9k1/lobby-414.png`
- `docs/qa/play9k1/gd-414-thumb.png`
- `docs/qa/play9k1/gd-414-card-tap.png`
- `docs/qa/play9k1/gd-414-toolbar-hand.png`
- `docs/qa/play9k1/mj-smoke-414.png`
- `docs/qa/play9k1/ddz-smoke-414.png`
- `docs/qa/play9k1/report.json`

## 偏差
- `hand-layout.js` 仍对 GD dock 写 inline `left: 56px !important`（未改 minW / 未动该文件）。CSS 目标 `left: 64px` 被 inline 压住；seat0 缩至 56 后首牌 left≈72，仍无遮挡。
- dock `z-index` 经提高特异性后为 22（patch 目标）；seat0 z-index 8。
