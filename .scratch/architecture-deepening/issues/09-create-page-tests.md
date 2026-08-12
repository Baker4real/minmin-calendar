# 09 — Create page behavior tests

**What to build:** Create `tests/index-page.test.js` that tests the index page's home records sync behavior end-to-end. Tests verify initial load, background refresh, stale request handling, pending revision tracking, and failure handling.

**Blocked by:** 08 — Inline state machine logic into index page

**Status:** done

- [ ] Create `tests/index-page.test.js`
- [ ] Test: initial load success → `hasLoadedHomeData: true`, periods and memories populated from snapshot
- [ ] Test: background refresh with no changes → existing data preserved, no revision increments
- [ ] Test: background refresh with new records → new records added, revisions incremented
- [ ] Test: stale snapshot (older revision) rejected → page data not rolled back
- [ ] Test: pending revisions prevent snapshot rollback → saved record changes preserved during refresh
- [ ] Test: load failure → error outcome returned, existing data preserved
- [ ] Test: concurrent load requests → only latest request updates UI (stale requests ignored)
- [ ] Use fake RoomDataClient and fake snapshot responses
- [ ] Mock `wx.stopPullDownRefresh()` if needed
- [ ] All tests verify observable page behavior through `page.data`
