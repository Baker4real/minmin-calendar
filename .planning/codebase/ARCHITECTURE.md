# Architecture

**Analysis Date:** 2026-06-24

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 WeChat Mini Program UI Layer                │
├──────────────────┬──────────────────┬───────────────────────┤
│  Tab/pages flow  │  Edit/detail UI  │  Settings/bind flow   │
│ `pages/index/*`  │ `pages/period/*` │ `pages/settings/*`    │
│ `pages/memory/*` │ `pages/bind/*`   │                       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Shared client service / utils               │
│          `utils/cloud.js`, `utils/util.js`, `utils/cycle.js`│
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                Cloud Functions / Cloud DB layer             │
│ `cloudfunctions/createRoom/*`, `joinRoom/*`, `getMyRoom/*`, │
│ `login/*`, `dataOp/*`                                       │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                     WeChat Cloud Database                    │
│                         `rooms`, `periods`, `memories`      │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App bootstrap | Initializes cloud SDK and stores global UI metrics | `app.js` |
| Routing and shell | Declares pages, tab bar, window style, lazy loading | `app.json` |
| Calendar home | Loads periods/memories, computes cycle stats, renders monthly calendar | `pages/index/index.js` |
| Period records | Lists, adds, edits, deletes period entries | `pages/period/period.js`, `pages/period/edit/edit.js` |
| Memory records | Lists, adds, edits, deletes memory entries | `pages/memory/memory.js`, `pages/memory/edit/edit.js` |
| Room binding | Creates or joins shared room, stores room code locally | `pages/bind/bind.js` |
| Settings | Reads room code, exports data, clears local cache | `pages/settings/settings.js` |
| Shared client API | Wraps cloud function calls and local room-code access | `utils/cloud.js` |
| Date / calendar logic | Formats dates, computes holiday/lunar metadata, builds calendar grid | `utils/util.js` |
| Cycle model logic | Predicts cycle ranges, reminders, and period metadata labels | `utils/cycle.js` |
| Backend CRUD gateway | Validates access and performs CRUD on records | `cloudfunctions/dataOp/index.js` |

## Pattern Overview

**Overall:** Client-heavy WeChat mini program with thin page controllers and a centralized cloud-function data gateway.

**Key Characteristics:**
- Pages own presentation and user interaction; business state stays in page `data` and methods.
- `utils/cloud.js` is the only client-side path for data mutations and list reads.
- Cloud functions enforce room-level access before touching shared records.
- Calendar rendering is derived from `periods`, `memories`, and computed prediction state rather than stored UI state.

## Layers

**Presentation layer:**
- Purpose: Render tab pages, forms, lists, and calendar cells.
- Location: `pages/**`
- Contains: `Page({ data, onLoad/onShow, event handlers })`, page-specific navigation, modal/toast interactions.
- Depends on: `utils/cloud.js`, `utils/util.js`, `utils/cycle.js`, `wx.*` APIs.
- Used by: Users through `app.json` page routing and tab bar.

**Shared client layer:**
- Purpose: Normalize data access and shared date logic.
- Location: `utils/cloud.js`, `utils/util.js`, `utils/cycle.js`
- Contains: room-code storage lookup, cloud-function wrappers, calendar/date helpers, cycle prediction helpers, period metadata helpers.
- Depends on: `wx.cloud`, `wx.getStorageSync`, `wx.setStorageSync`.
- Used by: `pages/index/index.js`, `pages/period/*`, `pages/memory/*`, `pages/settings/settings.js`, `pages/bind/bind.js`.

**Cloud function layer:**
- Purpose: Resolve user identity, room membership, and data persistence.
- Location: `cloudfunctions/*/index.js`
- Contains: room creation/join lookup, shared record CRUD, identity lookup.
- Depends on: `wx-server-sdk`, WeChat cloud context, cloud database collections.
- Used by: `utils/cloud.js` and direct `wx.cloud.callFunction` calls in bind/settings pages.

**Storage layer:**
- Purpose: Persist shared state and user pairing data.
- Location: Cloud database collections `rooms`, `periods`, `memories`
- Contains: shared room metadata, period entries, memory entries.
- Depends on: cloud function permission checks.
- Used by: `cloudfunctions/dataOp/index.js`, `createRoom/index.js`, `joinRoom/index.js`, `getMyRoom/index.js`.

## Data Flow

### Primary Request Path

1. User opens a tab page declared in `app.json`, usually `pages/index/index`.
2. `pages/index/index.js` reads `roomCode` through `utils/cloud.js` and loads `periods` and `memories` with `cloud.getPeriods()` / `cloud.getMemories()`.
3. `utils/cloud.js` calls `cloudfunctions/dataOp/index.js` with `wx.cloud.callFunction`.
4. `cloudfunctions/dataOp/index.js` validates that the caller belongs to the room before reading or mutating `rooms`, `periods`, or `memories`.
5. Returned records are transformed with `utils/util.js` and `utils/cycle.js` helpers into calendar days, cycle stats, prediction ranges, reminders, and period labels.

### Room Binding Flow

