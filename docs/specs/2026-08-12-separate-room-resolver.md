---
type: spec
title: "Separate Room Resolution from Data Client"
tags: [project-docs, spec, architecture]
status: ready-for-agent
intent: "Extract Room Resolver module to deepen RoomDataClient"
---

# Separate Room Resolution from Data Client

**Date:** 2026-08-12  
**Status:** Ready for agent  
**Triage:** `ready-for-agent`

## Problem Statement

`RoomDataClient` in `utils/cloud.js` fuses three responsibilities: room resolution (reading cached roomCode or calling `getActiveRoom`), cloud function dispatch, and outcome classification. Testing requires mocking `roomSession.getRoomCode()`, `roomSession.getActiveRoom()`, `roomSession.repairCachedRoom()`, and the cloud API surface.

Room resolution logic (lines 101-136) is reusable beyond record access—any operation needing the active roomCode could benefit from it—but it's buried inside the data client. The interface complexity rivals the implementation: understanding what happens during a record operation requires tracing through room resolution, timeout wrapping, cloud dispatch, and stale-room repair in one 191-line file.

## Solution

Extract a **Room Resolver** module that owns the single responsibility of determining the active roomCode from a room session. RoomDataClient becomes a thin adapter over cloud functions that receives an already-resolved roomCode (or uses a resolver internally). Outcome classification remains in RoomDataClient since it operates on cloud function results.

The resolver is lightweight and fast: it reads cached roomCode or calls `session.getActiveRoom()`, but does not execute repair. Stale-room detection and repair stay in RoomDataClient's `runAction` because they operate on cloud function outcomes.

## User Stories

1. As a developer testing record operations, I want to inject a simple in-memory resolver that returns a fixed roomCode, so that I don't need to mock the entire room session.

2. As a developer implementing non-record room operations (e.g., room-scoped analytics, room-scoped settings), I want to reuse room resolution logic, so that I don't duplicate roomCode lookup patterns.

3. As a developer reading `cloud.js`, I want clear separation between "how do we get a roomCode" and "how do we call dataOp with that roomCode", so that I can understand each concern independently.

4. As a developer maintaining room session logic, I want room resolution to be testable without cloud function mocks, so that I can verify cached vs. server resolution paths in isolation.

5. As a developer debugging stale-room failures, I want outcome classification and repair to stay together in RoomDataClient, so that I can trace from cloud result to repair in one place.

6. As a developer writing tests for RoomDataClient, I want the option to inject a resolver while preserving backward compatibility with the existing fake roomSession pattern, so that I can migrate tests incrementally.

7. As a maintainer of ADR-0005, I want RoomDataClient to remain the sole frontend records interface, so that the resolver is recognized as an internal dependency, not a second records access path.

## Implementation Decisions

### 1. Room Resolver Module

Create a new module (tentatively `utils/roomResolver.js`) that exports:

```javascript
function createRoomResolver(options = {}) {
  const session = options.session || roomSession
  
  return {
    async resolveActiveRoom() {
      // Extract lines 101-136 from cloud.js
      const cachedRoomCode = getNormalizedRoomCode(session)
      if (cachedRoomCode) {
        return { kind: 'resolved', roomCode: cachedRoomCode }
      }
      
      if (!session || typeof session.getActiveRoom !== 'function') {
        return { kind: 'no-room' }
      }
      
      try {
        const room = await session.getActiveRoom()
        if (room && room.bound && room.roomCode) {
          return {
            kind: 'resolved',
            roomCode: String(room.roomCode).trim().toUpperCase()
          }
        }
        if (room && (room.kind === 'retryable-failure' || room.errorMsg)) {
          return {
            kind: 'retryable-failure',
            message: room.errorMsg || '同步房间状态失败，请稍后重试'
          }
        }
      } catch (error) {
        return {
          kind: 'retryable-failure',
          message: getErrorMessage(error)
        }
      }
      
      return { kind: 'no-room' }
    }
  }
}
```

**Resolution outcomes:**
- `{ kind: 'resolved', roomCode }` — ready for cloud function dispatch
- `{ kind: 'retryable-failure', message }` — network or server failure during getActiveRoom
- `{ kind: 'no-room' }` — user is not bound to any active room

**Note:** The outcome kind changes from `'success'` (current) to `'resolved'` to clarify this is a resolution result, not a records operation result.

