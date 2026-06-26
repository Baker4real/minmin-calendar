---
phase: 07-architecture-quality-and-reliability-hardening
reviewed: 2026-06-26T10:23:03.7307675Z
depth: deep
files_reviewed: 24
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
  - pages/index/index.wxml
  - pages/period/period.js
  - pages/period/edit/edit.js
  - pages/memory/memory.js
  - pages/memory/edit/edit.js
  - pages/settings/settings.js
  - pages/settings/settings.wxml
  - tests/page-registration.test.js
  - tests/room-data-client.test.js
  - tests/room-session.test.js
  - tests/record-flow.test.js
  - tests/settings-flow.test.js
  - tests/home-calendar-state.test.js
  - tests/data-op-auth.test.js
  - tests/calendar-display.test.js
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-06-26T10:23:03.7307675Z
**Depth:** deep
**Files Reviewed:** 24
**Status:** issues_found

## Summary

这是 Phase 07 第三轮修复后的最终 deep re-review。我重新核对了 `RoomDataClient`、`RoomSession`、`recordCommands`、`settingsFlow`、首页状态层、`dataOp` 服务端授权边界、相关页面适配层，以及指定的 8 个测试文件，并重新执行了 review scope 内的 `node --test` 与 `node --check`。

本轮确认已经闭合的关键点：

- `recordCommands` 现在把 `room-repair.repair.retryable-failure` 保留为可见恢复动作：列表加载走 `重试` modal，保存/删除走不重放未知写入的确认 modal。
- `settings` 导出链路对 `room-repair.repair.retryable-failure` 仍保持可重试语义，不会把房间状态错误地改写成 `未绑定`。
- 首页已经直接消费 `RoomDataClient` outcome，`no-room`、`retryable-failure`、`room-repair` 都保留为显式页面状态。
- `createRoomDataClient()` 仍会先做 `getActiveRoom()` 恢复，并把恢复失败保留成 `retryable-failure`。
- 非幂等重试行为仍然安全：普通传输失败不会重放 `add/update/remove`；`room-repair + repair.success + bound` 的重试只发生在服务端因 stale-room 在授权前拒绝原请求之后，原写操作并未落库。
- `dataOp` 的房间授权仍在服务端 `createDataOpHandler()` / `roomRecords` 边界内，未退化到客户端判断。

剩余问题不在实现逻辑本身，而在回归 harness：`page-registration` 这组测试并没有真正等待页面异步 `onShow()` 流程完成，因此当前“页面运行时分支已被执行”的结论仍然偏乐观。

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: [WARNING] `page-registration` harness 没有真正等待页面异步 `onShow()` 完成，当前分支覆盖依赖“立即 resolve”的巧合

**File:** `D:\wechat\minmin-calendar\tests\page-registration.test.js:39-45`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:77-91`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:128-135`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:164-169`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:263-271`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:312-320`, `D:\wechat\minmin-calendar\tests\page-registration.test.js:384-396`, `D:\wechat\minmin-calendar\pages\index\index.js:67-71`, `D:\wechat\minmin-calendar\pages\period\period.js:10-24`, `D:\wechat\minmin-calendar\pages\memory\memory.js:9-20`, `D:\wechat\minmin-calendar\pages\settings\settings.js:8-11`

**Issue:** 这组 harness 大量使用 `await harness.page.onShow()`，但这些页面的 `onShow()` 当前都不返回 Promise：

- `pages/period/period.js` 和 `pages/memory/memory.js` 只是调用 `this.loadData()`
- `pages/index/index.js` 只是设置 `this._loadingPromise = this.loadData()`
- `pages/settings/settings.js` 只是启动 `roomSession.getActiveRoom()` 并在回调里 `setData`

因此测试并没有真正等待页面加载链路结束，而是依赖 mock 恰好“同步创建 Promise 并在下一次微任务内 resolve”的时序才能碰巧通过。这个假设很脆弱，已经足以让当前回归对真实运行时分支产生假阳性。

我做了最小运行时探针：把 `pages/period/period.js` 的 `client.list()` mock 改成 `await new Promise(resolve => setTimeout(resolve, 0))` 后，`page.onShow()` 的返回值仍是 `undefined`；`await page.onShow()` 之后 `page.data.periods` 还是空数组，只有再过一个 timer tick 才会被填充。这说明当前 harness 并不能证明“页面 onShow 路径在真实异步时序下已完成执行”，而只能证明“在当前超快 mock 下大多能撞上正确时机”。

这正好影响你本轮特别要求复查的“page harness coverage meaningfully executes runtime branches”。目前它还没有达到“meaningfully”。

**Fix:**

让页面生命周期在测试中可等待，而不是靠微任务碰运气。两种安全做法里，优先推荐第一种：

```javascript
// pages/period/period.js
onShow() {
  return this.loadData()
}

// pages/memory/memory.js
onShow() {
  return this.loadData()
}

// pages/index/index.js
onShow() {
  if (!this._loadingPromise) {
    this._loadingPromise = this.loadData()
  }
  return this._loadingPromise
}
```

`pages/settings/settings.js` 也应返回它的异步链路 Promise。这样 `tests/page-registration.test.js` 里的 `await harness.page.onShow()` 才真正等到页面状态稳定。

如果不想改页面代码，就把 harness 显式改为等待页面自己暴露的稳定信号，而不是 `await onShow()` / `await Promise.resolve()`：

```javascript
const result = harness.page.onShow()
if (result && typeof result.then === 'function') {
  await result
} else if (harness.page._loadingPromise) {
  await harness.page._loadingPromise
} else {
  throw new Error('page onShow did not expose an awaitable completion signal')
}
```

在修好等待语义之前，不应把这组 harness 当成“已经可靠覆盖页面运行时分支”的证据。

---
_Reviewed: 2026-06-26T10:23:03.7307675Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
