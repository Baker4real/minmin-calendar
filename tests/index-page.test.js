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
  const match = wxss.match(new RegExp(`(?:^|[\\n},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

// WXML {{ }} 内是 JS 表达式；用真实数据形状直接算出读屏最终整句
function evaluateWxmlExpression(expr, scope) {
  const keys = Object.keys(scope)
  return new Function(...keys, `return (${expr})`)(...keys.map(key => scope[key]))
}

// 属性模板里的每段 {{ }} 按页面数据求值后拼回整句，即读屏实际拿到的属性值
function renderWxmlAttribute(template, data) {
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const value = evaluateWxmlExpression(expr, data)
    return value === undefined || value === null ? '' : String(value)
  })
}

// 模板片段里的开始标签与其双引号属性原文
function wxmlOpeningTags(fragment) {
  const source = fragment.replace(/<!--[\s\S]*?-->/g, '')
  const tags = []
  for (const match of source.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g)) {
    const attrs = {}
    for (const attr of match[2].matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) attrs[attr[1]] = attr[2]
    tags.push({ tag: match[1], attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean) })
  }
  return tags
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
    assert.deepEqual(harness.page._homeRecords.periods, [period('p1', '2026-06-01')])
    assert.deepEqual(harness.page._homeRecords.memories, [memory('m1', '2026-06-02')])
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

    assert.deepEqual(harness.page._homeRecords.periods, initialPeriods)
    assert.deepEqual(harness.page._homeRecords.memories, initialMemories)
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

    assert.deepEqual(harness.page._homeRecords.periods, [remotePeriod, initialPeriod])
    assert.deepEqual(harness.page._homeRecords.memories, [initialMemory, remoteMemory])
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

    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p2', 'p1'])
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

    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p2', 'p1'])
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

    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page._homeRecords.periods.filter(item => item.status === 'ongoing').length, 1)
    assert.equal(harness.page._homeRecords.periods[0].note, '已经记录过的经期')
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
    assert.deepEqual(harness.page._homeRecords.periods, [initialPeriod])
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
    assert.deepEqual(harness.page._homeRecords.periods, [initialPeriod])
    // 失败反馈不挂在自动消失的同步 pill 上：pill 已隐藏，失败界面只剩常驻重试句
    assert.equal(harness.page.data.syncStatusVisible, false)
    assert.equal(harness.page.data.refreshing, false)

    // 点重试仍失败：句子留驻，不换回整页失败画面
    await harness.page.retryRefresh()
    assert.equal(harness.page.data.refreshRetryVisible, true)
    assert.equal(harness.page.data.noRoom, false)
    assert.deepEqual(harness.page._homeRecords.periods, [initialPeriod])

    // 后一次刷新成功：失败提示消失，数据被成功结果替换
    await harness.page.onShow()
    assert.equal(harness.page.data.refreshRetryVisible, false)
    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p1', 'p2'])
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
  // 可见文案与朗读名随失败范围变化（issue #151），整句由 renderRefreshRetry 按页面数据求值

  const wxss = readIndexWxss()
  const row = ruleBody(wxss, '.refresh-retry')
  assert.doesNotMatch(row, /position:\s*(fixed|absolute)/, 'the retry row must stay in the document flow')
  assert.match(ruleBody(wxss, '.refresh-retry-text'), /color:\s*#E8909E/i)
})

// issue #151：行内重试行按失败范围给出的整句（可见文案 / 朗读名）
const FULL_REFRESH_RETRY = { text: '刷新失败，点按重试', ariaLabel: '日历刷新失败，点按重试' }
const PERIODS_RETRY = { text: '经期同步失败，点按重试', ariaLabel: '经期同步失败，点按重试' }
const MEMORIES_RETRY = { text: '欢乐时光同步失败，点按重试', ariaLabel: '欢乐时光同步失败，点按重试' }

// issue #151：用页面数据渲染行内重试行——显示条件、可见文案和朗读名都按模板求值，
// 断言用户看到、读屏读到的句子，不绑定数据键名
function renderRefreshRetry(data) {
  const wxml = readIndexWxml()
  const classIndex = wxml.indexOf('class="refresh-retry"')
  assert.ok(classIndex !== -1, 'expected the refresh retry row')
  const tagStart = wxml.lastIndexOf('<view', classIndex)
  const tagEnd = wxml.indexOf('>', classIndex)
  const openTag = wxml.slice(tagStart, tagEnd + 1)
  const inner = wxml.slice(tagEnd + 1, wxml.indexOf('</view>', tagEnd))
  const attr = (name) => {
    const match = openTag.match(new RegExp(`\\s${name}="([^"]*)"`))
    assert.ok(match, `expected ${name} on the refresh retry row`)
    return match[1]
  }
  const render = (template) => template.replace(
    /\{\{([\s\S]*?)\}\}/g,
    (_, expr) => String(evaluateWxmlExpression(expr, data))
  )
  const condition = attr('wx:if').match(/^\{\{([\s\S]*)\}\}$/)
  assert.ok(condition, 'the refresh retry row is conditional')
  if (!evaluateWxmlExpression(condition[1], data)) return null
  return {
    text: render(inner.replace(/<[^>]*>/g, '').trim()),
    ariaLabel: render(attr('aria-label'))
  }
}

// issue #151：只有经期同步失败——旧经期和刚同步到的欢乐时光都留在日历上，
// 行内重试指出失败的是经期；重试成功后日历更新、重试行消失
test('a periods-only sync failure keeps old periods and offers an inline retry that names periods', async () => {
  const oldPeriod = period('p1', '2026-06-01')
  const newPeriod = period('p2', '2026-06-20')
  const oldMemory = memory('m1', '2026-06-02')
  const newMemory = memory('m2', '2026-06-12')
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [oldPeriod] },
      { kind: 'success', data: [oldMemory] },
      { kind: 'retryable-failure', message: 'period network down' },
      { kind: 'success', data: [oldMemory, newMemory] },
      { kind: 'success', data: [newPeriod, oldPeriod] },
      { kind: 'success', data: [oldMemory, newMemory] }
    ])
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(renderRefreshRetry(harness.page.data), null)

    await harness.page.onShow()
    assert.deepEqual(harness.page._homeRecords.periods, [oldPeriod])
    assert.deepEqual(harness.page._homeRecords.memories, [oldMemory, newMemory])
    assert.deepEqual(renderRefreshRetry(harness.page.data), PERIODS_RETRY)
    // 胶囊只报日历现在显示什么；失败范围和重试由重试行说，胶囊文案因此放得进顶栏标题槽
    assert.equal(harness.page.data.syncStatusText, '已保留旧经期数据')

    await harness.page.retryRefresh()
    assert.equal(renderRefreshRetry(harness.page.data), null)
    assert.deepEqual(harness.page._homeRecords.periods, [newPeriod, oldPeriod])
    assert.deepEqual(harness.page._homeRecords.memories, [oldMemory, newMemory])
    assert.equal(harness.page.data.syncStatusText, '已同步')
  } finally {
    harness.teardown()
  }
})

// issue #151：只有欢乐时光同步失败——首屏照常显示经期，行内重试指出欢乐时光；
// 重试仍失败时经期、失败说明和重试入口都留驻，计时器走多久都不自动消失
test('a memories-only sync failure names happy times and a repeated failure never auto-hides the retry', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const loadedPeriod = period('p1', '2026-06-01')
  const failure = { kind: 'retryable-failure', message: 'memory network down' }
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [loadedPeriod] },
      failure,
      { kind: 'success', data: [loadedPeriod] },
      failure
    ]),
    room: {
      async getVerifiedActiveRoom() {
        return { kind: 'success', bound: true, roomCode: 'ROOM01', status: 'waiting' }
      }
    }
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.deepEqual(harness.page._homeRecords.periods, [loadedPeriod])
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
    assert.equal(harness.page.data.syncStatusText, '已显示经期数据')

    const retry = harness.page.retryRefresh()
    // 重试进行中不先撤掉失败行：只有成功的结果才清除
    assert.equal(harness.page.data.refreshing, true)
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
    await retry
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
    assert.deepEqual(harness.page._homeRecords.periods, [loadedPeriod])
    assert.deepEqual(harness.page._homeRecords.memories, [])
    assert.equal(harness.page.data.noRoom, false)

    mock.timers.tick(60000)
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #151：部分失败与整页刷新失败共用同一行、同一处理器——
// 最近一次结果决定这一行指向哪里；整页失败的旧句不变，两个集合都成功才消失
test('the inline retry follows the latest outcome across partial and full background failures', async () => {
  const p1 = period('p1', '2026-06-01')
  const p2 = period('p2', '2026-06-20')
  const m1 = memory('m1', '2026-06-02')
  const m2 = memory('m2', '2026-06-12')
  const failure = { kind: 'retryable-failure', message: 'network down' }
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [p1] },
      { kind: 'success', data: [m1] },
      // 回到首页：只有经期失败，欢乐时光没有变化
      failure,
      { kind: 'success', data: [m1] },
      // 下拉刷新：两个集合都失败
      failure,
      failure,
      // 点重试：经期恢复，欢乐时光失败
      { kind: 'success', data: [p2, p1] },
      failure,
      // 再点重试：两个集合都成功
      { kind: 'success', data: [p2, p1] },
      { kind: 'success', data: [m2, m1] }
    ])
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()

    await harness.page.onShow()
    assert.deepEqual(renderRefreshRetry(harness.page.data), PERIODS_RETRY)
    // 没有本地改动也没有新数据时胶囊照旧保持安静：失败说明只由重试行承担
    assert.equal(harness.page.data.syncStatusVisible, false)

    await harness.page.onPullDownRefresh()
    assert.deepEqual(renderRefreshRetry(harness.page.data), FULL_REFRESH_RETRY)
    assert.deepEqual(harness.page._homeRecords.periods, [p1])
    assert.deepEqual(harness.page._homeRecords.memories, [m1])

    await harness.page.retryRefresh()
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
    assert.deepEqual(harness.page._homeRecords.periods, [p2, p1])
    assert.deepEqual(harness.page._homeRecords.memories, [m1])

    await harness.page.retryRefresh()
    assert.equal(renderRefreshRetry(harness.page.data), null)
    assert.deepEqual(harness.page._homeRecords.periods, [p2, p1])
    assert.deepEqual(harness.page._homeRecords.memories, [m2, m1])
    assert.equal(harness.page.data.noRoom, false)
  } finally {
    harness.teardown()
  }
})

// issue #151：刚保存的经期还在等待同步时经期同步失败——乐观记录不回滚、pending 不被误确认，
// 胶囊沿用既有部分失败状态；重试成功才确认 pending 并清除重试行
test('a partial failure keeps the pending local revision until a successful retry confirms it', async () => {
  const p1 = period('p1', '2026-06-01')
  const saved = period('p2', '2026-06-20')
  const m1 = memory('m1', '2026-06-02')
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [p1] },
      { kind: 'success', data: [m1] },
      { kind: 'retryable-failure', message: 'period network down' },
      { kind: 'success', data: [m1] },
      { kind: 'success', data: [saved, p1] },
      { kind: 'success', data: [m1] }
    ])
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    harness.page.applyRecordChange({ collection: 'periods', mode: 'add', record: saved })
    assert.equal(harness.page._syncState.pendingRevisions.periods, 1)

    await harness.page.onShow()
    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page._syncState.pendingRevisions.periods, 1)
    assert.equal(harness.page.data.syncStatusText, '已保留旧经期数据')
    assert.deepEqual(renderRefreshRetry(harness.page.data), PERIODS_RETRY)

    await harness.page.retryRefresh()
    assert.deepEqual(harness.page._syncState.pendingRevisions, { periods: null, memories: null })
    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['p2', 'p1'])
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(renderRefreshRetry(harness.page.data), null)
  } finally {
    harness.teardown()
  }
})

