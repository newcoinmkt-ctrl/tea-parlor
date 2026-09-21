# play9fin6c QA

## Goal
1. Room generates invite link / startapp params
2. Another session joins same room via deep link (dual-session)
3. Full regression green: trustee/ads/activity/recent/five tabs/three games
4. No Stars/chain/withdraw/whole-page rotate

## Cache
`?v=play9fin6c`

## Run
```bash
cd apps/web-lobby && npm run test:fin6c
```

## Preserve
ship3b `--tg-vh`; fin1–fin6b.
