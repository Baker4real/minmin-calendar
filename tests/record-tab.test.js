const assert = require('node:assert/strict')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')

const route = '/pages/period/period'
const dataset = value => ({ currentTarget: { dataset: value } })
const list = (app, collection) => app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
const listCalls = app => app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action === 'list')
const roomLookups = app => app.cloud.calls.filter(call => call.name === 'getMyRoom').length
const writes = (page, key) => page.setDataCalls.filter(patch => key in patch).map(patch => patch[key])
const groupAuthors = groups => groups.flatMap(group => group.records.map(row => row.authorLabel))
const periodGroupAuthors = years => years.flatMap(year => groupAuthors(year.months))

// No getMyRoom rule by default: the tab takes pairing from its list replies (#191), so a Room
// lookup from a bound tab fails loudly as an unprogrammed cloud call.
function setup(t, { segment = 'period', ...options } = {}) {
  const app = createMiniProgram({ now: '2026-10-20T12:00:00+08:00', ...options, storage: { roomCode: 'ROOM01', recordTabSegment: segment, ...options.storage } })
  t.after(() => app.teardown())
  list(app, 'periods').reply({ code: 0, data: [] })
  list(app, 'memories').reply({ code: 0, data: [] })
  return app
}

const segments = [
  { segment: 'period', collection: 'periods', loading: 'loading', failed: 'loadFailed', loaded: 'hasLoaded', retry: 'loadData', record: { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' } },
  { segment: 'memory', collection: 'memories', loading: 'memoryLoading', failed: 'memoryLoadFailed', loaded: 'memoryHasLoaded', retry: 'loadMemoryData', record: { _id: 'm1', date: '2026-06-01', note: '测试记录' } }
]

for (const spec of segments) {
  test(`${spec.segment}: first failure stays unknown, cancel exposes retry, and tapping it loads records`, async (t) => {
    const app = setup(t, spec)
    const pending = list(app, spec.collection).defer()
    const page = app.launch(route)
    await app.settle()
    assert.equal(page.data[spec.loading], true)
    assert.equal(page.data[spec.loaded], false)
    pending.reject(new Error('network down'))
    await app.settle()
    const modal = app.wx.modals.at(-1)
    assert.equal(modal.title, '加载失败')
    assert.equal(modal.content, '加载失败，请检查网络')
    assert.equal(modal.confirmText, '重试')
    app.respond('showModal', 0, { confirm: false, cancel: true })
    await app.settle()
    assert.equal(page.data[spec.failed], true)
    assert.equal(page.data[spec.loaded], false)
    assert.equal(page.data[spec.loading], false)
    assert.deepEqual(page.data[spec.collection], [])
    list(app, spec.collection).reply({ code: 0, data: [spec.record] })
    await app.dispatch(page, spec.retry)
    await app.flush()
    assert.equal(page.data[spec.failed], false)
    assert.equal(page.data[spec.loaded], true)
    assert.equal(page.data[spec.collection][0]._id, spec.record._id)
    assert.deepEqual(listCalls(app).map(call => call.data.collection), [spec.collection, spec.collection])
  })

  test(`${spec.segment}: confirming retry reloads only the failed collection`, async (t) => {
    const app = setup(t, spec)
    const pending = list(app, spec.collection).defer()
    const page = app.launch(route)
    await app.settle()
    pending.reject(new Error('network down'))
    await app.settle()
    list(app, spec.collection).reply({ code: 0, data: [spec.record] })
    app.respond('showModal', 0, { confirm: true })
    await app.flush()
    assert.equal(page.data[spec.failed], false)
    assert.equal(page.data[spec.loaded], true)
    assert.equal(page.data[spec.collection][0]._id, spec.record._id)
    assert.equal(app.wx.toasts.length, 0)
    assert.deepEqual(listCalls(app).map(call => call.data.collection), [spec.collection, spec.collection])
  })

  const populated = spec.segment === 'period'
    ? [spec.record, { _id: 'p2', startDate: '2026-07-03', endDate: '2026-07-07' }]
    : [spec.record]
  for (const records of [[], populated]) {
    test(`${spec.segment}: refresh preserves ${records.length ? 'rows and stats' : 'confirmed empty state'} and stops on success and failure`, async (t) => {
      const app = setup(t, spec)
      list(app, spec.collection).reply({ code: 0, data: records })
      const page = app.launch(route)
      await app.flush()
      assert.equal(page.data[spec.loaded], true)
      if (spec.segment === 'memory' && records.length) {
        await app.dispatch(page, 'toggleMonth', dataset({ key: '2026-06' }))
      }
      const before = structuredClone(page.data[spec.segment === 'period' ? 'periods' : 'memoryGroups'])
      const stats = [page.data.avgCycle, page.data.avgDuration]
      if (spec.segment === 'period' && records.length) assert.deepEqual(stats, [32, 5])
      const pending = list(app, spec.collection).defer()
      const refresh = page.onPullDownRefresh()
      await app.settle()
      assert.equal(page.data[spec.loading], true)
      assert.equal(app.platformCalls.stopPullDownRefresh, undefined)
      pending.resolve({ code: 0, data: records })
      await refresh
      await app.settle()
      assert.equal(page.data[spec.loading], false)
      assert.equal(app.platformCalls.stopPullDownRefresh.length, 1)
      list(app, spec.collection).reject(new Error('network down'))
      app.respondNext('showModal', { confirm: false, cancel: true })
      await page.onPullDownRefresh()
      await app.settle()
      assert.equal(app.platformCalls.stopPullDownRefresh.length, 2)
      assert.equal(page.data[spec.failed], true)
      assert.equal(page.data[spec.loaded], true)
      assert.equal(page.data[spec.loading], false)
      assert.deepEqual(page.data[spec.segment === 'period' ? 'periods' : 'memoryGroups'], before)
      assert.deepEqual([page.data.avgCycle, page.data.avgDuration], stats)
      assert.deepEqual(listCalls(app).map(call => call.data.collection), Array(3).fill(spec.collection))
      list(app, spec.collection).reply({ code: 0, data: records })
      await app.dispatch(page, spec.retry)
      assert.equal(page.data[spec.failed], false)
    })
  }
}

test('segment intent is consumed once, only the selected list loads, and failure states stay independent', async (t) => {
  const app = setup(t, { segment: 'memory' })
  const page = app.launch(route)
  await app.flush()
  assert.equal(page.data.segment, 'memory')
  assert.equal(app.storage.recordTabSegment, undefined)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), ['memories'])
  list(app, 'periods').reject(new Error('network down'))
  app.respondNext('showModal', { confirm: false })
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  assert.equal(page.data.loadFailed, true)
  assert.equal(page.data.memoryLoadFailed, false)
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'unknown' }))
  assert.equal(page.data.segment, 'memory')
  assert.deepEqual(listCalls(app).map(call => call.data.collection), ['memories', 'periods', 'memories'])
  list(app, 'periods').reply({ code: 0, data: [] })
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  app.hide()
  app.show()
  await app.flush()
  assert.equal(page.data.segment, 'period', 'consumed memory intent must not hijack the later visit')
  assert.equal(page.data.loadFailed, false)
})

