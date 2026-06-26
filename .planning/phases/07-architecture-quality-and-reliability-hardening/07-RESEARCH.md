# Phase 07: Architecture Quality and Reliability Hardening - Research

**Researched:** 2026-06-26
**Domain:** WeChat Mini Program architecture hardening, client/cloud reliability seams, and lightweight Node-based verification [VERIFIED: codebase grep]
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- Full WeChat DevTools/true-device visual signoff remains a release/manual validation activity.
- Screenshot-based homepage regression is conditional on selecting a suitable mini program runner; this phase should prefer lower-cost page/flow harness tests unless a runner is already available and practical.
- New product features such as richer export formats, multi-room support, medical prediction, or social sharing are out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | App can surface retry actions for cloud timeout or network failures. [VERIFIED: codebase grep] | Shared `RoomDataClient` outcome model, retry token/callback pattern, and page command helpers keep retry logic out of page-local `catch` blocks. [VERIFIED: codebase grep] |
| REL-02 | App can detect and repair stale local room codes more explicitly. [VERIFIED: codebase grep] | Extend `RoomSession` with verify/repair semantics and have the cloud seam classify stale-room outcomes separately from transport failures. [VERIFIED: codebase grep] |
| REC-01 | User can create, edit, and delete period records with start/end date validation. [VERIFIED: codebase grep] | Extract shared save/delete command helpers so validation, loading flags, success toasts, and retry/repair handling stay consistent. [VERIFIED: codebase grep] |
| REC-02 | User can create, edit, and delete memory records for a selected date. [VERIFIED: codebase grep] | Mirror the period command-helper pattern for memory edit/delete flows and add Node harness coverage. [VERIFIED: codebase grep] |
| REC-03 | User can review record lists with dates, notes, and durations where relevant. [VERIFIED: codebase grep] | Centralize list-loading states and failure handling so period/memory pages expose comparable UX and automated tests. [VERIFIED: codebase grep] |
| SET-01 | User can copy the current room code from settings. [VERIFIED: codebase grep] | Keep copy flow explicit about bound/unbound state and test it through a page adapter helper instead of raw page methods only. [VERIFIED: codebase grep] |
| SET-02 | User can export period and memory data as JSON or clipboard fallback. [VERIFIED: codebase grep] | Preserve JSON/share/clipboard behavior but extract export flow branching around file write, share failure, and clipboard fallback. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html] |
| TEST-01 | Cloud-function access control has automated tests or a local harness. [VERIFIED: codebase grep] | Keep `RoomRecords` as the server-side authority and add adapter/harness coverage around page-facing cloud seams instead of adding a heavy runner first. [VERIFIED: codebase grep] |
| QUAL-01 | Date and calendar metadata logic has automated tests for prediction display, lunar dates, official holidays, and marker semantics. [VERIFIED: codebase grep] | Preserve existing pure-helper coverage and move homepage state composition into an equally testable pure module. [VERIFIED: codebase grep] |
| QUAL-02 | JavaScript files touched by behavior changes pass syntax checks. [VERIFIED: codebase grep] | Planner should keep syntax-check tasks per touched page/util/cloud file in each wave because the repo uses `node --check` rather than lint tooling. [VERIFIED: codebase grep] |
| QUAL-03 | Codebase map and project context stay updated after significant structure or domain changes. [VERIFIED: codebase grep] | Final wave must include `.planning/codebase/*`, `STATE.md`, and phase artifact refresh as part of the architecture audit closeout. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 7 is not a library-selection phase; it is a seam-deepening phase. The current repo already has the right raw ingredients: `RoomSession` in `utils/room.js`, pure calendar/cycle/insight helpers, server-side `RoomRecords`, and a Node-native test stack. The main problem is that several page flows still talk to shallow wrappers or inline `wx.*` UX branches directly, so transport errors, stale-room repair, success toasts, navigation, and export fallbacks are inconsistent and difficult to verify without manual tapping. [VERIFIED: codebase grep]

The most important planning move is to treat `utils/cloud.js` as the first hardening target. Today it returns raw `wx.cloud.callFunction` responses for mutations, returns empty arrays on missing room code, and only wraps list reads with a timeout. That means pages must infer their own semantics for network failure, business failure, and stale-room failure, which is exactly why Phase 7 exists. A shared client seam should classify outcomes once, then let period/memory/settings/index pages consume that model through small command helpers. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html]

