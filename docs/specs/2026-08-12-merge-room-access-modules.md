---
type: spec
title: "Merge Room Access Failure Classification"
tags: [project-docs, spec, architecture]
status: ready-for-agent
intent: "Merge roomAccessProtocol into roomAccessOutcome to eliminate shallow split"
---

# Merge Room Access Failure Classification

**Date:** 2026-08-12  
**Status:** Ready for agent  
**Triage:** `ready-for-agent`

## Problem Statement

`roomAccessProtocol` (44 lines) and `roomAccessOutcome` (157 lines) are artificially split modules. Understanding a room access failure requires jumping between two files: Protocol classifies the failure → Outcome decides what to show → Protocol's repair logic determines the action → Outcome maps it to UI.

The deletion test confirms this is net complexity reduction: deleting `roomAccessProtocol` would push 2 predicates and 2 constant arrays into `roomAccessOutcome` or directly into `cloud.js`/`room.js` (the only real consumers). Fewer files, clearer ownership.

`roomAccessProtocol` exports 3 shallow predicates (`isStaleRoomFailure`, `shouldClearCachedRoom`, `buildRoomRepairAction`) that are conceptually part of outcome classification. The interface complexity rivals the implementation: half the file is constant arrays, the other half is trivial checks.

## Solution

Merge `roomAccessProtocol` into `roomAccessOutcome`. The merged module keeps the `roomAccessOutcome` name since its primary interface is the 5 outcome builders. Predicates become exported functions for `cloud.js` and `room.js` to import, but internally they're recognized as outcome classification helpers.

