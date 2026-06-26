# Architecture

**Analysis Date:** 2026-06-26

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
│ `utils/room.js`, `utils/cloud.js`, `utils/util.js`,         │
│ `utils/cycle.js`, `utils/calendarInsights.js`               │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                Cloud Functions / Cloud DB layer             │
│ `cloudfunctions/createRoom/*`, `joinRoom/*`, `getMyRoom/*`, │
│ `leaveRoom/*`, `login/*`, `dataOp/*`                        │
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
| Room session | Owns room-code cache, recovery, create/join calls, and local clear behavior | `utils/room.js` |
| Shared client API | Wraps cloud function calls and local room-code access | `utils/cloud.js` |
| Date / calendar logic | Formats dates, computes holiday/lunar metadata, builds calendar grid | `utils/util.js`, `utils/chinaHolidays.js` |
| Cycle model logic | Predicts cycle ranges, reminders, and period metadata labels | `utils/cycle.js` |
| Calendar insight logic | Explains calendar markers, prediction math, day meanings, and monthly recap copy | `utils/calendarInsights.js` |
| Backend CRUD gateway | Validates access and performs CRUD on records | `cloudfunctions/dataOp/index.js` |
| Room record rules | Validates, normalizes, sorts, and mutates Room-scoped period/memory records | `cloudfunctions/dataOp/roomRecords.js` |
| Room lifecycle rules | Revokes current-user Room membership, transfers remaining ownership, and deletes empty Rooms | `cloudfunctions/leaveRoom/roomLifecycle.js` |

## Pattern Overview

**Overall:** Client-heavy WeChat mini program with thin page controllers and a centralized cloud-function data gateway.

**Key Characteristics:**
- Pages own presentation and user interaction; business state stays in page `data` and methods.
- `utils/room.js` centralizes client-side Room session/cache behavior; `utils/cloud.js` is the only client-side path for record mutations and list reads.
- `utils/calendarInsights.js` keeps explanation/monthly recap copy as pure presentation derivation outside the page controller.
- Cloud functions enforce room-level access before touching shared records and own server-side Room membership changes.
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
- Location: `utils/room.js`, `utils/cloud.js`, `utils/util.js`, `utils/cycle.js`
- Contains: room-code cache/session lookup, cloud-function wrappers, calendar/date helpers, published holiday data, cycle prediction helpers, period metadata helpers.
- Depends on: `wx.cloud`, `wx.getStorageSync`, `wx.setStorageSync`.
- Used by: `pages/index/index.js`, `pages/period/*`, `pages/memory/*`, `pages/settings/settings.js`, `pages/bind/bind.js`.

**Cloud function layer:**
- Purpose: Resolve user identity, room membership, and data persistence.
- Location: `cloudfunctions/*/index.js`
- Contains: room creation/join/leave lookup, shared record CRUD, identity lookup.
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
2. `pages/index/index.js` reads `roomCode` through `utils/cloud.js`, which delegates room-code lookup to `utils/room.js`, and loads `periods` and `memories` with `cloud.getPeriods()` / `cloud.getMemories()`.
3. `utils/cloud.js` calls `cloudfunctions/dataOp/index.js` with `wx.cloud.callFunction`.
4. `cloudfunctions/dataOp/index.js` validates that the caller belongs to the room before reading or mutating `rooms`, `periods`, or `memories`.
5. `cloudfunctions/dataOp/roomRecords.js` validates and normalizes Period record / Memory record payloads before writes.
6. Returned records are transformed with `utils/util.js`, `utils/chinaHolidays.js`, and `utils/cycle.js` helpers into calendar days, lunar/holiday labels, cycle stats, prediction ranges, reminders, and period labels.
7. `utils/calendarInsights.js` translates those derived records and prediction objects into legend rows, prediction explanation lines, day marker reasons, and monthly recap text.

### Room Binding Flow

1. User enters `pages/bind/bind` when no local room code exists or when pairing is needed.
2. `pages/bind/bind.js` calls the `utils/room.js` RoomSession Interface for `createRoom`, `joinRoom`, `getActiveRoom`, and `leaveRoom`.
3. Successful create/join/recovery results are cached in local storage under `roomCode` by the RoomSession Module.
4. Successful leave results revoke the server-side membership first, then clear local storage.
5. `utils/cloud.js` later reuses that cached code through the same RoomSession Interface to scope all record access.

### Record Editing Flow