Homepage work should come third, not first. `pages/index/index.js` already has pure dependencies for prediction and marker explanation; the remaining problem is that `loadData()`, `calcStats()`, and `renderCalendar()` still spread the view-model contract across page state mutations. Extracting a pure home-calendar state builder after reliability and record/settings helpers are in place gives the planner a smaller blast radius and better preservation checks for CAL-01/CAL-05/CAL-06/CAL-09/CAL-10 behavior. [VERIFIED: codebase grep]

**Primary recommendation:** Plan Phase 7 as four waves in the order already preferred by context: `RoomDataClient` plus stale repair, record/settings command helpers, homepage view-model extraction, then harness expansion plus final architecture audit. [VERIFIED: codebase grep]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cloud operation outcome classification (`success` / `retryable` / `stale-room` / `business-fail`) | Browser / Client | API / Backend | `wx.cloud.callFunction` only guarantees transport-level success plus returned `result`, so the client must normalize user-facing outcomes while the backend remains the source of membership/business truth. [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html] |
| Room membership authorization | API / Backend | Database / Storage | `cloudfunctions/dataOp/index.js` is already the room-membership gate and must stay authoritative for shared record access. [VERIFIED: codebase grep] |
| Stale local `roomCode` verification and repair | Browser / Client | API / Backend | Local storage is only a cache; repair must start client-side through `RoomSession` and confirm against cloud state before redirecting to bind. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html] |
| Record/settings save-delete-export feedback flows | Browser / Client | API / Backend | Validation, toasts, loading flags, navigation, clipboard, and share branching are page/client concerns layered over existing server-side record rules. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html] |
| Homepage calendar state composition | Browser / Client | — | Prediction, day markers, legend, and monthly recap are all derived view state built from existing pure helpers and current records. [VERIFIED: codebase grep] |
| Shared record validation and normalization | API / Backend | Database / Storage | `RoomRecords` already computes safe server-side period/memory payloads and should remain the one write-normalization owner. [VERIFIED: codebase grep] |
| Lightweight page/flow harness coverage | Browser / Client | API / Backend | The harness should target page adapters and client flows with fake `wx`/cloud collaborators while preserving existing server-side unit coverage. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/test.html] |

## Project Constraints (from AGENTS.md)

