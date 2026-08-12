# 02 — Integrate resolver into RoomDataClient

**What to build:** Modify `createRoomDataClient` in `utils/cloud.js` to accept an optional `resolver` parameter and use it for room resolution. If no resolver is provided, create a default one internally. All existing tests must pass without modification.

**Blocked by:** 01 — Extract Room Resolver module

**Status:** ready-for-agent

- [ ] Add `resolver` to `createRoomDataClient(options)` parameters
- [ ] Default resolver created as `options.resolver || createRoomResolver({ session })`
- [ ] Replace lines 101-136 in `runAction` with `await resolver.resolveActiveRoom()`
- [ ] Map resolution outcomes: `resolved` → proceed to cloud dispatch, `retryable-failure` → return retryable outcome, `no-room` → return no-room outcome
- [ ] Stale-room detection and repair logic (lines 52-59) stays in `runAction` unchanged
- [ ] All existing tests in `tests/room-data-client.test.js` pass without modification
- [ ] Existing callers (`roomRecordsSnapshot.js`, `recordCommands.js`) work unchanged