1. List pages navigate to `pages/period/edit/edit` or `pages/memory/edit/edit` with query parameters.
2. Edit pages hydrate from `onLoad(options)` and keep edit/create mode in page `data`.
3. Save actions calculate derived values locally, then call `cloud.addPeriod`, `cloud.updatePeriod`, `cloud.addMemory`, or `cloud.updateMemory`.
4. Delete actions call the matching remove helper and navigate back on success.

**State Management:**
- Shared state is stored either in local storage (`roomCode`, mediated by `utils/room.js`) or in cloud database collections.
- UI state remains page-local in `data`.
- Calendar output is regenerated from source records on each load rather than maintained as a separate persisted model.

## Key Abstractions

**Room code:**
- Purpose: Shared access token linking two users to one room.
- Examples: `utils/room.js`, `pages/bind/bind.js`, `utils/cloud.js`, `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`
- Pattern: Stored locally in `wx` storage through the RoomSession Module and verified against cloud `rooms` documents on the server.

**Room session:**
- Purpose: Keep room-code cache, cloud recovery, create/join, server-side leave, and local clear operations behind one client-side Interface.
- Examples: `utils/room.js`, `tests/room-session.test.js`
- Pattern: Pages call RoomSession; tests inject storage and cloud adapters; production uses `wx` storage and `wx.cloud`.

**Room lifecycle:**
- Purpose: Keep server-side membership revoke/unpair rules out of page code and cloud-function adapters.
- Examples: `cloudfunctions/leaveRoom/roomLifecycle.js`, `tests/room-lifecycle.test.js`, `docs/adr/0001-room-leave-ownership-transfer.md`
- Pattern: `leaveRoom` acts as the WeChat adapter; `RoomLifecycle` transfers ownership to the remaining partner or deletes empty Rooms through a tested Interface.

**Record collection gateway:**
- Purpose: One entry point for shared CRUD operations on `periods` and `memories`.
- Examples: `utils/cloud.js`, `cloudfunctions/dataOp/index.js`
- Pattern: Action-based API with `list`, `add`, `update`, `remove`.

**Room-scoped record rules:**
- Purpose: Keep Period record / Memory record field allowlists, date validation, duration calculation, sorting, and ownership checks behind the cloud-function seam.
- Examples: `cloudfunctions/dataOp/roomRecords.js`, `tests/room-records.test.js`
- Pattern: `dataOp` acts as the WeChat adapter; `RoomRecords` is tested through its `list/add/update/remove` interface with a fake database adapter.

**Calendar derivation helpers:**
- Purpose: Convert persisted records into day-grid UI state.
- Examples: `utils/util.js`, `utils/chinaHolidays.js`, `pages/index/index.js`
- Pattern: Pure helper functions compute month grid, lunar/holiday metadata, and calendar marker flags.

**Cycle model helpers:**
- Purpose: Convert period records into prediction ranges, confidence, reminder states, and display labels for flow/symptom metadata.
- Examples: `utils/cycle.js`, `pages/index/index.js`, `pages/period/*`
- Pattern: Keep health-adjacent math and labels in pure functions, then let pages render the resulting view model.

**Calendar insight helpers:**
- Purpose: Keep user-facing explanation text and monthly recap summaries testable outside page code.
- Examples: `utils/calendarInsights.js`, `tests/calendar-insights.test.js`, `pages/index/index.js`
- Pattern: Pure helpers consume existing calendar day flags, prediction objects, periods, and memories; the homepage renders returned display models.

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

**Cloud Room leave gateway:**
- Location: `cloudfunctions/leaveRoom/index.js`
- Triggers: `wx.cloud.callFunction({ name: 'leaveRoom' })`.
- Responsibilities: Resolve `OPENID` and call `RoomLifecycle.leave`.

## Architectural Constraints

- **Threading:** Client logic is event-driven and single-threaded inside each mini program page; async work is promise-based cloud calls.
- **Global state:** Only `App.globalData.statusBarHeight` is shared at the app level in `app.js`.
- **Cross-page coupling:** Pages depend on the RoomSession Interface for the cached `roomCode`; missing it forces bind flow or cloud recovery.
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
**Validation:** Date-order checks in edit pages; room-code normalization and length checks in `utils/room.js`; collection whitelist and membership checks in `cloudfunctions/dataOp/index.js`; server-side Period record / Memory record shape validation in `cloudfunctions/dataOp/roomRecords.js`; server-side Room leave rules in `cloudfunctions/leaveRoom/roomLifecycle.js`.
**Authentication:** Identity comes from `cloud.getWXContext().OPENID`; user access is derived from room membership, not from a separate client-side auth layer.

---

*Architecture analysis: 2026-06-26*