1. User enters `pages/bind/bind` when no local room code exists or when pairing is needed.
2. `pages/bind/bind.js` calls `createRoom`, `joinRoom`, or `getMyRoom` directly with `wx.cloud.callFunction`.
3. Successful results are stored in local storage under `roomCode`.
4. `utils/cloud.js` later reuses that local code to scope all record access.

### Record Editing Flow

1. List pages navigate to `pages/period/edit/edit` or `pages/memory/edit/edit` with query parameters.
2. Edit pages hydrate from `onLoad(options)` and keep edit/create mode in page `data`.
3. Save actions calculate derived values locally, then call `cloud.addPeriod`, `cloud.updatePeriod`, `cloud.addMemory`, or `cloud.updateMemory`.
4. Delete actions call the matching remove helper and navigate back on success.

**State Management:**
- Shared state is stored either in local storage (`roomCode`) or in cloud database collections.
- UI state remains page-local in `data`.
- Calendar output is regenerated from source records on each load rather than maintained as a separate persisted model.

## Key Abstractions

**Room code:**
- Purpose: Shared access token linking two users to one room.
- Examples: `pages/bind/bind.js`, `utils/cloud.js`, `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`
- Pattern: Stored locally in `wx` storage and verified against cloud `rooms` documents on the server.

**Record collection gateway:**
- Purpose: One entry point for shared CRUD operations on `periods` and `memories`.
- Examples: `utils/cloud.js`, `cloudfunctions/dataOp/index.js`
- Pattern: Action-based API with `list`, `add`, `update`, `remove`.

**Calendar derivation helpers:**
- Purpose: Convert persisted records into day-grid UI state.
- Examples: `utils/util.js`, `pages/index/index.js`
- Pattern: Pure helper functions compute month grid, lunar/holiday metadata, and prediction labels.

**Cycle model helpers:**
- Purpose: Convert period records into prediction ranges, confidence, reminder states, and display labels for flow/symptom metadata.
- Examples: `utils/cycle.js`, `pages/index/index.js`, `pages/period/*`
- Pattern: Keep health-adjacent math and labels in pure functions, then let pages render the resulting view model.

## Entry Points

**App launch:**
- Location: `app.js`
- Triggers: Mini program startup.
- Responsibilities: Initialize `wx.cloud`, record status bar height in `globalData`.

**Tab routing:**
- Location: `app.json`
- Triggers: Mini program page navigation and tab bar selection.
- Responsibilities: Declare visible entry pages and custom window styles.

**Home calendar page:**
- Location: `pages/index/index.js`
- Triggers: App tab selection, `onShow`, month navigation, day taps.
- Responsibilities: Load data, compute stats, render calendar, route to edit/bind flows.

**Cloud CRUD gateway:**
- Location: `cloudfunctions/dataOp/index.js`
- Triggers: `wx.cloud.callFunction({ name: 'dataOp' })`.
- Responsibilities: Validate room membership and execute collection operations.

## Architectural Constraints

- **Threading:** Client logic is event-driven and single-threaded inside each mini program page; async work is promise-based cloud calls.
- **Global state:** Only `App.globalData.statusBarHeight` is shared at the app level in `app.js`.
- **Cross-page coupling:** Pages depend on `roomCode` being present in local storage; missing it forces bind flow.
- **Data isolation:** All shared data access must pass through room validation in `cloudfunctions/dataOp/index.js`; direct collection access from the client is not used.
- **Lazy loading:** `app.json` enables `lazyCodeLoading: "requiredComponents"`, so page/module boundaries should stay clean.

## Anti-Patterns

### Bypassing the shared cloud gateway

**What happens:** A page or helper calls the database directly instead of going through `utils/cloud.js` and `cloudfunctions/dataOp/index.js`.
**Why it's wrong:** It bypasses room checks and makes shared access rules inconsistent.
**Do this instead:** Route record reads/writes through `utils/cloud.js` and keep validation in `cloudfunctions/dataOp/index.js`.

### Treating computed calendar state as persisted state

**What happens:** A page stores derived calendar cells, statistics, or predictions as if they were source data.
**Why it's wrong:** It duplicates logic and risks stale UI when records change.
**Do this instead:** Recompute with `utils/util.js` and `utils/cycle.js` in page controllers from `periods` and `memories`.

## Error Handling

**Strategy:** Fail locally with toast/modal feedback and return structured `{ code, msg }` from cloud functions.

**Patterns:**
- Page methods catch promise failures and surface `wx.showToast` or `wx.showModal`.
- Cloud functions return explicit negative codes for auth, validation, and room-state failures.

## Cross-Cutting Concerns

**Logging:** `console.error` on page load failures and cloud fallback paths.
**Validation:** Date-order checks in edit pages; room-code length checks in `pages/bind/bind.js`; collection whitelist and membership checks in `cloudfunctions/dataOp/index.js`.
**Authentication:** Identity comes from `cloud.getWXContext().OPENID`; user access is derived from room membership, not from a separate client-side auth layer.

---

*Architecture analysis: 2026-06-24*
