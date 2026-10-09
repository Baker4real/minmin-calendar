const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { mock, test } = require('node:test')

const repoRoot = path.join(__dirname, '..')

function readIndexWxml() {
  return fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxml'), 'utf8')
}

function readIndexWxss() {
  return fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxss'), 'utf8')
}

// issue #105：合并状态卡的源码切片（卡起点 → 紧随其后的空态引导 wx:else 起点）
function sliceStatusCard(wxml) {
  const cardStart = wxml.indexOf('class="status-card')
  const cardEnd = wxml.indexOf('wx:else class="empty-guide"')
  assert.ok(cardStart !== -1, 'expected the merged status card')
  assert.ok(cardEnd > cardStart, 'expected the empty guide to take the card slot when there are no records')
  return wxml.slice(cardStart, cardEnd)
}

function ruleBody(wxss, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = wxss.match(new RegExp(`(?:^|[\\n}])\\s*${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

// WXML {{ }} 内是 JS 表达式；用真实数据形状直接算出读屏最终整句
function evaluateWxmlExpression(expr, scope) {
  const keys = Object.keys(scope)
  return new Function(...keys, `return (${expr})`)(...keys.map(key => scope[key]))
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

test('a merged save syncs back as an update to the existing ongoing record without duplicating it', async () => {
  const completed = period('p1', '2026-05-01')
  const ongoing = { _id: 'p2', startDate: '2026-06-18', endDate: '', status: 'ongoing', note: '已经记录过的经期' }
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [ongoing, completed] },
      { kind: 'success', data: [] }
    ])
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()

    // 保存被合并后编辑页回流 update 语义：同一条 _id 原地更新，列表仍只有一条进行中
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'update',
      record: { ...ongoing }
    })

    assert.deepEqual(harness.page.data.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page.data.periods.filter(item => item.status === 'ongoing').length, 1)
    assert.equal(harness.page.data.periods[0].note, '已经记录过的经期')
  } finally {
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

// issue #79：首页已加载后再刷新失败——留驻可点的重试句，重试成功或后一次成功刷新后消失
test('background refresh failure keeps a tappable retry sentence until a later refresh succeeds', async () => {
  const initialPeriod = period('p1', '2026-06-01')
  const failure = { kind: 'retryable-failure', message: 'network down' }
  let call = 0
  const harness = loadPageHarness({
    client: {
      async list(collection) {
        call += 1
        if (call <= 2) return { kind: 'success', data: collection === 'periods' ? [initialPeriod] : [] }
        if (call <= 6) return failure
        return {
          kind: 'success',
          data: collection === 'periods' ? [initialPeriod, period('p2', '2026-06-29')] : []
        }
      }
    }
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.refreshRetryVisible, false)

    // 已加载后的后台刷新失败：重试句出现，日历数据保留
    await harness.page.onShow()
    assert.equal(harness.page.data.refreshRetryVisible, true)
    assert.deepEqual(harness.page.data.periods, [initialPeriod])
    // 失败反馈不挂在自动消失的同步 pill 上：pill 已隐藏，失败界面只剩常驻重试句
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.refreshing, false)

    // 点重试仍失败：句子留驻，不换回整页失败画面
    await harness.page.retryRefresh()
    assert.equal(harness.page.data.refreshRetryVisible, true)
    assert.equal(harness.page.data.noRoom, false)
    assert.deepEqual(harness.page.data.periods, [initialPeriod])

    // 后一次刷新成功：失败提示消失，数据被成功结果替换
    await harness.page.onShow()
    assert.equal(harness.page.data.refreshRetryVisible, false)
    assert.deepEqual(harness.page.data.periods.map(item => item._id), ['p1', 'p2'])
  } finally {
    harness.teardown()
  }
})

// issue #79：第一次打开就加载失败——仍是失败标题 + 重试按钮，但不进入未绑定的爱心画面
test('first-load failure keeps the failure title and retry action without the unbound art', async () => {
  const harness = loadPageHarness({
    client: {
      async list() {
        return { kind: 'retryable-failure', message: 'network down' }
      }
    }
  })

  try {
    harness.page.onLoad()
    const outcome = await harness.page.onShow()

    assert.equal(outcome.kind, 'retryable-failure')
    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.roomStatusTitle, '日历加载失败')
    assert.equal(harness.page.data.roomStatusActionText, '重试')
    assert.equal(harness.page.data.roomStatusAction, 'retry')
    assert.equal(harness.page.data.hasLoadedHomeData, false)
    assert.equal(harness.page.data.refreshRetryVisible, false)
  } finally {
    harness.teardown()
  }
})

// issue #79：重试句是正常文档流里的可点行，放在月份导航与周头之间，不遮月份标题
test('the refresh retry sentence is a tappable in-flow row below the month title', () => {
  const wxml = readIndexWxml()
  const contentIndex = wxml.indexOf('wx:else class="content')
  const monthNavIndex = wxml.indexOf('class="month-nav"')
  const retryIndex = wxml.indexOf('class="refresh-retry"')
  const weekHeaderIndex = wxml.indexOf('class="week-header"')

  assert.ok(retryIndex !== -1, 'expected the refresh retry sentence')
  assert.ok(contentIndex !== -1 && contentIndex < retryIndex, 'retry sentence lives inside the loaded content block')
  assert.ok(monthNavIndex !== -1 && monthNavIndex < retryIndex, 'retry sentence sits below the month navigation')
  assert.ok(retryIndex < weekHeaderIndex, 'retry sentence sits above the calendar week header')

  const retryTagStart = wxml.lastIndexOf('<view', retryIndex)
  const retryBlock = wxml.slice(retryTagStart, wxml.indexOf('</view>', retryIndex) + '</view>'.length)
  assert.match(retryBlock, /wx:if="\{\{refreshRetryVisible\}\}"/)
  assert.match(retryBlock, /bindtap="retryRefresh"/)
  assert.match(retryBlock, /aria-role="button"/)
  assert.match(retryBlock, /aria-label="日历刷新失败，点按重试"/)
  assert.match(retryBlock, /刷新失败，点按重试/)

  const wxss = readIndexWxss()
  const row = ruleBody(wxss, '.refresh-retry')
  assert.doesNotMatch(row, /position:\s*(fixed|absolute)/, 'the retry row must stay in the document flow')
  assert.match(ruleBody(wxss, '.refresh-retry-text'), /color:\s*#E8909E/i)
})

// issue #79：爱心画面只属于未绑定/需要重新绑定；加载失败不再复用这颗心
test('the unbound heart art is reserved for bind states, not load failures', () => {
  const wxml = readIndexWxml()
  const iconIndex = wxml.indexOf('class="no-room-icon"')
  assert.ok(iconIndex !== -1, 'expected the unbound heart icon')

  assert.match(
    wxml,
    /wx:if="\{\{roomStatusAction == 'bind'\}\}"[^>]*class="no-room-icon"/,
    'the heart must be gated to bind (unbound / rebind) states only'
  )

  // 失败标题与重试按钮保持整页失败画面的原位
  assert.match(wxml, /class="no-room-title">\{\{roomStatusTitle\}\}/)
  assert.match(wxml, /bindtap="handleRoomStatusAction"[^>]*aria-label="\{\{roomStatusActionText\}\}"/)
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

function loadPageHarness({ client, calendarState } = {}) {
  const absolutePagePath = path.join(repoRoot, 'pages/index/index.js')
  const absoluteMocks = new Map([
    [path.join(repoRoot, 'utils/cloud.js'), { createRoomDataClient: () => client }],
    [path.join(repoRoot, 'utils/util.js'), createUtilStub()]
  ])
  if (calendarState !== 'real') {
    absoluteMocks.set(path.join(repoRoot, 'utils/homeCalendarState.js'), { buildHomeCalendarState })
  }
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
    navigateTo() {},
    nextTick(callback) {
      setTimeout(callback, 0)
    }
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
  // 只固定「今天」，其余日期能力委托真实模块：真实 cycle 经由页面依赖链拿到完整接缝
  const realUtil = require(path.join(repoRoot, 'utils/util.js'))
  return {
    ...realUtil,
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

test('homepage places quick record actions after the calendar grid and before the merged status card', () => {
  const wxml = readIndexWxml()
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const statusIndex = wxml.indexOf('class="status-card')

  assert.ok(gridIndex !== -1, 'expected the calendar grid')
  assert.ok(quickIndex !== -1, 'expected quick record actions')
  assert.ok(statusIndex !== -1, 'expected the merged status card')
  assert.ok(gridIndex < quickIndex, 'record actions should directly follow the calendar grid')
  assert.ok(quickIndex < statusIndex, 'record actions should precede the merged status card')
})

test('homepage shows a first-record guide instead of the status card when the room has no records', () => {
  const wxml = readIndexWxml()

  assert.match(wxml, /wx:if="{{periods\.length \|\| memories\.length}}" class="status-card/)
  assert.match(wxml, /wx:else class="empty-guide"/)
  assert.match(wxml, /点日历任意一天开始记录/)
})

// issue #105：空态引导文字对比度不低于 --text-secondary 档（基准 = 未选中 tab 在画布上的 4.5:1），
// 在合成面（画布海军 + 引导卡 6% 白底）上验收，不是只看 alpha 值
test('empty-state guide text meets the secondary-text contrast floor on its composed surface', () => {
  const { contrastRatio } = require('./contrast')
  const appWxss = fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8')
  const wxss = readIndexWxss()

  const canvasMatch = /page\s*\{[^}]*?background:\s*(#[0-9a-f]{6})/i.exec(appWxss)
  assert.ok(canvasMatch, 'expected the app canvas background')
  const guideBg = /background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/.exec(ruleBody(wxss, '.empty-guide'))
  assert.ok(guideBg, 'expected the empty guide surface')
  const guideText = /color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/.exec(ruleBody(wxss, '.empty-guide-text'))
  assert.ok(guideText, 'expected the empty guide text color')

  const compositeWhiteOver = (alpha, bgHex) => {
    const channels = [1, 3, 5].map(i => parseInt(bgHex.slice(i, i + 2), 16))
    const mixed = channels.map(channel => Math.round(alpha * 255 + (1 - alpha) * channel))
    return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`
  }
  const surface = compositeWhiteOver(Number(guideBg[1]), canvasMatch[1])
  const foreground = compositeWhiteOver(Number(guideText[1]), surface)
  const ratio = contrastRatio(foreground, surface)
  assert.ok(
    ratio >= 4.5,
    `empty guide text ${foreground} on composed surface ${surface} = ${ratio.toFixed(2)}:1, below the 4.5:1 secondary floor`
  )
})

