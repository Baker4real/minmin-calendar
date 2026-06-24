# Coding Conventions

**Analysis Date:** 2026-06-24

## Naming Patterns

**Files:**
- Pages use lowercase feature folders and paired Mini Program files, for example `pages/index/index.js`, `pages/index/index.wxml`, `pages/index/index.wxss`, and `pages/index/index.json`.
- Shared helpers live under `utils/`, such as `utils/util.js` and `utils/cloud.js`.
- Tests live under `tests/`, for example `tests/calendar-display.test.js`.

**Functions:**
- Use camelCase for functions and methods, such as `loadData`, `renderCalendar`, `getChineseDateMeta`, and `buildCalendarDays`.
- Page handlers follow event-style names like `onLoad`, `onShow`, `onDateChange`, and `onNoteInput`.

**Variables:**
- Prefer short descriptive camelCase names like `roomCode`, `nextPredict`, `predictConfidence`, and `isEdit`.
- Boolean flags use `is*`, `has*`, or negative UI flags such as `loading` and `noRoom`.

**Types:**
- This codebase is plain JavaScript, not TypeScript.
- Data objects are shaped ad hoc through `Page({ data: { ... } })` and returned POJOs from `utils/util.js`.

## Code Style

**Formatting:**
- Use 2-space indentation in JS, WXML, and WXSS.
- Prefer single quotes in JavaScript.
- Keep object literals compact when the shape is small, as seen in `pages/index/index.js` and `pages/memory/edit/edit.js`.

**Linting:**
- No repository-wide ESLint, Prettier, Biome, or similar config is detected.
- `.gitignore` mentions `.eslintrc.local`, so local lint overrides are expected but not committed.

## Import Organization

**Order:**
1. Built-in Node modules in tests, such as `node:assert/strict`, `node:fs`, and `node:path`.
2. Local helpers via relative paths, such as `require('../../utils/util')`.

**Path Aliases:**
- Not detected. Use relative `require(...)` paths.

## Error Handling

**Patterns:**
- Use `try/catch` around cloud calls and persistence actions, then surface user-facing failures with `wx.showToast({ icon: 'error' | 'none' })`.
- Prefer early returns for invalid input, such as missing dates in `pages/period/edit/edit.js` and `pages/memory/edit/edit.js`.
- Silent catch blocks exist in some read-only flows, for example `pages/settings/settings.js`; keep that pattern only when failure is intentionally non-blocking.

## Logging

**Framework:** `console`

**Patterns:**
- Log unexpected operational failures with `console.error(...)`, as in `pages/index/index.js`.
- Avoid noisy logging in normal UI flows; most pages show a toast or modal instead.

## Comments

**When to Comment:**
- Comments are sparse and used mainly for intent or edge-case notes, such as the query timeout in `utils/cloud.js` and the holiday-data note in `utils/util.js`.
- Keep comments brief and explanatory, not decorative.

**JSDoc/TSDoc:**
- Not used.

## Function Design

**Size:**
- Functions are small to medium and usually map to one UI action, one cloud operation, or one utility transformation.
- Prefer one responsibility per function, especially inside `Page({ ... })` objects.

**Parameters:**
- Prefer a single options object for utility functions with multiple inputs, as in `buildCalendarDays({ year, month, periods, memories, nextPredict, today })`.
- Page event handlers usually accept the event object directly and extract `e.detail.value` or `e.currentTarget.dataset.*`.

**Return Values:**
- Utilities return plain objects, arrays, or sets.
- UI actions usually return nothing and mutate page state through `this.setData(...)`.

## Module Design

**Exports:**
- Use CommonJS `module.exports` / `require(...)` throughout.
- `utils/cloud.js` exports a small operation surface for periods, memories, and room-code lookup.

**Barrel Files:**
- Not used.

## UI Style Conventions

**Visual Language:**
- The UI is intentionally dark and glossy, with “aurora” / glassmorphism styling in `pages/index/index.wxss` and `pages/settings/settings.wxss`.
- Use translucent cards, rounded corners, soft shadows, blur, and warm pink accents rather than flat neutral panels.

**Class Naming:**
- Prefer semantic block names like `month-nav`, `calendar-grid`, `premium-card`, `profile-card`, `menu-item`, and `quick-actions`.
- State classes are appended in WXML, such as `today`, `period`, `memory`, `predict`, `holiday`, `workday`, and `empty`.

**Interaction:**
- Keep touch feedback visible with `:active` scale or background changes.
- Prefer `wx.showToast` and `wx.showModal` for feedback instead of custom inline error widgets.

**Markup Patterns:**
- Render lists with `wx:for` and guard optional regions with `wx:if` / `wx:elif` / `wx:else`.
- Keep WXML logic simple; compute derived state in JS utilities or page methods instead of inside templates.

---

*Convention analysis: 2026-06-24*
