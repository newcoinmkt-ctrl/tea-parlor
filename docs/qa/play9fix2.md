# play9fix2 — DDZ play + MJ 推倒胡/日麻 enter (post-mj2b)

Ed still cannot play on live TG Mini App after `play9mj2b`.

## Root causes
1. `applyTelegramSafeArea` called unbound `tg.expand()` on every `viewportChanged` → expand↔viewportChanged freeze on TG 麻将 enter (play9fix1 only rate-limited `expandTelegramTable`).
2. `forceCloseMultiView` omitted `riichi-active` + rkSettle/kawa teardown → Pocket chrome could bleed into 推倒胡/DDZ.
3. `html.table-landscape #multiGameView {display:grid!important}` could override `[hidden]` on TG WebView covering DDZ hand.
4. Unscoped `#rkSettle {inset:0;z-index:80}` could cover non-riichi tables.

## Fix
- Rate-limit expand via `expandTelegramTable` in `applyTelegramSafeArea` + `initTelegramMiniApp`.
- Tear down `riichi-active` / rk chrome on multi close (keep static `.mj-wall` nodes).
- Scope landscape grid + `#rkSettle` to active riichi/multi only.
- Cache `?v=play9fix2`.

## QA
See `docs/qa/play9fix2/report.json` — ok=true (DDZ 17→16 both orients, 推倒胡+日麻 enter/discard, no rotate90, expand rate-limited, no riichi bleed).
