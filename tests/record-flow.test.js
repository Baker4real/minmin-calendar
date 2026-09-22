const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

let recordCommands = {}
try {
  recordCommands = require('../utils/recordCommands')
} catch (error) {
  recordCommands = {}
}
let recordPageSync = {}
try {
  recordPageSync = require('../utils/recordPageSync')
} catch (error) {
  recordPageSync = {}
}

test('runRecordSave returns a validation outcome without calling cloud when validation fails', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const result = await recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return { kind: 'success', result: { code: 0 } }
    },
    validate: () => '结束日期不能早于开始',
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  assert.deepEqual(result, {
    kind: 'validation',
    message: '结束日期不能早于开始'
  })
  assert.equal(actionCalls, 0)
  assert.deepEqual(page.setDataCalls, [])
  assert.deepEqual(env.wx.toasts, [{ title: '结束日期不能早于开始', icon: 'none' }])
  assert.equal(env.navigateBackCalls.length, 0)
})

test('runRecordSave returns validation fallback when wx is null', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  let actionCalls = 0
  const result = await recordCommands.runRecordSave({
    page: createFakePage(),
    wx: null,
    timer: createFakeCommandEnv().timer,
    action: async () => {
      actionCalls += 1
      return { kind: 'success', result: { code: 0 } }
    },
    validate: () => '结束日期不能早于开始',
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  assert.deepEqual(result, {
    kind: 'validation',
    message: '结束日期不能早于开始'
  })
  assert.equal(actionCalls, 0)
})

test('runRecordSave clears saving state, shows success toast, and schedules one navigateBack on success', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()

  const result = await recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({ kind: 'success', result: { code: 0 } }),
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  assert.equal(result.kind, 'success')
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.deepEqual(env.wx.toasts, [{ title: '保存成功' }])
  assert.equal(env.timer.calls.length, 1)
  assert.equal(env.timer.calls[0].delay, 1000)
  assert.equal(env.navigateBackCalls.length, 0)

  env.timer.calls[0].fn()
  assert.equal(env.navigateBackCalls.length, 1)
})

test('runRecordSave supports warm success feedback without the system checkmark icon', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()

  const result = await recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({ kind: 'success', result: { code: 0 } }),
    validate: null,
    successTitle: '已存进你们的欢乐时光',
    successIcon: 'none',
    failureTitle: '保存失败'
  })

  assert.equal(result.kind, 'success')
  assert.deepEqual(env.wx.toasts, [{ title: '已存进你们的欢乐时光', icon: 'none' }])
  assert.equal(env.timer.calls.length, 1)
})

test('record page sync notifies the previous page without requiring a reload', () => {
  assert.equal(typeof recordPageSync.notifyPreviousPageRecordChange, 'function')
  assert.equal(typeof recordPageSync.getSavedRecord, 'function')

  const changes = []
  const notified = recordPageSync.notifyPreviousPageRecordChange(
    {
      collection: 'memories',
      mode: 'add',
      record: { _id: 'm1', date: '2026-07-03', note: 'second' }
    },
    {
      getCurrentPages: () => [
        { route: 'pages/index/index' },
        { route: 'pages/memory/edit/edit' }
      ].map((page, index) => index === 0
        ? { ...page, applyRecordChange: change => changes.push(change) }
        : page)
    }
  )

  assert.equal(notified, true)
  assert.deepEqual(changes, [
    {
      collection: 'memories',
      mode: 'add',
      record: { _id: 'm1', date: '2026-07-03', note: 'second' }
    }
  ])
  assert.deepEqual(
    recordPageSync.getSavedRecord({
      kind: 'success',
      result: { record: { _id: 'm2', date: '2026-06-24', note: 'canonical' } }
    }),
    { _id: 'm2', date: '2026-06-24', note: 'canonical' }
  )
  assert.equal(
    recordPageSync.getSavedRecord({ kind: 'success', result: { id: 'm2' } }),
    null
  )
  assert.equal(
    recordPageSync.getSavedRecord({ kind: 'business-failure' }),
    null
  )
})

