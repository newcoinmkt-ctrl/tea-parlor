# play9v3e QA

- ok: **True**
- cache: `play9v3e` viewport `[414, 896]` `is_mobile` + `has_touch`

## Pass
- hand_first_on_screen: PASS
- hand_gutter_ge_100: PASS
- hand_no_avatar_overlap: PASS
- hand_first_clear_of_avatar: PASS
- lastPlay_center_visible: PASS
- pass_bubble_seat: PASS
- pure_pass_bubble: PASS
- no_white_screen: PASS
- shots_distinct: PASS

## Root causes fixed
- 72px hand gutter still left first card under self avatar (金佬) overflow
- self avatar z-index / paint order could sit above fan cards
- pure pass lastPlay (empty cards) did not seed seat「不出」bubble; only local Pass button showed

## Checks
```json
{
  "hand_avatar": {
    "n": 17,
    "scrollLeft": 0,
    "justify": "flex-start",
    "padL": "100px",
    "areaZ": 90,
    "firstZ": 20,
    "avZ": 18,
    "barZ": "18",
    "area": {
      "left": 62,
      "right": 400,
      "w": 338,
      "h": 92
    },
    "first": {
      "left": 162,
      "right": 204,
      "top": 792,
      "bottom": 852,
      "w": 42,
      "h": 60
    },
    "last": {
      "left": 450,
      "right": 492,
      "w": 42
    },
    "avatar": {
      "left": -17.3,
      "right": 29.3,
      "top": 816,
      "bottom": 886,
      "w": 46.6,
      "h": 70
    },
    "firstFullyOnScreen": true,
    "firstClearOfLeftEdge": true,
    "avatarOverlapFirst": false,
    "cardsAboveAvatar": true,
    "gutterPx": 100
  },
  "lastPlay_dom": {
    "centerCards": 8,
    "zone0": 0,
    "zone1": 8,
    "zone2": 1,
    "passBubbles": 1,
    "passBubbleText": "不出",
    "fanHidden": false,
    "fanVisible": true,
    "passBubbleVisible": true
  },
  "pure_pass_dom": {
    "passBubbles": 1,
    "zone2Pass": 1,
    "zone1Play": 2,
    "centerCards": 0
  },
  "lastPlay_apply": {
    "tableActs": [
      null,
      {
        "kind": "play",
        "n": 8
      },
      {
        "kind": "pass",
        "n": 0
      }
    ],
    "centerN": 8,
    "zoneN": [
      0,
      8,
      1
    ],
    "passBubbles": 1
  },
  "pure_pass_apply": {
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
    "centerN": 0,
    "zoneN": [
      0,
      2,
      1
    ],
    "passBubbles": 1
  },
  "white_guard": {
    "tableActive": true,
    "tvDisplay": "flex",
    "handN": 17
  }
}
```

## Shots
- `lobby-414-home.png` sha1=44acdc4c0586 bytes=217875
- `ddz-414-fan-fullwidth.png` sha1=0b5032f67227 bytes=547762
- `ddz-414-hand-avatar-closeup.png` sha1=04c196e34f36 bytes=41199
- `ddz-414-lastplay-pass.png` sha1=8db8ece46faa bytes=546820
- `ddz-414-pure-pass-bubble.png` sha1=b8684fb70d4e bytes=546010
