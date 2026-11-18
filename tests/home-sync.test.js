const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')
const { confirmDelete, listCalls, listed, markedDates } = require('./helpers/recordPages')

// #171: real pages, platform responses and rendered data only. Calendar/sheet
// interaction cases remain in index-page.test.js for #172.
const ROOM = { code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } }
const success = data => ({ code: 0, data })
const period = (id, date) => ({ _id: id, startDate: date, endDate: date, status: 'known-end' })
const memory = (id, date, note = '') => ({ _id: id, date, note })

// No getMyRoom rule by default: Home takes pairing from the lists (#191), so a Room lookup
// from a bound Home fails loudly as an unprogrammed cloud call.
function homeApp(t, options = {}) {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' }, ...options })
  t.after(() => app.teardown())
  listRoute(app, 'periods').reply(success([]))
  listRoute(app, 'memories').reply(success([]))
  return app
}

function listRoute(app, collection) {
  return app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
}

function assertCalendar(app, page, periods, memories) {
  assert.deepEqual(markedDates(app, page, 'isPeriod'), periods)
  assert.deepEqual(markedDates(app, page, 'isMemory'), memories)
}

async function showAgain(app) {
  app.hide()
  app.show()
  await app.settle()
}

test('initial load starts both collections together and renders only after both responses', async t => {
  const app = homeApp(t)
  const periods = listRoute(app, 'periods').defer()
  const memories = listRoute(app, 'memories').defer()
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).loading, true)
  assert.deepEqual(listCalls(app).map(call => call.data), [
    { action: 'list', collection: 'periods', data: {}, id: '', roomCode: 'ROOM01' },
    { action: 'list', collection: 'memories', data: {}, id: '', roomCode: 'ROOM01' }
  ])

  memories.resolve(success([memory('m1', '2026-06-02')]))
  await app.settle()
  assert.equal(app.rendered(home).loading, true)
  periods.resolve(success([period('p1', '2026-06-01')]))
  await app.settle()
  assertCalendar(app, home, ['2026-06-01'], ['2026-06-02'])
  assert.equal(app.rendered(home).loading, false)
  assert.equal(app.rendered(home).refreshing, false)
  assert.equal(app.rendered(home).noRoom, false)
  assert.equal(app.rendered(home).syncStatusVisible, false)
})

test('one completed load commits both collection changes in a single calendar frame', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(success([period('old-p', '2026-06-01')]))
  const m = listRoute(app, 'memories').reply(success([memory('old-m', '2026-06-02')]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  const periods = p.defer()
  const memories = m.defer()
  await showAgain(app)
  const start = home.setDataCalls.length
  memories.resolve(success([memory('new-m', '2026-06-12')]))
  await app.settle()
  assert.equal(home.setDataCalls.slice(start).some(patch => patch.days), false)
  periods.resolve(success([period('new-p', '2026-06-20')]))
  await app.settle()
  const frames = home.setDataCalls.slice(start).filter(patch => patch.days)
  assert.deepEqual(frames.map(frame => ({
    periods: frame.days.filter(day => day.isPeriod).map(day => day.date),
    memories: frame.days.filter(day => day.isMemory).map(day => day.date),
    summary: frame.monthSummaryLine
  })), [{
    periods: ['2026-06-20'],
    memories: ['2026-06-12'],
    summary: '本月 经期 1 天 · 欢乐时光 1 条'
  }])
})

test('unchanged and reordered background responses keep the calendar quiet', async t => {
  const app = homeApp(t)
  const periods = [period('p1', '2026-06-01'), period('p2', '2026-06-20')]
  const memories = [memory('m1', '2026-06-02'), memory('m2', '2026-06-12')]
  const p = listRoute(app, 'periods').reply(success(periods))
  const m = listRoute(app, 'memories').reply(success(memories))
  const home = app.launch('/pages/index/index')
  await app.settle()
  await showAgain(app)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-02', '2026-06-12'])
  assert.equal(app.rendered(home).syncStatusVisible, false)

  const pending = p.defer()
  m.reply(success([...memories].reverse()))
  app.hide()
  app.show()
  await app.settle()
  assert.equal(app.rendered(home).loading, false)
  assert.equal(app.rendered(home).refreshing, true)
  assert.equal(app.rendered(home).syncStatusVisible, false)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-02', '2026-06-12'])
  pending.resolve(success([...periods].reverse()))
  await app.settle()
  assert.equal(app.rendered(home).refreshing, false)
  assert.equal(app.rendered(home).syncStatusVisible, false)
  assert.equal(app.rendered(home).syncStatusText, '')
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-02', '2026-06-12'])

  p.reject(new Error('network down'))
  await showAgain(app)
  assertRetry(app, home, 'periods')
  assert.equal(app.rendered(home).syncStatusVisible, false)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-02', '2026-06-12'])
})

test('only newly arriving partner records in a previously synced paired Room play current-month feedback once', async t => {
  const app = homeApp(t)
  const oldPeriod = { ...period('old-p', '2026-06-01'), createdByMe: false }
  const oldMemory = { ...memory('old-m', '2026-06-02'), createdByMe: false }
  const p = listRoute(app, 'periods').reply(listed([oldPeriod], 'paired'))
  const m = listRoute(app, 'memories').reply(listed([oldMemory], 'paired'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {}, 'the first complete load is not a new arrival')

  p.reply(listed([
    oldPeriod,
    { ...period('own-p', '2026-06-03'), createdByMe: true },
    { ...period('partner-p', '2026-06-10'), createdByMe: false },
    period('unknown-author-p', '2026-06-11')
  ], 'paired'))
  m.reply(listed([
    oldMemory,
    { ...memory('own-m', '2026-06-04'), createdByMe: true },
    { ...memory('partner-m', '2026-06-12'), createdByMe: false },
    { ...memory('other-month-m', '2026-05-12'), createdByMe: false }
  ], 'paired'))
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {
    '2026-06-10': 'period',
    '2026-06-12': 'memory'
  })

  await app.dispatch(home, 'nextMonth')
  await app.dispatch(home, 'prevMonth')
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {}, 'consumed arrivals do not play again')
  await app.dispatch(home, 'prevMonth')
  assert.deepEqual(app.rendered(home).recordFeedback, {}, 'an arrival outside the viewed month is not replayed later')
})