test('runRecordSave does not replay unknown save mutations after retryable failures', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      if (actionCalls === 1) {
        return {
          kind: 'retryable-failure',
          message: '云数据库查询超时 (15000ms)'
        }
      }
      return { kind: 'success', result: { code: 0 } }
    },
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    action: 'refresh-check',
    message: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
  })
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.deepEqual(modal, {
    title: '保存失败',
    content: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交',
    confirmText: '知道了',
    showCancel: false,
    success: modal.success
  })
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
  assert.equal(env.navigateBackCalls.length, 0)
  assert.equal(actionCalls, 1)
})

test('runRecordSave returns acknowledge fallback when modal and toast are unavailable', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  let actionCalls = 0

  const result = await recordCommands.runRecordSave({
    page,
    wx: {},
    timer: createFakeCommandEnv().timer,
    action: async () => {
      actionCalls += 1
      return {
        kind: 'retryable-failure',
        message: 'network down'
      }
    },
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    action: 'refresh-check',
    message: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
  })
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.equal(actionCalls, 1)
})

test('runRecordSave offers to rebind when room repair cannot restore membership', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()

  const promise = recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({
      kind: 'room-repair',
      roomCode: 'ROOM01',
      repair: {
        kind: 'success',
        bound: false,
        roomCode: ''
      }
    }),
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'room-repair',
    action: 'rebind',
    message: '房间状态已变化，请重新绑定',
    roomCode: 'ROOM01',
    repair: {
      kind: 'success',
      bound: false,
      roomCode: ''
    }
  })
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.deepEqual(env.navigateToCalls, [{ url: '/pages/bind/bind' }])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
})

test('runRecordSave keeps room repair sync failures visible without replaying the mutation', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return {
        kind: 'room-repair',
        roomCode: 'ROOM01',
        repair: {
          kind: 'retryable-failure',
          message: '同步房间状态失败：network down'
        }
      }
    },
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'room-repair',
    action: 'refresh-check',
    message: '同步房间状态失败：network down\n\n保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交',
    roomCode: 'ROOM01',
    repair: {
      kind: 'retryable-failure',
      message: '同步房间状态失败：network down'
    }
  })
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.deepEqual(modal, {
    title: '保存失败',
    content: '同步房间状态失败：network down\n\n保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交',
    confirmText: '知道了',
    showCancel: false,
    success: modal.success
  })
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
  assert.equal(env.navigateBackCalls.length, 0)
  assert.equal(actionCalls, 1)
})

test('runRecordDelete keeps modal confirmation and success feedback behavior', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return { kind: 'success', result: { code: 0 } }
    },
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)
  assert.equal(actionCalls, 0)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }])

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'success')
  assert.equal(actionCalls, 1)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: true }, { deleting: false }])
  assert.deepEqual(env.wx.toasts, [{ title: '已删除' }])
  assert.equal(env.timer.calls.length, 1)
  env.timer.calls[0].fn()
  assert.equal(env.navigateBackCalls.length, 1)
})

test('runRecordDelete shows the caller-provided shared consequence copy in the confirm modal', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({ kind: 'success', result: { code: 0 } }),
    confirmTitle: '确认删除',
    confirmContent: '删除后你们两人的日历都会移除这条经期记录，且不可恢复',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)
  assert.equal(env.wx.modals[0].title, '确认删除')
  assert.equal(env.wx.modals[0].content, '删除后你们两人的日历都会移除这条经期记录，且不可恢复')

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, { kind: 'cancelled' })
})

test('runRecordDelete omits modal content when no consequence copy is provided', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({ kind: 'success', result: { code: 0 } }),
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)
  assert.equal('content' in env.wx.modals[0], false)

  await env.wx.resolveModal(false, promise)
})

