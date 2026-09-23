const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

function readIndexWxml() {
  return fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxml'), 'utf8')
}

function readIndexWxss() {
  return fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxss'), 'utf8')
}

function ruleBody(wxss, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = wxss.match(new RegExp(`(?:^|[\\n}])\\s*${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

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
    switchTab() {},
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

test('homepage places quick record actions after the calendar grid and before the stats card', () => {
  const wxml = readIndexWxml()
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const statsIndex = wxml.indexOf('class="stats-card')

  assert.ok(gridIndex !== -1, 'expected the calendar grid')
  assert.ok(quickIndex !== -1, 'expected quick record actions')
  assert.ok(statsIndex !== -1, 'expected the stats card')
  assert.ok(gridIndex < quickIndex, 'record actions should directly follow the calendar grid')
  assert.ok(quickIndex < statsIndex, 'record actions should precede the stats card')
})

test('homepage offers secondary entries into the period and memory record lists', () => {
  const wxml = readIndexWxml()
  assert.match(wxml, /class="record-entries"/)
  assert.match(wxml, /bindtap="goPeriodList"[\s\S]*?经期记录/)
  assert.match(wxml, /bindtap="goMemoryList"[\s\S]*?欢乐时光/)

  const navigation = []
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    global.wx.switchTab = options => navigation.push({ type: 'switchTab', url: options.url })
    global.wx.navigateTo = options => navigation.push({ type: 'navigateTo', url: options.url })

    harness.page.goPeriodList()
    harness.page.goMemoryList()
  } finally {
    harness.teardown()
  }

  assert.deepEqual(navigation, [
    { type: 'switchTab', url: '/pages/period/period' },
    { type: 'navigateTo', url: '/pages/memory/memory' }
  ])
})

test('homepage shows a first-record guide instead of silent zero stats when the room has no records', () => {
  const wxml = readIndexWxml()

  assert.match(wxml, /wx:if="{{periods\.length \|\| memories\.length}}" class="stats-card/)
  assert.match(wxml, /wx:else class="empty-guide"/)
  assert.match(wxml, /点日历任意一天开始记录/)
})

test('homepage stats card leaves prediction range, confidence, and average cycle to the prediction sheet', () => {
  const wxml = readIndexWxml()
  const statsStart = wxml.indexOf('class="stats-card')
  const statsEnd = wxml.indexOf('class="reminder-stack"')
  assert.ok(statsStart !== -1 && statsEnd > statsStart, 'expected a stats card before the reminder stack')
  const statsBlock = wxml.slice(statsStart, statsEnd)

  assert.doesNotMatch(statsBlock, /avgCycle|predictionRangeDisplay|predictConfidence/)
  assert.match(statsBlock, /nextPredictDisplay/)
  assert.match(wxml, /predictionExplanation\.summary/)
  assert.match(wxml, /predictionExplanation\.lineItems/)
})

test('homepage stacks month navigation, calendar, and record actions ahead of secondary tools', () => {
  const wxml = readIndexWxml()
  const monthNavIndex = wxml.indexOf('class="month-nav"')
  const weekHeaderIndex = wxml.indexOf('class="week-header"')
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const toolbarIndex = wxml.indexOf('class="meaning-toolbar"')

  assert.ok(monthNavIndex !== -1 && weekHeaderIndex !== -1 && gridIndex !== -1, 'expected month nav, week header, and calendar grid')
  assert.ok(quickIndex !== -1 && toolbarIndex !== -1, 'expected quick actions and the meaning toolbar')
  assert.ok(monthNavIndex < weekHeaderIndex, 'month navigation leads the calendar')
  assert.ok(weekHeaderIndex < gridIndex, 'week header sits directly above the calendar grid')
  assert.ok(gridIndex < quickIndex, 'record actions directly follow the calendar grid')
  assert.ok(quickIndex < toolbarIndex, 'legend/prediction/recap tools stay secondary to the record actions')
})

test('quick record buttons are rose-filled primary actions with canvas-navy labels', () => {
  const wxss = readIndexWxss()
  const block = ruleBody(wxss, '.quick-btn')

  // issue #55：主操作统一实色玫瑰填充 + 画布海军字，玫瑰→金渐变只属误用已收敛
  assert.match(block, /background:\s*var\(--aurora-pink\)/i)
  assert.doesNotMatch(block, /linear-gradient|gradient-gold/i)
  assert.match(block, /color:\s*#0A0E27/i)
  assert.match(ruleBody(wxss, '.quick-text'), /color:\s*#0A0E27/i)
})

test('compact density keeps the record actions inside the 1334rpx first-screen budget', () => {
  const wxss = readIndexWxss()
  // issue #37 验收口径：750rpx 宽 × 667px 高视口 ≈ 1334rpx；状态栏与自定义导航栏为固定值。
  // issue #55 起图例/预测/小结工具行与密度偏好退出首屏路径（密度迁入设置页），
  // 栈深只剩 月份导航 → 日历 → 记录入口。
  const SAFE_TOP_RPX = 88
  const NAV_BAR_RPX = 88
  const MONTH_NAV_CONTENT_RPX = 88
  const WEEK_TEXT_RPX = 34
  const QUICK_CONTENT_RPX = 40
  const SIX_ROWS = 6

  const monthNavBody = ruleBody(wxss, '.month-nav')
  const monthNav = MONTH_NAV_CONTENT_RPX +
    shorthandVertical(monthNavBody, 'padding') +
    shorthandVertical(monthNavBody, 'margin')
  const weekHeader = shorthandVertical(ruleBody(wxss, '.week-header'), 'padding') + WEEK_TEXT_RPX
  const gridPadding = shorthandVertical(ruleBody(wxss, '.calendar-grid'), 'padding')
  const compactCell = numberDecl(ruleBody(wxss, '.calendar-density-compact .day-cell'), 'height')
  const quickActions = numberDecl(ruleBody(wxss, '.quick-actions'), 'margin-top') +
    shorthandVertical(ruleBody(wxss, '.quick-btn'), 'padding') +
    QUICK_CONTENT_RPX

  const stack = SAFE_TOP_RPX + NAV_BAR_RPX + monthNav +
    weekHeader + gridPadding + SIX_ROWS * compactCell + quickActions

  assert.ok(
    stack <= 1334,
    `compact first-screen stack ${stack}rpx exceeds the 1334rpx (667px) budget`
  )
})

test('homepage re-reads the persisted calendar density every time it shows', async () => {
  let storedDensity = 'full'
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [] },
      { kind: 'success', data: [] }
    ])
  })

  try {
    global.wx.getStorageSync = key => (key === 'calendarDensity' ? storedDensity : '')
    harness.page.onLoad()
    assert.equal(harness.page.data.calendarDensity, 'full')

    // 密度切换在设置页完成；从设置 tab 返回首页时 onShow 重新读取偏好
    storedDensity = 'compact'
    await harness.page.onShow()
    assert.equal(harness.page.data.calendarDensity, 'compact')
  } finally {
    harness.teardown()
  }
})

test('day detail keeps the full leap-month lunar string in the sheet subtitle', () => {
  const wxml = readIndexWxml()
  const subtitleAt = wxml.indexOf('selectedDateSubtitle')
  const actionsAt = wxml.indexOf("daySheetMode == 'actions'")
  const detailAt = wxml.indexOf("daySheetMode == 'detail'")
  assert.ok(subtitleAt !== -1 && subtitleAt < actionsAt && subtitleAt < detailAt,
    'day detail must show the shared subtitle, not only the action list')

  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.setData({
      days: [{
        date: '2020-05-23',
        weekday: '周六',
        lunarText: '闰四月初一',
        isEmpty: false
      }],
      dayDetailsByDate: {
        '2020-05-23': { meanings: [], periods: [], memories: [], empty: true }
      }
    })
    harness.page.showDayDetail('2020-05-23')
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.selectedDateSubtitle, '周六 · 闰四月初一')
  } finally {
    harness.teardown()
  }
})

function numberDecl(body, property) {
  const match = body.match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)rpx`))
  return match ? Number(match[1]) : 0
}

