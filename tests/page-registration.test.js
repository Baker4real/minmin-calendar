const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const recordPageSync = require('../utils/recordPageSync')

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

  const harness = loadPageHarness('pages/period/period.js', {})
  try {
    assert.equal(harness.page.goBack, undefined, 'record tab must not expose a goBack handler')
  } finally {
    harness.teardown()
  }
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

test('record tab onShow consumes a stored segment intent once and lands on the memory segment', async () => {
  const storage = { recordTabSegment: 'memory' }
  const removedKeys = []
  const calls = []
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              calls.push(collection)
              return {
                kind: 'success',
                data: [{ _id: 'm1', date: '2026-06-01', note: '野餐' }]
              }
            }
          }
        }
      },
      'utils/util.js': createUtilStub()
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      removeStorageSync(key) {
        removedKeys.push(key)
        delete storage[key]
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    // 一次性意图：消费并清除，落在欢乐时光分段且只加载该分段
    assert.deepEqual(removedKeys, ['recordTabSegment'])
    assert.equal(harness.page.data.segment, 'memory')
    assert.deepEqual(calls, ['memories'])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm1', date: '2026-06-01', note: '野餐' }])

    // 键已清除：再次 onShow 不被劫持，停在当前分段并重载它
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.segment, 'memory')
    assert.deepEqual(calls, ['memories', 'memories'])
  } finally {
    harness.teardown()
  }
})

test('record tab applyRecordChange lands on the saved record segment before the edit page returns', async () => {
  const harness = loadPageHarness('pages/period/period.js', {
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
      'utils/util.js': createUtilStub()
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.segment, 'period')

    // 保存欢乐时光后返回记录 tab：编辑页 notify 在返回定时器前同步触发，分段在返回前已就位
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'add',
      record: { _id: 'm1', date: '2026-06-01', note: '野餐' }
    })
    assert.equal(harness.page.data.segment, 'memory')

    // 经期保存/删除同理落在经期分段
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'update',
      record: { _id: 'p1', startDate: '2026-06-01' }
    })
    assert.equal(harness.page.data.segment, 'period')
  } finally {
    harness.teardown()
  }
})

// review #99 / issue #103：从记录 tab 进入编辑页保存时，applyRecordChange 已落分段，
// 编辑页同时写下的一次性意图在下一次 onShow 被消费并清除，不造成二次跳段或残留劫持
test('record tab consumes the edit-page intent without double-landing when applyRecordChange already landed', async () => {
  const storage = {}
  const removedKeys = []
  const calls = []
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              calls.push(collection)
              return { kind: 'success', data: [] }
            }
          }
        }
      },
      'utils/util.js': createUtilStub()
    },
    wxOverrides: {
      getStorageSync(key) {
        return storage[key] || ''
      },
      setStorageSync(key, value) {
        storage[key] = value
      },
      removeStorageSync(key) {
        removedKeys.push(key)
        delete storage[key]
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.segment, 'period')
    assert.deepEqual(calls, ['periods'])

    // 编辑页保存欢乐时光：notify 同步落在欢乐时光分段，一次性意图键同时被写下
    storage.recordTabSegment = 'memory'
    harness.page.applyRecordChange({
      collection: 'memories',
      mode: 'add',
      record: { _id: 'm1', date: '2026-06-01', note: '野餐' }
    })
    assert.equal(harness.page.data.segment, 'memory')

    // 返回记录 tab：意图被消费并清除，分段保持欢乐时光（同一分段再落一次，无可见跳动）
    await awaitPageOnShow(harness.page)
    assert.deepEqual(removedKeys, ['recordTabSegment'])
    assert.equal(harness.page.data.segment, 'memory')
    assert.deepEqual(calls, ['periods', 'memories'])

    // 意图已清除：手动切回经期分段后，后续 onShow 不被残留意图劫持回欢乐时光
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'period' } } })
    assert.equal(harness.page.data.segment, 'period')
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.segment, 'period')
    assert.deepEqual(removedKeys, ['recordTabSegment'])
  } finally {
    harness.teardown()
  }
})