test('runRecordDelete cancels safely when modal is unavailable', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  let actionCalls = 0
  const result = await recordCommands.runRecordDelete({
    page: createFakePage(),
    wx: {},
    timer: createFakeCommandEnv().timer,
    action: async () => {
      actionCalls += 1
      return { kind: 'success', result: { code: 0 } }
    },
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.deepEqual(result, { kind: 'cancelled' })
  assert.equal(actionCalls, 0)
})

test('runRecordDelete locks deleting before the confirm modal and releases it on cancel', async () => {
  const page = createFakePage()
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return { kind: 'success', result: { code: 0 } }
    },
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }])

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, { kind: 'cancelled' })
  assert.equal(actionCalls, 0)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: false }])
})

test('runRecordDelete does not replay unknown delete mutations after retryable failures', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return {
        kind: 'retryable-failure',
        message: 'network down'
      }
    },
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)

  await env.wx.resolveModal(true)
  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    action: 'refresh-check',
    message: '删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作'
  })
  assert.equal(actionCalls, 1)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: true }, { deleting: false }])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
})

test('runRecordDelete keeps room repair sync failures visible without replaying the mutation', async () => {
  assert.equal(typeof recordCommands.runRecordDelete, 'function')

  const page = createFakePage()
  const env = createFakeCommandEnv()
  let actionCalls = 0

  const promise = recordCommands.runRecordDelete({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => {
      actionCalls += 1
      return {
        kind: 'room-repair',
        roomCode: 'ROOM01',
        repair: {
          kind: 'retryable-failure',
          message: '同步房间状态失败：network down'
        }
      }
    },
    confirmTitle: '确认删除',
    successTitle: '已删除',
    failureTitle: '删除失败'
  })

  assert.equal(env.wx.modals.length, 1)

  await env.wx.resolveModal(true)
  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'room-repair',
    action: 'refresh-check',
    message: '同步房间状态失败：network down\n\n删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作',
    roomCode: 'ROOM01',
    repair: {
      kind: 'retryable-failure',
      message: '同步房间状态失败：network down'
    }
  })
  assert.equal(actionCalls, 1)
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: true }, { deleting: false }])
  assert.deepEqual(modal, {
    title: '删除失败',
    content: '同步房间状态失败：network down\n\n删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作',
    confirmText: '知道了',
    showCancel: false,
    success: modal.success
  })
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
})

test('runRecordListLoad sorts and decorates periods while preserving stats input', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })
  const env = createFakeCommandEnv()
  const rawPeriods = [
    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5, note: '较轻' },
    { _id: 'p2', startDate: '2026-07-03', endDate: '2026-07-07', duration: 5, note: '' }
  ]
  const calcStatsCalls = []

  const result = await recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'loading',
    itemsKey: 'periods',
    action: async () => ({ kind: 'success', data: rawPeriods }),
    mapRecords: records => [...records]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(period => ({ ...period, decorated: true })),
    onLoaded: records => calcStatsCalls.push(records),
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  assert.equal(result.kind, 'success')
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    {
      periods: [
        { _id: 'p2', startDate: '2026-07-03', endDate: '2026-07-07', duration: 5, note: '', decorated: true },
        { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5, note: '较轻', decorated: true }
      ],
      loadFailed: false
    },
    { loading: false }
  ])
  assert.deepEqual(calcStatsCalls, [rawPeriods])
  assert.deepEqual(env.wx.toasts, [])
})

test('runRecordListLoad surfaces a retry action and reloads memories when the user confirms', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })
  const env = createFakeCommandEnv()
  let retried = false
  let actionCalls = 0

  const promise = recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => {
      actionCalls += 1
      if (actionCalls === 1) {
        return {
          kind: 'retryable-failure',
          message: 'network down',
          retry: async () => ({ kind: 'success', data: [] })
        }
      }
      retried = true
      return { kind: 'success', data: [] }
    },
    mapRecords: records => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, { kind: 'success', data: [] })
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    { loading: false },
    { loading: true },
    { memories: [], loadFailed: false },
    { loading: false }
  ])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(retried, true)
  assert.equal(actionCalls, 2)
})

