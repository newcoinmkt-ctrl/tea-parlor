# play9v3d QA

- ok: **True**
- cache: `play9v3d` viewport `[414, 896]` `is_mobile` + `has_touch`

## Pass
- hand_first_on_screen: PASS
- hand_justify_start: PASS
- hand_not_max_content_clip: PASS
- lastPlay_center_or_seat: PASS
- pass_bubble: PASS
- no_white_screen: PASS
- shots_distinct: PASS

## Root causes fixed
- handArea width:max-content + justify-content:center clipped leftmost cards off-screen
- applyPinusRoom wiped tableActs every online snapshot → empty play-zones
- safe-bottom clearance lifted chrome but y-scrollport still ate rank bottoms

## Checks
```json
{
  "hand_edges": {
    "n": 17,
    "scrollLeft": 0,
    "justify": "flex-start",
    "width": "338px",
    "maxWidth": "100%",
    "overflowX": "auto",
    "overflowY": "hidden",
    "padL": "72px",
    "padB": "14px",
    "area": {
      "left": 62,
      "right": 400,
      "top": 774,
      "bottom": 866,
      "w": 338,
      "h": 92
    },
    "first": {
      "left": 134,
      "right": 176,
      "top": 792,
      "bottom": 852,
      "w": 42,
      "h": 60
    },
    "last": {
      "left": 422,
      "right": 464,
      "top": 792,
      "bottom": 852,
      "w": 42,
      "h": 60
    },
    "firstFullyOnScreen": true,
    "lastFullyOnScreenOrScrollable": true,
    "bottomAboveSafe": true,
    "sample": [
      {
        "left": 134,
        "right": 176,
        "top": 792,
        "bottom": 852,
        "w": 42,
        "h": 60
      },
      {
        "left": 152,
        "right": 194,
        "top": 792,
        "bottom": 852,
        "w": 42,
        "h": 60
      },
      {
        "left": 170,
        "right": 212,
        "top": 792,
        "bottom": 852,
        "w": 42,
        "h": 60
      }
    ]
  },
  "lastPlay_dom": {
    "centerCards": 2,
    "zone0": 0,
    "zone1": 2,
    "zone2": 1,
    "passBubbles": 1,
    "lastPlayText": "压 茶友A：♠2 ♦A（对子）",
    "fanHidden": false,
    "fanVisible": true,
    "zone1Visible": true,
    "zone1Opacity": "1",
    "zone1Z": "28"
  },
  "lastPlay_apply": {
    "tableActs": [
      null,
      {
        "kind": "play",
        "n": 2
      },
      {
        "kind": "pass",
        "n": 0
      }
    ],
    "centerN": 2,
    "zoneN": [
      0,
      2,
      1
    ]
  },
  "after_play": {
    "ok": true,
    "zone0": 1,
    "center": 1,
    "handN": 16
  },
  "white_guard": {
    "tableActive": true,
    "tvDisplay": "flex",
    "tvVisibility": "visible",
    "handN": 16,
    "bodyBg": "rgba(0, 0, 0, 0)"
  }
}
```

## Shots
- `lobby-414-home.png` sha1=056e25f570de bytes=222597
- `ddz-414-fan-fullwidth.png` sha1=177fd5000e9e bytes=576040
- `ddz-414-hand-closeup.png` sha1=85a5ac522427 bytes=31625
- `ddz-414-lastplay-table.png` sha1=513f708851c2 bytes=585896
- `ddz-414-after-play.png` sha1=cb8495c54333 bytes=563310
