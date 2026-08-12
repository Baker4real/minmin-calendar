# 07 — Merge tests and delete protocol file

**What to build:** Merge `tests/room-access-protocol.test.js` content into `tests/room-access-outcome.test.js` under a "Stale room classification" section. Delete both `utils/roomAccessProtocol.js` and `tests/room-access-protocol.test.js`. All tests pass.

**Blocked by:** 05 — Merge roomAccessProtocol into roomAccessOutcome

**Status:** done

- [ ] Copy all tests from `tests/room-access-protocol.test.js` into `tests/room-access-outcome.test.js`
- [ ] Group protocol tests under a "Stale room classification" section comment
- [ ] Update test imports to use `roomAccessOutcome` instead of `roomAccessProtocol`
- [ ] Run merged test file to verify all tests pass
- [ ] Delete `utils/roomAccessProtocol.js`
- [ ] Delete `tests/room-access-protocol.test.js`
- [ ] Verify no other files import from `roomAccessProtocol` (grep check)
