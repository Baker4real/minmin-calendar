# 10 — Delete homeRecordsSync module and tests

**What to build:** Delete `utils/homeRecordsSync.js` and `tests/home-records-sync.test.js` after verifying all page behavior tests pass. Confirm no other files import the deleted module.

**Blocked by:** 08 — Inline state machine logic into index page, 09 — Create page behavior tests

**Status:** ready-for-agent

- [ ] Run all tests in `tests/index-page.test.js` to verify page behavior is correct
- [ ] Grep codebase for `homeRecordsSync` imports to confirm only `pages/index/index.js` used it
- [ ] Delete `utils/homeRecordsSync.js`
- [ ] Delete `tests/home-records-sync.test.js`
- [ ] Remove `homeRecordsSync` require statement from `pages/index/index.js` if still present
- [ ] Run full test suite to verify no regressions
- [ ] Verify index page loads and refreshes correctly in manual testing (if feasible)