test('legacy memory route redirects to the real record tab and loads its memory segment once', async (t) => {
  const app = setup(t)
  list(app, 'memories').reply({ code: 0, data: [{ _id: 'm1', date: '2026-06-01', note: '测试记录' }] })
  app.launch('/pages/memory/memory')
  await app.flush()
  assert.equal(app.currentPage.route, 'pages/period/period')
  assert.equal(app.currentPage.data.segment, 'memory')
  assert.equal(app.currentPage.data.memoryGroups[0].records[0].note, '测试记录')
  assert.equal(app.storage.recordTabSegment, undefined)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), ['memories'])
  assert.ok(app.navigation.some(item => item.method === 'switchTab' && item.url === route))
})

test('record tab restores the tab bar and resumes decorations before a delayed list settles', async (t) => {
  const app = setup(t)
  const pending = list(app, 'periods').defer()
  app.wx.hideTabBar({ animation: false })
  const page = app.launch(route)
  await app.settle()
  assert.equal(app.tabBar.visible, true)
  assert.ok(!page.data.pageHidden)
  assert.equal(page.data.loading, true)
  assert.equal(page.setDataCalls.some(patch => 'pageHidden' in patch), false)
  app.hide()
  const hiddenWrites = page.setDataCalls.length
  app.hide()
  assert.equal(page.data.pageHidden, true)
  assert.equal(page.setDataCalls.slice(hiddenWrites).some(patch => 'pageHidden' in patch), false)
  const second = list(app, 'periods').defer()
  app.show()
  assert.equal(page.data.pageHidden, false)
  const shownWrites = page.setDataCalls.length
  const third = list(app, 'periods').defer()
  app.show()
  assert.equal(page.setDataCalls.slice(shownWrites).some(patch => 'pageHidden' in patch), false)
  pending.resolve({ code: 0, data: [] })
  second.resolve({ code: 0, data: [] })
  third.resolve({ code: 0, data: [] })
  await app.flush()
})

const periodCases = [
  { name: 'inclusive durations override stored numbers and enable prediction', records: [
    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', duration: 2 },
    { _id: 'p2', startDate: '2026-06-30', endDate: '2026-07-04', duration: 9 }
  ], rows: [['p2', '6月30日–7月4日', '5天'], ['p1', '6月1日–6月5日', '5天']], cycle: 29, duration: 5 },
  { name: 'legacy unknown ends do not inflate the fallback average', records: [
    { _id: 'done', startDate: '2026-06-01', endDate: '2026-06-05', duration: 99 },
    { _id: 'unknown', startDate: '2026-08-12', duration: 9 }
  ], rows: [['unknown', '8月12日', '结束日期不详'], ['done', '6月1日–6月5日', '5天']], cycle: null, duration: 5 },
  { name: 'ongoing and unknown ends contribute no duration', records: [
    { _id: 'done', startDate: '2026-06-01', endDate: '2026-06-03' },
    { _id: 'unknown', startDate: '2026-07-01', status: 'unknown-end', duration: 9 },
    { _id: 'live', startDate: '2026-10-18', status: 'ongoing', duration: 9 }
  ], rows: [['live', '10月18日–10月20日', '进行中'], ['unknown', '7月1日', '结束日期不详'], ['done', '6月1日–6月3日', '3天']], duration: 3 },
  { name: 'no known end keeps the duration unknown even with a default prediction', records: [
    { _id: 'a', startDate: '2026-07-01', status: 'unknown-end', duration: 9 },
    { _id: 'b', startDate: '2026-07-29', status: 'unknown-end', duration: 9 }
  ], cycle: 28, duration: null },
  { name: 'impossible dates do not contribute to duration', records: [
    { _id: 'valid', startDate: '2026-08-01', endDate: '2026-08-05', duration: 5 },
    { _id: 'bad-start', startDate: '2026-08-32', endDate: '2026-09-02', duration: 9 },
    { _id: 'bad-end', startDate: '2026-08-10', endDate: '2026-08-32', duration: 7 }
  ], duration: 5 }
]
for (const scenario of periodCases) {
  test(`period rows: ${scenario.name}`, async (t) => {
    const app = setup(t)
    list(app, 'periods').reply({ code: 0, data: scenario.records })
    const page = app.launch(route)
    await app.flush()
    if (scenario.rows) assert.deepEqual(page.data.periods.map(row => [row._id, row.dateLabel, row.durationText]), scenario.rows)
    assert.equal(page.data.avgDuration, scenario.duration)
    if ('cycle' in scenario) assert.equal(page.data.avgCycle, scenario.cycle)
    assert.equal(page.data.periods.length, scenario.records.length)
  })
}

