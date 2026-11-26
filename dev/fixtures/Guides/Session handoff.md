---
type: guide
status: current
updated: 2026-11-22
---

# Session handoff

## Now

| Project | Area | Who / session | Since | Notes |
|---|---|---|---|---|
| Project X | 2.0 release prep: whole working tree | owner@pc-a, release session | 2026-11-20 | Ask before touching `src/`. |
| Project Y | `src/sync.ts` | owner@pc-b, sync fix | 2026-11-23 | |

## Log (newest first)

| Date | Project | Session | What changed | Left for next |
|---|---|---|---|---|
| 2026-11-22 | Project Y | owner@pc-b (sync fix) | Fixed the retry loop; tests 42 pass. Commit `abc1234`. | Push on the owner's yes. |
| 2026-11-21 | Setup | owner@pc-a (first setup) | Installed Node and git. | |
