# play9ui2a — DDZ cruise settle thicken

Refs: `01-ddz-settle-night.png`, `04-ddz-settle-day.png`

## Scope
- Floating 3D ± score text (gold win / silver-white loss)
- Circular 胜 stamp on winning last card
- 总分 under local player
- Top pill: progress + multiplier (structure; xp placeholder if no career meter)
- Day/night via `--jj-atm-*` CSS vars + `jj-atm-day` / `jj-atm-night` (no huge bg dependency)
- Cards/hands must not overlap scores/avatars; rematch + hall preserved
- Cache `?v=play9ui2a`

## Guards
- Letterbox landscape only — no whole-page CSS `rotate`
- Preserve ship3b `--tg-vh`
- Ad logo slots kept; no Stars/TON/USDT/chain/withdraw