for (const status of ['paired', 'waiting', null, 'archived']) {
  test(`${status === null ? 'no status' : status}: rows name authors only when the lists bring back paired and same-day memories have distinct spoken labels`, async (t) => {
    const app = setup(t)
    const reply = data => status === null ? { code: 0, data } : { code: 0, roomStatus: status, data }
    list(app, 'periods').reply(reply([
      { _id: 'p-mine', startDate: '2026-09-01', endDate: '2026-09-03', createdByMe: true, flow: 'heavy', symptoms: ['cramps'] },
      { _id: 'p-theirs', startDate: '2026-08-01', endDate: '2026-08-03', createdByMe: false },
      { _id: 'p-old', startDate: '2026-07-01', endDate: '2026-07-02' }
    ]))
    list(app, 'memories').reply(reply([
      { _id: 'mine', date: '2026-09-18', note: '散步', createdByMe: true },
      { _id: 'theirs', date: '2026-09-18', note: ' ', createdByMe: false },
      { _id: 'old', date: '2026-09-02', note: '旧记录' }
    ]))
    const page = app.launch(route)
    await app.flush()
    assert.deepEqual(page.data.periods.map(row => row.authorLabel), status === 'paired' ? ['我记的', 'TA 记的', undefined] : [undefined, undefined, undefined])
    assert.equal(page.data.periods[0].flowLabel, '量多')
    assert.deepEqual(page.data.periods[0].symptomLabels, ['痛经'])
    await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
    const rows = page.data.memoryGroups.flatMap(group => group.records)
    assert.deepEqual(rows.map(row => row.ariaLabel), status === 'paired' ? [
      '编辑欢乐时光，9月18日，散步，我记的', '编辑欢乐时光，9月18日，TA 记的', '编辑欢乐时光，9月2日，旧记录'
    ] : ['编辑欢乐时光，9月18日，散步', '编辑欢乐时光，9月18日', '编辑欢乐时光，9月2日，旧记录'])
  })
}

test('each record tab show reads only its segment list, looks no Room up, and rows carry authors in their first render', async (t) => {
  const app = setup(t)
  list(app, 'periods').reply({ code: 0, roomStatus: 'paired', data: [
    { _id: 'p-mine', startDate: '2026-09-01', endDate: '2026-09-03', createdByMe: true },
    { _id: 'p-theirs', startDate: '2026-08-01', endDate: '2026-08-03', createdByMe: false }
  ] })
  list(app, 'memories').reply({ code: 0, roomStatus: 'paired', data: [
    { _id: 'mine', date: '2026-09-18', note: '散步', createdByMe: true },
    { _id: 'theirs', date: '2026-09-02', note: '', createdByMe: false }
  ] })
  const page = app.launch(route)
  await app.flush()
  assert.deepEqual(app.cloud.calls.map(call => [call.name, call.data.action, call.data.collection]), [['dataOp', 'list', 'periods']])
  assert.deepEqual(writes(page, 'periods').map(rows => rows.map(row => row.authorLabel)), [['我记的', 'TA 记的']])
  assert.deepEqual(writes(page, 'periodGroups').map(periodGroupAuthors), [['我记的', 'TA 记的']])
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.flush()
  assert.deepEqual(writes(page, 'memoryGroups').map(groupAuthors), [['我记的', 'TA 记的']])
  app.hide()
  app.show()
  await app.flush()
  assert.deepEqual(listCalls(app).map(call => call.data.collection), ['periods', 'memories', 'memories'])
  assert.deepEqual(writes(page, 'memoryGroups').map(groupAuthors), [['我记的', 'TA 记的'], ['我记的', 'TA 记的']], 'one row render per load')
  assert.equal(roomLookups(app), 0)
})

test('without a new status the tab keeps the Room\'s last pairing, while another Room starts unpaired', async (t) => {
  const app = setup(t)
  const memories = [{ _id: 'mine', date: '2026-09-18', note: '', createdByMe: true }]
  list(app, 'periods').reply({ code: 0, roomStatus: 'paired', data: [] })
  list(app, 'memories').reply({ code: 0, data: memories })
  const page = app.launch(route)
  await app.flush()
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.flush()
  assert.deepEqual(groupAuthors(page.data.memoryGroups), ['我记的'], 'same Room: the periods list already said paired')
  // This device now holds another Room whose list brings back no status.
  app.wx.setStorageSync('roomCode', 'ROOM02')
  await page.onPullDownRefresh()
  await app.flush()
  assert.equal(listCalls(app).at(-1).data.roomCode, 'ROOM02')
  assert.deepEqual(groupAuthors(page.data.memoryGroups), [undefined])
  list(app, 'memories').reply({ code: 0, roomStatus: 'paired', data: memories })
  await page.onPullDownRefresh()
  await app.flush()
  assert.deepEqual(groupAuthors(page.data.memoryGroups), ['我记的'])
  assert.equal(roomLookups(app), 0)
})

test('memory month cards sort across years, preserve same-day records and match the calendar recap count', async (t) => {
  const app = setup(t, { segment: 'memory' })
  const records = [
    { _id: 'nye', date: '2025-12-31', note: '跨年烟花' },
    { _id: 'first', date: '2026-10-01', note: '十月第一天' },
    { _id: 'a1', date: '2026-10-08', note: '海边散步' },
    { _id: 'a2', date: '2026-10-08', note: '' },
    { _id: 'sep', date: '2026-09-30', note: '月末晚餐' }
  ]
  list(app, 'memories').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  const groups = page.data.memoryGroups
  assert.deepEqual(groups.map(group => [group.key, group.title]), [
    ['2026-10', '2026年10月 · 3 条'], ['2026-09', '2026年9月 · 1 条'], ['2025-12', '2025年12月 · 1 条']
  ])
  assert.deepEqual(groups[0].records.map(row => [row._id, row.dayLabel]), [['a1', '10月8日'], ['a2', '10月8日'], ['first', '10月1日']])
  assert.equal(groups[0].records[1].note, '')
  assert.equal(groups[0].ariaLabel, '2026年10月，3 条欢乐时光，已展开')
  assert.equal(groups[2].records[0].dayLabel, '2025年12月31日')
  const { buildHomeCalendarState } = require('../utils/homeCalendarState')
  const projection = buildHomeCalendarState({ year: 2026, month: 9, today: '2026-10-20', periods: [], memories: records })
  assert.equal(projection.monthlyRecap.memorySummary, '留下 3 条欢乐时光')
  assert.equal(groups[0].count, 3)
})

