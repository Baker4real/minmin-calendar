# Roadmap: Minmin Calendar

**Created:** 2026-06-24  
**Mode:** Vertical MVP slices  
**Core Value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.

## Phases

### Phase 1: Workflow Baseline

**Goal:** Make future changes traceable, testable, and recoverable across sessions.  
**Mode:** mvp

**Requirements:** FLOW-01, FLOW-02, FLOW-03, QUAL-01, QUAL-02, QUAL-04

**Success Criteria:**

1. Git is initialized with source, tests, planning docs, and a practical `.gitignore`.
2. Local markdown issue tracker and domain-doc conventions are documented.
3. Verification commands are documented and run successfully at least once.
4. Existing calendar display and cycle prediction behavior tests pass.

### Phase 2: Calendar Display Clarity

**Goal:** Make the homepage calendar readable and semantically unambiguous on mobile.  
**Mode:** mvp

**Requirements:** CAL-01, CAL-02, CAL-03, CAL-04, CAL-07, CAL-08

**Success Criteria:**

1. Calendar markers visually distinguish period, memory, today, prediction, holiday, and adjusted-workday states.
2. "Prediction next" display stays compact and includes weekday.
3. Lunar and holiday labels do not overlap primary dates on small-phone layouts.
4. Day detail sheet remains accurate for period and memory records.
5. Prediction range, confidence, and reminder states are visible without implying medical certainty.
6. Month title navigation supports quick year/month jumping without leaving the calendar.

### Phase 2.1: Calendar Insight and Monthly Recap

**Goal:** Make calendar markers, prediction math, and month-level memories understandable without leaving the homepage.
**Mode:** mvp

**Requirements:** CAL-06, CAL-09, CAL-10, QUAL-01, QUAL-02, QUAL-03

**Success Criteria:**

1. User can open a homepage legend that explains today, period, memory, prediction, holiday, and adjusted-workday markers.
2. User can open a plain-language prediction explanation with estimated date, range, average cycle, average duration, confidence, and ignored outlier count.
3. Day detail explains why a selected day has visible markers before listing records.
4. User can open and copy a monthly recap covering current-month period records, happy-time memories, and the next prediction.
5. New interpretation logic is covered by Node tests and touched JavaScript files pass syntax checks.

### Phase 3: Room and Cloud Data Reliability

**Goal:** Keep shared-room data access trustworthy and recoverable.  
**Mode:** mvp

**Requirements:** ROOM-01, ROOM-02, ROOM-03, ROOM-04

**Success Criteria:**

1. Room creation, joining, and recovery flows have clear success and failure states.
2. Stale local `roomCode` cases are handled without trapping users.
3. Cloud data operations continue to enforce room membership server-side.
4. Access-control edge cases are documented and, where practical, covered by tests or a local harness.

### Phase 4: Record and Settings Flow Polish

**Goal:** Make daily record management and data export feel consistent and hard to misuse.  
**Mode:** mvp

**Requirements:** REC-01, REC-02, REC-03, REC-04, SET-01, SET-02, SET-03

**Success Criteria:**

1. Period and memory edit screens use consistent saving, deletion, validation, and error feedback.
2. Record list pages make dates, notes, and durations easy to scan.
3. Period edit/list/detail flows preserve optional flow and symptom metadata.
4. Settings export and local-cache clear flows clearly explain cloud-vs-local effects.
5. Manual checks confirm key flows in WeChat DevTools.

### Phase 5: Documentation and Release Readiness

**Goal:** Keep project knowledge current and prepare repeatable future phases.  
**Mode:** mvp

**Requirements:** QUAL-03

**Success Criteria:**

1. `.planning/codebase/` is refreshed after significant architecture or data-flow changes.
2. `CONTEXT.md`, `PROJECT.md`, `REQUIREMENTS.md`, and `STATE.md` reflect current reality.
3. Known concerns are either resolved, deferred with rationale, or promoted to local issues.
4. The next milestone can start from `$gsd-discuss-phase 1` or a selected later phase without reconstructing context from chat.