test('homepage status card merges prediction and both reminders, leaving range and confidence to the prediction sheet', () => {
  const wxml = readIndexWxml()
  const cardBlock = sliceStatusCard(wxml)

  assert.match(cardBlock, /nextPredictDisplay/)
  assert.match(cardBlock, /bindtap="onOngoingReminderTap"/)
  assert.match(cardBlock, /bindtap="onReminderTap"/)
  assert.doesNotMatch(cardBlock, /avgCycle|predictionRangeDisplay|predictConfidence/)
  assert.match(wxml, /predictionExplanation\.summary/)
  assert.match(wxml, /predictionExplanation\.lineItems/)
})

test('status card keeps the period record count as plain status text, not a list entry', () => {
  const wxml = readIndexWxml()
  const cardBlock = sliceStatusCard(wxml)
  const figure = cardBlock.slice(cardBlock.indexOf('class="status-figure"'), cardBlock.indexOf('stat-divider'))

  // issue #105：条数仍是现状的一部分，但经期记录列表由「记录」tab 分段承接，
  // 卡上不再有点按跳转（issue #68 的左半入口随本 ticket 退役）
  assert.match(figure, /class="stat-num">\{\{periods \? periods\.length : 0\}\}<\/text>/)
  assert.match(figure, /class="stat-label">经期记录<\/text>/)
  assert.doesNotMatch(figure, /bindtap|aria-role|›|arrow|条</)
  assert.doesNotMatch(cardBlock, /goPeriodList|goMemoryList/)
  assert.doesNotMatch(cardBlock, /class="stat-divider"[^>]*bindtap/)
  assert.doesNotMatch(cardBlock, /class="status-card[^"]*"[^>]*bindtap/)
})

