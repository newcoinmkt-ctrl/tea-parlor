# play9fin4a QA

## Goal
1. **Ops/activity entry**: lobby activity / daily supply enterable and viewable
2. Rewards = shadow chips only, non-withdrawable
3. **NO** Stars / chain top-up on the activity page

## Cache
`?v=play9fin4a`

## Run
```bash
cd apps/web-lobby && npm run test:fin4a
```

## Checks
| # | Check | Evidence |
|---|-------|----------|
| 1 | Home activity entry → activity view | play9fin4a-activity.test.js |
| 2 | Daily supply claim on activity page | HTML `#activityClaimBtn` + `data-lobby-action="claim"` |
| 3 | Chips only / 不可提现 | copy + activity legal |
| 4 | No Stars / chain top-up on activity | activity block + CSS hide |
| 5 | Cache `?v=play9fin4a` | index.html + app.js |

## Preserve
ship3b `--tg-vh`; fin1–fin3 reconnect/dual/yaku/logos/trustee/ads/five-tabs/dual-smoke.
