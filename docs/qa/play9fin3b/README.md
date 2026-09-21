# play9fin3b QA

## Goal
Ads for **skin / card / felt / clothes** load from a real config source (not hard-coded only):
1. `?adsUrl=` query
2. `ADS_PUBLIC_URL` / `TEA_ADS_URL` → `window.TEA_PARLOR_ADS_URL`
3. `ADS_CONFIG_JSON` → `window.TEA_PARLOR_ADS_CONFIG`
4. Static `./public/ads/manifest.json`
5. `PLACEHOLDER_AD_LOGO` fallback (+ img onerror)

Image + landing link swappable per placement. CSS keeps `pointer-events: none`.

## Cache
`?v=play9fin3b`

## Checks
1. Manifest exists with skin/card/felt/clothes slots
2. `resolveAdsUrl` / `resolveInlineAdsConfig` / `normalizeAdPlacement`
3. Runtime injects `TEA_PARLOR_ADS_URL` + `TEA_PARLOR_ADS_CONFIG`
4. Logo onerror → placeholder
5. pointer-events none preserved (fin2a)
6. ship3b `--tg-vh` preserved

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin3b-ad-config.test.js tests/play9fin2a-ad-logos.test.js tests/runtime-config.test.js
```