- Use GSD Core artifacts as the durable workflow for non-trivial work, and keep phase planning grounded in `.planning/PROJECT.md`, `.planning/STATE.md`, and relevant `.planning/codebase/*.md` files. [VERIFIED: codebase grep]
- Keep user-facing explanations in Simplified Chinese, but preserve code identifiers, commands, APIs, and paths in original form. [VERIFIED: codebase grep]
- Do not introduce frontend npm dependencies or rely on bundled root `node_modules`; `project.config.json` has `nodeModules: false` and the repo standard is plain CommonJS plus WeChat runtime APIs. [VERIFIED: codebase grep]
- Keep calendar marker semantics explicit: today, period, memory, prediction, holiday, and workday signals must not collapse into one meaning. [VERIFIED: codebase grep]
- Keep room authorization server-side in cloud functions; do not move shared-record trust to client-only checks. [VERIFIED: codebase grep]
- Bind-page unbind must continue to call server-side `leaveRoom`; settings local clear must remain local-only. [VERIFIED: codebase grep]
- Use TDD for behavior changes or new pure modules; `.planning/config.json` has `workflow.tdd_mode: true` and Phase 7 context locks this behavior in. [VERIFIED: codebase grep]
- Treat WeChat DevTools visual checks as release evidence rather than the primary automated verification mechanism for this phase. [VERIFIED: codebase grep]
- Avoid editing ignored dependencies or generated maintenance files unless the phase explicitly requires it. [VERIFIED: codebase grep]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WeChat Mini Program runtime | Base library `3.16.1` from `project.config.json` [VERIFIED: codebase grep] | Page lifecycle, `wx.*` APIs, storage, clipboard, file share, and navigation. [VERIFIED: codebase grep] | The entire app is already a WeChat Mini Program and Phase 7 must deepen seams inside that runtime rather than abstract over it. [VERIFIED: codebase grep] |
| WeChat Cloud Functions + `wx.cloud.callFunction` | Current repo contract, no new abstraction layer [VERIFIED: codebase grep] | Client-to-cloud operation transport for records and room lifecycle. [VERIFIED: codebase grep] | Official docs confirm Promise-based `callFunction` with `result` and `requestID`, which matches the repo’s existing call style and supports explicit outcome classification. [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html] |
| `wx-server-sdk` | Lockfiles currently resolve `3.0.4` [VERIFIED: codebase grep] | Existing cloud-function SDK dependency. [VERIFIED: codebase grep] | It is already the deployed cloud-function dependency, but legitimacy tooling flags it `SUS` because the npm package exposes no repository metadata, so Phase 7 should avoid unnecessary dependency churn and gate any re-install/pin action with human verification. [VERIFIED: gsd-tools package-legitimacy] |
| Node built-in `node:test` + `node:assert/strict` | Local environment `v24.15.0` [VERIFIED: local command] | Lightweight unit, harness, subtest, and mock coverage without adding a test framework. [VERIFIED: local command] | Official Node docs show stable support for tests, subtests, and mocks, which is enough for page adapters and pure flow modules in this repo. [CITED: https://nodejs.org/api/test.html] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wx.getStorageSync` / `wx.setStorageSync` | Current platform API [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html] | Persist the local `roomCode` cache and homepage density preference. [VERIFIED: codebase grep] | Use only for persistence boundaries; official docs warn not to turn sync storage into runtime state management. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html] |
| `wx.shareFileMessage` | Current platform API [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html] | Share exported JSON when a local file path exists. [VERIFIED: codebase grep] | Use as the first export path because the existing product contract keeps JSON export plus share/clipboard fallback. [VERIFIED: codebase grep] |
| `wx.setClipboardData` | Current platform API [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/device/clipboard/wx.setClipboardData.html] | Fallback for copy-room-code and export-copy behavior. [VERIFIED: codebase grep] | Use after share failure or when copying short text, while keeping cloud-vs-local messaging explicit. [VERIFIED: codebase grep] |
| `FileSystemManager.writeFileSync` | Current platform API [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.writeFileSync.html] | Local export-file creation under `wx.env.USER_DATA_PATH`. [VERIFIED: codebase grep] | Use inside an export helper that distinguishes file-write failure from share failure and clipboard fallback. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.writeFileSync.html] |
| WeChat DevTools CLI | Local install detected at `D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` [VERIFIED: local command] | Optional preview/build/manual verification support. [VERIFIED: local command] | Use only for manual/release evidence or future automation spikes, not as the first answer to Phase 7 verification. [VERIFIED: codebase grep] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:test` harnesses over pure modules and thin page adapters | Jest or a dedicated mini-program runner | Extra dependency and runtime indirection would slow this phase before the repo has exhausted its existing Node-native test seam. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/test.html] |
| Shared `RoomDataClient` plus command helpers | Keep page-local `try/catch` and toast branching | That preserves today’s duplication across period/memory/settings/index flows and keeps REL-01/REL-02 largely manual to verify. [VERIFIED: codebase grep] |
| JSON export with share/clipboard fallback | New CSV/XLSX/binary export format | Out of scope by locked decision D-05 and adds product/design surface instead of reliability. [VERIFIED: codebase grep] |
| Lightweight flow-module tests | Screenshot regression runner now | Context explicitly says screenshot regression is conditional and should come later unless a practical runner already exists. [VERIFIED: codebase grep] |

**Installation:**
```bash
# No new runtime packages are recommended for Phase 07.
# If a cloud-function dependency refresh is intentionally planned,
# gate it with human verification before reinstalling the existing SDK:
npm install wx-server-sdk@3.0.4
```

**Version verification:** `node --version` returned `v24.15.0`, `npm --version` returned `11.12.1`, `project.config.json` reports base library `3.16.1`, `npm view wx-server-sdk version time --json` reports registry version `3.0.4` with publish date `2026-02-06`, and repo lockfiles already resolve `wx-server-sdk` to `3.0.4`. [VERIFIED: local command] [VERIFIED: codebase grep]

## Package Legitimacy Audit

> No new package installation is required by the recommended Phase 7 plan, but the existing cloud-function dependency was audited because it may be reinstalled or pinned during maintenance. [VERIFIED: codebase grep]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `wx-server-sdk` | npm [VERIFIED: gsd-tools package-legitimacy] | Since 2018-08-08 [VERIFIED: local command] | 16,501 weekly downloads at audit time [VERIFIED: gsd-tools package-legitimacy] | none exposed in registry metadata [VERIFIED: gsd-tools package-legitimacy] | `SUS` [VERIFIED: gsd-tools package-legitimacy] | Existing dependency only; if Phase 7 repins or reinstalls it, the planner must insert `checkpoint:human-verify` first. [VERIFIED: gsd-tools package-legitimacy] |

**Packages removed due to `SLOP` verdict:** none. [VERIFIED: gsd-tools package-legitimacy]
**Packages flagged as suspicious `SUS`:** `wx-server-sdk` — planner inserts `checkpoint:human-verify` before any install or repin task. [VERIFIED: gsd-tools package-legitimacy]

## Architecture Patterns

### System Architecture Diagram

```text
User tap / page show
    |
    v
