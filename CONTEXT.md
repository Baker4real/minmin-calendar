# Minmin Calendar Context

## Domain Language

- **Room**: A private two-person sharing space identified by a six-character `roomCode`.
- **Room leave**: A server-side membership revoke flow that removes the current user from a Room while preserving the remaining member when present.
- **Period record**: A date range with optional note, calculated duration, flow level, and symptom tags.
- **Memory record / happy time**: A dated note shown as a heart marker on the calendar.
- **Calendar cell**: A homepage day tile that may show date number, lunar text, holiday/workday tag, and markers.
- **Prediction**: Estimated next period range derived from previous period gaps, with confidence and reminder states.
- **Today**: Current date highlight; it should not reuse the memory heart marker.
- **Lunar date**: Chinese lunar calendar text such as `正月初一` or `冬月十六`.
- **Public holiday**: China official holiday range or adjusted workday label displayed in calendar cells.

## Product Principles

- Calendar markers must be semantically clear. A visual symbol should not mean two different things.
- Shared data must stay room-scoped and private.
- The app should feel soft and personal, but not at the expense of readability.
- Date behavior should be tested before UI code relies on it.

## Technical Shape

- `app.js` initializes WeChat Cloud with the active environment.
- `utils/cloud.js` wraps frontend calls to `cloudfunctions/dataOp/index.js`.
- `utils/room.js` owns room-code cache, recovery, create/join, local clear, and server-side leave calls.
- `utils/util.js` owns date formatting, lunar conversion, official holiday metadata, and calendar-grid construction.
- `utils/cycle.js` owns cycle prediction, reminder derivation, flow labels, and symptom labels.
- `utils/calendarInsights.js` owns calendar marker explanations, prediction explanation copy, day marker meanings, and monthly recap text.
- `cloudfunctions/dataOp/index.js` is the central room-authorized CRUD gateway for `periods` and `memories`.
- `cloudfunctions/leaveRoom/index.js` revokes the current user's Room membership through the `RoomLifecycle` Module.

## Verification Baseline

Use these checks after date, room, calendar, or page behavior changes:

```powershell
node --test tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js
node --check cloudfunctions\leaveRoom\roomLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\util.js
node --check utils\cycle.js
node --check utils\calendarInsights.js
node --check utils\room.js
node --check utils\cloud.js
node --check pages\index\index.js
node --check pages\bind\bind.js
node --check pages\settings\settings.js
node --check pages\period\period.js
node --check pages\period\edit\edit.js
```

Manual WeChat DevTools verification is still needed for layout and end-to-end room flow behavior.
