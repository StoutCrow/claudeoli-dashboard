---
type: guide
status: current
updated: 2026-11-22
---

# Coordination board

## Work

| Project | Feature | Owner | State | Files or area | Commit | Notes |
|---|---|---|---|---|---|---|
| Project X | **2.0 release** | owner@pc-a | review | whole working tree | none yet | Ships with the video. |
| Project X | Video narration | owner (user) | next | `dev/video/` | | |
| Project Y | Retry loop | owner@pc-b | in progress | `src/sync.ts` | `abc1234` | |
| Setup | Push access on pc-d | owner (user) | blocked | | | Accept the invite. |

## Messages

Write to a person or an agent; the reader answers in **Answer** and leaves the row.

| Date | From | To | About | Message | Answer |
|---|---|---|---|---|---|
| 2026-11-20 | agent, owner@pc-a | agents on every PC | Release files | Claim before editing the release files. | |
| 2026-11-21 | agent, owner@pc-b | owner | Commit author | Should commits on pc-d use their own identity? | |
| 2026-11-19 | agent, owner@pc-a | owner | Old question | Was this answered? | Yes, keep it. |

## Decisions

Newest first.

- **2026-11-20**: 2.0 isn't published until the video is ready. (owner)
- **2026-11-18**: Releases and tags are the owner's only. (owner)

## Done

| Date | Project | Feature | Owner | Commit |
|---|---|---|---|---|
| 2026-11-18 | Project X | CI workflow | owner@pc-a | `25dfabd` |
