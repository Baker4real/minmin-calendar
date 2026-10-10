const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

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
// 卡头条数与首页本月小结对照用（issue #108：两处数字必须同口径）
const calendarInsights = require('../utils/calendarInsights')

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

test('runRecordSave enters submitted-waiting state, shows success toast, and schedules one navigateBack on success', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false, submitted: false })
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
  // 成功后清掉「保存中」，但进入已提交、等待返回：按钮保持不可点，直到 navigateBack
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false, submitted: true }])
  assert.equal(page.data.saving, false)
  assert.equal(page.data.submitted, true)
  assert.deepEqual(env.wx.toasts, [{ title: '保存成功' }])
  assert.equal(env.timer.calls.length, 1)
  assert.equal(env.timer.calls[0].delay, 1000)
  assert.equal(env.navigateBackCalls.length, 0)

  env.timer.calls[0].fn()
  assert.equal(env.navigateBackCalls.length, 1)
  assert.equal(page.data.submitted, true)
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

test('runRecordSave classifies a reopened save as merged and explains it with a modal instead of the success toast', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()
  const persistedRecord = {
    _id: 'p1',
    startDate: '2026-09-10',
    endDate: '',
    status: 'ongoing',
    note: '已经记录过的经期',
    duration: 0,
    flow: 'normal',
    symptoms: ['tired']
  }

  const promise = recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({
      kind: 'success',
      result: { code: 0, id: 'p1', reopened: true, record: persistedRecord }
    }),
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败',
    mergedTitle: '已打开进行中的经期',
    mergedContent: '房间里已有一条进行中的经期，已为你打开它'
  })

  await Promise.resolve()
  // 合并到已有进行中记录：不显示「保存成功」、不排返回，改用单按钮说明 modal
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.timer.calls.length, 0)
  assert.equal(env.navigateBackCalls.length, 0)
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]
  assert.deepEqual(modal, {
    title: '已打开进行中的经期',
    content: '房间里已有一条进行中的经期，已为你打开它',
    showCancel: false,
    confirmText: '知道了',
    success: modal.success
  })
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])

  const result = await env.wx.resolveModal(true, promise)
  assert.deepEqual(result, {
    kind: 'merged',
    result: { code: 0, id: 'p1', reopened: true, record: persistedRecord }
  })
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
  assert.deepEqual(
    recordPageSync.getSavedRecord({
      kind: 'merged',
      result: { record: { _id: 'p9', startDate: '2026-09-10', endDate: '', status: 'ongoing' } }
    }),
    { _id: 'p9', startDate: '2026-09-10', endDate: '', status: 'ongoing' }
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
  assert.deepEqual(page.setDataCalls, [])

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'success')
  assert.equal(actionCalls, 1)
  // 删除成功同样进入已提交、等待返回：文案不再是「删除中」，按钮保持不可点
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: false, submitted: true }])
  assert.equal(page.data.deleting, false)
  assert.equal(page.data.submitted, true)
  assert.deepEqual(env.wx.toasts, [{ title: '已删除' }])
  assert.equal(env.timer.calls.length, 1)
  assert.equal(env.timer.calls[0].delay, undefined)
  assert.equal(env.navigateBackCalls.length, 0)
  env.timer.calls[0].fn()
  assert.equal(env.navigateBackCalls.length, 1)
  assert.equal(page.data.submitted, true)
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

test('runRecordDelete stays idle before the confirm modal and only turns busy after confirming', async () => {
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

  // 确认之前不进入删除忙碌态：按钮仍读「删除此记录」，可再次点按
  assert.equal(env.wx.modals.length, 1)
  assert.deepEqual(page.setDataCalls, [])
  assert.equal(page.data.deleting, undefined)

  const result = await env.wx.resolveModal(false, promise)

  // 取消后按钮回到可点的删除，无需复位任何忙碌态
  assert.deepEqual(result, { kind: 'cancelled' })
  assert.equal(actionCalls, 0)
  assert.deepEqual(page.setDataCalls, [])
  assert.equal(page.data.deleting, undefined)
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
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: false }])
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
  assert.deepEqual(page.setDataCalls, [{ deleting: true }, { deleting: false }])
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

test('runRecordListLoad honors a custom loadFailedKey so two lists on one page keep independent failure state', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ memoryLoading: false })
  const env = createFakeCommandEnv()

  const promise = recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'memoryLoading',
    loadFailedKey: 'memoryLoadFailed',
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
  // 取消重试后只置位自定义失败键；默认 loadFailed 不被触碰，两个列表互不污染
  assert.deepEqual(page.setDataCalls, [
    { memoryLoading: true },
    { memoryLoading: false },
    { memoryLoadFailed: true }
  ])

  const recovery = createFakePage({ memoryLoading: false })
  const success = await recordCommands.runRecordListLoad({
    page: recovery,
    wx: env.wx,
    loadingKey: 'memoryLoading',
    loadFailedKey: 'memoryLoadFailed',
    itemsKey: 'memories',
    action: async () => ({ kind: 'success', data: [{ _id: 'm1', date: '2026-06-01' }] }),
    mapRecords: records => records
  })

  assert.equal(success.kind, 'success')
  assert.deepEqual(recovery.setDataCalls, [
    { memoryLoading: true },
    { memories: [{ _id: 'm1', date: '2026-06-01' }], memoryLoadFailed: false },
    { memoryLoading: false }
  ])
})

test('period and memory list templates keep the REC-03 visible row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')

  // 日期行绑定状态化展示值：已知结束显示结束日期，进行中/不详显示状态文案
  assert.match(periodWxml, /\{\{item\.startDate\}\}\s*~\s*\{\{item\.endDateDisplay\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}"/)
  assert.doesNotMatch(periodWxml, /无备注/)
  // 已完成记录仍以「N天」呈现时长；进行中/结束日期不详由状态文案占住时长位
  assert.match(periodWxml, /wx:if="\{\{item\.status === 'known-end'\}\}" class="item-duration">\{\{item\.durationText\}\}/)
  assert.match(periodWxml, /class="item-duration ongoing">\{\{item\.durationText\}\}/)

  assert.match(memoryWxml, /\{\{item\.date\}\}/)
  // 没有备注的欢乐时光不显示备注句；真实写下的备注（含与旧占位句相同的文字）照常显示
  assert.match(memoryWxml, /wx:if="\{\{item\.note\}\}"[^>]*>\{\{item\.note\}\}/)
  assert.doesNotMatch(memoryWxml, /我们的欢乐时光'/)

  // 经量标签带 flow 变体类（玫瑰角色只落在经量上），症状标签保持中性的基础类
  assert.match(periodWxml, /wx:if="\{\{item\.flowLabel\}\}" class="item-tag flow">\{\{item\.flowLabel\}\}/)
  assert.match(periodWxml, /wx:for="\{\{item\.symptomLabels\}\}"[\s\S]*?class="item-tag"[\s\S]*?>\{\{tag\}\}/)
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
  // 首次加载失败不显示确信的 0：数字只在未失败或曾成功加载时呈现，否则落到 -- 占位
  assert.match(periodWxml, /wx:if="\{\{!loading && \(!loadFailed \|\| hasLoaded\)\}\}"[^>]*class="cycle-num">\{\{periods\.length\}\}/)
  assert.match(periodWxml, /wx:elif="\{\{!loading\}\}"[^>]*class="cycle-num">--</)
  assert.match(periodWxml, /wx:if="\{\{!loading\}\}"[^>]*>\{\{avgCycle \|\| '--'\}\}/)
  assert.match(periodWxml, /wx:if="\{\{!loading\}\}"[^>]*>\{\{avgDuration \|\| '--'\}\}/)
  assert.match(periodJs, /hasLoaded:\s*false/)
  assert.match(periodJs, /onLoaded: periods => \{[\s\S]*?hasLoaded: true/)
})

test('period list failure retry is a recognizable operation, distinct from the quiet empty note', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 首次失败卡：说明句 + 玫瑰重试按钮；整卡可点并保留读屏名称
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && !hasLoaded && !loading\}\}" class="empty-state load-failed" bindtap="loadData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">经期记录加载失败</)
  assert.match(periodWxml, /class="retry-btn">重试</)

  // 真空态仍是安静说明：不带重试按钮，也不可点；失败期间不显示断言式空态句（!loadFailed）
  const emptyBlock = /wx:elif="\{\{periods\.length === 0 && !loading && !loadFailed\}\}" class="empty-state">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the genuine empty state block')
  assert.match(emptyBlock[1], /还没有经期记录/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 重试按钮是玫瑰底海军字的小操作，触控目标 88rpx（750rpx 设计宽 = 44px@375px，非日历可点控件统一 88rpx 档）
  const retryRule = /\.retry-btn\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryRule, 'expected the .retry-btn rule')
  assert.match(retryRule[0], /background:\s*var\(--aurora-pink\)/)
  assert.match(retryRule[0], /color:\s*#0A0E27/)
  assert.match(retryRule[0], /min-height:\s*88rpx/)
})

test('period list keeps last data on refresh failure and offers retry in the list area', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 已成功加载过再失败：列表分支不再被失败态顶掉，重试行留在列表区域
  assert.match(periodWxml, /wx:elif="\{\{periods\.length > 0 && !loading\}\}" class="premium-card"/)
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && hasLoaded && !loading\}\}" class="list-retry" bindtap="loadData" aria-role="button" aria-label="刷新失败，点按重试"/
  )
  assert.match(periodWxml, /class="list-retry-text">刷新失败，正在显示上次的内容</)
  assert.match(periodWxml, /class="retry-btn">重试</)

  // 重试行可点高度 ≥44px，说明句保持次级文字色（可读但不抢操作）
  const retryRow = /\.list-retry\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryRow, 'expected the .list-retry rule')
  assert.match(retryRow[0], /min-height:\s*88rpx/)
  const retryText = /\.list-retry-text\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryText, 'expected the .list-retry-text rule')
  assert.match(retryText[0], /color:\s*var\(--text-secondary\)/)
})

