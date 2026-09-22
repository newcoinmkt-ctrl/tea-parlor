# play9fin7b — deep-link seat join

## Done
- Cold/hot start parse `startapp` → validate roomKey → join matching Colyseus room
- Full/expired/invalid: readable Chinese error via `formatInviteJoinError` (never blank)
- **Leave-other-table behavior:** if already at another table, **safely leave then join** invite table (`leaveOtherTableForInvite` → enter dual). Same dual key keeps seat.
- Guandan + DDZ dual invite join paths
- Cache `?v=play9fin7b`

## Invite URL
`https://t.me/teaparlorbot/app?startapp=t_dual_<ddz|gd>_<suffix>`
