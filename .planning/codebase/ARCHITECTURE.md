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
│ `utils/room.js`, `utils/cloud.js`, `utils/recordCommands.js`,│
│ `utils/settingsFlow.js`, `utils/homeCalendarState.js`,      │
│ `utils/util.js`, `utils/cycle.js`, `utils/calendarInsights.js` │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                Cloud Functions / Cloud DB layer             │
│ `cloudfunctions/createRoom/*`, `joinRoom/*`, `getMyRoom/*`, │
│ `leaveRoom/*`, `login/*`, `dataOp/*`, `dataOpHandler.js`    │
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
| Shared client API | Wraps cloud function calls, active-room recovery, and room-scoped outcome handling | `utils/cloud.js` |
| Record flow helpers | Own shared save/delete/list feedback plus retry and rebind prompts for record pages | `utils/recordCommands.js` |
| Settings flow helper | Owns room-code copy, export branching, retry/rebind prompts, and local-only clear flow | `utils/settingsFlow.js` |
| Homepage state builder | Composes prediction, reminders, calendar days, day-detail payloads, and monthly recap | `utils/homeCalendarState.js` |
| Date / calendar logic | Formats dates, computes holiday/lunar metadata, builds calendar grid | `utils/util.js`, `utils/chinaHolidays.js` |
| Cycle model logic | Predicts cycle ranges, reminders, and period metadata labels | `utils/cycle.js` |
| Calendar insight logic | Explains calendar markers, prediction math, day meanings, and monthly recap copy | `utils/calendarInsights.js` |
| Backend CRUD gateway | Validates access and performs CRUD on records | `cloudfunctions/dataOp/index.js` |
| Backend CRUD authorization seam | Owns room membership lookup and action dispatch behind the deployed adapter | `cloudfunctions/dataOp/dataOpHandler.js` |
| Room record rules | Validates, normalizes, sorts, and mutates Room-scoped period/memory records | `cloudfunctions/dataOp/roomRecords.js` |
| Room lifecycle rules | Revokes current-user Room membership, transfers remaining ownership, and deletes empty Rooms | `cloudfunctions/leaveRoom/roomLifecycle.js` |

## Pattern Overview

**Overall:** Client-heavy WeChat mini program with thin page controllers and a centralized cloud-function data gateway.

**Key Characteristics:**
- Pages own presentation and user interaction; business state stays in page `data` and methods.
- `utils/room.js` centralizes client-side Room session/cache behavior; `utils/cloud.js#createRoomDataClient()` is the shared room-scoped data seam for record and export flows.
- `utils/recordCommands.js` and `utils/settingsFlow.js` keep retry, rebind, and success feedback in shared helpers so record/settings pages stay thin.
- `utils/homeCalendarState.js` keeps homepage prediction, calendar-grid, day-detail, and monthly recap composition in one pure module.
- `utils/calendarInsights.js` keeps explanation/monthly recap copy as pure presentation derivation outside the page controller.
- `cloudfunctions/dataOp/dataOpHandler.js` keeps room authorization and action dispatch separate from cloud runtime wiring in `index.js`.
- Cloud functions enforce room-level access before touching shared records and own server-side Room membership changes.
- Calendar rendering is derived from `periods`, `memories`, and computed prediction state rather than stored UI state.

## Layers

**Presentation layer:**
- Purpose: Render tab pages, forms, lists, and calendar cells.
- Location: `pages/**`
- Contains: `Page({ data, onLoad/onShow, event handlers })`, page-specific navigation, modal/toast interactions.
- Depends on: `utils/cloud.js`, `utils/recordCommands.js`, `utils/settingsFlow.js`, `utils/homeCalendarState.js`, `utils/util.js`, `utils/cycle.js`, `wx.*` APIs.
- Used by: Users through `app.json` page routing and tab bar.

**Shared client layer:**
- Purpose: Normalize data access and shared date logic.
- Location: `utils/room.js`, `utils/cloud.js`, `utils/recordCommands.js`, `utils/settingsFlow.js`, `utils/homeCalendarState.js`, `utils/util.js`, `utils/cycle.js`
- Contains: room-code cache/session lookup, room-scoped data outcomes, shared record/settings feedback flows, homepage view-model composition, calendar/date helpers, published holiday data, cycle prediction helpers, period metadata helpers.
- Depends on: `wx.cloud`, `wx.getStorageSync`, `wx.setStorageSync`.
- Used by: `pages/index/index.js`, `pages/period/*`, `pages/memory/*`, `pages/settings/settings.js`, `pages/bind/bind.js`.

**Cloud function layer:**
- Purpose: Resolve user identity, room membership, and data persistence.
- Location: `cloudfunctions/*/index.js`
- Contains: room creation/join/leave lookup, shared record CRUD, identity lookup, and the `dataOp` authorization seam in `cloudfunctions/dataOp/dataOpHandler.js`.
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
2. `pages/index/index.js` reads the active room through `utils/cloud.js`, which delegates room lookup and repair to `utils/room.js`, then loads `periods` and `memories`.
3. `utils/cloud.js` legacy wrappers or `createRoomDataClient()` call `cloudfunctions/dataOp/index.js` with `wx.cloud.callFunction`.
4. `cloudfunctions/dataOp/index.js` delegates room membership lookup and action dispatch to `cloudfunctions/dataOp/dataOpHandler.js`.
5. `cloudfunctions/dataOp/dataOpHandler.js` validates that the caller belongs to the room before reading or mutating `rooms`, `periods`, or `memories`.
6. `cloudfunctions/dataOp/roomRecords.js` validates and normalizes Period record / Memory record payloads before writes.
7. Returned records are transformed with `utils/homeCalendarState.js`, `utils/util.js`, `utils/chinaHolidays.js`, `utils/cycle.js`, and `utils/calendarInsights.js` into calendar days, lunar/holiday labels, cycle stats, prediction ranges, reminders, day meanings, and monthly recap text.

