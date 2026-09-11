# play9fix1 QA

## Strategy
- **Landscape (W≥H, e.g. 896×414):** JJ landscape letterbox (`translate+scale`), jj1b zone lock.
- **Portrait (H>W, e.g. 414×896):** upright full-viewport fill (`transform:none`) — **not** a tiny letterboxed strip.
- **Forbidden:** page / `#tableView` / `#multiGameView` `rotate(90deg)`.

## Checks
- DDZ: raise select → legal「出牌」removes cards (17→16); illegal grey; action bar hittable
- MJ: lobby 四人麻将 → enter + deal + discard
- Both orientations playable

Cache: `?v=play9fix1`