pages/index|period|memory|settings|bind   (thin Page adapters)
    |
    +--> command/flow helpers
    |        |
    |        +--> success -> toast/navigation/setData
    |        +--> retryable transport fail -> retry action
    |        +--> stale room -> RoomSession verify/repair
    |
    +--> RoomDataClient / export helper / home view-model builder
             |
             +--> utils/room.js (cache, recover, leave)
             +--> wx.cloud.callFunction(dataOp|leaveRoom|getMyRoom|...)
                         |
                         +--> room membership check in cloudfunctions/dataOp/index.js
                         +--> record normalization in roomRecords.js
                         +--> leave/ownership rules in roomLifecycle.js
                                     |
                                     v
                          WeChat Cloud DB: rooms / periods / memories
```

This phase should deepen the seams marked in the middle tier, not widen the outer layers. [VERIFIED: codebase grep]

### Recommended Project Structure
```text
pages/
├── index/              # Keep Page adapter thin; move derived homepage state out
├── period/             # List/edit page adapters consume shared record commands
├── memory/             # List/edit page adapters consume shared record commands
├── settings/           # Copy/export/local-clear handlers call shared helpers
└── bind/               # Room binding and leave flows stay Page-specific
utils/
├── room.js             # Extend RoomSession with verify/repair semantics
├── cloud.js            # Grow into RoomDataClient outcome classifier
├── calendarInsights.js # Preserve pure explanation logic
├── cycle.js            # Preserve pure prediction and period metadata logic
└── homeCalendarState.js (new) # Pure homepage view-model seam
cloudfunctions/
├── dataOp/             # Keep authorization and CRUD validation server-side
└── leaveRoom/          # Keep membership revoke and ownership transfer server-side
tests/
├── room-session.test.js
├── room-records.test.js
├── calendar-display.test.js
├── settings-flow.test.js (new)
├── record-flow.test.js (new)
└── home-calendar-state.test.js (new)
```

### Pattern 1: Outcome-Classifying RoomDataClient
**What:** One client module wraps `wx.cloud.callFunction`, timeout handling, and `RoomSession` verification so pages receive a normalized outcome instead of raw `result` objects. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html]
**When to use:** Any list/add/update/remove operation that can fail due to timeout, network, stale room membership, or server-side validation. [VERIFIED: codebase grep]
**Example:**
```javascript
// Adapted to Phase 7 from the official callFunction Promise shape.
async function runRoomAction(request, retry) {
  try {
    const res = await wx.cloud.callFunction(request)
    const result = res.result || {}
    if (result.code === 0) return { kind: 'success', data: result.data, requestID: res.requestID }
    if (result.msg === '无权访问该房间') return { kind: 'stale-room', retry }
    return { kind: 'business-fail', message: result.msg || '操作失败', retry }
  } catch (error) {
    return { kind: 'retryable-fail', message: error.message, retry }
  }
}
```

### Pattern 2: Page Command / Flow Helper
**What:** Save/delete/export/copy/list-load flows become small helpers that receive page adapters (`setData`, `showToast`, `navigateBack`, `showModal`) and a client seam. [VERIFIED: codebase grep]
**When to use:** When two or more pages currently duplicate loading, success toasts, delayed `navigateBack`, or fallback UX. [VERIFIED: codebase grep]
**Example:**
```javascript
// Phase-appropriate shape based on existing period/memory/settings duplication.
async function runSaveCommand(adapter, action) {
  adapter.setSaving(true)
  const outcome = await action()
  if (outcome.kind === 'success') adapter.showSuccessAndBack('保存成功')
  else if (outcome.kind === 'stale-room') adapter.offerRepair(outcome)
  else adapter.showRetryableError(outcome.message, outcome.retry)
  adapter.setSaving(false)
}
```

### Pattern 3: Pure Homepage View-Model Builder
**What:** A pure function composes periods, memories, prediction details, reminders, legend context, and calendar-day state into one home-page view model before `Page#setData`. [VERIFIED: codebase grep]
**When to use:** After client data-loading outcomes are standardized and record/settings helpers stop changing. [VERIFIED: codebase grep]
**Example:**
```javascript
function buildHomeCalendarState({ periods, memories, year, month, today }) {
  const prediction = cycle.predictNextPeriod(periods)
  const explanation = calendarInsights.buildPredictionExplanation(prediction)
  const days = util.buildCalendarDays({
    year,
    month,
    periods,
    memories,
    nextPredict: prediction.nextStart,
    predictionWindow: prediction.canPredict
      ? { rangeStart: prediction.rangeStart, rangeEnd: prediction.rangeEnd }
      : null,
    today
  })
  return { prediction, explanation, days }
}
```

