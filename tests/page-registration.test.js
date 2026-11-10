const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const recordPageSync = require('../utils/recordPageSync')
const { createMiniProgram } = require('./helpers/miniProgram')

test('period record tab has no back button and the standalone memory page stays registered as a compat route', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf8'))
  const tabs = appConfig.tabBar.list.map(tab => tab.pagePath)
  assert.ok(tabs.includes('pages/period/period'), 'the record tab must stay a configured tab')
  // issue #103 方案 A：独立欢乐时光列表页保留为兼容路由（深链/历史页面栈仍可达）
  assert.ok(
    appConfig.pages.includes('pages/memory/memory'),
    'the standalone memory page stays registered as a compat route'
  )

  // tab 页不画返回键：导航模型与其他 tab 一致
  const wxml = fs.readFileSync(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')
  assert.equal(wxml.includes('nav-back'), false, 'record tab must not paint a back button')
})

test('record tab segments period and memory lists behind one radio group', () => {
  const wxml = fs.readFileSync(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')

  // 分段控件：经期 / 欢乐时光 同级可达（radio 朗读语义由 interaction-semantics 钉住）
  assert.match(wxml, /class="segment-control"/)
  assert.match(wxml, /class="segment-option \{\{segment === 'period' \? 'active' : ''\}\}"/)
  assert.match(wxml, /data-segment="period"/)
  assert.match(wxml, /class="segment-option \{\{segment === 'memory' \? 'active' : ''\}\}"/)
  assert.match(wxml, /data-segment="memory"/)

  // 经期分段保留现有列表结构；欢乐时光分段复用同一套列表状态机（memory 前缀键），
  // 列表以月份分组卡渲染（issue #108），行循环挂在分组数组的 records 上
  assert.match(wxml, /wx:if="\{\{segment === 'period'\}\}"/)
  assert.match(wxml, /<view wx:else>/, 'the memory segment is the else branch of the period segment')
  assert.match(wxml, /wx:for="\{\{memoryGroups\}\}"/)
  assert.match(wxml, /memoryLoadFailed/)
  assert.match(wxml, /memoryLoading/)
  assert.match(wxml, /memoryHasLoaded/)

  // 导航标题不再与分段重名
  assert.match(wxml, /nav-title">记录</)
})

test('index page onShow consumes RoomDataClient no-room outcomes without legacy getters', async () => {
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return { kind: 'no-room' }
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        },
        getRoomCode() {
          throw new Error('legacy getter should not be used')
        },
        getPeriods() {
          throw new Error('legacy list wrapper should not be used')
        },
        getMemories() {
          throw new Error('legacy list wrapper should not be used')
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.roomStatusTitle, '还没绑定房间')
    assert.equal(harness.page.data.roomStatusAction, 'bind')
    assert.deepEqual([...calls], ['periods', 'memories'])
  } finally {
    harness.teardown()
  }
})

test('index page exposes retry state and can reload after retryable RoomDataClient failures', async () => {
  const outcomes = [
    { kind: 'retryable-failure', message: '同步房间状态失败：network down' },
    { kind: 'retryable-failure', message: '同步房间状态失败：network down' },
    { kind: 'success', data: [{ _id: 'p1', startDate: '2026-06-01' }] },
    { kind: 'success', data: [{ _id: 'm1', date: '2026-06-03' }] }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.roomStatusAction, 'retry')
    assert.equal(harness.page.data.roomStatusDesc, '网络不太稳定，请重试')
    assert.doesNotMatch(harness.page.data.roomStatusDesc, /network down/)

    harness.page.handleRoomStatusAction()
    if (harness.page._loadingPromise) {
      await harness.page._loadingPromise
    }

    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.periods, undefined)
    assert.equal(harness.page.data.memories, undefined)
    assert.equal(harness.page.data.dayDetailsByDate, undefined)
    assert.deepEqual(harness.page._homeRecords.periods, [{ _id: 'p1', startDate: '2026-06-01' }])
    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm1', date: '2026-06-03' }])
    assert.deepEqual(calls, ['periods', 'memories', 'periods', 'memories'])
  } finally {
    harness.teardown()
  }
})

test('index page shows available memories when periods fail on the first load', async () => {
  const outcomes = [
    { kind: 'retryable-failure', message: 'period network down' },
    { kind: 'success', data: [{ _id: 'm1', date: '2026-06-03' }] }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已显示欢乐时光')
    assert.deepEqual(harness.page._homeRecords.periods, [])
    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm1', date: '2026-06-03' }])
    assert.deepEqual(calls, ['periods', 'memories'])
  } finally {
    harness.teardown()
  }
})