test('memory list failure retry reads as an operation, not the quiet empty note', () => {
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  const memoryWxss = readPageFile('pages/memory/memory.wxss')
  const memoryJs = readPageFile('pages/memory/memory.js')

  // 整卡失败态只在从未成功加载时出现；已加载后的失败保留列表，改走列表区重试行
  assert.match(
    memoryWxml,
    /wx:if="\{\{loadFailed && !hasLoaded && !loading\}\}" class="empty-state load-failed" bindtap="loadData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(memoryWxml, /class="load-failed-text">欢乐时光加载失败</)
  assert.match(memoryWxml, /class="retry-btn">重试</)

  // 空列表说明保持安静：没有按钮、不可点；失败期间不显示断言式空态句（与经期列表一致）
  const emptyBlock = /wx:elif="\{\{memories\.length === 0 && !loading && !loadFailed\}\}" class="empty-state">([\s\S]*?)<\/view>/.exec(memoryWxml)
  assert.ok(emptyBlock, 'expected the genuine empty state block')
  assert.match(emptyBlock[1], /还没有记录/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 已加载后失败：列表保留，重试行留在列表区域（玫瑰重试按钮沿用 #76 样式）
  assert.match(
    memoryWxml,
    /wx:if="\{\{loadFailed && hasLoaded && !loading\}\}" class="list-item" bindtap="loadData" aria-role="button" aria-label="刷新失败，点按重试"/
  )
  assert.match(memoryWxml, /class="memory-note">刷新失败，正在显示上次的内容</)

  // hasLoaded 经 onLoaded 接线，与 period 页同模式
  assert.match(memoryJs, /hasLoaded:\s*false/)
  assert.match(memoryJs, /onLoaded:[\s\S]*?hasLoaded: true/)

  const retryRule = /\.retry-btn\s*\{[^}]*\}/.exec(memoryWxss)
  assert.ok(retryRule, 'expected the .retry-btn rule')
  assert.match(retryRule[0], /background:\s*var\(--aurora-pink\)/)
  assert.match(retryRule[0], /color:\s*#0A0E27/)
  assert.match(retryRule[0], /min-height:\s*88rpx/)
})

test('period list first failure keeps hasLoaded false, then a retry loads records', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) return { kind: 'retryable-failure', message: 'network down' }
              return {
                kind: 'success',
                data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }]
              }
            }
          }
        }
      },
      'utils/cycle.js': {
        decoratePeriod(period) {
          return period
        },
        getPeriodDuration(period) {
          return stubGetPeriodDuration(period)
        },
        predictNextPeriod() {
          return { canPredict: false, avgCycle: null, avgDuration: null }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()

    // 首次失败：没有确信数据，页面态明确区分「从未成功加载」
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, false)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.periods, [])

    // 列表区域的重试入口重新走 loadData，成功后失败态清空
    await harness.page.loadData()
    assert.equal(harness.page.data.loadFailed, false)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.periods.length, 1)
  } finally {
    harness.teardown()
  }
})

test('period list retains last records and stats when a later refresh fails', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) {
                return {
                  kind: 'success',
                  data: [
                    { _id: 'p2', startDate: '2026-07-03', endDate: '2026-07-07', duration: 5 },
                    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }
                  ]
                }
              }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      },
      'utils/cycle.js': {
        decoratePeriod(period) {
          return period
        },
        predictNextPeriod(periods) {
          return { canPredict: true, avgCycle: 32, avgDuration: 5, periods }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.periods.length, 2)
    assert.equal(harness.page.data.avgCycle, 32)
    assert.equal(harness.page.data.avgDuration, 5)

    // 已成功加载过之后再失败：数字与列表保留，只是标记失败并提供重试
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.periods.length, 2)
    assert.equal(harness.page.data.avgCycle, 32)
    assert.equal(harness.page.data.avgDuration, 5)
  } finally {
    harness.teardown()
  }
})

test('period list duration stat counts only completed records and stays unknown without any known end', async () => {
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'done', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 },
                  { _id: 'foggy', startDate: '2026-07-01', endDate: '', status: 'unknown-end', duration: 9 },
                  { _id: 'live', startDate: '2026-08-01', endDate: '', status: 'ongoing', duration: 9 }
                ]
              }
            }
          }
        }
      }
    }
  })

  try {
    await harness.page.onShow()

    // 进行中与结束日期不详不进持续天数统计：唯一已知时长是 3 天
    assert.equal(harness.page.data.avgDuration, 3)
  } finally {
    harness.teardown()
  }

  const incompleteOnly = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'a', startDate: '2026-07-01', endDate: '', status: 'unknown-end', duration: 9 },
                  { _id: 'b', startDate: '2026-07-29', endDate: '', status: 'unknown-end', duration: 9 }
                ]
              }
            }
          }
        }
      }
    }
  })

  try {
    await incompleteOnly.page.onShow()

    // 没有任何已知结束：预测落在五天默认档也不冒充已知统计，页面显示 -- 占位
    assert.equal(incompleteOnly.page.data.avgDuration, null)
    assert.equal(incompleteOnly.page.data.avgCycle, 28)
  } finally {
    incompleteOnly.teardown()
  }
})

test('period list keeps the 0 count and retry row without the assertive empty note after a 0-record success then refresh failure', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) return { kind: 'success', data: [] }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      },
      'utils/cycle.js': {
        decoratePeriod(period) {
          return period
        },
        getPeriodDuration(period) {
          return stubGetPeriodDuration(period)
        },
        predictNextPeriod() {
          return { canPredict: false, avgCycle: null, avgDuration: null }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    // 成功加载 0 条：这是确认过的真空态
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoaded, true)
    assert.deepEqual(harness.page.data.periods, [])

    // 再刷新失败：数字保留上次值 0、重试在场、断言式空态句不再出现
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.periods, [])

    // 在该组合态下渲染的是：数字 0（hasLoaded 保留）、无空态句（!loadFailed 压住）、列表区重试行
    const periodWxml = readPageFile('pages/period/period.wxml')
    assert.match(periodWxml, /wx:if="\{\{!loading && \(!loadFailed \|\| hasLoaded\)\}\}"[^>]*class="cycle-num">\{\{periods\.length\}\}/)
    assert.match(periodWxml, /wx:elif="\{\{periods\.length === 0 && !loading && !loadFailed\}\}" class="empty-state">/)
    assert.match(periodWxml, /wx:if="\{\{loadFailed && hasLoaded && !loading\}\}" class="list-retry" bindtap="loadData"/)
  } finally {
    harness.teardown()
  }
})

test('memory list failure marks loadFailed and recovers through the retry entry', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) return { kind: 'retryable-failure', message: 'network down' }
              return {
                kind: 'success',
                data: [{ _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }]
              }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.memories, [])

    await harness.page.loadData()
    assert.equal(harness.page.data.loadFailed, false)
    assert.deepEqual(harness.page.data.memories, [
      { _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }
    ])
  } finally {
    harness.teardown()
  }
})

test('memory list first failure keeps hasLoaded false so only the whole failure card can show', async () => {
  const harness = loadRecordPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    // 从未成功加载就失败：hasLoaded 保持 false，整卡失败态条件成立、列表区重试行条件不成立
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, false)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.memories, [])
  } finally {
    harness.teardown()
  }
})

test('memory list keeps records and turns to the list-area retry row when a later refresh fails', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) {
                return {
                  kind: 'success',
                  data: [{ _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }]
                }
              }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.memories.length, 1)

    // 已加载后再刷新失败：旧列表保留（不被失败卡整卡替换），hasLoaded 继续为真
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.memories, [
      { _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }
    ])
  } finally {
    harness.teardown()
  }
})

test('memory list hides the assertive empty note after a 0-record success then refresh failure', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) return { kind: 'success', data: [] }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoaded, true)
    assert.deepEqual(harness.page.data.memories, [])

    // 已加载 0 条后再失败：与 period 修复后的行为一致——重试在场、无断言式空态句
    await harness.page.onShow()
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(harness.page.data.memories, [])
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment mirrors the standalone memory list state contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodJs = readPageFile('pages/period/period.js')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 整卡失败态只在从未成功加载时出现；已加载后的失败保留列表，改走列表区重试行
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && !memoryHasLoaded && !memoryLoading\}\}" class="empty-state load-failed" bindtap="loadMemoryData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">欢乐时光加载失败</)
  assert.match(periodWxml, /class="retry-btn">重试</)

  // 空列表说明保持安静：没有按钮、不可点；失败期间不显示断言式空态句
  const emptyBlock = /wx:elif="\{\{memories\.length === 0 && !memoryLoading && !memoryLoadFailed\}\}" class="empty-state">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the memory segment empty state block')
  assert.match(emptyBlock[1], /还没有记录/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 已加载后失败：列表保留，重试行留在列表区域
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && memoryHasLoaded && !memoryLoading\}\}" class="list-item" bindtap="loadMemoryData" aria-role="button" aria-label="刷新失败，点按重试"/
  )
  assert.match(periodWxml, /class="memory-note">刷新失败，正在显示上次的内容</)

  // 欢乐时光骨架是圆点变体（经期侧是 pill，形态差异刻意保留），复用已注册的 skeletonPulse
  assert.match(periodWxml, /wx:if="\{\{memoryLoading\}\}" class="skeleton-card"/)
  assert.match(periodWxml, /class="skeleton-dot"/)
  const dotRule = /\.skeleton-dot\s*\{[^}]*skeletonPulse[^}]*\}/.exec(periodWxss)
  assert.ok(dotRule, 'expected the base .skeleton-dot rule')
  assert.match(dotRule[0], /animation:\s*skeletonPulse 2\.4s ease-in-out infinite/)
  // RM 下骨架圆点静止（与经期侧 skeleton-line/skeleton-pill 同块登记）
  const rmBlock = periodWxss.slice(periodWxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(rmBlock, /\.skeleton-dot/)

  // memory 侧状态键经 onLoaded 接线，与经期侧同模式
  assert.match(periodJs, /memoryLoadFailed:\s*false/)
  assert.match(periodJs, /memoryHasLoaded:\s*false/)
  assert.match(periodJs, /onLoaded:[\s\S]*?memoryHasLoaded: true/)
})

