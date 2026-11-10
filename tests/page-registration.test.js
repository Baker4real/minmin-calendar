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

// 首页加载与同步行为统一由 home-sync.test.js 经共享平台 harness 覆盖（#171）。

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

test('settings verifies cached room codes, exposes sync failure, and displays the repaired room after export', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reject(new Error('网络不太稳定，请重试'))
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, '同步失败，请重试')
  assert.equal(page.data.roomCode, '')
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 1)
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM02' } })
  app.cloud.when({ name: 'dataOp', data: { collection: 'periods', roomCode: 'ROOM01' } })
    .reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
  app.cloud.when({ name: 'dataOp', data: { collection: 'memories', roomCode: 'ROOM01' } }).reply({ code: 0, data: [] })
  app.respondNext('showModal', { confirm: true })
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.equal(app.wx.modals.at(-1).content, '房间状态已更新，请重试导出')
  app.respond('showModal', 1, { confirm: false })
  await app.settle()
  await exporting
  assert.equal(page.data.roomCode, 'ROOM02')
  assert.equal(page.data.roomCodeDisplay, 'ROOM02')
  assert.equal(app.storage.roomCode, 'ROOM02')
  assert.deepEqual(app.files, [])
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

test('settings export keeps the visible room when repair has a retryable failure', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, 'ROOM01')
  app.cloud.when('getMyRoom').reject(new Error('网络不太稳定，请重试'))
  app.cloud.when({ name: 'dataOp', data: { collection: 'periods' } })
    .reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
  app.cloud.when({ name: 'dataOp', data: { collection: 'memories' } }).reply({ code: 0, data: [] })
  app.respondNext('showModal', { confirm: true })
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.equal(app.wx.modals.at(-1).content, '网络不太稳定，请重试')
  app.respond('showModal', 1, { confirm: false })
  await app.settle()
  await exporting
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.roomCodeDisplay, 'ROOM01')
  assert.equal(app.storage.roomCode, 'ROOM01')
  assert.deepEqual(app.files, [])
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

// issue #163：页面不可见（切走 tab、被编辑页盖住、小程序进后台）时根节点带 page-hidden，常驻装饰暂停在当前帧；
// 再次显示时第一件事就是去掉标记，不等云端加载结果。兼容路由 pages/memory/memory 会被自己的 switchTab 关掉，不在此列。
const PAGE_HIDDEN_PAGES = [
  'pages/index/index.js',
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

test('settings pauses decorations while hidden and resumes before room verification settles', async (t) => {
  const app = createMiniProgram()
  t.after(() => app.teardown())
  const verification = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.ok(!page.data.pageHidden)
  assert.equal(page.data.roomCodeLoaded, false)
  app.hide()
  app.hide()
  assert.equal(page.data.pageHidden, true)
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.show()
  assert.equal(page.data.pageHidden, false)
  assert.equal(page.data.roomCodeLoaded, false)
  app.show()
  assert.equal(page.data.pageHidden, false)
  verification.resolve({ code: 0, room: null })
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, '未绑定')
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