test('index page starts period and memory loads together so one timeout does not block the other', async () => {
  const calls = []
  let resolvePeriods
  let loadPromise
  const client = {
    list(collection) {
      calls.push(collection)
      if (collection === 'periods') {
        return new Promise(resolve => {
          resolvePeriods = () => resolve({ kind: 'retryable-failure', message: 'period timeout' })
        })
      }
      return Promise.resolve({ kind: 'success', data: [{ _id: 'm1', date: '2026-06-03' }] })
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    loadPromise = startPageOnShow(harness.page)
    await Promise.resolve()

    assert.deepEqual(calls, ['periods', 'memories'])

    resolvePeriods()
    await loadPromise
    assert.equal(harness.page.data.syncStatusText, '已显示欢乐时光')
  } finally {
    if (resolvePeriods) resolvePeriods()
    if (loadPromise) await loadPromise.catch(() => {})
    harness.teardown()
  }
})

test('index page keeps loaded calendar visible while refreshing on later onShow', async () => {
  const outcomes = [
    { kind: 'success', data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }] },
    { kind: 'success', data: [{ _id: 'm1', date: '2026-06-02', note: 'first' }] },
    { kind: 'success', data: [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }] },
    { kind: 'success', data: [{ _id: 'm2', date: '2026-07-03', note: 'second' }] }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      await waitForTimerTick()
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)

    harness.page.setDataCalls = []
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.deepEqual(harness.page._homeRecords.periods, [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }])
    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm2', date: '2026-07-03', note: 'second' }])
    assert.deepEqual(calls, ['periods', 'memories', 'periods', 'memories'])
    assert.equal(harness.page.setDataCalls.some(update => update.loading === true), false)
    assert.equal(harness.page.setDataCalls.some(update => update.refreshing === true), true)
    assert.equal(harness.page.setDataCalls.some(update => update.syncStatusText === '正在同步'), false)
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(harness.page.data.syncStatusVisible, true)
  } finally {
    harness.teardown()
  }
})

test('index page refreshes quietly when returning with unchanged data', async () => {
  const period = { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }
  const memory = { _id: 'm1', date: '2026-06-02', note: 'first' }
  const outcomes = [
    { kind: 'success', data: [period] },
    { kind: 'success', data: [memory] },
    { kind: 'success', data: [{ ...period }] },
    { kind: 'success', data: [{ ...memory }] }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    harness.page.setDataCalls = []
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.deepEqual(calls, ['periods', 'memories', 'periods', 'memories'])
    assert.equal(harness.page.setDataCalls.some(update => update.loading === true), false)
    assert.equal(harness.page.setDataCalls.some(update => update.syncStatusText === '正在同步'), false)
    assert.equal(harness.page.setDataCalls.some(update => update.syncStatusText === '已同步'), false)
  } finally {
    harness.teardown()
  }
})

test('index page treats reordered background data as unchanged', async () => {
  const periods = [
    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 },
    { _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }
  ]
  const memories = [
    { _id: 'm1', date: '2026-06-02', note: 'first' },
    { _id: 'm2', date: '2026-07-03', note: 'second' }
  ]
  const outcomes = [
    { kind: 'success', data: periods },
    { kind: 'success', data: memories },
    { kind: 'success', data: [...periods].reverse() },
    { kind: 'success', data: [...memories].reverse() }
  ]
  const client = {
    async list() {
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    harness.page.setDataCalls = []
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.equal(harness.page.setDataCalls.some(update => update.syncStatusText === '已同步'), false)
  } finally {
    harness.teardown()
  }
})

test('index page keeps existing calendar content and stays quiet on background retryable load failures without local changes', async () => {
  const outcomes = [
    { kind: 'success', data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }] },
    { kind: 'success', data: [{ _id: 'm1', date: '2026-06-02', note: 'first' }] },
    { kind: 'retryable-failure', message: 'network down' },
    { kind: 'retryable-failure', message: 'network down' }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    harness.page.setDataCalls = []
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.deepEqual(harness.page._homeRecords.periods, [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }])
    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm1', date: '2026-06-02', note: 'first' }])
    assert.deepEqual(calls, ['periods', 'memories', 'periods', 'memories'])
    assert.equal(harness.page.setDataCalls.some(update => update.loading === true), false)
  } finally {
    harness.teardown()
  }
})

test('index page keeps a blocking room outcome visible after background refresh', async () => {
  const outcomes = [
    { kind: 'success', data: [{ _id: 'p1', startDate: '2026-06-01' }] },
    { kind: 'success', data: [] },
    { kind: 'no-room' },
    { kind: 'no-room' }
  ]
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return outcomes.shift()
            }
          }
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.hasLoadedHomeData, false)
    assert.equal(harness.page.data.roomStatusAction, 'bind')
  } finally {
    harness.teardown()
  }
})

