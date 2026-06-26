const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

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
      'utils/calendarInsights.js': { CALENDAR_LEGEND_ITEMS: [] },
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await harness.page.onShow()

    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.roomStatusTitle, '还没绑定房间')
    assert.equal(harness.page.data.roomStatusAction, 'bind')
    assert.deepEqual(calls, ['periods'])
  } finally {
    harness.teardown()
  }
})

test('index page exposes retry state and can reload after retryable RoomDataClient failures', async () => {
  const outcomes = [
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
      'utils/calendarInsights.js': { CALENDAR_LEGEND_ITEMS: [] },
      'utils/homeCalendarState.js': { buildHomeCalendarState }
    }
  })

  try {
    await harness.page.onShow()

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
    assert.deepEqual(calls, ['periods', 'periods', 'memories'])
  } finally {
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
    await harness.page.onShow()

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

test('memory page onShow executes loadData and populates sorted memories through the page harness', async () => {
  const harness = loadPageHarness('pages/memory/memory.js', {
    mocks: {
      'utils/cloud.js': {
        createRoomDataClient() {
          return {
            async list() {
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
    await harness.page.onShow()

    assert.deepEqual(harness.page.data.memories, [
      { _id: 'm2', date: '2026-07-03', note: 'newer' },
      { _id: 'm1', date: '2026-06-01', note: 'older' }
    ])
  } finally {
    harness.teardown()
  }
})

test('settings page keeps retryable room sync failures visible and syncs repaired room codes on export', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
        async getActiveRoom() {
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
    await harness.page.onShow()
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

test('settings page exportData keeps repair retryable failures visible instead of relabeling as unbound', async () => {
  let exportCalls = 0
  const harness = loadPageHarness('pages/settings/settings.js', {
    mocks: {
      'utils/cloud.js': {},
      'utils/room.js': {
        async getActiveRoom() {
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
    await harness.page.onShow()
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
