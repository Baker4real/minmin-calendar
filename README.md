# Minmin Calendar

Minmin Calendar is a WeChat Mini Program for a private two-person shared calendar. It records period ranges and "happy time" memories in a shared cloud room, then renders them with period markers, memory hearts, prediction ranges, lunar dates, and China public-holiday context.

## Project Shape

- `pages/index/` - homepage calendar, prediction display, reminders, and day details.
- `pages/period/` - period list plus create/edit flow with optional flow and symptom tags.
- `pages/memory/` - memory list plus create/edit flow.
- `pages/bind/` - shared-room create, join, and recover flow.
- `pages/settings/` - room code, export, and local cache controls.
- `utils/cloud.js` - frontend cloud-function access wrapper.
- `utils/util.js` - date, lunar, holiday, and calendar-grid helpers.
- `utils/cycle.js` - cycle prediction, reminders, and period metadata labels.
- `cloudfunctions/` - WeChat Cloud Functions for room and record persistence.
- `.planning/` - GSD project state, requirements, roadmap, and codebase map.

## Local Development

Open this folder in WeChat Developer Tools using `project.config.json`.

The mini program initializes WeChat Cloud in `app.js` with:

```js
env: 'cloud1-d8gyqvcez4e66b3da'
```

Cloud functions live under `cloudfunctions/`; each function has its own `package.json` and lockfile.

## Verification

Run the lightweight local checks after changing date, prediction, calendar, or page behavior:

```powershell
node --test tests\calendar-display.test.js tests\cycle-prediction.test.js
node --check utils\util.js
node --check utils\cycle.js
node --check pages\index\index.js
node --check pages\period\period.js
node --check pages\period\edit\edit.js
```

For UI changes, also verify in WeChat Developer Tools at a small-phone width.

## Repository Hygiene

Generated dependencies, local tool state, imported reference material, and historical `hermes-*` maintenance reports are ignored by `.gitignore`.

Do not commit:

- `cloudfunctions/**/node_modules/`
- `project.private.config.json`
- `.serena/`
- `.tdd/`
- `_external/`
- `scripts/`
- `hermes-*.csv` / `hermes-*.md`

## Planning

Use GSD Core for non-trivial work. Start with:

- `.planning/PROJECT.md`
- `.planning/STATE.md`
- relevant files under `.planning/codebase/`

