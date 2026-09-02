# Tea Parlor Ops Service

Internal operations API for test operations and audit workflows.

This service is intentionally limited to shadow-points operations:

- admin-token protected HTTP API
- user account and ledger lookup
- realtime room state and replay lookup
- settlement anomaly scan
- user freeze flag for operations review
- room config management for shadow-points rooms
- ad placement management for lobby, table surface, table rail, and character costume slots

It does not implement real-money recharge, withdrawal, crypto custody, or casino cash-game operations.

## Local usage

```bash
ADMIN_TOKEN=change-me npm start -w @tea-parlor/ops-service
# Production requires ADMIN_TOKEN. The admin page has no default password.
# Local-only example value (README only): tea-parlor-ops
```

打开控制台：http://127.0.0.1:5190/admin

Use `Authorization: Bearer <ADMIN_TOKEN>` or `x-admin-token: <ADMIN_TOKEN>` for `/admin/*` routes.

## Routes

| Route | Purpose |
|------|---------|
| `GET /health` | unauthenticated health check |
| `GET /admin/users` | list known wallet/frozen users |
| `GET /admin/users/:userId` | user balance, freeze status, ledger summary |
| `POST /admin/users/:userId/freeze` | mark a user frozen for ops review |
| `POST /admin/users/:userId/unfreeze` | clear the frozen flag |
| `GET /admin/ledger` | query ledger by `userId`, `type`, or `referenceId` |
| `GET /admin/rooms` | list connected game-server rooms |
| `GET /admin/rooms/:gameId/:roomId` | inspect public room state |
| `GET /admin/rooms/:gameId/:roomId/replay` | inspect sanitized room events |
| `GET /admin/settlements/anomalies` | scan rooms for settlement anomalies |
| `GET /admin/room-configs` | list shadow-points room configs |
| `PUT /admin/room-configs/:gameId/:roomKey` | update one room config |
| `GET /public/catalog` | lobby game on/off catalog |
| `GET /public/player-status` | whether a player is frozen |
| `POST /public/player-touch` | register a lobby player for ops review |
| `GET /public/ad-placements` | public enabled ad placements, filterable by `surface` and `slotType` |
| `GET /admin/games` | list all game types |
| `PUT /admin/games/:gameId` | enable or disable one game type |
| `GET /admin/ad-placements` | admin list including disabled ad placements |
| `PUT /admin/ad-placements/:slotId` | create or update one ad placement |
| `GET /admin/ledger/summary` | shadow-points reconciliation totals |
| `POST /admin/users/:userId/grant` | issue shadow points |
| `PUT /admin/users/:userId` | update display name / note |