test('period year and month groups use the start month once, newest first, while preserving record identity and state', async (t) => {
  const app = setup(t)
  const records = [
    { _id: 'cross-year', startDate: '2024-12-28', endDate: '2025-01-02', note: '跨年合成记录' },
    { _id: 'cross-month', startDate: '2025-03-30', endDate: '2025-04-03', flow: 'heavy', symptoms: ['cramps'], createdByMe: false },
    { _id: 'same-a', startDate: '2025-03-30', status: 'unknown-end' },
    { _id: 'early', startDate: '2025-03-01', endDate: '2025-03-02' },
    { _id: 'january', startDate: '2025-01-12', endDate: '2025-01-12' },
    { _id: 'live', startDate: '2026-09-30', status: 'ongoing', createdByMe: true }
  ]
  list(app, 'periods').reply({ code: 0, roomStatus: 'paired', data: records })
  const page = app.launch(route)
  await app.flush()
  assert.deepEqual(page.data.periodGroups.map(year => [year.title, year.months.map(month => [month.key, month.title, month.records.map(row => row._id)])]), [
    ['2026年', [['2026-09', '9月', ['live']]]],
    ['2025年', [['2025-03', '3月', ['cross-month', 'same-a', 'early']], ['2025-01', '1月', ['january']]]],
    ['2024年', [['2024-12', '12月', ['cross-year']]]]
  ])
  const rows = page.data.periodGroups.flatMap(year => year.months.flatMap(month => month.records))
  assert.deepEqual(rows, page.data.periods)
  assert.deepEqual(rows.map(row => row.durationText), ['进行中', '5天', '结束日期不详', '2天', '1天', '6天'])
  assert.equal(rows[0].authorLabel, '我记的')
  assert.equal(rows[1].authorLabel, 'TA 记的')
  assert.equal(rows[1].flowLabel, '量多')
  assert.deepEqual(rows[1].symptomLabels, ['痛经'])
  assert.equal(rows.at(-1).note, '跨年合成记录')
  assert.equal(new Set(rows.map(row => row._id)).size, records.length)
})

for (const scenario of [
  { name: 'March to April', record: { _id: 'spec-cross-month', startDate: '2025-03-30', endDate: '2025-04-03' }, months: [[2025, 2, ['2025-03-30', '2025-03-31']], [2025, 3, ['2025-04-01', '2025-04-02', '2025-04-03']]] },
  { name: 'December to January', record: { _id: 'spec-cross-year', startDate: '2024-12-28', endDate: '2025-01-02' }, months: [[2024, 11, ['2024-12-28', '2024-12-29', '2024-12-30', '2024-12-31']], [2025, 0, ['2025-01-01', '2025-01-02']]] },
  { name: 'ongoing March through today in April', record: { _id: 'spec-live', startDate: '2026-03-30', status: 'ongoing' }, months: [[2026, 2, ['2026-03-30', '2026-03-31']], [2026, 3, ['2026-04-01', '2026-04-02']]] }
]) {
  test(`period grouping keeps one record while both calendar months retain coverage: ${scenario.name}`, async (t) => {
    const { buildHomeCalendarState } = require('../utils/homeCalendarState')
    const app = setup(t, { now: '2026-04-02T12:00:00+08:00' })
    list(app, 'periods').reply({ code: 0, data: [scenario.record] })
    const page = app.launch(route)
    await app.flush()
    assert.deepEqual(page.data.periodGroups.flatMap(year => year.months.map(month => [month.key, month.records.map(row => row._id)])), [[scenario.record.startDate.slice(0, 7), [scenario.record._id]]])
    for (const [year, month, dates] of scenario.months) {
      const state = buildHomeCalendarState({ year, month, today: '2026-04-02', periods: [scenario.record], memories: [] })
      assert.deepEqual(state.days.filter(day => day.isPeriod).map(day => day.date), dates)
    }
  })
}

const periodExpansion = page => page.data.periodGroups.flatMap(year => year.months.map(month => [month.key, month.expanded]))

test('period month choices are immediate, page-local and survive refresh failure and segment switches', async (t) => {
  const app = setup(t)
  const records = [
    { _id: 'recent', startDate: '2026-10-01', endDate: '2026-10-05' },
    { _id: 'older', startDate: '2025-10-01', status: 'unknown-end' }
  ]
  list(app, 'periods').reply({ code: 0, roomStatus: 'paired', data: records })
  const page = app.launch(route)
  await app.flush()
  assert.deepEqual(periodExpansion(page), [['2026-10', true], ['2025-10', true]])
  assert.equal(page.data.periodGroups[0].months[0].ariaLabel, '2026年10月，已展开，收起经期记录')
  const navigations = app.navigation.length
  const storage = structuredClone(app.storage)
  await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-10' }))
  assert.equal(app.navigation.length, navigations)
  assert.deepEqual(periodExpansion(page), [['2026-10', false], ['2025-10', true]])
  assert.equal(page.data.periodGroups[0].months[0].ariaLabel, '2026年10月，已收起，展开经期记录')
  assert.equal(page.data.periodGroups[0].months[0].toggleLabel, '展开')
  assert.deepEqual(app.storage, storage)
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  await page.onPullDownRefresh()
  const before = structuredClone(page.data.periodGroups)
  list(app, 'periods').reject(new Error('network down'))
  app.respondNext('showModal', { confirm: false })
  await page.onPullDownRefresh()
  assert.deepEqual(page.data.periodGroups, before)
  list(app, 'periods').reply({ code: 0, data: records })
  await app.dispatch(page, 'loadData')
  assert.deepEqual(periodExpansion(page), [['2026-10', false], ['2025-10', true]])
  app.wx.reLaunch({ url: route })
  await app.flush()
  assert.deepEqual(periodExpansion(app.currentPage), [['2026-10', true], ['2025-10', true]])
  list(app, 'periods').reply({ code: 0, data: [] })
  await app.dispatch(app.currentPage, 'loadData')
  assert.deepEqual(app.currentPage.data.periodGroups, [])
  assert.equal(app.currentPage.data.loadFailed, false)
})