test('runRecordListLoad marks loadFailed after the user cancels retry', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })
  const env = createFakeCommandEnv()

  const promise = recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => ({
      kind: 'retryable-failure',
      message: 'network down'
    }),
    mapRecords: records => records,
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    message: 'network down'
  })
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    { loading: false },
    { loadFailed: true }
  ])
})

test('runRecordListLoad returns retry fallback when modal and toast are unavailable', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })

  const result = await recordCommands.runRecordListLoad({
    page,
    wx: {},
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => ({
      kind: 'retryable-failure',
      message: 'network down'
    }),
    mapRecords: records => records,
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    message: 'network down'
  })
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    { loading: false },
    { loadFailed: true }
  ])
})

test('runRecordListLoad returns bind fallback when wx is null', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })

  const result = await recordCommands.runRecordListLoad({
    page,
    wx: null,
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => ({ kind: 'no-room' }),
    mapRecords: records => records,
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  assert.deepEqual(result, {
    kind: 'no-room',
    message: '请先绑定房间'
  })
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    { loading: false },
    { loadFailed: true }
  ])
})

test('runRecordListLoad keeps room repair sync failures retryable when the user confirms', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })
  const env = createFakeCommandEnv()
  let retried = false
  let actionCalls = 0

  const promise = recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => {
      actionCalls += 1
      if (actionCalls === 1) {
        return {
          kind: 'room-repair',
          roomCode: 'ROOM01',
          repair: {
            kind: 'retryable-failure',
            message: '同步房间状态失败：network down'
          }
        }
      }
      retried = true
      return { kind: 'success', data: [] }
    },
    mapRecords: records => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  await Promise.resolve()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, { kind: 'success', data: [] })
  assert.deepEqual(modal, {
    title: '加载失败',
    content: '同步房间状态失败：network down',
    confirmText: '重试',
    cancelText: '取消',
    success: modal.success
  })
  assert.deepEqual(page.setDataCalls, [
    { loading: true },
    { loading: false },
    { loading: true },
    { memories: [], loadFailed: false },
    { loading: false }
  ])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(retried, true)
  assert.equal(actionCalls, 2)
})

test('period and memory list templates keep the REC-03 visible row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')

  assert.match(periodWxml, /\{\{item\.startDate\}\}\s*~\s*\{\{item\.endDate\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}"/)
  assert.doesNotMatch(periodWxml, /无备注/)
  assert.match(periodWxml, /\{\{item\.duration\}\}天/)

  assert.match(memoryWxml, /\{\{item\.date\}\}/)
  assert.match(memoryWxml, /\{\{item\.note \|\| '我们的欢乐时光'\}\}/)
})

test('record list pages show load-failed retry copy and hide period stats while loading', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  const periodJs = readPageFile('pages/period/period.js')
  const memoryJs = readPageFile('pages/memory/memory.js')

  assert.match(periodJs, /loadFailed:\s*false/)
  assert.match(memoryJs, /loadFailed:\s*false/)
  assert.match(periodWxml, /loadFailed/)
  assert.match(memoryWxml, /loadFailed/)
  assert.match(periodWxml, /加载失败，点按重试/)
  assert.match(memoryWxml, /加载失败，点按重试/)
  assert.match(periodWxml, /wx:if="\{\{!loading\}\}"[^>]*>\{\{periods\.length\}\}/)
  assert.match(periodWxml, /wx:if="\{\{!loading\}\}"[^>]*>\{\{avgCycle \|\| '--'\}\}/)
  assert.match(periodWxml, /wx:if="\{\{!loading\}\}"[^>]*>\{\{avgDuration \|\| '--'\}\}/)
})