test('a hidden Home retains arrivals across loads until show, then drops records outside that viewed month', async t => {
  const app = homeApp(t)
  const oldPeriod = { ...period('old-p', '2026-06-01'), createdByMe: false }
  const oldMemory = { ...memory('old-m', '2026-06-02'), createdByMe: false }
  const partnerPeriod = { ...period('partner-p', '2026-06-10'), createdByMe: false }
  const partnerMemory = { ...memory('partner-m', '2026-06-12'), createdByMe: false }
  const p = listRoute(app, 'periods').reply(listed([oldPeriod], 'paired'))
  const m = listRoute(app, 'memories').reply(listed([oldMemory], 'paired'))
  const home = app.launch('/pages/index/index')
  await app.settle()

  app.hide()
  p.reply(listed([oldPeriod, partnerPeriod], 'paired'))
  await home.onPullDownRefresh()
  await app.settle()
  m.reply(listed([
    oldMemory,
    partnerMemory,
    { ...memory('other-month-m', '2026-05-12'), createdByMe: false }
  ], 'paired'))
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {}, 'nothing plays while Home is hidden')

  app.show()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {
    '2026-06-10': 'period',
    '2026-06-12': 'memory'
  })
  await app.dispatch(home, 'prevMonth')
  await app.settle()
  assert.deepEqual([app.rendered(home).year, app.rendered(home).month], [2026, 4])
  assert.deepEqual(app.rendered(home).recordFeedback, {}, 'the other-month arrival was consumed without a later replay')
})

test('a collection first synced on a later load does not treat its initial partner records as arrivals', async t => {
  const app = homeApp(t)
  const oldPeriod = { ...period('old-p', '2026-06-01'), createdByMe: false }
  const partnerPeriod = { ...period('partner-p', '2026-06-10'), createdByMe: false }
  const firstMemory = { ...memory('first-m', '2026-06-12'), createdByMe: false }
  const secondMemory = { ...memory('second-m', '2026-06-14'), createdByMe: false }
  const p = listRoute(app, 'periods').reply(listed([oldPeriod], 'paired'))
  const m = listRoute(app, 'memories').reject(new Error('network down'))
  const home = app.launch('/pages/index/index')
  await app.settle()

  p.reply(listed([oldPeriod, partnerPeriod], 'paired'))
  m.reply(listed([firstMemory], 'paired'))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {
    '2026-06-10': 'period'
  }, 'only the previously synced periods can publish an arrival')

  p.reply(listed([oldPeriod, partnerPeriod], 'paired'))
  m.reply(listed([firstMemory, secondMemory], 'paired'))
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {
    '2026-06-14': 'memory'
  }, 'the next memory load has a synced baseline')
})

test('new partner records stay quiet while the Room is waiting', async t => {
  const app = homeApp(t)
  const oldMemory = { ...memory('old-m', '2026-06-02'), createdByMe: false }
  const waitingMemory = { ...memory('waiting-m', '2026-06-10'), createdByMe: false }
  const pairedMemory = { ...memory('paired-m', '2026-06-12'), createdByMe: false }
  const p = listRoute(app, 'periods').reply(listed([], 'waiting'))
  const m = listRoute(app, 'memories').reply(listed([oldMemory], 'waiting'))
  const home = app.launch('/pages/index/index')
  await app.settle()

  p.reply(listed([], 'waiting'))
  m.reply(listed([oldMemory, waitingMemory], 'waiting'))
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {})

  p.reply(listed([], 'paired'))
  m.reply(listed([oldMemory, waitingMemory, pairedMemory], 'paired'))
  await home.onPullDownRefresh()
  await app.settle()
  assert.deepEqual(app.rendered(home).recordFeedback, {
    '2026-06-12': 'memory'
  }, 'pairing does not make an older waiting-room record newly arrived')
})

test('first-load network failure offers a retry that clears the failure screen and loads records', async t => {
  const app = homeApp(t)
  listRoute(app, 'periods').reject(new Error('network down'))
  listRoute(app, 'memories').reject(new Error('network down'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).noRoom, true)
  assert.equal(app.rendered(home).roomStatusTitle, '日历加载失败')
  assert.equal(app.rendered(home).roomStatusDesc, '网络不太稳定，请重试')
  assert.equal(app.rendered(home).roomStatusActionText, '重试')
  assert.equal(app.rendered(home).roomStatusAction, 'retry')
  assert.equal(app.rendered(home).refreshRetryVisible, false)

  const pending = listRoute(app, 'periods').defer()
  listRoute(app, 'memories').reply(success([memory('m1', '2026-06-02')]))
  app.dispatch(home, 'handleRoomStatusAction')
  await app.settle()
  assert.equal(app.rendered(home).loading, true)
  assert.equal(app.rendered(home).noRoom, false)
  assert.equal(app.rendered(home).roomStatusTitle, '')
  assert.equal(app.rendered(home).roomStatusDesc, '')
  assert.equal(app.rendered(home).roomStatusActionText, '')
  assert.equal(app.rendered(home).syncStatusVisible, false)
  pending.resolve(success([period('p1', '2026-06-01')]))
  await app.settle()
  assert.equal(app.rendered(home).loading, false)
  assertCalendar(app, home, ['2026-06-01'], ['2026-06-02'])
  assert.equal(listCalls(app).length, 4)
})