// issue #151：同步胶囊只表达状态，不是按钮；部分失败和整页失败共用唯一一个行内重试入口
test('the sync pill stays a non-tappable status and the retry row is the only recovery entry', () => {
  const wxml = readIndexWxml()
  const pillIndex = wxml.indexOf('class="sync-pill')
  assert.ok(pillIndex !== -1, 'expected the sync status pill')
  const pillTag = wxml.slice(wxml.lastIndexOf('<view', pillIndex), wxml.indexOf('>', pillIndex) + 1)
  assert.match(pillTag, /aria-role="status"/)
  assert.doesNotMatch(pillTag, /\s(bindtap|catchtap|hover-class)=/)
  assert.match(ruleBody(readIndexWxss(), '.sync-pill'), /pointer-events:\s*none/)

  assert.equal((wxml.match(/bindtap="retryRefresh"/g) || []).length, 1)
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
    assert.deepEqual(harness.page._homeRecords.periods, [])

    harness.page._resolveLoad(secondRequest, successSnapshot([period('new', '2026-02-01')], []), false)
    assert.deepEqual(harness.page._homeRecords.periods.map(item => item._id), ['new'])
    assert.equal(harness.page.data.hasLoadedHomeData, true)
  } finally {
    harness.teardown()
  }
})

test('homepage shows TA 已加入 once when the room changes from waiting to paired', async () => {
  let status = 'waiting'
  const storage = new Map()
  const room = {
    async getVerifiedActiveRoom() {
      return { kind: 'success', bound: true, roomCode: 'ROOM01', status }
    }
  }
  const client = {
    async list() {
      return { kind: 'success', data: [] }
    }
  }
  const harness = loadPageHarness({ client, room, storage })

  try {
    await harness.page.onShow()
    assert.deepEqual(harness.toasts, [])

    status = 'paired'
    await harness.page.onShow()
    assert.deepEqual(harness.toasts, [{ title: 'TA 已加入', icon: 'none' }])

    await harness.page.onShow()
    assert.equal(harness.toasts.length, 1)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
  } finally {
    harness.teardown()
  }
})

test('paired day detail rows name who recorded them, and quiet rows stay blank', async () => {
  const periods = [
    { _id: 'p-mine', startDate: '2026-06-01', endDate: '2026-06-03', status: 'known-end', createdByMe: true },
    { _id: 'p-old', startDate: '2026-06-02', endDate: '2026-06-02', status: 'known-end' }
  ]
  const memories = [
    { _id: 'm-theirs', date: '2026-06-01', note: '散步', createdByMe: false }
  ]
  const client = {
    async list(collection) {
      return {
        kind: 'success',
        data: collection === 'periods' ? periods : memories
      }
    }
  }

  function openHarness(status) {
    return loadPageHarness({
      client,
      calendarState: 'real',
      room: {
        async getVerifiedActiveRoom() {
          return { kind: 'success', bound: true, roomCode: 'ROOM01', status }
        }
      }
    })
  }

  const paired = openHarness('paired')
  try {
    await paired.page.onShow()
    paired.page.applyHomeCalendarState({ year: 2026, month: 5, today: '2026-06-26' })
    paired.page.showDayDetail('2026-06-01')
    const first = paired.page.data.selectedDayDetail
    assert.equal(first.periods.find(item => item.key === 'period:p-mine').authorLabel, '我记的')
    assert.equal(first.memories.find(item => item.key === 'memory:m-theirs').authorLabel, 'TA 记的')

    paired.page.showDayDetail('2026-06-02')
    const second = paired.page.data.selectedDayDetail
    assert.equal(second.periods.find(item => item.key === 'period:p-old').authorLabel, undefined)

    const wxml = readIndexWxml()
    const detail = wxml.slice(wxml.indexOf("daySheetMode == 'detail'"), wxml.indexOf('compact-actions'))
    assert.match(detail, /wx:if="\{\{item\.authorLabel\}\}"/)
  } finally {
    paired.teardown()
  }

  const waiting = openHarness('waiting')
  try {
    await waiting.page.onShow()
    waiting.page.applyHomeCalendarState({ year: 2026, month: 5, today: '2026-06-26' })
    waiting.page.showDayDetail('2026-06-01')
    const detail = waiting.page.data.selectedDayDetail
    assert.ok(detail.periods.every(item => !item.authorLabel))
    assert.ok(detail.memories.every(item => !item.authorLabel))
  } finally {
    waiting.teardown()
  }
})

// issue #149：一次性配对欢迎只在首页能显示日历、且欢迎条已提交到视图层（setData 渲染回调）之后才消费。
const pairedRoom = {
  async getVerifiedActiveRoom() {
    return { kind: 'success', bound: true, roomCode: 'ROOM01', status: 'paired' }
  }
}

test('homepage consumes the one-time partner welcome only after the bar is committed to render', async () => {
  const storage = new Map([['partnerWelcome', 'pending']])
  const gate = deferredValue()
  const client = {
    async list() {
      await gate.promise
      return { kind: 'success', data: [] }
    }
  }
  const harness = loadPageHarness({ client, room: pairedRoom, storage, deferRenderCommits: true })

  try {
    harness.page.onLoad()
    const firstShow = harness.page.onShow()
    // 记录还在加载（骨架屏）：首页显示不了欢迎条，标记保持待显示
    await new Promise(resolve => setTimeout(resolve, 0))
    harness.commitRender()
    assert.equal(harness.page.data.loading, true)
    assert.equal(harness.page.data.partnerWelcome, false)
    assert.equal(storage.get('partnerWelcome'), 'pending')

    gate.resolve()
    await firstShow
    // 日历可以显示，欢迎条挂上；视图层还没回报渲染完成，标记不消费
    assert.equal(harness.page.data.partnerWelcome, true)
    assert.equal(storage.get('partnerWelcome'), 'pending')
    harness.commitRender()
    assert.equal(storage.get('partnerWelcome'), 'seen')
    assert.deepEqual(harness.toasts, [])
    assert.match(readIndexWxml(), /已和 TA 连上。经期是玫瑰色带，♥ 是欢乐时光，「预」是下次可能开始的日子。/)

    // 同一次停留里重算日历，欢迎条留在原处
    harness.page.applyHomeCalendarState()
    assert.equal(harness.page.data.partnerWelcome, true)

    // 离开首页（切 tab 或进编辑页）再回来：欢迎条只陪第一次显示它的那次停留，不再出现
    harness.page.onHide()
    await harness.page.onShow()
    harness.commitRender()
    assert.equal(harness.page.data.partnerWelcome, false)
    assert.equal(storage.get('partnerWelcome'), 'seen')
  } finally {
    harness.teardown()
  }

  // 看过的人下次进入不再出现
  const again = loadPageHarness({ client, room: pairedRoom, storage, deferRenderCommits: true })
  try {
    again.page.onLoad()
    await again.page.onShow()
    again.commitRender()
    assert.equal(again.page.data.partnerWelcome, false)
    assert.equal(storage.get('partnerWelcome'), 'seen')
  } finally {
    again.teardown()
  }
})

test('the one-time partner welcome stays pending while the homepage shows the failure screen', async () => {
  const storage = new Map([['partnerWelcome', 'pending']])
  let failing = true
  const client = {
    async list() {
      return failing ? { kind: 'retryable-failure', message: 'network down' } : { kind: 'success', data: [] }
    }
  }
  const harness = loadPageHarness({ client, room: pairedRoom, storage, deferRenderCommits: true })

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    harness.commitRender()
    assert.equal(harness.page.data.noRoom, true)
    assert.equal(harness.page.data.partnerWelcome, false)
    assert.equal(storage.get('partnerWelcome'), 'pending')

    // 之后成功显示日历时才给欢迎，并在渲染完成后消费
    failing = false
    await harness.page.onShow()
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.partnerWelcome, true)
    assert.equal(storage.get('partnerWelcome'), 'pending')
    harness.commitRender()
    assert.equal(storage.get('partnerWelcome'), 'seen')
  } finally {
    harness.teardown()
  }
})

// 6 行月份的替身：42 个空格子，几何账本按格数算行数
function sixEmptyRowsState(args) {
  return { ...buildHomeCalendarState(args), days: Array.from({ length: 42 }, () => ({ isEmpty: true })) }
}

test('the partner welcome shortens the calendar rows through the row-height ledger', async () => {
  // 375×619 页高、顶栏 84px（拿不到胶囊时的兜底）、清爽密度、6 行、当月：首屏其余部分 394rpx = 197px 加 6px 边框。
  // 不带欢迎 (619 − 84 − 203) / 6 = 55.33，放不下常规清爽格的 69px，信息行合并（合并格最少 50px）；
  // 带欢迎多占 103.2rpx = 51.6px，(619 − 84 − 254.6) / 6 = 46.73 也放不下合并格：行高停在 50，记录入口靠滚动触达
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [] },
      { kind: 'success', data: [] },
      { kind: 'success', data: [] },
      { kind: 'success', data: [] }
    ]),
    room: pairedRoom,
    storage: new Map([['partnerWelcome', 'pending']]),
    calendarState: sixEmptyRowsState
  })

  try {
    global.wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: 619 })
    assert.equal(harness.page.data.navBarHeight, 84)
    harness.page.onLoad()
    assert.equal(harness.page.data.showBackToToday, false)
    assert.equal(harness.page.data.calendarRowHeightPx, 55.33)
    assert.equal(harness.page.data.calendarInfoMerged, true)

    await harness.page.onShow()
    assert.equal(harness.page.data.partnerWelcome, true)
    assert.equal(harness.page.data.calendarRowHeightPx, 50)
    assert.equal(harness.page.data.calendarInfoMerged, true)

    // 之后重算日历（翻月、刷新）仍把欢迎条计入
    harness.page.applyHomeCalendarState()
    assert.equal(harness.page.data.calendarRowHeightPx, 50)

    // 离开首页再回来：欢迎条收起，账本去掉它的 103.2rpx，行高回到 55.33
    harness.page.onHide()
    await harness.page.onShow()
    assert.equal(harness.page.data.partnerWelcome, false)
    assert.equal(harness.page.data.calendarRowHeightPx, 55.33)
  } finally {
    harness.teardown()
    delete require.cache[require.resolve(safeAreaPath)]
  }
})

// issue #153：在设置页换密度后回到首页，记录没变也要按新密度重算行高与信息行，不能沿用旧密度的行高
test('switching density in settings resizes the calendar rows on return even when no records change', async () => {
  // 375×619、顶栏 84、6 行、当月：原始行高 55.33。完整密度格内容最少 159rpx = 79.5px，行高停在 79.5、不合并；
  // 切回清爽密度后合并信息行，行高回到 55.33
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  let storedDensity = 'full'
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [] },
      { kind: 'success', data: [] },
      { kind: 'success', data: [] },
      { kind: 'success', data: [] }
    ]),
    calendarState: sixEmptyRowsState
  })

  try {
    global.wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: 619 })
    global.wx.getStorageSync = key => (key === 'calendarDensity' ? storedDensity : '')
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.calendarDensity, 'full')
    assert.equal(harness.page.data.calendarRowHeightPx, 79.5)
    assert.equal(harness.page.data.calendarInfoMerged, false)

    // 密度类名与行高同一次提交，不等后台刷新回来
    storedDensity = 'compact'
    const shown = harness.page.onShow()
    assert.equal(harness.page.data.calendarDensity, 'compact')
    assert.equal(harness.page.data.calendarRowHeightPx, 55.33)
    assert.equal(harness.page.data.calendarInfoMerged, true)
    await shown
    assert.equal(harness.page.data.calendarRowHeightPx, 55.33)
  } finally {
    harness.teardown()
    delete require.cache[require.resolve(safeAreaPath)]
  }
})

// issue #153：行内同步重试行（#79 / #151）在文档流里占 96rpx，出现时从日历行里让出，消失后还回来
test('the inline sync-retry row takes its height from the calendar rows and gives it back once cleared', async () => {
  // 375×619、顶栏 84、清爽密度、6 行、当月：不带重试行 55.33（合并信息行）；
  // 带重试行多占 96rpx = 48px，(619 − 84 − 251) / 6 = 47.33 放不下合并格的 50px，行高停在 50
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [] },
      { kind: 'retryable-failure', message: 'memories network down' },
      { kind: 'success', data: [] },
      { kind: 'success', data: [] },
      { kind: 'retryable-failure', message: 'network down' },
      { kind: 'retryable-failure', message: 'network down' }
    ]),
    calendarState: sixEmptyRowsState
  })

  try {
    global.wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: 619 })
    harness.page.onLoad()
    // 首次加载只有欢乐时光失败：日历照常显示，重试行同时出现
    await harness.page.onShow()
    assert.deepEqual(renderRefreshRetry(harness.page.data), MEMORIES_RETRY)
    assert.equal(harness.page.data.calendarRowHeightPx, 50)

    await harness.page.retryRefresh()
    assert.equal(renderRefreshRetry(harness.page.data), null)
    assert.equal(harness.page.data.calendarRowHeightPx, 55.33)

    // 已显示的日历后台刷新整体失败：重试行回来，行高再让出
    await harness.page.onShow()
    assert.deepEqual(renderRefreshRetry(harness.page.data), FULL_REFRESH_RETRY)
    assert.equal(harness.page.data.calendarRowHeightPx, 50)
  } finally {
    harness.teardown()
    delete require.cache[require.resolve(safeAreaPath)]
  }
})

