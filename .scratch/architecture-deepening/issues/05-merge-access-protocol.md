# 05 — Merge roomAccessProtocol into roomAccessOutcome

**What to build:** Move all content from `utils/roomAccessProtocol.js` into `utils/roomAccessOutcome.js`. Constants become internal, predicates are exported alongside existing outcome builders. The merged module keeps the `roomAccessOutcome` name.

**Blocked by:** None — can start immediately

**Status:** done

- [ ] Copy `STALE_ROOM_MESSAGES` and `STALE_ROOM_ERROR_CODES` constants to top of `roomAccessOutcome.js` as internal constants (not exported)
- [ ] Copy `getErrorCode` helper function into `roomAccessOutcome.js` as internal helper
- [ ] Copy `isStaleRoomFailure` and `shouldClearCachedRoom` predicates into `roomAccessOutcome.js`
- [ ] Export `isStaleRoomFailure` and `shouldClearCachedRoom` in module.exports
- [ ] Verify `buildRoomRepairAction` is already defined in `roomAccessOutcome.js` (no changes needed)
- [ ] All predicate logic remains byte-identical to original
- [ ] Do NOT delete `roomAccessProtocol.js` yet (ticket 07 handles cleanup)
