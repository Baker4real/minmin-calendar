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

test('runRecordSave preserves retryable failures as retry actions and keeps the page on screen', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()
  let retried = false
  const retry = async () => {
    retried = true
    return { kind: 'success', result: { code: 0 } }
  }

  const result = await recordCommands.runRecordSave({
    page,
    wx: env.wx,
    timer: env.timer,
    action: async () => ({
      kind: 'retryable-failure',
      message: '云数据库查询超时 (15000ms)',
      retry
    }),
    validate: null,
    successTitle: '保存成功',
    failureTitle: '保存失败'
  })

  assert.equal(result.kind, 'retryable-failure')
  assert.equal(typeof result.retry, 'function')
  assert.deepEqual(page.setDataCalls, [{ saving: true }, { saving: false }])
  assert.deepEqual(env.wx.toasts, [{ title: '保存失败，请重试', icon: 'none' }])
  assert.equal(env.timer.calls.length, 0)
  assert.equal(env.navigateBackCalls.length, 0)

  const retryResult = await result.retry()
  assert.deepEqual(retryResult, { kind: 'success', result: { code: 0 } })
  assert.equal(retried, true)
})

test('runRecordSave keeps room-repair failures distinct from generic save failures', async () => {
  assert.equal(typeof recordCommands.runRecordSave, 'function')

  const page = createFakePage({ saving: false })
  const env = createFakeCommandEnv()

  const result = await recordCommands.runRecordSave({
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
  assert.deepEqual(env.wx.toasts, [{ title: '房间状态已变化，请重新绑定', icon: 'none' }])
  assert.equal(env.timer.calls.length, 0)
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

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'success')
  assert.equal(actionCalls, 1)
  assert.deepEqual(env.wx.toasts, [{ title: '已删除' }])
  assert.equal(env.timer.calls.length, 1)
  env.timer.calls[0].fn()
  assert.equal(env.navigateBackCalls.length, 1)
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
      ]
    },
    { loading: false }
  ])
  assert.deepEqual(calcStatsCalls, [rawPeriods])
  assert.deepEqual(env.wx.toasts, [])
})

test('runRecordListLoad keeps retryable list failures user-visible and retryable for memories', async () => {
  assert.equal(typeof recordCommands.runRecordListLoad, 'function')

  const page = createFakePage({ loading: false })
  const env = createFakeCommandEnv()

  const result = await recordCommands.runRecordListLoad({
    page,
    wx: env.wx,
    loadingKey: 'loading',
    itemsKey: 'memories',
    action: async () => ({
      kind: 'retryable-failure',
      message: 'network down',
      retry: async () => ({ kind: 'success', data: [] })
    }),
    mapRecords: records => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    retryableTitle: '加载失败，请检查网络',
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })

  assert.equal(result.kind, 'retryable-failure')
  assert.equal(typeof result.retry, 'function')
  assert.deepEqual(page.setDataCalls, [{ loading: true }, { loading: false }])
  assert.deepEqual(env.wx.toasts, [{ title: '加载失败，请检查网络', icon: 'none' }])
})

test('period and memory list templates keep the REC-03 visible row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')

  assert.match(periodWxml, /\{\{item\.startDate\}\}\s*~\s*\{\{item\.endDate\}\}/)
  assert.match(periodWxml, /\{\{item\.note \|\| '无备注'\}\}/)
  assert.match(periodWxml, /\{\{item\.duration\}\}天/)

  assert.match(memoryWxml, /\{\{item\.date\}\}/)
  assert.match(memoryWxml, /\{\{item\.note \|\| '我们的欢乐时光'\}\}/)
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
  const timerCalls = []

  return {
    navigateBackCalls,
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
        return promise
      },
      navigateBack() {
        navigateBackCalls.push({ at: navigateBackCalls.length })
      }
    }
  }
}

function readPageFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}
