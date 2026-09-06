# play9h1 — 斗地主手牌解锁 + 麻将可见

Cache: `play9h1` · base `main@08f95c0` (play9g1d)

## 根因
1. **斗地主**：`table-play.css` 多处把 `#handArea .playing-card` 锁死为 **28×42**，414 几乎不可点。
2. **麻将**：play9g1d 的 `translateY(-96px)` 把 hero 手牌抬得过高，易与毡面/座位叠层导致「看不见」。

## 修复
- 斗地主：最高优先级覆盖为 **40×56**（可点选），`pointer-events: auto`，选中上抬。
- 麻将：hero raise 收到 **-28px**；强制 `#mgHand` / `.mg-hand-tile` `opacity:1; visibility:visible`；牌面 ≥30×46。

## 414 自测
- 斗地主人机畅玩：手牌约 40×57，可点选。
- 麻将四人：`opacity:1`，`transform: translateY(-28px)`，tiles on-screen。

不接链；不动匹配/补给。