test('month jump sheet steps the year one at a time from the viewed month', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })

    harness.page.openMonthPicker()
    assert.equal(harness.page.data.jumpYear, 2020)
    assert.equal(harness.page.data.jumpMonth, 5)

    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    assert.equal(harness.page.data.jumpYear, 2021)
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '-1' } } })
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '-1' } } })
    assert.equal(harness.page.data.jumpYear, 2019)
  } finally {
    harness.teardown()
  }
})

test('year stepper clamps at the past and future bounds with disabled state', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    assert.equal(harness.page.data.jumpYearAtMin, false)
    assert.equal(harness.page.data.jumpYearAtMax, false)

    // 过去边界对齐节假日官方数据起点 2001（PUBLISHED_HOLIDAY_START_YEAR）
    harness.page.setData({ year: 2001, month: 0 })
    harness.page.openMonthPicker()
    assert.equal(harness.page.data.jumpYear, 2001)
    assert.equal(harness.page.data.jumpYearAtMin, true)
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '-1' } } })
    assert.equal(harness.page.data.jumpYear, 2001)
    assert.equal(harness.page.data.jumpYearAtMin, true)

    // 未来边界 2035：覆盖约十年的预测与计划查看
    harness.page.setData({ year: 2035, month: 0 })
    harness.page.openMonthPicker()
    assert.equal(harness.page.data.jumpYear, 2035)
    assert.equal(harness.page.data.jumpYearAtMax, true)
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    assert.equal(harness.page.data.jumpYear, 2035)
    assert.equal(harness.page.data.jumpYearAtMax, true)
  } finally {
    harness.teardown()
  }
})