const RETRY = {
  periods: '经期同步失败，点按重试',
  memories: '欢乐时光同步失败，点按重试',
  all: '刷新失败，点按重试'
}

function assertRetry(app, home, scope) {
  const view = app.rendered(home)
  assert.equal(view.refreshRetryVisible, Boolean(scope))
  if (!scope) return
  assert.equal(view.refreshRetryText, RETRY[scope])
  assert.equal(view.refreshRetryLabel, scope === 'all' ? '日历刷新失败，点按重试' : RETRY[scope])
}

for (const failed of ['periods', 'memories']) {
  test(`first-load ${failed} failure renders the other collection and retries without hiding the explanation`, async t => {
    const app = homeApp(t)
    listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
    listRoute(app, 'memories').reply(success([memory('m1', '2026-06-02')]))
    const route = listRoute(app, failed).reject(new Error('network down'))
    const home = app.launch('/pages/index/index')
    await app.settle()
    assert.equal(app.rendered(home).loading, false)
    assert.equal(app.rendered(home).noRoom, false)
    assertCalendar(app, home, failed === 'periods' ? [] : ['2026-06-01'], failed === 'memories' ? [] : ['2026-06-02'])
    assertRetry(app, home, failed)
    assert.equal(app.rendered(home).syncStatusText, failed === 'periods' ? '已显示欢乐时光' : '已显示经期数据')
    assert.equal(app.rendered(home).monthSummaryLine, failed === 'periods'
      ? '本月 经期未同步 · 欢乐时光 1 条' : '本月 经期 1 天 · 欢乐时光未同步')
    if (failed === 'periods') {
      assert.equal(app.rendered(home).homeStatus.text, '经期未同步，暂不预测')
      await app.dispatch(home, 'openPredictionSheet')
      await app.settle()
      assert.equal(app.rendered(home).predictionExplanation.summary, '经期未同步，暂不预测')
      await app.dispatch(home, 'closeInfoSheet')
      await app.advance(200)
    }

    const pending = route.defer()
    const retry = app.dispatch(home, 'retryRefresh')
    await app.settle()
    assert.equal(app.rendered(home).refreshing, true)
    assertRetry(app, home, failed)
    pending.reject(new Error('network down'))
    await retry
    await app.advance(60000)
    assertRetry(app, home, failed)
    assert.equal(app.rendered(home).noRoom, false)

    route.reply(success(failed === 'periods' ? [period('p1', '2026-06-01')] : [memory('m1', '2026-06-02')]))
    await app.dispatch(home, 'retryRefresh')
    await app.settle()
    assertRetry(app, home, null)
    assertCalendar(app, home, ['2026-06-01'], ['2026-06-02'])
    assert.equal(app.rendered(home).monthSummaryLine, '本月 经期 1 天 · 欢乐时光 1 条')
    assert.equal(app.rendered(home).syncStatusText, '已同步')
  })
}

test('background partial and full failures preserve old records and the latest retry names the failed collection', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
  const m = listRoute(app, 'memories').reply(success([memory('m1', '2026-06-02')]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  p.reject(new Error('network down'))
  m.reply(success([memory('m1', '2026-06-02'), memory('m2', '2026-06-12')]))
  await showAgain(app)
  assertRetry(app, home, 'periods')
  assertCalendar(app, home, ['2026-06-01'], ['2026-06-02', '2026-06-12'])
  assert.equal(app.rendered(home).syncStatusText, '已保留旧经期数据')

  m.reject(new Error('network down'))
  await home.onPullDownRefresh()
  await app.settle()
  assertRetry(app, home, 'all')
  assertCalendar(app, home, ['2026-06-01'], ['2026-06-02', '2026-06-12'])
  assert.equal(app.rendered(home).syncStatusVisible, false)
  assert.equal(app.rendered(home).noRoom, false)
  assert.equal(app.platformCalls.stopPullDownRefresh.length, 1)

  p.reply(success([period('p2', '2026-06-20'), period('p1', '2026-06-01')]))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  assertRetry(app, home, 'memories')
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-02', '2026-06-12'])
  assert.equal(app.rendered(home).syncStatusText, '已保留上次的欢乐时光')

  m.reply(success([memory('m3', '2026-06-26')]))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  assertRetry(app, home, null)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], ['2026-06-26'])
  assert.equal(app.rendered(home).syncStatusText, '已同步')
})

