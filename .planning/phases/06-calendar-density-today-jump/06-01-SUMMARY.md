---
phase: "06-calendar-density-today-jump"
plan: "01"
subsystem: ui
tags: [calendar, density, preference, mobile-readability, month-picker, tdd]
provides:
  - "Compact/full calendar density control"
  - "Persisted calendar density preference"
  - "Conditional lunar/holiday cell labels"
  - "Return-to-today month picker shortcut"
key-files:
  modified: [pages/index/index.js, pages/index/index.wxml, pages/index/index.wxss, tests/calendar-display.test.js, .planning/PROJECT.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md, .planning/codebase/TESTING.md]
key-decisions:
  - "Default calendar density to full so first-time users see the complete information layer."
  - "Persist the user's compact/full choice with local WeChat storage under `calendarDensity`."
  - "Use a two-option segmented control for display density because density is a mode."
  - "Place the return-to-today action inside the year-month picker so it stays attached to date navigation."
requirements-completed: [CAL-05, CAL-08, QUAL-01, QUAL-02]
duration: "same-session"
completed: 2026-06-26
status: complete
---

# Phase 6: Calendar Density and Today Jump Summary

**Homepage calendar now supports remembered compact/full density and the month picker can jump back to today's month**

## Accomplishments

- Added `CALENDAR_DENSITY_STORAGE_KEY` and `calendarDensity: 'full'` as the default homepage density.
- Added `getSavedCalendarDensity()` so a previous compact/full choice is restored when the page loads.
- Updated `setCalendarDensity()` to persist the user's selected density with `wx.setStorageSync`.
- Added a compact/full segmented control above the calendar grid.
- Changed lunar and holiday/workday cell labels to render only in full density.
- Added compact-mode cell sizing so users can reduce visual density when needed.
- Added `jumpToToday()` and a `回到今天` action inside the themed month picker.
- Extended `tests/calendar-display.test.js` with RED/GREEN source-contract coverage.

## Verification

- Targeted: `node --test tests\calendar-display.test.js` passed with 13 tests.
- Full suite: `node --test tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js` passed with 40 tests.
- Syntax: `node --check pages\index\index.js` passed.

## Notes

- Per user instruction, unresolved historical manual WeChat DevTools checks were ignored for routing this work and were not treated as blockers.
- No prediction, date-math, or cloud-data behavior changed.

## Next Phase Readiness

Good follow-up candidates are Phase 4 record/settings polish, REL-01 retry actions, or REL-02 stale room-code repair.

--- 
*Phase: 06-calendar-density-today-jump*  
*Completed: 2026-06-26*