test('index page updates successful collections and preserves failed ones during background refresh', async () => {
  const outcomes = [
    { kind: 'success', data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }] },
    { kind: 'success', data: [{ _id: 'm1', date: '2026-06-02', note: 'first' }] },
    { kind: 'success', data: [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }] },
    { kind: 'retryable-failure', message: 'memory network down' }
  ]
  const calls = []
  const client = {
    async list(collection) {
      calls.push(collection)
      return outcomes.shift()
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    harness.page.setDataCalls = []
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.syncStatusText, '已保留上次的欢乐时光')
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.deepEqual(harness.page._homeRecords.periods, [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }])
    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm1', date: '2026-06-02', note: 'first' }])
    assert.deepEqual(calls, ['periods', 'memories', 'periods', 'memories'])
    assert.equal(harness.page.setDataCalls.some(update => update.loading === true), false)
  } finally {
    harness.teardown()
  }
})

test('index page merges a saved record locally before background sync completes', async () => {
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return { kind: 'success', data: [] }
            }
          }
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'add',
      record: { _id: 'm2', date: '2026-07-03', note: 'second' }
    })

    assert.deepEqual(harness.page._homeRecords.memories, [{ _id: 'm2', date: '2026-07-03', note: 'second' }])
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
    assert.equal(harness.page.data.syncStatusVisible, true)
  } finally {
    harness.teardown()
  }
})

test('index page keeps a canonical record change when an older background snapshot resolves', async () => {
  const initialPeriod = {
    _id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    duration: 3
  }
  let loadCount = 0
  let resolveBackgroundPeriods
  let resolveBackgroundMemories
  const client = {
    list(collection) {
      loadCount += 1
      if (loadCount <= 2) {
        return Promise.resolve({
          kind: 'success',
          data: collection === 'periods' ? [initialPeriod] : []
        })
      }
      return new Promise(resolve => {
        const finish = () => resolve({
          kind: 'success',
          data: collection === 'periods' ? [initialPeriod] : []
        })
        if (collection === 'periods') resolveBackgroundPeriods = finish
        else resolveBackgroundMemories = finish
      })
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })
  let backgroundLoad

  try {
    await awaitPageOnShow(harness.page)
    backgroundLoad = startPageOnShow(harness.page)
    await Promise.resolve()

    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'add',
      record: {
        _id: 'p2',
        startDate: '2026-06-29',
        endDate: '2026-07-02',
        duration: 4
      }
    })

    resolveBackgroundPeriods()
    resolveBackgroundMemories()
    await backgroundLoad

    assert.deepEqual(
      harness.page._homeRecords.periods.map(item => item._id),
      ['p2', 'p1']
    )
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
    assert.equal(harness.page.data.syncStatusVisible, true)
  } finally {
    if (resolveBackgroundPeriods) resolveBackgroundPeriods()
    if (resolveBackgroundMemories) resolveBackgroundMemories()
    if (backgroundLoad) await backgroundLoad.catch(() => {})
    harness.teardown()
  }
})

test('index page keeps pending sync feedback visible when background loading starts', async () => {
  let callCount = 0
  let resolveBackgroundPeriods
  let resolveBackgroundMemories
  const client = {
    list(collection) {
      callCount += 1
      if (callCount <= 2) return Promise.resolve({ kind: 'success', data: [] })
      return new Promise(resolve => {
        const finish = () => resolve({ kind: 'success', data: [] })
        if (collection === 'periods') resolveBackgroundPeriods = finish
        else resolveBackgroundMemories = finish
      })
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })
  let backgroundLoad

  try {
    await awaitPageOnShow(harness.page)
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'add',
      record: { _id: 'p1', startDate: '2026-06-01' }
    })

    backgroundLoad = startPageOnShow(harness.page)
    await Promise.resolve()

    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')

    resolveBackgroundPeriods()
    resolveBackgroundMemories()
    await backgroundLoad
  } finally {
    if (resolveBackgroundPeriods) resolveBackgroundPeriods()
    if (resolveBackgroundMemories) resolveBackgroundMemories()
    if (backgroundLoad) await backgroundLoad.catch(() => {})
    harness.teardown()
  }
})

