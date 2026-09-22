# play9fin7a — unify invite export

## Done
- Unified「邀请好友」on DDZ in-play / settle / room-select
- Unified「邀请好友」on Guandan in-play / settle / room-select
- Payload: `roomKey` + `gameId` via `buildInvitePayload`
- TG: `startapp=t_<roomKey>`; non-TG: copyable link / roomKey text
- Cache `?v=play9fin7a`

## Invite URL format
`https://t.me/teaparlorbot/app?startapp=t_dual_<game>_<suffix>`
- DDZ: `dual_ddz_…`
- Guandan: `dual_gd_…`
