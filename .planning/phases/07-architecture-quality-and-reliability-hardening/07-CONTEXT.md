# Phase 7: Architecture Quality and Reliability Hardening - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Source:** `$ask-matt` routed architecture review plus user-approved GSD auto discussion

<domain>
## Phase Boundary

This phase deepens the remaining shallow client/data/page seams identified by the architecture review. It must address non-manual planned gaps first: cloud retry actions, stale local room-code repair, record/settings flow polish, page-event testability, and a final architecture quality audit. It should not add new product capabilities beyond the existing calendar, room, record, memory, settings, and export flows.

</domain>

<decisions>
## Implementation Decisions

### Reliability client seam
- **D-01:** Build a shared client-side data operation seam around `utils/cloud.js` so list/add/update/remove operations expose consistent success, retryable failure, and room-repair states.
- **D-02:** Cloud timeout or network failures must surface an explicit retry path where the page can safely re-run the failed user action instead of only showing a toast.
- **D-03:** Stale local `roomCode` must be distinguished from generic cloud failure. The client should be able to ask RoomSession to verify/repair cached room state and route users back to bind only when repair cannot recover a valid room.

### Record and settings flow
- **D-04:** Period edit, memory edit, list loading, settings copy/export, and local-cache flows should share small testable command/flow helpers where that reduces duplicated loading/toast/navigation/error handling.
- **D-05:** Export remains JSON plus existing WeChat share/clipboard fallback; this phase should improve warning/feedback and test seams, not redesign the data format.
- **D-06:** Local-cache clear remains local-only. Any copy or feedback must keep the cloud-vs-local distinction explicit.

### Calendar architecture
- **D-07:** Keep existing calendar behavior, marker semantics, density preference, legend, prediction explanation, and monthly recap behavior intact while narrowing `pages/index/index.js` through a pure view-model seam.
- **D-08:** Marker meaning should have a single source of truth where practical, but WXML rendering may remain explicit so visual marker semantics stay readable in the page template.

### Testing and verification
- **D-09:** Use TDD for behavior changes: write failing Node tests before production code, then make them pass.
- **D-10:** Add lightweight page adapter or flow-module tests for page event behavior before considering a heavier mini program screenshot runner.
- **D-11:** Treat WeChat DevTools/manual visual checks as release-signoff evidence, not blockers for this automated hardening phase unless the code change cannot be verified any other way.

### Architecture review closeout
- **D-12:** After implementation, run a code-review/architecture-quality audit. Blocking findings must be fixed before the phase can be considered complete.
- **D-13:** Keep changes scoped to existing modules and established patterns. Do not introduce a framework, build tool, or broad UI redesign.

### the agent's Discretion
- Exact helper names and file boundaries are left to the planner/executor, provided the resulting interfaces stay small, testable, and aligned with existing CommonJS style.
- The planner may split the phase into multiple plans/waves if that improves verification and commit hygiene.

</decisions>

<specifics>
## Specific Ideas

- Recommended order from the architecture review: `RoomDataClient`/stale repair first, record/settings flow polish second, homepage calendar view model third, cloud/page harness coverage and final audit after that.
- Candidate functions mentioned during review include `buildHomeCalendarState`, `RoomDataClient`, `RecordCommand`, `ExportFlow`, `RoomAuthorizedRecords`, and a lightweight page adapter harness. Names are illustrative, not locked.
- A prior local HTML architecture report exists outside the repo at `D:\Codex\tmp\minmin-calendar-architecture-review-20260626-113613.html`; do not treat it as a repo artifact or required source file.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state and requirements
- `.planning/PROJECT.md` — Product context and core value.
- `.planning/ROADMAP.md` — Phase 7 scope, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — REL/REC/SET/TEST/QUAL requirement definitions and traceability.
- `.planning/STATE.md` — Current project status, verification commands, and concerns.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — Current module boundaries, data flow, and anti-patterns.
- `.planning/codebase/CONVENTIONS.md` — CommonJS, style, page, and UI conventions.
- `.planning/codebase/TESTING.md` — Current tests, gaps, and preferred explicit `node --test` commands.
- `.planning/codebase/STACK.md` — WeChat Mini Program and cloud-function runtime constraints.

### Prior phase artifacts
- `.planning/phases/03-room-cloud-data-reliability/03-CONTEXT.md` — Room/cloud decisions and reliability scope.
- `.planning/phases/03-room-cloud-data-reliability/03-VERIFICATION.md` — Existing reliability coverage and manual gaps.
- `.planning/phases/04-record-settings-flow-polish/04-CONTEXT.md` — Record/settings decisions and UX polish scope.
- `.planning/phases/04-record-settings-flow-polish/04-VERIFICATION.md` — Known Phase 4 gaps.
- `.planning/phases/06-calendar-density-today-jump/06-01-SUMMARY.md` — Latest calendar density/today-jump behavior that must be preserved.

### Architecture and room lifecycle decisions
- `CONTEXT.md` — Domain terms and project-level technical shape.
- `docs/adr/0001-room-leave-ownership-transfer.md` — Server-side room leave and ownership-transfer decision.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `utils/room.js` already has adapter injection and direct Node coverage in `tests/room-session.test.js`; use this style for stale repair and storage/cloud seams.
- `cloudfunctions/dataOp/roomRecords.js` and `cloudfunctions/leaveRoom/roomLifecycle.js` are deep modules with fake adapter tests; use them as models for any new cloud authorization or flow helper.
- `utils/calendarInsights.js`, `utils/cycle.js`, and `utils/util.js` are pure helper modules with good test leverage; use the same style for homepage view-model extraction.

### Established Patterns
- Plain CommonJS modules, 2-space indentation, single quotes, and `node:test`/`node:assert/strict`.
- Pages are WeChat adapters that own `Page({ data, methods })`, `wx.showToast`, `wx.showModal`, navigation, and `setData`.
- Client record access goes through `utils/cloud.js`, and shared records go through the `dataOp` cloud function with server-side room membership checks.

### Integration Points
- Client reliability: `utils/cloud.js`, `utils/room.js`, `pages/index/index.js`, `pages/period/period.js`, `pages/memory/memory.js`, `pages/settings/settings.js`, `pages/bind/bind.js`.
- Record/settings polish: `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`, `pages/period/period.js`, `pages/memory/memory.js`, `pages/settings/settings.js`.
- Calendar view-model cleanup: `pages/index/index.js`, `pages/index/index.wxml`, `utils/util.js`, `utils/cycle.js`, `utils/calendarInsights.js`, `tests/calendar-display.test.js`, `tests/calendar-insights.test.js`.
- Cloud authorization harness: `cloudfunctions/dataOp/index.js`, `cloudfunctions/dataOp/roomRecords.js`, `tests/room-records.test.js`.

</code_context>

<deferred>
## Deferred Ideas

- Full WeChat DevTools/true-device visual signoff remains a release/manual validation activity.
- Screenshot-based homepage regression is conditional on selecting a suitable mini program runner; this phase should prefer lower-cost page/flow harness tests unless a runner is already available and practical.
- New product features such as richer export formats, multi-room support, medical prediction, or social sharing are out of scope.

</deferred>

---

*Phase: 07-architecture-quality-and-reliability-hardening*
*Context gathered: 2026-06-26*
