---
type: spec
title: "Inline Home Records Sync State Machine"
tags: [project-docs, spec, architecture]
status: ready-for-agent
intent: "Eliminate premature abstraction by inlining state machine into sole caller"
---

# Inline Home Records Sync State Machine

**Date:** 2026-08-12  
**Status:** Ready for agent  
**Triage:** `ready-for-agent`

## Problem Statement

`utils/homeRecordsSync.js` (285 lines) is a beautiful pure state machine with explicit events (`load-start`, `record-change`, `load-resolved`, `load-failed`). However, real bugs hide in the **caller**: `pages/index/index.js` must maintain `_homeRecordsSyncState`, call `transitionRecordsSync`, extract `decision.requestId`, and pass it back in `load-resolved`. If the page calls the transition twice with the same event, or forgets to apply a decision, the state machine cannot save it.

The state machine handles request ordering (checking `event.requestId !== request.id`), but **coordination responsibility**—tracking active requests, preventing duplicate loads—is split between the module and the page. Tests at `tests/home-records-sync.test.js` only test the pure state machine, not the integration. Real bugs would be in `pages/index/index.js`'s call orchestration.

This is premature abstraction: only one page uses the state machine, and the coordination logic is page-specific (e.g., `canRefreshInBackground()`, `_loadingPromise` management). Extracting the state machine to a separate module increased indirection without providing reuse leverage.

## Solution

**Inline the state machine logic into `pages/index/index.js`.** Delete `utils/homeRecordsSync.js`. Replace pure state machine tests with page behavior tests that verify the complete load flow (initial load, background refresh, stale snapshot rejection, pending revision tracking).

This is not "deepening" in the traditional sense—it's **eliminating unnecessary abstraction**. The deletion test confirms: removing the module concentrates complexity in the one place it's actually used, rather than scattering it between a pure module and a stateful caller.

## User Stories

1. As a developer understanding the home page load flow, I want the state transitions defined in the same file as the load orchestration, so that I can read "onShow → loadData → request ordering" in one place without jumping to a separate state machine module.

2. As a developer debugging a snapshot rollback bug, I want revision tracking logic co-located with the actual snapshot loading code, so that I can see how `revisions` and `pendingRevisions` interact with the load request lifecycle.

