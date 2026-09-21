# play9fin5a QA

## Goal
1. **Recent same-table server-backed**: not localStorage-only; fetch/post by user session within existing auth
2. Survives refresh / device switch when Telegram session available
3. Local cache remains offline fallback
4. Preserve light social (no full IM) + prior fin1–fin4 features

## Cache
`?v=play9fin5a`

## Run
```bash
cd apps/web-lobby && npm run test:fin5a
cd apps/api-gateway && node --test tests/recent-tables.test.js
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | GET/POST `/social/recent-tables` requires session | recent-tables.test.js |
| 2 | Client syncRecentTablesFromServer + post on remember | play9fin5a-recent-tables.test.js |
| 3 | Local cache fallback without session | app.js loadRecentTablesLocal |
| 4 | Cache `?v=play9fin5a` | index.html + app.js |

## Preserve
ship3b `--tg-vh`; fin1–fin4 reconnect/dual/yaku/logos/trustee/ads/five-tabs/activity/light social.
