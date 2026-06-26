# Minmin Calendar

Minmin Calendar is a WeChat Mini Program for a private two-person shared calendar. It records period ranges and "happy time" memories in a shared cloud room, then renders them with period markers, memory hearts, prediction ranges, lunar dates, and China public-holiday context.

## Project Shape

- `pages/index/` - homepage calendar, prediction display, reminders, and day details.
- `pages/period/` - period list plus create/edit flow with optional flow and symptom tags.
- `pages/memory/` - memory list plus create/edit flow.
- `pages/bind/` - shared-room create, join, and recover flow.
- `pages/settings/` - room code, export, and local cache controls.
- `utils/room.js` - room-code cache, recovery, create/join, leave, and local clear wrapper.
- `utils/cloud.js` - frontend cloud-function access wrapper and room-scoped `RoomDataClient`.
- `utils/recordCommands.js` - shared period/memory save, delete, list feedback, retry, and rebind flow helper.
- `utils/settingsFlow.js` - shared room-code copy, export, retry/rebind, and local-cache helper.
- `utils/homeCalendarState.js` - pure homepage calendar state composition.
- `utils/util.js` - date, lunar, holiday, and calendar-grid helpers.
- `utils/cycle.js` - cycle prediction, reminders, and period metadata labels.
- `utils/calendarInsights.js` - calendar marker explanations, prediction explanation, and monthly recap copy.
- `cloudfunctions/` - WeChat Cloud Functions for room lifecycle and record persistence.
- `.planning/` - GSD project state, requirements, roadmap, and codebase map.

## Local Development

Open this folder in WeChat Developer Tools using `project.config.json`.

The mini program initializes WeChat Cloud in `app.js` with:

```js
env: 'cloud1-d8gyqvcez4e66b3da'
```

Cloud functions live under `cloudfunctions/`; each function has its own `package.json`, and older functions may also include a lockfile.

## Verification

Run the lightweight local checks after changing date, prediction, room, calendar, or page behavior:

```powershell
node --test tests\page-registration.test.js tests\room-data-client.test.js tests\record-flow.test.js tests\settings-flow.test.js tests\home-calendar-state.test.js tests\data-op-auth.test.js tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js
node --check cloudfunctions\leaveRoom\roomLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\dataOpHandler.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\room.js
node --check utils\cloud.js
node --check utils\recordCommands.js
node --check utils\settingsFlow.js
node --check utils\homeCalendarState.js
node --check utils\util.js
node --check utils\cycle.js
node --check utils\calendarInsights.js
node --check pages\bind\bind.js
node --check pages\settings\settings.js
node --check pages\index\index.js
node --check pages\memory\memory.js
node --check pages\memory\edit\edit.js
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
