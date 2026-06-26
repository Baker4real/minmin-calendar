# Project State: Minmin Calendar

Last activity: 2026-06-26 - Added Phase 7 for architecture quality and reliability hardening.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-26)

**Core value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.  
**Current focus:** Phase 7 architecture quality and reliability hardening: RoomDataClient/stale repair, record/settings flow polish, calendar view-model cleanup, and final architecture review.

## Roadmap Status

| Phase | Status | Progress | Notes |
|-------|--------|----------|-------|
| 00. Existing Source Baseline | Backfilled | 100% | Initial tracked mini program source captured from `d278809` |
| 1. Workflow Baseline | Backfilled | 90% | GSD docs, codebase map, local issue docs, and CodeGraph ignore are documented |
| 2. Calendar Display Clarity | Backfilled / Human Check Needed | 85% | Prediction, holidays, themed sheets, and month jump have tests; small-phone visual check remains manual |
| 2.1. Calendar Insight and Monthly Recap | Implemented / Human Check Needed | 90% | Helper module, homepage sheets, monthly recap, tests, summary, and verification are complete; WeChat visual check remains |
| 3. Room and Cloud Data Reliability | Backfilled / Human Check Needed | 85% | RoomRecords, RoomSession, and RoomLifecycle have Node tests; deployed unbind flow remains manual |
| 4. Record and Settings Flow Polish | Partial / Gaps Found | 35% | Period metadata and local cache behavior are done; broader record/settings polish remains |
| 5. Documentation and Release Readiness | Backfilled / Human Check Needed | 80% | History ledger and phase artifacts exist; release smoke test remains manual |
| 6. Calendar Density and Today Jump | Implemented / Automated Checks Passed | 100% | Full density defaults on; compact/full choice persists locally; month picker has return-to-today |
| 7. Architecture Quality and Reliability Hardening | Added / Planning | 0% | Follow-up phase for recommended architecture deepening and remaining non-manual planned gaps |

## GSD History Artifacts

| Artifact | Purpose |
|----------|---------|
| `.planning/HISTORY.md` | Commit-to-phase ledger for the whole repository history |
| `.planning/phases/00-existing-source-baseline/` | Initial source baseline backfill |
| `.planning/phases/01-workflow-baseline/` | Workflow, planning, codebase map, and repository hygiene backfill |
| `.planning/phases/02-calendar-display-clarity/` | Calendar display clarity backfill |
| `.planning/phases/02.1-calendar-insight-monthly-recap/` | Current active Phase 2.1 plan/research/context |
| `.planning/phases/03-room-cloud-data-reliability/` | Room/cloud reliability backfill |
| `.planning/phases/04-record-settings-flow-polish/` | Partial record/settings polish backfill |
| `.planning/phases/05-documentation-release-readiness/` | Documentation/history backfill |
| `.planning/phases/06-calendar-density-today-jump/` | CAL-05 density preference and month-picker today shortcut |
| `.planning/phases/07-architecture-quality-and-reliability-hardening/` | Architecture hardening, reliability gaps, record/settings polish, and final review |

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Added cycle prediction range/confidence, in-app reminders, and period flow/symptom tags | 2026-06-24 | `5936c32` | `utils/`, `pages/index/`, `pages/period/`, `tests/` |
| 2 | Removed ignored root `hermes-*` reports from the working tree and added project README | 2026-06-24 | `7f2de92` | root |
| 3 | Deepened Room-scoped record writes with server-side validation, normalization, and tests | 2026-06-25 | `605adf3` | `cloudfunctions/dataOp/`, `tests/` |
| 4 | Added RoomSession client Module for room-code cache, recovery, create/join, and local clear flows | 2026-06-25 | `605adf3` | `utils/`, `pages/bind/`, `pages/settings/`, `tests/` |
| 5 | Added server-side Room leave/unpair flow with ownership transfer and client unbind wiring | 2026-06-25 | `605adf3` | `cloudfunctions/leaveRoom/`, `utils/`, `pages/bind/`, `tests/`, `docs/adr/` |
| 6 | Verified `leaveRoom` deployment through WeChat DevTools CLI in `cloud1-d8gyqvcez4e66b3da` | 2026-06-25 | `605adf3` | WeChat Cloud |
| 7 | Expanded calendar holidays to published 2001-2026 arrangements, replaced system day action/detail dialogs with themed sheets, and added a themed year-month jump sheet | 2026-06-25 | `56fc4d1` | `utils/`, `pages/index/`, `tests/` |
| 8 | Backfilled all repository history into GSD phase artifacts | 2026-06-26 | `4e033b0` | `.planning/HISTORY.md`, `.planning/phases/` |
| 9 | Implemented Phase 2.1 calendar insights/monthly recap with TDD and homepage wiring | 2026-06-26 | `4e033b0` | `utils/`, `pages/index/`, `tests/`, `.planning/phases/02.1-*` |
| 10 | Created GSD handoff state for Phase 2.1 continuation | 2026-06-26 | `e9f080d` | `.planning/HANDOFF.json`, `.planning/phases/02.1-*/.continue-here.md` |
| 11 | Implemented remembered calendar density control and month-picker return-to-today action | 2026-06-26 | `4adf3fc` | `pages/index/`, `tests/`, `.planning/phases/06-*` |

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: Architecture Quality and Reliability Hardening

## Research Artifacts

| Topic | Date | File |
|-------|------|------|
| Period-tracker feature candidates and prediction model | 2026-06-24 | `.planning/research/period-tracker-features-and-prediction.md` |
| High-rated calendar and period tracker patterns for explanations/recaps | 2026-06-26 | `.planning/phases/02.1-calendar-insight-monthly-recap/02.1-RESEARCH.md` |

## Current Verification Commands

```powershell
node --test tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js
node --check cloudfunctions\leaveRoom\roomLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\room.js
node --check utils\cloud.js
node --check utils\util.js
node --check utils\cycle.js
node --check utils\calendarInsights.js
node --check pages\bind\bind.js
node --check pages\settings\settings.js
node --check pages\index\index.js
node --check pages\period\period.js
node --check pages\period\edit\edit.js
```

## Blockers/Concerns

- No remote repository is configured yet; issue tracking defaults to local markdown.
- Visual verification still requires WeChat DevTools.
- Broader deployed cloud-function lifecycle tests are not yet automated; pure Node coverage now exists for `RoomRecords`, `RoomLifecycle`, and `RoomSession`.
- WeChat DevTools CLI confirms `leaveRoom` exists in `cloud1-d8gyqvcez4e66b3da` with status `Active`; end-to-end unbind behavior still needs manual runtime verification in the simulator or on a device.
- Phase 2.1 automated checks pass; manual WeChat DevTools visual verification remains before release sign-off.

## Next Recommended Action

Plan and execute Phase 7 through the full GSD flow, starting with RoomDataClient/stale room-code repair before record/settings and calendar view-model quality passes.
