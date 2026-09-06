# play9v2 QA

- ok: **True**
- cache: `play9v2` viewport `[414, 896]`

## Pass
- `lobby_no_cta`: PASS
- `lobby_grid`: PASS
- `lobby_has_chain`: PASS
- `ddz_not_grid`: PASS
- `ddz_fan_layout`: PASS
- `ddz_count`: PASS
- `ddz_selected_gt0`: PASS
- `ddz_play_disabled_when_empty`: PASS
- `ddz_after_decreased`: PASS
- `mj_not_grid`: PASS
- `mj_count`: PASS
- `gd_not_grid`: PASS
- `gd_fan2_or_overlap`: PASS
- `gd_count`: PASS
- `gd_toolbar_above`: PASS
- `match_no_ai`: PASS
- `match_no_countdown`: PASS
- `match_silent_default`: PASS
- `ddz_has_overlap`: PASS
- `shots_distinct`: PASS

## Shots
- `lobby-414-home.png` sha1=056e25f570de bytes=222597
- `ddz-414-match-mask.png` sha1=9aa6e3aa6b1d bytes=184190
- `ddz-414-fan.png` sha1=2fbc9acbdb0d bytes=571673
- `ddz-414-selected.png` sha1=c2d9118f9272 bytes=578310
- `ddz-414-after-play.png` sha1=ecea87c29ff3 bytes=579502
- `mj-414-hand.png` sha1=8af88b7244bb bytes=977145
- `gd-414-hand.png` sha1=aeed9500ab36 bytes=274816

## Key checks
- DDZ layout=overlap/fan grid=False overlap=54 n=20
- selected=1 playDisabled=False
- after-play 20→19 decreased=True
- match copy=`匹配中…` hasAi=False countdown=False
