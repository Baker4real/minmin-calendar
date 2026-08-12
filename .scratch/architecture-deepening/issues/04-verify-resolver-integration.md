# 04 — Verify end-to-end with in-memory resolver

**What to build:** Add 2-3 tests to `tests/room-data-client.test.js` that use `createInMemoryRoomResolver` to verify RoomDataClient behaves identically whether injected with an in-memory resolver or using the existing fake roomSession pattern.

**Blocked by:** 02 — Integrate resolver into RoomDataClient, 03 — Add resolver unit tests

**Status:** done

- [ ] Add test: in-memory resolver with fixed roomCode → record list operation succeeds
- [ ] Add test: in-memory resolver returning `no-room` → client returns no-room outcome
- [ ] Add test: in-memory resolver returning `retryable-failure` → client returns retryable-failure outcome
- [ ] Verify stale-room repair tests (lines 251-289) still pass with default resolver
- [ ] All new tests produce identical outcomes to equivalent fake roomSession tests
- [ ] Existing tests remain unchanged and passing