function loadPageHarness({ client, calendarState, room, storage, deferRenderCommits = false } = {}) {
  const absolutePagePath = path.join(repoRoot, 'pages/index/index.js')
  const absoluteMocks = new Map([
    [path.join(repoRoot, 'utils/cloud.js'), { createRoomDataClient: () => client }],
    [path.join(repoRoot, 'utils/util.js'), createUtilStub()]
  ])
  if (room) {
    absoluteMocks.set(path.join(repoRoot, 'utils/room.js'), room)
  }
  const toastLog = []
  const memory = storage || null
  if (typeof calendarState === 'function') {
    absoluteMocks.set(path.join(repoRoot, 'utils/homeCalendarState.js'), { buildHomeCalendarState: calendarState })
  } else if (calendarState !== 'real') {
    absoluteMocks.set(path.join(repoRoot, 'utils/homeCalendarState.js'), { buildHomeCalendarState })
  }
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = {
    getStorageSync(key) {
      if (!memory) return ''
      return memory.get(key) || ''
    },
    setStorageSync(key, value) {
      if (memory) memory.set(key, value)
    },
    removeStorageSync(key) {
      if (memory) memory.delete(key)
    },
    showToast(options) {
      toastLog.push(options)
    },
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

  // deferRenderCommits：setData 的渲染回调先排队，commitRender() 模拟视图层渲染完成后按序回调
  const pendingRenders = []
  const page = {
    data: { ...(registered.data || {}) },
    setData(update, callback) {
      this.data = { ...this.data, ...update }
      if (typeof callback !== 'function') return
      if (deferRenderCommits) pendingRenders.push(callback)
      else callback()
    }
  }
  for (const [key, value] of Object.entries(registered)) {
    if (key !== 'data') page[key] = typeof value === 'function' ? value.bind(page) : value
  }
  return {
    page,
    toasts: toastLog,
    commitRender() {
      while (pendingRenders.length) pendingRenders.shift()()
    },
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

test('homepage places quick record actions after the calendar grid and before the month summary', () => {
  const wxml = readIndexWxml()
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const summaryIndex = wxml.indexOf('class="month-summary"')

  assert.ok(gridIndex !== -1, 'expected the calendar grid')
  assert.ok(quickIndex !== -1, 'expected quick record actions')
  assert.ok(summaryIndex !== -1, 'expected the month summary row')
  assert.ok(gridIndex < quickIndex, 'record actions should directly follow the calendar grid')
  assert.ok(quickIndex < summaryIndex, 'record actions should precede the month summary')
})

test('homepage render data omits record arrays and the per-day detail map', async () => {
  const periodRecord = {
    _id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    duration: 3,
    note: '经期备注甲'
  }
  const memoryRecord = { _id: 'm1', date: '2026-06-04', note: '只有四号的备注' }
  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [periodRecord] },
      { kind: 'success', data: [memoryRecord] }
    ]),
    calendarState({ periods = [], memories = [] }) {
      return {
        days: [
          { date: '2026-06-01', isEmpty: false, isPeriod: periods.length > 0, isMemory: false },
          { date: '2026-06-04', isEmpty: false, isPeriod: false, isMemory: memories.length > 0 }
        ],
        dayDetailsByDate: {
          '2026-06-01': {
            meanings: [],
            periods: periods.length ? [{ key: 'period:p1', range: '2026-06-01 ~ 2026-06-03' }] : [],
            memories: [],
            empty: periods.length === 0
          },
          '2026-06-04': {
            meanings: [],
            periods: [],
            memories: memories.length ? [{ key: 'memory:m1', note: '只有四号的备注' }] : [],
            empty: memories.length === 0
          }
        },
        nextPredict: null,
        cycleReminders: [],
        monthlyRecap: null
      }
    }
  })

  try {
    harness.page.onLoad()
    await harness.page.onShow()

    assert.equal(harness.page.data.periods, undefined)
    assert.equal(harness.page.data.memories, undefined)
    assert.equal(harness.page.data.dayDetailsByDate, undefined)
    assert.equal(harness.page.data.periodCount, undefined)
    assert.equal(harness.page.data.hasRecords, true)
    assert.equal(harness.page.data.days.find((day) => day.date === '2026-06-01').isPeriod, true)
    assert.equal(harness.page.data.days.find((day) => day.date === '2026-06-04').isMemory, true)
    assert.doesNotMatch(JSON.stringify(harness.page.data), /"_id":"p1"/)
    assert.doesNotMatch(JSON.stringify(harness.page.data), /"_id":"m1"/)
    assert.doesNotMatch(JSON.stringify(harness.page.data), /经期备注甲/)

    harness.page.showDayDetail('2026-06-04')
    assert.equal(harness.page.data.selectedDayDetail.memories[0].note, '只有四号的备注')
    assert.equal(harness.page.data.dayDetailsByDate, undefined)
    assert.doesNotMatch(JSON.stringify(harness.page.data), /经期备注甲/)

    harness.page.showDayDetail('2026-06-01')
    assert.equal(harness.page.data.selectedDayDetail.memories.length, 0)
    assert.equal(harness.page.data.selectedDayDetail.periods.length, 1)
    assert.doesNotMatch(JSON.stringify(harness.page.data.selectedDayDetail), /只有四号的备注/)
    assert.equal(harness.page._dayDetailsByDate['2026-06-04'].memories[0].note, '只有四号的备注')

    const wxml = readIndexWxml()
    assert.match(wxml, /class="month-summary-text">本月 经期 \{\{monthPeriodDays\}\} 天 · 欢乐时光 \{\{monthMemoryCount\}\} 条 ›<\/text>/)
    assert.doesNotMatch(wxml, /periodCount|status-card|stat-label">经期记录/)
    assert.doesNotMatch(wxml, /periods\.length|memories\.length|dayDetailsByDate/)
  } finally {
    harness.teardown()
  }
})

test('homepage shows a first-record guide instead of the month summary when the room has no records', async () => {
  const wxml = readIndexWxml()

  assert.match(wxml, /wx:if="\{\{hasRecords\}\}"[\s\S]*class="month-summary"/)
  assert.match(wxml, /wx:if="\{\{!hasRecords\}\}" class="empty-guide"/)
  // issue #152：未来日期不能新增记录，空态只引导到今天或过去的一天，不再说「任意一天」
  assert.match(wxml, /class="empty-guide-text">点今天或过去的一天开始记录</)
  assert.doesNotMatch(wxml, /任意一天/)

  const harness = loadPageHarness({
    client: createQueuedClient([
      { kind: 'success', data: [] },
      { kind: 'success', data: [] }
    ])
  })
  try {
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.noRoom, false)
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.hasRecords, false)
  } finally {
    harness.teardown()
  }
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

test('homepage status line and month summary sit above full-width reminder rows', () => {
  const wxml = readIndexWxml()
  const sticky = wxml.slice(wxml.indexOf('class="home-sticky"'), wxml.indexOf('class="home-sticky-spacer'))
  const summary = wxml.indexOf('class="month-summary"')
  const ongoing = wxml.indexOf('onOngoingReminderTap')
  const cycleReminder = wxml.indexOf('onReminderTap')

  assert.match(sticky, /class="month-nav"/)
  assert.match(sticky, /wx:if="\{\{showBackToToday\}\}"/)
  assert.match(sticky, /class="back-today"/)
  assert.match(sticky, /bindtap="openPredictionSheet"/)
  assert.match(sticky, /class="home-status-text">\{\{homeStatus\.text\}\}<\/text>/)
  assert.doesNotMatch(sticky, /month-menu-trigger|nav-placeholder/)
  assert.ok(summary !== -1 && summary < ongoing && ongoing < cycleReminder)
  assert.doesNotMatch(wxml, /status-card|status-reminders|stat-label">经期记录/)
  assert.match(wxml, /predictionExplanation\.summary/)
  assert.match(wxml, /predictionExplanation\.lineItems/)
})

test('homepage drops the period record count', () => {
  const wxml = readIndexWxml()
  assert.doesNotMatch(wxml, /periodCount|stat-num|stat-label">经期记录/)
  assert.doesNotMatch(wxml, /goPeriodList|goMemoryList/)
})

test('status line opens the existing prediction sheet without leaving the home page', () => {
  const wxml = readIndexWxml()
  const sticky = wxml.slice(wxml.indexOf('class="home-status'), wxml.indexOf('class="home-sticky-spacer'))

  assert.match(sticky, /bindtap="openPredictionSheet"[\s\S]*?aria-role="button"/)
  assert.match(sticky, /aria-label="\{\{homeStatus\.text\}\}"/)
  assert.doesNotMatch(sticky, /disabled|goPeriodList/)

  assert.match(wxml, /predictionExplanation\.title/)
  assert.match(wxml, /predictionExplanation\.summary/)
  assert.match(wxml, /predictionExplanation\.lineItems/)
  assert.match(wxml, /class="sheet-subtitle">\{\{year\}\}年\{\{month \+ 1\}\}月<\/text>/)

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

test('viewed records supply the status line, the month summary, and back-to-today', async () => {
  const harness = loadPageHarness({
    calendarState: 'real',
    client: createQueuedClient([
      {
        kind: 'success',
        data: [
          { _id: 'p1', startDate: '2026-05-18', endDate: '2026-05-22', status: 'known-end' },
          { _id: 'p2', startDate: '2026-06-15', endDate: '2026-06-19', status: 'known-end' },
          { _id: 'p3', startDate: '2026-06-24', endDate: '', status: 'ongoing' }
        ]
      },
      { kind: 'success', data: [{ _id: 'm1', date: '2026-06-04', note: '散步' }] }
    ])
  })
  try {
    harness.page.onLoad()
    await harness.page.onShow()
    harness.page.applyHomeCalendarState({ year: 2026, month: 5, today: '2026-06-26' })

    assert.equal(harness.page.data.homeStatus.text, '经期第 3 天')
    assert.equal(harness.page.data.homeStatus.tone, 'default')
    assert.equal(harness.page.data.monthPeriodDays, 8)
    assert.equal(harness.page.data.monthMemoryCount, 1)
    assert.equal(harness.page.data.showBackToToday, true)

    harness.page.openMonthlyRecap()
    assert.equal(harness.page.data.infoSheetMode, 'recap')
    assert.equal(harness.page.data.infoSheetVisible, true)

    harness.page.jumpToToday()
    assert.equal(harness.page.data.showBackToToday, false)
  } finally {
    harness.teardown()
  }
})

test('homepage quick period action names the ongoing day and opens that record ended today', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    const wxml = readIndexWxml()
    assert.match(wxml, /aria-label="\{\{periodQuickAriaLabel\}\}"/)
    assert.match(wxml, /class="quick-text">\{\{periodQuickLabel\}\}/)
    assert.equal(harness.page.data.periodQuickLabel, '记经期')

    // 已有进行中记录：按钮写成第 N 天，点开那条记录并预选已结束、结束日为今天
    harness.page.applyHomeCalendarState({
      periods: [
        { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 },
        { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
      ],
      today: '2026-06-26'
    })
    assert.equal(harness.page.data.periodQuickLabel, '经期第 7 天 · 记结束')
    assert.equal(harness.page.data.periodQuickAriaLabel, '经期第 7 天 · 记结束')
    harness.page.quickPeriod()
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&endDate=2026-06-26&status=known-end'
    ])

    // 没有进行中记录：回到「记经期」，进入只带开始日期的新增表单
    harness.page.applyHomeCalendarState({
      periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }],
      today: '2026-06-26'
    })
    assert.equal(harness.page.data.periodQuickLabel, '记经期')
    assert.equal(harness.page.data.periodQuickAriaLabel, '记经期')
    harness.page.quickPeriod()
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&endDate=2026-06-26&status=known-end',
      '/pages/period/edit/edit?startDate=2026-06-26'
    ])
  } finally {
    harness.teardown()
  }
})