test('status card prediction region opens the existing prediction sheet without leaving the home page', () => {
  const wxml = readIndexWxml()
  const cardBlock = sliceStatusCard(wxml)
  const predictRegion = cardBlock.slice(cardBlock.indexOf('predict-item'), cardBlock.indexOf('status-reminders'))

  // issue #70：预测区整块接现有 openPredictionSheet 动作（原工具栏「预测」入口现由月份菜单承接）
  assert.match(predictRegion, /bindtap="openPredictionSheet"[\s\S]*?aria-role="button"/)

  // 有日期：月日 + 一个空格 + 星期；无日期：固定暂无文案（可见文字仍是 --）
  const labelExpr = /aria-label="\{\{([\s\S]+?)\}\}"/.exec(predictRegion)
  assert.ok(labelExpr, 'expected the date-aware aria label')
  const readLabel = scope => evaluateWxmlExpression(labelExpr[1], scope)
  assert.equal(readLabel({ nextPredictDisplay: '09月30日', nextPredictWeekday: '周三' }), '查看经期预测，09月30日 周三')
  assert.equal(readLabel({ nextPredictDisplay: '--', nextPredictWeekday: '' }), '查看经期预测，暂无下次日期')

  // -- 不是禁用态；预测区不进入经期记录页
  assert.doesNotMatch(predictRegion, /disabled/)
  assert.doesNotMatch(predictRegion, /goPeriodList/)
  assert.match(predictRegion, /class="predict-date">\{\{nextPredictDisplay \|\| '--'\}\}<\/text>/)
  assert.match(predictRegion, /wx:if="\{\{nextPredictWeekday\}\}"[\s\S]*?\{\{nextPredictWeekday\}\}<\/text>/)
  assert.doesNotMatch(predictRegion, /›|arrow/)

  // 说明面板的标题、正文与查看月份副标题保持现状
  assert.match(wxml, /predictionExplanation\.title/)
  assert.match(wxml, /predictionExplanation\.summary/)
  assert.match(wxml, /predictionExplanation\.lineItems/)
  assert.match(wxml, /class="sheet-subtitle">\{\{year\}\}年\{\{month \+ 1\}\}月<\/text>/)
  assert.doesNotMatch(cardBlock, /avgCycle|predictionRangeDisplay|predictConfidence/)

  // 行为：留在首页、日历不跳转，只打开预测说明
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.switchTab = options => navigation.push(options.url)
    global.wx.navigateTo = options => navigation.push(options.url)
    const viewBefore = { year: harness.page.data.year, month: harness.page.data.month }

    harness.page.openPredictionSheet()
    assert.equal(harness.page.data.infoSheetVisible, true)
    assert.equal(harness.page.data.infoSheetMode, 'prediction')
    assert.deepEqual(navigation, [])
    assert.equal(harness.page.data.year, viewBefore.year)
    assert.equal(harness.page.data.month, viewBefore.month)
  } finally {
    harness.teardown()
  }
})

test('homepage quick period action reopens the existing ongoing record instead of a blank form', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)

    // 已有进行中记录：快速记录经期进入原记录编辑页（重开），不是空白新增表单
    harness.page.setData({
      periods: [
        { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 },
        { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
      ]
    })
    harness.page.quickPeriod()
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing'])

    // 没有进行中记录：进入默认进行中的新增表单（只带开始日期，不带结束日期）
    harness.page.setData({ periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }] })
    harness.page.quickPeriod()
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing',
      '/pages/period/edit/edit?startDate=2026-06-26'
    ])
  } finally {
    harness.teardown()
  }
})

// issue #100：日历日动作 sheet 的「记录经期」与快捷入口同一决策——
// 房间已有进行中记录时打开那条记录，否则按所选日期新增（默认状态由路由按开始日期推导）
test('calendar day period action reopens the ongoing record or creates for the selected date', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)

    // 已有进行中记录：从日历选过去某天点「记录经期」，打开那条进行中记录
    harness.page.setData({
      periods: [
        { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 },
        { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
      ]
    })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-01' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing'])

    // 没有进行中记录：按所选日期新增；URL 不带状态与结束日期，由路由推导为已结束起止同日
    harness.page.setData({ periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }] })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-10' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing',
      '/pages/period/edit/edit?startDate=2026-06-10'
    ])
  } finally {
    harness.teardown()
  }
})

// issue #100：晚于今天的日期不提供可用的「记录经期」——动作 sheet 隐藏该入口（DESIGN.md 已登记），
// 处理器侧保留不导航的兜底防线；编辑页日期上限与保存校验仍是最后防线
test('calendar day period action is not usable for future dates', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.setData({ periods: [] })

    // 未来日期（harness 今天固定为 2026-06-26）：入口被标记隐藏，直接触发处理器也不导航
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-30' } } })
    assert.equal(harness.page.data.selectedDateIsFuture, true)
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.deepEqual(navigation, [])

    // 详情模式同一天同样被标记
    harness.page.showDayDetail('2026-06-30')
    assert.equal(harness.page.data.selectedDateIsFuture, true)

    // 今天与过去日期：入口可用
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-26' } } })
    assert.equal(harness.page.data.selectedDateIsFuture, false)
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-01' } } })
    assert.equal(harness.page.data.selectedDateIsFuture, false)
  } finally {
    harness.teardown()
  }
})

test('day action sheet hides both period entries for future dates in the template', () => {
  const wxml = readIndexWxml()
  const periodActions = wxml.match(/<view[^>]*data-action="period"[^>]*>/g) || []
  assert.equal(periodActions.length, 2, 'expected the actions-mode and detail-mode period entries')
  for (const tag of periodActions) {
    assert.match(tag, /wx:if="\{\{!selectedDateIsFuture\}\}"/, 'period entry must be hidden on future dates')
  }
})

