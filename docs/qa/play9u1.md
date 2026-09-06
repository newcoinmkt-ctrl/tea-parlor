# play9u1 — 恢复链游中心入口

## 根因
play9i1 藏合集行 + 宫格去链游；`table-play.css` 还有 P1 规则强制 `display:none` 链游格。

## 修复
- 首页宫格加回「链游中心」+ hint
- `lobby-ia.css` 强制显示链游格（盖过 table-play P1）
- 合集/补给中心卡片继续 hidden
- cache `play9u1`

只恢复入口与数字货币专用场导航，不做新 USDT 真充。
