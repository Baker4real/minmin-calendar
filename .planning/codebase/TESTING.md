# Testing Patterns

**Analysis Date:** 2026-06-26

## Test Framework

**Runner:**
- `node:test` from the Node.js standard library.
- Config: Not detected.

**Assertion Library:**
- `node:assert/strict`

**Run Commands:**
```bash
node --test tests/page-registration.test.js tests/room-data-client.test.js tests/record-flow.test.js tests/settings-flow.test.js tests/home-calendar-state.test.js tests/data-op-auth.test.js tests/calendar-display.test.js tests/calendar-insights.test.js tests/cycle-prediction.test.js tests/room-lifecycle.test.js tests/room-records.test.js tests/room-session.test.js
```

Prefer explicit test-file lists on the current Windows/Node setup because `node --test tests` may be interpreted as a module path instead of a directory test discovery target.

## Test File Organization

**Location:**
- Co-located under `tests/` for repository-level behavior checks.

**Naming:**
- Use `*.test.js` for test files, as shown by `tests/calendar-display.test.js`.

**Structure:**
```text
tests/
├── page-registration.test.js
├── room-data-client.test.js
├── record-flow.test.js
├── settings-flow.test.js
├── home-calendar-state.test.js
├── data-op-auth.test.js
├── calendar-display.test.js
├── calendar-insights.test.js
├── cycle-prediction.test.js
├── room-lifecycle.test.js
├── room-records.test.js
└── room-session.test.js
```

## Test Structure

**Suite Organization:**
```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const util = require('../utils/util')

test('formatPredictDisplay returns a compact date with weekday', () => {
  assert.deepEqual(util.formatPredictDisplay('2026-06-24'), {
    date: '06月24日',
    weekday: '周三'
  })
})
```

**Patterns:**
- Use top-level `test(...)` blocks with inline assertions.
- Keep fixtures local to each test case; there is no shared fixture layer.
- Some tests assert on source files directly, for example `tests/calendar-display.test.js` reads `pages/index/index.wxml`.

## Mocking

**Framework:** None detected.

**Patterns:**
```js
const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
assert.doesNotMatch(wxml, /item\\.isToday\\s*\\|\\|\\s*item\\.isMemory/)
```

**What to Mock:**
- Not detected.

**What NOT to Mock:**
- Prefer real utility functions from `utils/util.js` and real template files when the behavior is static and deterministic.

## Fixtures and Factories

**Test Data:**
- Inline literals are the norm, such as `'2026-02-17'`, `'2026-06-19'`, and `[{ date: '2026-02-17' }]`.

**Location:**
- Not detected.

## Coverage

**Requirements:** None enforced.

**View Coverage:**
```bash
node --test --experimental-test-coverage
```

## Test Types

**Unit Tests:**
- `tests/calendar-display.test.js` covers date formatting, lunar/holiday metadata, published 2001-2026 holiday arrangements, themed day sheets, month-jump UI contracts, calendar density controls, and calendar grid assembly via `utils/util.js`.
- `tests/calendar-insights.test.js` covers calendar legend items, prediction explanation copy, day marker meanings, and monthly recap/share text via `utils/calendarInsights.js`.
- `tests/cycle-prediction.test.js` covers robust cycle prediction, manual fallback settings, reminder state derivation, and optional flow/symptom metadata normalization via `utils/cycle.js`.
- `tests/room-data-client.test.js` covers `utils/cloud.js#createRoomDataClient()`, including success, retryable failures, active-room recovery, stale-room repair, and legacy wrapper compatibility.
- `tests/record-flow.test.js` covers `utils/recordCommands.js` save/delete/list behavior, modal retry/rebind prompts, and record-page helper delegation contracts.
- `tests/settings-flow.test.js` covers `utils/settingsFlow.js` copy/export/local-clear branches, JSON export payloads, share/clipboard fallback, and retry/rebind behavior.
- `tests/home-calendar-state.test.js` covers `utils/homeCalendarState.js` fallback and prediction-capable calendar state composition, including `dayDetailsByDate`.
- `tests/data-op-auth.test.js` covers `cloudfunctions/dataOp/dataOpHandler.js` collection allowlists, room authorization, and action dispatch without `wx-server-sdk`.
- `tests/room-lifecycle.test.js` covers server-side Room leave/unpair behavior through `cloudfunctions/leaveRoom/roomLifecycle.js`, including creator transfer, partner removal, empty-room deletion, and no-op leave.
- `tests/room-session.test.js` covers Room-code cache, cloud recovery, create/join behavior, invalid join-code rejection, and local clear behavior via `utils/room.js`.
- `tests/room-records.test.js` covers server-side Period record / Memory record validation, normalization, and cross-Room mutation blocking via `cloudfunctions/dataOp/roomRecords.js`.

