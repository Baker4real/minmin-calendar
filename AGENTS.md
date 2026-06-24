# Project Agent Instructions

## Language

- Prefer Simplified Chinese when explaining work to the user.
- Keep code identifiers, commands, file paths, and externally required text in their original language.

## Project Summary

This repository is a WeChat Mini Program for a two-person shared period and memory calendar. The frontend is built from `.js`, `.wxml`, `.wxss`, and `.json` page files. Backend operations are WeChat Cloud Functions under `cloudfunctions/`.

Core domain files:

- `pages/index/index.*` - homepage calendar, prediction display, day detail actions.
- `pages/period/**` - period list and edit flows.
- `pages/memory/**` - memory list and edit flows.
- `pages/bind/**` - shared-room create/join/recover flow.
- `pages/settings/**` - room code, export, local cache controls.
- `utils/cloud.js` - frontend cloud-function data access wrapper.
- `utils/util.js` - date, lunar, holiday, and calendar-grid logic.
- `utils/cycle.js` - cycle prediction, reminders, and period metadata labels.
- `cloudfunctions/dataOp/index.js` - server-side room-scoped CRUD gateway.

## Durable Workflow

Use GSD Core for non-trivial project work. The current project state lives in `.planning/`:

- `.planning/PROJECT.md` - product context and core value.
- `.planning/REQUIREMENTS.md` - checkable requirements.
- `.planning/ROADMAP.md` - phased work plan.
- `.planning/STATE.md` - current status and next action.
- `.planning/codebase/` - codebase map.

Before planning or implementation, read `.planning/PROJECT.md`, `.planning/STATE.md`, and the relevant `.planning/codebase/*.md` files. Refresh `.planning/codebase/` after significant structural changes.

## Verification

Run relevant checks before claiming work is complete. Current lightweight checks:

```powershell
node --test tests\calendar-display.test.js
node --test tests\cycle-prediction.test.js
node --check utils\util.js
node --check utils\cycle.js
node --check pages\index\index.js
node --check pages\period\period.js
node --check pages\period\edit\edit.js
```

For UI changes, also perform manual visual verification in WeChat DevTools when available, especially at small-phone widths.

## Editing Rules

- Keep generated or local-maintenance files out of normal changes unless explicitly requested.
- Do not edit ignored dependencies under `node_modules/` or `_external/`.
- Keep calendar marker semantics explicit: today highlight, period dot, memory heart, prediction label, holiday/workday tags should not reuse the same visual meaning.
- Server-side room authorization belongs in cloud functions, not only in the mini program client.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/` until a remote repository is configured. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout: root `CONTEXT.md` plus ADRs under `docs/adr/`. See `docs/agents/domain.md`.
