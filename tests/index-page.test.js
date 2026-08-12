const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

test('initial load publishes home records and clears loading state', async () => {
  const client = createQueuedClient([
    { kind: 'success', data: [period('p1', '2026-06-01')] },
    { kind: 'success', data: [memory('m1', '2026-06-02')] }
  ])
  const harness = loadPageHarness({ client })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    await Promise.resolve()

    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.deepEqual(harness.page.data.periods, [period('p1', '2026-06-01')])
    assert.deepEqual(harness.page.data.memories, [memory('m1', '2026-06-02')])
  } finally {
    harness.teardown()
  }
})

test('unchanged background refresh preserves records and revisions', async () => {
  const initialPeriods = [period('p1', '2026-06-01')]
  const initialMemories = [memory('m1', '2026-06-02')]
  const client = createQueuedClient([
    { kind: 'success', data: initialPeriods },
    { kind: 'success', data: initialMemories },
    { kind: 'success', data: initialPeriods.map(item => ({ ...item })) },
    { kind: 'success', data: initialMemories.map(item => ({ ...item })) }
  ])
  const harness = loadPageHarness({ client })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    await Promise.resolve()
    const revisionsBefore = { ...harness.page._syncState.revisions }
    await harness.page.onShow()

    assert.deepEqual(harness.page.data.periods, initialPeriods)
    assert.deepEqual(harness.page.data.memories, initialMemories)
    assert.deepEqual(harness.page._syncState.revisions, revisionsBefore)
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.refreshing, false)
  } finally {
    harness.teardown()
  }
})

test('background refresh adds remote records while retaining local revision tracking', async () => {
  const initialPeriod = period('p1', '2026-06-01')
  const initialMemory = memory('m1', '2026-06-02')
  const remotePeriod = period('p2', '2026-06-29')
  const remoteMemory = memory('m2', '2026-07-03')
  const client = createQueuedClient([
    { kind: 'success', data: [initialPeriod] },
    { kind: 'success', data: [initialMemory] },
    { kind: 'success', data: [remotePeriod, initialPeriod] },
    { kind: 'success', data: [initialMemory, remoteMemory] }
  ])
  const harness = loadPageHarness({ client })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    await harness.page.onShow()

    assert.deepEqual(harness.page.data.periods, [remotePeriod, initialPeriod])
    assert.deepEqual(harness.page.data.memories, [initialMemory, remoteMemory])
    assert.deepEqual(harness.page._syncState.revisions, { periods: 0, memories: 0 })
    assert.deepEqual(harness.page._syncState.pendingRevisions, { periods: null, memories: null })
  } finally {
    harness.teardown()
  }
})

test('stale snapshot is rejected after a local record revision', async () => {
  const initialPeriod = period('p1', '2026-06-01')
  const savedPeriod = period('p2', '2026-06-29')
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [initialPeriod] },
      { kind: 'success', data: [] }
    ])
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    const requestId = harness.page._startLoad(true)
    harness.page.applyRecordChange({ collection: 'periods', mode: 'add', record: savedPeriod })
    harness.page._resolveLoad(requestId, successSnapshot([initialPeriod], []), true)

    assert.deepEqual(harness.page.data.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page._syncState.pendingRevisions.periods, 1)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
  } finally {
    harness.teardown()
  }
})