// issue #100：日历日动作 sheet 的「记经期」与快捷入口同一决策——
// 房间已有进行中记录时打开那条记录，否则按所选日期新增（默认状态由路由按开始日期推导）
test('calendar day period action reopens the ongoing record or creates for the selected date', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)

    // 已有进行中记录：从日历选过去某天点「记经期」，打开那条进行中记录
    harness.page._homeRecords = {
      periods: [
        { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 },
        { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
      ],
      memories: []
    }
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-01' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing'])

    // 没有进行中记录：按所选日期新增；URL 不带状态与结束日期，由路由推导为已结束且结束日留空
    harness.page.applyHomeCalendarState({
      periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 }],
      today: '2026-06-26'
    })
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

test('home period entries share one record decision and the same ongoing notice', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    const toasts = []
    global.wx.navigateTo = options => navigation.push(options.url)
    global.wx.showToast = options => toasts.push(options)
    const notice = { title: '已有进行中的经期，继续编辑它', icon: 'none' }
    const ongoing = { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
    const finished = { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }

    harness.page.applyHomeCalendarState({
      periods: [finished, ongoing],
      today: '2026-06-26'
    })
    harness.page.quickPeriod()
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-03' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.setData({
      cycleReminders: [{ type: 'due', action: 'quickPeriod', date: '2026-06-26' }]
    })
    harness.page.onReminderTap({ currentTarget: { dataset: { index: 0 } } })

    assert.deepEqual(toasts, [notice, notice, notice])
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&endDate=2026-06-26&status=known-end',
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing',
      '/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing'
    ])

    navigation.length = 0
    toasts.length = 0
    harness.page.applyHomeCalendarState({
      periods: [finished],
      today: '2026-06-26'
    })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-03' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-10' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.quickPeriod()
    harness.page.setData({
      cycleReminders: [{ type: 'due', action: 'quickPeriod', date: '2026-06-04' }]
    })
    harness.page.onReminderTap({ currentTarget: { dataset: { index: 0 } } })

    assert.deepEqual(toasts, [])
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end',
      '/pages/period/edit/edit?startDate=2026-06-10',
      '/pages/period/edit/edit?startDate=2026-06-26',
      '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end'
    ])
  } finally {
    harness.teardown()
  }
})

// issue #100：晚于今天的日期不提供可用的「记经期」——动作 sheet 隐藏该入口（DESIGN.md 已登记），
// 处理器侧保留不导航的兜底防线；编辑页日期上限与保存校验仍是最后防线
test('calendar day period action is not usable for future dates', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page._homeRecords = { periods: [], memories: [] }

    // 未来日期（harness 今天固定为 2026-06-26）：入口被标记隐藏，直接触发处理器也不导航
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-30' } } })
    assert.equal(harness.page.data.selectedDateIsFuture, true)
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'memory' } } })
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

test('day sheet record actions are the detail action list and not a view-detail menu', () => {
  const wxml = readIndexWxml()
  assert.match(wxml, /wx:for="\{\{selectedDayDetail\.actions\}\}"/)
  assert.match(wxml, /bindtap="onDayRecordTap"/)
  assert.doesNotMatch(wxml, /查看详情/)
  assert.doesNotMatch(wxml, /data-action="detail"/)
})

function daySheetDetail(overrides = {}) {
  return {
    meanings: [],
    periods: [],
    memories: [],
    actions: [],
    empty: true,
    ...overrides
  }
}

function loadDaySheetHarness() {
  return loadPageHarness({
    client: createQueuedClient([]),
    calendarState() {
      return {
        days: [
          { date: '2026-06-03', isEmpty: false },
          { date: '2026-06-10', isEmpty: false },
          { date: '2026-06-19', isEmpty: false, lunarText: '五月初五', holidayName: '端午' },
          { date: '2026-06-20', isEmpty: false },
          { date: '2026-06-26', isEmpty: false },
          { date: '2026-10-01', isEmpty: false, lunarText: '八月廿一', holidayName: '国庆' }
        ],
        dayDetailsByDate: {
          '2026-06-03': daySheetDetail({
            periods: [{ key: 'period:p1', recordId: 'p1', range: '6月1日–6月5日', metaText: '' }],
            actions: [
              { key: 'period', label: '编辑这次经期' },
              { key: 'memory', label: '补记欢乐时光' }
            ],
            empty: false
          }),
          '2026-06-10': daySheetDetail({
            actions: [
              { key: 'period', label: '补记经期' },
              { key: 'memory', label: '补记欢乐时光' }
            ]
          }),
          '2026-06-19': daySheetDetail({
            meanings: [{ key: 'holiday', title: '节日', text: '端午。' }],
            actions: [
              { key: 'period', label: '补记经期' },
              { key: 'memory', label: '补记欢乐时光' }
            ],
            empty: false
          }),
          '2026-06-20': daySheetDetail({
            memories: [{ key: 'memory:m1', recordId: 'm1', note: '散步' }],
            actions: [
              { key: 'period', label: '补记经期' },
              { key: 'memory', label: '补记欢乐时光' }
            ],
            empty: false
          }),
          '2026-06-26': daySheetDetail({
            actions: [
              { key: 'period', label: '记经期' },
              { key: 'memory', label: '记欢乐时光' }
            ]
          }),
          '2026-10-01': daySheetDetail({
            meanings: [{ key: 'holiday', title: '节日', text: '国庆。' }]
          })
        }
      }
    }
  })
}

test('a recorded day opens its detail and a blank day opens dated actions', () => {
  const harness = loadDaySheetHarness()
  try {
    harness.page.applyHomeCalendarState({
      year: 2026,
      month: 5,
      periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }],
      memories: [{ _id: 'm1', date: '2026-06-20', note: '散步' }],
      today: '2026-06-26'
    })

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-03' } } })
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.dayDetailFade, false)
    assert.equal(harness.page.data.selectedDateLabel, '6月3日 周三')
    assert.equal(harness.page.data.selectedDayDetail.periods[0].recordId, 'p1')

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-20' } } })
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.dayDetailFade, false)
    assert.equal(harness.page.data.selectedDayDetail.memories[0].recordId, 'm1')

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-10' } } })
    assert.equal(harness.page.data.daySheetMode, 'actions')
    assert.equal(harness.page.data.dayDetailFade, false)
    assert.deepEqual(harness.page.data.selectedDayDetail.actions, [
      { key: 'period', label: '补记经期' },
      { key: 'memory', label: '补记欢乐时光' }
    ])

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-26' } } })
    assert.equal(harness.page.data.daySheetMode, 'actions')
    assert.deepEqual(
      harness.page.data.selectedDayDetail.actions.map(item => item.label),
      ['记经期', '记欢乐时光']
    )

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-19' } } })
    assert.equal(harness.page.data.selectedDateLabel, '6月19日 周五')
    assert.equal(harness.page.data.selectedDateSubtitle, '五月初五 · 端午')
  } finally {
    harness.teardown()
  }
})

test('tapping a day detail row opens that record in the editor', () => {
  const harness = loadDaySheetHarness()
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.applyHomeCalendarState({
      year: 2026,
      month: 5,
      periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }],
      memories: [{ _id: 'm1', date: '2026-06-20', note: '散步' }],
      today: '2026-06-26'
    })

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-03' } } })
    harness.page.onDayRecordTap({ currentTarget: { dataset: { kind: 'period', id: 'p1' } } })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-20' } } })
    harness.page.onDayRecordTap({ currentTarget: { dataset: { kind: 'memory', id: 'm1' } } })

    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end',
      `/pages/memory/edit/edit?id=m1&date=2026-06-20&note=${encodeURIComponent('散步')}`
    ])
  } finally {
    harness.teardown()
  }
})

// issue #157：同一天多条经期和欢乐时光时，详情行的读屏名各自可辨。名称由日历投影提供、模板只绑定；
// 作者只在房间已配对时出现，空白备注不留多余标点；可见行不新增元数据
test('day detail rows read out distinct names for same-day records, naming the author only when paired', async () => {
  const periods = [
    { _id: 'p-mine', startDate: '2026-06-01', endDate: '2026-06-03', status: 'known-end', createdByMe: true },
    { _id: 'p-theirs', startDate: '2026-06-02', endDate: '2026-06-02', status: 'known-end', createdByMe: false }
  ]
  const memories = [
    { _id: 'm-theirs', date: '2026-06-02', note: '散步', createdByMe: false },
    { _id: 'm-blank', date: '2026-06-02', note: '', createdByMe: true }
  ]
  const client = {
    async list(collection) {
      return { kind: 'success', data: collection === 'periods' ? periods : memories }
    }
  }

  const wxml = readIndexWxml()
  const detailList = wxml.slice(wxml.indexOf("daySheetMode == 'detail'"), wxml.indexOf('compact-actions'))
  const rowNameBinding = kind => {
    const at = detailList.indexOf(`data-kind="${kind}"`)
    const tag = detailList.slice(detailList.lastIndexOf('<view', at), detailList.indexOf('>', at))
    const binding = /aria-label="\{\{([^}]+)\}\}"/.exec(tag)
    assert.ok(binding, `${kind} detail row binds a screen-reader name from the row data`)
    return item => evaluateWxmlExpression(binding[1], { item })
  }
  const periodName = rowNameBinding('period')
  const memoryName = rowNameBinding('memory')
  // 读屏名只进 aria-label，不作为可见文字渲染
  assert.equal(
    (detailList.match(/ariaLabel/g) || []).length,
    (detailList.match(/aria-label="\{\{item\.ariaLabel\}\}"/g) || []).length
  )

  async function namesFor(status) {
    const harness = loadPageHarness({
      client,
      calendarState: 'real',
      room: {
        async getVerifiedActiveRoom() {
          return { kind: 'success', bound: true, roomCode: 'ROOM01', status }
        }
      }
    })
    try {
      await harness.page.onShow()
      harness.page.applyHomeCalendarState({ year: 2026, month: 5, today: '2026-06-26' })
      harness.page.showDayDetail('2026-06-02')
      const detail = harness.page.data.selectedDayDetail
      return [...detail.periods.map(periodName), ...detail.memories.map(memoryName)]
    } finally {
      harness.teardown()
    }
  }

  assert.deepEqual(await namesFor('paired'), [
    '编辑经期，6月1日–6月3日，已结束，我记的',
    '编辑经期，6月2日–6月2日，已结束，TA 记的',
    '编辑欢乐时光，6月2日，散步，TA 记的',
    '编辑欢乐时光，6月2日，我记的'
  ])
  assert.deepEqual(await namesFor('waiting'), [
    '编辑经期，6月1日–6月3日，已结束',
    '编辑经期，6月2日–6月2日，已结束',
    '编辑欢乐时光，6月2日，散步',
    '编辑欢乐时光，6月2日'
  ])
})

test('a period day action edits the covering record instead of creating an overlap', () => {
  const harness = loadDaySheetHarness()
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.applyHomeCalendarState({
      year: 2026,
      month: 5,
      periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }],
      today: '2026-06-26'
    })
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-03' } } })
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.selectedDayDetail.actions[0].label, '编辑这次经期')
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    assert.deepEqual(navigation, [
      '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end'
    ])
  } finally {
    harness.teardown()
  }
})

test('a future day keeps holiday information and offers no record actions', () => {
  const harness = loadDaySheetHarness()
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.applyHomeCalendarState({})
    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-10-01' } } })
    assert.equal(harness.page.data.daySheetMode, 'actions')
    assert.equal(harness.page.data.selectedDateIsFuture, true)
    assert.equal(harness.page.data.selectedDateLabel, '10月1日 周四')
    assert.equal(harness.page.data.selectedDateSubtitle, '八月廿一 · 国庆')
    assert.deepEqual(harness.page.data.selectedDayDetail.actions, [])
    assert.deepEqual(
      harness.page.data.selectedDayDetail.meanings.map(item => item.text),
      ['国庆。']
    )
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'memory' } } })
    harness.page.onDayRecordTap({ currentTarget: { dataset: { kind: 'memory', id: 'm-future' } } })
    assert.deepEqual(navigation, [])
  } finally {
    harness.teardown()
  }
})