// issue #98：超期进行中记录的一次非阻塞完成提示——同一记录只提示一次（今天由 util stub 固定为 2026-06-26）
test('an overdue ongoing record shows one completion reminder and never repeats it on refresh', async () => {
  const ongoing = { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
  const client = createQueuedClient([
    { kind: 'success', data: [ongoing] },
    { kind: 'success', data: [] },
    { kind: 'success', data: [{ ...ongoing }] },
    { kind: 'success', data: [] }
  ])
  const harness = loadPageHarness({ client })

  try {
    let storedMarker = ''
    const markerWrites = []
    global.wx.getStorageSync = key => (key === 'ongoingPeriodReminderShown' ? storedMarker : '')
    global.wx.setStorageSync = (key, value) => {
      if (key === 'ongoingPeriodReminderShown') {
        storedMarker = value
        markerWrites.push(value)
      }
    }

    harness.page.onLoad()
    await harness.page.onShow()
    // 开始日 06-20、今天 06-26：第 7 天；无已完成历史 → 默认预期 5 天，已超过
    const reminder = harness.page.data.ongoingCompletionReminder
    assert.ok(reminder, 'expected the completion reminder after the first load')
    assert.equal(reminder.recordKey, 'p2')
    assert.equal(reminder.expectedDays, 5)
    assert.equal(reminder.title, '经期还未结束')
    // 提示出现即写入一次性标记（经本地存储持久化，跨天/重进应用同受它约束）
    assert.deepEqual(markerWrites, ['p2'])

    // 之后刷新（同一条记录）：不再重复弹出
    await harness.page.onShow()
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(markerWrites, ['p2'])
    assert.equal(storedMarker, 'p2')
  } finally {
    harness.teardown()
  }
})

// issue #98：新会话（模拟跨天后重进应用）里，已提示过的同一条记录不再弹出；
// 完成旧记录后出现的另一条新进行中记录，仍可获得属于它自己的一次提示
test('a fresh session does not re-show the reminder for a record already marked as shown', async () => {
  const ongoing = { _id: 'p2', startDate: '2026-06-18', endDate: '', status: 'ongoing' }
  const client = createQueuedClient([
    { kind: 'success', data: [ongoing] },
    { kind: 'success', data: [] }
  ])
  const harness = loadPageHarness({ client })

  try {
    // 上一个会话已为 p2 写入过标记：本次加载即使已超期也不再提示
    global.wx.getStorageSync = key => (key === 'ongoingPeriodReminderShown' ? 'p2' : '')
    const markerWrites = []
    global.wx.setStorageSync = (key, value) => {
      if (key === 'ongoingPeriodReminderShown') markerWrites.push(value)
    }

    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(markerWrites, [])

    // p2 被补填结束日期完成（编辑页保存回流），之后开始一条新的进行中记录 p3
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'upsert',
      record: { _id: 'p2', startDate: '2026-06-18', endDate: '2026-06-22', status: 'known-end', duration: 5 }
    })
    assert.equal(harness.page.data.ongoingCompletionReminder, null)

    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'add',
      record: { _id: 'p3', startDate: '2026-06-18', endDate: '', status: 'ongoing' }
    })
    assert.equal(harness.page.data.ongoingCompletionReminder.recordKey, 'p3')
    assert.deepEqual(markerWrites, ['p3'])
  } finally {
    harness.teardown()
  }
})

// issue #98：未超预期时长时不提示；提示不自动写结束日期、不自动关闭状态
test('no completion reminder before the expected duration, and none is invented for completed records', async () => {
  const ongoing = { _id: 'p2', startDate: '2026-06-24', endDate: '', status: 'ongoing' }
  const client = createQueuedClient([
    { kind: 'success', data: [ongoing] },
    { kind: 'success', data: [] }
  ])
  const harness = loadPageHarness({ client })

  try {
    const markerWrites = []
    global.wx.getStorageSync = () => ''
    global.wx.setStorageSync = (key, value) => {
      if (key === 'ongoingPeriodReminderShown') markerWrites.push(value)
    }

    harness.page.onLoad()
    await harness.page.onShow()
    // 第 3 天（06-24 → 06-26）未超过默认预期 5 天
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(markerWrites, [])

    // 记录被补填结束日期完成（经编辑页保存回流）：没有进行中记录，同样没有提示
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'upsert',
      record: { _id: 'p2', startDate: '2026-06-24', endDate: '2026-06-26', status: 'known-end', duration: 3 }
    })
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(harness.page.data.periods[0].endDate, '2026-06-26')
  } finally {
    harness.teardown()
  }
})

// issue #98：点击提示打开同一条进行中记录补填，只导航、不改数据
test('tapping the completion reminder opens the same ongoing record to fill its end date', async () => {
  const ongoing = { _id: 'p9', startDate: '2026-06-18', endDate: '', status: 'ongoing' }
  const client = createQueuedClient([
    { kind: 'success', data: [ongoing] },
    { kind: 'success', data: [] }
  ])
  const harness = loadPageHarness({ client })

  try {
    const navigation = []
    global.wx.getStorageSync = () => ''
    global.wx.setStorageSync = () => {}
    global.wx.navigateTo = options => navigation.push(options.url)

    harness.page.onLoad()
    await harness.page.onShow()
    assert.ok(harness.page.data.ongoingCompletionReminder)

    harness.page.onOngoingReminderTap()
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p9&startDate=2026-06-18&status=ongoing'])

    // 点击只打开原记录：不写结束日期、不关闭状态
    assert.equal(harness.page.data.periods[0].endDate, '')
    assert.equal(harness.page.data.periods[0].status, 'ongoing')
  } finally {
    harness.teardown()
  }
})

