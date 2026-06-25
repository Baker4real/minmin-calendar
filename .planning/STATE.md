# Project State: Minmin Calendar

Last activity: 2026-06-25 - Expanded calendar holidays, themed day sheets, and added month jump navigation.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-25)

**Core value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.  
**Current focus:** Phase 1 - Workflow Baseline

## Roadmap Status

| Phase | Status | Progress | Notes |
|-------|--------|----------|-------|
| 1. Workflow Baseline | In Progress | 60% | Git initialized, map created, docs being established |
| 2. Calendar Display Clarity | In Progress | 70% | Prediction range and reminder card implemented; still needs WeChat DevTools visual acceptance |
| 3. Room and Cloud Data Reliability | In Progress | 65% | Room-scoped record writes validate server-side; client RoomSession and server-side leave/unpair behavior now have tests |
| 4. Record and Settings Flow Polish | In Progress | 25% | Period edit/list now supports flow and symptom tags |
| 5. Documentation and Release Readiness | Pending | 0% | Refresh after phases complete |

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

## Research Artifacts

| Topic | Date | File |
|-------|------|------|
| Period-tracker feature candidates and prediction model | 2026-06-24 | `.planning/research/period-tracker-features-and-prediction.md` |

## Current Verification Commands

```powershell
node --test tests\calendar-display.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js
node --check cloudfunctions\leaveRoom\roomLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\room.js
node --check utils\cloud.js
node --check utils\util.js
node --check utils\cycle.js
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

## Next Recommended Action

Manually verify the bind-page unbind flow in WeChat DevTools or on a device, then add deployed cloud-function adapter coverage for create/join/recover/leave where practical.