test('month navigation clamps at the jump year bounds so the picker stays in sync', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()

    // 未来边界：2035 年 12 月之后不回绕、不越界
    harness.page.setData({ year: 2035, month: 10 })
    harness.page.nextMonth()
    assert.equal(harness.page.data.year, 2035)
    assert.equal(harness.page.data.month, 11)
    harness.page.nextMonth()
    assert.equal(harness.page.data.year, 2035)
    assert.equal(harness.page.data.month, 11)

    // 过去边界：2001 年 1 月之前不回绕、不越界
    harness.page.setData({ year: 2001, month: 1 })
    harness.page.prevMonth()
    assert.equal(harness.page.data.year, 2001)
    assert.equal(harness.page.data.month, 0)
    harness.page.prevMonth()
    assert.equal(harness.page.data.year, 2001)
    assert.equal(harness.page.data.month, 0)

    // 边界内翻月不受影响，picker 年份始终等于查看年份
    harness.page.setData({ year: 2020, month: 11 })
    harness.page.nextMonth()
    assert.equal(harness.page.data.year, 2021)
    assert.equal(harness.page.data.month, 0)
    harness.page.openMonthPicker()
    assert.equal(harness.page.data.jumpYear, harness.page.data.year)
  } finally {
    harness.teardown()
  }
})

test('month selection, confirm jump, and back-to-today keep their behavior', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '11' } } })
    assert.equal(harness.page.data.jumpMonth, 11)

    harness.page.confirmMonthJump()
    assert.equal(harness.page.data.year, 2021)
    assert.equal(harness.page.data.month, 11)
    assert.equal(harness.page.data.monthPickerVisible, false)

    harness.page.openMonthPicker()
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    harness.page.jumpToToday()
    const today = new Date()
    assert.equal(harness.page.data.year, today.getFullYear())
    assert.equal(harness.page.data.month, today.getMonth())
    assert.equal(harness.page.data.monthPickerVisible, false)
  } finally {
    harness.teardown()
  }
})

test('month jump sheet uses a bounded year stepper instead of a year grid', () => {
  const js = fs.readFileSync(path.join(repoRoot, 'pages/index/index.js'), 'utf8')
  const wxml = readIndexWxml()
  const wxss = readIndexWxss()

  // 年份只剩「‹ 年份 ›」步进器两个可点项，不再有年份网格与翻页按钮
  assert.match(wxml, /class="jump-year-stepper"/)
  assert.match(wxml, /aria-label="上一年"/)
  assert.match(wxml, /aria-label="下一年"/)
  assert.match(wxml, /bindtap="shiftJumpYear"/)
  assert.doesNotMatch(wxml, /jump-year-grid|year-option|jump-nav-btn/)
  assert.doesNotMatch(wxml, /shiftJumpYears|selectJumpYear/)

  // 月份保持 12 宫格，「回到今天」保留
  assert.match(wxml, /class="jump-month-grid"/)
  assert.match(wxml, /wx:for="{{jumpMonths}}"/)
  assert.match(wxml, /bindtap="selectJumpMonth"/)
  assert.match(wxml, /bindtap="jumpToToday"/)

  assert.match(js, /shiftJumpYear\(e\)\s*{[\s\S]*dataset\.delta/)
  assert.doesNotMatch(js, /buildMonthJumpYears|shiftJumpYears|selectJumpYear|jumpYears/)

  // 步进按钮保持 88rpx 触控目标
  assert.match(ruleBody(wxss, '.jump-year-step'), /min-height:\s*88rpx/)
  assert.match(ruleBody(wxss, '.jump-year-step.disabled'), /opacity/)
})

function shorthandVertical(body, property) {
  const match = body.match(new RegExp(`(?:^|[\\n;])\\s*${property}:\\s*([^;]+);`))
  if (!match) return 0
  const parts = match[1].trim().split(/\s+/).map(token => {
    const value = token.match(/^(\d+(?:\.\d+)?)rpx$/)
    return value ? Number(value[1]) : 0
  })
  if (parts.length <= 2) return parts[0] * 2
  return parts[0] + parts[2]
}