// issue #98：提示是文档流里的非阻塞卡片（无遮罩/弹层）；issue #105 起并入合并状态卡、位于周期提醒之前，读屏可读
test('the completion reminder is an in-flow non-blocking card with a readable name', () => {
  const wxml = readIndexWxml()
  const gateIndex = wxml.indexOf('wx:if="{{ongoingCompletionReminder}}"')
  assert.ok(gateIndex !== -1, 'expected the ongoing completion reminder card')
  const cardIndex = wxml.indexOf('onOngoingReminderTap', gateIndex)
  assert.ok(cardIndex !== -1)

  const blockStart = wxml.lastIndexOf('<view', gateIndex)
  const actionIndex = wxml.indexOf('class="reminder-action"', cardIndex)
  const blockEnd = wxml.indexOf('</view>', actionIndex)
  const block = wxml.slice(blockStart, blockEnd + '</view>'.length)
  assert.match(block, /wx:if="\{\{ongoingCompletionReminder\}\}"/)
  assert.match(block, /class="reminder-card \{\{ongoingCompletionReminder\.type\}\}"/)
  assert.match(block, /aria-role="button"/)
  assert.match(block, /aria-label="\{\{ongoingCompletionReminder\.title\}\}，\{\{ongoingCompletionReminder\.text\}\}，点按去补填"/)
  assert.match(block, /class="reminder-action">去补填</)
  // 非阻塞：不是遮罩弹层，不用 modal/sheet 容器
  assert.doesNotMatch(block, /mask|sheet|modal|fixed/)

  // 位置：合并状态卡内、周期提醒卡之前，一张卡看完现状
  const statusIndex = wxml.indexOf('class="status-card')
  const cycleReminderIndex = wxml.indexOf('onReminderTap')
  assert.ok(statusIndex !== -1 && statusIndex < gateIndex, 'reminder card lives inside the merged status card')
  assert.ok(cycleReminderIndex !== -1 && cardIndex < cycleReminderIndex, 'reminder card sits before the cycle reminders')

  // 样式复用周期提醒卡，不新增视觉系统；无新增 wxss 规则要求
  const wxss = readIndexWxss()
  assert.match(ruleBody(wxss, '.reminder-card'), /min-height:\s*88rpx/)
})

test('stats halves press with the shared card scale-down and reduced-motion policy', () => {
  const wxss = readIndexWxss()

  // 按下只缩小该半块（与首页其他卡片的 0.98 按压一致），不改颜色
  const active = ruleBody(wxss, '.stat-item:active')
  assert.match(active, /transform:\s*scale\(0\.98\)/)
  assert.doesNotMatch(active, /background|color/)
  assert.match(ruleBody(wxss, '.stat-item'), /transition:\s*transform/)

  // 系统减弱动效沿用首页现成名单，不新增动画
  const reduced = wxss.slice(wxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.stat-item\b/)
})

test('homepage stacks month navigation, calendar, record actions, then the merged status card or empty guide', () => {
  const wxml = readIndexWxml()
  const monthNavIndex = wxml.indexOf('class="month-nav"')
  const weekHeaderIndex = wxml.indexOf('class="week-header"')
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const statusIndex = wxml.indexOf('class="status-card')
  const emptyGuideIndex = wxml.indexOf('class="empty-guide"')

  assert.ok(monthNavIndex !== -1 && weekHeaderIndex !== -1 && gridIndex !== -1, 'expected month nav, week header, and calendar grid')
  assert.ok(quickIndex !== -1 && statusIndex !== -1 && emptyGuideIndex !== -1, 'expected quick actions, the status card, and the empty guide')
  assert.ok(monthNavIndex < weekHeaderIndex, 'month navigation leads the calendar')
  assert.ok(weekHeaderIndex < gridIndex, 'week header sits directly above the calendar grid')
  assert.ok(gridIndex < quickIndex, 'record actions directly follow the calendar grid')
  assert.ok(quickIndex < statusIndex, 'the merged status card follows the record actions')
  assert.ok(statusIndex < emptyGuideIndex, 'the empty-state guide takes the card slot when there is nothing to show')

  // issue #105：低频工具收进月份菜单、列表入口由「记录」tab 分段承接，日历下方不再有工具条与底部入口
  assert.equal(wxml.includes('meaning-toolbar'), false, 'the meaning toolbar moves into the month tools menu')
  assert.equal(wxml.includes('record-entries'), false, 'the bottom record-list entries are removed')
  const js = fs.readFileSync(path.join(repoRoot, 'pages/index/index.js'), 'utf8')
  assert.doesNotMatch(js, /goPeriodList|goMemoryList/)
})

// issue #105：图例 / 预测说明 / 本月小结收进月份标题旁的「…」菜单（⌄ 已是选月 caret，不重复占用）
test('month navigation offers a tools menu trigger beside the month title', () => {
  const wxml = readIndexWxml()
  const monthNav = wxml.slice(wxml.indexOf('class="month-nav"'), wxml.indexOf('class="week-header"'))
  const titleIndex = monthNav.indexOf('month-title-trigger')
  const menuIndex = monthNav.indexOf('month-menu-trigger')
  const nextIndex = monthNav.indexOf('nextMonth')

  assert.ok(titleIndex !== -1, 'expected the month title picker trigger')
  assert.ok(menuIndex !== -1, 'expected the month tools menu trigger')
  assert.ok(titleIndex < menuIndex && menuIndex < nextIndex, 'the tools menu trigger sits between the month title and the next-month arrow')

  const triggerTag = monthNav.slice(monthNav.lastIndexOf('<view', menuIndex), monthNav.indexOf('</view>', menuIndex))
  assert.match(triggerTag, /bindtap="openMonthMenu"/)
  assert.match(triggerTag, /aria-role="button"/)
  assert.match(triggerTag, /aria-label="打开工具菜单"/)
  assert.match(triggerTag, /…/)
  // 触发器与翻月箭头同族触控几何（88rpx 圆钮），不缩小吸收
  const wxss = readIndexWxss()
  const navBtn = ruleBody(wxss, '.nav-btn')
  assert.match(triggerTag, /class="nav-btn month-menu-trigger"/)
  assert.match(navBtn, /width:\s*88rpx/)
  assert.match(navBtn, /height:\s*88rpx/)
})