### Phase 6: Calendar Density and Today Jump

**Goal:** Keep the homepage calendar configurable when density is high and make date navigation faster.  
**Mode:** mvp

**Requirements:** CAL-05, CAL-08, QUAL-01, QUAL-02

**Success Criteria:**

1. User can switch the homepage calendar between compact and full density.
2. Full density is the default when no previous preference exists.
3. The selected density is remembered locally and restored when the mini program loads again.
4. Compact density hides crowded lunar/holiday text while keeping marker semantics visible.
5. The year-month picker includes a quick action to return to today's month.
6. New UI wiring is covered by automated source-contract tests and touched JavaScript passes syntax checks.

## Phase Summary

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 1 | Workflow Baseline | Traceable, testable future changes | FLOW-01, FLOW-02, FLOW-03, QUAL-01, QUAL-02, QUAL-04 |
| 2 | Calendar Display Clarity | Readable, unambiguous homepage calendar | CAL-01, CAL-02, CAL-03, CAL-04, CAL-07, CAL-08 |
| 2.1 | Calendar Insight and Monthly Recap | Homepage explanations and monthly recap | CAL-06, CAL-09, CAL-10, QUAL-01, QUAL-02, QUAL-03 |
| 3 | Room and Cloud Data Reliability | Trustworthy shared-room access | ROOM-01, ROOM-02, ROOM-03, ROOM-04 |
| 4 | Record and Settings Flow Polish | Consistent daily management flows | REC-01, REC-02, REC-03, REC-04, SET-01, SET-02, SET-03 |
| 5 | Documentation and Release Readiness | Current project knowledge and next-step readiness | QUAL-03 |
| 6 | Calendar Density and Today Jump | Configurable calendar density and faster date navigation | CAL-05, CAL-08, QUAL-01, QUAL-02 |
| 7 | Architecture Quality and Reliability Hardening | Reliability gaps and architecture deepening | REL-01, REL-02, REC-01, REC-02, REC-03, SET-01, SET-02, TEST-01, QUAL-01, QUAL-02, QUAL-03 |

## Coverage

- v1 requirements mapped: 24/24
- v2 requirements mapped: 4 active calendar insight/display requirements
- Unmapped requirements: 0
- Historical GSD artifacts: `.planning/HISTORY.md` and `.planning/phases/`

### Phase 7: Architecture Quality and Reliability Hardening

**Goal:** Deepen the remaining shallow client/data/page seams so reliability gaps, record/settings polish, and future calendar UI work are easier to verify and maintain without relying on manual-only checks.
**Mode:** mvp

**Requirements:** REL-01, REL-02, REC-01, REC-02, REC-03, SET-01, SET-02, TEST-01, QUAL-01, QUAL-02, QUAL-03
**Depends on:** Phase 6
**Plans:** 5 plans

**Success Criteria:**

1. Cloud timeout/network/stale-room failures surface consistent retry or repair actions through a shared client interface.
2. Period, memory, and settings flows share testable save/delete/export feedback behavior instead of duplicating page-local error handling.
3. Homepage calendar state composition has a narrower view-model seam while preserving existing marker semantics and density behavior.
4. Cloud access-control and page interaction logic gain automated harness coverage where practical.
5. Final architecture review finds no blocking module-boundary, verification, or planning-state issues.

Plans:

- [ ] 07-01-PLAN.md — RoomDataClient, stale room-code repair, and client reliability tests
- [ ] 07-02-PLAN.md — Period/memory record command helpers and page-flow tests
- [ ] 07-03-PLAN.md — Settings copy/export/local-cache flow helper and tests
- [ ] 07-04-PLAN.md — Homepage calendar view-model seam and marker regression tests
- [ ] 07-05-PLAN.md — Cloud authorization harness, final architecture audit, and planning-state refresh

---
*Last updated: 2026-06-26 after Phase 6 calendar density and today-jump completion*