### Anti-Patterns to Avoid
- **Page-local raw cloud semantics:** `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`, and `pages/settings/settings.js` currently inspect raw `res.result.code` or swallow thrown errors independently; planning should replace that with a shared outcome model. [VERIFIED: codebase grep]
- **Storage as source of truth:** `roomCode` is cache, not authority; the ADR and Phase 3 both require server-side leave/recovery truth. [VERIFIED: codebase grep]
- **Widening WXML logic while shrinking JS:** marker meanings may share a source of truth, but the template can stay explicit for readability. [VERIFIED: codebase grep]
- **Jumping to screenshot tooling too early:** the repo already has a productive pure-module and source-contract testing seam, while screenshot automation remains explicitly conditional. [VERIFIED: codebase grep] [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cloud retry UX | Per-page `try/catch` branches and ad hoc toasts | One shared `RoomDataClient` outcome model plus command helpers | This prevents every page from re-implementing transport/business/stale-room semantics differently. [VERIFIED: codebase grep] |
| Shared-record authorization | Client-side room checks | Existing `cloudfunctions/dataOp/index.js` + `roomRecords.js` | Phase 3 already established server-side authority; duplicating that on the client weakens trust and testability. [VERIFIED: codebase grep] |
| Room membership truth | Local `roomCode` heuristics | `RoomSession.getActiveRoom()` plus verify/repair extension | The ADR explicitly treats local storage as cache and clears it only after server truth succeeds. [VERIFIED: codebase grep] |
| Export transport | New format or custom binary protocol | Existing JSON + `shareFileMessage` + clipboard fallback | D-05 locks the format and official APIs already cover the necessary transport paths. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html] |
| Page harness runtime | Immediate screenshot runner | `node:test` with fake adapters/mocks | The repo already proves this style with `RoomSession` and `RoomRecords`, and Node now supports native mocks. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/test.html] |
| Homepage state composition | More `setData` mutations inside `pages/index/index.js` | Pure `buildHomeCalendarState`-style module | This reduces regression surface while preserving tested calendar helper semantics. [VERIFIED: codebase grep] |

**Key insight:** Phase 7 should deepen module seams that already have precedent in this repo (`RoomSession`, `RoomRecords`, `calendarInsights`) instead of importing a new framework or inventing a second architecture. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Treating `res.result.code !== 0` and thrown Promise errors as the same thing
**What goes wrong:** Pages cannot tell whether a user should retry, repair room state, or fix invalid input. [VERIFIED: codebase grep]
**Why it happens:** `wx.cloud.callFunction` returns transport success separately from application-defined `result`, and the current repo leaks that raw shape into pages. [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html] [VERIFIED: codebase grep]
**How to avoid:** Centralize outcome classification in one client seam and make pages react to `kind` instead of raw response shapes. [VERIFIED: codebase grep]
**Warning signs:** More than one page checks `res.result?.code`, `res.result?.msg`, and `catch` in slightly different ways. [VERIFIED: codebase grep]

