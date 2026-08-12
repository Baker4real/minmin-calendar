---
type: spec
title: "Accept recordCommands as Shallow Adapter"
tags: [project-docs, spec, architecture]
status: ready-for-agent
intent: "Document recordCommands' intentional adapter role; no refactoring needed"
---

# Accept recordCommands as Shallow Adapter

**Date:** 2026-08-12  
**Status:** Ready for agent  
**Triage:** `ready-for-agent`

## Problem Statement

`recordCommands.js` (428 lines) is the largest utils file. It exports 3 high-level commands (`runRecordSave`, `runRecordDelete`, `runRecordListLoad`) that orchestrate many options: `page`, `wxApi`, `timer`, `action`, `validate`, `loadingKey`, `successTitle`, `failureTitle`, `navigateBack`, `navigateToBind`, `successDelay`, `retryableMode`, `retryableAdvice`.

The complexity is **exposed**, not hidden—every caller must understand the wx API surface, loading state keys, retry modes, and navigation callbacks. Testing requires mocking `wx.showModal`, `wx.showToast`, `wx.navigateBack`, `wx.navigateTo`, plus a custom `timer` object and `page.setData`.

This appears to be architectural friction requiring deepening—extract pure logic (retry decisions, validation outcome handling) and leave only wx/page-specific glue. However, analysis reveals this is a **false positive**: the module is correctly shallow.

## Solution

**Do not refactor recordCommands.** Accept it as an intentionally shallow adapter between record operations and WeChat page lifecycle. Improve documentation to make its adapter role explicit, and refine test strategy to focus on outcome → wx API mapping correctness rather than attempting to test "pure logic" that doesn't exist.

The real testable logic (outcome classification, room repair decisions) already lives in other modules (`roomAccessOutcome`). What remains in recordCommands is legitimate adapter code—orchestrating wx APIs and page state updates around record operations.

## User Stories

1. As a developer implementing a record edit page, I want a standard adapter for save/delete/load operations, so that I don't duplicate wx API orchestration (modals, toasts, navigation) across every page.

2. As a developer reading record operation code, I want clear documentation that recordCommands is an adapter layer, so that I don't expect to find deep business logic or attempt to extract "pure functions" from intentionally thin glue code.

3. As a developer writing tests for record pages, I want guidance on when to test through recordCommands (outcome → UI mapping) versus when to test outcome classification logic directly (in roomAccessOutcome tests), so that I don't over-mock or under-cover critical paths.

4. As a developer maintaining recordCommands, I want recognition that adapter complexity (many configuration options, wx API mocks in tests) is acceptable for a module whose job is to adapt two complex surfaces (record operations and wx page lifecycle).

5. As a developer debugging a record operation failure, I want recordCommands to stay thin and trace-friendly, so that I can quickly see "validation failed → toast shown" or "room repair needed → navigate to bind" without wading through extracted abstractions.

## Implementation Decisions

### 1. No Refactoring—Accept Adapter Role

**Decision:** Do not extract pure functions from recordCommands. Leave the module's structure unchanged.

**Rationale:**
- **Deletion test:** Removing recordCommands would push orchestration to each of 4 pages, but the testable logic (outcome classification, retry decisions) is already in other modules (`roomAccessOutcome`). What remains is wx-specific glue—legitimate adapter code.
- **Shallow is correct here:** recordCommands is a **facade** over wx APIs for record operations. Facades are intentionally thin—they don't hide complexity, they provide a convenient entry point.
- **No deep logic to extract:** Validation is one line (`validate()`). Loading state is one line (`updatePage({ loading: true })`). Success/failure handling delegates to `handleFailureOutcome` which calls `roomAccessOutcome` for classification.

### 2. Document Adapter Role

Add a module-level comment at the top of `utils/recordCommands.js`:

