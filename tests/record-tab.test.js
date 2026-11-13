const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')
const { listCalls, listed, markedDates: marked, roomLookups } = require('./helpers/recordPages')
const { evaluateWxmlExpression, wxmlElementTree } = require('./wxmlTemplate')

const route = '/pages/period/period'
const dataset = value => ({ currentTarget: { dataset: value } })
const list = (app, collection) => app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
const writes = (page, key) => page.setDataCalls.filter(patch => key in patch).map(patch => patch[key])
const groupAuthors = groups => groups.flatMap(group => group.records.map(row => row.authorLabel))
const periodGroupAuthors = years => years.flatMap(year => groupAuthors(year.months))
const memoryRowIds = page => page.data.memoryGroups.flatMap(group => group.records.map(row => row._id))

// Whether the tab's WXML draws an element for the rendered data: its own wx:if / wx:elif holds, no earlier branch
// of its chain holds (WXML draws one branch per chain), and the same goes for every element around it.
// Ask only about the segment on screen: the memory segment is a bare wx:else, which the tree does not read.
const tabTemplate = wxmlElementTree(fs.readFileSync(path.join(__dirname, '../pages/period/period.wxml'), 'utf8'))
const allElements = nodes => nodes.flatMap(node => [node, ...allElements(node.children)])
function holds(node, data) {
  const expr = node.attrs['wx:if'] ?? node.attrs['wx:elif']
  return expr === undefined || Boolean(evaluateWxmlExpression(expr.replace(/^\{\{|\}\}$/g, ''), data))
}
function earlierBranches(node) {
  const siblings = node.parent ? node.parent.children : tabTemplate
  const branches = []
  for (let index = siblings.indexOf(node) - 1; index >= 0; index -= 1) {
    branches.push(siblings[index])
    if (siblings[index].attrs['wx:if'] !== undefined) break
  }
  return branches
}
function draws(data, match) {
  const element = allElements(tabTemplate).find(match)
  assert.ok(element, 'the element is in the record tab template')
  for (let node = element; node; node = node.parent) {
    if (!holds(node, data)) return false
    if (node.attrs['wx:elif'] !== undefined && earlierBranches(node).some(branch => holds(branch, data))) return false
  }
  return true
}

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
  { segment: 'period', collection: 'periods', loading: 'loading', failed: 'loadFailed', loaded: 'hasLoaded', retry: 'loadData', listClass: 'period-year-list', record: { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' } },
  { segment: 'memory', collection: 'memories', loading: 'memoryLoading', failed: 'memoryLoadFailed', loaded: 'memoryHasLoaded', retry: 'loadMemoryData', listClass: 'memory-month-list', record: { _id: 'm1', date: '2026-06-01', note: '测试记录' } }
]

// #194: the tab renders the app's one copy of the Room's records. What Home already read shows at once,
// record authors included, while the tab's show asks for one silent refresh of both lists.
test('after Home has read the records, the tab shows them with authors before its silent refresh lands, then updates', async (t) => {
  const app = setup(t)
  list(app, 'periods').reply({ code: 0, roomStatus: 'paired', data: [
    { _id: 'p-mine', startDate: '2026-09-01', endDate: '2026-09-03', createdByMe: true },
    { _id: 'p-theirs', startDate: '2026-08-01', endDate: '2026-08-03', createdByMe: false }
  ] })
  list(app, 'memories').reply({ code: 0, roomStatus: 'paired', data: [{ _id: 'mine', date: '2026-09-18', note: '散步', createdByMe: true }] })
  app.launch('/pages/index/index')
  await app.flush()
  const periods = list(app, 'periods').defer()
  const memories = list(app, 'memories').defer()
  app.wx.switchTab({ url: route })
  await app.settle()
  const tab = app.currentPage
  assert.equal(tab.route, 'pages/period/period')
  assert.equal(app.rendered(tab).loading, false)
  assert.deepEqual(app.rendered(tab).periods.map(row => [row._id, row.authorLabel]), [['p-mine', '我记的'], ['p-theirs', 'TA 记的']])
  assert.deepEqual(groupAuthors(app.rendered(tab).memoryGroups), ['我记的'])
  assert.deepEqual(listCalls(app).map(call => call.data.collection), ['periods', 'memories', 'periods', 'memories'])

  periods.resolve({ code: 0, roomStatus: 'paired', data: [
    { _id: 'p-new', startDate: '2026-10-01', endDate: '2026-10-04', createdByMe: false },
    { _id: 'p-mine', startDate: '2026-09-01', endDate: '2026-09-03', createdByMe: true },
    { _id: 'p-theirs', startDate: '2026-08-01', endDate: '2026-08-03', createdByMe: false }
  ] })
  memories.resolve({ code: 0, roomStatus: 'paired', data: [{ _id: 'mine', date: '2026-09-18', note: '散步', createdByMe: true }] })
  await app.settle()
  assert.deepEqual(app.rendered(tab).periods.map(row => [row._id, row.authorLabel]), [['p-new', 'TA 记的'], ['p-mine', '我记的'], ['p-theirs', 'TA 记的']])
  assert.deepEqual(listCalls(app).length, 4)
  assert.equal(roomLookups(app), 0)
})

// A save or delete reaches the other page through the shared records, not through that page's own refresh:
// each return below leaves the refresh it triggers unanswered while the other page is checked.
test('a save or delete on the record tab shows on Home before any refresh answers', async (t) => {
  const app = setup(t)
  const home = app.launch('/pages/index/index')
  await app.flush()
  app.wx.switchTab({ url: route })
  await app.flush()
  const tab = app.currentPage
  const saved = { _id: 'm-tab', date: '2026-10-08', note: '' }
  async function returnToHomeWithRefreshPending() {
    const pending = [list(app, 'periods').defer(), list(app, 'memories').defer()]
    await app.advance(1000)
    assert.equal(app.currentPage, tab)
    app.wx.switchTab({ url: '/pages/index/index' })
    await app.settle()
    assert.equal(app.currentPage, home)
    return pending
  }

  await app.dispatch(tab, 'addMemory')
  await app.dispatch(app.currentPage, 'onDateChange', { detail: { value: saved.date } })
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories' } }).reply({ code: 0, id: saved._id, record: saved })
  await app.dispatch(app.currentPage, 'save')
  let [periods, memories] = await returnToHomeWithRefreshPending()
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-10-08'])
  list(app, 'memories').reply({ code: 0, data: [saved] })
  periods.resolve({ code: 0, data: [] })
  memories.resolve({ code: 0, data: [saved] })
  await app.flush()
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-10-08'])

  app.wx.switchTab({ url: route })
  await app.flush()
  await app.dispatch(tab, 'editMemory', dataset({ id: saved._id }))
  app.respondNext('showModal', { confirm: true })
  app.cloud.when({ name: 'dataOp', data: { action: 'remove', collection: 'memories', id: saved._id } }).reply({ code: 0 })
  await app.dispatch(app.currentPage, 'delete')
  ;[periods, memories] = await returnToHomeWithRefreshPending()
  assert.deepEqual(marked(app, home, 'isMemory'), [])
  periods.resolve({ code: 0, data: [] })
  memories.resolve({ code: 0, data: [] })
  await app.settle()
  assert.deepEqual(marked(app, home, 'isMemory'), [])
})

test('a save from Home is listed on the record tab before any refresh answers', async (t) => {
  const app = setup(t)
  const home = app.launch('/pages/index/index')
  await app.flush()
  await app.dispatch(home, 'quickMemory')
  const saved = { _id: 'm-home', date: '2026-10-20', note: '' }
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories' } }).reply({ code: 0, id: saved._id, record: saved })
  await app.dispatch(app.currentPage, 'save')
  const [periods, memories] = [list(app, 'periods').defer(), list(app, 'memories').defer()]
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  app.wx.switchTab({ url: route })
  await app.settle()
  const tab = app.currentPage
  assert.equal(tab.route, 'pages/period/period')
  assert.equal(tab.data.segment, 'memory')
  assert.deepEqual(memoryRowIds(tab), ['m-home'])
  assert.equal(listCalls(app).length, 4, 'the tab shares Home\'s refresh')
  periods.resolve({ code: 0, data: [] })
  memories.resolve({ code: 0, data: [saved] })
  await app.settle()
  assert.deepEqual(memoryRowIds(tab), ['m-home'])
})

const bothLists = loads => Array(loads).fill(['periods', 'memories']).flat()

// Spec decision 23: the other segment's records make the retry a silent refresh, yet the segment that never read
// successfully shows its loading state while the retry runs, then its rows or the failure again, with no prompt.
for (const spec of segments) {
  const other = segments.find(item => item !== spec)
  test(`${spec.segment}: a retry of the never-synced segment shows its loading state while it runs, then the failure or the rows`, async (t) => {
    const app = setup(t, spec)
    list(app, spec.collection).reject(new Error('network down'))
    list(app, other.collection).reply({ code: 0, data: [other.record] })
    const page = app.launch(route)
    await app.flush()
    assert.equal(page.data[spec.failed], true)
    const pending = list(app, spec.collection).defer()
    const retry = app.dispatch(page, spec.retry)
    await app.settle()
    assert.equal(page.data[spec.loading], true, 'the tapped segment shows progress')
    assert.equal(page.data[spec.failed], false)
    assert.equal(page.data[other.loading], false, 'the synced segment keeps its rows')
    assert.equal(page.data[other.loaded], true)
    pending.reject(new Error('network down'))
    await retry
    await app.settle()
    assert.equal(page.data[spec.loading], false)
    assert.equal(page.data[spec.failed], true)
    assert.equal(page.data[spec.loaded], false)
    assert.deepEqual(app.wx.modals, [])
    assert.deepEqual(app.wx.toasts, [])
    list(app, spec.collection).reply({ code: 0, data: [spec.record] })
    await app.dispatch(page, spec.retry)
    await app.flush()
    assert.equal(page.data[spec.failed], false)
    assert.equal(page.data[spec.loaded], true)
    assert.equal(page.data[spec.collection][0]._id, spec.record._id)
  })
}

for (const spec of segments) {
  const other = segments.find(item => item !== spec)
  test(`${spec.segment}: a first read failure shows the segment's failure and retry without a prompt, while the other segment shows normally`, async (t) => {
    const app = setup(t, spec)
    const pending = list(app, spec.collection).defer()
    list(app, other.collection).reply({ code: 0, data: [other.record] })
    const page = app.launch(route)
    await app.settle()
    assert.equal(page.data[spec.loading], true)
    assert.equal(page.data[spec.loaded], false)
    pending.reject(new Error('network down'))
    await app.settle()
    assert.deepEqual(app.wx.modals, [])
    assert.deepEqual(app.wx.toasts, [])
    assert.equal(page.data[spec.failed], true)
    assert.equal(page.data[spec.loaded], false)
    assert.equal(page.data[spec.loading], false)
    assert.deepEqual(page.data[spec.collection], [])
    if (spec.segment === 'period') assert.deepEqual([page.data.avgCycle, page.data.avgDuration], [null, null])
    assert.equal(page.data[other.failed], false)
    assert.equal(page.data[other.loaded], true)
    assert.equal(page.data[other.collection][0]._id, other.record._id)
    list(app, spec.collection).reply({ code: 0, data: [spec.record] })
    await app.dispatch(page, spec.retry)
    await app.flush()
    assert.equal(page.data[spec.failed], false)
    assert.equal(page.data[spec.loaded], true)
    assert.equal(page.data[spec.collection][0]._id, spec.record._id)
    assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(2))
  })

  const populated = spec.segment === 'period'
    ? [spec.record, { _id: 'p2', startDate: '2026-07-03', endDate: '2026-07-07' }]
    : [spec.record]
  for (const records of [[], populated]) {
    test(`${spec.segment}: pull-down refresh keeps ${records.length ? 'rows and stats' : 'the confirmed empty state'} on screen, stops on success and failure, and a failure only offers the inline retry`, async (t) => {
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
      assert.equal(page.data[spec.loading], false, 'a refresh of synced records is silent')
      assert.deepEqual(page.data[spec.segment === 'period' ? 'periods' : 'memoryGroups'], before)
      assert.equal(app.platformCalls.stopPullDownRefresh, undefined)
      pending.resolve({ code: 0, data: records })
      await refresh
      await app.settle()
      assert.equal(page.data[spec.loading], false)
      assert.equal(app.platformCalls.stopPullDownRefresh.length, 1)
      list(app, spec.collection).reject(new Error('network down'))
      await page.onPullDownRefresh()
      await app.settle()
      assert.equal(app.platformCalls.stopPullDownRefresh.length, 2)
      assert.deepEqual(app.wx.modals, [])
      assert.deepEqual(app.wx.toasts, [])
      assert.equal(page.data[spec.failed], true)
      assert.equal(page.data[spec.loaded], true)
      assert.equal(page.data[spec.loading], false)
      assert.deepEqual(page.data[spec.segment === 'period' ? 'periods' : 'memoryGroups'], before)
      assert.deepEqual([page.data.avgCycle, page.data.avgDuration], stats)
      assert.equal(page.data[other.failed], false)
      assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(3))
      list(app, spec.collection).reply({ code: 0, data: records })
      await app.dispatch(page, spec.retry)
      assert.equal(page.data[spec.failed], false)
    })
  }
}