test('show, pull-down and retry reuse one in-flight load; pull-down stops only after it completes', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
  const m = listRoute(app, 'memories').reply(success([]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '../pages/index/index.json'), 'utf8'))
  assert.equal(json.enablePullDownRefresh, true)
  p.reject(new Error('network down'))
  m.reject(new Error('network down'))
  await showAgain(app)
  assertRetry(app, home, 'all')

  const periods = p.defer()
  const memories = m.defer()
  const count = listCalls(app).length
  const pull = home.onPullDownRefresh()
  await app.settle()
  const retry = app.dispatch(home, 'retryRefresh')
  app.hide()
  app.show()
  await app.settle()
  assert.equal(listCalls(app).length, count + 2)
  assert.equal(app.rendered(home).refreshing, true)
  assert.equal(app.rendered(home).loading, false)
  assertCalendar(app, home, ['2026-06-01'], [])
  assert.equal(app.platformCalls.stopPullDownRefresh, undefined)
  memories.resolve(success([memory('m1', '2026-06-02')]))
  await app.settle()
  assert.equal(app.platformCalls.stopPullDownRefresh, undefined)
  periods.resolve(success([period('p2', '2026-06-20')]))
  await Promise.all([pull, retry])
  await app.settle()
  assertCalendar(app, home, ['2026-06-20'], ['2026-06-02'])
  assert.equal(app.rendered(home).refreshing, false)
  assert.equal(app.platformCalls.stopPullDownRefresh.length, 1)
  assertRetry(app, home, null)
})

async function saveMemory(app, home, record) {
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories' } }).reply({ code: 0, id: record._id, record })
  await app.dispatch(home, 'quickMemory')
  const edit = app.currentPage
  await app.dispatch(edit, 'onNoteInput', { detail: { value: record.note } })
  await app.dispatch(edit, 'save')
  await app.settle()
  return edit
}

test('an older background response cannot roll back a memory saved through the editor; a later load confirms it', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
  const m = listRoute(app, 'memories').reply(success([memory('m1', '2026-06-02')]))
  const saved = memory('saved', '2026-06-26', '测试新记录')
  const home = app.launch('/pages/index/index')
  await app.settle()
  const periods = p.defer()
  const memories = m.defer()
  await showAgain(app)
  await saveMemory(app, home, saved)
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  assertCalendar(app, home, ['2026-06-01'], ['2026-06-02', '2026-06-26'])
  assert.equal(app.rendered(home).syncStatusText, '已更新，正在同步')
  assert.equal(app.rendered(home).syncStatusVisible, true)

  memories.resolve(success([memory('m1', '2026-06-02')]))
  periods.resolve(success([period('p2', '2026-06-20')]))
  await app.settle()
  assertCalendar(app, home, ['2026-06-20'], ['2026-06-02', '2026-06-26'])
  assert.equal(app.rendered(home).syncStatusText, '已更新，正在同步')
  await app.advance(60000)
  assert.equal(app.rendered(home).syncStatusVisible, true)

  m.reply(success([saved, memory('m1', '2026-06-02')]))
  p.reply(success([period('p2', '2026-06-20')]))
  await showAgain(app)
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  assertCalendar(app, home, ['2026-06-20'], ['2026-06-02', '2026-06-26'])
})

test('a late snapshot cannot resurrect a memory deleted through its day detail; the next load confirms removal', async t => {
  const app = homeApp(t)
  const old = memory('deleted', '2026-06-02', '测试删除记录')
  const p = listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
  const m = listRoute(app, 'memories').reply(success([old]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  const periods = p.defer()
  const memories = m.defer()
  await showAgain(app)
  await app.dispatch(home, 'onDayTap', { currentTarget: { dataset: { date: old.date } } })
  await app.settle()
  await app.dispatch(home, 'onDayRecordTap', { currentTarget: { dataset: { kind: 'memory', id: old._id } } })
  await app.settle()
  app.cloud.when({ name: 'dataOp', data: { action: 'remove', collection: 'memories', id: old._id } }).reply({ code: 0 })
  await confirmDelete(app)
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  assertCalendar(app, home, ['2026-06-01'], [])
  assert.equal(app.rendered(home).syncStatusText, '已更新，正在同步')

  memories.resolve(success([old]))
  periods.resolve(success([period('p2', '2026-06-20')]))
  await app.settle()
  assertCalendar(app, home, ['2026-06-20'], [])
  assert.equal(app.rendered(home).monthSummaryLine, '本月 经期 1 天 · 欢乐时光 0 条')
  await app.advance(60000)
  assert.equal(app.rendered(home).syncStatusVisible, true)
  assert.equal(app.rendered(home).syncStatusText, '已更新，正在同步')

  m.reply(success([]))
  p.reply(success([period('p2', '2026-06-20')]))
  await showAgain(app)
  assertCalendar(app, home, ['2026-06-20'], [])
  assert.equal(app.rendered(home).syncStatusText, '已同步')
})

async function savePeriod(app, home, record) {
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'periods' } }).reply({ code: 0, id: record._id, record })
  await app.dispatch(home, 'quickPeriod')
  const edit = app.currentPage
  await app.dispatch(edit, 'onStartChange', { detail: { value: record.startDate } })
  await app.dispatch(edit, 'selectStatus', { currentTarget: { dataset: { value: 'known-end' } } })
  await app.dispatch(edit, 'onEndChange', { detail: { value: record.endDate } })
  await app.dispatch(edit, 'save')
  await app.settle()
}

