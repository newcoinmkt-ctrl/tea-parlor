# Game Server Template

Copy to apps/game-servers/<gameId>/

1. registerGame({ id, createAdapter })
2. Implement createRoom joinRoom startRound applyAction getPublicState settleRound replay
3. settleRound returns settlement_intent only
4. catalog playable: h5-local | ready | 未接通
