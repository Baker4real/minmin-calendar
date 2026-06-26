---
phase: 07-architecture-quality-and-reliability-hardening
reviewed: 2026-06-26T09:59:41.7010919Z
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

**Reviewed:** 2026-06-26T09:59:41.7010919Z
**Depth:** deep
**Files Reviewed:** 24
**Status:** issues_found

## Summary

本次是 Phase 07 在修复 `CR-01`、`CR-02`、`CR-03`、`WR-01` 后的 deep re-review。我复核了指定的 24 个实现/测试文件，并重新执行了用户要求范围内的 `node:test` 套件；70/70 测试全部通过，但代码里仍然残留 1 个阻断问题，外加 1 个直接解释为什么这次阻断问题没有被现有回归拦住的测试覆盖缺口。

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] 设置页仍把房间修复失败的可重试状态误导成“去绑定/未绑定”

**File:** `utils/settingsFlow.js:123-139`, `pages/settings/settings.js:26-32`, `pages/settings/settings.js:72-77`
**Issue:** `createRoomDataClient()` 已经把“检测到 stale room，并尝试 `repairCachedRoom()` 后仍失败”的情况保留成 `room-repair` + `repair.kind === 'retryable-failure'`。但设置页导出链路没有延续这个语义：
- `utils/settingsFlow.js` 在 `handleExportLoadFailure()` 里只把 `repair.kind === 'success' && bound` 当成可重试，其余所有 `room-repair` 都直接走 `promptNavigateToBind()`。
- `pages/settings/settings.js` 在 `exportData()` 收到任意 `room-repair` 后，又调用 `syncRoomCode()`，而 `syncRoomCode()` 会把所有非 `success && bound` 的修复结果都改写成 `roomCodeDisplay: '未绑定'`。

结果是：当房间缓存过期，但 `getMyRoom` 只是暂时网络失败/云函数失败时，设置页会把“同步失败，请稍后重试”的状态错误地降级成“房间状态已变化，请重新绑定”，并在页面上继续显示“未绑定”。这正好违背了本轮复审要求里的两条：恢复失败必须保持可重试，设置页不能把这种故障标成未绑定。

我还做了最小复现：让 `exportRecordsAsJson()` 收到 `{ kind: 'room-repair', repair: { kind: 'retryable-failure', message: '同步房间状态失败：network down' } }`，当前实现弹出的仍然是“房间状态已变化 / 去绑定”而不是“重试”。

**Fix:** 把设置导出分支的 `room-repair` 处理改成与首页/`recordCommands` 一致的三态逻辑：
- `repair.kind === 'success' && bound`：提示“重试导出”。
- `repair.kind === 'success' && !bound`：提示重新绑定。
- 其他修复失败：保留为可重试故障，不要导航去绑定，也不要把页面状态改成“未绑定”。

```javascript
function handleExportLoadFailure(wxApi, outcome, retryExport, navigateToBind) {
  if (outcome.kind === 'room-repair') {
    const repair = outcome.repair || {}

    if (repair.kind === 'success' && repair.bound && repair.roomCode) {
      return promptRetry({
        wxApi,
        title: '房间状态已更新',
        content: '房间状态已更新，请重试导出',
        retryAction: retryExport,
        fallback: outcome
      })
    }

    if (repair.kind === 'success' && !repair.bound) {
      return promptNavigateToBind({
        wxApi,
        title: '房间状态已变化',
        content: '房间状态已变化，请重新绑定',
        navigateToBind,
        fallback: outcome
      })
    }

    return promptRetry({
      wxApi,
      title: '房间同步失败',
      content: repair.message || '同步房间状态失败，请稍后重试',
      retryAction: retryExport,
      fallback: outcome
    })
  }
}
```

同时，`pages/settings/settings.js` 不应在 `repair.kind !== 'success'` 时调用 `syncRoomCode()` 把页面降级成“未绑定”；应保留现有房间码，或明确显示“同步失败，请重试”。

## Warnings

### WR-01: [WARNING] 现有回归没有覆盖“room-repair 里的 repair 再次失败”分支，所以阻断问题整套 70 测试仍然全部通过

**File:** `tests/settings-flow.test.js:117-209`, `tests/page-registration.test.js:175-221`
**Issue:** 当前新测试只覆盖了两类场景：
- `retryable-failure` 直接发生在导出列表读取前。
- `room-repair` 且 `repair.kind === 'success'`，分别验证 `bound: true` 与 `bound: false`。

缺的正是这次仍然出错的分支：`room-repair` 已经发生，但 `repairCachedRoom()` 自己返回 `retryable-failure`。`tests/settings-flow.test.js` 没有单测这个结果，`tests/page-registration.test.js` 的 settings 页面 harness 也只断言了“导出后修复成功并更新房间码”。因此即使用户指定的 70 条相关测试全部通过，也无法阻止设置页继续把修复失败当成重新绑定/未绑定。

**Fix:** 至少补两条回归：
```javascript
test('exportRecordsAsJson keeps room repair failures retryable', async () => {
  const result = await settingsFlow.exportRecordsAsJson({
    wx,
    cloud: { createRoomDataClient: () => ({
      list: async () => ({
        kind: 'room-repair',
        roomCode: 'ROOM01',
        repair: { kind: 'retryable-failure', message: '同步房间状态失败：network down' }
      })
    }) }
  })

  assert.equal(modal.title, '房间同步失败')
  assert.equal(modal.confirmText, '重试')
})

test('settings page exportData does not relabel repair failures as unbound', async () => {
  // exportRecordsAsJson -> room-repair + repair.retryable-failure
  // assert roomCodeDisplay stays retryable instead of becoming 未绑定
})
```

---
_Reviewed: 2026-06-26T09:59:41.7010919Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