test('record tab memory segment renders month cards with the grouped row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 月份卡：复用 app 级玻璃卡 premium-card，列表分支遍历分组数组；四态条件仍挂在扁平 memories 上
  assert.match(
    periodWxml,
    /wx:elif="\{\{memories\.length > 0 && !memoryLoading\}\}" class="memory-month-list"/
  )
  assert.match(periodWxml, /class="premium-card month-card" wx:for="\{\{memoryGroups\}\}" wx:key="key"/)

  // 卡头（issue #109）：点按切换展开/收起，按 button 朗读，aria-expanded 与展开状态同条件绑定；
  // 右侧是文字「展开/收起」（不用 ›/⌄ 字形），随状态由分组数据绑定
  assert.match(
    periodWxml,
    /class="month-header" bindtap="toggleMonth" data-key="\{\{group\.key\}\}" aria-role="button" aria-label="\{\{group\.ariaLabel\}\}" aria-expanded="\{\{group\.expanded\}\}"/
  )
  assert.match(periodWxml, /class="month-header-text">\{\{group\.title\}\}/)
  assert.match(periodWxml, /class="month-toggle">\{\{group\.toggleLabel\}\}/)

  // 行：收起时组内行不渲染（wx:if，不是 css 隐藏，读屏不会念出来）；
  // 定位用记录 id（不依赖扁平下标）；显示「M月D日」，读屏仍念完整日期；无备注不渲染占位句
  assert.match(
    periodWxml,
    /wx:if="\{\{group\.expanded\}\}" wx:for="\{\{group\.records\}\}" wx:key="_id" bindtap="editMemory" data-id="\{\{item\._id\}\}" aria-role="button" aria-label="编辑 \{\{item\.date\}\} 的欢乐时光"/
  )
  assert.match(periodWxml, /class="memory-date">\{\{item\.dayLabel\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)

  // 展开/收起即时切换、无动画：卡头与切换文字的基类规则不引入 transition/animation
  for (const selector of ['month-header', 'month-toggle']) {
    const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`).exec(periodWxss)
    assert.ok(rule, `expected the .${selector} rule`)
    assert.doesNotMatch(rule[0], /transition|animation/)
  }
})

test('record tab memory segment first failure keeps memoryHasLoaded false, then a retry loads sorted records', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              if (collection === 'periods') return { kind: 'success', data: [] }
              call += 1
              if (call === 1) return { kind: 'retryable-failure', message: 'network down' }
              return {
                kind: 'success',
                data: [
                  { _id: 'm1', date: '2026-06-01', note: 'older' },
                  { _id: 'm2', date: '2026-07-03', note: 'newer' }
                ]
              }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })

    // 首次失败：没有确信数据，分段态明确区分「从未成功加载」；经期分段未被波及
    assert.equal(harness.page.data.memoryLoadFailed, true)
    assert.equal(harness.page.data.memoryHasLoaded, false)
    assert.equal(harness.page.data.memoryLoading, false)
    assert.deepEqual(harness.page.data.memories, [])
    assert.equal(harness.page.data.loadFailed, false)

    // 列表区域的重试入口重新走 loadMemoryData，成功后失败态清空、按月份分卡（新到旧）
    await harness.page.loadMemoryData()
    assert.equal(harness.page.data.memoryLoadFailed, false)
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.deepEqual(
      harness.page.data.memoryGroups.map(group => [group.key, group.title, group.records.map(r => r._id)]),
      [
        ['2026-07', '2026年7月 · 1 条', ['m2']],
        ['2026-06', '2026年6月 · 1 条', ['m1']]
      ]
    )
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment keeps records and turns to the list-area retry row when a later refresh fails', async () => {
  let call = 0
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              if (collection === 'periods') return { kind: 'success', data: [] }
              call += 1
              if (call === 1) {
                return {
                  kind: 'success',
                  data: [{ _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }]
                }
              }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      },
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    // 意图直落欢乐时光分段
    await harness.page.onShow()
    assert.equal(harness.page.data.segment, 'memory')
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.equal(harness.page.data.memories.length, 1)

    // 已加载后再刷新失败：旧列表保留（不被失败卡整卡替换），memoryHasLoaded 继续为真，
    // 上次的月份分组也原样保留（失败路径不重算分组）
    await harness.page.onShow()
    assert.equal(harness.page.data.memoryLoadFailed, true)
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.equal(harness.page.data.memoryLoading, false)
    assert.deepEqual(harness.page.data.memories, [
      { _id: 'm1', date: '2026-06-01', note: '一次愉快的野餐' }
    ])
    assert.deepEqual(
      harness.page.data.memoryGroups.map(group => [group.key, group.title]),
      [['2026-06', '2026年6月 · 1 条']]
    )
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment hides the assertive empty note after a 0-record success then refresh failure', async () => {
  let call = 0
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              if (collection === 'periods') return { kind: 'success', data: [] }
              call += 1
              if (call === 1) return { kind: 'success', data: [] }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    // 成功加载 0 条：这是确认过的真空态（没有月份卡）
    await harness.page.onShow()
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.deepEqual(harness.page.data.memories, [])
    assert.deepEqual(harness.page.data.memoryGroups, [])

    // 再刷新失败：重试在场、无断言式空态句（!memoryLoadFailed 压住空态），分组仍为空
    await harness.page.onShow()
    assert.equal(harness.page.data.memoryLoadFailed, true)
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.equal(harness.page.data.memoryLoading, false)
    assert.deepEqual(harness.page.data.memories, [])
    assert.deepEqual(harness.page.data.memoryGroups, [])
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment groups records into newest-first month cards', async () => {
  // 跨年、跨月、同一天两条：月份卡从新到旧，组内从新到旧，没有记录的月份不出现
  const data = [
    { _id: 'nye', date: '2025-12-31', note: '跨年烟花' },
    { _id: 'a1', date: '2026-10-08', note: '海边散步' },
    { _id: 'a2', date: '2026-10-08', note: '' },
    { _id: 'a3', date: '2026-10-02', note: '看展' },
    { _id: 'sep', date: '2026-09-30', note: '月末晚餐' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.segment, 'memory')

    const groups = harness.page.data.memoryGroups
    assert.deepEqual(groups.map(group => group.key), ['2026-10', '2026-09', '2025-12'])

    // 卡头：年月每次都写全，条数按「日期落在该月的记录条数」计，同一天两条算 2；
    // 读屏名带展开状态（issue #109：第一组默认展开）
    const october = groups[0]
    assert.equal(october.title, '2026年10月 · 3 条')
    assert.equal(october.ariaLabel, '2026年10月，3 条欢乐时光，已展开')
    assert.equal(october.count, 3)
    assert.deepEqual(october.records.map(record => record._id), ['a1', 'a2', 'a3'])
    // 每行显示「M月D日」；行数据保留完整日期供读屏与编辑页跳转使用
    assert.deepEqual(october.records.map(record => record.dayLabel), ['10月8日', '10月8日', '10月2日'])
    assert.equal(october.records[0].date, '2026-10-08')
    // 无备注的行保留空备注，由模板 wx:if 压住（不渲染占位句）
    assert.equal(october.records[1].note, '')

    assert.equal(groups[1].title, '2026年9月 · 1 条')
    assert.equal(groups[2].title, '2025年12月 · 1 条')
    assert.deepEqual(groups[2].records.map(record => record.dayLabel), ['12月31日'])
  } finally {
    harness.teardown()
  }
})

test('record tab memory rows open the tapped record edit page by id, not by flat index', async () => {
  // 同一天多条 + 分布在不同月份：点哪一行就打开哪条记录的编辑页，跳转地址与扁平列表时代一致
  const data = [
    { _id: 'm1', date: '2026-10-08', note: 'seaside walk' },
    { _id: 'm2', date: '2026-10-08', note: 'hotpot' },
    { _id: 'm3', date: '2025-12-31', note: 'newyear eve' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const navigation = []
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      },
      navigateTo(options) {
        navigation.push(options.url)
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.segment, 'memory')

    // 同一天的第二条：打开的是第二条本身
    harness.page.editMemory({ currentTarget: { dataset: { id: 'm2' } } })
    assert.deepEqual(navigation, ['/pages/memory/edit/edit?id=m2&date=2026-10-08&note=hotpot'])

    // 落在更旧月份卡里的记录
    harness.page.editMemory({ currentTarget: { dataset: { id: 'm3' } } })
    assert.deepEqual(navigation, [
      '/pages/memory/edit/edit?id=m2&date=2026-10-08&note=hotpot',
      '/pages/memory/edit/edit?id=m3&date=2025-12-31&note=newyear%20eve'
    ])

    // id 已不在当前分组中（如对端刚删除）：不跳转，不撞出空表单
    harness.page.editMemory({ currentTarget: { dataset: { id: 'gone' } } })
    assert.equal(navigation.length, 2)
  } finally {
    harness.teardown()
  }
})

test('record tab month card counts match the monthly recap memory count', async () => {
  // 对照口径（issue #108）：同一批数据下，卡头条数 = 首页本月小结里同月的「留下 N 条欢乐时光」。
  // 数据带跨月边界日（首日/末日）与同日两条，让两个口径在同批数据上对齐
  const data = [
    { _id: 'm1', date: '2026-07-31', note: '七月最后一天' },
    { _id: 'm2', date: '2026-08-01', note: '八月第一天' },
    { _id: 'm3', date: '2026-08-22', note: '七夕' },
    { _id: 'm4', date: '2026-08-22', note: '同一天第二条' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      }
    }
  })

  try {
    await harness.page.onShow()
    const august = harness.page.data.memoryGroups.find(group => group.key === '2026-08')
    assert.ok(august, 'expected the 2026-08 month card')
    assert.equal(august.count, 3)

    const recap = calendarInsights.buildMonthlyRecap({ year: 2026, month: 7, periods: [], memories: data })
    assert.equal(recap.memorySummary, `留下 ${august.count} 条欢乐时光`)

    // 边界日不串卡：7月末日与8月首日各归各月
    const july = harness.page.data.memoryGroups.find(group => group.key === '2026-07')
    assert.equal(july.count, 1)
    assert.equal(july.records[0].dayLabel, '7月31日')
    assert.equal(august.records[2].dayLabel, '8月1日')
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment expands only the most recent month by default', async () => {
  // 默认展开规则（issue #109）：只展开第一组——最近一个有记录的月份；
  // 本月没记录时第一组自然就是上一个有记录的月份，其他月份只显示卡头
  const data = [
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'aug1', date: '2026-08-02', note: '八月散步' },
    { _id: 'aug2', date: '2026-08-20', note: '' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.segment, 'memory')

    const groups = harness.page.data.memoryGroups
    assert.deepEqual(
      groups.map(group => [group.key, group.expanded]),
      [['2026-09', true], ['2026-08', false]]
    )

    // 卡头读屏名带展开状态；右侧文字随状态显示「展开」/「收起」
    assert.equal(groups[0].ariaLabel, '2026年9月，1 条欢乐时光，已展开')
    assert.equal(groups[0].toggleLabel, '收起')
    assert.equal(groups[1].ariaLabel, '2026年8月，2 条欢乐时光，已收起')
    assert.equal(groups[1].toggleLabel, '展开')
  } finally {
    harness.teardown()
  }
})

test('record tab month card header toggles expansion in place without navigation', async () => {
  // 点卡头切换展开/收起（issue #109）：立即生效、不跳转、无动画；卡头文字随状态翻转
  const data = [
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'aug1', date: '2026-08-02', note: '八月散步' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const navigation = []
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      },
      navigateTo(options) {
        navigation.push(options.url)
      }
    }
  })

  try {
    await harness.page.onShow()

    // 点默认收起的月份卡头：立即展开
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-08' } } })
    let groups = harness.page.data.memoryGroups
    assert.deepEqual(
      groups.map(group => [group.key, group.expanded, group.toggleLabel, group.ariaLabel]),
      [
        ['2026-09', true, '收起', '2026年9月，1 条欢乐时光，已展开'],
        ['2026-08', true, '收起', '2026年8月，1 条欢乐时光，已展开']
      ]
    )

    // 点已展开的卡头：收起（手动展开过的月份再点一次回到收起，不是回默认）
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-09' } } })
    groups = harness.page.data.memoryGroups
    assert.deepEqual(
      groups.map(group => [group.key, group.expanded, group.toggleLabel]),
      [['2026-09', false, '展开'], ['2026-08', true, '收起']]
    )

    // 点卡头只切换展开状态：不跳转、不打开编辑页；不在当前分组的月份键是 no-op
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2030-01' } } })
    assert.deepEqual(navigation, [])
    assert.equal(harness.page.data.memoryGroups[1].expanded, true)
  } finally {
    harness.teardown()
  }
})

test('record tab month expansion choices survive segment switches and reloads', async () => {
  // 展开状态记忆（issue #109）：手动选择记在页面内存，切分段、onShow 重载、重试都保留；
  // 没点过的月份走默认规则——出现更新的月份时新月份默认展开，原先默认展开但没点过的月份收起
  const v1 = [
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'aug1', date: '2026-08-02', note: '八月散步' },
    { _id: 'jul1', date: '2026-07-11', note: '七月骑行' }
  ]
  // 伴侣刚记下下个月的第一条：出现更新的月份
  const v2 = [{ _id: 'oct1', date: '2026-10-05', note: '十月的第一次' }, ...v1]
  let data = v1
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      }
    }
  })

  const expansionByMonth = () =>
    harness.page.data.memoryGroups.map(group => [group.key, group.expanded])

  try {
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-09', true], ['2026-08', false], ['2026-07', false]])

    // 只手动展开最旧的 7 月；9 月（默认展开）与 8 月都不点，留给默认规则裁决
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-07' } } })

    // 切到经期分段再切回来（重新加载欢乐时光列表）：手动选择保留，没点过的月份照默认规则
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'period' } } })
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    assert.deepEqual(expansionByMonth(), [['2026-09', true], ['2026-08', false], ['2026-07', true]])

    // 出现更新的月份（2026-10）：新月份默认展开；原先默认展开、但没点过的 9 月自动收起；
    // 8 月没点过仍按默认规则收起；7 月的手动展开保留
    data = v2
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [
      ['2026-10', true],
      ['2026-09', false],
      ['2026-08', false],
      ['2026-07', true]
    ])

    // 列表区重试（loadMemoryData 再走一遍）后选择同样保留
    await harness.page.loadMemoryData()
    assert.deepEqual(expansionByMonth(), [
      ['2026-10', true],
      ['2026-09', false],
      ['2026-08', false],
      ['2026-07', true]
    ])
  } finally {
    harness.teardown()
  }
})

test('record tab applyRecordChange expands the saved record month on add or update, not on remove', async () => {
  // 保存后自动展开（issue #109）：编辑页保存通知到达时，除了切到欢乐时光分段，
  // 还要把记录日期所在月份设为展开（改到别的月份也一样）；删除不改展开状态
  let data = [
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'aug1', date: '2026-08-02', note: '八月散步' }
  ]
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    }
  })

  const expansionByMonth = () =>
    harness.page.data.memoryGroups.map(group => [group.key, group.expanded])

  try {
    await harness.page.onShow()
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    assert.deepEqual(expansionByMonth(), [['2026-09', true], ['2026-08', false]])

    // 从「记录」tab 新增一条落在当前收起的 8 月：通知到达后回到列表，8 月展开
    data = [
      ...data,
      { _id: 'aug2', date: '2026-08-23', note: '补记的八月' }
    ]
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'add',
      record: { _id: 'aug2', date: '2026-08-23', note: '补记的八月' }
    })
    assert.equal(harness.page.data.segment, 'memory')
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-09', true], ['2026-08', true]])
    const august = harness.page.data.memoryGroups.find(group => group.key === '2026-08')
    assert.ok(august.records.some(record => record._id === 'aug2'), 'the saved record should be visible in its month card')

    // 把 9 月那条改到 8 月：回到列表时展开的是新月份；8 月此时不是第一组，
    // 展开只能来自保存通知设的选择，不是默认规则（2026-10 是第一组、按默认展开）
    data = [
      { _id: 'oct1', date: '2026-10-05', note: '十月记录' },
      { _id: 'sep1', date: '2026-08-14', note: '九月晚餐' },
      { _id: 'aug1', date: '2026-08-02', note: '八月散步' },
      { _id: 'aug2', date: '2026-08-23', note: '补记的八月' }
    ]
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'update',
      record: { _id: 'sep1', date: '2026-08-14', note: '九月晚餐' }
    })
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-10', true], ['2026-08', true]])

    // 删除不改展开状态：remove 通知（record 只有 _id）后重载，展开状态原样
    data = data.filter(record => record._id !== 'aug1')
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'remove',
      record: { _id: 'aug1' }
    })
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-10', true], ['2026-08', true]])
  } finally {
    harness.teardown()
  }
})

test('record tab applyRecordChange drops the emptied month card and keeps other months untouched on remove', async () => {
  // 用户故事 24（issue #107）：删掉某个月最后一条后，那张月份卡直接消失，不留空卡；
  // 用户故事 23：其他月份的展开状态不受 remove 通知影响（分组按成功加载重建，选择不被动）
  let data = [
    { _id: 'oct1', date: '2026-10-05', note: '十月的记录' },
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'sep2', date: '2026-09-27', note: '九月展览' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              return collection === 'memories'
                ? { kind: 'success', data }
                : { kind: 'success', data: [] }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      }
    }
  })

  const expansionByMonth = () =>
    harness.page.data.memoryGroups.map(group => [group.key, group.expanded])

  try {
    await harness.page.onShow()

    // 两组都手动翻转（10 月收起、9 月展开）：remove 若错误触碰展开选择，
    // 10 月会回默认展开、9 月会回默认收起，断言即可暴露
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-10' } } })
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-09' } } })
    assert.deepEqual(expansionByMonth(), [['2026-10', false], ['2026-09', true]])

    // 删掉 9 月的第二条：9 月还剩一条，卡片仍在，两组展开状态原样
    data = data.filter(record => record._id !== 'sep2')
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'remove',
      record: { _id: 'sep2' }
    })
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-10', false], ['2026-09', true]])

    // 删掉 9 月的最后一条：9 月卡从 memoryGroups 消失，10 月的手动收起不受影响
    data = data.filter(record => record._id !== 'sep1')
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'remove',
      record: { _id: 'sep1' }
    })
    await harness.page.onShow()
    assert.deepEqual(expansionByMonth(), [['2026-10', false]])
    assert.equal(
      harness.page.data.memoryGroups.some(group => group.key === '2026-09'),
      false,
      'the emptied month card must disappear from memoryGroups'
    )
  } finally {
    harness.teardown()
  }
})

test('record tab memory segment keeps the last expansion state when a refresh fails', async () => {
  // 刷新失败（issue #109）：保留上次的分组与展开状态——失败路径不重算分组，
  // 展开状态来自上次成功加载时的装饰，原样保留
  let call = 0
  const data = [
    { _id: 'sep1', date: '2026-09-18', note: '九月晚餐' },
    { _id: 'aug1', date: '2026-08-02', note: '八月散步' }
  ]
  const storage = { recordTabSegment: 'memory' }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              if (collection === 'periods') return { kind: 'success', data: [] }
              call += 1
              if (call === 1) return { kind: 'success', data }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        delete storage[key]
      },
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.deepEqual(
      harness.page.data.memoryGroups.map(group => [group.key, group.expanded]),
      [['2026-09', true], ['2026-08', false]]
    )

    // 手动翻转两组的展开状态，再触发一次失败的刷新
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-09' } } })
    harness.page.toggleMonth({ currentTarget: { dataset: { key: '2026-08' } } })
    await harness.page.onShow()

    assert.equal(harness.page.data.memoryLoadFailed, true)
    assert.equal(harness.page.data.memoryHasLoaded, true)
    // 上次的分组与展开状态原样保留，不会回默认、也不会清空
    assert.deepEqual(
      harness.page.data.memoryGroups.map(group => [group.key, group.expanded, group.title]),
      [['2026-09', false, '2026年9月 · 1 条'], ['2026-08', true, '2026年8月 · 1 条']]
    )
  } finally {
    harness.teardown()
  }
})

test('record edit pages isolate delete loading, constrain period dates, and cap notes', () => {
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  const memoryEditJs = readPageFile('pages/memory/edit/edit.js')
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  assert.match(periodEditJs, /deleting:\s*false/)
  assert.match(memoryEditJs, /deleting:\s*false/)
  assert.match(periodEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\|\|\s*this\.data\.submitted\s*\|\|\s*this\._deleteConfirming\s*\)\s*return/)
  assert.match(memoryEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\|\|\s*this\.data\.submitted\s*\|\|\s*this\._deleteConfirming\s*\)\s*return/)
  assert.match(periodEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\|\|\s*this\.data\.submitted\s*\)\s*return/)
  assert.match(memoryEditJs, /if\s*\(\s*this\.data\.saving\s*\|\|\s*this\.data\.deleting\s*\|\|\s*this\.data\.submitted\s*\)\s*return/)

  assert.match(periodEditWxml, /删除中\.\.\./)
  assert.match(memoryEditWxml, /删除中\.\.\./)
  assert.match(periodEditWxml, /wx:if="\{\{!saving && !deleting && !submitted\}\}"/)
  assert.match(memoryEditWxml, /wx:if="\{\{!saving && !deleting && !submitted\}\}"/)
  assert.match(periodEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(memoryEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(periodEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(memoryEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(periodEditWxml, /end="\{\{maxDate\}\}"/)
  assert.match(periodEditWxml, /start="\{\{startDate\}\}"/)
  // 结束日期选择器只在已知结束状态出现；开始日期选择器上限为今天
  assert.match(periodEditWxml, /<view class="form-item" wx:if="\{\{status === 'known-end'\}\}">/)
  assert.match(periodEditWxml, /bindtap="selectStatus"/)
  assert.match(periodEditWxml, /aria-label="经期状态/)
  assert.match(periodEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /wx:if="\{\{isEdit\}\}"[\s\S]*编辑欢乐时光/)
  assert.match(memoryEditWxml, /wx:else[\s\S]*新增欢乐时光/)
})

test('record edit templates keep fields and delete locked while saving', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  // 保存进行中：日期选择器与备注输入带原生 disabled，与 saving 同条件
  const periodLocked = periodEditWxml.match(/\sdisabled="\{\{saving\}\}"/g) || []
  const memoryLocked = memoryEditWxml.match(/\sdisabled="\{\{saving\}\}"/g) || []
  assert.equal(periodLocked.length, 3, 'period date pickers and note input must be disabled while saving')
  assert.equal(memoryLocked.length, 2, 'memory date picker and note input must be disabled while saving')
  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"/)
  }

  // 经量与症状芯片在保存中不可点：JS 守卫 + 模板禁用类与 aria-disabled
  const periodEditJs = readPageFile('pages/period/edit/edit.js')
  assert.match(periodEditJs, /selectFlow\(e\) \{\s*\n\s*if \(this\.data\.saving\) return/)
  assert.match(periodEditJs, /toggleSymptom\(e\) \{\s*\n\s*if \(this\.data\.saving\) return/)
  const chipBlocks = periodEditWxml.match(/class="(flow-chip|symptom-chip)[^"]*"[^>]*aria-disabled="\{\{saving\}\}"/g) || []
  assert.equal(chipBlocks.length >= 2, true, 'flow and symptom chips must expose saving-disabled state')
})

test('record edit notes are multi-line textareas with the unchanged 500-char cap', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /<textarea[^>]*maxlength="500"[^>]*auto-height/)
    assert.doesNotMatch(wxml, /<input[^>]*aria-label="备注"/)
  }
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

test('edit pages ignore a second save while submitted and waiting to return', async () => {
  for (const spec of [
    {
      page: 'pages/period/edit/edit.js',
      load: { id: 'p1', startDate: '2026-09-01', endDate: '2026-09-03', status: 'known-end' }
    },
    {
      page: 'pages/memory/edit/edit.js',
      load: { id: 'm1', date: '2026-09-01', note: '野餐' }
    }
  ]) {
    const writes = []
    const navigateBackCalls = []
    const modals = []
    const harness = loadRecordPageHarness(spec.page, {
      mocks: {
        'utils/util.js': createUtilStub(),
        'utils/cloud.js': {
          createRoomDataClient() {
            return {
              async update(collection, id, payload) {
                writes.push({ collection, id, payload })
                return { kind: 'success', result: { record: { _id: id, ...payload } } }
              },
              async remove() {
                writes.push({ op: 'remove' })
                return { kind: 'success', result: {} }
              }
            }
          }
        },
        'utils/recordPageSync.js': {
          getSavedRecord(outcome) {
            return outcome && outcome.result ? outcome.result.record : null
          },
          notifyPreviousPageRecordChange() {}
        }
      },
      wxOverrides: {
        navigateBack() {
          navigateBackCalls.push({})
        },
        showModal(options) {
          modals.push(options)
          if (typeof options.success === 'function') {
            options.success({ confirm: false, cancel: true })
          }
        }
      }
    })

    try {
      harness.page.onLoad(spec.load)
      const outcome = await harness.page.save()

      assert.equal(outcome.kind, 'success')
      assert.equal(writes.length, 1)
      assert.equal(harness.page.data.saving, false)
      assert.equal(harness.page.data.submitted, true)
      assert.equal(navigateBackCalls.length, 0)

      const second = await harness.page.save()
      assert.equal(second, undefined)
      assert.equal(writes.length, 1, `${spec.page} must not save again while waiting to return`)
      const pendingDelete = harness.page.delete()
      assert.equal(modals.length, 0, `${spec.page} must not open delete while waiting to return`)
      assert.equal(writes.length, 1, `${spec.page} must not delete while waiting to return`)
      await pendingDelete

      await new Promise(resolve => setTimeout(resolve, 1100))
      assert.equal(navigateBackCalls.length, 1, `${spec.page} returns once`)
    } finally {
      harness.teardown()
    }
  }

  for (const relativePath of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const wxml = readPageFile(relativePath)
    assert.match(
      wxml,
      /wx:if="\{\{!saving && !deleting && !submitted\}\}"[^>]*bindtap="save"[^>]*>保存</
    )
    assert.match(wxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\.</)
    assert.match(wxml, /wx:else class="btn-premium disabled"[^>]*aria-disabled="true"[^>]*>保存</)
    assert.doesNotMatch(wxml, /submitted[^>]*>保存中/)
  }
})

test('edit pages ignore a second delete while submitted and waiting to return', async () => {
  for (const spec of [
    {
      page: 'pages/period/edit/edit.js',
      load: { id: 'p1', startDate: '2026-09-01', endDate: '2026-09-03', status: 'known-end' }
    },
    {
      page: 'pages/memory/edit/edit.js',
      load: { id: 'm1', date: '2026-09-01', note: '野餐' }
    }
  ]) {
    const removes = []
    const writes = []
    const navigateBackCalls = []
    const modals = []
    const harness = loadRecordPageHarness(spec.page, {
      mocks: {
        'utils/util.js': createUtilStub(),
        'utils/cloud.js': {
          createRoomDataClient() {
            return {
              async update(collection, id, payload) {
                writes.push({ collection, id, payload })
                return { kind: 'success', result: { record: { _id: id, ...payload } } }
              },
              async remove(collection, id) {
                removes.push({ collection, id })
                return { kind: 'success', result: {} }
              }
            }
          }
        },
        'utils/recordPageSync.js': {
          getSavedRecord() {
            return null
          },
          notifyPreviousPageRecordChange() {}
        }
      },
      wxOverrides: {
        navigateBack() {
          navigateBackCalls.push({})
        },
        showModal(options) {
          modals.push(options)
        }
      }
    })

    try {
      harness.page.onLoad(spec.load)
      const deleting = harness.page.delete()
      assert.equal(modals.length, 1)
      modals[0].success({ confirm: true, cancel: false })
      const outcome = await deleting

      assert.equal(outcome.kind, 'success')
      assert.equal(removes.length, 1)
      assert.equal(harness.page.data.deleting, false)
      assert.equal(harness.page.data.submitted, true)
      assert.equal(navigateBackCalls.length, 0)

      const second = harness.page.delete()
      assert.equal(modals.length, 1, `${spec.page} must not confirm delete again while waiting to return`)
      await second
      assert.equal(removes.length, 1)
      await harness.page.save()
      assert.equal(writes.length, 0, `${spec.page} must not save while waiting to return`)

      await new Promise(resolve => setTimeout(resolve, 20))
      assert.equal(navigateBackCalls.length, 1, `${spec.page} returns once`)
    } finally {
      harness.teardown()
    }
  }

  for (const relativePath of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const wxml = readPageFile(relativePath)
    assert.match(
      wxml,
      /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"[^>]*>删除此记录</
    )
    assert.match(wxml, /wx:elif="\{\{isEdit && deleting\}\}"[^>]*>删除中\.\.\.</)
    assert.match(
      wxml,
      /wx:elif="\{\{isEdit\}\}"[^>]*aria-disabled="true"[^>]*>删除此记录</
    )
  }
})

test('period edit keeps fields and delete unavailable until the save finishes', async () => {
  const deleteCalls = []
  let releaseSave = null
  const harness = loadRecordPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {}
        }
      },
      'utils/recordCommands.js': {
        runRecordSave(options) {
          options.page.setData({ saving: true })
          return new Promise(resolve => {
            releaseSave = () => {
              options.page.setData({ saving: false })
              resolve({ kind: 'success', result: {} })
            }
          })
        },
        runRecordDelete(options) {
          deleteCalls.push(options)
          return Promise.resolve({ kind: 'cancelled' })
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord() {
          return null
        },
        notifyPreviousPageRecordChange() {}
      },
      'utils/cycle.js': {
        FLOW_OPTIONS: [{ value: 'heavy', label: '量大' }, { value: 'light', label: '量少' }],
        PERIOD_STATUS_OPTIONS: [
          { value: 'ongoing', label: '进行中' },
          { value: 'unknown-end', label: '结束日期不详' },
          { value: 'known-end', label: '已结束' }
        ],
        isPeriodStatus(value) {
          return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
        },
        getPeriodStatus(period = {}) {
          if (this.isPeriodStatus(period.status)) return period.status
          if (typeof period.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(period.endDate)) return 'known-end'
          return 'unknown-end'
        },
        buildSymptomOptions(selected = []) {
          return selected.map(value => ({ value, label: value, selected: true }))
        },
        buildPeriodPayload(payload) {
          return payload
        }
      }
    }
  })

  try {
    harness.page.onLoad({ id: 'p1', startDate: '2026-09-01', endDate: '2026-09-03' })
    harness.page.selectFlow({ currentTarget: { dataset: { value: 'heavy' } } })
    harness.page.toggleSymptom({ currentTarget: { dataset: { value: 'cramps' } } })
    assert.equal(harness.page.data.flow, 'heavy')

    const saving = harness.page.save()
    await Promise.resolve()
    assert.equal(harness.page.data.saving, true)

    // 保存尚未结束：不能再开始删除，经量与症状芯片不可用
    await harness.page.delete()
    assert.equal(deleteCalls.length, 0)
    harness.page.selectFlow({ currentTarget: { dataset: { value: 'light' } } })
    assert.equal(harness.page.data.flow, 'heavy')
    harness.page.toggleSymptom({ currentTarget: { dataset: { value: 'headache' } } })
    assert.deepEqual(harness.page.data.symptoms, ['cramps'])

    releaseSave()
    assert.equal((await saving).kind, 'success')

    // 保存结束后删除可以开始
    await harness.page.delete()
    assert.equal(deleteCalls.length, 1)
  } finally {
    harness.teardown()
  }
})

test('memory edit keeps delete unavailable until the save finishes', async () => {
  const deleteCalls = []
  let releaseSave = null
  const harness = loadRecordPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {}
        }
      },
      'utils/recordCommands.js': {
        runRecordSave(options) {
          options.page.setData({ saving: true })
          return new Promise(resolve => {
            releaseSave = () => {
              options.page.setData({ saving: false })
              resolve({ kind: 'success', result: {} })
            }
          })
        },
        runRecordDelete(options) {
          deleteCalls.push(options)
          return Promise.resolve({ kind: 'cancelled' })
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord() {
          return null
        },
        notifyPreviousPageRecordChange() {}
      }
    }
  })

  try {
    harness.page.onLoad({ id: 'm1', date: '2026-09-01', note: '' })
    const saving = harness.page.save()
    await Promise.resolve()
    assert.equal(harness.page.data.saving, true)

    await harness.page.delete()
    assert.equal(deleteCalls.length, 0)

    releaseSave()
    assert.equal((await saving).kind, 'success')

    await harness.page.delete()
    assert.equal(deleteCalls.length, 1)
  } finally {
    harness.teardown()
  }
})

test('memory edit delete confirms once, only turns busy after confirming, and recovers after cancel', async () => {
  const modals = []
  let removeCalls = 0
  let deletingDuringRemove = null
  const harness = loadRecordPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async remove() {
              removeCalls += 1
              deletingDuringRemove = harness.page.data.deleting
              return { kind: 'success', result: {} }
            }
          }
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord() {
          return null
        },
        notifyPreviousPageRecordChange() {}
      }
    },
    wxOverrides: {
      showModal(options) {
        modals.push(options)
      }
    }
  })

  try {
    harness.page.onLoad({ id: 'm1', date: '2026-09-01', note: '' })
    assert.equal(harness.page.data.isEdit, true)

    const firstDelete = harness.page.delete()
    assert.equal(modals.length, 1)
    // 确认之前不进入删除忙碌态：按钮仍写「删除此记录」
    assert.equal(harness.page.data.deleting, false)

    // 确认框开着时再点删除，不叠出第二个确认框
    await harness.page.delete()
    assert.equal(modals.length, 1)

    // 取消后按钮回到可点的删除
    modals[0].success({ confirm: false, cancel: true })
    assert.deepEqual(await firstDelete, { kind: 'cancelled' })
    assert.equal(harness.page.data.deleting, false)

    const secondDelete = harness.page.delete()
    assert.equal(modals.length, 2)

    // 确认之后才进入删除中
    await modals[1].success({ confirm: true, cancel: false })
    assert.equal((await secondDelete).kind, 'success')
    assert.equal(removeCalls, 1)
    assert.equal(deletingDuringRemove, true)
    assert.equal(harness.page.data.deleting, false)
  } finally {
    harness.teardown()
  }
})

test('record lists preview long notes as one clamped line without displacing later records', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')
  const memoryWxss = readPageFile('pages/memory/memory.wxss')

  // 列表绑定真实备注（本人写下的文字原样显示），显示与否由 wx:if 决定
  for (const wxml of [periodWxml, memoryWxml]) {
    assert.match(wxml, /wx:if="\{\{item\.note\}\}"[^>]*>\{\{item\.note\}\}/)
  }

  // 长备注只显示短预览：单行截断 + 省略号，换行折叠成一行，不把后面的记录挤出屏幕
  const clamps = [
    [periodWxss, '.item-note'],
    [memoryWxss, '.memory-note']
  ]
  for (const [wxss, selector] of clamps) {
    const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(wxss)
    assert.ok(rule, `${selector} rule exists`)
    assert.match(rule[0], /white-space:\s*nowrap/)
    assert.match(rule[0], /overflow:\s*hidden/)
    assert.match(rule[0], /text-overflow:\s*ellipsis/)
  }

  // 截断生效的前提：备注所在的弹性列允许收缩到内容宽度以下
  assert.match(periodWxss, /\.item-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(memoryWxss, /\.memory-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(memoryWxss, /\.memory-info\s*\{[^}]*min-width:\s*0[^}]*\}/)
})

test('period edit defaults a new record to ongoing and saves it with only a start date', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({})

    // 新增默认进行中：只带开始日期，结束日期为空；日期选择器上限为今天
    assert.equal(env.harness.page.data.status, 'ongoing')
    assert.equal(env.harness.page.data.startDate, '2026-09-20')
    assert.equal(env.harness.page.data.endDate, '')
    assert.equal(env.harness.page.data.maxDate, '2026-09-20')

    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 1)
    assert.equal(env.updates.length, 0)
    assert.deepEqual(env.adds[0], {
      collection: 'periods',
      payload: {
        startDate: '2026-09-20',
        endDate: '',
        status: 'ongoing',
        note: '',
        duration: 0,
        flow: '',
        symptoms: []
      }
    })
  } finally {
    env.harness.teardown()
  }
})

test('period edit completes the same ongoing record by filling an end date', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({ id: 'p1', startDate: '2026-09-10', status: 'ongoing' })
    assert.equal(env.harness.page.data.status, 'ongoing')
    assert.equal(env.harness.page.data.endDate, '')

    // 完成进行中记录：结束日兜底为今天，并实时显示含首尾天数；超预期只提示，不改选择
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'known-end' } } })
    assert.equal(env.harness.page.data.status, 'known-end')
    assert.equal(env.harness.page.data.endDate, '2026-09-20')
    assert.equal(env.harness.page.data.periodDayCountText, '共 11 天')
    assert.equal(env.harness.page.data.periodLengthHint, '超过预期的 5 天，请核对结束日期')
    const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
    const endLabel = periodEditWxml.indexOf('结束日期')
    const dayText = periodEditWxml.indexOf('{{periodDayCountText}}')
    const lengthHint = periodEditWxml.indexOf('{{periodLengthHint}}')
    const noteLabel = periodEditWxml.indexOf('备注')
    assert.ok(endLabel !== -1 && endLabel < dayText && dayText < lengthHint && lengthHint < noteLabel)

    env.harness.page.onEndChange({ detail: { value: '2026-09-14' } })
    const outcome = await env.harness.page.save()

    // 补填结束日期更新同一条记录并清除进行中状态，不创建第二条
    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 0)
    assert.equal(env.updates.length, 1)
    assert.equal(env.updates[0].id, 'p1')
    assert.deepEqual(env.updates[0].payload, {
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      status: 'known-end',
      note: '',
      duration: 5,
      flow: '',
      symptoms: []
    })
  } finally {
    env.harness.teardown()
  }
})

test('period edit backfills a past period with an empty end date until the user chooses one', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({ startDate: '2026-06-10' })
    assert.equal(env.harness.page.data.status, 'known-end')
    assert.equal(env.harness.page.data.endDate, '')
    assert.equal(env.harness.page.data.periodDayCountText, '')

    env.harness.page.onStartChange({ detail: { value: '2026-06-12' } })
    assert.equal(env.harness.page.data.startDate, '2026-06-12')
    assert.equal(env.harness.page.data.endDate, '')

    const outcome = await env.harness.page.save()
    assert.deepEqual(outcome, {
      kind: 'validation',
      message: '请选择结束日期；还没结束可以选「进行中」'
    })
    assert.equal(env.adds.length, 0)
  } finally {
    env.harness.teardown()
  }
})

test('period edit length hint uses completed history instead of the five-day default', async () => {
  const env = createPeriodEditSaveEnv({
    periods: [
      { startDate: '2026-05-01', endDate: '2026-05-03', status: 'known-end' },
      { startDate: '2026-06-01', endDate: '2026-06-03', status: 'known-end' }
    ]
  })

  try {
    await env.harness.page.onLoad({
      id: 'p9',
      startDate: '2026-08-01',
      endDate: '2026-08-04',
      status: 'known-end'
    })

    assert.equal(env.harness.page.data.endDate, '2026-08-04')
    assert.equal(env.harness.page.data.status, 'known-end')
    assert.equal(env.harness.page.data.periodDayCountText, '共 4 天')
    assert.equal(env.harness.page.data.periodLengthHint, '超过预期的 3 天，请核对结束日期')
  } finally {
    env.harness.teardown()
  }
})

test('period edit saves a historical unknown-end record without an end date', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    // 历史补录：开始日选过去某天，状态改选「结束日期不详」，不必填或猜结束日期
    env.harness.page.onLoad({})
    env.harness.page.onStartChange({ detail: { value: '2026-06-10' } })
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'unknown-end' } } })
    assert.equal(env.harness.page.data.status, 'unknown-end')

    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 1)
    assert.equal(env.updates.length, 0)
    assert.deepEqual(env.adds[0].payload, {
      startDate: '2026-06-10',
      endDate: '',
      status: 'unknown-end',
      note: '',
      duration: 0,
      flow: '',
      symptoms: []
    })
  } finally {
    env.harness.teardown()
  }
})

test('period edit switches a known-end record to unknown-end and drops the end date', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({ id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' })
    assert.equal(env.harness.page.data.status, 'known-end')

    // 清空结束日期的方式是显式改选状态：切到结束日期不详，不让空值承担隐含语义
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'unknown-end' } } })

    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.updates.length, 1)
    assert.equal(env.updates[0].id, 'p1')
    assert.deepEqual(env.updates[0].payload, {
      startDate: '2026-06-01',
      endDate: '',
      status: 'unknown-end',
      note: '',
      duration: 0,
      flow: '',
      symptoms: []
    })
  } finally {
    env.harness.teardown()
  }
})

test('period edit completes an unknown-end record with an exact duration by filling the end date', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({ id: 'p3', startDate: '2026-08-01', status: 'unknown-end' })
    assert.equal(env.harness.page.data.status, 'unknown-end')
    assert.equal(env.harness.page.data.endDate, '')

    // 从结束日期不详切到已结束：结束日保持为空，不再兜底为开始日
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'known-end' } } })
    assert.equal(env.harness.page.data.endDate, '')
    assert.equal(env.harness.page.data.periodDayCountText, '')
    env.harness.page.onEndChange({ detail: { value: '2026-08-04' } })
    assert.equal(env.harness.page.data.periodDayCountText, '共 4 天')
    assert.equal(env.harness.page.data.periodLengthHint, '')

    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 0)
    assert.equal(env.updates.length, 1)
    assert.equal(env.updates[0].id, 'p3')
    assert.deepEqual(env.updates[0].payload, {
      startDate: '2026-08-01',
      endDate: '2026-08-04',
      status: 'known-end',
      note: '',
      duration: 4,
      flow: '',
      symptoms: []
    })
  } finally {
    env.harness.teardown()
  }
})

test('period edit rejects future start and end dates before touching the cloud', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({})

    // util 桩的今天是 2026-09-20：开始日期晚于今天直接拒绝（不触云端）
    env.harness.page.onStartChange({ detail: { value: '2026-09-21' } })
    let outcome = await env.harness.page.save()
    assert.deepEqual(outcome, { kind: 'validation', message: '开始日期不能晚于今天' })
    assert.equal(env.adds.length + env.updates.length, 0)
    assert.deepEqual(env.toasts, [])

    // 已知结束但结束日期晚于今天同样拒绝
    env.harness.page.onStartChange({ detail: { value: '2026-09-18' } })
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'known-end' } } })
    env.harness.page.onEndChange({ detail: { value: '2026-09-25' } })
    outcome = await env.harness.page.save()
    assert.deepEqual(outcome, { kind: 'validation', message: '结束日期不能晚于今天' })
    assert.equal(env.adds.length + env.updates.length, 0)
  } finally {
    env.harness.teardown()
  }
})

test('period edit switches to the reopened record after a merged save and keeps drafts on that record', async () => {
  const persistedRecord = {
    _id: 'p-ongoing',
    startDate: '2026-09-01',
    endDate: '',
    status: 'ongoing',
    note: '伴侣已经记过的经期',
    duration: 0,
    flow: 'normal',
    symptoms: ['tired']
  }
  const env = createPeriodEditMergeEnv(persistedRecord)

  try {
    env.harness.page.onLoad({})
    // 用户在新表单里填了自己的内容：保存时云端发现已有进行中记录，丢弃这份表单
    env.harness.page.onStartChange({ detail: { value: '2026-09-19' } })
    env.harness.page.onNoteInput({ detail: { value: '这次想补记的备注' } })
    env.harness.page.selectFlow({ currentTarget: { dataset: { value: 'heavy' } } })
    env.harness.page.toggleSymptom({ currentTarget: { dataset: { value: 'cramps' } } })

    const saving = env.harness.page.save()
    await new Promise(resolve => setImmediate(resolve))

    // 合并分类：没有「保存成功」toast、不返回上一页，说明 modal 解释记录被重开
    assert.deepEqual(env.toasts, [])
    assert.equal(env.navigateBackCalls.length, 0)
    assert.equal(env.modals.length, 1)
    assert.equal(env.modals[0].showCancel, false)
    assert.match(env.modals[0].content, /已有一条进行中的经期/)

    env.modals[0].success({ confirm: true, cancel: false })
    const outcome = await saving
    assert.equal(outcome.kind, 'merged')

    // 确认后编辑页展示被重开记录的持久化内容，而不是被丢弃的表单
    assert.equal(env.harness.page.data.id, 'p-ongoing')
    assert.equal(env.harness.page.data.isEdit, true)
    assert.equal(env.harness.page.data.status, 'ongoing')
    assert.equal(env.harness.page.data.startDate, '2026-09-01')
    assert.equal(env.harness.page.data.endDate, '')
    assert.equal(env.harness.page.data.note, '伴侣已经记过的经期')
    assert.equal(env.harness.page.data.flow, 'normal')
    assert.deepEqual(env.harness.page.data.symptoms, ['tired'])
    assert.equal(env.harness.page.data.draftRestored, false)
    const selectedSymptoms = env.harness.page.data.symptomGroups
      .flatMap(group => group.options)
      .filter(option => option.selected)
      .map(option => option.value)
    assert.deepEqual(selectedSymptoms, ['tired'])

    // 上一页按更新语义同步：同一条 _id 合并，不产生重复的进行中记录
    assert.equal(env.changes.length, 1)
    assert.equal(env.changes[0].collection, 'periods')
    assert.equal(env.changes[0].mode, 'update')
    assert.deepEqual(env.changes[0].record, persistedRecord)

    // 被丢弃表单的草稿按普通成功清理；草稿身份重建到被重开记录，不串键
    assert.equal(env.storage.has('recordDraft:periods:new'), false)
    assert.equal(env.harness.page._draftDiscarded, false)
    assert.equal(env.harness.page._draftKey, 'recordDraft:periods:p-ongoing')

    // 接着补填结束日期后离开页面：草稿写进被重开记录的草稿槽
    env.harness.page.selectStatus({ currentTarget: { dataset: { value: 'known-end' } } })
    env.harness.page.onEndChange({ detail: { value: '2026-09-20' } })
    env.harness.page.onHide()
    assert.equal(env.storage.has('recordDraft:periods:new'), false)
    const draft = JSON.parse(env.storage.get('recordDraft:periods:p-ongoing'))
    assert.equal(draft.status, 'known-end')
    assert.equal(draft.startDate, '2026-09-01')
    assert.equal(draft.endDate, '2026-09-20')
  } finally {
    env.harness.teardown()
  }
})

// ===== review #99 / issue #103：编辑页保存/删除成功后写下一次性「目标分段」意图 =====
// 首页快速入口经编辑页保存后返回首页，notify 只达前一页，到不了记录 tab；
// 编辑页写下的一次性意图键让记录 tab 下一次 onShow 落在被改动记录所属分段。

test('period edit save writes the one-shot segment intent so the record tab lands on periods', async () => {
  const env = createPeriodEditSaveEnv()

  try {
    env.harness.page.onLoad({})
    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 1)
    // 无论从哪个入口进入本页：保存经期记录后，记录 tab 下次打开落在经期分段
    assert.equal(env.storage.get('recordTabSegment'), 'period')
  } finally {
    env.harness.teardown()
  }
})

test('period edit merged save still writes the one-shot segment intent', async () => {
  const persistedRecord = {
    _id: 'p-ongoing',
    startDate: '2026-09-01',
    endDate: '',
    status: 'ongoing',
    note: '伴侣已经记过的经期',
    duration: 0,
    flow: 'normal',
    symptoms: ['tired']
  }
  const env = createPeriodEditMergeEnv(persistedRecord)

  try {
    env.harness.page.onLoad({})
    const saving = env.harness.page.save()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(env.modals.length, 1)

    env.modals[0].success({ confirm: true, cancel: false })
    const outcome = await saving

    // 合并到已有进行中经期也算保存成功：分段意图同样落在经期分段
    assert.equal(outcome.kind, 'merged')
    assert.equal(env.storage.get('recordTabSegment'), 'period')
  } finally {
    env.harness.teardown()
  }
})

test('period edit delete writes the one-shot segment intent', async () => {
  const env = createEditDeleteEnv('pages/period/edit/edit.js', {
    id: 'p1',
    startDate: '2026-09-01',
    endDate: '2026-09-03'
  })

  try {
    const deleting = env.harness.page.delete()
    assert.equal(env.modals.length, 1)

    await env.modals[0].success({ confirm: true, cancel: false })
    const outcome = await deleting

    // 删除成功后返回，记录 tab 同样停在经期分段（分段上没有这条记录了，但位置符合期望）
    assert.equal(outcome.kind, 'success')
    assert.equal(env.storage.get('recordTabSegment'), 'period')
  } finally {
    env.harness.teardown()
  }
})

test('memory edit save writes the one-shot segment intent so the record tab lands on happy times', async () => {
  const env = createMemoryEditSaveEnv()

  try {
    env.harness.page.onLoad({})
    const outcome = await env.harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(env.adds.length, 1)
    // 从首页快速入口保存欢乐时光：记录 tab 下次打开落在欢乐时光分段
    assert.equal(env.storage.get('recordTabSegment'), 'memory')
  } finally {
    env.harness.teardown()
  }
})

test('memory edit rejects a future date passed in by the route and does not save', async () => {
  const toasts = []
  const calls = []
  const realUtil = require(path.join(repoRoot, 'utils/util.js'))
  const harness = loadRecordPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': { ...realUtil, formatDate: () => '2026-09-20' },
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add(collection, payload) {
              calls.push({ method: 'add', collection, payload })
              return { kind: 'success', result: { record: { _id: 'new-m1', ...payload } } }
            },
            async update(collection, id, payload) {
              calls.push({ method: 'update', collection, id, payload })
              return { kind: 'success', result: { record: { _id: id, ...payload } } }
            }
          }
        }
      }
    },
    wxOverrides: {
      showToast(options) {
        toasts.push(options)
      }
    }
  })

  try {
    // 路由带进未来日期：选择器上限挡不住已写入的值，保存时必须拦下并提示
    harness.page.onLoad({ date: '2026-09-21' })
    const outcome = await harness.page.save()

    assert.deepEqual(outcome, { kind: 'validation', message: '日期不能晚于今天' })
    assert.deepEqual(toasts, [{ title: '日期不能晚于今天', icon: 'none' }])
    assert.deepEqual(calls, [])
  } finally {
    harness.teardown()
  }
})

test('memory edit saves today and a past date', async () => {
  const env = createMemoryEditSaveEnv()

  try {
    env.harness.page.onLoad({})
    assert.equal(env.harness.page.data.date, '2026-09-20')
    const todayOutcome = await env.harness.page.save()
    assert.equal(todayOutcome.kind, 'success')
    assert.deepEqual(env.adds, [{
      collection: 'memories',
      payload: { date: '2026-09-20', note: '' }
    }])

    env.harness.page.onLoad({ id: 'm1', date: '2026-08-01', note: '以前' })
    const pastOutcome = await env.harness.page.save()
    assert.equal(pastOutcome.kind, 'success')
    assert.deepEqual(env.updates, [{
      collection: 'memories',
      id: 'm1',
      payload: { date: '2026-08-01', note: '以前' }
    }])
  } finally {
    env.harness.teardown()
  }
})

test('memory edit delete writes the one-shot segment intent', async () => {
  const env = createEditDeleteEnv('pages/memory/edit/edit.js', {
    id: 'm1',
    date: '2026-09-01',
    note: '野餐'
  })

  try {
    const deleting = env.harness.page.delete()
    assert.equal(env.modals.length, 1)

    await env.modals[0].success({ confirm: true, cancel: false })
    const outcome = await deleting

    assert.equal(outcome.kind, 'success')
    assert.equal(env.storage.get('recordTabSegment'), 'memory')
  } finally {
    env.harness.teardown()
  }
})

test('period list reopens the existing ongoing record when the add button is tapped again', async () => {
  const navigation = []
  const toasts = []
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'p1', startDate: '2026-08-01', endDate: '2026-08-05', duration: 5 },
                  { _id: 'p2', startDate: '2026-09-10', endDate: '', status: 'ongoing' }
                ]
              }
            }
          }
        }
      }
    },
    wxOverrides: {
      navigateTo(options) {
        navigation.push(options.url)
      },
      showToast(options) {
        toasts.push(options)
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.periods.length, 2)

    // 已有进行中记录：重复新增提示并进入原记录编辑页
    harness.page.addPeriod()
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p2&startDate=2026-09-10&status=ongoing'])
    assert.deepEqual(toasts, [{ title: '已有进行中的经期，继续编辑它', icon: 'none' }])

    // 没有进行中记录：进入默认进行中的新增表单（只带开始日期）
    harness.page.setData({
      periods: [harness.page.data.periods.find(item => item._id === 'p1')]
    })
    harness.page.addPeriod()
    assert.equal(navigation.length, 2)
    assert.match(navigation[1], /^\/pages\/period\/edit\/edit\?startDate=\d{4}-\d{2}-\d{2}$/)
  } finally {
    harness.teardown()
  }
})

// 进行中/已知结束两条主路径共用的编辑页保存环境：
// 真实 cycle 与 recordEditRoute，云端与命令层用可捕获的桩。
// util 只固定「今天」，其余日期能力委托真实模块，保证真实 cycle 拿到完整接缝。
function createPeriodEditSaveEnv({ periods = null } = {}) {
  const toasts = []
  const adds = []
  const updates = []
  const storage = new Map()
  const realUtil = require(path.join(repoRoot, 'utils/util.js'))
  const harness = loadRecordPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': { ...realUtil, formatDate: () => '2026-09-20' },
      'utils/cloud.js': {
        createRoomDataClient() {
          const client = {
            async add(collection, payload) {
              adds.push({ collection, payload })
              return { kind: 'success', result: { record: { _id: 'new-1', ...payload } } }
            },
            async update(collection, id, payload) {
              updates.push({ collection, id, payload })
              return { kind: 'success', result: { record: { _id: id, ...payload } } }
            }
          }
          if (periods) {
            client.list = async (collection) => {
              if (collection !== 'periods') throw new Error(`unexpected list ${collection}`)
              return { kind: 'success', data: periods }
            }
          }
          return client
        }
      },
      'utils/recordCommands.js': {
        async runRecordSave(options) {
          const message = typeof options.validate === 'function' ? options.validate() : ''
          if (message) return { kind: 'validation', message }
          return options.action()
        },
        async runRecordDelete() {
          return { kind: 'cancelled' }
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord(outcome) {
          return outcome && outcome.result ? outcome.result.record : null
        },
        notifyPreviousPageRecordChange() {}
      }
    },
    wxOverrides: {
      showToast(options) {
        toasts.push(options)
      },
      getStorageSync(key) {
        return storage.has(key) ? storage.get(key) : ''
      },
      setStorageSync(key, value) {
        storage.set(key, value)
      },
      removeStorageSync(key) {
        storage.delete(key)
      }
    }
  })
  return { harness, toasts, adds, updates, storage }
}

// 欢乐时光编辑页保存环境：与 createPeriodEditSaveEnv 同形，云端与命令层用可捕获的桩。
function createMemoryEditSaveEnv() {
  const toasts = []
  const adds = []
  const updates = []
  const storage = new Map()
  const realUtil = require(path.join(repoRoot, 'utils/util.js'))
  const harness = loadRecordPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': { ...realUtil, formatDate: () => '2026-09-20' },
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add(collection, payload) {
              adds.push({ collection, payload })
              return { kind: 'success', result: { record: { _id: 'new-m1', ...payload } } }
            },
            async update(collection, id, payload) {
              updates.push({ collection, id, payload })
              return { kind: 'success', result: { record: { _id: id, ...payload } } }
            }
          }
        }
      },
      'utils/recordCommands.js': {
        async runRecordSave(options) {
          const message = typeof options.validate === 'function' ? options.validate() : ''
          if (message) return { kind: 'validation', message }
          return options.action()
        },
        async runRecordDelete() {
          return { kind: 'cancelled' }
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord(outcome) {
          return outcome && outcome.result ? outcome.result.record : null
        },
        notifyPreviousPageRecordChange() {}
      }
    },
    wxOverrides: {
      showToast(options) {
        toasts.push(options)
      },
      getStorageSync(key) {
        return storage.has(key) ? storage.get(key) : ''
      },
      setStorageSync(key, value) {
        storage.set(key, value)
      },
      removeStorageSync(key) {
        storage.delete(key)
      }
    }
  })
  return { harness, toasts, adds, updates, storage }
}

// 编辑页删除路径环境：真实 recordCommands 走确认 modal，云端 remove 成功；
// modal 与本地存储（草稿 + 一次性分段意图键）均可观察。
function createEditDeleteEnv(relativePath, loadOptions) {
  const modals = []
  const storage = new Map()
  const harness = loadRecordPageHarness(relativePath, {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async remove() {
              return { kind: 'success', result: {} }
            }
          }
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord() {
          return null
        },
        notifyPreviousPageRecordChange() {}
      }
    },
    wxOverrides: {
      showModal(options) {
        modals.push(options)
      },
      getStorageSync(key) {
        return storage.has(key) ? storage.get(key) : ''
      },
      setStorageSync(key, value) {
        storage.set(key, value)
      },
      removeStorageSync(key) {
        storage.delete(key)
      }
    }
  })
  harness.page.onLoad(loadOptions)
  return { harness, modals, storage }
}

// 合并路径（reopened）的编辑页保存环境：真实 recordCommands 与 recordPageSync.getSavedRecord，
// 云端 add 固定返回 reopened + 持久化记录；modal、toast、navigateBack 与本地草稿存储均可观察。
function createPeriodEditMergeEnv(persistedRecord) {
  const toasts = []
  const modals = []
  const adds = []
  const updates = []
  const changes = []
  const navigateBackCalls = []
  const storage = new Map()
  const realUtil = require(path.join(repoRoot, 'utils/util.js'))
  const realRecordPageSync = require(path.join(repoRoot, 'utils/recordPageSync.js'))
  const harness = loadRecordPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': { ...realUtil, formatDate: () => '2026-09-20' },
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add(collection, payload) {
              adds.push({ collection, payload })
              return {
                kind: 'success',
                result: { code: 0, id: persistedRecord._id, reopened: true, record: persistedRecord }
              }
            },
            async update(collection, id, payload) {
              updates.push({ collection, id, payload })
              return { kind: 'success', result: { record: { _id: id, ...payload } } }
            }
          }
        }
      },
      'utils/recordPageSync.js': {
        getSavedRecord: realRecordPageSync.getSavedRecord,
        notifyPreviousPageRecordChange(change) {
          changes.push(change)
        }
      }
    },
    wxOverrides: {
      showToast(options) {
        toasts.push(options)
      },
      showModal(options) {
        modals.push(options)
      },
      navigateBack() {
        navigateBackCalls.push({})
      },
      getStorageSync(key) {
        return storage.has(key) ? storage.get(key) : ''
      },
      setStorageSync(key, value) {
        storage.set(key, value)
      },
      removeStorageSync(key) {
        storage.delete(key)
      }
    }
  })
  return { harness, toasts, modals, adds, updates, changes, navigateBackCalls, storage }
}

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

function createUtilStub() {
  return {
    formatDate() {
      return '2026-09-20'
    },
    isValidDateString(value) {
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    }
  }
}

function stubGetPeriodDuration(period) {
  const util = require(path.join(repoRoot, 'utils/util.js'))
  const range = util.normalizeDateRange(period)
  if (!range) return 0
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
}

test('record tab pull-to-refresh reloads the visible period list and stops on success or failure', async () => {
  const periodJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'pages/period/period.json'), 'utf8'))
  assert.equal(periodJson.enablePullDownRefresh, true)
  const periodWxml = fs.readFileSync(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')
  assert.match(periodWxml, /刷新失败，正在显示上次的内容/)

  let releaseRefresh
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve })
  let call = 0
  const pull = { stops: 0 }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              call += 1
              if (call === 1) {
                return {
                  kind: 'success',
                  data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03' }]
                }
              }
              if (call === 2) {
                await refreshGate
                return {
                  kind: 'success',
                  data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03' }]
                }
              }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      },
      stopPullDownRefresh() {
        pull.stops += 1
      }
    }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.periods[0]._id, 'p1')

    const refreshing = harness.page.onPullDownRefresh()
    assert.equal(harness.page.data.loading, true)
    assert.equal(pull.stops, 0)
    releaseRefresh()
    await refreshing
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.loadFailed, false)
    assert.equal(harness.page.data.periods[0]._id, 'p1')
    assert.equal(pull.stops, 1)

    await harness.page.onPullDownRefresh()
    assert.equal(pull.stops, 2)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.loadFailed, true)
    assert.equal(harness.page.data.hasLoaded, true)
    assert.equal(harness.page.data.periods[0]._id, 'p1')
  } finally {
    harness.teardown()
  }
})

test('record tab pull-to-refresh reloads the visible memory list and stops on success or failure', async () => {
  let releaseRefresh
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve })
  let memoryCalls = 0
  const pull = { stops: 0 }
  const harness = loadRecordPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              if (collection === 'periods') return { kind: 'success', data: [] }
              memoryCalls += 1
              if (memoryCalls === 1) {
                return { kind: 'success', data: [{ _id: 'm1', date: '2026-06-02', note: '野餐' }] }
              }
              if (memoryCalls === 2) {
                await refreshGate
                return { kind: 'success', data: [{ _id: 'm1', date: '2026-06-02', note: '野餐' }] }
              }
              return { kind: 'retryable-failure', message: 'network down' }
            }
          }
        }
      }
    },
    wxOverrides: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      },
      stopPullDownRefresh() {
        pull.stops += 1
      }
    }
  })

  try {
    await harness.page.onShow()
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    assert.equal(harness.page.data.segment, 'memory')
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.equal(harness.page.data.memories[0]._id, 'm1')
    assert.equal(harness.page.data.memoryLoading, false)

    const refreshing = harness.page.onPullDownRefresh()
    assert.equal(harness.page.data.memoryLoading, true)
    assert.equal(harness.page.data.loading, false)
    assert.equal(pull.stops, 0)
    releaseRefresh()
    await refreshing
    assert.equal(harness.page.data.memoryLoading, false)
    assert.equal(harness.page.data.memoryLoadFailed, false)
    assert.equal(harness.page.data.memories[0]._id, 'm1')
    assert.equal(pull.stops, 1)

    await harness.page.onPullDownRefresh()
    assert.equal(pull.stops, 2)
    assert.equal(harness.page.data.memoryLoading, false)
    assert.equal(harness.page.data.memoryLoadFailed, true)
    assert.equal(harness.page.data.memoryHasLoaded, true)
    assert.equal(harness.page.data.memories[0]._id, 'm1')
  } finally {
    harness.teardown()
  }
})

// 与 tests/record-draft.test.js 同形的页面 harness：加载真实页面 JS，
// 用 Module._load 换掉依赖接缝，实例化 Page 定义后直接驱动页面方法。
function loadRecordPageHarness(relativePath, { mocks = {}, wxOverrides = {} } = {}) {
  const absolutePagePath = path.join(repoRoot, relativePath)
  const absoluteMocks = Object.fromEntries(
    Object.entries(mocks).map(([relativeMockPath, value]) => [
      path.join(repoRoot, relativeMockPath),
      value
    ])
  )
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered = null

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = {
    navigateBack() {},
    navigateTo() {},
    showToast() {},
    showModal() {},
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    ...wxOverrides
  }
  global.Page = config => {
    registered = config
  }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (Object.prototype.hasOwnProperty.call(absoluteMocks, resolved)) {
      return absoluteMocks[resolved]
    }
    return originalLoad.apply(this, arguments)
  }

  require(absolutePagePath)
  Module._load = originalLoad

  if (!registered) {
    throw new Error(`${relativePath} did not register a Page(...) definition`)
  }

  const page = instantiateRecordPage(registered)

  return {
    page,
    teardown() {
      Module._load = originalLoad
      global.Page = originalPage
      global.wx = originalWx
      delete require.cache[require.resolve(absolutePagePath)]
    }
  }
}

function instantiateRecordPage(config) {
  const page = {
    data: { ...(config.data || {}) },
    setDataCalls: [],
    setData(update, callback) {
      this.setDataCalls.push(update)
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }

  Object.entries(config).forEach(([key, value]) => {
    if (key === 'data') return
    page[key] = typeof value === 'function' ? value.bind(page) : value
  })

  return page
}
