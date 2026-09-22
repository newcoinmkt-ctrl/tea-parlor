# play9gd1b — Guandan playable minimal rules

## Scope
- Server-authoritative deal / play / pass via `@tea-parlor/guandan-engine`
- Illegal plays rejected; human+AI can finish a hand
- 级牌 HUD wired to server `currentRank`
- ui2c visuals preserved (四炸 stacks / 理牌 display-only)
- Cache `?v=play9gd1b`
- Tribute still CUT (skipTribute)

## Supported hand types (this wave)
| Type | 中文 |
|------|------|
| SINGLE | 单张 |
| PAIR | 对子 |
| TRIPLE | 三张 |
| TRIPLE_PAIR | 三带二 |
| CONSEC_PAIRS | 三连对 |
| CONSEC_TRIPLES | 钢板 |
| STRAIGHT | 顺子 |
| STRAIGHT_FLUSH | 同花顺 |
| BOMB | 炸弹 (4+) |
| JOKER_BOMB | 天王炸 |