test('index page initial retry start clears stale room and sync status without restoring old loaded state', async () => {
  let callCount = 0
  let resolveRetryPeriods
  let resolveRetryMemories
  const client = {
    list(collection) {
      callCount += 1
      if (callCount <= 2) {
        return Promise.resolve({
          kind: 'success',
          data: collection === 'periods'
            ? [{ _id: 'p1', startDate: '2026-06-01' }]
            : []
        })
      }
      if (callCount <= 4) return Promise.resolve({ kind: 'no-room' })
      return new Promise(resolve => {
        const finish = () => resolve({ kind: 'success', data: [] })
        if (collection === 'periods') resolveRetryPeriods = finish
        else resolveRetryMemories = finish
      })
    }
  }
  const harness = loadPageHarness('pages/index/index.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })
  let retryLoad

  try {
    await awaitPageOnShow(harness.page)
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.hasLoadedHomeData, false)

    harness.page.setData({
      syncStatusVisible: true,
      syncStatusText: '旧同步状态'
    })
    retryLoad = harness.page.loadData({ background: false })
    await Promise.resolve()

    assert.equal(harness.page.data.loading, true)
    assert.equal(harness.page.data.hasLoadedHomeData, false)
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.roomStatusTitle, '')
    assert.equal(harness.page.data.roomStatusDesc, '')
    assert.equal(harness.page.data.roomStatusActionText, '')
    assert.equal(harness.page.data.roomStatusAction, '')
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')

    resolveRetryPeriods()
    resolveRetryMemories()
    await retryLoad
  } finally {
    if (resolveRetryPeriods) resolveRetryPeriods()
    if (resolveRetryMemories) resolveRetryMemories()
    if (retryLoad) await retryLoad.catch(() => {})
    harness.teardown()
  }
})

test('period edit save validates real calendar dates before building a payload', async () => {
  let payloadBuilds = 0
  let mutationCalls = 0
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': {
        formatDate() {
          return '2026-06-26'
        },
        isValidDateString(value) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
          const [year, month, day] = value.split('-').map(Number)
          const date = new Date(year, month - 1, day)
          return date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        },
        formatDisplayDate(...args) {
          return require('../utils/util').formatDisplayDate(...args)
        }
      },
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add() {
              mutationCalls += 1
              return { kind: 'success', result: { id: 'p1' } }
            },
            async update() {
              mutationCalls += 1
              return { kind: 'success', result: { id: 'p1' } }
            }
          }
        }
      },
      'utils/cycle.js': {
        PERIOD_STATUS_OPTIONS: [],
        isPeriodStatus(value) {
          return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
        },
        getPeriodStatus(period = {}) {
          if (typeof period.status === 'string' && ['ongoing', 'unknown-end', 'known-end'].includes(period.status)) {
            return period.status
          }
          return period.endDate ? 'known-end' : 'unknown-end'
        },
        FLOW_OPTIONS: [],
        buildSymptomOptions() {
          return []
        },
        periodStatusHint() {
          return ''
        },
        buildPeriodPayload() {
          payloadBuilds += 1
          return { startDate: '2026-02-31', endDate: '2026-03-02', duration: 1 }
        }
      },
      'utils/recordEditRoute.js': {
        parsePeriodEditOptions() {
          return {
            id: '',
            startDate: '2026-02-31',
            endDate: '2026-03-02',
            note: '',
            flow: '',
            symptoms: [],
            isEdit: false
          }
        }
      },
      'utils/recordPageSync.js': {
        notifyPreviousPageRecordChange() {},
        getSavedRecord: recordPageSync.getSavedRecord
      }
    }
  })

  try {
    harness.page.onLoad({})
    const outcome = await harness.page.save()

    // 校验结果走真实 recordCommands：可定位到开始日期的错误交回页面（issue #156）
    assert.deepEqual(outcome, {
      kind: 'validation',
      message: '请选择有效的开始日期',
      fieldErrors: { startDate: '请选择有效的开始日期' }
    })
    assert.equal(payloadBuilds, 0)
    assert.equal(mutationCalls, 0)
  } finally {
    harness.teardown()
  }
})

test('period edit save rejects missing dates before building a payload', async () => {
  const result = await runPeriodEditSaveValidationCase({
    startDate: '',
    endDate: '2026-03-02'
  })

  assert.deepEqual(result.outcome, {
    kind: 'validation',
    message: '请选择开始日期',
    fieldErrors: { startDate: '请选择开始日期' }
  })
  assert.equal(result.payloadBuilds, 0)
  assert.equal(result.mutationCalls, 0)
  assert.equal(result.notifyCalls, 0)
})

test('period edit save rejects reversed ranges before building a payload', async () => {
  const result = await runPeriodEditSaveValidationCase({
    startDate: '2026-03-03',
    endDate: '2026-03-02'
  })

  assert.deepEqual(result.outcome, {
    kind: 'validation',
    message: '结束日期不能早于开始',
    fieldErrors: { endDate: '结束日期不能早于开始' }
  })
  assert.equal(result.payloadBuilds, 0)
  assert.equal(result.mutationCalls, 0)
  assert.equal(result.notifyCalls, 0)
})

