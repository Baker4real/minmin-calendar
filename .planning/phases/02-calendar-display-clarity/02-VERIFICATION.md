---
phase: "02-calendar-display-clarity"
verified: 2026-06-26T00:00:00+08:00
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 1
behavior_unverified_items:
  - truth: "Small-phone calendar layout remains readable in WeChat DevTools"
    test: "Open homepage in WeChat DevTools at small-phone width and inspect date, lunar, holiday, marker, and sheet layout."
    expected: "No overlapping text or incoherent marker collisions."
    why_human: "Current tests are Node/source-contract tests, not mini program screenshots."
---

# Phase 2: Calendar Display Clarity Verification Report

**Phase Goal:** Make the homepage calendar readable and semantically unambiguous on mobile  
**Verified:** 2026-06-26  
**Status:** human_needed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Prediction display includes date, weekday, range, confidence, and reminders | VERIFIED | `tests/calendar-display.test.js` and `tests/cycle-prediction.test.js` cover prediction display/reminders |
| 2 | Calendar cells include lunar and holiday/workday metadata | VERIFIED | `tests/calendar-display.test.js` covers lunar/holiday metadata |
| 3 | Day action/detail and month jump use themed sheets | VERIFIED | Source contract tests cover themed sheet markup |
| 4 | Marker semantics remain separate in source | VERIFIED | Tests check memory heart semantics and prediction range marking |
| 5 | Small-phone layout is visually readable | PRESENT_BEHAVIOR_UNVERIFIED | Requires WeChat DevTools manual visual verification |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `utils/cycle.js` | Prediction helpers | EXISTS + SUBSTANTIVE | Exports prediction/reminder/tag helpers |
| `utils/chinaHolidays.js` | Holiday data | EXISTS + SUBSTANTIVE | Published 2001-2026 arrangements |
| `pages/index/index.js` | Homepage behavior | EXISTS + SUBSTANTIVE | Prediction, reminders, day sheets, month jump |
| `tests/calendar-display.test.js` | Display contracts | EXISTS + SUBSTANTIVE | Calendar UI contracts |
| `tests/cycle-prediction.test.js` | Prediction tests | EXISTS + SUBSTANTIVE | Cycle algorithm tests |

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CAL-01 | PARTIAL | Marker semantics are present; Phase 2.1 adds explicit legend |
| CAL-02 | SATISFIED | Lunar/holiday/workday metadata tested |
| CAL-03 | SATISFIED | Compact prediction date with weekday tested |
| CAL-04 | PARTIAL | Detail sheet exists; Phase 2.1 adds marker explanations |
| CAL-07 | SATISFIED | Range/confidence/reminders tested |
| CAL-08 | SATISFIED | Month jump source contracts tested |

## Human Verification Required

### 1. Small-phone homepage visual check
**Test:** Inspect the homepage calendar and sheets in WeChat DevTools at small-phone width.  
**Expected:** Text fits and markers remain distinguishable.  
**Why human:** No screenshot-based mini program test runner is configured.

## Gaps Summary

No blocking automated gaps found. Human visual verification is still needed for release sign-off.

## Verification Metadata

**Verification approach:** Existing Node/source tests plus artifact inspection  
**Automated checks:** `tests/calendar-display.test.js`, `tests/cycle-prediction.test.js`  
**Human checks required:** 1

---
*Verified: 2026-06-26*