### 2. RoomDataClient Integration

Modify `createRoomDataClient` in `utils/cloud.js`:

```javascript
function createRoomDataClient(options = {}) {
  const cloud = options.cloud || createWxCloud()
  const session = options.roomSession || roomSession
  const resolver = options.resolver || createRoomResolver({ session })
  const timeoutMs = options.timeoutMs || QUERY_TIMEOUT
  
  async function runAction(action, collection, data, id) {
    const resolution = await resolver.resolveActiveRoom()
    
    if (resolution.kind === 'retryable-failure') {
      return buildRetryableFailure({
        action,
        message: resolution.message,
        retry: () => runAction(action, collection, data, id)
      })
    }
    
    if (resolution.kind !== 'resolved') {
      return { kind: 'no-room' }
    }
    
    const roomCode = resolution.roomCode
    
    // Cloud function dispatch (lines 40-66 remain unchanged)
    try {
      const res = await withTimeout(
        cloud.callFunction({
          name: 'dataOp',
          data: { action, collection, data, id, roomCode }
        }),
        timeoutMs
      )
      const result = res.result || {}
      if (result.code === 0) {
        return buildSuccessOutcome(action, result)
      }
      
      // Stale-room detection and repair stay here
      if (roomAccessProtocol.isStaleRoomFailure(result)) {
        const repair = await session.repairCachedRoom(roomCode)
        return { kind: 'room-repair', roomCode, repair }
      }
      
      return {
        kind: 'business-failure',
        message: result.msg || '操作失败'
      }
    } catch (error) {
      return buildRetryableFailure({
        action,
        message: getErrorMessage(error),
        retry: () => runAction(action, collection, data, id)
      })
    }
  }
  
  return {
    list(collection) { return runAction('list', collection, {}, '') },
    add(collection, data) { return runAction('add', collection, data, '') },
    update(collection, id, data) { return runAction('update', collection, data, id) },
    remove(collection, id) { return runAction('remove', collection, {}, id) }
  }
}
```

**Backward compatibility:**
- Production code: omit `resolver` option, default resolver is created internally
- Existing tests: continue using `createFakeRoomSession`, no changes required
- New tests: can inject `createInMemoryRoomResolver({ kind: 'resolved', roomCode: 'ABC123' })` for simpler setup

### 3. In-Memory Resolver for Tests

Export a test helper (in `utils/roomResolver.js` or inline in test files):

```javascript
function createInMemoryRoomResolver(config) {
  return {
    async resolveActiveRoom() {
      if (config.kind === 'resolved') {
        return { kind: 'resolved', roomCode: config.roomCode }
      }
      if (config.kind === 'no-room') {
        return { kind: 'no-room' }
      }
      if (config.kind === 'retryable-failure') {
        return { kind: 'retryable-failure', message: config.message }
      }
      throw new Error('Invalid in-memory resolver config')
    }
  }
}
```

**Usage in tests:**
```javascript
const resolver = createInMemoryRoomResolver({ kind: 'resolved', roomCode: 'TEST01' })
const client = createRoomDataClient({ cloud: mockCloud, resolver })
```

### 4. Outcome Classification Remains in RoomDataClient

`roomAccessProtocol.isStaleRoomFailure()` and repair execution stay in `cloud.js` within `runAction`. This is correct because:
- Stale-room detection operates on cloud function results, not room resolution
- Repair (`session.repairCachedRoom()`) is triggered by a stale result, not by resolution failure
- If future refactoring merges `roomAccessProtocol` + `roomAccessOutcome` (Candidate 1 from architecture review), the merged module will still be imported by RoomDataClient

### 5. Existing Callers Zero Migration

All consumers of RoomDataClient (e.g., `roomRecordsSnapshot.js`, `recordCommands.js`) pass through `createRoomDataClient` or receive an already-created client. Internal refactoring does not change the client interface:

```javascript
// Existing code unchanged
const client = requireRoomDataClient(options.client)
const outcome = await client.list('periods')
```

ADR-0005 constraint satisfied: RoomDataClient remains the sole records frontend interface; resolver is its internal dependency.

## Testing Decisions

### What Makes a Good Test