// 模板片段里 marker 处会不会渲染：包住它的每一层 wx:if 都按真实页面数据求值为真
function wxmlRendersAt(fragment, marker, data) {
  const source = fragment.replace(/<!--[\s\S]*?-->/g, '')
  const at = source.indexOf(marker)
  assert.ok(at !== -1, `expected ${marker} in the template`)
  const conditions = []
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g
  let match
  while ((match = tagPattern.exec(source)) && match.index < at) {
    if (match[1]) {
      conditions.pop()
      continue
    }
    if (match[4]) continue
    const condition = /\swx:if="\{\{([\s\S]*?)\}\}"/.exec(match[3])
    conditions.push(condition ? condition[1] : '')
  }
  return conditions.every(expr => !expr || Boolean(evaluateWxmlExpression(expr, data)))
}

// issue #152：普通未来日期的当日弹层不再只剩标题和关闭键。真实日历投影给出持久说明，弹层模板渲染它；
// 节日和调休句照常显示。今天与过去的日子仍是记录动作，没有这句说明。
// harness 的 util 桩把任何 Date 都格式化成固定的今天，预测窗口在这里算不准；未来「预」由 home-calendar-state 覆盖
test('a future day sheet explains why it cannot be recorded while today and past days keep their actions', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]), calendarState: 'real' })
  const wxml = readIndexWxml()
  const sheetStart = wxml.lastIndexOf('<view', wxml.indexOf('wx:if="{{dayActionMounted}}"'))
  const daySheet = wxml.slice(sheetStart, wxml.indexOf('wx:if="{{monthMenuMounted}}"'))
  const futureNotice = { title: '未来日期不能新增记录', text: '到了这一天，再来记经期或欢乐时光' }
  const renderedNotice = () => {
    const data = harness.page.data
    if (!wxmlRendersAt(daySheet, '{{selectedDayDetail.futureNotice.title}}', data)) return null
    assert.ok(wxmlRendersAt(daySheet, '{{selectedDayDetail.futureNotice.text}}', data))
    return {
      title: evaluateWxmlExpression('selectedDayDetail.futureNotice.title', data),
      text: evaluateWxmlExpression('selectedDayDetail.futureNotice.text', data)
    }
  }
  const tapDay = date => harness.page.onDayTap({ currentTarget: { dataset: { date } } })
  try {
    const navigation = []
    global.wx.navigateTo = options => navigation.push(options.url)
    harness.page.applyHomeCalendarState({ year: 2026, month: 5, periods: [], memories: [], today: '2026-06-26' })

    // 普通未来日期（harness 今天固定为 2026-06-26）：弹层照常打开，只有说明，没有记录动作
    tapDay('2026-06-30')
    assert.equal(harness.page.data.dayActionMounted, true)
    assert.equal(harness.page.data.daySheetMode, 'actions')
    assert.equal(harness.page.data.selectedDateIsFuture, true)
    assert.deepEqual(harness.page.data.selectedDayDetail.meanings, [])
    assert.deepEqual(harness.page.data.selectedDayDetail.actions, [])
    assert.deepEqual(renderedNotice(), futureNotice)
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'period' } } })
    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'memory' } } })

    // 今天与过去的日子：记录动作还在，没有这句说明
    tapDay('2026-06-26')
    assert.equal(harness.page.data.selectedDateIsFuture, false)
    assert.deepEqual(harness.page.data.selectedDayDetail.actions.map(item => item.label), ['记经期', '记欢乐时光'])
    assert.equal(renderedNotice(), null)
    tapDay('2026-06-10')
    assert.deepEqual(harness.page.data.selectedDayDetail.actions.map(item => item.label), ['补记经期', '补记欢乐时光'])
    assert.equal(renderedNotice(), null)

    // 未来的节日与调休：句子照常显示，同样只有说明
    harness.page.applyHomeCalendarState({ year: 2026, month: 8 })
    tapDay('2026-09-25')
    assert.equal(harness.page.data.selectedDateSubtitle, '八月十五 · 中秋')
    assert.deepEqual(harness.page.data.selectedDayDetail.meanings.map(item => item.text), ['中秋。'])
    assert.deepEqual(harness.page.data.selectedDayDetail.actions, [])
    assert.deepEqual(renderedNotice(), futureNotice)
    tapDay('2026-09-20')
    assert.deepEqual(harness.page.data.selectedDayDetail.meanings.map(item => item.text), ['官方调休上班日。'])
    assert.deepEqual(renderedNotice(), futureNotice)

    assert.deepEqual(navigation, [])
  } finally {
    harness.teardown()
  }
})

// issue #129：超期完成提醒不在渲染时记为已提醒。刷新仍可见；离开首页后才持久化，回来不再出现。
test('an overdue completion reminder stays visible until the home page is left', async () => {
  const ongoing = { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
  const client = createQueuedClient([
    { kind: 'success', data: [ongoing] },
    { kind: 'success', data: [] },
    { kind: 'success', data: [{ ...ongoing }] },
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
    assert.deepEqual(markerWrites, [], 'showing the reminder must not mark it seen')

    await harness.page.onShow()
    assert.equal(harness.page.data.ongoingCompletionReminder.recordKey, 'p2')
    assert.deepEqual(markerWrites, [])

    harness.page.onHide()
    assert.deepEqual(markerWrites, ['p2'])
    assert.equal(storedMarker, 'p2')

    await harness.page.onShow()
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(markerWrites, ['p2'])
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
    assert.deepEqual(markerWrites, [], 'a newly shown reminder waits until the page is left')
    harness.page.onHide()
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
    harness.page.onHide()
    assert.deepEqual(markerWrites, [], 'leaving without a reminder does not mark anything seen')

    // 记录被补填结束日期完成（经编辑页保存回流）：没有进行中记录，同样没有提示
    harness.page.applyRecordChange({
      collection: 'periods',
      mode: 'upsert',
      record: { _id: 'p2', startDate: '2026-06-24', endDate: '2026-06-26', status: 'known-end', duration: 3 }
    })
    assert.equal(harness.page.data.ongoingCompletionReminder, null)
    assert.deepEqual(harness.page._homeRecords.periods[0].endDate, '2026-06-26')
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
    const markerWrites = []
    global.wx.getStorageSync = () => ''
    global.wx.setStorageSync = (key, value) => {
      if (key === 'ongoingPeriodReminderShown') markerWrites.push(value)
    }
    global.wx.navigateTo = options => navigation.push(options.url)

    harness.page.onLoad()
    await harness.page.onShow()
    assert.ok(harness.page.data.ongoingCompletionReminder)
    assert.deepEqual(markerWrites, [])

    harness.page.onOngoingReminderTap()
    assert.deepEqual(markerWrites, ['p9'])
    assert.deepEqual(navigation, ['/pages/period/edit/edit?id=p9&startDate=2026-06-18&status=ongoing'])

    // 点击只打开原记录：不写结束日期、不关闭状态
    assert.equal(harness.page._homeRecords.periods[0].endDate, '')
    assert.equal(harness.page._homeRecords.periods[0].status, 'ongoing')
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

  const summaryIndex = wxml.indexOf('class="month-summary"')
  const cycleReminderIndex = wxml.indexOf('onReminderTap')
  assert.ok(summaryIndex !== -1 && summaryIndex < gateIndex, 'the completion reminder follows the month summary')
  assert.equal(wxml.includes('status-card'), false, 'reminders are not nested in a status card')
  assert.ok(cycleReminderIndex !== -1 && cardIndex < cycleReminderIndex, 'reminder row sits before the cycle reminders')

  // 样式复用周期提醒卡，不新增视觉系统；无新增 wxss 规则要求
  const wxss = readIndexWxss()
  assert.match(ruleBody(wxss, '.reminder-card'), /min-height:\s*88rpx/)
})

test('status line and month summary press with the shared scale-down and reduced-motion policy', () => {
  const wxss = readIndexWxss()

  assert.match(wxss, /\.home-status:active,\s*\.home-status\.home-status-hover\s*\{[^}]*transform:\s*scale\(0\.98\)/)
  assert.match(wxss, /\.month-summary:active,\s*\.month-summary\.month-summary-hover\s*\{[^}]*transform:\s*scale\(0\.98\)/)
  const reduced = wxss.slice(wxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.home-status\b/)
  assert.match(reduced, /\.month-summary\b/)
})

test('homepage stacks navbar tools, sticky month and status, calendar, record actions, summary, then the empty guide', () => {
  const wxml = readIndexWxml()
  const navIndex = wxml.indexOf('class="nav-tool"')
  const stickyIndex = wxml.indexOf('class="home-sticky"')
  const monthNavIndex = wxml.indexOf('class="month-nav"')
  const statusIndex = wxml.indexOf('class="home-status')
  const weekHeaderIndex = wxml.indexOf('class="week-header"')
  const gridIndex = wxml.indexOf('class="calendar-grid')
  const quickIndex = wxml.indexOf('class="quick-actions"')
  const summaryIndex = wxml.indexOf('class="month-summary"')
  const emptyGuideIndex = wxml.indexOf('class="empty-guide"')

  assert.ok(navIndex !== -1 && stickyIndex !== -1 && monthNavIndex !== -1, 'expected the navbar tool and sticky month nav')
  assert.ok(weekHeaderIndex !== -1 && gridIndex !== -1, 'expected the week header and calendar grid')
  assert.ok(quickIndex !== -1 && summaryIndex !== -1 && emptyGuideIndex !== -1, 'expected quick actions, the summary, and the empty guide')
  assert.ok(navIndex < stickyIndex && stickyIndex < monthNavIndex && monthNavIndex < statusIndex)
  assert.ok(statusIndex < weekHeaderIndex, 'the status line stays with the sticky month nav, above the calendar')
  assert.match(wxml, /class="home-sticky"[\s\S]*position:\s*fixed|class="home-sticky"/)
  assert.ok(weekHeaderIndex < gridIndex, 'week header sits directly above the calendar grid')
  assert.ok(gridIndex < quickIndex, 'record actions directly follow the calendar grid')
  assert.ok(quickIndex < summaryIndex, 'the month summary follows the record actions')
  assert.ok(summaryIndex < emptyGuideIndex, 'the empty-state guide follows the summary slot')

  // issue #105：低频工具收进月份菜单、列表入口由「记录」tab 分段承接，日历下方不再有工具条与底部入口
  assert.equal(wxml.includes('meaning-toolbar'), false, 'the meaning toolbar moves into the month tools menu')
  assert.equal(wxml.includes('record-entries'), false, 'the bottom record-list entries are removed')
  const js = fs.readFileSync(path.join(repoRoot, 'pages/index/index.js'), 'utf8')
  assert.doesNotMatch(js, /goPeriodList|goMemoryList/)
})

// issue #105：图例 / 预测说明 / 本月小结收进月份标题旁的「…」菜单（⌄ 已是选月 caret，不重复占用）
test('navbar tools entry is distinct from the month arrows', () => {
  const wxml = readIndexWxml()
  const nav = wxml.slice(wxml.indexOf('class="nav-bar'), wxml.indexOf('class="no-room"'))
  const monthNav = wxml.slice(wxml.indexOf('class="month-nav"'), wxml.indexOf('class="home-status'))

  assert.match(nav, /class="nav-tool"/)
  assert.match(nav, /bindtap="openMonthMenu"/)
  assert.match(nav, /aria-label="打开工具菜单"/)
  assert.match(nav, />工具<\/view>/)
  assert.doesNotMatch(monthNav, /openMonthMenu|month-menu-trigger|…/)
  assert.match(monthNav, /bindtap="prevMonth"/)
  assert.match(monthNav, /bindtap="nextMonth"/)

  const wxss = readIndexWxss()
  const tool = ruleBody(wxss, '.nav-tool')
  assert.match(tool, /height:\s*88rpx/)
  assert.match(tool, /border-radius:\s*var\(--radius-md\)/)
  assert.doesNotMatch(tool, /border-radius:\s*var\(--radius-circle\)/)
  assert.match(ruleBody(wxss, '.nav-btn'), /border-radius:\s*var\(--radius-circle\)/)
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

  // issue #73、#159：图标 = 日历图例的单日经期色带与欢乐时光浅色心，画在海军圆盘上
  const quickStart = wxml.indexOf('class="quick-actions"')
  const quickEnd = wxml.indexOf('class="month-summary"')
  const quickBlock = wxml.slice(quickStart, quickEnd)
  const periodButton = quickBlock.slice(0, quickBlock.indexOf('bindtap="quickMemory"'))
  assert.match(periodButton, /class="quick-icon sample-plate">\s*<view class="action-sample day-cell /)
  assert.match(quickBlock, /class="quick-icon memory-tone">♥<\/text>/)
  // 不再用表情（🩸 / ❤️ 表情形态），也不再用另一套经期圆点
  assert.doesNotMatch(quickBlock, /🩸|❤️|●/)
  // 欢乐时光的语义色沿用图例标记：浅色心；色带颜色由 .period-band 给（calendar-display.test.js 钉住）
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

test('compact density keeps record actions on a 375×667 screen for a 6-row month', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  const wxss = readIndexWxss()
  assert.match(ruleBody(wxss, '.calendar-density-compact .day-cell'), /height:\s*var\(--calendar-row-height,\s*140rpx\)/)
  assert.match(ruleBody(wxss, '.home-sticky'), /position:\s*fixed/)
  assert.match(ruleBody(wxss, '.home-status\.neutral'), /color:\s*var\(--text-secondary\)/)
  assert.doesNotMatch(ruleBody(wxss, '.home-status.neutral'), /#F97373|249,\s*115,\s*115/)

  // 375×667，底栏 48px，页高 619；顶栏 64px。清爽密度、6 行、不在当月：
  // 首屏其余部分 482rpx = 241px 加 6px 边框，(619 − 64 − 247) / 6 = 51.33 放不下常规清爽格的 69px，
  // 这个月每天的节日/调休与标记都能并成一行，合并信息行后记录入口仍在首屏
  const row = computeCalendarRowHeight({
    viewportWidth: 375,
    viewportHeight: 619,
    navBarHeightPx: 64,
    density: 'compact',
    days: Array.from({ length: 42 }, () => ({ isEmpty: true })),
    showBackToToday: true
  })
  assert.equal(row.heightPx, 51.33)
  assert.equal(row.infoMerged, true)
  assert.equal(row.actionsFit, true)
  assert.ok(row.heightPx >= row.contentMinPx)
  assert.ok(row.heightPx <= 70)
})

test('homepage keeps a navbar slot when the capsule rect is missing', () => {
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    // 拿不到胶囊时：状态栏 44，顶栏 84，右侧占位 94
    assert.equal(harness.page.data.safeTop, 44)
    assert.equal(harness.page.data.navBarHeight, 84)
    assert.equal(harness.page.data.capsuleRight, 94)
  } finally {
    harness.teardown()
    delete require.cache[require.resolve(safeAreaPath)]
  }
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
  const actionsAt = wxml.indexOf('selectedDayDetail.actions')
  const detailAt = wxml.indexOf("daySheetMode == 'detail'")
  assert.ok(subtitleAt !== -1 && actionsAt !== -1 && detailAt !== -1
    && subtitleAt < actionsAt && subtitleAt < detailAt,
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
    assert.equal(harness.page.data.selectedDateLabel, '2020年5月23日 周六')
    assert.equal(harness.page.data.selectedDateSubtitle, '闰四月初一')
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

// issue #159：到最早（2001 年 1 月）或最晚（2035 年 12 月）可看的月份时，对应箭头同时
// 显示禁用、按了没有任何更新、读屏读出禁用；滑动到边界同样安静，不翻月也不提示。
test('month arrows read as disabled at the first and last viewable month and stay quiet there', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    const arrows = wxmlOpeningTags(readIndexWxml()).filter(tag => tag.classes.includes('nav-btn'))
    assert.deepEqual(arrows.map(tag => tag.attrs.bindtap), ['prevMonth', 'nextMonth'])
    const arrowStates = () => arrows.map(tag => ({
      disabled: renderWxmlAttribute(tag.attrs.class, harness.page.data).split(/\s+/).includes('disabled'),
      ariaDisabled: renderWxmlAttribute(tag.attrs['aria-disabled'] || '', harness.page.data)
    }))
    const enabled = { disabled: false, ariaDisabled: 'false' }
    const disabled = { disabled: true, ariaDisabled: 'true' }
    const quietly = (use) => {
      const updates = []
      const setData = harness.page.setData
      harness.page.setData = (update, callback) => {
        updates.push(update)
        setData.call(harness.page, update, callback)
      }
      try {
        use()
      } finally {
        harness.page.setData = setData
      }
      assert.deepEqual(updates, [], 'a disabled arrow or a swipe past the bound publishes nothing')
      assert.deepEqual(harness.toasts, [], 'reaching a bound is not an error')
    }

    assert.deepEqual(arrowStates(), [enabled, enabled])

    harness.page.setData({ year: 2001, month: 1 })
    harness.page.prevMonth()
    assert.deepEqual([harness.page.data.year, harness.page.data.month], [2001, 0])
    assert.deepEqual(arrowStates(), [disabled, enabled])
    quietly(() => {
      harness.page.prevMonth()
      harness.page.onCalendarSwipe({ dx: 80, dy: 0 })
    })
    assert.deepEqual([harness.page.data.year, harness.page.data.month], [2001, 0])
    harness.page.nextMonth()
    assert.deepEqual(arrowStates(), [enabled, enabled])

    harness.page.setData({ year: 2035, month: 10 })
    harness.page.nextMonth()
    assert.deepEqual([harness.page.data.year, harness.page.data.month], [2035, 11])
    assert.deepEqual(arrowStates(), [enabled, disabled])
    quietly(() => {
      harness.page.nextMonth()
      harness.page.onCalendarSwipe({ dx: -80, dy: 0 })
    })
    assert.deepEqual([harness.page.data.year, harness.page.data.month], [2035, 11])

    // 选月面板与「回到今天」改变查看月份时，箭头状态跟着同一个月份
    harness.page.openMonthPicker()
    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '0' } } })
    assert.deepEqual([harness.page.data.year, harness.page.data.month], [2035, 0])
    assert.deepEqual(arrowStates(), [enabled, enabled])
    harness.page.setData({ year: 2001, month: 5 })
    harness.page.openMonthPicker()
    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '0' } } })
    assert.deepEqual(arrowStates(), [disabled, enabled])
    harness.page.jumpToToday()
    assert.deepEqual(arrowStates(), [enabled, enabled])
  } finally {
    harness.teardown()
  }
})