test('month tools menu reuses the existing legend, prediction, and recap sheets', () => {
  const wxml = readIndexWxml()
  const menuStart = wxml.indexOf('wx:if="{{monthMenuMounted}}"')
  assert.ok(menuStart !== -1, 'expected the month tools menu sheet')
  const menuEnd = wxml.indexOf('wx:if="{{infoSheetMounted}}"')
  assert.ok(menuEnd > menuStart, 'the menu sheet precedes the info sheets it opens')
  const menuBlock = wxml.slice(menuStart, menuEnd)

  // 遮罩本身是可点的「关闭」操作
  assert.match(menuBlock, /bindtap="closeMonthMenu"[^>]*aria-role="button"[^>]*aria-label="关闭工具菜单"/)

  // 三个菜单项按序 = 图例 / 预测说明 / 本月小结，朗读名承接原工具条
  const items = [...menuBlock.matchAll(/data-action="(legend|prediction|recap)"[^>]*bindtap="onMonthMenuTap"/g)].map(match => match[1])
  assert.deepEqual(items, ['legend', 'prediction', 'recap'])
  assert.match(menuBlock, /aria-label="打开日历图例"/)
  assert.match(menuBlock, /aria-label="查看经期预测"/)
  assert.match(menuBlock, /aria-label="查看本月小结"/)

  // sheet 本体零改动复用：三个信息面板仍在
  assert.match(wxml, /class="legend-list"/)
  assert.match(wxml, /class="prediction-explanation"/)
  assert.match(wxml, /class="monthly-recap"/)
})

test('month tools menu opens the matching sheet and stays on the home page', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.switchTab = options => navigation.push(options.url)
    global.wx.navigateTo = options => navigation.push(options.url)
    const viewBefore = { year: harness.page.data.year, month: harness.page.data.month }

    harness.page.openMonthMenu()
    assert.equal(harness.page.data.monthMenuVisible, true)
    harness.page.closeMonthMenu()
    assert.equal(harness.page.data.monthMenuVisible, false)

    for (const [action, mode] of [['legend', 'legend'], ['prediction', 'prediction'], ['recap', 'recap']]) {
      harness.page.openMonthMenu()
      harness.page.onMonthMenuTap({ currentTarget: { dataset: { action } } })
      assert.equal(harness.page.data.monthMenuVisible, false, `${action} closes the menu before opening its sheet`)
      assert.equal(harness.page.data.infoSheetVisible, true)
      assert.equal(harness.page.data.infoSheetMode, mode)
      harness.page.closeInfoSheet()
    }

    // 菜单不导航、不翻月
    assert.deepEqual(navigation, [])
    assert.equal(harness.page.data.year, viewBefore.year)
    assert.equal(harness.page.data.month, viewBefore.month)
  } finally {
    harness.teardown()
  }
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