test('period edit save notifies the previous page with the canonical saved record', async () => {
  const canonicalPeriod = {
    _id: 'p9',
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: 'x'.repeat(500),
    duration: 3,
    flow: 'heavy',
    symptoms: ['cramps']
  }
  const clientPayload = {
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: 'x'.repeat(503),
    duration: 99,
    flow: 'heavy',
    symptoms: ['unknown']
  }
  const mutationPayloads = []
  const notifications = []
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add(collection, payload) {
              assert.equal(collection, 'periods')
              mutationPayloads.push(payload)
              return {
                kind: 'success',
                result: { id: canonicalPeriod._id, record: canonicalPeriod }
              }
            }
          }
        }
      },
      'utils/cycle.js': {
        PERIOD_STATUS_OPTIONS: [],
        isPeriodStatus(value) {
          return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
        },
        getPeriodStatus(period = {}) {
          if (typeof period.status === 'string' && ['ongoing', 'unknown-end', 'known-end'].includes(period.status)) {
            return period.status
          }
          return period.endDate ? 'known-end' : 'unknown-end'
        },
        FLOW_OPTIONS: [],
        buildSymptomOptions() {
          return []
        },
        periodStatusHint() {
          return ''
        },
        buildPeriodPayload() {
          return clientPayload
        }
      },
      'utils/recordCommands.js': createRecordSaveCommandStub(),
      'utils/recordEditRoute.js': {
        parsePeriodEditOptions() {
          return {
            id: '',
            startDate: clientPayload.startDate,
            endDate: clientPayload.endDate,
            note: clientPayload.note,
            flow: clientPayload.flow,
            symptoms: clientPayload.symptoms,
            isEdit: false
          }
        }
      },
      'utils/recordPageSync.js': createRecordPageSyncStub(notifications)
    }
  })

  try {
    harness.page.onLoad({})
    const outcome = await harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.deepEqual(mutationPayloads, [clientPayload])
    assert.deepEqual(notifications, [{
      collection: 'periods',
      mode: 'add',
      record: canonicalPeriod
    }])
    assert.notEqual(notifications[0].record.duration, 99)
    assert.deepEqual(notifications[0].record.symptoms, ['cramps'])
    assert.equal(notifications[0].record.note.length, 500)
  } finally {
    harness.teardown()
  }
})

test('memory edit save notifies the previous page with the canonical saved record', async () => {
  const canonicalMemory = {
    _id: 'm9',
    date: '2026-06-24',
    note: 'n'.repeat(500)
  }
  const result = await runMemoryEditSaveCase({
    routeState: {
      id: '',
      date: '2026-06-23',
      note: 'n'.repeat(503),
      isEdit: false
    },
    mutationOutcome: {
      kind: 'success',
      result: { id: canonicalMemory._id, record: canonicalMemory }
    }
  })

  assert.equal(result.outcome.kind, 'success')
  assert.deepEqual(result.mutationInputs, [{
    collection: 'memories',
    payload: { date: '2026-06-23', note: 'n'.repeat(503) }
  }])
  assert.deepEqual(result.notifications, [{
    collection: 'memories',
    mode: 'add',
    record: canonicalMemory
  }])
  assert.equal(result.notifications[0].record.note.length, 500)
})

test('memory edit save keeps legacy success without an optimistic notification', async () => {
  const result = await runMemoryEditSaveCase({
    routeState: {
      id: '',
      date: '2026-06-24',
      note: 'legacy',
      isEdit: false
    },
    mutationOutcome: { kind: 'success', result: { id: 'm9' } }
  })

  assert.deepEqual(result.outcome, { kind: 'success', result: { id: 'm9' } })
  assert.equal(result.mutationInputs.length, 1)
  assert.equal(result.notifications.length, 0)
})

test('memory edit save rejects invalid calendar dates before mutation', async () => {
  const result = await runMemoryEditSaveCase({
    routeState: {
      id: '',
      date: '2026-02-31',
      note: 'invalid date',
      isEdit: false
    },
    mutationOutcome: { kind: 'success', result: { id: 'm9' } },
    commands: require('../utils/recordCommands')
  })

  assert.deepEqual(result.outcome, {
    kind: 'validation',
    message: '请选择有效日期',
    fieldErrors: { date: '请选择有效日期' }
  })
  assert.equal(result.mutationInputs.length, 0)
  assert.equal(result.notifications.length, 0)
})

