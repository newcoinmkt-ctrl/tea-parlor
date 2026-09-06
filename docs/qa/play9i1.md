# play9i1 — lobby IA polish

Cache: `play9i1` · single nav · 金币 · CTA + 6-game grid

## Changes
- Hide topbar `quick-dock` (bottom tabbar is sole primary nav)
- Home currency label 影子积分 → **金币**; season chip hidden on home
- Hide `home-pack-grid`; slim `home-icon-grid` to 6 games under CTA in `p0-home-chrome`
- New `lobby-ia.css` (also forces chrome visible under `.p0-tg`); cache bust `play9h2` → `play9i1`
- play9h2 Dou Dizhu HUD / `#playControls` / more menu / hand-layout minW untouched

## 414 self-test
| Check | Result |
|---|---|
| no_quick_dock | PASS |
| no_pack_row | PASS |
| gold_label | PASS |
| no_season_on_home | PASS |
| six_game_icons | PASS |
| expected_games | PASS |
| cta_plus_grid | PASS |
| grid_on_first_screen | PASS |
| lobby_ia_css | PASS |
| cache_play9i1 | PASS |
| tabbar_visible | PASS |
| supply_reachable | PASS |
| table_tabbar_hidden | PASS |
| hud_play_controls | PASS |
| hud_more_present | PASS |
| hud_timer_above | PASS |
| hud_more_menu_shot | PASS |

Shots: `docs/qa/play9i1/lobby-home-414.png`, `lobby-supply-414.png`, `ddz-table-414.png`, `ddz-more-menu-414.png`

Overall: PASS
