---
phase: 07-architecture-quality-and-reliability-hardening
plan: 04
subsystem: ui
tags: [wechat-mini-program, homepage, calendar, view-model, testing]
requires:
  - phase: 07-architecture-quality-and-reliability-hardening
    provides: 07-02 record command helper seams kept record/settings flow behavior stable before homepage extraction
  - phase: 07-architecture-quality-and-reliability-hardening
    provides: 07-03 settings flow helper established the thin page-adapter pattern reused by the homepage
provides:
  - Pure `buildHomeCalendarState` homepage view-model seam
  - Deterministic homepage state tests for fallback and prediction-capable records
  - Source-contract coverage that preserves explicit marker and density semantics during future homepage changes
affects: [07-06, 07-07, homepage calendar reliability, future UI changes]
tech-stack:
  added: []
  patterns: [CommonJS pure view-model seam, precomputed day-detail map, source-contract regression testing]
key-files:
  created: [utils/homeCalendarState.js, tests/home-calendar-state.test.js]
  modified: [pages/index/index.js, tests/calendar-display.test.js]
key-decisions:
  - "Kept `pages/index/index.js` as the WeChat adapter for loading, storage, navigation, and sheet state while moving prediction/day-grid/monthly-recap composition into `buildHomeCalendarState`."
  - "Precomputed `dayDetailsByDate` inside the pure builder so selected-day meanings and detail rows come from the same serializable state as the calendar grid."
  - "Routed homepage initial fallback fields through the same builder to reduce copy drift between empty state and loaded state."
patterns-established:
  - "Homepage-derived state is rebuilt through `applyHomeCalendarState()` and must not reintroduce direct `buildCalendarDays` or monthly-recap composition inside the page adapter."
  - "Marker semantics stay explicit in WXML while tests guard separate today, period, memory, predict, holiday, and workday meanings."
requirements-completed: [QUAL-01, QUAL-02]
duration: 3 min
completed: 2026-06-26
status: complete
---

# Phase 07 Plan 04: Homepage Calendar State Summary

**Pure homepage calendar state composition via `buildHomeCalendarState`, with explicit marker/day-detail semantics and stable density behavior preserved in source-contract tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-26T16:52:51+08:00
- **Completed:** 2026-06-26T16:56:14+08:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `utils/homeCalendarState.js` so prediction fields, reminders, monthly recap, calendar days, and selected-day detail payloads are composed in one pure module.
- Reduced `pages/index/index.js` to a thinner WeChat adapter that rebuilds derived state through `applyHomeCalendarState()` while preserving month navigation, density persistence, and sheet interactions.
- Added deterministic Node coverage for no-prediction and prediction-capable homepage states, plus tighter source contracts around explicit marker and density semantics.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED home calendar state contract** - `062d7e6` (`test`)
2. **Task 2: GREEN implement pure view-model and wire homepage** - `a3cf0d2` (`feat`)
3. **Task 3: REFACTOR view-model seam and regression coverage** - `343be4f` (`refactor`)

**Plan metadata:** Pending docs commit

## Files Created/Modified
- `utils/homeCalendarState.js` - Pure homepage state builder for prediction fields, reminders, monthly recap, calendar days, and precomputed day-detail maps.
- `tests/home-calendar-state.test.js` - Node tests covering fallback and prediction-capable home calendar view-model output.
- `pages/index/index.js` - Thin homepage adapter that delegates derived state composition to `buildHomeCalendarState` and keeps only WeChat page concerns.
- `tests/calendar-display.test.js` - Source-contract coverage for explicit marker semantics, shared-helper drift, and homepage builder delegation.

## Decisions Made
- Kept calendar legend data in `calendarInsights` and page-level `legendItems`, while moving dynamic explanation, recap, and day-detail composition into the new builder.
- Chose a serializable `dayDetailsByDate` map instead of page-local recomputation so future UI work can reuse detail payloads without calling prediction or meaning helpers again.
- Reused the builder for homepage initial fallback state to keep empty-state prediction copy aligned with loaded-state behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated a stale period-list source-contract test before RED verification**
- **Found during:** Task 1 (RED home calendar state contract)
- **Issue:** `tests/calendar-display.test.js` still expected a page-local `catch` toast in `pages/period/period.js`, but `07-02` had already moved that flow into `recordCommands.runRecordListLoad`.
- **Fix:** Replaced the stale assertion with the current shared-helper contract (`runRecordListLoad`, `retryableTitle`, and `failureTitle`) before re-running RED verification.
- **Files modified:** `tests/calendar-display.test.js`
- **Verification:** `node --test tests\home-calendar-state.test.js tests\calendar-display.test.js tests\calendar-insights.test.js` failed only on missing `../utils/homeCalendarState` after the fix.
- **Committed in:** `062d7e6` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was required to restore a valid RED baseline on the current Phase 7 codebase. No scope creep beyond keeping the planned verification command meaningful.

## Issues Encountered
- A pre-existing source-contract assertion for the period list page had drifted after `07-02`; it was updated as a blocking verification fix before continuing with the planned homepage work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for `07-06-PLAN.md`, with homepage derived state now testable without WeChat DevTools taps.
- The homepage adapter boundary is narrower and protected against regressions in marker semantics, density behavior, prediction explanation, and monthly recap output.

## Self-Check: PASSED
- Verified `.planning/phases/07-architecture-quality-and-reliability-hardening/07-04-SUMMARY.md` exists on disk.
- Verified task commits `062d7e6`, `a3cf0d2`, and `343be4f` exist in git history.

---
*Phase: 07-architecture-quality-and-reliability-hardening*
*Completed: 2026-06-26*