test('a disabled month arrow is dimmed and does not press', () => {
  const wxss = readIndexWxss()
  const opacity = Number(/opacity:\s*([\d.]+)/.exec(ruleBody(wxss, '.nav-btn.disabled'))?.[1])
  assert.ok(opacity > 0 && opacity <= 0.5, `.nav-btn.disabled opacity ${opacity} does not read as disabled`)

  // 按住禁用的箭头：不缩放，按压底色停在静止那一档
  assert.match(wxss, /\.nav-btn:active\.disabled,\s*\.nav-btn\.nav-btn-hover\.disabled\s*\{[^}]*transform:\s*none/)
  const restingTint = /background-color:\s*([^;]+);/.exec(ruleBody(wxss, '.nav-btn::before'))[1]
  const pressedDisabled = /\.nav-btn:active\.disabled::before,\s*\.nav-btn\.nav-btn-hover\.disabled::before\s*\{([^}]*)\}/.exec(wxss)
  assert.ok(pressedDisabled, 'expected the pressed-disabled tint rule')
  assert.equal(/background-color:\s*([^;]+);/.exec(pressedDisabled[1])?.[1], restingTint)
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

test('month selection jumps immediately, and back-to-today keeps its behavior', () => {
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '11' } } })
    assert.equal(harness.page.data.year, 2021)
    assert.equal(harness.page.data.month, 11)
    assert.equal(harness.page.data.jumpMonth, 11)
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
    assert.match(ruleBody(readIndexWxss(), '.sheet-slide.sheet-leaving'), /pointer-events:\s*none/)
    assert.match(ruleBody(readIndexWxss(), '.sheet-host'), /z-index:\s*60/)
    assert.match(ruleBody(readIndexWxss(), '.sheet-host.month-jump-mask'), /z-index:\s*62/)
    assert.match(ruleBody(readIndexWxss(), '.sheet-host.calendar-info-sheet'), /z-index:\s*64/)

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
    harness.page.setData({ jumpYear: 2021 })
    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '11' } } })
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