test('a stale first period snapshot never replaces the locally saved period, and the same load reads the periods again', async t => {
  const app = homeApp(t)
  listRoute(app, 'periods').reject(new Error('network down'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).hasRecords, true)
  assert.equal(app.rendered(home).monthSummaryLine, '本月 经期未同步 · 欢乐时光 0 条')
  // A new period waits for the shared records to try the unread periods once, so it is saved before
  // the first snapshot starts; editing it (no wait) is the local change while that snapshot is on its way.
  const saved = period('saved', '2026-06-20')
  const edited = { ...saved, note: '补一句' }
  await savePeriod(app, home, saved)
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  // The periods the server lists once the edit below has landed; the deferred list was read before it.
  const p = listRoute(app, 'periods').reply(success([edited, period('old', '2026-06-01')]))
  const pending = p.defer()
  app.dispatch(home, 'retryRefresh')
  await app.settle()
  app.cloud.when({ name: 'dataOp', data: { action: 'update', collection: 'periods' } }).reply({ code: 0, record: edited })
  await app.dispatch(home, 'onDayTap', { currentTarget: { dataset: { date: saved.startDate } } })
  await app.settle()
  await app.dispatch(home, 'onDayRecordTap', { currentTarget: { dataset: { kind: 'period', id: saved._id } } })
  await app.settle()
  await app.dispatch(app.currentPage, 'onNoteInput', { detail: { value: edited.note } })
  await app.dispatch(app.currentPage, 'save')
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  assertCalendar(app, home, ['2026-06-20'], [])
  const lists = listCalls(app).length
  const frames = home.setDataCalls.length
  pending.resolve(success([period('old', '2026-06-01')]))
  await app.settle()
  const calendars = home.setDataCalls.slice(frames).filter(patch => patch.days)
  assert.ok(calendars.length > 0)
  assert.ok(calendars.every(patch => patch.days.some(day => day.date === '2026-06-20' && day.isPeriod)), 'the stale snapshot never replaces the saved period')
  assert.equal(listCalls(app).length, lists + 2, 'the set-aside periods are read again within the same load')
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], [])
  assert.equal(app.rendered(home).monthSummaryLine, '本月 经期 2 天 · 欢乐时光 0 条')
  assert.equal(app.rendered(home).syncStatusText, '已同步')
})

test('F2: a locally saved ongoing period stays unsynced until a complete list restores its status and counts', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reject(new Error('network down'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  const saved = { _id: 'local-live', startDate: '2026-06-20', endDate: '', status: 'ongoing' }
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'periods' } }).reply({ code: 0, id: saved._id, record: saved })
  await app.dispatch(home, 'quickPeriod')
  const edit = app.currentPage
  await app.dispatch(edit, 'onStartChange', { detail: { value: saved.startDate } })
  await app.dispatch(edit, 'selectStatus', { currentTarget: { dataset: { value: 'ongoing' } } })
  await app.dispatch(edit, 'save')
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  assert.equal(app.rendered(home).hasRecords, true)
  assert.equal(app.rendered(home).homeStatus.text, '经期未同步，暂不预测')
  assert.equal(app.rendered(home).periodQuickLabel, '记结束')
  assert.equal(app.rendered(home).periodQuickAriaLabel, '记结束')
  assert.equal(Object.hasOwn(app.rendered(home), 'ongoingCompletionReminder'), false)
  assert.equal(Object.hasOwn(app.rendered(home), 'cycleReminders'), false)
  assert.equal(app.rendered(home).monthSummaryLine, '本月 经期未同步 · 欢乐时光 0 条')
  const today = app.rendered(home).days.find(day => day.date === '2026-06-26')
  assert.equal(today.isPeriod, true)
  assert.equal(today.ariaLabel, '6月26日 周五 五月十二 今天 经期记录 经期进行中')
  await app.dispatch(home, 'onDayTap', { currentTarget: { dataset: { date: '2026-06-26' } } })
  await app.settle()
  assert.equal(app.rendered(home).selectedDateLabel, '6月26日 周五')
  assert.equal(app.rendered(home).selectedDayDetail.periods[0].range, '6月20日–6月26日（进行中）')
  assert.doesNotMatch(JSON.stringify(app.rendered(home)), /经期第\s*\d+\s*天/)
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  app.show()
  await app.settle()
  assert.equal(Object.hasOwn(app.rendered(home), 'ongoingCompletionReminder'), false)

  p.reply(success([saved]))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  const synced = app.rendered(home)
  assert.equal(synced.homeStatus.text, '经期第 7 天 · 比预期多 2 天')
  assert.equal(synced.periodQuickLabel, '经期第 7 天 · 记结束')
  assert.equal(synced.days.find(day => day.date === '2026-06-26').ariaLabel, '6月26日 周五 五月十二 今天 经期第7天 经期进行中')
  assert.equal(synced.monthSummaryLine, '本月 经期 7 天 · 欢乐时光 0 条')
  assert.equal(Object.hasOwn(synced, 'ongoingCompletionReminder'), false)
  assert.equal(Object.hasOwn(synced, 'cycleReminders'), false)
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
})

test('a partial failure preserves a saved period until retry confirms it; a total failure keeps a retry after the pill hides', async t => {
  const app = homeApp(t)
  const old = period('p1', '2026-06-01')
  const saved = period('p2', '2026-06-20')
  const p = listRoute(app, 'periods').reply(success([old]))
  const m = listRoute(app, 'memories').reply(success([]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  await savePeriod(app, home, saved)
  p.reject(new Error('network down'))
  await app.advance(1000)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], [])
  assertRetry(app, home, 'periods')
  assert.equal(app.rendered(home).syncStatusText, '已保留旧经期数据')
  await app.advance(60000)
  assert.equal(app.rendered(home).syncStatusVisible, true)

  m.reject(new Error('network down'))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  assert.equal(app.rendered(home).syncStatusText, '同步失败，稍后重试')
  assertRetry(app, home, 'all')
  await app.advance(1800)
  assert.equal(app.rendered(home).syncStatusMounted, false)
  assertRetry(app, home, 'all')
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], [])

  p.reply(success([saved, old]))
  m.reply(success([]))
  await app.dispatch(home, 'retryRefresh')
  await app.settle()
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  assertRetry(app, home, null)
  assertCalendar(app, home, ['2026-06-01', '2026-06-20'], [])
})

