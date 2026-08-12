# 08 — Inline state machine logic into index page

**What to build:** Move all state machine logic from `utils/homeRecordsSync.js` into `pages/index/index.js` as private page methods. State transitions become direct `setData()` calls instead of returning decision objects. The page manages `_syncState` internally.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Replace `_homeRecordsSyncState` with `_syncState` containing `{ revisions, pendingRevisions, nextRequestId, activeRequest }`
- [ ] Add `_startLoad(background)` method that increments requestId, sets loading/refreshing state, returns requestId
- [ ] Add `_resolveLoad(requestId, snapshot, background)` method that applies snapshot data for unchanged collections, clears confirmed pending revisions, updates UI
- [ ] Add `_failLoad(requestId, outcome, background)` method that clears loading states
- [ ] Add `_applyRecordChange(collection, record, mode)` method that increments revisions, tracks pending revisions, updates data
- [ ] Add helper methods: `_hasPendingRevisions()`, `_mergeRecordChange()`, `_stableRecordListKey()`, `_applySnapshotCollection()`, `_normalizeRecords()`
- [ ] Update `loadData()` to use `_startLoad`, `_resolveLoad`, `_failLoad` directly
- [ ] Verify stale request handling works (checks `request.id !== requestId`)
- [ ] Verify pending revision tracking prevents snapshot rollback of saved records
- [ ] Do NOT delete `utils/homeRecordsSync.js` yet (ticket 10 handles cleanup)
