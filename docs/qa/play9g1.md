# play9g1d — 麻将手牌进毡 / 弃钮收窄

Cache: `play9g1d`

## 对照靶子
- 靶子：底栏右侧巨大「弃」压住手牌下半截
- 修后：弃=右上角 40×32 pill；手牌底↔footer 顶 ~126px；点选升起、双击打出

## 414 度量（play9g1d）
- `btn` 40×32，靠右不压中间牌面
- `gapHandFooter` ≈ 126
- `actionsAboveHand` / `maxTileBottomClearFooter` = true
- 选中 1 张 → 双击后 14→13

## 截图
- `mj-414-play.png` / `mj-414-select.png` / `mj-414-after-play.png`
- `compare-mj-bottom.png`（左靶子 / 右修后）
- 炸金花看牌后：`zjh-414-after-look.png`（看牌后 3 张明牌 + 跟加弃可点）

## 改动
- `table-play.css`：毡面下延、hero 上抬、弃靠右窄 pill、footer 不压牌
- `index.html`：`v=play9g1d`