test('a merged save updates the existing ongoing period without duplicating the calendar recap', async t => {
  const app = homeApp(t)
  const ongoing = { _id: 'ongoing', startDate: '2026-06-18', endDate: '', status: 'ongoing', note: '已经记录过的经期' }
  listRoute(app, 'periods').reply(success([ongoing, period('old', '2026-05-01')]))
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'periods' } })
    .reply({ code: 0, id: ongoing._id, reopened: true, record: ongoing })
  const home = app.launch('/pages/index/index')
  await app.settle()
  // A new form can be opened before another member's ongoing record is known.
  app.wx.navigateTo({ url: '/pages/period/edit/edit?startDate=2026-06-01&status=ongoing' })
  await app.settle()
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(app.currentPage, 'save')
  await app.settle()
  assert.equal(app.rendered(app.currentPage).note, '已经记录过的经期')
  const confirming = listRoute(app, 'periods').defer()
  await app.dispatch(app.currentPage, 'goBack')
  await app.settle()
  await app.dispatch(home, 'openMonthlyRecap')
  await app.settle()
  assert.equal(app.rendered(home).monthlyRecap.periodSummary, '本月记录了 1 次经期，共 9 天')
  assert.equal(app.rendered(home).periodQuickLabel, '经期第 9 天 · 记结束')
  confirming.resolve(success([ongoing, period('old', '2026-05-01')]))
  await app.settle()
})

test('an unbound homepage offers binding without requesting record collections', async t => {
  const app = homeApp(t, { storage: {} })
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).noRoom, true)
  assert.equal(app.rendered(home).roomStatusTitle, '还没绑定房间')
  assert.equal(app.rendered(home).roomStatusActionText, '去绑定')
  assert.equal(app.rendered(home).roomStatusAction, 'bind')
  assert.equal(listCalls(app).length, 0)
  await app.dispatch(home, 'handleRoomStatusAction')
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/bind/bind')
})

for (const [repair, title, actionText] of [
  [ROOM, '已重新连上房间', '重新加载'],
  [{ code: 0, room: null }, '已不在这个房间', '去绑定'],
  [{ code: -1, msg: 'network down' }, '房间同步失败', '重试']
]) {
  test(`background Room repair shows ${title} until its visible action is taken`, async t => {
    const app = homeApp(t)
    const p = listRoute(app, 'periods').reply(success([period('p1', '2026-06-01')]))
    const m = listRoute(app, 'memories').reply(success([]))
    const home = app.launch('/pages/index/index')
    await app.settle()
    app.cloud.when('getMyRoom').reply(repair)
    p.reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
    m.reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
    await showAgain(app)
    assert.equal(app.rendered(home).noRoom, true)
    assert.equal(app.rendered(home).loading, false)
    assert.equal(app.rendered(home).roomStatusTitle, title)
    assert.equal(app.rendered(home).roomStatusActionText, actionText)
    assert.equal(app.rendered(home).refreshRetryVisible, false)
    assert.equal(app.rendered(home).syncStatusVisible, false)
    if (actionText === '去绑定') {
      await app.dispatch(home, 'handleRoomStatusAction')
      await app.settle()
      assert.equal(app.currentPage.route, 'pages/bind/bind')
    } else {
      app.cloud.when('getMyRoom').reply(ROOM)
      p.reply(success([]))
      m.reply(success([]))
      app.dispatch(home, 'handleRoomStatusAction')
      await app.settle()
      assert.equal(app.rendered(home).noRoom, false)
      assert.equal(app.rendered(home).hasRecords, false)
    }
  })
}

test('each home show reads the two lists and makes no Room lookup', async t => {
  const app = homeApp(t)
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).loading, false)
  assert.deepEqual(app.cloud.calls.map(call => [call.name, call.data.action, call.data.collection]), [
    ['dataOp', 'list', 'periods'], ['dataOp', 'list', 'memories']
  ])
  await showAgain(app)
  assert.equal(listCalls(app).length, 4)
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 0)
})

test('home invitation and sharing follow unknown, waiting and paired status', async t => {
  for (const [label, roomStatus] of [['unknown', null], ['waiting', 'waiting'], ['paired', 'paired']]) {
    await t.test(label, async t => {
      const app = homeApp(t)
      listRoute(app, 'periods').reply(listed([], roomStatus))
      listRoute(app, 'memories').reply(listed([], roomStatus))
      const home = app.launch('/pages/index/index')
      await app.settle()

      assert.equal(app.rendered(home).roomStatus, roomStatus || '')
      assert.equal(app.rendered(home).partnerInvite, roomStatus === 'waiting')
      assert.ok(app.platformCalls.hideShareMenu.length >= 1)
      assert.equal((app.platformCalls.showShareMenu || []).length, roomStatus === 'waiting' ? 1 : 0)
      const card = app.share(home)
      if (roomStatus === 'waiting') {
        assert.deepEqual(card, {
          title: '邀请你加入我的日历',
          path: '/pages/bind/bind?roomCode=ROOM01',
          imageUrl: '/images/invite-card.png'
        })
      } else {
        assert.deepEqual(card, {
          title: '美少女的日历',
          path: '/pages/bind/bind',
          imageUrl: '/images/invite-card.png'
        })
        assert.equal(JSON.stringify(card).includes('ROOM01'), false)
      }
    })
  }
})

