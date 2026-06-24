# Project State: Minmin Calendar

Last activity: 2026-06-24 - Implemented prediction range, in-app reminders, and optional period flow/symptom tags.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-24)

**Core value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.  
**Current focus:** Phase 1 - Workflow Baseline

## Roadmap Status

| Phase | Status | Progress | Notes |
|-------|--------|----------|-------|
| 1. Workflow Baseline | In Progress | 60% | Git initialized, map created, docs being established |
| 2. Calendar Display Clarity | In Progress | 70% | Prediction range and reminder card implemented; still needs WeChat DevTools visual acceptance |
| 3. Room and Cloud Data Reliability | Pending | 0% | Review stale room and cloud failure paths |
| 4. Record and Settings Flow Polish | In Progress | 25% | Period edit/list now supports flow and symptom tags |
| 5. Documentation and Release Readiness | Pending | 0% | Refresh after phases complete |

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

## Research Artifacts

| Topic | Date | File |
|-------|------|------|
| Period-tracker feature candidates and prediction model | 2026-06-24 | `.planning/research/period-tracker-features-and-prediction.md` |

## Current Verification Commands

```powershell
node --test tests\calendar-display.test.js
node --test tests\cycle-prediction.test.js
node --check utils\util.js
node --check utils\cycle.js
node --check pages\index\index.js
node --check pages\period\period.js
node --check pages\period\edit\edit.js
```

## Blockers/Concerns

- No remote repository is configured yet; issue tracking defaults to local markdown.
- Visual verification still requires WeChat DevTools.
- Cloud-function tests are not yet automated.

## Next Recommended Action

Run WeChat DevTools visual acceptance on small-phone width, then choose the next slice: partner-sharing controls, calendar legend/filtering, or exportable health summary.
