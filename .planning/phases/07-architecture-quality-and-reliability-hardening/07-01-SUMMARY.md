---
phase: 07-architecture-quality-and-reliability-hardening
plan: 01
subsystem: api
tags: [wechat-mini-program, wx-cloud, room-session, reliability, testing]
requires:
  - phase: 06-calendar-density-today-jump
    provides: Existing homepage/page imports that still depend on legacy `utils/cloud.js` exports
provides:
  - `createRoomDataClient(options)` outcome seam for room-scoped list/add/update/remove actions
  - `repairCachedRoom(expectedRoomCode)` for stale local room verification and cache repair
  - Focused `node:test` coverage for retryable failures, stale-room repair, and legacy wrapper compatibility
affects: [07-02, 07-03, utils/cloud.js, utils/room.js, room data flows]
tech-stack:
  added: []
  patterns: [CommonJS service seam, outcome classification, legacy wrapper compatibility]
key-files:
  created: [tests/room-data-client.test.js]
  modified: [utils/cloud.js, utils/room.js, tests/room-session.test.js]
key-decisions:
  - "Kept RoomDataClient additive so current pages can keep calling the legacy `utils/cloud.js` exports until later plans migrate them."
  - "Classified stale-room business failures separately from retryable transport failures and delegated repair to RoomSession."
patterns-established:
  - "RoomDataClient returns `success`, `retryable-failure`, `room-repair`, `business-failure`, and `no-room` outcomes for later page-flow helpers."
  - "RoomSession repair treats local `roomCode` as cache and revalidates it through `getMyRoom` before clearing or updating local state."
requirements-completed: [REL-01, REL-02, QUAL-02]
duration: 7 min
completed: 2026-06-26
status: complete
---

# Phase 07 Plan 01: RoomDataClient and Stale-Room Repair Summary

**Shared RoomDataClient outcome classification with stale-room cache repair, while preserving legacy `utils/cloud.js` page entry points**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-26T04:30:10Z
- **Completed:** 2026-06-26T04:38:03Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `createRoomDataClient(options)` in `utils/cloud.js` to normalize room-scoped list/add/update/remove outcomes.
- Added `repairCachedRoom(expectedRoomCode)` in `utils/room.js` so stale cached room codes can be recovered, cleared, or reported as retryable failures.
- Added focused Node coverage for RoomDataClient outcomes, RoomSession repair behavior, and legacy wrapper compatibility.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED RoomDataClient and RoomSession repair contract** - `7d75bfd` (`test`)
2. **Task 2: GREEN implement normalized client outcomes and stale repair** - `09bb3f7` (`feat`)
3. **Task 3: REFACTOR lock compatibility and phase handoff surface** - `485edb8` (`refactor`)

**Plan metadata:** Pending docs commit

## Files Created/Modified
- `tests/room-data-client.test.js` - Exercises success, no-room, retryable failure, stale-room repair, business failure, and legacy wrapper compatibility paths.
- `tests/room-session.test.js` - Extends RoomSession coverage with recovered, unbound, and retryable repair scenarios.
- `utils/cloud.js` - Adds the RoomDataClient seam and keeps existing page-facing exports compatible.
- `utils/room.js` - Adds `repairCachedRoom()` and keeps room session cache semantics plain-object based.

## Decisions Made
- Kept `createRoomDataClient()` separate from the legacy exports so later page-flow plans can migrate incrementally instead of forcing immediate page rewrites.
- Let stale-room business failures call `RoomSession.repairCachedRoom()` and return a dedicated `room-repair` outcome rather than collapsing them into generic retryable failures.
- Preserved the current legacy wrapper contract: list helpers still return arrays, mutation helpers still return `{ result }`, and retryable transport failures still throw for existing page `catch` branches.

## Verification
- `node --test tests\room-data-client.test.js tests\room-session.test.js`
- `node --check utils\cloud.js`
- `node --check utils\room.js`
- `node -e "const cloud=require('./utils/cloud'); const names=['createRoomDataClient','getPeriods','addPeriod','updatePeriod','deletePeriod','getMemories','addMemory','updateMemory','deleteMemory','getRoomCode']; for (const name of names) { if (typeof cloud[name] !== 'function') throw new Error(name + ' missing'); } console.log('legacy exports ok')"`
- `rg -n "createdBy|partnerOpenid|collection\('rooms'\)|db\.collection\('rooms'\)" utils\cloud.js utils\room.js` (no matches)

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for `07-02-PLAN.md`, which can consume `RoomDataClient` outcomes without re-parsing raw `wx.cloud.callFunction` responses.
- No blockers remain for the stale-room repair seam introduced in this plan.

## Self-Check: PASSED
- Verified `.planning/phases/07-architecture-quality-and-reliability-hardening/07-01-SUMMARY.md` exists on disk.
- Verified task commits `7d75bfd`, `09bb3f7`, and `485edb8` exist in git history.