// Failure mode 7 keeps the revision gate: a list read before a local change is set aside. A collection that has no
// complete list yet is read again before the load ends, so the set-aside snapshot never looks like a read failure.
test('a memory saved during the very first load does not leave the segment failed: the shared load reads the memories again', async (t) => {
  const app = setup(t, { segment: 'memory' })
  const periods = list(app, 'periods').defer()
  const memories = list(app, 'memories').defer()
  const page = app.launch(route)
  await app.settle()
  await app.dispatch(page, 'addMemory')
  const saved = { _id: 'm-new', date: '2026-10-20', note: '新的' }
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories' } }).reply({ code: 0, id: saved._id, record: saved })
  await app.dispatch(app.currentPage, 'onNoteInput', { detail: { value: saved.note } })
  await app.dispatch(app.currentPage, 'save')
  await app.advance(1000)
  assert.equal(app.currentPage, page, 'back on the tab, whose show joins the load still out')
  const older = [{ _id: 'm-old', date: '2026-10-02', note: '' }, { _id: 'm-older', date: '2026-09-20', note: '' }]
  list(app, 'memories').reply({ code: 0, data: [saved, ...older] })
  periods.resolve({ code: 0, data: [] })
  memories.resolve({ code: 0, data: older })
  await app.settle()
  assert.equal(page.data.memoryLoadFailed, false)
  assert.equal(page.data.memoryHasLoaded, true)
  assert.equal(page.data.memoryLoading, false)
  assert.deepEqual(memoryRowIds(page), ['m-new', 'm-old', 'm-older'])
  assert.deepEqual(writes(page, 'memoryLoadFailed').filter(Boolean), [], 'no frame shows the memories as failed')
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(2))
  assert.deepEqual(app.wx.modals, [])
})