### Pitfall 2: Repairing stale room state only after the page has already branched to generic failure UX
**What goes wrong:** Users see “network failure” or “save failed” even when the actual problem is a stale cached room binding. [VERIFIED: codebase grep]
**Why it happens:** `utils/cloud.js` currently reads local room code synchronously and does not ask `RoomSession` to verify/repair on room-auth failures. [VERIFIED: codebase grep]
**How to avoid:** Make stale-room detection a first-class client outcome and route to `RoomSession` verify/repair before bind-page redirect decisions. [VERIFIED: codebase grep]
**Warning signs:** `无权访问该房间` bubbles to pages as a generic toast or a silent empty list. [VERIFIED: codebase grep]

### Pitfall 3: Leaving export flow branching inside the page method
**What goes wrong:** File-write, share failure, clipboard fallback, and local-vs-cloud copy all get coupled to page UI state and remain hard to test. [VERIFIED: codebase grep]
**Why it happens:** `pages/settings/settings.js` currently owns the whole export algorithm directly. [VERIFIED: codebase grep]
**How to avoid:** Extract an export helper that returns explicit outcomes (`file-write-fail`, `share-fail-copied`, `success`) and test with fake `wx` adapters. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.writeFileSync.html]
**Warning signs:** Page tests would need to fake `wx.getFileSystemManager`, `wx.shareFileMessage`, and `wx.setClipboardData` inside one large method. [VERIFIED: codebase grep]

### Pitfall 4: Expanding homepage edits before reliability seams settle
**What goes wrong:** `pages/index/index.js` becomes the integration point for old and new failure semantics at the same time, increasing regression risk. [VERIFIED: codebase grep]
**Why it happens:** The page currently mixes data loading, prediction derivation, and calendar rendering across separate imperative methods. [VERIFIED: codebase grep]
**How to avoid:** Finish the shared client and record/settings helpers first, then extract the homepage view model against a stable upstream contract. [VERIFIED: codebase grep]
**Warning signs:** `loadData()`, `calcStats()`, and `renderCalendar()` all need simultaneous edits for unrelated failures. [VERIFIED: codebase grep]

### Pitfall 5: Touching dependency versions during an architecture-hardening phase without intent
**What goes wrong:** Reliability work gets confounded with cloud-runtime dependency drift. [VERIFIED: codebase grep]
**Why it happens:** Cloud functions declare `wx-server-sdk: "latest"`, and current lockfiles also include deprecated transitive packages such as `request`. [VERIFIED: codebase grep]
**How to avoid:** Keep Phase 7 package-neutral unless a dedicated dependency hygiene task is explicitly planned and human-verified. [VERIFIED: codebase grep] [VERIFIED: gsd-tools package-legitimacy]
**Warning signs:** A reliability PR unexpectedly changes cloudfunction lockfiles or transitives unrelated to page/client seams. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from official sources and repo-aligned usage:

### Cloud Function Promise Shape
```javascript
// Adapted from official WeChat docs:
// https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html
async function invoke(name, data) {
  const res = await wx.cloud.callFunction({ name, data })
  return { result: res.result, requestID: res.requestID }
}
```

### Native Node Mocking for Flow Helpers
```javascript
// Adapted from official Node docs:
// https://nodejs.org/api/test.html
const assert = require('node:assert/strict')
const { mock, test } = require('node:test')

test('save helper retries transport failure', async () => {
  const action = mock.fn(async () => ({ kind: 'retryable-fail', message: 'timeout' }))
  const outcome = await action()
  assert.equal(outcome.kind, 'retryable-fail')
  assert.equal(action.mock.callCount(), 1)
})
```