```javascript
/**
 * recordCommands - Adapter between record operations and WeChat page lifecycle
 * 
 * This module is intentionally shallow. It orchestrates wx APIs (showModal, showToast,
 * navigateBack) and page state updates (setData) around record operations. Business logic
 * (outcome classification, room repair decisions) lives in roomAccessOutcome.
 * 
 * The module exposes many configuration options because it adapts two complex surfaces:
 * - Record operations (validate, action, success/failure outcomes)
 * - WeChat page lifecycle (loading states, navigation, user feedback modals)
 * 
 * Testing strategy: Mock wx APIs to verify outcome → UI mapping correctness. Test outcome
 * classification logic separately in roomAccessOutcome tests.
 * 
 * Callers: pages/memory/edit, pages/memory/memory, pages/period/edit, pages/period/period
 */
```

**Rationale:**
- Future maintainers won't attempt to "deepen" this module by extracting pure functions
- Documents that the many options are a feature (adapter configurability), not a smell
- Clarifies that testing this module requires mocks—that's expected for adapter tests

### 3. Refine Test Strategy

**Current issue:** Tests mock `wx.showModal`, `wx.showToast`, `wx.navigateBack`, `wx.navigateTo`, `timer`, and `page.setData`. This feels heavy, leading to the instinct that "we should extract pure logic to reduce mocking."

**Corrected understanding:** Adapter tests **should** mock the adapted surfaces. The mocking is proportional to the module's responsibility.

**Test focus:**
- Validation fails → toast shown with validation message, action not called
- Success → toast shown with success title, navigateBack called after delay
- Retryable failure + retry mode → modal shown with retry button, callback invokes action again
- Room repair + rebind action → modal shown, navigateToBind called
- No-room outcome → appropriate outcome returned (no crash on missing wx APIs)

**Simplified test pattern:**
```javascript
// Focus on "did the right wx API get called with the right message?"
test('runRecordSave shows validation toast and skips action when validation fails', async () => {
  const fakeWx = { showToast: sinon.spy() }
  const action = sinon.spy()
  const validate = () => '日期不能为空'
  
  const outcome = await runRecordSave({
    wxApi: fakeWx,
    page: fakePage(),
    action,
    validate
  })
  
  assert.equal(fakeWx.showToast.calledWith({ title: '日期不能为空', icon: 'none' }), true)
  assert.equal(action.called, false)
  assert.deepEqual(outcome, { kind: 'validation', message: '日期不能为空' })
})
```