test('period years collapse independently, retain month choices across refresh and reset on a new page', async (t) => {
  const app = setup(t)
  const records = [
    { _id: 'oct', startDate: '2026-10-01', endDate: '2026-10-05' },
    { _id: 'sep', startDate: '2026-09-01', status: 'unknown-end' },
    { _id: 'old', startDate: '2025-12-28', endDate: '2026-01-02' }
  ]
  list(app, 'periods').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  const years = () => page.data.periodGroups.map(year => [year.key, year.expanded])
  assert.deepEqual(years(), [['2026', true], ['2025', true]])
  await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-09' }))
  const storage = structuredClone(app.storage)
  const navigations = app.navigation.length
  await app.dispatch(page, 'togglePeriodYear', dataset({ key: '2026' }))
  assert.deepEqual(years(), [['2026', false], ['2025', true]])
  assert.equal(page.data.periodGroups[0].ariaLabel, '2026年，已收起，展开经期记录')
  assert.equal(page.data.periodGroups[0].toggleLabel, '展开')
  assert.equal(app.navigation.length, navigations)
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  await page.onPullDownRefresh()
  assert.deepEqual(years(), [['2026', false], ['2025', true]])
  await app.dispatch(page, 'togglePeriodYear', dataset({ key: '2026' }))
  assert.deepEqual(years(), [['2026', true], ['2025', true]])
  assert.deepEqual(periodExpansion(page), [['2026-10', true], ['2026-09', false], ['2025-12', true]])
  assert.deepEqual(app.storage, storage)
  app.wx.reLaunch({ url: route })
  await app.flush()
  assert.ok(app.currentPage.data.periodGroups.every(year => year.expanded))
  assert.ok(periodExpansion(app.currentPage).every(([, expanded]) => expanded))
})

test('period saves expand their destination month, moves remove empty years, and deletion removes the final month', async (t) => {
  const app = setup(t)
  let records = [
    { _id: 'recent', startDate: '2026-09-01', endDate: '2026-09-05' },
    { _id: 'move', startDate: '2025-12-28', endDate: '2026-01-02' }
  ]
  list(app, 'periods').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-09' }))
  await app.dispatch(page, 'togglePeriodYear', dataset({ key: '2026' }))
  assert.equal(page.data.periodGroups[0].expanded, false)
  await app.dispatch(page, 'editPeriod', dataset({ id: 'move' }))
  assert.equal(app.currentPage.data.startDate, '2025-12-28')
  await app.dispatch(app.currentPage, 'onStartChange', { detail: { value: '2026-09-12' } })
  await app.dispatch(app.currentPage, 'onEndChange', { detail: { value: '2026-09-16' } })
  const moved = { _id: 'move', startDate: '2026-09-12', endDate: '2026-09-16', status: 'known-end' }
  app.cloud.when({ name: 'dataOp', data: { action: 'update', collection: 'periods', id: 'move' } }).reply({ code: 0, record: moved })
  records = [records[0], moved]
  list(app, 'periods').reply({ code: 0, data: records })
  await app.dispatch(app.currentPage, 'save')
  await app.flush()
  assert.equal(app.currentPage, page)
  assert.deepEqual(periodExpansion(page), [['2026-09', true]])
  assert.equal(page.data.periodGroups[0].expanded, true)
  assert.deepEqual(page.data.periodGroups[0].months[0].records.map(row => row._id), ['move', 'recent'])
  for (const id of ['move', 'recent']) {
    await app.dispatch(page, 'editPeriod', dataset({ id }))
    assert.equal(app.currentPage.data.id, id)
    app.respondNext('showModal', { confirm: true })
    app.cloud.when({ name: 'dataOp', data: { action: 'remove', collection: 'periods', id } }).reply({ code: 0 })
    records = records.filter(record => record._id !== id)
    list(app, 'periods').reply({ code: 0, data: records })
    await app.dispatch(app.currentPage, 'delete')
    await app.flush()
  }
  assert.deepEqual(page.data.periodGroups, [])
  assert.deepEqual(page.data.periods, [])
})