### Room Binding Flow

1. User enters `pages/bind/bind` when no local room code exists or when pairing is needed.
2. `pages/bind/bind.js` calls the `utils/room.js` RoomSession Interface for `createRoom`, `joinRoom`, `getActiveRoom`, `repairCachedRoom`, and `leaveRoom`.
3. Successful create/join/recovery results are cached in local storage under `roomCode` by the RoomSession Module, and stale-room checks can refresh or clear that cache through `repairCachedRoom()`.
4. Successful leave results revoke the server-side membership first, then clear local storage.
5. `utils/cloud.js` later reuses that cached code through the same RoomSession Interface to scope all record access.

### Record Editing Flow

1. Period and memory list pages load shared room-scoped data through `createRoomDataClient()` and `utils/recordCommands.js#runRecordListLoad()`.
2. List pages navigate to `pages/period/edit/edit` or `pages/memory/edit/edit` with query parameters.
3. Edit pages hydrate from `onLoad(options)` and keep edit/create mode in page `data`.
4. Save actions calculate derived values locally, then delegate shared loading, retry, and rebind behavior to `runRecordSave()` while calling `cloud.addPeriod`, `cloud.updatePeriod`, `cloud.addMemory`, or `cloud.updateMemory`.
5. Delete actions go through `runRecordDelete()` so confirmation, retry, and navigation behavior stay consistent.

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

**RoomDataClient:**
- Purpose: Normalize room-scoped list/add/update/remove outcomes, including retryable failures and stale-room repair.
- Examples: `utils/cloud.js`, `tests/room-data-client.test.js`, `pages/period/period.js`, `pages/memory/memory.js`, `pages/settings/settings.js`
- Pattern: `createRoomDataClient()` returns `success`, `retryable-failure`, `room-repair`, `business-failure`, and `no-room` outcomes while keeping legacy `utils/cloud.js` exports compatible.

**Record command helpers:**
- Purpose: Share record save/delete/list feedback, loading-state cleanup, retry prompts, and bind navigation across period and memory pages.
- Examples: `utils/recordCommands.js`, `tests/record-flow.test.js`, `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`, `pages/period/period.js`, `pages/memory/memory.js`
- Pattern: Pages keep validation, payload building, and list decoration while the helper owns feedback-heavy branches.

**Settings flow helper:**
- Purpose: Share room-code copy, export, retry/rebind prompts, and local-only clear behavior for the settings page.
- Examples: `utils/settingsFlow.js`, `tests/settings-flow.test.js`, `pages/settings/settings.js`
- Pattern: The helper owns clipboard/share/file branching and export failure recovery while the page keeps modal wording and visible room-code sync.

**Home calendar state builder:**
- Purpose: Keep homepage prediction, reminder, day-grid, day-detail, and monthly recap derivation in one pure seam.
- Examples: `utils/homeCalendarState.js`, `tests/home-calendar-state.test.js`, `pages/index/index.js`
- Pattern: `buildHomeCalendarState()` returns serializable view data, including `dayDetailsByDate`, while `pages/index/index.js` stays the WeChat adapter.

**Room-scoped record rules:**
- Purpose: Keep Period record / Memory record field allowlists, date validation, duration calculation, sorting, and ownership checks behind the cloud-function seam.
- Examples: `cloudfunctions/dataOp/roomRecords.js`, `tests/room-records.test.js`
- Pattern: `dataOp` acts as the WeChat adapter; `RoomRecords` is tested through its `list/add/update/remove` interface with a fake database adapter.

**dataOp authorization handler:**
- Purpose: Keep room membership lookup and action dispatch testable without `wx-server-sdk`.
- Examples: `cloudfunctions/dataOp/dataOpHandler.js`, `tests/data-op-auth.test.js`, `cloudfunctions/dataOp/index.js`
- Pattern: `index.js` owns cloud runtime wiring; `createDataOpHandler()` owns room authorization, collection allowlists, and dispatch to `RoomRecords`.

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
- Responsibilities: Load data, delegate derived-state composition to `buildHomeCalendarState()`, render calendar, and route to edit/bind flows.

**Cloud CRUD gateway:**
- Location: `cloudfunctions/dataOp/index.js`
- Triggers: `wx.cloud.callFunction({ name: 'dataOp' })`.
- Responsibilities: Initialize `wx-server-sdk`, create `RoomRecords`, and delegate room membership checks plus action dispatch to `createDataOpHandler()`.

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
- `createRoomDataClient()` returns normalized `success`, `retryable-failure`, `room-repair`, `business-failure`, and `no-room` outcomes instead of flattening everything to thrown errors.
- `recordCommands` and `settingsFlow` surface retry or rebind prompts inside the shared helper seam so pages do not silently drop recovery actions.
- Cloud functions return explicit negative codes for auth, validation, unknown-action, and room-state failures.

## Cross-Cutting Concerns

**Logging:** `console.error` on page load failures and cloud fallback paths.
**Validation:** Date-order checks in edit pages; room-code normalization and length checks in `utils/room.js`; room-scoped outcome classification in `utils/cloud.js`; collection whitelist and membership checks in `cloudfunctions/dataOp/dataOpHandler.js`; server-side Period record / Memory record shape validation in `cloudfunctions/dataOp/roomRecords.js`; server-side Room leave rules in `cloudfunctions/leaveRoom/roomLifecycle.js`.
**Authentication:** Identity comes from `cloud.getWXContext().OPENID`; user access is derived from room membership, not from a separate client-side auth layer.

---

*Architecture analysis: 2026-06-26*