Constants (`STALE_ROOM_MESSAGES`, `STALE_ROOM_ERROR_CODES`) become internal, not exported. `buildRoomRepairAction` remains an internal helper function (it's already internal to `roomAccessOutcome`).

## User Stories

1. As a developer debugging a room access failure, I want all classification and presentation logic in one file, so that I can trace from error result to user-facing outcome without jumping between modules.

2. As a developer maintaining room access error handling, I want predicates (`isStaleRoomFailure`) and outcome builders (`buildModalRoomAccessPrompt`) co-located, so that I can see how classification decisions map to UI immediately.

3. As a developer reading `cloud.js` or `room.js`, I want to import classification functions from the same module that builds outcomes, so that the conceptual model (room access outcomes) maps to one module boundary.

4. As a developer writing tests, I want stale-room classification tests and outcome builder tests in one test file, so that I can verify the full classification → presentation flow in one place.

5. As a developer understanding the codebase, I want module boundaries to reflect genuine responsibility splits, not arbitrary separation of predicates from the functions that use them.

## Implementation Decisions

### 1. Merge Target and Module Naming

Merge `roomAccessProtocol.js` into `roomAccessOutcome.js`. Keep the `roomAccessOutcome` name unchanged.

**Rationale:**
- The module's primary interface is 5 outcome builders (`buildInlineRoomStatus`, `buildModalRoomAccessPrompt`, etc.)
- Predicates are classification helpers that support outcome building
- Renaming to `roomAccessHandler` would imply the module executes repair, but it only classifies and maps—no side effects
- Minimum change principle

### 2. Constant Arrays

Move `STALE_ROOM_MESSAGES` and `STALE_ROOM_ERROR_CODES` to the top of `roomAccessOutcome.js` as internal constants. Do not export them.

```javascript
// roomAccessOutcome.js
const STALE_ROOM_MESSAGES = [
  '无权访问该房间',
  '未加入任何房间',
  '未加入该房间',
  '房间不存在'
]

const STALE_ROOM_ERROR_CODES = [
  'ROOM_ACCESS_DENIED',
  'ROOM_NOT_FOUND',
  'NO_ACTIVE_ROOM'
]

// ... predicate functions that use these constants ...
```

**Rationale:**
- These constants are only used by predicates within the module
- External code doesn't need direct access—they verify behavior through predicates
- Current `roomAccessProtocol` exports `STALE_ROOM_ERROR_CODES`, but no external code imports it

### 3. Predicate Functions

Move `isStaleRoomFailure`, `shouldClearCachedRoom`, and the internal `getErrorCode` helper into `roomAccessOutcome.js`. Export the predicates so `cloud.js` and `room.js` can import them.

```javascript
// roomAccessOutcome.js exports
module.exports = {
  buildInlineRoomStatus,
  buildModalRoomAccessPrompt,
  buildRoomCodeDisplayState,
  buildRepairModalPrompt,
  buildSettingsRoomStatus,
  // Add predicates for cloud.js and room.js
  isStaleRoomFailure,
  shouldClearCachedRoom
}
```

**Rationale:**
- Predicates are part of the module's public API since external callers need them
- `cloud.js` calls `isStaleRoomFailure` during cloud function outcome classification
- `room.js` calls `shouldClearCachedRoom` during room lookup result processing
- Co-location with outcome builders makes the classification → presentation mapping explicit

### 4. buildRoomRepairAction Stays Internal

`buildRoomRepairAction` is already defined at line 1 of `roomAccessOutcome.js`. It remains an internal helper function, not exported.

**Rationale:**
- Only called by other functions within `roomAccessOutcome.js` (`buildInlineRoomStatus`, etc.)
- It's an internal step in outcome construction, not a public API
- Inlining it into outcome builders would make them longer and less readable
- Keeping it as an internal helper correctly decomposes responsibilities

### 5. Caller Migration

Update `cloud.js` and `room.js` to import from `roomAccessOutcome` instead of `roomAccessProtocol`.

**Before:**
```javascript
// cloud.js
const roomAccessProtocol = require('./roomAccessProtocol')
if (roomAccessProtocol.isStaleRoomFailure(result)) { ... }

// room.js
const roomAccessProtocol = require('./roomAccessProtocol')
if (roomAccessProtocol.shouldClearCachedRoom(res.result, roomCode)) { ... }
```

**After:**
```javascript
// cloud.js
const roomAccessOutcome = require('./roomAccessOutcome')
if (roomAccessOutcome.isStaleRoomFailure(result)) { ... }

// room.js
const roomAccessOutcome = require('./roomAccessOutcome')
if (roomAccessOutcome.shouldClearCachedRoom(res.result, roomCode)) { ... }
```

**Migration scope:**
- Only 2 files need updates: `cloud.js` and `room.js`
- Change is mechanical: replace require path and prefix in predicate calls
- No logic changes, only import source

### 6. File Deletion

Delete `utils/roomAccessProtocol.js` after merging its content into `roomAccessOutcome.js`.

## Testing Decisions

### What Makes a Good Test

- Test external behavior through the module's public interface (outcome builders and predicates)
- Do not test internal implementation details (e.g., whether predicates are called before or after certain transformations)
- Test that predicates correctly classify error results
- Test that outcome builders correctly map room repair outcomes to UI structures
- Verify that merged logic produces identical results to the split modules

### Modules to Test

**Merge `tests/room-access-protocol.test.js` into `tests/room-access-outcome.test.js`**

The merged test file should have clear sections:

1. **Stale room classification** (migrated from `room-access-protocol.test.js`)
   - Test `isStaleRoomFailure` recognizes structured error codes
   - Test `isStaleRoomFailure` supports legacy message matching
   - Test `shouldClearCachedRoom` centralizes getMyRoom stale-cache decisions

2. **Outcome builders** (existing tests from `room-access-outcome.test.js`)
   - Test `buildInlineRoomStatus` for no-room, room-repair, and failure cases
   - Test `buildModalRoomAccessPrompt` variations
   - Test other outcome builders

**Rationale:**
- One module → one test file
- Predicate tests and outcome builder tests are part of the same conceptual suite (room access outcome handling)
- Maintains "test at the seam" principle—the seam is the module boundary, not internal function boundaries

### Prior Art

- `tests/room-access-protocol.test.js`: 61 lines testing predicates
- `tests/room-access-outcome.test.js`: existing outcome builder tests
- Merge pattern: append protocol tests to outcome test file, grouped under a "Stale room classification" section

## Out of Scope

### Not Changing

- **Outcome builder behavior:** All outcome builders (`buildInlineRoomStatus`, etc.) keep their current signatures and return shapes
- **Predicate behavior:** `isStaleRoomFailure` and `shouldClearCachedRoom` logic remains byte-identical
- **Error constant values:** `STALE_ROOM_MESSAGES` and `STALE_ROOM_ERROR_CODES` arrays are unchanged
- **Repair execution:** Repair logic stays in `cloud.js` and `room.js`—this module only classifies and maps outcomes
- **Public API surface:** Callers of outcome builders are unaffected (only `cloud.js` and `room.js` predicate imports change)

### Not Adding

- **New predicates or builders:** Only merging existing functions, not adding classification logic
- **Repair orchestration:** The module remains pure classification and mapping—no side effects
- **New test coverage:** Tests verify identical behavior to split modules, not new scenarios

### Not Refactoring

- **roomAccessOutcome internal structure:** Beyond adding predicates and constants at the top, the file's existing organization stays the same
- **Outcome builder implementations:** No refactoring of how builders construct UI structures
- **Error message strings:** User-facing text in outcome builders is unchanged

## Further Notes

### Relation to Other Architecture Candidates

This is **Candidate 1** (Strong recommendation) from the 2026-08-12 architecture review. Independent of other candidates:

- **Candidate 4** (Separate Room Resolution): Uses `roomAccessProtocol.isStaleRoomFailure` in RoomDataClient. After this merge, import changes to `roomAccessOutcome.isStaleRoomFailure`. No conflict.
- **Candidate 2** (recordCommands): Decided not to pursue (recordCommands is correctly a shallow adapter)
- **Candidate 3** (Home records sync): Independent; operates above room access layer

### Why This Is a Genuine Simplification

**Deletion test result:** Removing `roomAccessProtocol` and merging into `roomAccessOutcome` reduces total complexity:
- **Before:** 2 files (44 + 157 lines), understanding requires cross-file jumps
- **After:** 1 file (~190 lines), classification and presentation co-located

**Locality improvement:** Reading "what happens when room access fails" now stays in one file—from error code classification through UI outcome construction.

**No hidden complexity:** The predicates are genuinely simple (check error codes against arrays). The split didn't hide complexity; it scattered it.