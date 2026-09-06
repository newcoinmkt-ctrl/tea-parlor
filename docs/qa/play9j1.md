# play9j1 — 麻将桌可读性（pill / 弃钮 / 行家 meta）

Cache: `play9j1`

## 范围
仅 `mj-2p` / `mj-4p` multi-game view。不动斗地主 play9h2 HUD、大厅 play9i1、hand-layout minW、more 菜单、出牌逻辑。

## 改动
- `table-play.css`：追加 mj-readability（金底深字 `#3d2e00`、操作条贴手牌、弃/胡 56 热区、行家 meta 描边、costume chip 弱化、罗盘数字）
- `games/mahjong/ui.js`：「出牌中」加 `is-acting`
- cache `play9i2` → `play9j1`（index CSS/JS + hand-layout import stamp）

## 414 自测摘要
| 项 | mj-2p | mj-4p |
|----|-------|-------|
| `#mgSub` color | rgb(61,46,0) ✓ | rgb(61,46,0) ✓ |
| `.mj-btn-qi` | 56×56 ✓ | 56×56 ✓ |
| actionsAboveHand | true（gap≈16） | true（gap≈16） |
| 出牌中 is-acting | color #fde68a ✓ | color #fde68a ✓ |
| data-mj-act | kept | kept |

回归：大厅仍见「金币」+ 六玩法；斗地主「更多」菜单可展开。

## 截图
- `docs/qa/play9j1/lobby-414.png`
- `docs/qa/play9j1/mj2p-414.png`
- `docs/qa/play9j1/mj4p-414.png`
- `docs/qa/play9j1/mj4p-turn-meta-414.png`
- `docs/qa/play9j1/ddz-more-414.png`
- `docs/qa/play9j1/report.json`

## 偏差
- 为压过既有 play9g1 高特异性紧凑 pill，追加选择器带 `html body .lobby-shell.multi-active #multiGameView…`（尺寸目标仍为补丁的 56）。