test('quick record buttons use the calendar legend marks, not emoji, and reach 44px at 320px', () => {
  const wxml = readIndexWxml()
  const wxss = readIndexWxss()

  // issue #73：图标 = 日历图例的经期玫瑰圆点与欢乐时光浅色心，画在海军圆盘上
  const quickStart = wxml.indexOf('class="quick-actions"')
  const quickEnd = wxml.indexOf('class="status-card')
  const quickBlock = wxml.slice(quickStart, quickEnd)
  assert.match(quickBlock, /class="quick-icon period-tone">●<\/text>/)
  assert.match(quickBlock, /class="quick-icon memory-tone">♥<\/text>/)
  // 不再用表情（🩸 / ❤️ 表情形态），图标是文本字形圆点与心
  assert.doesNotMatch(quickBlock, /🩸|❤️/)
  // 语义色沿用图例标记：玫瑰圆点 / 浅色心
  assert.match(ruleBody(wxss, '.period-tone'), /color:\s*#E8909E/i)
  assert.match(ruleBody(wxss, '.memory-tone'), /color:\s*#F0C4C0/i)
  assert.match(ruleBody(wxss, '.quick-icon'), /background:\s*#0A0E27/i)
  assert.match(ruleBody(wxss, '.quick-icon'), /border-radius:\s*var\(--radius-circle\)/)

  // 320px 宽上可点高度 ≥44px：104rpx ≈ 44.4px@320px（与 compact 日历格同换算）
  const button = ruleBody(wxss, '.quick-btn')
  const minHeight = numberDecl(button, 'min-height')
  assert.ok(minHeight >= 104, `.quick-btn min-height ${minHeight}rpx is below 104rpx (44px at 320px)`)
  assert.match(button, /box-sizing:\s*border-box/)
  assert.ok((minHeight * 320) / 750 >= 44, `.quick-btn ${minHeight}rpx is under 44px at 320px`)

  // 字号不降低：正文角色 28rpx 保持
  assert.match(ruleBody(wxss, '.quick-text'), /font-size:\s*var\(--font-size-body\)/)
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
  // 记录按钮行高 = max(min-height, 纵向内边距 + 内容行)：issue #73 抬到 104rpx 后按真实高度记账
  const quickBody = ruleBody(wxss, '.quick-btn')
  const quickRow = Math.max(
    numberDecl(quickBody, 'min-height'),
    shorthandVertical(quickBody, 'padding') + QUICK_CONTENT_RPX
  )
  const quickActions = numberDecl(ruleBody(wxss, '.quick-actions'), 'margin-top') + quickRow

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

test('month arrows publish the new month and its calendar grid in one update', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]), calendarState: 'real' })
  const originalSetTimeout = global.setTimeout
  const timerDelays = []
  global.setTimeout = (fn, delay, ...args) => {
    timerDelays.push(delay)
    return originalSetTimeout(fn, delay, ...args)
  }
  try {
    harness.page.onLoad()
    const updates = []
    const setData = harness.page.setData.bind(harness.page)
    harness.page.setData = (update, callback) => {
      updates.push(update)
      setData(update, callback)
    }

    const flip = (setup, invoke, year, month, firstDate) => {
      harness.page.setData({
        ...setup,
        monthPickerVisible: true,
        days: [{ date: 'stale-grid' }]
      })
      updates.length = 0
      timerDelays.length = 0
      invoke()
      assert.equal(timerDelays.length, 0)
      assert.equal(updates.length, 1)
      assert.equal(updates[0].year, year)
      assert.equal(updates[0].month, month)
      assert.equal(updates[0].monthPickerVisible, false)
      assert.equal(updates[0].days[0].date, firstDate)
      assert.equal(harness.page.data.year, year)
      assert.equal(harness.page.data.month, month)
      assert.equal(harness.page.data.days[0].date, firstDate)
    }

    // 2019-12-01 是周日，网格第一格就是该月 1 日
    flip({ year: 2019, month: 10 }, () => harness.page.nextMonth(), 2019, 11, '2019-12-01')
    flip({ year: 2020, month: 0 }, () => harness.page.prevMonth(), 2019, 11, '2019-12-01')
  } finally {
    global.setTimeout = originalSetTimeout
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

// issue #116：进场先以关闭姿态挂载，下一次渲染才进入打开，CSS 过渡才有起点可反向。
test('month picker mounts in the closed pose and opens on the next render', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()

    assert.equal(harness.page.data.monthPickerVisible, true)
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.equal(harness.page.data.monthPickerPhase, 'closed')

    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.monthPickerMounted, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #116：关闭后先离场，弹层仍挂载；200ms 到点才卸载。确认与回到今天走同一条离场。
test('month picker stays mounted through leave and unmounts when the exit timer fires', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const wxml = readIndexWxml()
    assert.match(wxml, /wx:if="\{\{monthPickerMounted\}\}"/)
    assert.match(wxml, /sheet-\{\{monthPickerPhase\}\}/)
    assert.match(ruleBody(readIndexWxss(), '.day-sheet-mask.sheet-leaving'), /pointer-events:\s*none/)

    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    mock.timers.tick(0)

    harness.page.closeMonthPicker()
    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)

    mock.timers.tick(199)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)

    mock.timers.tick(1)
    assert.equal(harness.page.data.monthPickerPhase, 'closed')
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.equal(harness.page.data.monthPickerVisible, false)

    harness.page.openMonthPicker()
    mock.timers.tick(0)
    harness.page.setData({ jumpYear: 2021, jumpMonth: 11 })
    harness.page.confirmMonthJump()
    assert.equal(harness.page.data.year, 2021)
    assert.equal(harness.page.data.month, 11)
    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)

    harness.page.openMonthPicker()
    mock.timers.tick(0)
    harness.page.jumpToToday()
    const today = new Date()
    assert.equal(harness.page.data.year, today.getFullYear())
    assert.equal(harness.page.data.month, today.getMonth())
    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

test('opening the month picker during leave cancels the unmount and returns to open', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    mock.timers.tick(0)
    harness.page.closeMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')

    mock.timers.tick(100)
    harness.page.openMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.monthPickerVisible, true)
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.equal(harness.page.data.jumpYear, 2020)
    assert.equal(harness.page.data.jumpMonth, 5)

    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.equal(harness.page.data.monthPickerVisible, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

test('day actions, tools menu, and the info sheet use the same enter and leave lifecycle', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const wxml = readIndexWxml()
    assert.match(wxml, /wx:if="\{\{dayActionMounted\}\}"[\s\S]*?sheet-\{\{dayActionPhase\}\}/)
    assert.match(wxml, /wx:if="\{\{monthMenuMounted\}\}"[\s\S]*?sheet-\{\{monthMenuPhase\}\}/)
    assert.match(wxml, /wx:if="\{\{infoSheetMounted\}\}"[\s\S]*?sheet-\{\{infoSheetPhase\}\}/)

    harness.page.onLoad()
    harness.page.setData({
      days: [{ date: '2026-06-20', weekday: '周六', lunarText: '五月初五', isEmpty: false }],
      dayDetailsByDate: {
        '2026-06-20': { meanings: [], periods: [], memories: [], empty: true }
      }
    })

    harness.page.showDayDetail('2026-06-20')
    assert.equal(harness.page.data.dayActionMounted, true)
    assert.equal(harness.page.data.dayActionPhase, 'closed')
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.selectedDateSubtitle, '周六 · 五月初五')
    mock.timers.tick(0)
    assert.equal(harness.page.data.dayActionPhase, 'open')

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-20' } } })
    assert.equal(harness.page.data.dayActionPhase, 'open')
    assert.equal(harness.page.data.daySheetMode, 'actions')

    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'memory' } } })
    assert.equal(navigation.length, 1)
    assert.match(navigation[0], /2026-06-20/)
    assert.equal(harness.page.data.dayActionPhase, 'leaving')
    assert.equal(harness.page.data.dayActionSheetVisible, false)
    assert.equal(harness.page.data.dayActionMounted, true)
    assert.equal(harness.page.data.selectedDate, '2026-06-20')

    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.equal(navigation.length, 2)
    assert.match(navigation[1], /2026-06-20/)
    assert.equal(harness.page.data.dayActionPhase, 'leaving')

    mock.timers.tick(200)
    assert.equal(harness.page.data.dayActionMounted, false)
    assert.equal(harness.page.data.dayActionPhase, 'closed')
    assert.equal(harness.page.data.selectedDate, '')

    harness.page.openMonthMenu()
    assert.equal(harness.page.data.monthMenuVisible, true)
    assert.equal(harness.page.data.monthMenuMounted, true)
    assert.equal(harness.page.data.monthMenuPhase, 'closed')
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthMenuPhase, 'open')

    harness.page.onMonthMenuTap({ currentTarget: { dataset: { action: 'legend' } } })
    assert.equal(harness.page.data.monthMenuVisible, false)
    assert.equal(harness.page.data.monthMenuPhase, 'leaving')
    assert.equal(harness.page.data.monthMenuMounted, true)
    assert.equal(harness.page.data.infoSheetVisible, true)
    assert.equal(harness.page.data.infoSheetMode, 'legend')
    assert.equal(harness.page.data.infoSheetPhase, 'closed')
    mock.timers.tick(0)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.monthMenuPhase, 'leaving')

    harness.page.closeInfoSheet()
    assert.equal(harness.page.data.infoSheetVisible, false)
    assert.equal(harness.page.data.infoSheetPhase, 'leaving')
    assert.equal(harness.page.data.infoSheetMounted, true)
    assert.equal(harness.page.data.infoSheetMode, 'legend')

    harness.page.openPredictionSheet()
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.infoSheetVisible, true)
    assert.equal(harness.page.data.infoSheetMode, 'prediction')
    mock.timers.tick(200)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.infoSheetMounted, true)
    assert.equal(harness.page.data.monthMenuPhase, 'closed')
    assert.equal(harness.page.data.monthMenuMounted, false)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #118：任一弹层打开或离场时首页根节点被遮挡；全部卸载后标记去掉。