### Share Then Clipboard Fallback
```javascript
// Adapted from official WeChat docs:
// https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html
// https://developers.weixin.qq.com/miniprogram/dev/api/device/clipboard/wx.setClipboardData.html
async function exportJson(filePath, jsonText) {
  try {
    await wx.shareFileMessage({ filePath })
    return { kind: 'shared' }
  } catch (error) {
    await wx.setClipboardData({ data: jsonText })
    return { kind: 'copied', reason: error.message }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Page-local room/session logic | `RoomSession` centralizes cache, recovery, create/join/leave/local clear. [VERIFIED: codebase grep] | Phase 3 backfill, documented 2026-06-26. [VERIFIED: codebase grep] | Phase 7 should extend this seam for stale-room repair rather than create a second session abstraction. [VERIFIED: codebase grep] |
| Client writes trusted too much | `RoomRecords` now normalizes and validates server-side. [VERIFIED: codebase grep] | Phase 3 backfill, documented 2026-06-26. [VERIFIED: codebase grep] | Record/settings helpers can stay thin because payload authority already lives on the server. [VERIFIED: codebase grep] |
| Homepage explanations lived in page/UI code | `calendarInsights.js` is already a pure module for legend/explanation/recap copy. [VERIFIED: codebase grep] | Phase 2.1 summary dated 2026-06-26. [VERIFIED: codebase grep] | Phase 7 can apply the same pattern to homepage state composition. [VERIFIED: codebase grep] |
| Manual-only verification pressure | Repo now has six Node test files and source-contract tests around homepage WXML/JS/WXSS behavior. [VERIFIED: codebase grep] | Through Phases 2, 2.1, 3, and 6. [VERIFIED: codebase grep] | Planner should keep pushing deterministic logic down into pure modules before considering heavier UI tooling. [VERIFIED: codebase grep] |

**Deprecated/outdated:**
- Treating local `roomCode` as membership truth is obsolete after the `leaveRoom` ADR and Phase 3 RoomSession work. [VERIFIED: codebase grep]
- Adding new screenshot tooling before exhausting pure-module/page-adapter coverage is not the recommended Phase 7 path. [VERIFIED: codebase grep] [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WeChat does not publish stronger official guidance specifically telling developers to extract `Page` logic into pure modules for testability, so the recommendation is based on repo precedent plus general platform constraints. [ASSUMED] | Architecture Patterns | Low-to-medium: planner might overstate ecosystem consensus, but the implementation recommendation would still fit the current codebase. |
| A2 | A dedicated screenshot runner is still not practical enough to justify Phase 7-first adoption, so lightweight harnesses should come first. [ASSUMED] | Alternatives Considered / Deprecated | Medium: if a suitable runner already exists in team workflow, the planner may under-plan UI regression automation. |

## Open Questions

1. **Should Phase 7 include dependency hygiene for cloud functions, or explicitly defer it?**
- What we know: cloud functions currently declare `wx-server-sdk: "latest"`, lockfiles resolve `3.0.4`, and legitimacy tooling flags the package `SUS` because registry metadata exposes no repository. [VERIFIED: codebase grep] [VERIFIED: gsd-tools package-legitimacy]
- What's unclear: whether the team wants this phase to touch lockfiles at all. [VERIFIED: codebase grep]
- Recommendation: default to “defer dependency churn” unless a separate human-verified task is added. [VERIFIED: gsd-tools package-legitimacy]

2. **What exact stale-room signals should trigger silent repair before user-visible failure?**
- What we know: server-side access denial currently returns messages like `无权访问该房间`, and client pages do not normalize this separately today. [VERIFIED: codebase grep]
- What's unclear: whether only membership-denial messages should trigger repair, or whether missing-room/leave-race variants should also do so. [VERIFIED: codebase grep]
- Recommendation: the plan should include one early design checkpoint that enumerates stale-room signals before implementation starts. [VERIFIED: codebase grep]

3. **How far should the homepage view-model extraction go in one phase?**
- What we know: `calcStats()` and `renderCalendar()` are already mostly pure in intent, but `loadData()` still coordinates page state imperatively. [VERIFIED: codebase grep]
- What's unclear: whether to extract only derived state composition, or also data-loading orchestration for the homepage. [VERIFIED: codebase grep]
- Recommendation: extract derived state first; only lift orchestration if the new client seam has stabilized. [VERIFIED: codebase grep]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node:test` harnesses and `node --check` verification | ✓ [VERIFIED: local command] | `v24.15.0` [VERIFIED: local command] | — |
| npm | Registry checks and cloud-function dependency maintenance if intentionally touched | ✓ [VERIFIED: local command] | `11.12.1` [VERIFIED: local command] | — |
| WeChat DevTools CLI | Optional preview/build/manual verification support | ✓ [VERIFIED: local command] | CLI help available; path detected at `D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat` [VERIFIED: local command] | Manual DevTools GUI use if CLI automation is not chosen. [VERIFIED: local command] |
| `rg` | Fast repo search during planning/execution | ✓ [VERIFIED: local command] | Present in environment [VERIFIED: local command] | PowerShell `Select-String` if needed. [VERIFIED: local command] |

**Missing dependencies with no fallback:** none detected for the recommended Phase 7 plan. [VERIFIED: local command]

