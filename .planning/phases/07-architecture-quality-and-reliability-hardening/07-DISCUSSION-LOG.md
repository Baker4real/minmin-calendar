# Phase 7: Architecture Quality and Reliability Hardening - Discussion Log

**Date:** 2026-06-26
**Mode:** auto
**Route:** `$ask-matt` -> GSD discuss-phase -> GSD plan/execute flow

## Source Inputs

- User requested that current changes be committed first, then all recommended architecture modifications be executed in order, followed by architecture quality review until no issues remain.
- User explicitly required all flows to use full GSD workflow.
- Prior architecture review identified these candidate directions:
  1. `RoomDataClient` and stale room-code repair.
  2. Record/settings flow modules.
  3. Homepage calendar view-model and marker source-of-truth cleanup.
  4. Cloud authorization seam and harness coverage.
  5. Lightweight page adapter test harness.

## Auto-Selected Gray Areas

### Reliability client seam

- [auto] Question: How should cloud timeout/network failures be represented?
- Selected: Use a shared client data interface that marks failures as retryable and lets pages render a retry action.
- Rationale: This directly covers `REL-01` and prevents per-page error handling drift.

- [auto] Question: How should stale local room codes be handled?
- Selected: Add an explicit RoomSession verification/repair seam before routing users to bind.
- Rationale: This directly covers `REL-02` and keeps cached room semantics local to `utils/room.js`.

### Record and settings flow

- [auto] Question: Should period/memory/settings keep page-local command logic or share helpers?
- Selected: Extract small flow/command helpers where repeated save/delete/export/loading/toast behavior exists.
- Rationale: This improves locality without replacing the WeChat page adapter model.

- [auto] Question: Should export format change?
- Selected: Keep JSON/share/clipboard fallback and improve feedback, warning copy, and tests.
- Rationale: The requirement is polish and safety, not a new export product.

### Calendar architecture

- [auto] Question: How should homepage complexity be reduced?
- Selected: Add a pure view-model seam that composes calendar util, cycle prediction, insights, and density state.
- Rationale: Preserves behavior while narrowing `pages/index/index.js`.

- [auto] Question: Should marker rendering become fully data-driven?
- Selected: Share marker meanings where practical, while keeping WXML marker rendering explicit.
- Rationale: Explicit template semantics are easier to audit for mini program UI.

### Testing and verification

- [auto] Question: How should page behavior be tested?
- Selected: Start with lightweight Node harnesses and flow-module tests; defer screenshot runner unless practical.
- Rationale: Gives immediate automated coverage for current gaps without adding a heavy runner.

### Architecture review closeout

- [auto] Question: What is the completion gate?
- Selected: Run architecture/code review after implementation and fix blocking findings before phase completion.
- Rationale: Matches the user's request to audit until no problems remain.

## Deferred

- Manual WeChat DevTools visual signoff remains outside the automated implementation gate.
- Screenshot regression remains conditional on runner suitability.