test('period edit onLoad tolerates malformed route encoding', () => {
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {},
      'utils/cycle.js': {
        PERIOD_STATUS_OPTIONS: [],
        isPeriodStatus(value) {
          return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
        },
        getPeriodStatus(period = {}) {
          if (typeof period.status === 'string' && ['ongoing', 'unknown-end', 'known-end'].includes(period.status)) {
            return period.status
          }
          return period.endDate ? 'known-end' : 'unknown-end'
        },
        FLOW_OPTIONS: [{ value: 'heavy', label: '量多' }],
        periodStatusHint() {
          return ''
        },
        buildSymptomOptions(symptoms = []) {
          return symptoms.map(value => ({ value, label: value, selected: true }))
        }
      },
      'utils/recordCommands.js': {},
      'utils/recordPageSync.js': {}
    }
  })

  try {
    assert.doesNotThrow(() => {
      harness.page.onLoad({
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        note: '%',
        symptoms: '%E0%A4%A'
      })
    })

    assert.equal(harness.page.data.note, '%')
    assert.deepEqual(harness.page.data.symptoms, [])
    assert.equal(harness.page.data.startDate, '2026-06-01')
    // issue #100：补记过去日期的新增默认已结束（修订 #95 的固定进行中），
    // 路由里同在过去区间内的结束日期随之保留
    assert.equal(harness.page.data.status, 'known-end')
    assert.equal(harness.page.data.endDate, '2026-06-05')

    // 编辑旧记录（带 id 与结束日期）：保守解释为已结束并保留结束日期
    assert.doesNotThrow(() => {
      harness.page.onLoad({
        id: 'p1',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        note: '%',
        symptoms: '%E0%A4%A'
      })
    })
    assert.equal(harness.page.data.status, 'known-end')
    assert.equal(harness.page.data.endDate, '2026-06-05')
  } finally {
    harness.teardown()
  }
})

test('memory edit onLoad tolerates malformed route encoding', () => {
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {},
      'utils/recordCommands.js': {},
      'utils/recordPageSync.js': {}
    }
  })

  try {
    assert.doesNotThrow(() => {
      harness.page.onLoad({
        date: '2026-06-03',
        note: '%E0%A4%A'
      })
    })

    assert.equal(harness.page.data.date, '2026-06-03')
    assert.equal(harness.page.data.note, '%E0%A4%A')
  } finally {
    harness.teardown()
  }
})

test('settings page onShow uses verified room lookup, keeps retryable sync failures visible, and syncs repaired room codes on export', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
        getRoomCode() {
          return ''
        },
        async getActiveRoom() {
          throw new Error('settings onShow should use getVerifiedActiveRoom')
        },
        async getVerifiedActiveRoom() {
          return {
            kind: 'retryable-failure',
            bound: false,
            roomCode: '',
            errorMsg: '同步房间状态失败：network down'
          }
        }
      },
      'utils/settingsFlow.js': {
        async copyRoomCode() {
          return { kind: 'success' }
        },
        async exportRecordsAsJson() {
          exportCalls += 1
          return {
            kind: 'room-repair',
            repair: {
              kind: 'success',
              bound: true,
              roomCode: 'ROOM02'
            }
          }
        },
        async clearLocalCache() {
          return { kind: 'success', roomCode: '未绑定' }
        }
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.roomCodeDisplay, '同步失败，请重试')
    assert.equal(harness.page.data.roomCode, '')

    await harness.page.exportData()

    assert.equal(exportCalls, 1)
    assert.equal(harness.page.data.roomCode, 'ROOM02')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM02')
  } finally {
    harness.teardown()
  }
})

test('bind page rechecks a cached room and clears stale bound state when verification says unbound', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.failNavigation('switchTab')
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM01')
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.bound, false)
  assert.equal(page.data.roomCode, '')
  assert.equal(page.data.errorMsg, '')
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
})

test('settings page exportData keeps repair retryable failures visible instead of relabeling as unbound', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
        getRoomCode() {
          return ''
        },
        async getVerifiedActiveRoom() {
          return {
            bound: true,
            roomCode: 'ROOM01'
          }
        }
      },
      'utils/settingsFlow.js': {
        async copyRoomCode() {
          return { kind: 'success' }
        },
        async exportRecordsAsJson() {
          exportCalls += 1
          return {
            kind: 'room-repair',
            repair: {
              kind: 'retryable-failure',
              message: '同步房间状态失败：network down'
            }
          }
        },
        async clearLocalCache() {
          return { kind: 'success', roomCode: '未绑定' }
        }
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')

    await harness.page.exportData()

    assert.equal(exportCalls, 1)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
  } finally {
    harness.teardown()
  }
})

