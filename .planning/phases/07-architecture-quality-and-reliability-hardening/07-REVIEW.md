---
phase: 07
status: issues_found
reviewed_at: 2026-06-26T18:59:02.8875599+08:00
depth: deep
files_reviewed: 37
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
files_reviewed_list:
  - pages/index/index.js
  - pages/index/index.wxml
  - pages/index/index.wxss
  - pages/period/period.js
  - pages/period/period.wxml
  - pages/memory/memory.js
  - pages/memory/memory.wxml
  - pages/settings/settings.js
  - pages/settings/settings.wxml
  - pages/bind/bind.js
  - pages/period/edit/edit.js
  - pages/memory/edit/edit.js
  - utils/cloud.js
  - utils/room.js
  - utils/recordCommands.js
  - utils/settingsFlow.js
  - utils/homeCalendarState.js
  - utils/calendarInsights.js
  - utils/util.js
  - utils/cycle.js
  - cloudfunctions/dataOp/index.js
  - cloudfunctions/dataOp/dataOpHandler.js
  - cloudfunctions/dataOp/roomRecords.js
  - cloudfunctions/leaveRoom/index.js
  - cloudfunctions/leaveRoom/roomLifecycle.js
  - tests/page-registration.test.js
  - tests/room-data-client.test.js
  - tests/record-flow.test.js
  - tests/settings-flow.test.js
  - tests/home-calendar-state.test.js
  - tests/data-op-auth.test.js
  - tests/calendar-display.test.js
  - tests/calendar-insights.test.js
  - tests/cycle-prediction.test.js
  - tests/room-lifecycle.test.js
  - tests/room-records.test.js
  - tests/room-session.test.js
---

# Phase 07: Code Review Report

**Reviewed:** 2026-06-26T18:59:02.8875599+08:00  
**Depth:** deep  
**Files Reviewed:** 37  
**Status:** issues_found

## Summary

This deep final review covered the full Phase 07 source scope plus the recent CAL-05/CAL-06 homepage density, small-screen readability, and month-jump "回到今天" changes. I also re-checked the Phase 07 plan set (`07-01-PLAN.md` through `07-07-PLAN.md`) because the requested singular `07-PLAN.md` is not present on disk.

Automated verification is green: the full requested `node --test` suite passed with 94/94 tests, and the requested `node --check` set passed for all touched utils, pages, and cloud functions. I did not find a server-side room-isolation break in `dataOp` / `roomRecords` / `leaveRoom`, and I did not find a remaining path that turns retryable record-page loads into silent "no data" states. Two client-side stale-room defects still remain, both in `RoomSession` semantics rather than in the page helpers.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: [WARNING] `bind` / `settings` still trust stale cached room codes and can show a bound state after membership is already gone

**File:** `utils/room.js:12-16`, `pages/settings/settings.js:8-11`, `pages/bind/bind.js:18-27`

**Issue:** `RoomSession.getActiveRoom()` returns `{ kind: 'success', bound: true, roomCode }` immediately when local storage already has a `roomCode`, and never calls `getMyRoom` to verify that cache. Both `pages/settings/settings.js` and `pages/bind/bind.js` use that method directly on page open, so a user who was removed from the room elsewhere can still see a valid-looking bound state indefinitely instead of being prompted to rebind.

This is reproducible with the current code: a cached `ROOM01` plus a cloud response of `未加入任何房间` still returns `success/bound=true` without making any cloud call. That leaves stale room state visible on the two pages that are supposed to represent current binding state most directly.

**Fix:**

Use an authoritative verification path when these pages open. One safe pattern is to keep `getActiveRoom()` as the cheap cache-first helper for normal data actions, but add a verified path for room-state pages:

```javascript
// utils/room.js
async function getVerifiedActiveRoom() {
  const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
  if (!cachedRoomCode) {
    return getActiveRoom()
  }
  const repair = await this.repairCachedRoom(cachedRoomCode)
  if (repair.kind === 'success' && repair.bound && repair.roomCode) return repair
  if (repair.kind === 'success' && !repair.bound) return { kind: 'no-room', bound: false, roomCode: '' }
  return { kind: 'retryable-failure', bound: false, roomCode: '', errorMsg: repair.message }
}
```

Then use the verified path from `pages/settings/settings.js` and `pages/bind/bind.js`, and add regression tests for "cached room exists but cloud says no room".

### WR-02: [WARNING] stale-room repair can erase a newer room cache because `expectedRoomCode` is ignored

**File:** `utils/cloud.js:57-59`, `utils/room.js:37-49`

**Issue:** `createRoomDataClient()` passes the failing room code into `session.repairCachedRoom(roomCode)`, but `repairCachedRoom(expectedRoomCode)` never reads `expectedRoomCode`. When cloud later reports `未加入任何房间` / `房间不存在`, it unconditionally removes the current cached room code.

That creates a real race: an old request that started under `ROOM01` can finish after the user has already rebound to `ROOM02`, and the old repair result will still clear local storage. I verified this against the current code by starting `repairCachedRoom('ROOM01')`, changing storage to `ROOM02` before the cloud call resolved, then returning `未加入任何房间`; the final cached room code became empty.

**Fix:**

Guard the clear against the room code that originally failed, and keep newer local state intact if the cache changed while the repair was in flight:

```javascript
// utils/room.js
async repairCachedRoom(expectedRoomCode) {
  const expected = normalizeRoomCode(expectedRoomCode)
  // ... call getMyRoom ...
  if (shouldClearCachedRoom(res.result, roomCode)) {
    const currentCached = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
    if (!expected || currentCached === expected) {
      storage.remove(ROOM_CODE_KEY)
      return { kind: 'success', bound: false, roomCode: '' }
    }
    return { kind: 'success', bound: true, roomCode: currentCached }
  }
}
```

Add a `tests/room-session.test.js` case that changes storage mid-flight so this race cannot regress silently.

## Verification Notes

- `node --test tests\page-registration.test.js tests\room-data-client.test.js tests\record-flow.test.js tests\settings-flow.test.js tests\home-calendar-state.test.js tests\data-op-auth.test.js tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js`
- Result: 94 passing tests, 0 failures.
- `node --check` passed for all requested touched files under `pages/`, `utils/`, and `cloudfunctions/`.

---
_Reviewed: 2026-06-26T18:59:02.8875599+08:00_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: deep_
