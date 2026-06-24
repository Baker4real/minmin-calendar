# Testing Patterns

**Analysis Date:** 2026-06-24

## Test Framework

**Runner:**
- `node:test` from the Node.js standard library.
- Config: Not detected.

**Assertion Library:**
- `node:assert/strict`

**Run Commands:**
```bash
node --test tests/calendar-display.test.js
node --test tests
node --test
```

## Test File Organization

**Location:**
- Co-located under `tests/` for repository-level behavior checks.

**Naming:**
- Use `*.test.js` for test files, as shown by `tests/calendar-display.test.js`.

**Structure:**
```text
tests/
└── calendar-display.test.js
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
- `tests/calendar-display.test.js` covers date formatting, lunar/holiday metadata, and calendar grid assembly via `utils/util.js`.

**Integration Tests:**
- Template-level regression checks exist by reading `pages/index/index.wxml` and matching the rendered markup contract.

**E2E Tests:**
- Not used.

## Common Patterns

**Async Testing:**
- Not currently used in the visible suite.

**Error Testing:**
- Use direct assertions on fallback values and absence of bad template patterns, for example `assert.deepEqual(..., { date: '--', weekday: '' })` and `assert.doesNotMatch(...)`.

## Current Coverage

- `utils/util.js` has direct coverage for `formatPredictDisplay`, `getChineseDateMeta`, and `buildCalendarDays`.
- `pages/index/index.wxml` has a regression test to ensure the heart mark only appears for memories.
- `utils/cloud.js`, cloud-function wrappers, and most page event handlers are not covered by visible tests.

## Verification Gaps

- No automated tests were found for `pages/period/edit/edit.js`, `pages/memory/edit/edit.js`, `pages/settings/settings.js`, or `pages/bind/bind.js`.
- No tests were found for `utils/cloud.js` timeout behavior, room-code persistence, or cloud-function error handling.
- No lint or CI config was detected, so test execution appears to be manual unless an external runner is configured elsewhere.

---

*Testing analysis: 2026-06-24*