test('record tab segment switch loads the target list and guards invalid segment values', async () => {
  const calls = []
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list(collection) {
              calls.push(collection)
              await waitForTimerTick()
              return { kind: 'success', data: [] }
            }
          }
        }
      },
      'utils/util.js': createUtilStub()
    }
  })

  try {
    await awaitPageOnShow(harness.page)
    assert.equal(harness.page.data.segment, 'period')
    assert.deepEqual(calls, ['periods'])

    // 手动切到欢乐时光：切换即加载目标分段，与独立列表页的 onShow 重载行为一致
    await harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    assert.equal(harness.page.data.segment, 'memory')
    assert.deepEqual(calls, ['periods', 'memories'])

    // 重点已选中分段是 no-op；非法值被守卫忽略，都不触发跳转或加载
    harness.page.selectSegment({ currentTarget: { dataset: { segment: 'memory' } } })
    harness.page.selectSegment({ currentTarget: { dataset: { segment: 'unknown' } } })
    assert.equal(harness.page.data.segment, 'memory')
    assert.deepEqual(calls, ['periods', 'memories'])
  } finally {
    harness.teardown()
  }
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
    assert.match(harness.page.data.roomStatusDesc, /network down/)

    harness.page.handleRoomStatusAction()
    if (harness.page._loadingPromise) {
      await harness.page._loadingPromise
    }

    assert.equal(harness.page.data.noRoom, false)
    assert.deepEqual(harness.page.data.periods, [{ _id: 'p1', startDate: '2026-06-01' }])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm1', date: '2026-06-03' }])
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
    assert.equal(harness.page.data.syncStatusText, '经期同步失败，已显示记忆数据')
    assert.deepEqual(harness.page.data.periods, [])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm1', date: '2026-06-03' }])
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
    assert.equal(harness.page.data.syncStatusText, '经期同步失败，已显示记忆数据')
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
    assert.deepEqual(harness.page.data.periods, [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm2', date: '2026-07-03', note: 'second' }])
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
    assert.deepEqual(harness.page.data.periods, [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-03', duration: 3 }])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm1', date: '2026-06-02', note: 'first' }])
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
    assert.equal(harness.page.data.syncStatusText, '记忆同步失败，已保留旧记忆数据')
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.deepEqual(harness.page.data.periods, [{ _id: 'p2', startDate: '2026-07-01', endDate: '2026-07-02', duration: 2 }])
    assert.deepEqual(harness.page.data.memories, [{ _id: 'm1', date: '2026-06-02', note: 'first' }])
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

    assert.deepEqual(harness.page.data.memories, [{ _id: 'm2', date: '2026-07-03', note: 'second' }])
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
      harness.page.data.periods.map(item => item._id),
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

test('period page onShow executes loadData and updates derived stats through the page harness', async () => {
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              await waitForTimerTick()
              return {
                kind: 'success',
                data: [
                  { _id: 'p1', startDate: '2026-06-01', duration: 4 },
                  { _id: 'p2', startDate: '2026-07-03', duration: 5 }
                ]
              }
            }
          }
        }
      },
      'utils/util.js': createUtilStub(),
      'utils/cycle.js': {
        decoratePeriod(period) {
          return { ...period, decorated: true }
        },
        predictNextPeriod() {
          return { canPredict: true, avgCycle: 29, avgDuration: 5 }
        }
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.deepEqual(harness.page.data.periods, [
      { _id: 'p2', startDate: '2026-07-03', duration: 5, decorated: true },
      { _id: 'p1', startDate: '2026-06-01', duration: 4, decorated: true }
    ])
    assert.equal(harness.page.data.avgCycle, 29)
    assert.equal(harness.page.data.avgDuration, 5)
  } finally {
    harness.teardown()
  }
})

test('period page fallback average ignores impossible dates', async () => {
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'p1', startDate: '2026-08-01', endDate: '2026-08-05', duration: 5 },
                  { _id: 'p2', startDate: '2026-08-32', endDate: '2026-09-02', duration: 9 },
                  { _id: 'p3', startDate: '2026-08-10', endDate: '2026-08-32', duration: 7 }
                ]
              }
            }
          }
        }
      },
      'utils/util.js': createUtilStub(),
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
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.avgCycle, null)
    assert.equal(harness.page.data.avgDuration, 5)
  } finally {
    harness.teardown()
  }
})

test('period list shows date-based duration and averages it when prediction is unavailable', async () => {
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'closed', startDate: '2026-06-01', endDate: '2026-06-05', duration: 99 },
                  { _id: 'open', startDate: '2026-08-12', duration: 9 }
                ]
              }
            }
          }
        }
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    // 缺结束日期的旧记录保守解释为结束日期不详：没有精确时长，行上用状态文案表达
    const listed = harness.page.data.periods.map(period => ({
      _id: period._id,
      duration: period.duration,
      status: period.status,
      durationText: period.durationText
    }))
    assert.deepEqual(listed, [
      { _id: 'open', duration: 0, status: 'unknown-end', durationText: '结束日期不详' },
      { _id: 'closed', duration: 5, status: 'known-end', durationText: '5天' }
    ])
    assert.equal(harness.page.data.avgCycle, null)
    // 只有已知结束记录进入平均时长
    assert.equal(harness.page.data.avgDuration, 5)
  } finally {
    harness.teardown()
  }
})