test('pending revision prevents a background snapshot from rolling back a saved record', async () => {
  const initialPeriod = period('p1', '2026-06-01')
  const savedPeriod = period('p2', '2026-06-29')
  const deferred = deferredValue()
  const client = {
    list(collection) {
      if (collection === 'periods') return deferred.promise
      return Promise.resolve({ kind: 'success', data: [] })
    }
  }
  const harness = loadPageHarness({
    client: {
      list(collection) {
        if (collection === 'periods') {
          if (!this.loaded) {
            this.loaded = true
            return Promise.resolve({ kind: 'success', data: [initialPeriod] })
          }
          return deferred.promise
        }
        if (!this.memoryLoaded) {
          this.memoryLoaded = true
          return Promise.resolve({ kind: 'success', data: [] })
        }
        return Promise.resolve({ kind: 'success', data: [] })
      }
    }
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    const refresh = harness.page.onShow()
    await Promise.resolve()
    harness.page.applyRecordChange({ collection: 'periods', mode: 'add', record: savedPeriod })
    deferred.resolve({ kind: 'success', data: [initialPeriod] })
    await refresh

    assert.deepEqual(harness.page.data.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page._syncState.pendingRevisions.periods, 1)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
  } finally {
    deferred.resolve({ kind: 'success', data: [initialPeriod] })
    harness.teardown()
  }
})

test('load failure preserves existing records and returns retryable outcome', async () => {
  const initialPeriod = period('p1', '2026-06-01')
  let call = 0
  const harness = loadPageHarness({
    client: {
      async list(collection) {
        call += 1
        if (call <= 2) return { kind: 'success', data: collection === 'periods' ? [initialPeriod] : [] }
        throw new Error('network down')
      }
    }
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    const outcome = await harness.page.onShow()

    assert.equal(outcome.kind, 'retryable-failure')
    assert.deepEqual(harness.page.data.periods, [initialPeriod])
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
  } finally {
    harness.teardown()
  }
})

test('concurrent loadData calls reuse the latest in-flight request', async () => {
  const deferred = deferredValue()
  let calls = 0
  const harness = loadPageHarness({
    client: {
      list() {
        calls += 1
        return deferred.promise
      }
    }
  })

  try {
    harness.page.onLoad()
    const first = harness.page.loadData({ background: false })
    const second = harness.page.loadData({ background: false })
    assert.strictEqual(second, first)
    assert.equal(calls, 2)

    deferred.resolve({ kind: 'success', data: [] })
    await first
    assert.equal(harness.page.data.hasLoadedHomeData, true)
  } finally {
    deferred.resolve({ kind: 'success', data: [] })
    harness.teardown()
  }
})

test('stale request resolution cannot overwrite the newer request result', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })

  try {
    harness.page.onLoad()
    const firstRequest = harness.page._startLoad(false)
    const secondRequest = harness.page._startLoad(false)
    harness.page._resolveLoad(firstRequest, successSnapshot([period('old', '2026-01-01')], []), false)
    assert.deepEqual(harness.page.data.periods, [])

    harness.page._resolveLoad(secondRequest, successSnapshot([period('new', '2026-02-01')], []), false)
    assert.deepEqual(harness.page.data.periods.map(item => item._id), ['new'])
    assert.equal(harness.page.data.hasLoadedHomeData, true)
  } finally {
    harness.teardown()
  }
})

function loadPageHarness({ client }) {
  const absolutePagePath = path.join(repoRoot, 'pages/index/index.js')
  const absoluteMocks = new Map([
    [path.join(repoRoot, 'utils/cloud.js'), { createRoomDataClient: () => client }],
    [path.join(repoRoot, 'utils/util.js'), createUtilStub()],
    [path.join(repoRoot, 'utils/homeCalendarState.js'), { buildHomeCalendarState }]
  ])
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = {
    getStorageSync: () => '',
    setStorageSync() {},
    redirectTo() {},
    navigateTo() {}
  }
  global.Page = config => { registered = config }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (absoluteMocks.has(resolved)) return absoluteMocks.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  require(absolutePagePath)
  Module._load = originalLoad

  const page = {
    data: { ...(registered.data || {}) },
    setData(update, callback) {
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }
  for (const [key, value] of Object.entries(registered)) {
    if (key !== 'data') page[key] = typeof value === 'function' ? value.bind(page) : value
  }
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

function createQueuedClient(outcomes) {
  return {
    async list() {
      const outcome = outcomes.shift()
      if (!outcome) throw new Error('unexpected list call')
      return outcome
    }
  }
}

function successSnapshot(periods, memories) {
  return {
    kind: 'success',
    periodsOutcome: { kind: 'success', data: periods },
    memoriesOutcome: { kind: 'success', data: memories },
    periods,
    memories
  }
}

function period(id, startDate) {
  return { _id: id, startDate, endDate: startDate, duration: 1 }
}

function memory(id, date) {
  return { _id: id, date, note: '' }
}

function deferredValue() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createUtilStub() {
  return {
    formatDate(value) {
      return typeof value === 'string' ? value : '2026-06-26'
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