test('period add into a collapsed February and move from March to February expand the saved month', async (t) => {
  const app = setup(t)
  let records = [
    { _id: 'feb', startDate: '2026-02-01', endDate: '2026-02-05' },
    { _id: 'march', startDate: '2026-03-10', endDate: '2026-03-14' }
  ]
  list(app, 'periods').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-02' }))
  await app.dispatch(page, 'addPeriod')
  await app.dispatch(app.currentPage, 'onStartChange', { detail: { value: '2026-02-20' } })
  await app.dispatch(app.currentPage, 'selectStatus', dataset({ value: 'known-end' }))
  await app.dispatch(app.currentPage, 'onEndChange', { detail: { value: '2026-02-24' } })
  const added = { _id: 'feb-added', startDate: '2026-02-20', endDate: '2026-02-24', status: 'known-end' }
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'periods' } }).reply({ code: 0, record: added })
  await app.dispatch(app.currentPage, 'save')
  records = [...records, added]
  list(app, 'periods').reply({ code: 0, data: records })
  await app.flush()
  assert.equal(app.currentPage, page)
  assert.deepEqual(periodExpansion(page), [['2026-03', true], ['2026-02', true]])
  await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-02' }))
  await app.dispatch(page, 'editPeriod', dataset({ id: 'march' }))
  await app.dispatch(app.currentPage, 'onStartChange', { detail: { value: '2026-02-12' } })
  await app.dispatch(app.currentPage, 'onEndChange', { detail: { value: '2026-02-16' } })
  const moved = { _id: 'march', startDate: '2026-02-12', endDate: '2026-02-16', status: 'known-end' }
  app.cloud.when({ name: 'dataOp', data: { action: 'update', collection: 'periods', id: 'march' } }).reply({ code: 0, record: moved })
  records = records.map(record => record._id === 'march' ? moved : record)
  list(app, 'periods').reply({ code: 0, data: records })
  await app.dispatch(app.currentPage, 'save')
  await app.flush()
  assert.deepEqual(periodExpansion(page), [['2026-02', true]])
  assert.deepEqual(page.data.periodGroups[0].months[0].records.map(record => record._id), ['feb-added', 'march', 'feb'])
})

for (const attempt of ['cancel', 'failure']) {
  test(`period changed start month preserves groups and collapse choices after ${attempt}`, async (t) => {
    const app = setup(t)
    const records = [{ _id: 'march', startDate: '2026-03-10', endDate: '2026-03-14' }, { _id: 'feb', startDate: '2026-02-01', endDate: '2026-02-05' }]
    list(app, 'periods').reply({ code: 0, data: records })
    const page = app.launch(route)
    await app.flush()
    await app.dispatch(page, 'togglePeriodMonth', dataset({ key: '2026-02' }))
    const before = structuredClone(page.data.periodGroups)
    await app.dispatch(page, 'editPeriod', dataset({ id: 'march' }))
    await app.dispatch(app.currentPage, 'onStartChange', { detail: { value: '2026-02-12' } })
    await app.dispatch(app.currentPage, 'onEndChange', { detail: { value: '2026-02-16' } })
    if (attempt === 'failure') {
      app.cloud.when({ name: 'dataOp', data: { action: 'update', collection: 'periods', id: 'march' } }).reply({ code: 400, msg: '合成保存失败' })
      app.respondNext('showModal', { confirm: true })
      await app.dispatch(app.currentPage, 'save')
      assert.notEqual(app.currentPage, page)
      assert.deepEqual(page.data.periodGroups, before)
    }
    await app.dispatch(app.currentPage, 'goBack')
    await app.flush()
    assert.equal(app.currentPage, page)
    assert.deepEqual(page.data.periodGroups, before)
  })
}

const monthRecords = [
  { _id: 'sep', date: '2026-09-18', note: '九月晚餐' },
  { _id: 'aug', date: '2026-08-02', note: '八月散步' },
  { _id: 'jul', date: '2026-07-11', note: '七月骑行' },
  { _id: 'jun-empty', date: '2026-06-18', note: '' },
  { _id: 'jun', date: '2026-06-04', note: '  六月海边\n傍晚  ' },
  { _id: 'may', date: '2026-05-02', note: '   ' }
]
const expansion = page => page.data.memoryGroups.map(group => [group.key, group.expanded])

test('month headers toggle without navigation, retain choices across switches and refresh, and move the default window', async (t) => {
  const app = setup(t, { segment: 'memory' })
  list(app, 'memories').reply({ code: 0, data: monthRecords })
  const page = app.launch(route)
  await app.flush()
  assert.deepEqual(expansion(page), [['2026-09', true], ['2026-08', true], ['2026-07', true], ['2026-06', false], ['2026-05', false]])
  const june = page.data.memoryGroups[3]
  assert.equal(june.excerpt, '六月海边 傍晚')
  assert.equal(june.ariaLabel, '2026年6月，2 条欢乐时光，六月海边 傍晚，已收起')
  assert.equal(june.toggleLabel, '展开')
  assert.equal(page.data.memoryGroups[4].ariaLabel, '2026年5月，1 条欢乐时光，已收起')
  const navigationCount = app.navigation.length
  await app.dispatch(page, 'toggleMonth', dataset({ key: '2026-06' }))
  await app.dispatch(page, 'toggleMonth', dataset({ key: '2026-09' }))
  await app.dispatch(page, 'toggleMonth', dataset({ key: '2030-01' }))
  assert.equal(app.navigation.length, navigationCount)
  assert.equal(page.data.memoryGroups[3].toggleLabel, '收起')
  assert.equal(page.data.memoryGroups[3].ariaLabel, '2026年6月，2 条欢乐时光，已展开')
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  assert.deepEqual(expansion(page), [['2026-09', false], ['2026-08', true], ['2026-07', true], ['2026-06', true], ['2026-05', false]])
  list(app, 'memories').reply({ code: 0, data: [{ _id: 'oct', date: '2026-10-05', note: '十月' }, ...monthRecords] })
  app.hide()
  app.show()
  await app.flush()
  const expected = [['2026-10', true], ['2026-09', false], ['2026-08', true], ['2026-07', false], ['2026-06', true], ['2026-05', false]]
  assert.deepEqual(expansion(page), expected)
  list(app, 'memories').reject(new Error('network down'))
  app.respondNext('showModal', { confirm: false })
  await page.onPullDownRefresh()
  assert.deepEqual(expansion(page), expected)
  list(app, 'memories').reply({ code: 0, data: [{ _id: 'oct', date: '2026-10-05', note: '十月' }, ...monthRecords] })
  await app.dispatch(page, 'loadMemoryData')
  assert.deepEqual(expansion(page), expected)
  assert.equal(app.storage.memoryMonthChoices, undefined)
})