**Integration Tests:**
- `tests/page-registration.test.js` loads `pages/period/period.js`, `pages/memory/memory.js`, and `pages/settings/settings.js` under a fake `Page`/`wx` harness to prove the page modules still register cleanly after helper extractions.
- Template-level regression checks exist by reading `pages/index/index.wxml` and matching the rendered markup contract.

**E2E Tests:**
- Not used.

## Common Patterns

**Async Testing:**
- Not currently used in the visible suite.

**Error Testing:**
- Use direct assertions on fallback values and absence of bad template patterns, for example `assert.deepEqual(..., { date: '--', weekday: '' })` and `assert.doesNotMatch(...)`.

## Current Coverage

- `utils/util.js` and `utils/chinaHolidays.js` have direct coverage through `formatPredictDisplay`, `getChineseDateMeta`, published holiday examples, and `buildCalendarDays`.
- `utils/cycle.js` has direct coverage for prediction ranges, confidence, reminders, and period metadata helpers.
- `utils/calendarInsights.js` has direct coverage for marker legend, prediction explanation, day meanings, and monthly recap summaries.
- `utils/homeCalendarState.js` has direct Node coverage for homepage prediction fields, reminder composition, calendar-day output, and precomputed selected-day detail payloads.
- `pages/index/index.wxml` has a regression test to ensure the heart mark only appears for memories.
- `pages/index/index.js`, `pages/index/index.wxml`, and `pages/index/index.wxss` have source-level regression checks for themed day sheets, year-month jump controls, return-to-today navigation, remembered compact/full calendar density, calendar insight sheets, day meanings, monthly recap controls, and the `buildHomeCalendarState()` delegation seam.
- `pages/period/edit/edit.wxml` has a regression test to ensure flow and symptom controls stay present.
- `pages/period/edit/edit.wxss` has a regression test to keep interactive chips at the 88rpx touch-target floor.
- `pages/period/period.js`, `pages/memory/memory.js`, and `pages/settings/settings.js` have helper-delegation coverage plus a lightweight page-registration harness so shared helper rewrites do not silently break runtime page registration.
- `utils/cloud.js` has direct Node coverage for room-scoped list/add/update/remove outcomes, timeout/network retry states, active-room recovery, stale-room repair, and legacy wrapper compatibility.
- `utils/recordCommands.js` and `utils/settingsFlow.js` have direct Node coverage for retry/rebind prompts, loading-state cleanup, and success/failure branches.
- `utils/room.js` has direct Node coverage for cached Room lookups, `getMyRoom` recovery, stale cached-room repair, cloud failure messages, room creation, room joining, server-side leave calls, invalid join-code rejection, and local cache clearing.
- `cloudfunctions/dataOp/index.js` and `cloudfunctions/dataOp/dataOpHandler.js` have direct coverage for room membership lookup, unsupported collection rejection, unknown action handling, and the boundary that keeps `wx-server-sdk` inside `index.js`.
- `cloudfunctions/leaveRoom/roomLifecycle.js` has direct Node coverage for creator ownership transfer, partner removal, empty-room deletion, and no-op leave.
- `cloudfunctions/dataOp/roomRecords.js` has direct Node coverage for malformed payloads, reserved field stripping, duration calculation, symptom normalization, and cross-Room mutation blocking.
- The broad automated regression command now exercises 81 `node:test` cases across Phase 2.1, 6, and 7 seams before manual WeChat verification.

## Verification Gaps

- No automated tests were found for `pages/bind/bind.js`, and there are still no true WeChat DevTools screenshot or device-level regression checks.
- Record and settings pages now have Node harness coverage, but their final page-open behavior in WeChat DevTools still relies on manual confirmation.
- Deployed cloud-function adapters (`createRoom`, `joinRoom`, `getMyRoom`, `leaveRoom`, `dataOp`) still rely on local harnesses and manual runtime checks instead of end-to-end cloud automation.
- No lint or CI config was detected, so test execution appears to be manual unless an external runner is configured elsewhere.

---

*Testing analysis: 2026-06-26*