**Do not test:**
- Internal sequencing (e.g., "is loading state set before calling action?") unless that order matters to external behavior
- Outcome classification logic (that's in roomAccessOutcome tests)
- Retry decision logic (that's already in handleFailureOutcome, tested via outcome → modal mapping)

### 4. No Module Rename

Keep the name `recordCommands.js`. Do not rename to `recordPageAdapter.js` or `recordCommandGlue.js`.

**Rationale:**
- The name `recordCommands` accurately describes the interface: `runRecordSave`, `runRecordDelete`, `runRecordListLoad`
- External callers import `require('./recordCommands')` in 4 pages—renaming has ripple cost
- The adapter role is now documented in the module comment; the name doesn't need to encode it

### 5. No New Abstractions

Do not create new modules like `recordFlowLogic.js` or merge logic into existing modules like `roomAccessOutcome`.

**Rationale:**
- There is no "record flow logic" to extract—the flow is: validate → call action → classify outcome → show UI → navigate
- Each step is 1-3 lines; extracting them creates indirection without reducing complexity
- `roomAccessOutcome` is about room access outcomes (no-room, room-repair); record operation orchestration is a separate concern

## Testing Decisions

### What Makes a Good Test

- Test that recordCommands correctly maps outcomes to wx API calls
- Test that configuration options (titles, delays, retry modes) are respected
- Test edge cases: missing wx API, no page object, validation failure, retry loops
- **Do not** test internal implementation details (e.g., order of `setData` calls) unless observable externally
- **Do not** test outcome classification logic here—that belongs in roomAccessOutcome tests

### Modules to Test

**Continue testing `utils/recordCommands.js` via `tests/record-flow.test.js`** (or similar existing test file)

Focus on adapter contract:
- Validation outcome → toast, no action call
- Success outcome → toast, navigate back after delay
- Retryable failure + retry mode → modal with retry, callback invokes action
- Retryable failure + confirm-state mode → modal with acknowledge, no retry callback
- Room repair (retry action) → modal with retry
- Room repair (rebind action) → modal with navigate to bind

**Do not add:**
- New test files for "extracted pure logic"—there is none to extract
- Integration tests with real wx APIs—unit tests with mocks are sufficient for adapter verification

### Prior Art

- `tests/record-flow.test.js` lines 19-47: existing pattern of mocking wx APIs and page objects
- `tests/room-access-outcome.test.js`: outcome classification tests (separate concern)
- Adapter tests in other codebases: always mock the adapted surfaces, verify correct delegation

## Out of Scope

### Not Changing

- **recordCommands interface:** All exported functions (`runRecordSave`, `runRecordDelete`, `runRecordListLoad`) keep their current signatures
- **Option shapes:** No changes to the options objects passed to these functions
- **Internal structure:** No extraction of pure functions, no new helper modules
- **Caller code:** `pages/memory/edit`, `pages/memory/memory`, `pages/period/edit`, `pages/period/period` unchanged
- **Test mocking strategy:** Adapter tests will continue to mock wx APIs—that's correct for adapter tests

### Not Adding

- **Pure function modules:** Not creating `recordFlowLogic.js` or similar—no deep logic to extract
- **Retry orchestration abstractions:** Retry logic is already in `handleFailureOutcome`; not extracting further
- **Validation framework:** Validation is caller-provided; recordCommands doesn't own validation logic

### Not Extracting

- **Loading state management:** 1-line `updatePage` calls stay in recordCommands
- **Navigation callbacks:** `navigateBack` and `navigateToBind` are passed through; no extraction needed
- **Success delay logic:** `timer.setTimeout(() => navigateBack(), delay)` is 1 line; extraction is overkill

## Further Notes

### Relation to Other Architecture Candidates

This is **Candidate 2** (Worth exploring) from the 2026-08-12 architecture review. After analysis, the recommendation is **do not pursue**.

**Why the architecture review flagged it:** The many options and wx API mocks appeared to signal hidden complexity that should be extracted.

**Why analysis changed the recommendation:** The deletion test revealed no deep logic exists. What remains after removing recordCommands is wx glue scattered across 4 pages—that's worse, not better.

**Independence from other candidates:**
- **Candidate 1** (Merge room access modules): Independent; recordCommands imports `roomAccessOutcome`
- **Candidate 3** (Home records sync): Independent; operates at different layer
- **Candidate 4** (Separate room resolution): Independent; recordCommands doesn't directly use room resolution

### Why Adapter Complexity Is Acceptable

**Adapters are allowed to be shallow with many options:**
- The options reflect the legitimate complexity of the two surfaces being adapted (record operations + wx page lifecycle)
- Reducing options would mean hardcoding decisions (e.g., success title, navigation behavior) that genuinely vary by page
- The alternative—each page implements its own orchestration—duplicates this complexity 4 times

**Testing adapters requires mocks:**
- Mocking wx APIs is not a test smell; it's the correct way to test an adapter
- If we extracted "pure logic," we'd still need adapter tests with the same mocks to verify the adapter works
- The test count and complexity wouldn't decrease—we'd just add a second layer of indirection

### What a Deepened Version Would Look Like (And Why It's Wrong)

**Hypothetical deepening attempt:**
```javascript
// recordFlowLogic.js (pure functions)
function decideNextAction(outcome, retryableMode) {
  if (outcome.kind === 'retryable-failure' && retryableMode === 'retry') {
    return { action: 'retry', message: outcome.message }
  }
  // ... more branches
}

// recordCommands.js (thin adapter)
async function runRecordSave(options) {
  // ... validate, call action ...
  const nextAction = recordFlowLogic.decideNextAction(outcome, options.retryableMode)
  if (nextAction.action === 'retry') {
    promptRetry(wxApi, nextAction.message, ...)
  }
  // ...
}
```

**Why this is worse:**
- `decideNextAction` just reimplements the if/switch that's already in `handleFailureOutcome`
- Tests for `decideNextAction` duplicate tests for `handleFailureOutcome`—both verify the same branching logic
- The adapter tests still need full wx mocks—no reduction in test complexity
- Reading a record operation flow now requires jumping between `recordCommands` and `recordFlowLogic`

**Conclusion:** The current shape—one module, direct branching, adapter tests with mocks—is correct.
