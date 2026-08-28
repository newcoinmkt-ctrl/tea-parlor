# play9 — UI-only table layout pass

Working copy: `/workspace/tea-fix/apps/web-lobby`
Cache: `hand-fit.css`, `table-landscape.css`, `table-play.css`, `app.js` all `?v=play9`.
`styles.css` not rewritten (not even present in this working copy). On-chain withdraw not touched. No games added. No clone / no push. `DDZ_TIER_IDS` stays at app.js:208 (before `boot()`). `--vvh` still only set by `applyDeviceAdapt` as `h * 0.01` px. Never `100vh`. `table-orient.js` still only **removes** `css-landscape`.

## Files changed

| File | Why |
|---|---|
| `apps/web-lobby/index.html` | cache `v=play9` on the 4 overlay assets |
| `apps/web-lobby/src/table-play.css` | last-word DDZ dock, Guandan flatten, mahjong gutter, one Texas D, opaque rules toast |
| `apps/web-lobby/src/table-landscape.css` | neutralize css-rotate; Guandan dock `left:56px` |
| `apps/web-lobby/src/hand-fit.css` | `.gd-col{display:contents}`, dock gutter, compact 弃 |
| `apps/web-lobby/src/net/hand-layout.js` | `layoutGuandanCols` → one `layoutOverlapRow`; dock rect vs `innerWidth` |
| `apps/web-lobby/src/app.js` | one Texas D; `hideRulesToast` at top of `handleLobbyAction` when `action !== 'rules'` |
| `PLAY9.md` | this file |
| `apps/web-lobby/src/net/table-orient.js` | **not edited** — already never adds `css-landscape` |

## Key selectors

### 1. Dou Dizhu dock (play8b QA: bid painted on the cards)

Live play8b: `--tg-vh === innerHeight` (good). 17 cards, no x-overflow. **FAIL:** `bid.bottom` was 74px below `hand.top` on every viewport (360: bid.bottom 614 / hand.top 540; 414: 870 / 796). `#bidControls` z-index **80** over `#handArea` z-index **12**. Hand ~8px above viewport bottom; bid ~26px above viewport bottom.

play9 last word in `table-play.css`:

- `.lobby-shell.table-active:not(.texas-active):not(.multi-active) #tableView.harbor-table` → `position:fixed; inset:0; height:var(--tg-vh,100dvh); z-index:400; display:block`
- `.self-slot` → `position:fixed; left:0; right:0; bottom:0; top:auto; z-index:50; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:calc(8px + env(safe-area-inset-bottom))`
- Column order (flex items of `.self-slot`): `.play-zone-self` 0 → `.qq-center-actions` / `#bidControls` / `#playControls` / `#doubleControls` **order:1** → `.hand-wrap` / `#handArea` **order:2**
- Bid/play/double: `position:relative; inset:auto; transform:none; z-index:10` (**kills z-index:80**)
- `#handArea`: `z-index:12; padding-left:56px`
- Pass: `bid.bottom <= hand.top` (no overlap). Bid is a sibling **above** the hand, not `position:absolute` over the cards.

### 2. Guandan

- JS: `layoutGuandanCols` sets `.gd-col { display:contents }`, clears `margin-top`, packs all `.gd-card` with `layoutOverlapRow` using `dock.getBoundingClientRect().width` vs `innerWidth`
- CSS: `.gd-col { display:contents !important }`
- `.gd-yard .mg-hand-dock { left:56px; right:8px; overflow:hidden }` (position is the gutter; padding 0 so it does not stack)
- `.gd-toolbar` `position:relative; order:0` above `#mgHand` `order:1` — 恢复 / 一键理牌 sit **above** the fan, not on it

### 3. Mahjong

- `.mg-hand-dock { padding-left:56px }` (inner `#mgHand` padding 0 — one gutter)
- `#mgHand` one overlapping row (`layoutOverlapRow`, nowrap)
- `.mj-4p/#mgActions .qq-btn { width:fit-content; flex:0 0 auto; max-width:88px }` — no giant 弃

### 4. Texas D

- Markup already: `<i class="tx-dealer" data-tx-dealer="0|1|2" hidden>D</i>`
- Overlay: `.tx-dealer[hidden]{display:none !important;visibility:hidden !important}`
- `initTexas` / `startTexas` / hooked `texasUI.render|update|sync`: hide all, unhide only the dealer seat
- Fallback: only `data-tx-dealer="0"`
- `#texasActions` / `#texasSettleRow` keep 弃/跟/加/全下+slider in the dock with `padding-bottom: calc(8px + env(safe-area-inset-bottom))`

### 5. Rules toast

- `hideRulesToast()` already first line of `setLobbyView`
- Also first line of `handleLobbyAction` when `action !== 'rules'` (我 / 大厅 / 战绩 / 补给 close it; 说明 keeps it)
- `#rulesToast:not(.is-open), #rulesToast[hidden] { display:none !important }`
- `#rulesToast.is-open { position:fixed; inset:0; background:rgba(8,14,22,0.96); z-index:600; height:var(--tg-vh,100dvh); transform:none }`

### Tokens

```css
:root {
  --tg-vh: 100dvh;
  --ui-btn-h: clamp(32px, 5vw, 44px);
  --ui-btn-r: clamp(10px, 2vw, 16px);
  --ui-fs: clamp(12px, 3.2vw, 15px);
}
```

`--vvh` not overwritten.

## Dealer index — **not found**

This working copy has **no** `src/texas/ui.js` (import still `./texas/ui.js`). `app.js` Texas state is `texasUI`, `texasBuyIn`, `lastStacks` — **no** `dealer` / `dealerIndex` / `button` field.

`readTexasDealerIndex` still looks for `dealer | dealerIndex | dealerSeat | dealerPos | button | buttonIndex | btn | btnSeat` on the argument, `texasUI`, and `window.__texasState`. If none is a seat 0–2, **only seat 0 is shown**. Never all three.

## Self-test

Measure on 360×640, 414×896, and a short viewport. `--tg-vh` may equal `innerHeight`; `--vvh` stays ~1vh.

1. **Dou Dizhu bid**
   - 17 cards in `#handArea`, no x-overflow.
   - `#bidControls` in document flow above `#handArea`.
   - `bid.getBoundingClientRect().bottom <= hand.getBoundingClientRect().top` (was 74px overlap).
   - Computed `z-index` of `#bidControls` is **10**, not 80; `#handArea` is **12**.
   - `.self-slot` `position:fixed; bottom:0`; table `height` is `var(--tg-vh)`, never `100vh`.
   - `html` class list must **not** contain `css-landscape`.

2. **Guandan**
   - `.gd-col` computed `display:contents`.
   - All `.gd-card` share one horizontal overlapping row (no `margin-top` stack).
   - 恢复 / 一键理牌 sit above the fan, not covering tiles.
   - Dock `left` 56px.

3. **Mahjong**
   - Hero avatar does not cover tile 1–2 (`padding-left:56px` on `.mg-hand-dock`).
   - 13–14 tiles in one overlapping row.
   - 碰/杠/胡/过/弃 `width:fit-content`, 弃 is not a giant flex grower.

4. **Texas**
   - Exactly one visible `.tx-dealer` (the other two `[hidden]` + `display:none !important`).
   - Actions row still in the dock with safe-area padding.

5. **Rules toast**
   - Open 说明: opaque fullscreen (`background rgba(8,14,22,0.96)`), `inset:0`.
   - Tap 我 / 大厅 / 战绩 / 补给: toast `display:none` (not a semi-transparent leftover).
