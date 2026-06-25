# Requirements: Minmin Calendar

**Defined:** 2026-06-24  
**Core Value:** Two people can reliably see the same private calendar state and understand what each calendar marker means at a glance.

## v1 Requirements

### Workflow

- [ ] **FLOW-01**: Developer can track project source, planning docs, and future changes in git.
- [ ] **FLOW-02**: Developer can use local markdown issues under `.scratch/` for future requests before a remote issue tracker exists.
- [ ] **FLOW-03**: Developer can run documented verification commands after behavior changes.

### Calendar

- [ ] **CAL-01**: User can see period days, memory days, today, and predicted days on the homepage calendar without marker ambiguity.
- [ ] **CAL-02**: User can see lunar dates and China public holiday/adjusted-workday labels in calendar cells.
- [ ] **CAL-03**: User can read "next predicted period" as a compact date with weekday without awkward wrapping.
- [ ] **CAL-04**: User can tap a calendar day and understand period and memory details for that day.
- [ ] **CAL-07**: User can see the next period prediction as a range with confidence and timely in-app reminder states.
- [ ] **CAL-08**: User can open the calendar month title and quickly jump to a selected year and month.

### Records

- [ ] **REC-01**: User can create, edit, and delete period records with start/end date validation.
- [ ] **REC-02**: User can create, edit, and delete memory records for a selected date.
- [ ] **REC-03**: User can review record lists with dates, notes, and durations where relevant.
- [ ] **REC-04**: User can optionally record and review flow level and symptom tags on period records.

### Room Sharing

- [ ] **ROOM-01**: User can create a shared room and get a six-character room code.
- [ ] **ROOM-02**: Second user can join an existing room with a valid room code.
- [ ] **ROOM-03**: Returning users can recover room binding from cloud state when local cache is missing.
- [ ] **ROOM-04**: Data operations only succeed when the current user belongs to the room.

### Settings and Data

- [ ] **SET-01**: User can copy the current room code from settings.
- [ ] **SET-02**: User can export period and memory data as JSON or clipboard fallback.
- [ ] **SET-03**: User can clear local cache without deleting cloud data.

### Quality

- [ ] **QUAL-01**: Date and calendar metadata logic has automated tests for prediction display, lunar dates, official holidays, and marker semantics.
- [ ] **QUAL-02**: JavaScript files touched by behavior changes pass syntax checks.
- [ ] **QUAL-03**: Codebase map and project context stay updated after significant structure or domain changes.
- [ ] **QUAL-04**: Cycle prediction and period metadata helpers have automated tests for outliers, fallbacks, reminders, and tag normalization.

## v2 Requirements

### Calendar

- **CAL-05**: User can configure whether lunar/holiday labels are shown when calendar density becomes too high.
- **CAL-06**: User can inspect a legend explaining all calendar markers.

### Reliability

- **REL-01**: App can surface retry actions for cloud timeout or network failures.
- **REL-02**: App can detect and repair stale local room codes more explicitly.

### Testing

- **TEST-01**: Cloud-function access control has automated tests or a local harness.
- **TEST-02**: Homepage layout has screenshot-based regression checks if a suitable mini program test runner is introduced.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Medical prediction or diagnosis | Product is a calendar and record tool, not a clinical assistant |
| Public feeds or multi-room social graph | Would conflict with the private two-person model |
| Paid membership or ads | No monetization requirement exists |
| Native mobile app rewrite | WeChat Mini Program is the active platform |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-01 | Phase 1 | In Progress |
| FLOW-02 | Phase 1 | Pending |
| FLOW-03 | Phase 1 | Pending |
| CAL-01 | Phase 2 | Pending |
| CAL-02 | Phase 2 | Pending |
| CAL-03 | Phase 2 | Pending |
| CAL-04 | Phase 2 | Pending |
| CAL-07 | Phase 2 | In Progress |
| CAL-08 | Phase 2 | In Progress |
| REC-01 | Phase 4 | Pending |
| REC-02 | Phase 4 | Pending |
| REC-03 | Phase 4 | Pending |
| REC-04 | Phase 4 | In Progress |
| ROOM-01 | Phase 3 | Pending |
| ROOM-02 | Phase 3 | Pending |
| ROOM-03 | Phase 3 | Pending |
| ROOM-04 | Phase 3 | Pending |
| SET-01 | Phase 4 | Pending |
| SET-02 | Phase 4 | Pending |
| SET-03 | Phase 4 | Pending |
| QUAL-01 | Phase 1 | In Progress |
| QUAL-02 | Phase 1 | In Progress |
| QUAL-03 | Phase 5 | Pending |
| QUAL-04 | Phase 1 | In Progress |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-06-24*  
*Last updated: 2026-06-25 after calendar month-jump requirement capture*