async function runPeriodEditSaveValidationCase(overrides = {}) {
  let payloadBuilds = 0
  let mutationCalls = 0
  let notifyCalls = 0
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async add() {
              mutationCalls += 1
              return { kind: 'success', result: { id: 'p1' } }
            },
            async update() {
              mutationCalls += 1
              return { kind: 'success', result: { id: 'p1' } }
            }
          }
        }
      },
      'utils/cycle.js': {
        PERIOD_STATUS_OPTIONS: [],
        isPeriodStatus(value) {
          return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
        },
        getPeriodStatus(period = {}) {
          if (typeof period.status === 'string' && ['ongoing', 'unknown-end', 'known-end'].includes(period.status)) {
            return period.status
          }
          return period.endDate ? 'known-end' : 'unknown-end'
        },
        FLOW_OPTIONS: [],
        buildSymptomOptions() {
          return []
        },
        periodStatusHint() {
          return ''
        },
        buildPeriodPayload() {
          payloadBuilds += 1
          return { startDate: '2026-03-03', endDate: '2026-03-03', duration: 1 }
        }
      },
      'utils/recordEditRoute.js': {
        parsePeriodEditOptions() {
          return {
            id: '',
            startDate: '2026-03-03',
            endDate: '2026-03-03',
            note: '',
            flow: '',
            symptoms: [],
            isEdit: false,
            ...overrides
          }
        }
      },
      'utils/recordPageSync.js': {
        notifyPreviousPageRecordChange() {
          notifyCalls += 1
        },
        getSavedRecord: recordPageSync.getSavedRecord
      }
    }
  })

  try {
    harness.page.onLoad({})
    const outcome = await harness.page.save()
    return { outcome, payloadBuilds, mutationCalls, notifyCalls }
  } finally {
    harness.teardown()
  }
}

async function runMemoryEditSaveCase({ routeState, mutationOutcome, commands = createRecordSaveCommandStub() }) {
  const mutationInputs = []
  const notifications = []
  const client = {
    async add(collection, payload) {
      mutationInputs.push({ collection, payload })
      return mutationOutcome
    },
    async update(collection, id, payload) {
      mutationInputs.push({ collection, id, payload })
      return mutationOutcome
    }
  }
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: {
      'utils/util.js': createUtilStub(),
      'utils/cloud.js': {
        createRoomDataClient() {
          return client
        }
      },
      'utils/recordCommands.js': commands,
      'utils/recordEditRoute.js': {
        parseMemoryEditOptions() {
          return routeState
        }
      },
      'utils/recordPageSync.js': createRecordPageSyncStub(notifications)
    }
  })

  try {
    harness.page.onLoad({})
    const outcome = await harness.page.save()
    return { outcome, mutationInputs, notifications }
  } finally {
    harness.teardown()
  }
}

function createRecordSaveCommandStub() {
  return {
    async runRecordSave(options) {
      const message = options.validate()
      if (message) return { kind: 'validation', message }
      return options.action()
    }
  }
}

function createRecordPageSyncStub(notifications) {
  return {
    getSavedRecord: recordPageSync.getSavedRecord,
    notifyPreviousPageRecordChange(change) {
      notifications.push(change)
    }
  }
}