test('period list and predicted duration use inclusive date counts when stored duration conflicts', async () => {
  const harness = loadPageHarness('pages/period/period.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              return {
                kind: 'success',
                data: [
                  { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 2 },
                  { _id: 'p2', startDate: '2026-06-30', endDate: '2026-07-04', duration: 9 }
                ]
              }
            }
          }
        }
      }
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    const listed = harness.page.data.periods.map(period => ({
      _id: period._id,
      duration: period.duration
    }))
    assert.deepEqual(listed, [
      { _id: 'p2', duration: 5 },
      { _id: 'p1', duration: 5 }
    ])
    assert.equal(harness.page.data.avgCycle, 29)
    assert.equal(harness.page.data.avgDuration, 5)
  } finally {
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
        buildPeriodPayload() {
          payloadBuilds += 1
          return { startDate: '2026-02-31', endDate: '2026-03-02', duration: 1 }
        }
      },
      'utils/recordCommands.js': {
        async runRecordSave(options) {
          const message = options.validate()
          if (message) return { kind: 'validation', message }
          return options.action()
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

    assert.deepEqual(outcome, {
      kind: 'validation',
      message: '请选择有效日期'
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
    message: '请选择日期'
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
    message: '结束日期不能早于开始'
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
    mutationOutcome: { kind: 'success', result: { id: 'm9' } }
  })

  assert.deepEqual(result.outcome, {
    kind: 'validation',
    message: '请选择有效日期'
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

test('memory page onShow executes loadData and populates sorted memories through the page harness', async () => {
  const harness = loadPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
              await waitForTimerTick()
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
      },
      'utils/util.js': createUtilStub()
    }
  })

  try {
    await awaitPageOnShow(harness.page)

    assert.deepEqual(harness.page.data.memories, [
      { _id: 'm2', date: '2026-07-03', note: 'newer' },
      { _id: 'm1', date: '2026-06-01', note: 'older' }
    ])
  } finally {
    harness.teardown()
  }
})

test('period and memory pages keep a visible retry action when room repair sync fails during list load', async () => {
  await assertListPageRepairRetry('pages/period/period.js', {
    'utils/cloud.js': {
      createRoomDataClient() {
        return {
          async list() {
            return {
              kind: 'room-repair',
              roomCode: 'ROOM01',
              repair: {
                kind: 'retryable-failure',
                message: '同步房间状态失败：network down'
              }
            }
          }
        }
      }
    },
    'utils/util.js': createUtilStub(),
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
  })

  await assertListPageRepairRetry('pages/memory/memory.js', {
    'utils/cloud.js': {
      createRoomDataClient() {
        return {
          async list() {
            return {
              kind: 'room-repair',
              roomCode: 'ROOM01',
              repair: {
                kind: 'retryable-failure',
                message: '同步房间状态失败：network down'
              }
            }
          }
        }
      }
    },
    'utils/util.js': createUtilStub()
  })
})

test('settings page onShow uses verified room lookup, keeps retryable sync failures visible, and syncs repaired room codes on export', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
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

test('bind page onShow uses verified room lookup and clears stale bound state when verification says unbound', async () => {
  const harness = loadPageHarness('pages/bind/bind.js', {
    mocks: {
      'utils/room.js': {
        async getActiveRoom() {
          throw new Error('bind onShow should use getVerifiedActiveRoom')
        },
        async getVerifiedActiveRoom() {
          return {
            kind: 'no-room',
            bound: false,
            roomCode: ''
          }
        }
      }
    }
  })

  try {
    harness.page.data.bound = true
    harness.page.data.roomCode = 'ROOM01'
    harness.page.data.errorMsg = '旧错误'

    await awaitPageOnShow(harness.page)

    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.errorMsg, '')
  } finally {
    harness.teardown()
  }
})

test('settings page exportData keeps repair retryable failures visible instead of relabeling as unbound', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
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
        buildPeriodPayload() {
          payloadBuilds += 1
          return { startDate: '2026-03-03', endDate: '2026-03-03', duration: 1 }
        }
      },
      'utils/recordCommands.js': {
        async runRecordSave(options) {
          const message = options.validate()
          if (message) return { kind: 'validation', message }
          return options.action()
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

async function runMemoryEditSaveCase({ routeState, mutationOutcome }) {
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
      'utils/recordCommands.js': createRecordSaveCommandStub(),
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

async function assertListPageRepairRetry(relativePath, mocks) {
  const modals = []
  const harness = loadPageHarness(relativePath, {
    mocks,
    wxOverrides: {
      showModal(options) {
        modals.push(options)
      }
    }
  })

  try {
    const promise = startPageOnShow(harness.page)
    await Promise.resolve()

    assert.equal(modals.length, 1)
    assert.equal(modals[0].title, '加载失败')
    assert.equal(modals[0].content, '同步房间状态失败：network down')
    assert.equal(modals[0].confirmText, '重试')
    assert.equal(modals[0].cancelText, '取消')

    await modals[0].success({ confirm: false, cancel: true })
    await promise

    assert.equal(harness.page.data.loading, false)
  } finally {
    harness.teardown()
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
    }
  }
}

function stubGetPeriodDuration(period) {
  const util = createUtilStub()
  const range = util.normalizeDateRange(period)
  if (!range) return 0
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
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
