# play9fin7c — dual session + reconnect

## Done
- Two clients same `roomKey` → same Colyseus table (DDZ + Guandan dual_*)
- After invite join, disconnect+reconnect returns same table/seat (roomKey-matched reconnectionToken)
- Reconnect only resumes when stored roomKey matches target (avoids joining wrong public table)
- Automated: `apps/colyseus-tea-parlor/scripts/dual-session-smoke.mjs`
- Cache `?v=play9fin7c`

## Manual dual-session steps (optional device check)
1. Device A: open lobby → 邀请好友 (DDZ or Guandan) → copy `startapp=t_dual_…` link
2. Device B: open that t.me deep link (or paste start_param) → joins same roomKey
3. Both see match/play on same table
4. Device A: kill network / refresh → reconnects to same seat via trustee/reconnect token

## Leave-other-table
Inherited from fin7b: leave-then-join invite table (离开原桌 · 加入邀请桌).
