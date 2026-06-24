# Codebase Concerns

**Analysis Date:** 2026-06-24

## Tech Debt

**Cloud function input trust boundary is thin:**
- Issue: `utils/cloud.js` forwards `collection`, `action`, `id`, and payload data directly to `cloudfunctions/dataOp/index.js`; the server only checks membership by `roomCode` and does not validate record shape, field lengths, or date formats.
- Files: `utils/cloud.js`, `cloudfunctions/dataOp/index.js`, `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`
- Impact: malformed records can reach the database, and future fields are easy to abuse or break accidentally.
- Fix approach: add server-side schema validation per action/collection and reject unknown fields before write.

**Room binding depends on local storage as a soft auth token:**
- Issue: the active room is persisted in `wx` storage and reused across pages; `pages/bind/bind.js` clears only local state on unbind, while the server keeps the room membership intact.
- Files: `utils/cloud.js`, `pages/bind/bind.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`
- Impact: access survives on the backend until the room is deleted or replaced; shared devices can retain access longer than users expect.
- Fix approach: add an explicit server-side revoke/unpair path, and treat local storage as cache only.

## Known Bugs

**Holiday/calendar rules are hard-coded to 2026:**
- Symptoms: `tests/calendar-display.test.js` and `utils/util.js` both encode 2026 public holiday ranges and adjusted workdays, so the calendar will mark the wrong holidays once the year changes.
- Files: `utils/util.js`, `tests/calendar-display.test.js`
- Trigger: any month outside the 2026 rule set.
- Workaround: none in code; manual update is required each year.

**Day details can exceed modal-friendly length:**
- Symptoms: `pages/index/index.js` concatenates all matching period and memory entries into one `wx.showModal` content string without truncation.
- Files: `pages/index/index.js`
- Trigger: days with multiple overlapping records or verbose notes.
- Workaround: none; long content may be clipped or awkward to read.

## Security Considerations

**Authorization is room-code centric, not user-centric:**
- Risk: possession of a valid `roomCode` plus membership lookup is enough to access and mutate room data; there is no explicit record-level owner check beyond room membership.
- Files: `cloudfunctions/dataOp/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/createRoom/index.js`
- Current mitigation: `getRoomForUser()` blocks unauthenticated users and non-members.
- Recommendations: add per-record ownership metadata or a stricter invite/join flow if cross-device sharing needs tighter control.

**Clipboard/file export can leak full personal history:**
- Risk: `pages/settings/settings.js` exports all periods and memories to a JSON file and falls back to copying raw JSON to the clipboard.
- Files: `pages/settings/settings.js`
- Current mitigation: export is user-triggered and written to `wx.env.USER_DATA_PATH`.
- Recommendations: warn more explicitly before export and consider redaction or password-protected export if this data is sensitive.

## Performance Bottlenecks

**Calendar rendering recomputes expensive date metadata per month:**
- Problem: `utils/util.js` rebuilds every visible day and runs lunar/holiday lookup for each cell on every render; `pages/index/index.js` also triggers extra re-renders via delayed `setTimeout()` calls after month changes.
- Files: `utils/util.js`, `pages/index/index.js`
- Cause: heavy per-cell work on the main thread and no memoization/cache for month grids.
- Improvement path: cache month grids by `year/month` and update immediately after `setData` rather than relying on a fixed delay.

## Fragile Areas

**Date math and date-string comparisons assume zero-padded ISO strings:**
- Files: `utils/util.js`, `pages/index/index.js`, `pages/period/period.js`, `pages/period/edit/edit.js`, `pages/memory/memory.js`, `pages/memory/edit/edit.js`
- Why fragile: filters and sort logic compare strings directly, which only stays correct because all inputs are currently normalized to `YYYY-MM-DD`.
- Safe modification: keep normalization centralized in `utils/util.js` and validate any new date input before storage.
- Test coverage: current tests cover only a small subset of calendar formatting, not mutation flows or invalid dates.

**Annual holiday rules will silently drift:**
- Files: `utils/util.js`, `tests/calendar-display.test.js`
- Why fragile: the holiday table is embedded data, not a generated source of truth.
- Safe modification: isolate the rule table behind a versioned config or external source, then refresh tests with the same source.
- Test coverage: the existing test only validates 2026 examples.

## Test Coverage Gaps

**Cloud function authorization and mutation paths are untested:**
- What's not tested: `createRoom`, `joinRoom`, `getMyRoom`, and `dataOp` success/failure paths, including duplicate room join, unauthorized access, and malformed payloads.
- Files: `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`, `cloudfunctions/dataOp/index.js`
- Risk: regressions in room access control or write behavior will ship unnoticed.
- Priority: High

**UI flow tests are narrow and snapshot-like:**
- What's not tested: page transitions, binding state recovery, export behavior, and error states in `pages/bind/bind.js`, `pages/settings/settings.js`, and the edit pages.
- Files: `pages/bind/bind.js`, `pages/settings/settings.js`, `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`, `tests/calendar-display.test.js`
- Risk: user-visible failures can occur without any test signal.
- Priority: Medium

---

*Concerns audit: 2026-06-24*