function loadPageHarness(relativePath, { mocks = {}, wxOverrides = {} } = {}) {
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
  global.wx = createPageHarnessWx(wxOverrides)
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

  const page = instantiatePage(registered)

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

function startPageOnShow(page) {
  const result = page.onShow()
  assert.ok(
    result && typeof result.then === 'function',
    'page onShow must return a Promise so the harness can await page load completion'
  )
  return result
}

async function awaitPageOnShow(page) {
  await startPageOnShow(page)
}

function waitForTimerTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function instantiatePage(config) {
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

function createPageHarnessWx(overrides = {}) {
  const base = {
    navigateBack() {},
    navigateTo() {},
    redirectTo() {},
    switchTab() {},
    showToast() {},
    showModal() {},
    showLoading() {},
    hideLoading() {},
    pageScrollTo() {},
    setClipboardData({ success }) {
      if (success) success()
    },
    getFileSystemManager() {
      return {
        writeFileSync() {}
      }
    },
    shareFileMessage({ success }) {
      if (success) success()
    },
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    env: {
      USER_DATA_PATH: '/tmp'
    },
    cloud: {
      async callFunction() {
        return { result: {} }
      }
    }
  }

  return Object.assign(base, overrides)
}

function createUtilStub() {
  return {
    formatDate(value) {
      if (typeof value === 'string') return value
      return '2026-06-26'
    },
    parseDate(dateStr) {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    },
    daysBetween(start, end) {
      return Math.round((end - start) / (24 * 60 * 60 * 1000))
    },
    isValidDateString(value) {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const [year, month, day] = value.split('-').map(Number)
      const date = new Date(year, month - 1, day)
      return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    },
    normalizeDateRange({ startDate, endDate } = {}) {
      if (!this.isValidDateString(startDate)) return null
      const hasEndDate = typeof endDate === 'string' && endDate.length > 0
      if (hasEndDate && !this.isValidDateString(endDate)) return null
      const normalizedEndDate = hasEndDate ? endDate : startDate
      if (startDate > normalizedEndDate) return null
      return { startDate, endDate: normalizedEndDate, hasEndDate }
    },
    formatDisplayDate(...args) {
      return require('../utils/util').formatDisplayDate(...args)
    }
  }
}

function buildHomeCalendarState({ year, month, periods = [], memories = [], today = '2026-06-26' } = {}) {
  return {
    year,
    month,
    today,
    periods,
    memories,
    days: [],
    nextPredict: null,
    predictDisplay: { date: '--', weekday: '' },
    predictionWindow: null,
    predictConfidence: '',
    cycleReminders: [],
    monthlyRecap: null,
    dayDetailsByDate: {},
    selectedDayDetail: null
  }
}

// issue #163：页面不可见（切走 tab、被编辑页盖住、小程序进后台）时根节点带 page-hidden，常驻装饰暂停在当前帧；
// 再次显示时第一件事就是去掉标记，不等云端加载结果。兼容路由 pages/memory/memory 会被自己的 switchTab 关掉，不在此列。
const PAGE_HIDDEN_PAGES = [
  'pages/index/index.js',
  'pages/settings/settings.js',
  'pages/period/edit/edit.js',
  'pages/memory/edit/edit.js'
]

test('pages pause their ambient decorations while hidden and resume as soon as they show again', () => {
  for (const relativePath of PAGE_HIDDEN_PAGES) {
    // 云端请求一直挂起：onShow 里的加载停在半路，标记只能来自 onShow 自己
    const harness = loadPageHarness(relativePath, {
      wxOverrides: { cloud: { callFunction: () => new Promise(() => {}) } }
    })
    try {
      const { page } = harness
      if (typeof page.onLoad === 'function') page.onLoad({})
      assert.ok(!page.data.pageHidden, `${relativePath} starts visible`)
      const first = page.setDataCalls.length
      page.onShow()
      assert.equal(page.setDataCalls.slice(first).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render the mark on its first show`)

      page.onHide()
      assert.equal(page.data.pageHidden, true, `${relativePath} marks itself hidden`)
      const writes = page.setDataCalls.length
      page.onHide()
      assert.equal(page.setDataCalls.slice(writes).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render an unchanged hidden mark`)

      page.onShow()
      assert.equal(page.data.pageHidden, false, `${relativePath} resumes on show before any load settles`)
      const shown = page.setDataCalls.length
      page.onShow()
      assert.equal(page.setDataCalls.slice(shown).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render an unchanged visible mark`)
    } finally {
      harness.teardown()
    }
  }
})

test('bind page pauses decorations while hidden and resumes before delayed verification settles', async (t) => {
  const app = createMiniProgram()
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.ok(!page.data.pageHidden)
  assert.equal(page.setDataCalls.some(update => 'pageHidden' in update), false)
  app.hide()
  assert.equal(page.data.pageHidden, true)
  const hiddenWrites = page.setDataCalls.length
  app.hide()
  assert.equal(page.setDataCalls.slice(hiddenWrites).some(update => 'pageHidden' in update), false)
  app.cloud.when('getMyRoom').defer()
  app.show()
  assert.equal(page.data.pageHidden, false)
  const shownWrites = page.setDataCalls.length
  app.cloud.when('getMyRoom').defer()
  app.show()
  assert.equal(page.setDataCalls.slice(shownWrites).some(update => 'pageHidden' in update), false)
  assert.equal(page.data.verifying, true)
})

test('every backdrop-filter in wxss is immediately followed by -webkit-backdrop-filter', () => {
  const skipDirs = new Set(['node_modules', 'cloudfunctions', '_external'])
  const files = []

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name.endsWith('.wxss')) files.push(full)
    }
  }

  walk(repoRoot)

  const unpaired = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!/^\s*backdrop-filter\s*:/.test(line)) return
      const next = lines[index + 1] || ''
      if (!/^\s*-webkit-backdrop-filter\s*:/.test(next)) {
        unpaired.push(`${path.relative(repoRoot, file)}:${index + 1}`)
      }
    })
  }

  assert.deepEqual(unpaired, [])
})