for (const confirm of [false, true]) {
  test(`room repair failure remains retryable after ${confirm ? 'confirming' : 'cancelling'} the prompt`, async (t) => {
    const app = setup(t)
    const pending = list(app, 'periods').defer()
    const page = app.launch(route)
    await app.settle()
    app.cloud.when('getMyRoom').reject(new Error('network down'))
    pending.resolve({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
    await app.settle()
    assert.equal(app.wx.modals[0].title, '加载失败')
    assert.equal(app.wx.modals[0].content, '网络不太稳定，请重试')
    assert.equal(app.wx.modals[0].confirmText, '重试')
    assert.equal(app.navigation.length, 1, 'a repair network failure must not redirect to binding')
    app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
    list(app, 'periods').reply({ code: 0, data: [segments[0].record] })
    app.respond('showModal', 0, { confirm, cancel: !confirm })
    await app.settle()
    if (!confirm) {
      assert.equal(page.data.loadFailed, true)
      assert.equal(page.data.hasLoaded, false)
      await app.dispatch(page, 'loadData')
    }
    await app.flush()
    assert.equal(page.data.loadFailed, false)
    assert.equal(page.data.periods[0]._id, 'p1')
    assert.equal(app.storage.roomCode, 'ROOM01')
    assert.equal(listCalls(app).length, 2)
  })
}

for (const noRoom of [false, true]) {
  test(`missing prompt APIs leave ${noRoom ? 'unbound' : 'network-failed'} list visibly retryable`, async (t) => {
    const app = setup(t, { storage: noRoom ? { roomCode: '' } : {} })
    delete app.wx.showModal
    delete app.wx.showToast
    if (noRoom) app.cloud.when('getMyRoom').reply({ code: 0, room: null })
    else list(app, 'periods').reject(new Error('network down'))
    const page = app.launch(route)
    await app.flush()
    assert.equal(page.data.loading, false)
    assert.equal(page.data.loadFailed, true)
    assert.equal(page.data.hasLoaded, false)
    assert.equal(listCalls(app).length, noRoom ? 0 : 1)
  })
}

test('record tab period entry reopens an ongoing record, otherwise starts today, and rows open their own record', async (t) => {
  const app = setup(t)
  const closed = { _id: 'p1', startDate: '2026-08-01', endDate: '2026-08-05', note: '测试备注' }
  const ongoing = { _id: 'p2', startDate: '2026-10-18', status: 'ongoing' }
  list(app, 'periods').reply({ code: 0, data: [closed, ongoing] })
  const page = app.launch(route)
  await app.flush()
  await app.dispatch(page, 'addPeriod')
  await app.settle()
  assert.equal(app.navigation.at(-1).url, '/pages/period/edit/edit?id=p2&startDate=2026-10-18&status=ongoing')
  assert.equal(app.wx.toasts.at(-1).title, '已有进行中的经期，继续编辑它')
  assert.equal(app.currentPage.data.startDate, '2026-10-18')
  await app.dispatch(app.currentPage, 'goBack')
  await app.flush()
  await app.dispatch(page, 'editPeriod', dataset({ id: 'p1' }))
  assert.equal(app.currentPage.data.note, '测试备注')
  assert.equal(app.currentPage.data.startDate, '2026-08-01')
  list(app, 'periods').reply({ code: 0, data: [closed] })
  await app.dispatch(app.currentPage, 'goBack')
  await app.flush()
  await app.dispatch(page, 'addPeriod')
  assert.equal(app.navigation.at(-1).url, '/pages/period/edit/edit?startDate=2026-10-20')
  assert.equal(app.currentPage.data.startDate, '2026-10-20')
  assert.equal(app.wx.toasts.length, 1)
})

test('record tab chooses the latest ongoing record, then creates today even when completed coverage exists', async (t) => {
  const app = setup(t)
  const closedToday = { _id: 'closed-today', startDate: '2026-10-18', endDate: '2026-10-20', status: 'known-end' }
  list(app, 'periods').reply({ code: 0, data: [
    { _id: 'older-live', startDate: '2026-10-01', status: 'ongoing' },
    { _id: 'latest-live', startDate: '2026-10-15', status: 'ongoing' }, closedToday
  ] })
  const page = app.launch(route)
  await app.flush()
  assert.equal(page.data.periods.length, 3)
  await app.dispatch(page, 'addPeriod')
  assert.equal(app.currentPage.data.id, 'latest-live')
  assert.equal(app.navigation.at(-1).url, '/pages/period/edit/edit?id=latest-live&startDate=2026-10-15&status=ongoing')
  assert.equal(app.wx.toasts.at(-1).title, '已有进行中的经期，继续编辑它')
  list(app, 'periods').reply({ code: 0, data: [closedToday] })
  await app.dispatch(app.currentPage, 'goBack')
  await app.flush()
  await app.dispatch(page, 'addPeriod')
  assert.equal(app.currentPage.data.isEdit, false)
  assert.equal(app.currentPage.data.startDate, '2026-10-20')
  assert.equal(app.navigation.at(-1).url, '/pages/period/edit/edit?startDate=2026-10-20')
  assert.equal(app.wx.toasts.length, 1)
})

test('memory rows open the chosen same-day or older record by id, while missing ids do nothing', async (t) => {
  const app = setup(t, { segment: 'memory' })
  list(app, 'memories').reply({ code: 0, data: [
    { _id: 'm1', date: '2026-10-08', note: 'seaside walk' },
    { _id: 'm2', date: '2026-10-08', note: 'hotpot' },
    { _id: 'm3', date: '2025-12-31', note: 'newyear eve' }
  ] })
  const page = app.launch(route)
  await app.flush()
  for (const [id, url] of [
    ['m2', '/pages/memory/edit/edit?id=m2&date=2026-10-08&note=hotpot'],
    ['m3', '/pages/memory/edit/edit?id=m3&date=2025-12-31&note=newyear%20eve']
  ]) {
    await app.dispatch(page, 'editMemory', dataset({ id }))
    assert.equal(app.navigation.at(-1).url, url)
    await app.dispatch(app.currentPage, 'goBack')
    await app.flush()
  }
  const navigations = app.navigation.length
  await app.dispatch(page, 'editMemory', dataset({ id: 'gone' }))
  assert.equal(app.navigation.length, navigations)
  await app.dispatch(page, 'addMemory')
  assert.equal(app.navigation.at(-1).url, '/pages/memory/edit/edit?date=2026-10-20')
})

for (const spec of segments) {
  for (const action of ['add', 'remove']) {
    test(`${spec.segment}: confirmed ${action} lands the segment before return and refreshes once on return`, async (t) => {
      const other = spec.segment === 'period' ? 'memory' : 'period'
      const app = setup(t, { segment: other })
      const page = app.launch(route)
      await app.flush()
      // Enter a real edit page through platform navigation; the list stays underneath.
      const editUrl = spec.segment === 'period'
        ? `/pages/period/edit/edit?${action === 'remove' ? 'id=p1&' : ''}startDate=2026-10-20&status=ongoing`
        : `/pages/memory/edit/edit?${action === 'remove' ? 'id=m1&' : ''}date=2026-10-20`
      app.wx.navigateTo({ url: editUrl })
      await app.flush()
      const record = spec.segment === 'period'
        ? { _id: 'p1', startDate: '2026-10-20', status: 'ongoing' }
        : { _id: 'm1', date: '2026-10-20', note: '' }
      const pending = app.cloud.when({ name: 'dataOp', data: { action, collection: spec.collection } }).defer()
      if (action === 'remove') app.respondNext('showModal', { confirm: true })
      const edit = app.currentPage
      const mutation = app.dispatch(edit, action === 'remove' ? 'delete' : 'save')
      await app.settle()
      assert.equal(page.data.segment, other, 'unconfirmed writes must not land a segment')
      pending.resolve({ code: 0, id: record._id, record })
      await mutation
      assert.equal(app.currentPage, edit, 'the editor stays until the return timer')
      assert.equal(page.data.segment, spec.segment)
      assert.equal(app.storage.recordTabSegment, spec.segment)
      const beforeReturn = listCalls(app).length
      list(app, spec.collection).reply({ code: 0, data: action === 'remove' ? [] : [record] })
      await app.flush()
      assert.equal(app.currentPage, page)
      assert.equal(page.data.segment, spec.segment)
      assert.equal(page.data[spec.collection].length, action === 'remove' ? 0 : 1)
      assert.equal(listCalls(app).length, beforeReturn + 1)
      assert.equal(app.storage.recordTabSegment, undefined)
      await app.dispatch(page, 'selectSegment', dataset({ segment: other }))
      app.hide()
      app.show()
      await app.flush()
      assert.equal(page.data.segment, other, 'the consumed edit intent cannot land twice')
    })
  }
}

test('memory add and move expand the saved older month after returning from the real editor', async (t) => {
  const app = setup(t, { segment: 'memory' })
  let records = monthRecords.slice(0, 5)
  list(app, 'memories').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  assert.equal(page.data.memoryGroups.at(-1).expanded, false)
  await app.dispatch(page, 'addMemory')
  await app.dispatch(app.currentPage, 'onDateChange', { detail: { value: '2026-06-20' } })
  await app.dispatch(app.currentPage, 'onNoteInput', { detail: { value: '补记的六月' } })
  const added = { _id: 'jun-added', date: '2026-06-20', note: '补记的六月' }
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories' } }).reply({ code: 0, record: added })
  records = [...records, added]
  list(app, 'memories').reply({ code: 0, data: records })
  await app.dispatch(app.currentPage, 'save')
  await app.flush()
  assert.equal(app.currentPage, page)
  assert.equal(page.data.memoryGroups.at(-1).expanded, true)
  assert.equal(page.data.memoryGroups.at(-1).records[0].note, '补记的六月')
  await app.dispatch(page, 'editMemory', dataset({ id: 'sep' }))
  await app.dispatch(app.currentPage, 'onDateChange', { detail: { value: '2026-05-09' } })
  const moved = { _id: 'sep', date: '2026-05-09', note: '九月晚餐' }
  app.cloud.when({ name: 'dataOp', data: { action: 'update', collection: 'memories', id: 'sep' } }).reply({ code: 0, record: moved })
  records = records.map(record => record._id === moved._id ? moved : record)
  list(app, 'memories').reply({ code: 0, data: records })
  await app.dispatch(app.currentPage, 'save')
  await app.flush()
  assert.deepEqual(expansion(page), [['2026-08', true], ['2026-07', true], ['2026-06', true], ['2026-05', true]])
  assert.equal(page.data.memoryGroups.at(-1).records[0].dayLabel, '5月9日')
})

test('deleting rows through the editor removes an emptied month and retains other month choices', async (t) => {
  const app = setup(t, { segment: 'memory' })
  let records = [
    { _id: 'oct', date: '2026-10-05', note: '十月' },
    { _id: 'sep1', date: '2026-09-18', note: '九月' },
    { _id: 'sep2', date: '2026-09-27', note: '九月第二条' }
  ]
  list(app, 'memories').reply({ code: 0, data: records })
  const page = app.launch(route)
  await app.flush()
  await app.dispatch(page, 'toggleMonth', dataset({ key: '2026-10' }))
  for (const id of ['sep2', 'sep1']) {
    await app.dispatch(page, 'editMemory', dataset({ id }))
    app.respondNext('showModal', { confirm: true })
    app.cloud.when({ name: 'dataOp', data: { action: 'remove', collection: 'memories', id } }).reply({ code: 0 })
    records = records.filter(record => record._id !== id)
    list(app, 'memories').reply({ code: 0, data: records })
    app.dispatch(app.currentPage, 'delete')
    await app.flush()
    assert.equal(app.currentPage, page)
    assert.deepEqual(expansion(page), id === 'sep2' ? [['2026-10', false], ['2026-09', true]] : [['2026-10', false]])
  }
})