// issue #134：系统返回先关掉最上层弹层，走现有离场；离场结束前拦截还在，页面不离开。
test('system back dismisses the top homepage sheet instead of leaving the page', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const container = /<page-container\b[^>]*>/.exec(readIndexWxml())
    assert.ok(container, 'expected a page-container to intercept system back')
    // 组件留在树上时，show 为 false 仍会吃掉页面点击，底部原生 tab 不受影响。
    assert.match(container[0], /wx:if="\{\{sheetExitGuard\}\}"/)
    assert.match(container[0], /show="\{\{true\}\}"/)
    assert.match(container[0], /bindbeforeleave="onSheetSystemBack"/)
    assert.match(container[0], /overlay="\{\{false\}\}"/)
    assert.match(container[0], /\bduration="0"/)
    assert.match(container[0], /\bz-index="1"/)

    const navigation = []
    global.wx.navigateBack = () => navigation.push('navigateBack')
    global.wx.redirectTo = () => navigation.push('redirectTo')
    global.wx.switchTab = () => navigation.push('switchTab')

    harness.page.onLoad()
    harness.page.setData({
      year: 2020,
      month: 5,
      days: [{ date: '2026-06-20', weekday: '周六', isEmpty: false }]
    })
    assert.equal(Boolean(harness.page.data.sheetExitGuard), false)

    harness.page.openMonthPicker()
    assert.equal(harness.page.data.sheetExitGuard, true)
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')

    harness.page.onSheetSystemBack()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.deepEqual(navigation, [])
    mock.timers.tick(0)
    assert.equal(harness.page.data.sheetExitGuard, true)

    harness.page.onSheetSystemBack()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.deepEqual(navigation, [])

    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.equal(harness.page.data.monthPickerPhase, 'closed')
    assert.equal(harness.page.data.sheetExitGuard, false)

    harness.page.openMonthPicker()
    mock.timers.tick(0)
    harness.page.showDayDetail('2026-06-20')
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.dayActionPhase, 'open')

    harness.page.onSheetSystemBack()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.equal(harness.page.data.dayActionPhase, 'open')
    assert.equal(harness.page.data.dayActionMounted, true)
    assert.deepEqual(navigation, [])
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #134：弹层打开后隐藏原生 tabBar，离场完成才恢复；离场途中再打开则一直藏着。
test('an open homepage sheet hides the native tab bar until leave finishes, including a reopen', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const tabBar = []
    global.wx.hideTabBar = (options) => tabBar.push(['hide', options && options.animation])
    global.wx.showTabBar = (options) => tabBar.push(['show', options && options.animation])

    harness.page.onLoad()
    harness.page.setData({
      year: 2020,
      month: 5,
      days: [{ date: '2026-06-20', weekday: '周六', isEmpty: false }],
      dayDetailsByDate: {
        '2026-06-20': { meanings: [], periods: [], memories: [], empty: true }
      }
    })
    assert.deepEqual(tabBar, [])

    harness.page.openMonthPicker()
    assert.deepEqual(tabBar, [])
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.deepEqual(tabBar, [['hide', true]])

    harness.page.closeMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.deepEqual(tabBar, [['hide', true]])

    harness.page.openMonthPicker()
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.deepEqual(tabBar, [['hide', true]])

    harness.page.showDayDetail('2026-06-20')
    mock.timers.tick(0)
    assert.equal(harness.page.data.dayActionPhase, 'open')
    harness.page.closeDayActions()
    mock.timers.tick(200)
    assert.equal(harness.page.data.dayActionMounted, false)
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.deepEqual(tabBar, [['hide', true]])

    harness.page.closeMonthPicker()
    mock.timers.tick(199)
    assert.deepEqual(tabBar, [['hide', true]])
    mock.timers.tick(1)
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.equal(harness.page.data.pageObscured, false)
    assert.deepEqual(tabBar, [['hide', true], ['show', true]])
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #134：减弱动效下 tabBar 隐藏和恢复不播放动画。
test('reduced motion hides and restores the native tab bar instantly', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const tabBar = []
    global.wx.hideTabBar = (options) => tabBar.push(['hide', options && options.animation])
    global.wx.showTabBar = (options) => tabBar.push(['show', options && options.animation])
    global.wx.createSelectorQuery = () => {
      const query = {
        select() { return query },
        fields() { return query },
        exec(callback) { callback([{ width: '1px' }]) }
      }
      return query
    }

    harness.page.onLoad()
    harness.page.openMonthPicker()
    mock.timers.tick(0)
    assert.deepEqual(tabBar, [['hide', false]])

    harness.page.closeMonthPicker()
    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.deepEqual(tabBar, [['hide', false], ['show', false]])
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
    assert.match(wxml, /class="sheet-title">\{\{selectedDateLabel\}\}<\/text>\s*<text class="sheet-subtitle">/)
    assert.equal(harness.page.data.selectedDateLabel, '6月20日 周六')
    assert.equal(harness.page.data.selectedDate, '2026-06-20')
    assert.equal(harness.page.data.selectedDateSubtitle, '五月初五')
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
    assert.equal(harness.page.data.monthMenuPhase, 'closed')
    assert.equal(harness.page.data.monthMenuMounted, false)
    assert.equal(harness.page.data.infoSheetVisible, true)
    assert.equal(harness.page.data.infoSheetMode, 'legend')
    assert.equal(harness.page.data.infoSheetHandoff, true)
    assert.equal(harness.page.data.infoSheetPhase, 'closed')
    mock.timers.tick(0)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.monthMenuMounted, false)
    assert.equal(harness.page.data.infoSheetHandoff, true)

    harness.page.closeInfoSheet()
    assert.equal(harness.page.data.infoSheetVisible, false)
    assert.equal(harness.page.data.infoSheetPhase, 'leaving')
    assert.equal(harness.page.data.infoSheetMounted, true)
    assert.equal(harness.page.data.infoSheetMode, 'legend')
    assert.equal(harness.page.data.infoSheetHandoff, false)

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
// 进场的关闭姿态还没盖住页面，标记先不出现。交接遮罩已经不透明，标记保持。
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
    assert.equal(harness.page.data.monthMenuMounted, false)
    assert.equal(harness.page.data.monthMenuPhase, 'closed')
    assert.equal(harness.page.data.infoSheetPhase, 'closed')
    assert.equal(harness.page.data.infoSheetHandoff, true)
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

// issue #155：信息弹层按显示的内容命名。遮罩读「关闭」加名称，面板以同一名称作读屏名；
// 状态行直接打开、离场途中从小结行换内容重开、从工具菜单交接，名称都跟着当前内容走。
test('the info sheet mask and panel are named by what the sheet shows', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  const wxml = readIndexWxml()
  const host = wxmlOpeningTags(wxml.slice(wxml.indexOf('wx:if="{{infoSheetMounted}}"'), wxml.indexOf('<page-container')))
  const mask = host.find(tag => tag.classes.includes('day-sheet-mask'))
  const panel = host.find(tag => tag.classes.includes('calendar-info-panel'))
  assert.ok(mask && panel, 'expected the info sheet mask and panel')
  const heard = () => [
    renderWxmlAttribute(mask.attrs['aria-label'], harness.page.data),
    renderWxmlAttribute(panel.attrs['aria-label'], harness.page.data)
  ]
  try {
    harness.page.onLoad()
    harness.page.openPredictionSheet()
    assert.deepEqual(heard(), ['关闭预测说明', '预测说明'])
    mock.timers.tick(0)
    harness.page.closeInfoSheet()
    assert.equal(harness.page.data.infoSheetPhase, 'leaving')
    assert.deepEqual(heard(), ['关闭预测说明', '预测说明'])

    harness.page.openMonthlyRecap()
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.deepEqual(heard(), ['关闭本月小结', '本月小结'])
    harness.page.closeInfoSheet()
    mock.timers.tick(200)
    assert.equal(harness.page.data.infoSheetMounted, false)

    for (const [action, name] of [['legend', '日历图例'], ['prediction', '预测说明'], ['recap', '本月小结']]) {
      harness.page.openMonthMenu()
      mock.timers.tick(0)
      harness.page.onMonthMenuTap({ currentTarget: { dataset: { action } } })
      assert.equal(harness.page.data.infoSheetHandoff, true)
      assert.deepEqual(heard(), [`关闭${name}`, name], `${action} hand-off`)
      harness.page.closeInfoSheet()
      mock.timers.tick(200)
    }
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #117：当日操作里点「查看详情」时，新内容带淡入标记；弹层本身保持打开。
test('tapping view detail marks the new content to fade in without leaving the sheet', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({
      days: [{ date: '2026-06-20', weekday: '周六', lunarText: '五月初五', isEmpty: false }],
      dayDetailsByDate: {
        '2026-06-20': { meanings: [], periods: [], memories: [], empty: true }
      }
    })

    harness.page.showDayDetail('2026-06-20')
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.dayDetailFade, false)
    assert.equal(harness.page.data.selectedDateSubtitle, '五月初五')
    harness.page.closeDayActions()
    mock.timers.tick(200)
    assert.equal(harness.page.data.dayActionMounted, false)

    harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-20' } } })
    mock.timers.tick(0)
    assert.equal(harness.page.data.dayActionPhase, 'open')
    assert.equal(harness.page.data.daySheetMode, 'actions')
    assert.equal(harness.page.data.dayDetailFade, false)

    harness.page.onDayActionTap({ currentTarget: { dataset: { action: 'detail' } } })
    assert.equal(harness.page.data.daySheetMode, 'detail')
    assert.equal(harness.page.data.dayDetailFade, true)
    assert.equal(harness.page.data.dayActionPhase, 'open')
    assert.equal(harness.page.data.dayActionMounted, true)
    assert.equal(harness.page.data.dayActionSheetVisible, true)
    assert.equal(harness.page.data.selectedDate, '2026-06-20')
    assert.equal(harness.page.data.selectedDayDetail.empty, true)

    const wxml = readIndexWxml()
    const detailAt = wxml.indexOf("daySheetMode == 'detail'")
    assert.ok(detailAt !== -1, 'expected the detail branch')
    assert.match(wxml.slice(detailAt, detailAt + 240), /dayDetailFade/)
    assert.match(wxml.slice(detailAt, detailAt + 240), /day-detail-fade/)
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

// issue #117：工具菜单切到图例 / 预测说明 / 本月小结是同一次页面更新。
// 菜单直接卸下，不进入 leaving；信息遮罩带着交接标记挂上，面板仍先停在底边再升起。
test('tools menu hands off to the info sheet in one update and later leaves normally', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    const wxml = readIndexWxml()
    assert.match(wxml, /infoSheetHandoff/)
    assert.match(wxml, /sheet-handoff/)

    harness.page.onLoad()
    harness.page.openPredictionSheet()
    assert.equal(harness.page.data.infoSheetHandoff, false)
    assert.equal(harness.page.data.infoSheetPhase, 'closed')
    mock.timers.tick(0)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
    assert.equal(harness.page.data.infoSheetHandoff, false)
    harness.page.closeInfoSheet()
    mock.timers.tick(200)
    assert.equal(harness.page.data.infoSheetMounted, false)

    for (const [action, mode] of [['legend', 'legend'], ['prediction', 'prediction'], ['recap', 'recap']]) {
      harness.page.openMonthMenu()
      mock.timers.tick(0)
      assert.equal(harness.page.data.monthMenuPhase, 'open')
      assert.equal(harness.page.data.monthMenuMounted, true)

      const updates = []
      const originalSetData = harness.page.setData
      harness.page.setData = function record(update, callback) {
        updates.push(update)
        return originalSetData.call(this, update, callback)
      }
      harness.page.onMonthMenuTap({ currentTarget: { dataset: { action } } })
      harness.page.setData = originalSetData

      assert.equal(updates.length, 1, `${action} replaces the menu in one page update`)
      const update = updates[0]
      assert.equal(update.monthMenuMounted, false)
      assert.equal(update.monthMenuVisible, false)
      assert.equal(update.monthMenuPhase, 'closed')
      assert.equal(update.infoSheetMounted, true)
      assert.equal(update.infoSheetVisible, true)
      assert.equal(update.infoSheetMode, mode)
      assert.equal(update.infoSheetHandoff, true)
      assert.equal(update.infoSheetPhase, 'closed')
      assert.equal(harness.page.data.monthMenuMounted, false)
      assert.equal(harness.page.data.infoSheetHandoff, true)

      mock.timers.tick(0)
      assert.equal(harness.page.data.infoSheetPhase, 'open')
      assert.equal(harness.page.data.infoSheetHandoff, true)
      assert.equal(harness.page.data.monthMenuMounted, false)
      assert.equal(harness.page.data.monthMenuPhase, 'closed')

      harness.page.closeInfoSheet()
      assert.equal(harness.page.data.infoSheetPhase, 'leaving')
      assert.equal(harness.page.data.infoSheetMounted, true)
      assert.equal(harness.page.data.infoSheetHandoff, false)
      mock.timers.tick(200)
      assert.equal(harness.page.data.infoSheetMounted, false)
      assert.equal(harness.page.data.infoSheetPhase, 'closed')
    }

    harness.page.openMonthMenu()
    harness.page.onMonthMenuTap({ currentTarget: { dataset: { action: 'legend' } } })
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthMenuMounted, false)
    assert.equal(harness.page.data.infoSheetPhase, 'open')
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
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(199)
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusText, '已同步')

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
    assert.equal(harness.page.data.syncStatusText, '已同步')
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
    assert.equal(harness.page.data.syncStatusText, '已同步')
    assert.equal(harness.page.data.syncStatusMounted, true)

    mock.timers.tick(0)
    assert.equal(harness.page.data.syncStatusPhase, 'leaving')
    assert.equal(harness.page.data.syncStatusMounted, true)
    assert.equal(harness.page.data.syncStatusText, '已同步')

    mock.timers.tick(200)
    assert.equal(harness.page.data.syncStatusMounted, false)
    assert.equal(harness.page.data.syncStatusPhase, 'closed')
    assert.equal(harness.page.data.syncStatusText, '')
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

// issue #119：松手由页面纯函数决定。位移短、速度超过 0.11 px/ms 时关闭，走既有离场。
test('a short fast downward drag closes the month picker through the leave flow', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.openMonthPicker()
    mock.timers.tick(0)
    assert.equal(harness.page.data.monthPickerPhase, 'open')

    // 12px / 100ms = 0.12，超过 0.11；12 / 400 = 3%，不到 25%
    harness.page.onSheetDragRelease({
      sheet: 'monthPicker',
      displacement: 12,
      elapsed: 100,
      panelHeight: 400
    })

    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerMounted, true)

    mock.timers.tick(199)
    assert.equal(harness.page.data.monthPickerMounted, true)

    mock.timers.tick(1)
    assert.equal(harness.page.data.monthPickerPhase, 'closed')
    assert.equal(harness.page.data.monthPickerMounted, false)
    assert.equal(harness.page.data.monthPickerVisible, false)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #119：速度很慢，但向下位移超过面板高度的 25% 时仍然关闭。
test('a slow drag past a quarter of the panel closes the month picker', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.openMonthPicker()
    mock.timers.tick(0)

    // 101 / 400 = 25.25%，超过 25%；101 / 10000 = 0.0101，不到 0.11
    harness.page.onSheetDragRelease({
      sheet: 'monthPicker',
      displacement: 101,
      elapsed: 10000,
      panelHeight: 400
    })

    assert.equal(harness.page.data.monthPickerPhase, 'leaving')
    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerMounted, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #119：又慢又短则保持打开，并通知视图层清掉内联位移。
test('a slow short drag keeps the month picker open and asks the view to reset', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.openMonthPicker()
    mock.timers.tick(0)

    // 40 / 400 = 10%，不到 25%；40 / 1000 = 0.04，不到 0.11
    harness.page.onSheetDragRelease({
      sheet: 'monthPicker',
      displacement: 40,
      elapsed: 1000,
      panelHeight: 400
    })

    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.monthPickerVisible, true)
    assert.equal(harness.page.data.monthPickerMounted, true)
    assert.equal(harness.page.data.sheetDragClear.monthPicker.action, 'reset')
    assert.equal(harness.page.data.sheetDragClear.monthPicker.token, 1)

    mock.timers.tick(200)
    assert.equal(harness.page.data.monthPickerPhase, 'open')
    assert.equal(harness.page.data.monthPickerMounted, true)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

// issue #119：向上拖即使又快又远也不关闭，四个弹层都回到原位。
test('an upward drag never closes a homepage sheet', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    for (const sheet of homepageSheetTargets(harness)) {
      sheet.open()
      mock.timers.tick(0)
      assert.equal(harness.page.data[sheet.phase], 'open', sheet.id)

      const tokenBefore = harness.page.data.sheetDragClear[sheet.id].token
      // -120px / 50ms，绝对值超过 25% 且快过 0.11，但方向向上
      harness.page.onSheetDragRelease({
        sheet: sheet.id,
        displacement: -120,
        elapsed: 50,
        panelHeight: 400
      })

      assert.equal(harness.page.data[sheet.phase], 'open', sheet.id)
      assert.equal(harness.page.data[sheet.visible], true, sheet.id)
      assert.equal(harness.page.data[sheet.mounted], true, sheet.id)
      assert.equal(harness.page.data.sheetDragClear[sheet.id].action, 'reset', sheet.id)
      assert.equal(harness.page.data.sheetDragClear[sheet.id].token, tokenBefore + 1, sheet.id)
    }
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

test('day actions, the tools menu, and the info sheet use the same drag release decision', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    const sheets = homepageSheetTargets(harness).filter(sheet => sheet.id !== 'monthPicker')
    for (const sheet of sheets) {
      sheet.open()
      mock.timers.tick(0)
      harness.page.onSheetDragRelease({
        sheet: sheet.id,
        displacement: 12,
        elapsed: 100,
        panelHeight: 400
      })
      assert.equal(harness.page.data[sheet.phase], 'leaving', `${sheet.id} fast`)
      assert.equal(harness.page.data[sheet.visible], false, `${sheet.id} fast`)
      assert.equal(harness.page.data[sheet.mounted], true, `${sheet.id} fast`)
      mock.timers.tick(200)
      assert.equal(harness.page.data[sheet.mounted], false, `${sheet.id} fast unmount`)

      sheet.open()
      mock.timers.tick(0)
      harness.page.onSheetDragRelease({
        sheet: sheet.id,
        displacement: 101,
        elapsed: 10000,
        panelHeight: 400
      })
      assert.equal(harness.page.data[sheet.phase], 'leaving', `${sheet.id} distance`)
      mock.timers.tick(200)

      sheet.open()
      mock.timers.tick(0)
      const tokenBefore = harness.page.data.sheetDragClear[sheet.id].token
      harness.page.onSheetDragRelease({
        sheet: sheet.id,
        displacement: 40,
        elapsed: 1000,
        panelHeight: 400
      })
      assert.equal(harness.page.data[sheet.phase], 'open', `${sheet.id} reset`)
      assert.equal(harness.page.data[sheet.visible], true, `${sheet.id} reset`)
      assert.equal(harness.page.data.sheetDragClear[sheet.id].action, 'reset', `${sheet.id} reset`)
      assert.equal(harness.page.data.sheetDragClear[sheet.id].token, tokenBefore + 1, `${sheet.id} reset`)
    }
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

function homepageSheetTargets(harness) {
  return [
    {
      id: 'monthPicker',
      phase: 'monthPickerPhase',
      visible: 'monthPickerVisible',
      mounted: 'monthPickerMounted',
      open() { harness.page.openMonthPicker() }
    },
    {
      id: 'dayActions',
      phase: 'dayActionPhase',
      visible: 'dayActionSheetVisible',
      mounted: 'dayActionMounted',
      open() {
        harness.page.setData({
          days: [{ date: '2026-06-20', weekday: '周六', lunarText: '五月初五', isEmpty: false }]
        })
        harness.page.onDayTap({ currentTarget: { dataset: { date: '2026-06-20' } } })
      }
    },
    {
      id: 'toolsMenu',
      phase: 'monthMenuPhase',
      visible: 'monthMenuVisible',
      mounted: 'monthMenuMounted',
      open() { harness.page.openMonthMenu() }
    },
    {
      id: 'info',
      phase: 'infoSheetPhase',
      visible: 'infoSheetVisible',
      mounted: 'infoSheetMounted',
      open() { harness.page.openLegendSheet() }
    }
  ]
}

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

// issue #137：水平位移超过 48px 且大于竖直位移才翻月。左滑下一月，右滑上一月。
// 等于阈值、竖直不小于水平、以及轻点量级都不翻月，竖向滚动优先。
test('month swipe changes month only when horizontal travel wins', () => {
  const { decideMonthSwipe } = require('../utils/util')

  assert.equal(decideMonthSwipe(-49, 0), 'next')
  assert.equal(decideMonthSwipe(49, 0), 'prev')
  assert.equal(decideMonthSwipe(-80, 79), 'next')
  assert.equal(decideMonthSwipe(80, 10), 'prev')

  assert.equal(decideMonthSwipe(-48, 0), 'none')
  assert.equal(decideMonthSwipe(48, 0), 'none')
  assert.equal(decideMonthSwipe(-49, 49), 'none')
  assert.equal(decideMonthSwipe(-49, 50), 'none')
  assert.equal(decideMonthSwipe(10, 0), 'none')
  assert.equal(decideMonthSwipe(0, 80), 'none')
  assert.equal(decideMonthSwipe(undefined, undefined), 'none')
})

test('releasing a winning calendar swipe publishes one month change and ignores vertical travel', () => {
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

    // 2019-12-01 是周日，翻到 12 月时网格第一格就是该月 1 日
    harness.page.setData({ year: 2019, month: 10, days: [{ date: 'stale-grid' }] })
    updates.length = 0
    timerDelays.length = 0
    harness.page.onCalendarSwipe({ dx: -49, dy: 0 })
    assert.equal(timerDelays.length, 0)
    assert.equal(updates.length, 1)
    assert.equal(updates[0].year, 2019)
    assert.equal(updates[0].month, 11)
    assert.equal(updates[0].days[0].date, '2019-12-01')

    updates.length = 0
    harness.page.onCalendarSwipe({ dx: 49, dy: 10 })
    assert.equal(updates.length, 1)
    assert.equal(harness.page.data.year, 2019)
    assert.equal(harness.page.data.month, 10)

    updates.length = 0
    harness.page.onCalendarSwipe({ dx: -20, dy: 80 })
    assert.equal(updates.length, 0)
    assert.equal(harness.page.data.month, 10)

    harness.page.setData({ year: 2035, month: 11 })
    updates.length = 0
    harness.page.onCalendarSwipe({ dx: -80, dy: 0 })
    assert.equal(updates.length, 0)
    assert.equal(harness.page.data.year, 2035)
    assert.equal(harness.page.data.month, 11)
  } finally {
    global.setTimeout = originalSetTimeout
    harness.teardown()
  }
})

test('the calendar area tracks month swipes in WXS and does not follow the finger', () => {
  const wxml = readIndexWxml()
  const swipeStart = wxml.indexOf('class="calendar-swipe"')
  const weekHeader = wxml.indexOf('class="week-header"')
  const grid = wxml.indexOf('class="calendar-grid')
  const quick = wxml.indexOf('class="quick-actions"')
  assert.ok(swipeStart !== -1, 'expected a calendar swipe region')
  assert.ok(swipeStart < weekHeader && weekHeader < grid && grid < quick, 'the swipe region wraps the week header and calendar grid')

  const region = wxml.slice(swipeStart, quick)
  assert.match(region, /bindtouchstart="\{\{monthSwipe\.touchStart\}\}"/)
  assert.match(region, /bindtouchmove="\{\{monthSwipe\.touchMove\}\}"/)
  assert.match(region, /bindtouchend="\{\{monthSwipe\.touchEnd\}\}"/)
  assert.match(region, /bindtouchcancel="\{\{monthSwipe\.touchEnd\}\}"/)
  assert.match(region, /bindtap="onDayTap"/)
  assert.doesNotMatch(wxml, /monthSwipe\.wxs/)
  const inline = wxml.match(/<wxs module="monthSwipe">([\s\S]*?)<\/wxs>/)
  assert.ok(inline, 'month swipe script stays inside the page so the compiler does not look up a separate wxs file')
  const wxs = inline[1]
  assert.match(wxs, /var SWIPE_PX = 48/)
  assert.match(wxs, /absX > SWIPE_PX && absX > absY/)
  assert.match(wxs, /callMethod\('onCalendarSwipe'/)
  assert.doesNotMatch(wxs, /setStyle|translateX|animation/)
})

test('tapping a month jumps there immediately and closes the sheet', () => {
  const wxml = readIndexWxml()
  assert.doesNotMatch(wxml, /jump-confirm|confirmMonthJump/)
  assert.match(wxml, /bindtap="shiftJumpYear"/)
  assert.match(wxml, /bindtap="jumpToToday"/)

  mock.timers.enable({ apis: ['setTimeout'] })
  const harness = loadPageHarness({ client: createQueuedClient([]) })
  try {
    harness.page.onLoad()
    harness.page.setData({ year: 2020, month: 5 })
    harness.page.openMonthPicker()
    mock.timers.tick(0)

    harness.page.shiftJumpYear({ currentTarget: { dataset: { delta: '1' } } })
    assert.equal(harness.page.data.year, 2020)
    assert.equal(harness.page.data.month, 5)
    assert.equal(harness.page.data.jumpYear, 2021)
    assert.equal(harness.page.data.monthPickerPhase, 'open')

    harness.page.selectJumpMonth({ currentTarget: { dataset: { month: '11' } } })
    assert.equal(harness.page.data.year, 2021)
    assert.equal(harness.page.data.month, 11)
    assert.equal(harness.page.data.jumpMonth, 11)
    assert.equal(harness.page.data.monthPickerVisible, false)
    assert.equal(harness.page.data.monthPickerPhase, 'leaving')

    harness.page.openMonthPicker()
    mock.timers.tick(0)
    harness.page.jumpToToday()
    const today = new Date()
    assert.equal(harness.page.data.year, today.getFullYear())
    assert.equal(harness.page.data.month, today.getMonth())
    assert.equal(harness.page.data.monthPickerVisible, false)
  } finally {
    harness.teardown()
    mock.timers.reset()
  }
})

test('home pull-to-refresh starts the background reload and stops when it finishes', async () => {
  const indexJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'pages/index/index.json'), 'utf8'))
  assert.equal(indexJson.enablePullDownRefresh, true)

  let releaseRefresh
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve })
  let call = 0
  const periods = [period('p1', '2026-06-01')]
  const harness = loadPageHarness({
    client: {
      async list(collection) {
        call += 1
        const data = collection === 'periods' ? periods : []
        if (call > 2) await refreshGate
        return { kind: 'success', data }
      }
    }
  })
  let stops = 0
  global.wx.stopPullDownRefresh = () => { stops += 1 }

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    assert.equal(harness.page.data.hasLoadedHomeData, true)
    assert.equal(harness.page.data.refreshing, false)

    const pull = harness.page.onPullDownRefresh()
    assert.equal(harness.page.data.refreshing, true)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.periods, undefined)
    assert.deepEqual(harness.page._homeRecords.periods, periods)
    assert.equal(stops, 0)

    releaseRefresh()
    await pull
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.loading, false)
    assert.equal(harness.page.data.periods, undefined)
    assert.deepEqual(harness.page._homeRecords.periods, periods)
    assert.equal(stops, 1)
  } finally {
    harness.teardown()
  }
})

test('home pull-to-refresh stops after a failed background reload and keeps the retry sentence', async () => {
  let call = 0
  const periods = [period('p1', '2026-06-01')]
  const harness = loadPageHarness({
    client: {
      async list(collection) {
        call += 1
        if (call <= 2) return { kind: 'success', data: collection === 'periods' ? periods : [] }
        throw new Error('network down')
      }
    }
  })
  let stops = 0
  global.wx.stopPullDownRefresh = () => { stops += 1 }

  try {
    harness.page.onLoad()
    await harness.page.onShow()
    await harness.page.onPullDownRefresh()
    assert.equal(stops, 1)
    assert.equal(harness.page.data.refreshing, false)
    assert.equal(harness.page.data.loading, false)
    assert.deepEqual(renderRefreshRetry(harness.page.data), FULL_REFRESH_RETRY)
    assert.equal(harness.page.data.periods, undefined)
    assert.deepEqual(harness.page._homeRecords.periods, periods)
  } finally {
    harness.teardown()
  }
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
