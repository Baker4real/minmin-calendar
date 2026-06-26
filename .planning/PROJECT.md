# Minmin Calendar

## What This Is

Minmin Calendar is a WeChat Mini Program for a two-person shared calendar. It records period days and "happy time" memories in a shared cloud room, then presents them on a calendar with prediction, lunar date, and China public-holiday context.

The app is already a brownfield mini program. Future work should preserve the simple shared-room model while steadily improving display clarity, data reliability, and verification coverage through small tested client, page, and cloud seams instead of larger rewrites.

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
- Homepage calendar insight surfaces now explain marker meanings, prediction inputs, tapped-day reasons, and copyable monthly recap text.
- Homepage calendar density can switch between full and compact modes, defaults to full, remembers the user's choice locally, and the year-month picker can return to today's month.
- Data access is mediated through `cloudfunctions/dataOp/index.js`, which checks room membership before list/add/update/remove operations.
- Room-scoped client reads and writes now have a tested `utils/cloud.js#createRoomDataClient()` seam that recovers active rooms, distinguishes retryable failures, and routes stale-room repair through RoomSession.
- Period and memory save/delete/list flows now share tested feedback and retry/rebind behavior through `utils/recordCommands.js`.
- Settings copy/export/local-clear flows now share tested copy, export, retry/rebind, and local-only clear behavior through `utils/settingsFlow.js`.
- Homepage derived state now goes through the pure `utils/homeCalendarState.js` seam, which keeps prediction, reminders, calendar cells, day meanings, and monthly recap composition aligned.
- The `dataOp` cloud function now delegates room authorization and action dispatch to `cloudfunctions/dataOp/dataOpHandler.js`, with a local access-control harness protecting the boundary.
- Room-scoped period and memory writes now pass through server-side record validation and normalization in `cloudfunctions/dataOp/roomRecords.js`.
- Room-code cache, recovery, create/join, and local clear behavior now go through the tested `utils/room.js` RoomSession Module.
- Server-side room leave/unpair now goes through `cloudfunctions/leaveRoom/index.js`, with `RoomLifecycle` tests covering creator transfer, partner removal, and last-member deletion.
- Phase 07 final audit passed after fixing a real DevTools blocker: record/settings pages now recover active room state before load and surface retry/rebind actions through shared helpers.
- Broad automated verification now includes 81 passing `node:test` cases plus `node --check` on touched utils, pages, and cloud functions.
- Repository history is now backfilled into formal GSD artifacts under `.planning/phases/`, indexed by `.planning/HISTORY.md`.
- GSD handoff state exists in `.planning/HANDOFF.json` and `.planning/phases/02.1-calendar-insight-monthly-recap/.continue-here.md`.

### Active

- [ ] Run manual WeChat DevTools visual verification for Phase 2.1 insight sheets and monthly recap.
- [ ] Re-run the WeChat DevTools page-open check for `pages/period/period`, `pages/memory/memory`, and `pages/settings/settings` on the fixed Phase 07 build.
- [ ] Expand tests around `pages/bind/bind.js`, deployed cloud adapters, and future screenshot/device-level regression coverage where practical.

### Out of Scope

- Medical diagnosis or health advice — the app is a calendar/recording tool, not a clinical product.
- Public social features — the current product is intentionally a private two-person room.
- Native iOS/Android apps — current delivery target is WeChat Mini Program.
- Payment, subscriptions, or ads — no monetization flow is planned.

## Context

- Stack: WeChat Mini Program JavaScript/WXML/WXSS plus WeChat Cloud Functions using `wx-server-sdk`.
- Cloud environment is initialized in `app.js` with env `cloud1-d8gyqvcez4e66b3da`.
- Main app pages are configured in `app.json`: bind, index, period, period edit, memory, memory edit, settings.
- Shared frontend data access lives in `utils/cloud.js`, including the additive `createRoomDataClient()` seam; Room session/cache logic lives in `utils/room.js`; shared record/settings feedback lives in `utils/recordCommands.js` and `utils/settingsFlow.js`; homepage state composition lives in `utils/homeCalendarState.js`; date/calendar logic lives in `utils/util.js`; cycle prediction and period metadata logic lives in `utils/cycle.js`; marker explanation and monthly recap logic lives in `utils/calendarInsights.js`.
- Room-scoped record write rules live in `cloudfunctions/dataOp/roomRecords.js`, behind the room-authorized `dataOp` cloud-function adapter and the injectable `cloudfunctions/dataOp/dataOpHandler.js` authorization seam.
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
| Use GSD Core as durable workflow | Future changes are intended to be systematic rather than ad hoc | `.planning/` project state and phase artifacts |
| Track work locally first | No GitHub/GitLab remote exists yet | `.scratch/` local issue convention |
| Use single-context domain docs | This is a small single mini program, not a monorepo | `CONTEXT.md` plus `docs/adr/` |
| Keep planning docs in git | Planning state should survive sessions and explain future changes | `.planning/HISTORY.md`, `.planning/phases/`, `.planning/HANDOFF.json` |
| Treat calendar marker semantics as product-critical | Ambiguous markers directly reduce trust in the calendar | `utils/calendarInsights.js` and calendar source-contract tests |
| Transfer Room creator role on server-side leave | A remaining partner should keep access without leaving an ownerless Room document | `docs/adr/0001-room-leave-ownership-transfer.md` |
| Keep retry/rebind UX inside shared helpers | Record and settings pages mostly await helper outcomes, so recovery actions should not depend on repeated page-local branching | `utils/recordCommands.js`, `utils/settingsFlow.js` |
| Keep homepage derived state pure and serializable | Future UI work needs one source of truth for prediction, day detail, and recap composition without re-running page-local logic | `utils/homeCalendarState.js` |
| Keep room authorization behind an injectable server seam | Access-control tests should not depend on `wx-server-sdk` runtime wiring | `cloudfunctions/dataOp/dataOpHandler.js`, `tests/data-op-auth.test.js` |

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
*Last updated: 2026-06-26 after Phase 7 architecture hardening audit and durable-doc closeout*  