// #194: a collection that never read successfully keeps its failure card and retry, and the records saved on this
// device are drawn under that card, not hidden behind it. The period stats stay placeholders.
for (const spec of segments) {
  test(`${spec.segment}: an unsynced list keeps its failure card and retry, and draws the record saved here under it`, async (t) => {
    const app = setup(t, spec)
    list(app, spec.collection).reject(new Error('network down'))
    const page = app.launch(route)
    await app.flush()
    assert.equal(page.data[spec.failed], true)
    const saved = spec.segment === 'period'
      ? { _id: 'saved-here', startDate: '2026-10-20', endDate: '2026-10-20', status: 'known-end' }
      : { _id: 'saved-here', date: '2026-10-20', note: '' }
    await app.dispatch(page, spec.segment === 'period' ? 'addPeriod' : 'addMemory')
    if (spec.segment === 'period') await app.dispatch(app.currentPage, 'selectStatus', dataset({ value: 'known-end' }))
    app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: spec.collection } }).reply({ code: 0, id: saved._id, record: saved })
    await app.dispatch(app.currentPage, 'save')
    await app.flush()
    assert.equal(app.currentPage, page)
    const data = app.rendered(page)
    assert.deepEqual([data[spec.loading], data[spec.failed], data[spec.loaded]], [false, true, false])
    assert.ok(draws(data, node => node.classes.includes('load-failed') && node.attrs.bindtap === spec.retry), 'the failure card and its retry stay')
    assert.ok(draws(data, node => node.classes.includes(spec.listClass)), 'the list is drawn under the failure card')
    assert.deepEqual(spec.segment === 'period' ? data.periods.map(row => row._id) : memoryRowIds(page), ['saved-here'])
    if (spec.segment === 'period') assert.deepEqual([data.avgCycle, data.avgDuration], [null, null])
    assert.deepEqual(app.wx.modals, [])
  })
}