test('record edit pages isolate delete loading, constrain period dates, and cap notes', () => {
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  const memoryEditJs = readPageFile('pages/memory/edit/edit.js')
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  assert.match(periodEditJs, /deleting:\s*false/)
  assert.match(memoryEditJs, /deleting:\s*false/)
  assert.match(periodEditJs, /if\s*\(\s*this\.data\.deleting\s*\)\s*return/)
  assert.match(memoryEditJs, /if\s*\(\s*this\.data\.deleting\s*\)\s*return/)
  assert.match(periodEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\)\s*return/)
  assert.match(memoryEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\)\s*return/)

  assert.match(periodEditWxml, /删除中\.\.\./)
  assert.match(memoryEditWxml, /删除中\.\.\./)
  assert.match(periodEditWxml, /wx:if="\{\{!saving && !deleting\}\}"/)
  assert.match(memoryEditWxml, /wx:if="\{\{!saving && !deleting\}\}"/)
  assert.match(periodEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(memoryEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(periodEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(memoryEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(periodEditWxml, /end="\{\{endDate\}\}"/)
  assert.match(periodEditWxml, /start="\{\{startDate\}\}"/)
  assert.match(periodEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /wx:if="\{\{isEdit\}\}"[\s\S]*编辑欢乐时光/)
  assert.match(memoryEditWxml, /wx:else[\s\S]*新增欢乐时光/)
})

test('record edit pages confirm deletes with type-specific shared consequence copy', () => {
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  const memoryEditJs = readPageFile('pages/memory/edit/edit.js')

  assert.match(periodEditJs, /confirmContent:\s*'删除后你们两人的日历都会移除这条经期记录，且不可恢复'/)
  assert.match(memoryEditJs, /confirmContent:\s*'删除后你们两人的日历都会移除这条欢乐时光，且不可恢复'/)
})

test('memory edit page greets a saved happy time with warm two-person feedback', () => {
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  const memoryEditJs = readPageFile('pages/memory/edit/edit.js')

  assert.match(memoryEditJs, /successTitle:\s*'已存进你们的欢乐时光'/)
  assert.match(memoryEditJs, /successIcon:\s*'none'/)
  assert.doesNotMatch(memoryEditJs, /successTitle:\s*'保存成功'/)
  assert.match(periodEditJs, /successTitle:\s*'保存成功'/)
})

test('record pages delegate feedback to shared record command helpers', () => {
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  const memoryEditJs = readPageFile('pages/memory/edit/edit.js')
  const periodListJs = readPageFile('pages/period/period.js')
  const memoryListJs = readPageFile('pages/memory/memory.js')

  assert.match(periodEditJs, /runRecordSave\(/)
  assert.match(periodEditJs, /runRecordDelete\(/)
  assert.doesNotMatch(periodEditJs, /res\.result/)

  assert.match(memoryEditJs, /runRecordSave\(/)
  assert.match(memoryEditJs, /runRecordDelete\(/)
  assert.doesNotMatch(memoryEditJs, /res\.result/)

  assert.match(periodListJs, /runRecordListLoad\(/)
  assert.doesNotMatch(periodListJs, /cloud\.getPeriods\(/)

  assert.match(memoryListJs, /runRecordListLoad\(/)
  assert.doesNotMatch(memoryListJs, /cloud\.getMemories\(/)
})

function createFakePage(initialData = {}) {
  return {
    data: { ...initialData },
    setDataCalls: [],
    setData(update) {
      this.setDataCalls.push(update)
      this.data = { ...this.data, ...update }
    }
  }
}

function createFakeCommandEnv() {
  const toasts = []
  const modals = []
  const navigateBackCalls = []
  const navigateToCalls = []
  const timerCalls = []

  return {
    navigateBackCalls,
    navigateToCalls,
    timer: {
      calls: timerCalls,
      setTimeout(fn, delay) {
        timerCalls.push({ fn, delay })
        return timerCalls.length
      }
    },
    wx: {
      toasts,
      modals,
      showToast(options) {
        toasts.push(options)
      },
      showModal(options) {
        modals.push(options)
      },
      async resolveModal(confirm, promise) {
        const modal = modals.shift()
        assert.ok(modal, 'expected a pending modal')
        await modal.success({ confirm, cancel: !confirm })
        return promise ? promise : undefined
      },
      navigateBack() {
        navigateBackCalls.push({ at: navigateBackCalls.length })
      },
      navigateTo(options) {
        navigateToCalls.push(options)
      }
    }
  }
}

function readPageFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}
