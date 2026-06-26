# GSD History Ledger: Minmin Calendar

**Backfilled:** 2026-06-26  
**Purpose:** Map the repository's real git history into durable GSD phase artifacts.

This ledger is a migration index. It does not replace the phase artifacts under `.planning/phases/`; it explains how historical commits map to those artifacts.

## Commit Timeline

| Commit | Date | Subject | GSD Mapping |
|--------|------|---------|-------------|
| `d278809` | 2026-06-24 | `chore: initialize mini program source tracking` | Phase 00 existing source baseline |
| `17fcfc0` | 2026-06-24 | `docs: map existing codebase` | Phase 01 workflow baseline |
| `59eb049` | 2026-06-24 | `docs: initialize GSD project workflow` | Phase 01 workflow baseline |
| `80cfae2` | 2026-06-24 | `docs: research period tracker roadmap ideas` | Phase 01 workflow baseline / research input |
| `5936c32` | 2026-06-24 | `feat: add cycle prediction reminders and period tags` | Phase 02 calendar clarity and Phase 04 record polish |
| `2f042b9` | 2026-06-24 | `docs: sync project knowledge after cycle updates` | Phase 05 documentation readiness |
| `7f2de92` | 2026-06-24 | `chore: clean repository hygiene` | Phase 01 workflow baseline |
| `56fc4d1` | 2026-06-25 | `feat: polish calendar holidays and month navigation` | Phase 02 calendar clarity |
| `605adf3` | 2026-06-25 | `feat: harden room lifecycle and records` | Phase 03 room/cloud reliability and Phase 04 settings polish |
| `eb68b6b` | 2026-06-25 | `docs: update project workflow and codebase map` | Phase 05 documentation readiness |
| `6dd2dc8` | 2026-06-25 | `docs: sync project knowledge after cleanup` | Phase 05 documentation readiness |
| `808aa30` | 2026-06-26 | `chore: ignore codegraph state` | Phase 01 workflow baseline |
| `4e033b0` | 2026-06-26 | `feat: add calendar insights and GSD history backfill` | Phase 02.1 calendar insight/monthly recap and Phase 05 documentation readiness |

## Phase Artifact Map

| Phase | Directory | Historical Status |
|-------|-----------|-------------------|
| 00. Existing Source Baseline | `.planning/phases/00-existing-source-baseline/` | Backfilled from initial source-tracking commit |
| 01. Workflow Baseline | `.planning/phases/01-workflow-baseline/` | Backfilled from GSD setup, codebase map, hygiene, CodeGraph ignore |
| 02. Calendar Display Clarity | `.planning/phases/02-calendar-display-clarity/` | Backfilled from prediction, holiday, day-sheet, and month-jump work |
| 02.1. Calendar Insight and Monthly Recap | `.planning/phases/02.1-calendar-insight-monthly-recap/` | Planned and currently executing |
| 03. Room and Cloud Data Reliability | `.planning/phases/03-room-cloud-data-reliability/` | Backfilled from room lifecycle and record hardening work |
| 04. Record and Settings Flow Polish | `.planning/phases/04-record-settings-flow-polish/` | Backfilled as partial phase from period tag and cache/unbind work |
| 05. Documentation and Release Readiness | `.planning/phases/05-documentation-release-readiness/` | Backfilled from project/codebase documentation sync commits |

## Evidence Rules Used

- Git commit subjects and file lists are treated as historical evidence.
- Existing Node tests and `node --check` commands are treated as automated verification when they run in the current worktree.
- Manual WeChat DevTools checks are not assumed unless a planning document or commit explicitly records them.
- Historical phase verification can be `human_needed` when automated checks pass but runtime UI/cloud behavior still requires manual confirmation.

## Current Working State

The backfilled history and Phase 2.1 implementation were committed in `4e033b0`.

Automated verification passed on 2026-06-26. Manual WeChat DevTools visual verification remains before release sign-off. The remaining CAL-05 density toggle is tracked as a future v2 calendar requirement, not as completed Phase 2.1 work.
