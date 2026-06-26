# Project State: Minmin Calendar

Last activity: 2026-06-26 - Completed Phase 7 Plan 07-05 dataOp authorization harness.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-26)

**Core value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.  
**Current focus:** Phase 7 architecture quality and reliability hardening: Wave 1 shared reliability seams are complete, and Wave 2 page-flow helpers are next.

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
| 7. Architecture Quality and Reliability Hardening | In Progress | 29% | `07-01` and `07-05` complete: client reliability seams and cloud auth harness are in place; Wave 2 page-flow helpers are next |

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
| 12 | Implemented RoomDataClient outcome classification and stale cached room repair seam | 2026-06-26 | `485edb8` | `utils/`, `tests/`, `.planning/phases/07-*` |
| 13 | Added a testable dataOp authorization seam and local cloud access-control harness | 2026-06-26 | `4e1c933` | `cloudfunctions/dataOp/`, `tests/`, `.planning/phases/07-*` |

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: Architecture Quality and Reliability Hardening

### Execution Decisions

- Keep `createRoomDataClient()` additive while current pages continue using the legacy `utils/cloud.js` exports.
- Separate stale-room business failures from retryable transport failures and let `RoomSession` own cache repair.
- Keep room membership lookup and action dispatch in the server-side `createDataOpHandler()` seam while `cloudfunctions/dataOp/index.js` stays responsible for cloud runtime wiring.
- Lock the extracted `dataOp` handler boundary with a source-contract test so `wx-server-sdk` does not creep into the injectable seam.

## Research Artifacts

| Topic | Date | File |
|-------|------|------|
| Period-tracker feature candidates and prediction model | 2026-06-24 | `.planning/research/period-tracker-features-and-prediction.md` |
| High-rated calendar and period tracker patterns for explanations/recaps | 2026-06-26 | `.planning/phases/02.1-calendar-insight-monthly-recap/02.1-RESEARCH.md` |

## Current Verification Commands

```powershell
node --test tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js tests\data-op-auth.test.js
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

Execute `07-02-PLAN.md` next to start Wave 2 with period/memory record command helpers and page-flow tests now that Wave 1 is complete.
