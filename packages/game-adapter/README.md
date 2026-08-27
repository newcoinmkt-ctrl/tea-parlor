# @tea-parlor/game-adapter

Game services emit `settlement_intent` only. Wallet posting stays in wallet-service.

## 7 methods

- `createRoom(config)` — `config.chipCurrency`, `config.baseAmount`
- `joinRoom(roomId, player)`
- `startRound(roomId)`
- `applyAction(roomId, playerId, action)`
- `getPublicState(roomId, viewerId)`
- `settleRound(roomId)`
- `replay(roomId)`

## Add a game

1. Copy `apps/game-servers/_template` to `apps/game-servers/<id>/`
2. `registerGame({ id, createAdapter, playable })` in `packages/game-adapter`
3. Implement the 7 methods (or wrap an engine)
4. Set catalog `playable`: `ready` | `h5-local` | `未接通`

## Status

| Game | Adapter | Playable |
|------|---------|----------|
| doudizhu | ready (engine adapter + net) | ready |
| texas-holdem | 7-method wrap | h5-local |
| zhajinhua | 7-method wrap | h5-local |
| mahjong | 7-method wrap | h5-local |
| guandan | placeholder + register | h5-local |