test('waiting-to-paired replaces the invitation with one welcome and no Home toast', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(listed([], 'waiting'))
  const m = listRoute(app, 'memories').reply(listed([], 'waiting'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(app.rendered(home).partnerInvite, true)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.deepEqual(app.wx.toasts, [])
  p.reply(listed([], 'paired'))
  m.reply(listed([], 'paired'))
  await showAgain(app)
  assert.equal(app.rendered(home).partnerInvite, false)
  assert.equal(app.rendered(home).partnerWelcome, true)
  assert.equal(app.storage.partnerWelcome, 'seen')
  assert.deepEqual(app.wx.toasts, [])
  await showAgain(app)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.deepEqual(app.wx.toasts, [])
  // A list without a status (dataOp not yet deployed or rolled back) is no new input.
  p.reply(success([]))
  m.reply(success([]))
  await showAgain(app)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(app.rendered(home).noRoom, false)
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 0)
})

test('after Settings announces TA, a Home load that brings back no status does not set up a second announcement', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(listed([], 'waiting'))
  const m = listRoute(app, 'memories').reply(listed([], 'waiting'))
  app.launch('/pages/index/index')
  await app.settle()
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'paired' } })
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  assert.deepEqual(app.wx.toasts.map(toast => toast.title), ['TA 已加入'])
  p.reject(new Error('network down'))
  m.reject(new Error('network down'))
  app.wx.switchTab({ url: '/pages/index/index' })
  await app.settle()
  p.reply(listed([], 'paired'))
  m.reply(listed([], 'paired'))
  await showAgain(app)
  assert.deepEqual(app.wx.toasts.map(toast => toast.title), ['TA 已加入'])
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 1, 'only Settings looks the Room up')
})

test('one paired list in a load shared by pull-down and show marks the welcome once without a toast', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(listed([], 'waiting'))
  const m = listRoute(app, 'memories').reply(listed([], 'waiting'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  const periods = p.defer()
  m.reply(listed([], 'paired'))
  const pull = home.onPullDownRefresh()
  app.hide()
  app.show()
  await app.settle()
  assert.deepEqual(app.wx.toasts, [])
  periods.reject(new Error('network down'))
  await pull
  await app.settle()
  assert.equal(app.rendered(home).partnerWelcome, true)
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(listCalls(app).length, 4)
})

// Spec decision 24: a load's prompts come only from the page that started it, and only while that page is shown.
test('a Home hidden when lists bring back paired waits until the next shown load to render the welcome once', async t => {
  const app = homeApp(t, { storage: { roomCode: 'ROOM01', roomStatusSeen: 'waiting' } })
  const periods = listRoute(app, 'periods').defer()
  const memories = listRoute(app, 'memories').defer()
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.wx.switchTab({ url: '/pages/period/period' })
  await app.settle()
  assert.equal(listCalls(app).length, 2, 'the record tab shares the load Home started')
  periods.resolve(listed([], 'paired'))
  memories.resolve(listed([], 'paired'))
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/period/period')
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(app.storage.partnerWelcome || '', '')

  listRoute(app, 'periods').reply(listed([], 'paired'))
  listRoute(app, 'memories').reply(listed([], 'paired'))
  app.wx.switchTab({ url: '/pages/index/index' })
  await app.settle()
  assert.equal(app.currentPage, home)
  assert.equal(app.rendered(home).partnerWelcome, true)
  assert.deepEqual(app.wx.toasts, [])
  await showAgain(app)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.deepEqual(app.wx.toasts, [])
})

test('partner welcome waits for successful loading and a render commit, lasts this visit and is not repeated', async t => {
  const app = homeApp(t, { autoCommit: false, storage: { roomCode: 'ROOM01', partnerWelcome: 'pending' } })
  const p = listRoute(app, 'periods').reply(success([]))
  const m = listRoute(app, 'memories').reply(success([]))
  const pending = p.defer()
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).loading, true)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.equal(app.storage.partnerWelcome, 'pending')
  pending.reject(new Error('network down'))
  m.reject(new Error('network down'))
  await app.settle()
  // The other collection succeeded: partial success still renders a calendar.
  assert.equal(app.storage.partnerWelcome, 'pending')
  app.commit(home)
  assert.equal(app.rendered(home).partnerWelcome, true)
  assert.equal(app.storage.partnerWelcome, 'seen')
  await app.dispatch(home, 'nextMonth')
  app.commit(home)
  assert.equal(app.rendered(home).partnerWelcome, true)
  p.reply(success([]))
  m.reply(success([]))
  await showAgain(app)
  app.commit(home)
  assert.equal(app.rendered(home).partnerWelcome, false)
  app.wx.reLaunch({ url: '/pages/index/index' })
  await app.settle()
  app.commit(app.currentPage)
  assert.equal(app.rendered(app.currentPage).partnerWelcome, false)
  assert.equal(app.storage.partnerWelcome, 'seen')
})