3. As a developer writing tests for the home page, I want to test observable page behavior (initial load succeeds, background refresh doesn't roll back saved records), not internal state machine transitions that are an implementation detail.

4. As a developer maintaining the home page, I want direct access to state transitions via private methods (`_startLoad`, `_resolveLoad`), so that I can call `this.setData()` immediately rather than returning decision objects and applying them in a separate step.

5. As a future maintainer, I want module boundaries to reflect actual reuse, so that I don't assume the state machine is used by multiple pages when it's only ever been used by `pages/index/index.js`.

## Implementation Decisions

### 1. Inline State Machine into Page

Move the logic from `utils/homeRecordsSync.js` directly into `pages/index/index.js` as private page methods.

**Before (split across files):**
```javascript
// utils/homeRecordsSync.js
function createHomeRecordsSyncState(initialState) { ... }
function transitionHomeRecordsSync(state, event) { ... }

// pages/index/index.js
Page({
  onLoad() {
    this._homeRecordsSyncState = createHomeRecordsSyncState({ ... })
  },
  loadData(options) {
    const started = transitionHomeRecordsSync(this._homeRecordsSyncState, {
      type: 'load-start',
      mode: background ? 'background' : 'initial'
    })
    this._homeRecordsSyncState = started.state
    const requestId = started.decision.requestId
    // ... apply decision, call snapshot, transition again ...
  }
})
```

**After (inlined):**
```javascript
// pages/index/index.js
Page({
  onLoad() {
    this._syncState = {
      revisions: { periods: 0, memories: 0 },
      pendingRevisions: { periods: null, memories: null },
      nextRequestId: 1,
      activeRequest: null
    }
  },
  
  async loadData(options = {}) {
    const background = Boolean(options.background)
    const requestId = this._startLoad(background)
    
    try {
      const client = cloud.createRoomDataClient()
      const snapshot = await roomRecordsSnapshot.loadHomeRecordsSnapshot({ client })
      this._resolveLoad(requestId, snapshot, background)
      return snapshot.kind === 'blocked' ? snapshot.outcome : snapshot
    } catch (e) {
      const outcome = { kind: 'retryable-failure', message: getErrorMessage(e) }
      this._failLoad(requestId, outcome, background)
      return outcome
    } finally {
      this._loadingPromise = null
    }
  },
  
  _startLoad(background) {
    const requestId = this._syncState.nextRequestId
    this._syncState.nextRequestId++
    this._syncState.activeRequest = {
      id: requestId,
      mode: background ? 'background' : 'initial',
      startRevisions: { ...this._syncState.revisions }
    }
    
    this.setData({
      loading: !background,
      refreshing: background
    })
    
    if (background && this._hasPendingRevisions()) {
      this.setData({
        syncStatus: { text: '已更新，正在同步', autoHide: false }
      })
    }
    
    return requestId
  },
  
  _resolveLoad(requestId, snapshot, background) {
    const request = this._syncState.activeRequest
    
    // Stale request—newer load already started
    if (!request || request.id !== requestId) {
      return
    }
    
    if (snapshot.kind === 'success') {
      const startRevisions = request.startRevisions
      const currentRevisions = this._syncState.revisions
      
      // Apply snapshot data for collections that haven't changed
      COLLECTIONS.forEach(collection => {
        if (startRevisions[collection] === currentRevisions[collection]) {
          this._applySnapshotCollection(collection, snapshot.data[collection])
        }
      })
      
      // Clear pending revisions that were confirmed
      const nextPending = { ...this._syncState.pendingRevisions }
      COLLECTIONS.forEach(collection => {
        const pending = nextPending[collection]
        if (pending !== null && pending <= currentRevisions[collection]) {
          nextPending[collection] = null
        }
      })
      this._syncState.pendingRevisions = nextPending
      
      // Update UI state
      this.setData({
        hasLoadedHomeData: true,
        loading: false,
        refreshing: false
      })
      
      if (this._hasPendingRevisions()) {
        this.setData({
          syncStatus: { text: '已更新，正在同步', autoHide: false }
        })
      } else {
        this.setData({ syncStatus: null })
      }
    }
    
    this._syncState.activeRequest = null
  },
  
  _failLoad(requestId, outcome, background) {
    const request = this._syncState.activeRequest
    if (!request || request.id !== requestId) {
      return
    }
    
    this.setData({
      loading: false,
      refreshing: false
    })
    
    this._syncState.activeRequest = null
  },
  
  _applyRecordChange(collection, record, mode) {
    const records = this.data[collection] || []
    const nextRecords = this._mergeRecordChange(records, record, mode)
    
    // Check if records actually changed
    if (this._stableRecordListKey(nextRecords) === this._stableRecordListKey(records)) {
      return
    }
    
    const revision = this._syncState.revisions[collection] + 1
    this._syncState.revisions[collection] = revision
    
    if (this.data.hasLoadedHomeData) {
      this._syncState.pendingRevisions[collection] = revision
      this.setData({
        [collection]: nextRecords,
        syncStatus: { text: '已更新，正在同步', autoHide: false }
      })
    } else {
      this.setData({ [collection]: nextRecords })
    }
  },
  
  _hasPendingRevisions() {
    return this._syncState.pendingRevisions.periods !== null ||
           this._syncState.pendingRevisions.memories !== null
  },
  
  // Helper methods: _mergeRecordChange, _stableRecordListKey, _applySnapshotCollection
  // (inline the logic from homeRecordsSync.js helper functions)
})
```

**Rationale:**
- State and transitions in one file—no jumping between module and caller
- Direct `setData()` calls instead of returning decision objects
- requestId coordination is explicitly part of the page's load flow
- Eliminates the "apply decision" step—`_startLoad` updates UI immediately

### 2. Delete utils/homeRecordsSync.js

After inlining, delete the entire `utils/homeRecordsSync.js` file.

**Rationale:**
- Only one caller: `pages/index/index.js`
- No reuse leverage—the state machine was never used by other pages
- Deleting concentrates complexity in one place rather than splitting it

### 3. Replace State Machine Tests with Page Behavior Tests

**Delete:** `tests/home-records-sync.test.js` (pure state machine tests)

**Create:** `tests/index-page.test.js` (page behavior tests)

**New test focus:**
- Initial load success → `hasLoadedHomeData: true`, records populated, `loading: false`
- Background refresh with no local changes → records updated from snapshot
- Background refresh after local save → snapshot doesn't roll back the saved record
- Background refresh confirms pending revisions → `syncStatus` clears
- Load failure → `loading: false`, old records preserved, error outcome returned
- Duplicate load prevention → second `loadData()` during active load returns same promise

**Example test:**
```javascript
test('background refresh does not roll back a record saved after the refresh started', async () => {
  const page = createFakePage({
    periods: [period('p1', '2026-06-01')],
    memories: [],
    hasLoadedHomeData: true
  })
  
  // Start background refresh
  const loadPromise = page.loadData({ background: true })
  
  // Simulate user saving a new record before refresh completes
  page._applyRecordChange('periods', period('p2', '2026-06-29'), 'add')
  
  // Snapshot resolves with only old record
  await loadPromise
  
  // Verify: new record p2 is still in the list
  assert.deepEqual(page.data.periods.map(p => p._id), ['p2', 'p1'])
  assert.equal(page.data.syncStatus.text, '已更新，正在同步')
})
```

**Rationale:**
- Tests observable behavior, not internal state machine transitions
- Verifies the bug the architecture review identified: "if the page calls transition incorrectly, the state machine can't save it"—now we test the page directly
- Easier to understand: "user does X → page shows Y" rather than "event E transitions state S to S'"

### 4. Keep COLLECTIONS Constant

The `COLLECTIONS = ['periods', 'memories']` constant can stay at the top of the page file or be inlined where used.

**Recommendation:** Keep as a const at file scope within `pages/index/index.js`:
```javascript
const COLLECTIONS = ['periods', 'memories']

Page({
  // ... page methods use COLLECTIONS ...
})
```

**Rationale:**
- DRY principle—used in multiple methods
- Clear intent: these are the two record types the home page loads
- Not exported—internal to the page

### 5. Normalize/Merge Helpers

Helper functions from `homeRecordsSync.js` (e.g., `normalizeRecords`, `mergeRecordChange`, `stableRecordListKey`) become private page methods prefixed with `_`.

**Options:**
1. Inline as private methods: `_normalizeRecords()`, `_mergeRecordChange()`, `_stableRecordListKey()`
2. Keep as top-level functions in the page file (before the `Page()` call)

**Recommendation:** Option 1 (private methods) for consistency with other page methods.

```javascript
Page({
  _mergeRecordChange(records, record, mode) {
    if (mode === 'add') {
      return [record, ...records]
    }
    if (mode === 'update') {
      return records.map(r => r._id === record._id ? record : r)
    }
    if (mode === 'remove') {
      return records.filter(r => r._id !== record._id)
    }
    return records
  },
  
  _stableRecordListKey(records) {
    return records.map(r => r._id).join(',')
  },
  
  _normalizeRecords(records) {
    return Array.isArray(records) ? records : []
  }
})
```

## Testing Decisions

### What Makes a Good Test

- Test observable page behavior: data values, UI states, navigation
- Test the complete flow: user action → async operation → UI update
- Test edge cases: stale snapshots, load failures, duplicate requests
- **Do not** test internal state machine transitions as a separate concern
- **Do not** test helper methods (`_mergeRecordChange`) in isolation—they're tested implicitly via behavior tests

### Modules to Test

**Delete:** `tests/home-records-sync.test.js`

**Create:** `tests/index-page.test.js` (new file)

**Test coverage:**

1. **Initial load success**
   - `hasLoadedHomeData: true`
   - `periods` and `memories` populated
   - `loading: false`, `refreshing: false`

2. **Background refresh with no local changes**
   - Records updated from snapshot
   - `refreshing: true` during load, `false` after
   - No `syncStatus` if no pending revisions

3. **Background refresh after local save**
   - Saved record stays in list (not rolled back by stale snapshot)
   - `syncStatus: { text: '已更新，正在同步', autoHide: false }` shown
   - `pendingRevisions` tracked

4. **Background refresh confirms pending revisions**
   - Snapshot includes the saved record
   - `syncStatus` clears
   - `pendingRevisions` reset to `null`

5. **Load failure**
   - `loading: false`, `refreshing: false`
   - Old records preserved
   - Returns retryable-failure outcome

6. **Duplicate load prevention**
   - Second `loadData()` during active load returns same promise
   - Only one snapshot request sent

**Test helpers:**
```javascript
function createFakePage(initialData = {}) {
  const page = {
    data: {
      periods: initialData.periods || [],
      memories: initialData.memories || [],
      hasLoadedHomeData: initialData.hasLoadedHomeData || false,
      loading: false,
      refreshing: false,
      syncStatus: null
    },
    setData(updates) {
      Object.assign(page.data, updates)
    },
    // Copy all page methods (_startLoad, _resolveLoad, etc.)
    ...indexPageMethods
  }
  page.onLoad()
  return page
}
```

### Prior Art

- `tests/home-records-sync.test.js`: existing pure state machine tests (will be replaced)
- Page behavior tests are new to this codebase, but standard in frontend testing: test the component/page as a black box, verify observable state changes

## Out of Scope

### Not Changing

- **Snapshot loading logic:** `roomRecordsSnapshot.loadHomeRecordsSnapshot` unchanged
- **RoomDataClient:** No changes to how records are fetched
- **Home page UI:** Visual presentation of records, loading states, sync status unchanged
- **Revision tracking semantics:** The rules for when to accept/reject snapshots remain identical (only the implementation is inlined)
- **Other pages:** Memory list, period list, edit pages unchanged

### Not Adding

- **State management library:** Not introducing Redux, MobX, or similar—page-local state is sufficient
- **Observable patterns:** Not using Observables or event emitters—direct method calls are clearer
- **Generic state machine framework:** Not replacing the specific logic with a generic state machine library

### Not Extracting

- **Snapshot merge logic:** The logic for merging snapshots with local changes stays in the page (not extracted to a new module)
- **Revision tracking:** Revision comparison stays in `_resolveLoad`, not extracted to a separate module
- **Loading promise management:** `_loadingPromise` coordination stays in the page

## Further Notes

### Relation to Other Architecture Candidates

This is **Candidate 3** (Worth exploring) from the 2026-08-12 architecture review. Independent of other candidates:

- **Candidate 1** (Merge room access modules): Independent; home page doesn't directly use room access modules
- **Candidate 2** (recordCommands): Independent; different layer
- **Candidate 4** (Separate room resolution): Independent; home page uses RoomDataClient which may internally use resolver

### Why This Is Eliminating Premature Abstraction, Not "Deepening"

**The architecture review framed this as "deepening":** Either (a) make the state machine own coordination, or (b) inline it to the page.

**Option (a) would be wrong:** Making the state machine own coordination (e.g., exposing `sync.loadRecords()`) would turn it into another orchestrator like recordCommands—a new module that adapts the state machine to the page lifecycle. That doesn't reduce complexity, it adds a layer.

**Option (b) is correct, but it's not "deepening"—it's simplification:** The current split (pure module + stateful caller) is premature abstraction. There's only one caller, the coordination logic is page-specific, and tests only cover the pure part while bugs live in the integration.

**Deletion test:** Removing the module and inlining to the page concentrates complexity in one place. The page file gets longer, but the **system** gets simpler—fewer files, no cross-file coordination, no decision-object indirection.

### Why Single-Caller Modules Are Often Premature

**Reuse is the justification for extraction.** A module that's only used once creates costs (indirection, coordination, distributed state) without delivering the benefit (multiple callers sharing logic).

**The state machine was extracted in anticipation of future reuse** (memory list page might need similar sync logic). That reuse never materialized. Memory and period list pages load their records differently—they don't need request-ordering state machines.

**Inline now, extract later if needed:** If a second page genuinely needs identical sync logic, extract at that point with both callers in view. Extracting speculatively just creates a module that's too generic (to cover hypothetical future cases) or too specific (tied to the home page's needs).

### File Size Is Not a Complexity Metric

**Concern:** Inlining adds ~200 lines to `pages/index/index.js`.

**Response:** Lines of code in one file ≠ complexity. The complexity is the **conceptual surface area**: how many ideas must you hold in your head to understand the load flow?

**Before (split):**
- Understand state machine transitions (`load-start`, `record-change`, `load-resolved`, `load-failed`)
- Understand decision object shape and application
- Understand how page extracts `requestId` and threads it through
- Understand how `_loadingPromise` prevents duplicate loads
- Mental model: 4+ concepts

**After (inlined):**
- Understand page load flow: `_startLoad` → snapshot fetch → `_resolveLoad` → `setData`
- Mental model: 1 concept (the load flow), implemented as ordered private methods

**The inlined version is easier to understand** even though it's longer, because it's linear and local.