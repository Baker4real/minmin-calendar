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
- `utils/room.js` - frontend room-code cache, recovery, create/join, leave, and local clear wrapper.
- `utils/cloud.js` - frontend cloud-function data access wrapper and room-scoped `RoomDataClient`.
- `utils/recordCommands.js` - shared period/memory save, delete, list feedback, retry, and rebind flow helper.
- `utils/recordPageSync.js` - edit-page-to-homepage record sync helper for optimistic homepage refresh.
- `utils/roomRecordsSnapshot.js` - 首页部分成功快照与设置页全量导出的共享加载器。
- `utils/homeRecordsSync.js` - 首页记录同步、过期请求拒绝与乐观更新协调的纯状态机。
- `utils/settingsFlow.js` - shared room-code copy, export, retry/rebind, and local-cache helper.
- `utils/homeCalendarState.js` - pure homepage calendar state, marker meanings, and marker composition.
- `utils/util.js` - date, lunar, holiday, and base calendar-grid logic.
- `utils/cycle.js` - cycle prediction, reminders, and period metadata labels.
- `utils/calendarInsights.js` - prediction explanation and monthly recap text logic.
- `cloudfunctions/dataOp/index.js` - server-side room-scoped CRUD gateway.
- `cloudfunctions/dataOp/dataOpHandler.js` - server-side room authorization and dataOp dispatch seam.
- `cloudfunctions/leaveRoom/**` - server-side room membership revoke, ownership-transfer, and empty-room archive flow.

## Workflow

This is a regular non-GSD repository. Use the root project docs as the durable context:

- `README.md` - project shape, local development, verification, and repository hygiene.
- `CONTEXT.md` - domain context, technical shape, boundaries, and current concerns.
- `docs/adr/` - architecture decisions that affect future implementation choices.

Before non-trivial implementation, read `CONTEXT.md` plus the relevant source and test files.

## Verification

Run relevant checks before claiming work is complete. Current lightweight checks:

下列命令以仓库根为当前目录展示，方便人工复制。通过 Codex Desktop shell 执行时，必须把 `node --test` / `node --check` 的路径展开为绝对路径；shell wrapper 可能无法可靠解析相对路径。

```powershell
node --test tests\page-registration.test.js tests\room-data-client.test.js tests\record-edit-route.test.js tests\record-flow.test.js tests\settings-flow.test.js tests\room-records-snapshot.test.js tests\room-access-outcome.test.js tests\room-access-protocol.test.js tests\home-calendar-state.test.js tests\home-records-sync.test.js tests\data-op-auth.test.js tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js tests\room-binding.test.js tests\cloudfunction-dependencies.test.js
node --check cloudfunctions\_shared\roomMembershipLifecycle.js
node --check cloudfunctions\_shared\syncRoomMembershipLifecycle.js
node --check cloudfunctions\createRoom\roomMembershipLifecycle.js
node --check cloudfunctions\createRoom\index.js
node --check cloudfunctions\joinRoom\roomMembershipLifecycle.js
node --check cloudfunctions\joinRoom\index.js
node --check cloudfunctions\getMyRoom\roomMembershipLifecycle.js
node --check cloudfunctions\getMyRoom\index.js
node --check cloudfunctions\leaveRoom\roomMembershipLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\dataOpHandler.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\room.js
node --check utils\cloud.js
node --check utils\roomAccessProtocol.js
node --check utils\roomAccessOutcome.js
node --check utils\recordCommands.js
node --check utils\recordPageSync.js
node --check utils\recordEditRoute.js
node --check utils\settingsFlow.js
node --check utils\roomRecordsSnapshot.js
node --check utils\homeRecordsSync.js
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
node cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check
```

For UI changes, also perform manual visual verification in WeChat DevTools when available, especially at small-phone widths.

## Editing Rules

- Keep generated or local-maintenance files out of normal changes unless explicitly requested.
- Do not edit ignored dependencies under `node_modules/` or `_external/`.
- Keep calendar marker semantics explicit: today highlight, period dot, memory heart, prediction label, holiday/workday tags should not reuse the same visual meaning.
- Server-side room authorization belongs in cloud functions, not only in the mini program client.
- Bind-page unbind must call server-side `leaveRoom`; Settings "clear local cache" is intentionally local-only.

## Agent skills

### Issue tracker

Use GitHub Issues in the private repository for new tracked work. Local markdown issues under `.scratch/` are legacy scratch notes only. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-role triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout: root `CONTEXT.md` plus ADRs under `docs/adr/`. See `docs/agents/domain.md`.
