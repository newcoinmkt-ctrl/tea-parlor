# play9gd1a — Guandan Colyseus room + lobby entry

## Scope
- Register Colyseus `guandan` room (4-seat, MATCH_MS=3000 silent AI fill)
- Lobby gold/ingot Guandan joins Colyseus (keep existing tiles; no crypto rooms this wave)
- `/health.games` includes `guandan`
- Cache `?v=play9gd1a`
- Tribute (进贡/还贡): **cut this wave** — settle ranks only; skipTribute=true
- Reuse `@tea-parlor/guandan-engine` (no second rules engine)

## Supported hand types (engine)
单张、对子、三张、三带二、三连对、钢板、顺子、同花顺、炸弹、天王炸

## Acceptance
lobby → Guandan novice (gold) → 4 seats filled (human+AI); health lists guandan