test('a failure screen leaves partner welcome pending until a retry renders the calendar', async t => {
  const app = homeApp(t, { autoCommit: false, storage: { roomCode: 'ROOM01', partnerWelcome: 'pending' } })
  const p = listRoute(app, 'periods').reject(new Error('network down'))
  const m = listRoute(app, 'memories').reject(new Error('network down'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).noRoom, true)
  assert.equal(app.rendered(home).partnerWelcome, false)
  assert.equal(app.storage.partnerWelcome, 'pending')
  p.reply(success([]))
  m.reply(success([]))
  app.dispatch(home, 'handleRoomStatusAction')
  await app.settle()
  assert.equal(app.storage.partnerWelcome, 'pending')
  app.commit(home)
  assert.equal(app.rendered(home).partnerWelcome, true)
  assert.equal(app.storage.partnerWelcome, 'seen')
})

test('remote changes mount the pill closed, enter after render, and retain copy until the timed exit completes', async t => {
  const app = homeApp(t, { autoCommit: false })
  const p = listRoute(app, 'periods').reply(success([]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.commit(home)
  await app.settle()
  app.commit(home)
  p.reject(new Error('network down'))
  const m = listRoute(app, 'memories').reject(new Error('network down'))
  await showAgain(app)
  app.commit(home)
  p.reply(success([period('p1', '2026-06-01')]))
  m.reply(success([]))
  await app.dispatch(home, 'retryRefresh')
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusMounted, true)
  assert.equal(app.rendered(home).syncStatusPhase, 'closed')
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'open')
  await app.advance(1599)
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'open')
  await app.advance(1)
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'leaving')
  assert.equal(app.rendered(home).syncStatusMounted, true)
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  await app.advance(199)
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusMounted, true)
  await app.advance(1)
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusMounted, false)
  assert.equal(app.rendered(home).syncStatusPhase, 'closed')
  assert.equal(app.rendered(home).syncStatusText, '')
})

test('a saved record reopens a leaving sync pill and confirmation updates its copy without remounting', async t => {
  const app = homeApp(t)
  const p = listRoute(app, 'periods').reply(success([]))
  const m = listRoute(app, 'memories').reply(success([]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  p.reply(success([period('p1', '2026-06-01')]))
  await showAgain(app)
  await app.advance(1700)
  assert.equal(app.rendered(home).syncStatusPhase, 'leaving')
  const saved = memory('saved', '2026-06-26', '测试重开胶囊')
  await saveMemory(app, home, saved)
  assert.equal(app.rendered(home).syncStatusPhase, 'open')
  assert.equal(app.rendered(home).syncStatusMounted, true)
  assert.equal(app.rendered(home).syncStatusText, '已更新，正在同步')
  await app.advance(200)
  assert.equal(app.rendered(home).syncStatusMounted, true)
  m.reply(success([saved]))
  await app.advance(800)
  assert.equal(app.currentPage, home)
  assert.equal(app.rendered(home).syncStatusPhase, 'open')
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  assert.equal(app.rendered(home).syncStatusMounted, true)
})

test('another quiet show can reverse sync-pill entry before the render callback opens it', async t => {
  const app = homeApp(t, { autoCommit: false })
  const p = listRoute(app, 'periods').reply(success([]))
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.commit(home)
  await app.settle()
  app.commit(home)
  p.reject(new Error('network down'))
  const m = listRoute(app, 'memories').reject(new Error('network down'))
  await showAgain(app)
  app.commit(home)
  p.reply(success([period('p1', '2026-06-01')]))
  m.reply(success([]))
  await app.dispatch(home, 'retryRefresh')
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'closed')
  // A new lifecycle starts before the scheduled nextTick opens the pill.
  app.hide()
  app.show()
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'leaving')
  assert.equal(app.rendered(home).syncStatusVisible, false)
  assert.equal(app.rendered(home).syncStatusText, '已同步')
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusPhase, 'leaving')
  await app.advance(200)
  app.commit(home)
  assert.equal(app.rendered(home).syncStatusMounted, false)
  assert.equal(app.rendered(home).syncStatusText, '')
})

// August 2026 has six actual calendar rows. At 375 x 619 the existing
// geometry contract is 55.33px without an extra row, 54px with welcome/retry.
for (const banner of ['welcome', 'retry']) {
  test(`${banner} reserves calendar space and gives it back when cleared`, async t => {
    const app = homeApp(t, {
      now: '2026-08-26T12:00:00+08:00',
      windowInfo: { windowWidth: 375, windowHeight: 619 },
      storage: { roomCode: 'ROOM01', ...(banner === 'welcome' ? { partnerWelcome: 'pending' } : {}) }
    })
    const m = listRoute(app, 'memories').reply(success([]))
    if (banner === 'retry') m.reject(new Error('network down'))
    const home = app.launch('/pages/index/index')
    await app.settle()
    assert.equal(app.rendered(home).calendarRowHeightPx, 54)
    assert.equal(app.rendered(home).calendarInfoMerged, true)
    if (banner === 'welcome') {
      await app.dispatch(home, 'nextMonth')
      await app.dispatch(home, 'prevMonth')
      await app.settle()
      assert.equal(app.rendered(home).calendarRowHeightPx, 54)
      await showAgain(app)
      assert.equal(app.rendered(home).partnerWelcome, false)
    } else {
      assertRetry(app, home, 'memories')
      m.reply(success([]))
      await app.dispatch(home, 'retryRefresh')
      await app.settle()
      assertRetry(app, home, null)
    }
    assert.equal(app.rendered(home).calendarRowHeightPx, 55.33)
    if (banner === 'retry') {
      listRoute(app, 'periods').reject(new Error('network down'))
      m.reject(new Error('network down'))
      await showAgain(app)
      assertRetry(app, home, 'all')
      assert.equal(app.rendered(home).calendarRowHeightPx, 54)
    }
  })
}
