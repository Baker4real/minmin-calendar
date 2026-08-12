# 06 — Update cloud.js and room.js imports

**What to build:** Change `utils/cloud.js` and `utils/room.js` to import predicates from `roomAccessOutcome` instead of `roomAccessProtocol`. All behavior remains identical, only the import source changes.

**Blocked by:** 05 — Merge roomAccessProtocol into roomAccessOutcome

**Status:** ready-for-agent

- [ ] In `utils/cloud.js`: change `require('./roomAccessProtocol')` to `require('./roomAccessOutcome')`
- [ ] In `utils/cloud.js`: change `roomAccessProtocol.isStaleRoomFailure(result)` to `roomAccessOutcome.isStaleRoomFailure(result)`
- [ ] In `utils/room.js`: change `require('./roomAccessProtocol')` to `require('./roomAccessOutcome')`
- [ ] In `utils/room.js`: change `roomAccessProtocol.shouldClearCachedRoom(...)` to `roomAccessOutcome.shouldClearCachedRoom(...)`
- [ ] Run existing tests to verify no behavior changes
- [ ] Verify stale-room repair and cache clearing logic still works correctly