test('segment intent is consumed once, a show reads both lists once, switching segments sends no request, and failure states stay independent', async (t) => {
  const app = setup(t, { segment: 'memory' })
  list(app, 'periods').reject(new Error('network down'))
  const page = app.launch(route)
  await app.flush()
  assert.equal(page.data.segment, 'memory')
  assert.equal(app.storage.recordTabSegment, undefined)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(1))
  assert.equal(page.data.loadFailed, true)
  assert.equal(page.data.memoryLoadFailed, false)
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  assert.equal(page.data.segment, 'period')
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'unknown' }))
  await app.flush()
  assert.equal(page.data.segment, 'memory')
  assert.equal(page.data.loadFailed, true)
  assert.equal(page.data.memoryLoadFailed, false)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(1), 'switching segments reads nothing')
  assert.deepEqual(app.wx.modals, [])
  list(app, 'periods').reply({ code: 0, data: [] })
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'period' }))
  app.hide()
  app.show()
  await app.flush()
  assert.equal(page.data.segment, 'period', 'consumed memory intent must not hijack the later visit')
  assert.equal(page.data.loadFailed, false)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(2))
})

test('legacy memory route redirects to the real record tab and opens its memory segment with one read of both lists', async (t) => {
  const app = setup(t)
  list(app, 'memories').reply({ code: 0, data: [{ _id: 'm1', date: '2026-06-01', note: '测试记录' }] })
  app.launch('/pages/memory/memory')
  await app.flush()
  assert.equal(app.currentPage.route, 'pages/period/period')
  assert.equal(app.currentPage.data.segment, 'memory')
  assert.equal(app.currentPage.data.memoryGroups[0].records[0].note, '测试记录')
  assert.equal(app.storage.recordTabSegment, undefined)
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(1))
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
    const reply = data => listed(data, status)
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

test('each record tab show reads both lists once, looks no Room up, and rows carry authors in their first render', async (t) => {
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
  assert.deepEqual(app.cloud.calls.map(call => [call.name, call.data.action, call.data.collection]), [['dataOp', 'list', 'periods'], ['dataOp', 'list', 'memories']])
  // Only row renders count: the first show starts with nothing to list.
  const rowWrites = key => writes(page, key).filter(rows => rows.length)
  assert.deepEqual(rowWrites('periods').map(rows => rows.map(row => row.authorLabel)), [['我记的', 'TA 记的']])
  assert.deepEqual(rowWrites('periodGroups').map(periodGroupAuthors), [['我记的', 'TA 记的']])
  assert.deepEqual(rowWrites('memoryGroups').map(groupAuthors), [['我记的', 'TA 记的']])
  await app.dispatch(page, 'selectSegment', dataset({ segment: 'memory' }))
  app.hide()
  app.show()
  await app.flush()
  assert.deepEqual(listCalls(app).map(call => call.data.collection), bothLists(2))
  assert.deepEqual(rowWrites('memoryGroups').map(groupAuthors), [['我记的', 'TA 记的'], ['我记的', 'TA 记的']], 'one row render per show; an unchanged refresh adds none')
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
  // This device now holds another Room whose lists bring back no status.
  app.wx.setStorageSync('roomCode', 'ROOM02')
  list(app, 'periods').reply({ code: 0, data: [] })
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

test('a Room repair that fails stays retryable inside the segments, without a prompt or a redirect to binding', async (t) => {
  const app = setup(t)
  const pending = list(app, 'periods').defer()
  const page = app.launch(route)
  await app.settle()
  app.cloud.when('getMyRoom').reject(new Error('network down'))
  pending.resolve({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
  await app.settle()
  assert.deepEqual(app.wx.modals, [])
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(app.navigation.length, 1, 'a repair network failure must not redirect to binding')
  assert.equal(page.data.loadFailed, true)
  assert.equal(page.data.hasLoaded, false)
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
  list(app, 'periods').reply({ code: 0, data: [segments[0].record] })
  await app.dispatch(page, 'loadData')
  await app.flush()
  assert.equal(page.data.loadFailed, false)
  assert.equal(page.data.periods[0]._id, 'p1')
  assert.equal(app.storage.roomCode, 'ROOM01')
  assert.equal(listCalls(app).length, 4)
})

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
    assert.equal(listCalls(app).length, noRoom ? 0 : 2)
  })
}

// Two pages subscribe to the shared records: one Room change, one 「去绑定」, from the page in front.
test('when the Room needs rebinding, only the record tab in front prompts once, however many of its loads share the result', async (t) => {
  const app = setup(t)
  const home = app.launch('/pages/index/index')
  await app.flush()
  app.wx.switchTab({ url: route })
  await app.flush()
  const tab = app.currentPage
  list(app, 'periods').reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
  list(app, 'memories').reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
  app.cloud.when('getMyRoom').reply({ code: 1, msg: '未加入任何房间' })
  const refresh = tab.onPullDownRefresh()
  const retry = app.dispatch(tab, 'loadMemoryData')
  await Promise.all([refresh, retry])
  await app.settle()
  assert.deepEqual(app.wx.modals.map(modal => [modal.title, modal.confirmText]), [['房间状态已变化', '去绑定']])
  assert.equal(listCalls(app).length, 6, 'the pull-down and the retry share one load')
  assert.equal(app.rendered(home).noRoom, true, 'hidden Home only renders its Room status')
  assert.equal(app.rendered(tab).loadFailed, true)
  assert.equal(app.rendered(tab).hasLoaded, false)
  app.respond('showModal', 0, { confirm: true })
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/bind/bind')
})

test('a record tab that went hidden while its load ran never prompts; Home in front shows the Room status', async (t) => {
  const app = setup(t)
  const home = app.launch('/pages/index/index')
  await app.flush()
  app.wx.switchTab({ url: route })
  await app.flush()
  const tab = app.currentPage
  const periods = list(app, 'periods').defer()
  const memories = list(app, 'memories').defer()
  const refresh = tab.onPullDownRefresh()
  await app.settle()
  app.wx.switchTab({ url: '/pages/index/index' })
  await app.settle()
  assert.equal(listCalls(app).length, 6, 'Home shares the record tab\'s load')
  app.cloud.when('getMyRoom').reply({ code: 1, msg: '未加入任何房间' })
  periods.resolve({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
  memories.resolve({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
  await refresh
  await app.settle()
  assert.deepEqual(app.wx.modals, [])
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(app.currentPage, home)
  assert.equal(app.rendered(home).noRoom, true)
  assert.equal(app.rendered(home).roomStatusActionText, '去绑定')
})

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
      assert.equal(listCalls(app).length, beforeReturn + 2)
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
