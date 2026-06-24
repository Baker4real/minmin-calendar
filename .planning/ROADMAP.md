# Roadmap: Minmin Calendar

**Created:** 2026-06-24  
**Mode:** Vertical MVP slices  
**Core Value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.

## Phases

### Phase 1: Workflow Baseline
**Goal:** Make future changes traceable, testable, and recoverable across sessions.  
**Mode:** mvp

**Requirements:** FLOW-01, FLOW-02, FLOW-03, QUAL-01, QUAL-02

**Success Criteria:**
1. Git is initialized with source, tests, planning docs, and a practical `.gitignore`.
2. Local markdown issue tracker and domain-doc conventions are documented.
3. Verification commands are documented and run successfully at least once.
4. Existing calendar display behavior tests pass.

### Phase 2: Calendar Display Clarity
**Goal:** Make the homepage calendar readable and semantically unambiguous on mobile.  
**Mode:** mvp

**Requirements:** CAL-01, CAL-02, CAL-03, CAL-04

**Success Criteria:**
1. Calendar markers visually distinguish period, memory, today, prediction, holiday, and adjusted-workday states.
2. "Prediction next" display stays compact and includes weekday.
3. Lunar and holiday labels do not overlap primary dates on small-phone layouts.
4. Day detail modal remains accurate for period and memory records.

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

**Requirements:** REC-01, REC-02, REC-03, SET-01, SET-02, SET-03

**Success Criteria:**
1. Period and memory edit screens use consistent saving, deletion, validation, and error feedback.
2. Record list pages make dates, notes, and durations easy to scan.
3. Settings export and local-cache clear flows clearly explain cloud-vs-local effects.
4. Manual checks confirm key flows in WeChat DevTools.

### Phase 5: Documentation and Release Readiness
**Goal:** Keep project knowledge current and prepare repeatable future phases.  
**Mode:** mvp

**Requirements:** QUAL-03

**Success Criteria:**
1. `.planning/codebase/` is refreshed after significant architecture or data-flow changes.
2. `CONTEXT.md`, `PROJECT.md`, `REQUIREMENTS.md`, and `STATE.md` reflect current reality.
3. Known concerns are either resolved, deferred with rationale, or promoted to local issues.
4. The next milestone can start from `$gsd-discuss-phase 1` or a selected later phase without reconstructing context from chat.

## Phase Summary

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 1 | Workflow Baseline | Traceable, testable future changes | FLOW-01, FLOW-02, FLOW-03, QUAL-01, QUAL-02 |
| 2 | Calendar Display Clarity | Readable, unambiguous homepage calendar | CAL-01, CAL-02, CAL-03, CAL-04 |
| 3 | Room and Cloud Data Reliability | Trustworthy shared-room access | ROOM-01, ROOM-02, ROOM-03, ROOM-04 |
| 4 | Record and Settings Flow Polish | Consistent daily management flows | REC-01, REC-02, REC-03, SET-01, SET-02, SET-03 |
| 5 | Documentation and Release Readiness | Current project knowledge and next-step readiness | QUAL-03 |

## Coverage

- v1 requirements mapped: 20/20
- Unmapped requirements: 0

---
*Roadmap created: 2026-06-24 after workflow initialization*
