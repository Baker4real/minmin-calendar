# Phase 2: Calendar Display Clarity - Context

**Gathered:** 2026-06-26  
**Status:** Historical backfill

<domain>
## Phase Boundary

Make the homepage calendar readable and semantically unambiguous on mobile. Historical work includes prediction range/confidence, reminder cards, period metadata display, lunar/public-holiday metadata, themed day sheets, and month-jump navigation.
</domain>

<decisions>
## Implementation Decisions

### Prediction display
- **D-01:** Show next prediction as compact month/day plus weekday.
- **D-02:** Show prediction range and confidence instead of a single overconfident date.
- **D-03:** Build in-app reminder states for due/upcoming/overdue prediction windows.

### Calendar metadata
- **D-04:** Add lunar date and published China holiday/adjusted-workday metadata in calendar cells.
- **D-05:** Keep holiday/workday tags visually distinct from period, memory, today, and prediction markers.

### Calendar interactions
- **D-06:** Replace native system dialogs with themed in-page day action/detail sheets.
- **D-07:** Add month-title year/month jump navigation without leaving the calendar.

### the agent's Discretion
- Exact spacing and visual polish within the Aurora Bloom design.
</decisions>

<specifics>
## Specific Ideas

The phase maps to commits `5936c32` and `56fc4d1`, plus follow-up doc syncs.
</specifics>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md` - core value and constraints.
- `.planning/REQUIREMENTS.md` - CAL-01, CAL-02, CAL-03, CAL-04, CAL-07, CAL-08.
- `.planning/research/period-tracker-features-and-prediction.md` - earlier product research.
- `DESIGN.md` - Aurora Bloom visual direction.
- `pages/index/index.*` - homepage calendar implementation.
- `utils/cycle.js` - prediction/reminder helpers.
- `utils/util.js` and `utils/chinaHolidays.js` - date, lunar, holiday, and grid logic.
- `tests/calendar-display.test.js` and `tests/cycle-prediction.test.js` - automated coverage.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cycle.predictNextPeriod` returns prediction range/confidence metadata.
- `cycle.buildCycleReminders` returns due/upcoming/overdue reminder cards.
- `util.buildCalendarDays` composes period, memory, prediction, lunar, holiday, and workday flags.

### Integration Points
- Homepage state in `pages/index/index.js` drives WXML marker rendering and sheets.
- `utils/chinaHolidays.js` supplies published 2001-2026 holiday arrangements.
</code_context>

<deferred>
## Deferred Ideas

- Calendar density toggle (CAL-05).
- Screenshot-based layout regression checks.
- Phase 2.1 legend/prediction explanation/monthly recap.
</deferred>

---
*Phase: 02-calendar-display-clarity*
*Context backfilled: 2026-06-26*
