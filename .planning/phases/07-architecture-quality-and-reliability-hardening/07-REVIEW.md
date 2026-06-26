---
phase: 07-architecture-quality-and-reliability-hardening
reviewed: 2026-06-26T09:34:50.7199153Z
depth: deep
files_reviewed: 21
files_reviewed_list:
  - utils/cloud.js
  - utils/room.js
  - utils/recordCommands.js
  - utils/settingsFlow.js
  - utils/homeCalendarState.js
  - cloudfunctions/dataOp/index.js
  - cloudfunctions/dataOp/dataOpHandler.js
  - cloudfunctions/dataOp/roomRecords.js
  - pages/index/index.js
  - pages/period/period.js
  - pages/period/edit/edit.js
  - pages/memory/memory.js
  - pages/memory/edit/edit.js
  - pages/settings/settings.js
  - tests/page-registration.test.js
  - tests/room-data-client.test.js
  - tests/record-flow.test.js
  - tests/settings-flow.test.js
  - tests/home-calendar-state.test.js
  - tests/data-op-auth.test.js
  - tests/calendar-display.test.js
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-06-26T09:34:50.7199153Z
**Depth:** deep
**Files Reviewed:** 21
**Status:** issues_found

## Narrative Findings (AI reviewer)

### CR-01: [BLOCKER] 首页仍然绕过 Phase 07 的房间恢复/修复协议

**File:** `pages/index/index.js:62-88`, `utils/cloud.js:169-192`

**Issue:** 首页没有跟随 Phase 07 新引入的 `RoomDataClient` 结果语义。`onShow()` 先用 `cloud.getRoomCode()` 做本地缓存短路，缓存为空时直接把页面置为 `noRoom` 并返回，根本不会走 `createRoomDataClient()` 里已经存在的 `getActiveRoom()` 恢复路径。即使进入 `loadData()`，它仍然调用旧的 `cloud.getPeriods()/getMemories()` 包装层，而 `unwrapListOutcome()` 会把 `room-repair` 和 `no-room` 都压平成空数组。结果是：首页在两种实际场景下都会坏掉：
1. 本地缓存丢失但云端仍有有效房间时，首页直接卡在“未绑定”。
2. 本地缓存过期或房间权限失效时，首页静默显示空日历，而不是提示重试/重新绑定。

**Fix:** 首页不要再用 `getRoomCode()` 和旧的 list 包装层做前置判断。改成和 `period`/`memory`/`settings` 一样，直接消费 `createRoomDataClient()` 的 `success | retryable-failure | room-repair | no-room` 结果，并在页面上显式处理恢复、重试和重新绑定。

### CR-02: [BLOCKER] 活跃房间恢复失败被错误降级成“未绑定”，把可重试故障导向重新绑定

**File:** `utils/room.js:18-33`, `utils/cloud.js:132-147`, `pages/settings/settings.js:8-16`

**Issue:** `RoomSession.getActiveRoom()` 在 `getMyRoom` 失败时会返回 `{ bound: false, roomCode: '', errorMsg: '同步房间状态失败：...' }`。但 `getActiveRoomCode()` 只看 `bound` 和 `roomCode`，直接把这类结果吞掉并返回空字符串，随后 `createRoomDataClient()` 把它当成 `{ kind: 'no-room' }`。`pages/settings/settings.js` 的 `onShow()` 也同样忽略 `errorMsg`，直接把页面状态改成 `未绑定`。这会把“本地缓存缺失 + 临时网络/云函数失败”的场景误判成真正未绑定，用户会被错误引导到绑定页，而不是看到可重试的恢复失败。

**Fix:** 活跃房间恢复必须保留失败语义，不能只返回空房间码。做法可以是：
- 让 `getActiveRoom()` 返回显式的 `kind: 'retryable-failure'`；或
- 在 `getActiveRoomCode()` 识别 `errorMsg` 并向上返回 `retryable-failure`；
- `settings` 页和 `RoomDataClient` 消费这个结果后，应提示重试，而不是一律当成未绑定。

### CR-03: [BLOCKER] 共享重试流程会重放非幂等写操作，超时后可能重复新增或二次删除记录

**File:** `utils/cloud.js:57-62`, `utils/recordCommands.js:153-160`, `pages/period/edit/edit.js:65-69`, `pages/memory/edit/edit.js:28-33`

**Issue:** `createRoomDataClient()` 把超时/网络失败统一标成 `retryable-failure`。`runRecordSave()`/`runRecordDelete()` 收到这类结果后，会在用户点“重试”时重新执行整个 `runCommand(options)`，也就是再次调用原始 `action()`。对 `client.add(...)` 来说，这不是安全重试，而是把一次“结果未知”的写操作重放一遍。如果第一次请求其实已经在云端成功写入、只是响应超时或丢失，那么第二次重放会新增重复的经期/纪念日记录；`remove(...)` 也会把“已删成功但响应丢失”变成下一次“记录不存在”的二次删除错误。

**Fix:** 不要对非幂等 mutation 直接做 UI 层重放。至少要满足其一：
- 给 `add/remove` 引入客户端请求 ID，并在 `dataOp`/`roomRecords` 侧做幂等去重；
- 仅对 `list` 等幂等操作提供“重试”；
- 对 `add/remove` 在超时后先做状态确认，再决定是否重放。

## Warnings

### WR-01: [WARNING] 新增测试没有执行到页面生命周期分支，DevTools 类回归仍然可以整套通过

**File:** `tests/page-registration.test.js:27-32`, `tests/page-registration.test.js:39-49`, `tests/calendar-display.test.js:222-307`

**Issue:** Phase 07 新增的页面级覆盖主要是“能不能 `require()` 成功”和“源码里有没有某个字符串”。`page-registration.test.js` 只断言 `Page(...)` 被调用、方法名存在，从不执行 `onShow()` / `loadData()` / `exportData()`；`calendar-display.test.js` 对首页也主要是源码正则匹配。这意味着本次发现的首页恢复/修复路径问题不会被任何现有页面测试拦下，整套 51 个测试仍然全部通过。

**Fix:** 为 `pages/index/index.js`、`pages/period/period.js`、`pages/memory/memory.js`、`pages/settings/settings.js` 增加真正的页面运行时 harness：注册页面后实际调用 `onShow()` / `loadData()` / `exportData()`，并用 fake `wx`/`roomSession`/`cloud` 断言 `no-room`、`retryable-failure`、`room-repair`、重新绑定跳转等行为。

## Summary

本次 deep review 在实现层确认了 3 个必须修复的问题，全部集中在 Phase 07 试图统一的“房间恢复/修复/重试”协议边界上：首页仍停留在旧接口语义，恢复失败也被错误压平为“未绑定”，同时共享重试逻辑会直接重放非幂等写操作。现有 Node 测试全部通过，但页面级测试仍然太浅，没覆盖到这些真实运行时分支。

---
_Reviewed: 2026-06-26T09:34:50.7199153Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
