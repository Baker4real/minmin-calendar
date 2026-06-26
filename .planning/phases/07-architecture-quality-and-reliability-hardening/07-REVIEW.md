---
phase: 07-architecture-quality-and-reliability-hardening
reviewed: 2026-06-26T11:01:00Z
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
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-06-26T11:01:00Z
**Depth:** deep
**Files Reviewed:** 24
**Status:** issues_found

## Summary

这是 Phase 07 第二轮修复后的第三次 deep re-review。我按指定范围复核了 RoomDataClient、record/settings helper、首页状态构建、`dataOp` 服务端授权边界、相关页面适配层和测试 harness，并重新执行了用户点名的 8 个测试文件及语法检查。

本轮确认已经修好的点：
- `settings` 导出链路现在能正确区分 `repair.success + bound`、`repair.success + !bound`、`repair.retryable-failure` 三态，不再把可重试修复失败改写成 `未绑定`。
- 首页仍直接消费 `RoomDataClient` outcome，`no-room` / `retryable-failure` / `room-repair` 都保留为显式页面状态。
- `RoomDataClient` 仍会先尝试 `getActiveRoom()`，并把恢复失败保留成 `retryable-failure`。
- `save/delete` 的普通传输失败仍不会重放非幂等写操作。
- `dataOp` 的房间授权仍留在服务端 `createDataOpHandler()` / `roomRecords` 边界里。

但 record 页面共用的 `recordCommands` 仍残留 1 个运行时回退：当 stale-room 修复本身再次失败时，它只弹瞬时 toast，不给 period/memory 列表或编辑页留下任何可见的重试/重绑路径。对应分支也没有被当前回归覆盖。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 记录页对 `room-repair + repair.retryable-failure` 仍然只给 toast，实际把“可重试修复失败”降级成无恢复路径

**File:** `utils/recordCommands.js:207-228`, `utils/recordCommands.js:253-275`, `pages/period/period.js:12-24`, `pages/memory/memory.js:11-20`, `pages/period/edit/edit.js:59-89`, `pages/memory/edit/edit.js:23-48`
**Issue:** `createRoomDataClient()` 已经把“缓存房间过期，随后 `repairCachedRoom()` 又因网络/云函数失败而未能确认房间状态”的情况保留成：

```js
{
  kind: 'room-repair',
  repair: { kind: 'retryable-failure', message: '同步房间状态失败：...' }
}
```

但 `recordCommands.handleFailureOutcome()` 对这条分支仍然只是：
- `normalizeRoomRepairOutcome()` 产出 `action: 'repair-retry'`
- 然后直接 `wxApi.showToast(...)` 并返回结果

它不会像 `settingsFlow` 或首页那样弹出可继续操作的 `重试` / `去绑定` 交互。问题在于 period/memory 页面对 helper 的返回值没有后续处理，只是 `await` 后结束，所以用户最终看到的是：
- 列表页：`loading` 结束，列表保持空或旧状态，只闪过一条 toast，没有任何可点击恢复路径。
- 编辑页：保存/删除失败只闪过一条 toast，没有“稍后重试/重新绑定/刷新确认”的持久引导。

我做了最小复现：对 `runRecordListLoad()` 注入 `{ kind: 'room-repair', repair: { kind: 'retryable-failure', message: '同步房间状态失败：network down' } }`，当前结果是仅产生 1 次 `showToast`，`showModal` 和 `navigateTo` 都不会发生。也就是说，本轮你要求复查的“active-room recovery failures stay retryable”在 record flows 这条分支上仍然不成立。

**Fix:** 把 `recordCommands` 的 `repair-retry` 分支升级成真正的用户恢复动作，而不是瞬时 toast。由于这里的原始失败是服务端先返回 stale-room 授权失败，写操作并没有成功落库，所以在修复失败分支继续给“重试当前操作”是安全的；至少也要给出和 `retryable-failure` 一样不会被页面吞掉的 modal。

```javascript
if (outcome.kind === 'room-repair') {
  const normalized = normalizeRoomRepairOutcome(outcome, roomRepairTitle)

  if (normalized.action === 'retry') {
    return promptRetry({
      wxApi,
      title: '房间状态已同步',
      content: normalized.message,
      retryAction,
      fallback: normalized
    })
  }

  if (normalized.action === 'rebind') {
    return promptNavigateToBind({
      wxApi,
      title: '房间状态已变化',
      content: normalized.message,
      navigateToBind,
      fallback: normalized
    })
  }

  return promptRetry({
    wxApi,
    title: failureTitle,
    content: normalized.message,
    retryAction,
    fallback: normalized
  })
}
```

如果你不想立即重放编辑页的保存/删除，也至少应改成 `promptAcknowledge(...)` 并给出“请稍后重试/返回列表刷新确认”的持久提示，不能继续只靠 toast。

## Warnings

### WR-01: [WARNING] 当前回归没有覆盖 record flows 的 `room-repair.repair.retryable-failure` 分支，所以这个回退可以一路漏过到第三次复审

**File:** `tests/record-flow.test.js:121-165`, `tests/record-flow.test.js:282-328`, `tests/page-registration.test.js:97-173`
**Issue:** 现有测试只覆盖了：
- 普通 `retryable-failure` 的 modal retry / acknowledge。
- `room-repair` 且 `repair.success + !bound` 的 rebind。
- period/memory 页面 harness 的成功加载路径。

缺的正是这次仍有问题的分支：
- `runRecordListLoad()` / `runRecordSave()` / `runRecordDelete()` 收到 `room-repair + repair.retryable-failure`
- period/memory 页面在该分支下是否还能给用户保留可见恢复动作

因此 72/72 测试全部通过，但 record flows 依然会把这类故障降级成 toast-only dead end。

**Fix:** 至少补两类回归：

```javascript
test('runRecordListLoad keeps room repair sync failures retryable', async () => {
  const promise = recordCommands.runRecordListLoad({
    page,
    wx,
    itemsKey: 'periods',
    action: async () => ({
      kind: 'room-repair',
      roomCode: 'ROOM01',
      repair: { kind: 'retryable-failure', message: '同步房间状态失败：network down' }
    })
  })

  await Promise.resolve()
  assert.equal(wx.modals[0].confirmText, '重试')
})

test('period page keeps a visible recovery path when room repair sync fails', async () => {
  // harness page -> client.list() returns room-repair + repair.retryable-failure
  // assert the page path now surfaces the helper-owned modal or equivalent durable action
})
```

---
_Reviewed: 2026-06-26T11:01:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