// 进场的关闭姿态还没盖住页面，标记先不出现。
test('an open or leaving homepage sheet obscures the page until every sheet unmounts', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const root = readIndexWxml().slice(0, readIndexWxml().indexOf('>'))
    assert.match(root, /class="page safe-top \{\{pageObscured \? 'page-obscured' : ''\}\}"/)

    harness.page.onLoad()
    harness.page.setData({
      year: 2020,
      month: 5,
      days: [{ date: '2026-06-20', weekday: '周六', lunarText: '五月初五', isEmpty: false }]
    })
    assert.equal(harness.page.data.pageObscured, false)

    harness.page.openMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'closed')
    assert.equal(harness.page.data.pageObscured, false)
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.pageObscured, true)

    harness.page.showDayDetail('2026-06-20')
    assert.equal(harness.page.data.dayActionPhase, 'closed')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(0)
    assert.equal(harness.page.data.dayActionPhase, 'open')
    assert.equal(harness.page.data.pageObscured, true)

    harness.page.closeMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.equal(harness.page.data.pageObscured, true)

    harness.page.closeDayActions()
    assert.equal(harness.page.data.dayActionPhase, 'leaving')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(200)
    assert.equal(harness.page.data.dayActionMounted, false)
    assert.equal(harness.page.data.pageObscured, false)

    harness.page.openMonthMenu()
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthMenuPhase, 'open')
    assert.equal(harness.page.data.pageObscured, true)
    harness.page.onMonthMenuTap({ currentTarget: { dataset: { action: 'legend' } } })
    assert.equal(harness.page.data.monthMenuPhase, 'leaving')
    assert.equal(harness.page.data.infoSheetPhase, 'closed')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(0)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(200)
    assert.equal(harness.page.data.monthMenuMounted, false)
    assert.equal(harness.page.data.infoSheetMounted, true)
    assert.equal(harness.page.data.pageObscured, true)
    harness.page.closeInfoSheet()
    assert.equal(harness.page.data.infoSheetPhase, 'leaving')
    assert.equal(harness.page.data.pageObscured, true)
    mock.timers.tick(200)
    assert.equal(harness.page.data.infoSheetMounted, false)
    assert.equal(harness.page.data.pageObscured, false)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #120：同步胶囊入场改为两步过渡，先挂上离场姿态，下一次渲染才进入显示，中途才能反向。
test('sync pill mounts in the hidden pose and shows on the next render', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const wxml = readIndexWxml()
    assert.match(wxml, /wx:if="\{\{syncStatusMounted\}\}"/)
    assert.match(wxml, /sync-\{\{syncStatusPhase\}\}/)
    assert.match(wxml, /class="sync-pill[^"]*"[\s\S]*?aria-role="status"/)
    assert.match(wxml, /class="sync-pill[^"]*"[\s\S]*?aria-label="\{\{syncStatusText\}\}"/)

    harness.page.onLoad()
    harness.page.showSyncStatus('已同步', { autoHide: false })

    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusPhase, 'closed')

    mock.timers.tick(0)
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已同步')
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #120：隐藏先进入离场，--duration-exit（200ms）到点才卸载，不听 transitionend。
test('sync pill stays mounted through leave and unmounts when the exit timer fires', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.showSyncStatus('已同步', { autoHide: false })
    mock.timers.tick(0)

    harness.page.hideSyncStatus()
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(199)
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(1)
    assert.equal(harness.page.data.syncStatusPhase, 'closed')
    assert.equal(harness.page.data.syncStatusMounted, false)
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #120：离场途中又有新的同步状态，取消卸载并回到显示，不经过卸载再挂上。
test('a new sync status during leave cancels the unmount and returns to shown', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.showSyncStatus('已同步', { autoHide: false })
    mock.timers.tick(0)
    harness.page.hideSyncStatus()
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')

    mock.timers.tick(100)
    harness.page.showSyncStatus('已更新，正在同步', { autoHide: false })
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')

    mock.timers.tick(200)
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #120：自动隐藏仍是 1600ms 后才开始离场，离场时长不提前把文案清掉。
test('sync pill auto-hide still waits 1600ms before leaving', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.showSyncStatus('已同步')
    mock.timers.tick(0)

    mock.timers.tick(1599)
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(1)
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(200)
    assert.equal(harness.page.data.syncStatusMounted, false)
    assert.equal(harness.page.data.syncStatusPhase, 'closed')
    assert.equal(harness.page.data.syncStatusText, '')
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #120：两步入场中途隐藏会停在离场，下一次渲染不会再把它打开。
test('hiding the sync pill before enter finishes reverses it instead of showing it', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.showSyncStatus('已同步', { autoHide: false })
    assert.equal(harness.page.data.syncStatusPhase, 'closed')
    assert.equal(harness.page.data.syncStatusMounted, true)

    harness.page.hideSyncStatus()
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.syncStatusText, '')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(0)
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(200)
    assert.equal(harness.page.data.syncStatusMounted, false)
    assert.equal(harness.page.data.syncStatusPhase, 'closed')
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

test('updating sync pill copy while it is shown keeps it shown', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.showSyncStatus('已同步', { autoHide: false })
    mock.timers.tick(0)

    harness.page.showSyncStatus('已更新，正在同步', { autoHide: false })
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusVisible, true)
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')

    mock.timers.tick(0)
    assert.equal(harness.page.data.syncStatusPhase, 'open')
    assert.equal(harness.page.data.syncStatusMounted, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
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
