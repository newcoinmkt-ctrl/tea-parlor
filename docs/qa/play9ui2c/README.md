# play9ui2c — Guandan 4-seat yard table shell

Ref: `03-guandan-table.png`

## Scope
- Four seats diamond: bottom / left / top / right — avatar + chip/score + remain
- Center play area; 级牌 + 记牌器 HUD (real fields when present, else placeholder)
- Hand: vertical bomb stacks with 「四炸」; 恢复 + 一键理牌 (display sort only)
- Suit filter chips; letterbox landscape; enter table / play / pass / tap hand
- Reuses existing Guandan module + match pipeline — **no new rules engine**
- Cache `?v=play9ui2c`
