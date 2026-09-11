# play9mj1 QA

## Self-test
1. Open `http://127.0.0.1:PORT/index.html?v=play9mj1` at **896×414** (landscape).
2. 大厅 → 麻将 → **四人麻将** (or `window.__teaParlor.startMahjong('siren')`).
3. Wait for deal (~2s opening) → 13 face-up tiles.
4. Tap a tile to select, tap again (or 弃) to discard → discard area updates.
5. Portrait 414×896: letterboxed landscape band, **no** 90° content rotate.

## References
- `reference/jj-table.png`
- `reference/jj-hu-settle.png`

## Deferred
- Match ≤3s (play9match3) — mahjong uses local AI enter, not DDZ match overlay.
