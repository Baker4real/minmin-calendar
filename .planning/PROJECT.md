# Minmin Calendar

## What This Is

Minmin Calendar is a WeChat Mini Program for a two-person shared calendar. It records period days and "happy time" memories in a shared cloud room, then presents them on a calendar with prediction, lunar date, and China public-holiday context.

The app is already a brownfield mini program. Future work should preserve the simple shared-room model while steadily improving display clarity, data reliability, and verification coverage.

## Core Value

Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.

## Requirements

### Validated

- Shared room binding exists through create/join/recover flows in `pages/bind/bind.js` and room cloud functions.
- Period records can be created, edited, deleted, listed, and shown on the homepage calendar.
- Memory records can be created, edited, deleted, listed, and shown on the homepage calendar.
- Homepage prediction display includes tested compact date plus weekday display, range, confidence, and in-app reminder states.
- Period records support optional flow level and symptom tags through edit/list/detail views.
- Calendar day metadata now includes tested lunar date and published 2001-2026 China public holiday/adjusted workday labels.
- Homepage calendar uses themed day action/detail sheets and a themed year-month jump sheet instead of native white system dialogs.
- Data access is mediated through `cloudfunctions/dataOp/index.js`, which checks room membership before list/add/update/remove operations.
- Room-scoped period and memory writes now pass through server-side record validation and normalization in `cloudfunctions/dataOp/roomRecords.js`.
- Room-code cache, recovery, create/join, and local clear behavior now go through the tested `utils/room.js` RoomSession Module.
- Server-side room leave/unpair now goes through `cloudfunctions/leaveRoom/index.js`, with `RoomLifecycle` tests covering creator transfer, partner removal, and last-member deletion.
- Basic Node tests exist for calendar display/date rules in `tests/calendar-display.test.js` and cycle prediction/metadata rules in `tests/cycle-prediction.test.js`.
- Repository history is now backfilled into formal GSD artifacts under `.planning/phases/`, indexed by `.planning/HISTORY.md`.

### Active

- [ ] Finish Phase 2.1 calendar insight/monthly recap implementation and verification.
- [ ] Polish homepage calendar density so period, memory, today, prediction, lunar, holiday, and adjusted-workday signals remain readable on small phones.
- [ ] Harden room and data flows against stale local room codes, partial failures, and unclear user feedback.
- [ ] Improve record editing and settings flows so saving, deleting, exporting, and clearing state have consistent feedback and error recovery.
- [ ] Expand tests around date calculation, prediction, cloud utility behavior, and access-control edge cases where practical.

### Out of Scope

- Medical diagnosis or health advice — the app is a calendar/recording tool, not a clinical product.
- Public social features — the current product is intentionally a private two-person room.
- Native iOS/Android apps — current delivery target is WeChat Mini Program.
- Payment, subscriptions, or ads — no monetization flow is planned.

## Context

- Stack: WeChat Mini Program JavaScript/WXML/WXSS plus WeChat Cloud Functions using `wx-server-sdk`.
- Cloud environment is initialized in `app.js` with env `cloud1-d8gyqvcez4e66b3da`.
- Main app pages are configured in `app.json`: bind, index, period, period edit, memory, memory edit, settings.
- Shared frontend data access lives in `utils/cloud.js`; Room session/cache logic lives in `utils/room.js`; date/calendar logic lives in `utils/util.js`; cycle prediction and period metadata logic lives in `utils/cycle.js`.
- Room-scoped record write rules live in `cloudfunctions/dataOp/roomRecords.js`, behind the room-authorized `dataOp` cloud-function adapter.
- Room membership revoke rules live in `cloudfunctions/leaveRoom/roomLifecycle.js`, behind the `leaveRoom` cloud-function adapter.
- The product visual direction is documented in `DESIGN.md` as Aurora Bloom: dark navy, warm rose, soft lavender, warm gold, and glass surfaces.
- Codebase map lives under `.planning/codebase/` and should be refreshed after significant structural changes.
- GSD phase history lives under `.planning/phases/`; `.planning/HISTORY.md` maps commits to phase artifacts.

## Constraints

- **Platform**: Must remain compatible with WeChat Mini Program runtime and APIs.
- **Data model**: Cloud collections are scoped by `roomCode`; access control must not move to client-only checks.
- **Privacy**: Room data is personal and sensitive; avoid logging or exporting unnecessary private content.
- **UI density**: Calendar cells are small touch targets; new indicators must not make text overlap or hide primary dates.
- **Dependencies**: Mini program package config currently avoids bundling frontend npm dependencies.
- **Verification**: Existing automated checks are Node-based unit tests and `node --check`; WeChat DevTools visual verification remains manual unless later automated.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use GSD Core as durable workflow | Future changes are intended to be systematic rather than ad hoc | - Pending |
| Track work locally first | No GitHub/GitLab remote exists yet | - Pending |
| Use single-context domain docs | This is a small single mini program, not a monorepo | - Pending |
| Keep planning docs in git | Planning state should survive sessions and explain future changes | - Pending |
| Treat calendar marker semantics as product-critical | Ambiguous markers directly reduce trust in the calendar | - Pending |
| Transfer Room creator role on server-side leave | A remaining partner should keep access without leaving an ownerless Room document | `docs/adr/0001-room-leave-ownership-transfer.md` |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Full review of all sections.
2. Core Value check: still the right priority?
3. Audit Out of Scope: reasons still valid?
4. Update Context with current state.

---
*Last updated: 2026-06-26 after GSD history backfill and Phase 2.1 setup*