**Missing dependencies with fallback:** none detected. [VERIFIED: local command]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: codebase grep] | Cloud functions derive caller identity from `cloud.getWXContext().OPENID`; pages must not invent client auth. [VERIFIED: codebase grep] |
| V3 Session Management | yes [VERIFIED: codebase grep] | `RoomSession` manages the local cache boundary, while server-side leave/recovery keeps membership truth authoritative. [VERIFIED: codebase grep] |
| V4 Access Control | yes [VERIFIED: codebase grep] | `cloudfunctions/dataOp/index.js` and `leaveRoom` keep room membership checks server-side. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: codebase grep] | Client date checks plus server-side `RoomRecords` normalization/allowlists for periods and memories. [VERIFIED: codebase grep] |
| V6 Cryptography | no direct custom crypto [VERIFIED: codebase grep] | Use WeChat/Cloud identity primitives as-is; never hand-roll crypto or pseudo-auth tokens in this phase. [VERIFIED: codebase grep] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale local `roomCode` causing misleading unauthorized errors | Tampering / Denial of Service | Verify/repair room cache through `RoomSession` before final bind redirect decisions. [VERIFIED: codebase grep] |
| Client bypass attempt on room-scoped record writes | Elevation of Privilege | Keep all shared CRUD behind `dataOp` membership checks and `RoomRecords` validation. [VERIFIED: codebase grep] |
| Exporting sensitive shared data through unintended transport | Information Disclosure | Keep JSON export explicit, distinguish local file share from clipboard fallback, and preserve cloud-vs-local messaging. [VERIFIED: codebase grep] [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html] |
| Malformed record payloads or injected fields | Tampering | Preserve server-side allowlists and normalization in `RoomRecords`; do not shift trust to page payloads. [VERIFIED: codebase grep] |
| Sync storage overuse on startup | Denial of Service / Performance degradation | Limit sync storage usage to durable cache reads/writes and avoid treating it as live app state. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html] |

## Sources

### Primary (HIGH confidence)
- Repo phase/context artifacts, current source files, tests, ADR, `project.config.json`, and cloudfunction lockfiles — current on-disk architecture, behavior, and dependency state. [VERIFIED: codebase grep]
- Local environment probes (`node --version`, `npm --version`, WeChat DevTools CLI detection) — current machine capability checks. [VERIFIED: local command]

### Secondary (MEDIUM confidence)
- https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html — Promise/result shape, callback style, and transport contract for cloud invocation. [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html]
- https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html — share API path requirements and Promise support. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/share/wx.shareFileMessage.html]
- https://developers.weixin.qq.com/miniprogram/dev/api/device/clipboard/wx.setClipboardData.html — clipboard behavior and success contract. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/device/clipboard/wx.setClipboardData.html]
- https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.writeFileSync.html — local file write rules and error taxonomy. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/file/FileSystemManager.writeFileSync.html]
- https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html and https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html — sync storage role, limits, and caveats. [CITED: https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html]
- https://nodejs.org/api/test.html — built-in test runner, mocks, subtests, and coverage support. [CITED: https://nodejs.org/api/test.html]
- `npm view wx-server-sdk version time --json` and `gsd-tools package-legitimacy` — current registry metadata and legitimacy signals. [VERIFIED: local command] [VERIFIED: gsd-tools package-legitimacy]

### Tertiary (LOW confidence)
- Web search on WeChat Mini Program architecture/testability guidance — used only to confirm that strong official guidance on pure-module extraction was not readily surfaced, not to establish implementation facts. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — platform/runtime facts are verified, but the existing cloud SDK package is flagged `SUS` by legitimacy tooling and should not trigger automatic dependency churn. [VERIFIED: gsd-tools package-legitimacy]
- Architecture: MEDIUM — repo structure and phase constraints strongly support the recommendation, but WeChat does not appear to publish equally explicit official guidance for page-to-pure-module extraction. [VERIFIED: codebase grep] [ASSUMED]
- Pitfalls: MEDIUM — duplication and shallow seams are directly visible in current code, while the exact stale-room repair trigger set still needs one design checkpoint. [VERIFIED: codebase grep]

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 for planning assumptions, unless WeChat cloud/runtime docs or repo dependency state changes earlier. [CITED: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html] [VERIFIED: codebase grep]
