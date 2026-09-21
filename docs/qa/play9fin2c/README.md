# play9fin2c QA

## Goal
Lobby five-tab portrait polish (no overlap/clip, tappable) + full regression.
Table landscape; NO whole-page CSS rotate.

## Cache
`?v=play9fin2c`

## Root cause
Legacy home tabbar used `grid-template-columns: repeat(4, …)` while DOM has **5** tabs → 说明/我 clipped.

## Fix
- 5 equal columns + tap targets + content padding-bottom
- Hide Stars pay option
- Regression guards: DDZ / MJ / NiuNiu / no rotate / no new icons

## Run
```bash
cd apps/web-lobby && node --test tests/play9fin2c-lobby-tabs.test.js \
  tests/play9fin2a-ad-logos.test.js tests/play9fin2b-full-trustee.test.js \
  tests/niuniu-lobby.test.js tests/play9fin1c-yaku-fu.test.js \
  tests/table-orient-upright.test.js
```
