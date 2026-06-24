# Minmin Calendar Context

## Domain Language

- **Room**: A private two-person sharing space identified by a six-character `roomCode`.
- **Period record**: A date range with optional note and calculated duration.
- **Memory record / happy time**: A dated note shown as a heart marker on the calendar.
- **Calendar cell**: A homepage day tile that may show date number, lunar text, holiday/workday tag, and markers.
- **Prediction**: Estimated next period start date derived from previous period gaps.
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
- `utils/util.js` owns date formatting, lunar conversion, official holiday metadata, and calendar-grid construction.
- `cloudfunctions/dataOp/index.js` is the central room-authorized CRUD gateway for `periods` and `memories`.

## Verification Baseline

Use these checks after date/calendar behavior changes:

```powershell
node --test tests\calendar-display.test.js
node --check utils\util.js
node --check pages\index\index.js
```

Manual WeChat DevTools verification is still needed for layout and cloud-function runtime behavior.
