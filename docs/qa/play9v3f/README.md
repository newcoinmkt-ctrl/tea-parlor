# play9v3f QA

- ok: **True**
- cache: `play9v3f` viewport `[414, 896]` `is_mobile` + `has_touch`

## Ed portrait repro
- Path: TG Mini App portrait → 人机畅玩/local-doudizhu → force play phase; select A+10 →「出牌」must be grey; scroll hand to see rightmost card; opponents show card-back stack + count
- Fail on play9v3e: play9v3e fixed 100px gutter clipped rightmost selected 10♠;「出牌」lit on illegal A♦+10♠; bare「17」without cardbacks

## Pass
- hand_first_on_screen: PASS
- hand_gutter_adaptive: PASS
- hand_no_avatar_overlap: PASS
- hand_scroll_or_fit: PASS
- hand_last_reachable: PASS
- illegal_play_disabled: PASS
- legal_single_plays: PASS
- seat_cardbacks: PASS
- lastPlay_center_visible: PASS
- pass_bubble_seat: PASS
- no_white_screen: PASS
- shots_distinct: PASS

## Root causes fixed
- Fixed 100px left gutter pushed JJ fan right and clipped last card on 414 portrait
- Play button enabled whenever selected.size>0 (illegal A+10 looked playable; online skipped local validate)
- Opponent remain-chips was bare count text with no card-back stack

## Checks
```json
{
  "hand_avatar": {
    "n": 17,
    "scrollLeft": 0,
    "scrollWidth": 400,
    "clientWidth": 338,
    "canScroll": true,
    "justify": "flex-start",
    "padL": "52px",
    "overflowX": "auto",
    "areaZ": 50,
    "firstZ": 20,
    "avZ": 18,
    "barZ": "18",
    "area": {
      "left": 62,
      "right": 400,
      "w": 338,
      "h": 96
    },
    "first": {
      "left": 114,
      "right": 162,
      "top": 788,
      "bottom": 852,
      "w": 48,
      "h": 64
    },
    "last": {
      "left": 402,
      "right": 450,
      "w": 48
    },
    "lastAtEnd": {
      "left": 340,
      "right": 388
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
    "gutterPx": 52,
    "gutterAdaptive": true,
    "lastFullyVisibleAtEnd": true,
    "lastNotClippedAtStart": true
  },
  "illegal_play": {
    "ok": true,
    "ranks": [
      16,
      12
    ],
    "allowPlay": false,
    "reason": "illegal_pattern",
    "message": "牌型不合法：请选 单/对/三带/顺子/连对/飞机/四带二/炸弹/连炸/火箭",
    "disabled": true,
    "aria": "true",
    "recommended": false
  },
  "legal_single_play": {
    "ok": true,
    "allowPlay": true,
    "reason": "ok",
    "disabled": true,
    "before": 17,
    "after": 16,
    "played": true,
    "centerN": 1
  },
  "seat_cardbacks": {
    "r1backs": 3,
    "r2backs": 3,
    "r1count": "16",
    "r2count": "17",
    "r1html": "<span class=\"remain-stack\" aria-hidden=\"true\"><i class=\"remain-back\" aria-hidden=\"true\"></i><i class=\"remain-back\" aria-hidden=\"true\"></i><i class=\"remain-back\" aria-hidden=\"true\">"
  },
  "lastPlay_dom": {
    "centerCards": 5,
    "zone1": 5,
    "zone2": 1,
    "passBubbles": 1,
    "fanHidden": false,
    "fanVisible": true,
    "passBubbleVisible": true
  },
  "white_guard": {
    "tableActive": true,
    "tvDisplay": "flex",
    "handN": 16
  }
}
```

## Shots
- `lobby-414-home.png` sha1=44acdc4c0586 bytes=217875
- `ddz-414-hand-left.png` sha1=77cab4957904 bytes=552657
- `ddz-414-hand-right.png` sha1=7b660695483e bytes=552463
- `ddz-414-illegal-play-disabled.png` sha1=98cee2061c43 bytes=559952
- `ddz-414-after-legal-play.png` sha1=d37562e766b7 bytes=541849
- `ddz-414-seat-cardbacks.png` sha1=e75b8c6a974c bytes=539705
- `ddz-414-lastplay-pass.png` sha1=0eba1094eb42 bytes=558795