- Test external behavior through the `createRoomDataClient({ cloud, roomSession, resolver })` interface
- Do not test internal implementation details (e.g., whether resolver is called before or after timeout wrapping)
- Test that room resolution failures propagate as the correct outcome kinds (`retryable-failure`, `no-room`)
- Test that stale-room detection and repair still work after resolver extraction
- Verify that injecting an in-memory resolver produces identical outcomes to using a fake roomSession

### Modules to Test

1. **Room Resolver** (`tests/room-resolver.test.js` — new file)
   - Test cached roomCode resolution (no session call)
   - Test fallback to `session.getActiveRoom()` when cache is empty
   - Test `retryable-failure` when `getActiveRoom` throws or returns failure
   - Test `no-room` when `getActiveRoom` returns unbound state
   - **Do not test:** repair logic (that belongs to RoomDataClient tests)

2. **RoomDataClient** (`tests/room-data-client.test.js` — existing file, minimal changes)
   - All existing tests continue to pass with fake roomSession
   - Optionally add 2-3 tests using in-memory resolver to verify identical behavior
   - Verify stale-room repair tests still pass (lines 251-289 of current test file)
   - Verify that resolution failures (no-room, retryable-failure) are classified correctly before cloud dispatch

### Prior Art

- `tests/room-data-client.test.js` lines 7-30: testing RoomDataClient with fake dependencies
- `tests/room-data-client.test.js` lines 396-417: `createFakeRoomSession` pattern for dependency injection
- `tests/room-records-snapshot.test.js`: testing higher-level modules that consume RoomDataClient without caring about its internals

## Out of Scope

### Not Changing

- **Stale-room repair execution:** Repair remains a side effect in RoomDataClient's `runAction`, triggered by cloud function outcomes
- **roomAccessProtocol module:** Not merging or refactoring it as part of this change (that's Candidate 1 from the architecture review)
- **roomAccessOutcome module:** Not touched by this refactoring
- **Room session interface:** Not changing `roomSession.getRoomCode()`, `getActiveRoom()`, or `repairCachedRoom()`
- **Outcome shapes:** All outcome kinds (`success`, `retryable-failure`, `business-failure`, `room-repair`, `no-room`) remain unchanged for RoomDataClient callers

### Not Adding

- **Pre-verification resolver:** Not implementing `session.getVerifiedActiveRoom()` in the resolver; verification stays lightweight (cached roomCode or fresh `getActiveRoom` call)
- **Resolver caching:** Not adding a second cache layer in the resolver; it delegates to the existing `roomSession.getRoomCode()` cache
- **Resolver retry logic:** Resolution failures return `retryable-failure`; the caller (RoomDataClient) decides whether/how to retry
- **New ADRs:** This change aligns with existing ADR-0005 (RoomDataClient as sole interface); no new architectural decisions need recording

### Not Migrating

- **Existing tests:** `tests/room-data-client.test.js` does not require mass migration to in-memory resolver; fake roomSession continues to work
- **CONTEXT.md updates:** The domain language and technical shape already describe RoomDataClient; resolver is an internal refactoring that doesn't change the conceptual model

## Further Notes

### Relation to Other Architecture Candidates

This is **Candidate 4** (Strong recommendation) from the 2026-08-12 architecture review. If other candidates are implemented:

- **Candidate 1** (Merge roomAccessProtocol + roomAccessOutcome): Does not conflict; merged module would still be imported by RoomDataClient
- **Candidate 2** (Extract pure logic from recordCommands): Independent; recordCommands consumes RoomDataClient, not the resolver
- **Candidate 3** (Deepen home records sync coordination): Independent; homeRecordsSync operates above RoomDataClient

### Why This Deepens the Module

**Before:** RoomDataClient interface complexity ≈ implementation complexity (191 lines mixing three concerns)

**After:**
- **Room Resolver:** Simple interface (`resolveActiveRoom() → outcome`), one concern (roomCode lookup)
- **RoomDataClient:** Interface unchanged for callers, but internal implementation is thinner (delegates resolution, focuses on cloud dispatch and outcome classification)

**Leverage:** Resolver is reusable for any room operation needing active roomCode (future: room-scoped analytics, room-scoped export timestamps, room-scoped settings sync)

**Two adapters justify the seam:**
1. Production: resolver that reads wx storage + calls cloud `getMyRoom`
2. Tests: in-memory resolver that returns fixed outcomes

**Testability:** Resolver logic is testable without cloud mocks; RoomDataClient logic is testable with resolver injection
