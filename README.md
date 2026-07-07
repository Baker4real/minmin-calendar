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
- `utils/recordPageSync.js` - edit-page-to-homepage record sync helper for optimistic homepage refresh.
- `utils/settingsFlow.js` - shared room-code copy, export, retry/rebind, and local-cache helper.
- `utils/homeCalendarState.js` - pure homepage calendar state, marker meanings, and marker composition.
- `utils/util.js` - date, lunar, holiday, and base calendar-grid helpers.
- `utils/cycle.js` - cycle prediction, reminders, and period metadata labels.
- `utils/calendarInsights.js` - prediction explanation and monthly recap copy.
- `cloudfunctions/` - WeChat Cloud Functions for room lifecycle and record persistence.

## Local Development

Open this folder in WeChat Developer Tools using `project.config.json`.

The mini program initializes WeChat Cloud in `app.js` with:

```js
env: 'cloud1-d8gyqvcez4e66b3da'
```

Cloud functions live under `cloudfunctions/`; each function has its own `package.json` and committed `package-lock.json`.
云函数依赖必须固定到精确版本，尤其是 `wx-server-sdk`，避免部署时解析到浮动的 `latest` 版本。
所有云函数应共享同一个已固定的 `wx-server-sdk` 版本；升级时要一起更新各函数的 `package.json`、`package-lock.json` 和依赖护栏测试。
当前锁定的 `wx-server-sdk@3.0.4` 解析到 `@cloudbase/node-sdk@2.10.0` 和 `@cloudbase/database@1.4.1`；随包接口包含 `db.startTransaction()`、`db.runTransaction()` 和 `collection.where(...).update(...)`。当前房间生命周期并发保护主要依赖成员锁、条件更新和更新后确认；唯一索引重复键的真实错误形态仍需用云端部署 smoke 验证。
提交 lockfile 只保证仓库输入可复现；云函数上传后仍要验证部署产物实际解析的 SDK 版本。

## Verification

Run the lightweight local checks after changing date, prediction, room, calendar, or page behavior:

```powershell
node --test tests\page-registration.test.js tests\room-data-client.test.js tests\record-flow.test.js tests\settings-flow.test.js tests\room-records-snapshot.test.js tests\room-access-protocol.test.js tests\home-calendar-state.test.js tests\data-op-auth.test.js tests\calendar-display.test.js tests\calendar-insights.test.js tests\cycle-prediction.test.js tests\room-lifecycle.test.js tests\room-records.test.js tests\room-session.test.js tests\room-binding.test.js tests\cloudfunction-dependencies.test.js
node --check cloudfunctions\leaveRoom\roomLifecycle.js
node --check cloudfunctions\leaveRoom\index.js
node --check cloudfunctions\dataOp\dataOpHandler.js
node --check cloudfunctions\dataOp\roomRecords.js
node --check cloudfunctions\dataOp\index.js
node --check utils\room.js
node --check utils\cloud.js
node --check utils\roomAccessProtocol.js
node --check utils\recordCommands.js
node --check utils\recordPageSync.js
node --check utils\settingsFlow.js
node --check utils\roomRecordsSnapshot.js
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

## Project Notes

This is a regular non-GSD repository. For non-trivial work, start with `CONTEXT.md`, the relevant files under `docs/`, and the source/test files for the area being changed.

## Git Branch Policy

- This repository is a standalone private project, not a third-party upstream local patch stack.
- Do not maintain `patch-stack/*` remote branches here. Use normal `master` history, focused commits, and temporary rollback branches when needed.
- Reserve `patch-stack/*` for repositories whose name or responsibility is explicitly `*-local-patches`.
