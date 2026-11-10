const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')
const { evaluateWxmlExpression, renderWxmlAttribute, renderWxmlClasses, wxmlOpeningTags } = require('./wxmlTemplate')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
const tags = wxmlOpeningTags(wxml)
const success = data => ({ code: 0, data })
const period = (id, startDate, endDate = startDate, status = 'known-end') => ({ _id: id, startDate, endDate, status })
const memory = (id, date, note = '') => ({ _id: id, date, note })
function listRoute(app, collection) {
  return app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
}
function homeApp(t, { periods = [], memories = [], paired = false, ...options } = {}) {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' }, ...options })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: paired ? 'paired' : 'waiting' } })
  listRoute(app, 'periods').reply(success(periods))
  listRoute(app, 'memories').reply(success(memories))
  return app
}
async function launch(app) {
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.commit(home)
  await app.settle()
  app.commit(home)
  return home
}
function event(dataset = {}) { return { currentTarget: { dataset } } }
async function tap(app, home, handler, dataset) {
  app.dispatch(home, handler, event(dataset))
  await app.settle()
  app.commit(home)
}
function tagWith(className) {
  const tag = tags.find(tag => (tag.attrs.class || '').replace(/\{\{[\s\S]*?\}\}/g, '').split(/\s+/).includes(className))
  assert.ok(tag, `expected .${className} in WXML`)
  return tag
}
function attr(className, name, data) { return renderWxmlAttribute(tagWith(className).attrs[name], data) }
function classes(className, data) {
  // An unset optional WXML flag renders as false on the platform.
  return renderWxmlClasses(tagWith(className).attrs.class, { pageHidden: false, ...data })
}
function visible(className, data) {
  const condition = tagWith(className).attrs['wx:if']
  return !condition || Boolean(evaluateWxmlExpression(condition.replace(/^\{\{|\}\}$/g, ''), data))
}
function marked(app, home, className) {
  const data = app.rendered(home)
  return data.days.filter(item => classes('day-cell', { ...data, item }).includes(className)).map(item => item.date)
}

test('cloud records render the calendar, summary and the selected day detail', async t => {
  const app = homeApp(t, { periods: [period('p1', '2026-06-01', '2026-06-03')], memories: [memory('m1', '2026-06-02', '散步')] })
  const home = await launch(app)
  assert.deepEqual(marked(app, home, 'period'), ['2026-06-01', '2026-06-02', '2026-06-03'])
  assert.deepEqual(marked(app, home, 'memory'), ['2026-06-02'])
  assert.equal(app.rendered(home).monthSummaryLine, '本月 经期 3 天 · 欢乐时光 1 条')
  await tap(app, home, 'onDayTap', { date: '2026-06-02' })
  const detail = app.rendered(home).selectedDayDetail
  assert.equal(detail.periods[0].range, '6月1日–6月3日')
  assert.equal(detail.memories[0].note, '散步')
  assert.equal(app.wx.actionSheets.length, 0)
  assert.equal(app.wx.modals.length, 0)
})

test('record notifications refresh the day details and removed rows do not leak into later opens', async t => {
  const app = homeApp(t, { periods: [period('p1', '2026-06-01', '2026-06-03')], memories: [memory('m1', '2026-06-04', '只有四号的备注')] })
  const home = await launch(app)
  await day(app, home, '2026-06-04')
  assert.equal(app.rendered(home).selectedDayDetail.memories[0].note, '只有四号的备注')
  await closeSheet(app, home, 'dayActions')
  home.applyRecordChange({ collection: 'memories', mode: 'update', record: memory('m1', '2026-06-04', '修改后的备注') })
  home.applyRecordChange({ collection: 'periods', mode: 'update', record: period('p1', '2026-06-01', '2026-06-04') })
  await app.settle()
  await day(app, home, '2026-06-04')
  assert.equal(app.rendered(home).selectedDayDetail.memories[0].note, '修改后的备注')
  assert.equal(app.rendered(home).selectedDayDetail.periods[0].range, '6月1日–6月4日')
  await closeSheet(app, home, 'dayActions')
  home.applyRecordChange({ collection: 'memories', mode: 'remove', record: { _id: 'm1' } })
  home.applyRecordChange({ collection: 'periods', mode: 'remove', record: { _id: 'p1' } })
  await app.settle()
  await day(app, home, '2026-06-04')
  assert.deepEqual(app.rendered(home).selectedDayDetail.periods, [])
  assert.deepEqual(app.rendered(home).selectedDayDetail.memories, [])
  assert.deepEqual(app.rendered(home).selectedDayDetail.actions.map(item => item.label), ['补记经期', '补记欢乐时光'])
  assert.equal(visible('day-detail-list', app.rendered(home)), false)
})

function sheetTags(id) {
  const at = tags.findIndex(tag => tag.classes.includes(`sheet-slide-${id}`))
  assert.ok(at > 0, `expected ${id} sheet`)
  const host = tags.slice(0, at).reverse().find(tag => tag.classes.includes('sheet-host'))
  return { host, mask: tags[at - 1], slide: tags[at], panel: tags[at + 1] }
}
function expression(value, data) { return evaluateWxmlExpression(value.replace(/^\{\{|\}\}$/g, ''), data) }
function sheet(app, home, id) {
  const data = app.rendered(home)
  const { host, mask, slide, panel } = sheetTags(id)
  const mounted = Boolean(expression(host.attrs['wx:if'], data))
  const renderedClasses = renderWxmlClasses(slide.attrs.class, data)
  return {
    mounted,
    pose: mounted ? renderedClasses.find(value => ['sheet-open', 'sheet-closed', 'sheet-leaving'].includes(value)) : 'unmounted',
    name: renderWxmlAttribute(panel.attrs['aria-label'], data),
    maskName: renderWxmlAttribute(mask.attrs['aria-label'], data),
    handoff: renderWxmlClasses(mask.attrs.class, data).includes('sheet-handoff')
  }
}
const openers = { monthPicker: 'openMonthPicker', dayActions: 'onDayTap', toolsMenu: 'openMonthMenu', info: 'openPredictionSheet' }
const closers = { monthPicker: 'closeMonthPicker', dayActions: 'closeDayActions', toolsMenu: 'closeMonthMenu', info: 'closeInfoSheet' }
async function openSheet(app, home, id) { await tap(app, home, openers[id], id === 'dayActions' ? { date: '2026-06-10' } : {}) }
async function closeSheet(app, home, id) { await tap(app, home, closers[id]); await app.advance(200); app.commit(home) }
async function selectMonth(app, home, year, month) {
  await tap(app, home, 'openMonthPicker')
  while (app.rendered(home).jumpYear !== year) {
    const delta = year > app.rendered(home).jumpYear ? 1 : -1
    await tap(app, home, 'shiftJumpYear', { delta })
  }
  await tap(app, home, 'selectJumpMonth', { month })
  await app.advance(200)
  app.commit(home)
}
async function day(app, home, date) {
  assert.ok(app.rendered(home).days.some(item => item.date === date), 'tap a date actually displayed in the grid')
  await tap(app, home, 'onDayTap', { date })
}
function navigation(app) { return app.navigation.filter(call => call.method === 'navigateTo').map(call => call.url) }
async function back(app) { app.wx.navigateBack(); await app.settle() }
async function swipe(app, home, dx, dy = 0) {
  const start = { identifier: 1, pageX: 150, pageY: 200 }
  const end = { ...start, pageX: start.pageX + dx, pageY: start.pageY + dy }
  app.dispatch(home, 'monthSwipe.touchStart', { touches: [start] })
  app.dispatch(home, 'monthSwipe.touchMove', { touches: [end] })
  app.dispatch(home, 'monthSwipe.touchEnd', { changedTouches: [end] })
  await app.settle()
  app.commit(home)
}
function feedback(app, home) {
  const data = app.rendered(home)
  return data.days.flatMap(item => classes('day-cell', { ...data, item }).filter(name => name.startsWith('record-feedback-')).map(name => [item.date, name]))
}
function calendarAnimation(app, home, kind) {
  return classes('calendar-days', app.rendered(home)).find(name => name.startsWith(`calendar-${kind}-`)) || ''
}

for (const paired of [true, false]) {
  test(`day details distinguish records and ${paired ? 'name paired authors' : 'omit unpaired authors'}`, async t => {
    const app = homeApp(t, {
      paired,
      periods: [
        { ...period('p1', '2026-06-01', '2026-06-03'), createdByMe: true },
        { ...period('p2', '2026-06-02'), createdByMe: false },
        period('legacy', '2026-06-04')
      ],
      memories: [{ ...memory('m1', '2026-06-02', '散步'), createdByMe: false }, { ...memory('m2', '2026-06-02'), createdByMe: true }]
    })
    const home = await launch(app)
    await day(app, home, '2026-06-02')
    const detail = app.rendered(home).selectedDayDetail
    const names = [...detail.periods.map(item => attr('period-detail', 'aria-label', { item })), ...detail.memories.map(item => attr('memory-detail', 'aria-label', { item }))]
    assert.deepEqual(names, [
      '编辑这次经期，6月1日–6月3日，已结束' + (paired ? '，我记的' : ''),
      '编辑这次经期，6月2日–6月2日，已结束' + (paired ? '，TA 记的' : ''),
      '编辑欢乐时光，6月2日，散步' + (paired ? '，TA 记的' : ''),
      '编辑欢乐时光，6月2日' + (paired ? '，我记的' : '')
    ])
    assert.deepEqual(detail.periods.map(item => item.authorLabel || ''), paired ? ['我记的', 'TA 记的'] : ['', ''])
    await closeSheet(app, home, 'dayActions')
    await day(app, home, '2026-06-04')
    assert.equal(app.rendered(home).selectedDayDetail.periods[0].authorLabel, undefined)
    assert.equal(app.rendered(home).selectedDayDetail.memories.length, 0, 'previous day rows are replaced')
  })
}

const ownershipScreens = [
  { name: 'F1 ongoing plus a later completed record', records: [period('live', '2026-06-20', '', 'ongoing'), period('later', '2026-06-24', '2026-06-26')], status: '经期第 7 天', quick: '经期第 7 天 · 记结束', aria: '经期第7天 经期进行中', recap: '本月 经期 7 天 · 欢乐时光 0 条', date: '2026-06-26' },
  { name: 'F1 overlapping completed records', now: '2026-06-05T12:00:00+08:00', records: [period('first', '2026-06-01', '2026-06-05'), period('later', '2026-06-03', '2026-06-07')], status: '经期第 3 天', quick: '记经期', aria: '经期第3天', recap: '本月 经期 7 天 · 欢乐时光 0 条', date: '2026-06-05' },
  { name: 'multiple ongoing records plus an unknown end', records: [period('old', '2026-06-20', '', 'ongoing'), period('latest', '2026-06-24', '', 'ongoing'), period('unknown', '2026-06-26', '', 'unknown-end')], status: '经期第 3 天', quick: '经期第 3 天 · 记结束', aria: '经期第3天 经期进行中', recap: '本月 经期 7 天 · 欢乐时光 0 条', date: '2026-06-26' },
  { name: 'damaged ongoing range supplies no quick-action day', records: [period('done', '2026-06-24', '2026-06-26'), period('bad-live', '2026-06-25', '2026-06-32', 'ongoing')], status: '经期第 3 天', quick: '记结束', aria: '经期第3天', recap: '本月 经期 3 天 · 欢乐时光 0 条', date: '2026-06-26' }
]
for (const scenario of ownershipScreens) {
  test(`same-screen ownership: ${scenario.name}`, async t => {
    const app = homeApp(t, { periods: scenario.records, ...(scenario.now ? { now: scenario.now } : {}) })
    const home = await launch(app)
    const data = app.rendered(home)
    assert.equal(attr('home-status', 'aria-label', data), scenario.status)
    assert.equal(data.homeStatus.text, scenario.status)
    assert.equal(data.periodQuickLabel, scenario.quick)
    assert.equal(attr('quick-btn', 'aria-label', data), scenario.quick)
    const item = data.days.find(day => day.date === scenario.date)
    assert.ok(attr('day-cell', 'aria-label', { ...data, item }).endsWith(scenario.aria))
    assert.equal(item.isUnknownEndPeriod, false)
    assert.equal(data.monthSummaryLine, scenario.recap)
    await tap(app, home, 'openMonthlyRecap')
    assert.equal(app.rendered(home).monthlyRecap.summaryLine, scenario.recap)
    await closeSheet(app, home, 'info')
    await day(app, home, scenario.date)
    assert.equal(app.rendered(home).selectedDayDetail.periods.length, scenario.name.includes('damaged') ? 1 : scenario.records.length)
    assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
  })
}

test('empty rooms show the first-record guide and records supply status, recap and back-to-today', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  assert.equal(visible('empty-guide', app.rendered(home)), true)
  assert.equal(visible('month-summary', app.rendered(home)), false)
  assert.equal(attr('home-status', 'aria-label', app.rendered(home)), '多记几次后就能预测')
  listRoute(app, 'periods').reply(success([period('p1', '2026-06-15', '2026-06-19'), period('p2', '2026-06-24', '', 'ongoing')]))
  listRoute(app, 'memories').reply(success([memory('m1', '2026-06-04')]))
  await home.onPullDownRefresh()
  await app.settle()
  assert.equal(visible('empty-guide', app.rendered(home)), false)
  assert.equal(attr('home-status', 'aria-label', app.rendered(home)), '经期第 3 天')
  assert.equal(attr('month-summary', 'aria-label', app.rendered(home)), '查看本月小结，本月 经期 8 天 · 欢乐时光 1 条')
  await tap(app, home, 'openMonthlyRecap')
  assert.equal(sheet(app, home, 'info').name, '本月小结')
  assert.match(app.rendered(home).monthlyRecap.periodSummary, /8 天/)
  await tap(app, home, 'copyMonthlyRecap')
  assert.match(app.clipboard[0], /经期/)
  assert.match(app.clipboard[0], /欢乐时光/)
  assert.equal(app.wx.toasts.at(-1).title, '已复制小结')
  await closeSheet(app, home, 'info')
  await tap(app, home, 'prevMonth')
  assert.equal(visible('back-today', app.rendered(home)), true)
  await tap(app, home, 'jumpToToday')
  assert.equal(visible('back-today', app.rendered(home)), false)
})

for (const ongoing of [false, true]) {
  test(`quick and dated period entries ${ongoing ? 'reopen the ongoing record' : 'edit coverage or create for the selected day'}`, async t => {
    const app = homeApp(t, { periods: [period('p1', '2026-06-01', '2026-06-05'), ...(ongoing ? [period('p2', '2026-06-20', '', 'ongoing')] : [])] })
    const home = await launch(app)
    assert.equal(attr('quick-btn', 'aria-label', app.rendered(home)), ongoing ? '经期第 7 天 · 记结束' : '记经期')
    await tap(app, home, 'quickPeriod')
    assert.equal(navigation(app).at(-1), ongoing ? '/pages/period/edit/edit?id=p2&startDate=2026-06-20&endDate=2026-06-26&status=known-end' : '/pages/period/edit/edit?startDate=2026-06-26')
    await back(app)
    for (const date of ['2026-06-03', '2026-06-10']) {
      await day(app, home, date)
      const action = app.rendered(home).selectedDayDetail.actions.find(item => item.key === 'period')
      assert.ok(action)
      await tap(app, home, 'onDayActionTap', { action: action.key })
      const expected = ongoing ? '/pages/period/edit/edit?id=p2&startDate=2026-06-20&status=ongoing'
        : date === '2026-06-03' ? '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end' : '/pages/period/edit/edit?startDate=2026-06-10'
      assert.equal(navigation(app).at(-1), expected)
      await back(app)
      await app.advance(200)
    }
    assert.deepEqual(app.wx.toasts.map(item => item.title), ongoing ? Array(3).fill('已有进行中的经期，继续编辑它') : [])
    assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
  })
}

test('all home period entries and the completion reminder choose the latest ongoing record', async t => {
  const app = homeApp(t, { periods: [
    period('old-live', '2026-06-10', '', 'ongoing'),
    period('latest-live', '2026-06-20', '', 'ongoing'),
    period('later-done', '2026-06-24', '2026-06-26')
  ] })
  const home = await launch(app)
  assert.equal(app.rendered(home).homeStatus.text, '经期第 7 天')
  assert.equal(app.rendered(home).ongoingCompletionReminder.text, '已进行 7 天，超过预期的 3 天，可以补填结束日期')
  assert.equal(app.rendered(home).ongoingCompletionReminder.record._id, 'latest-live')
  await tap(app, home, 'onOngoingReminderTap')
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=latest-live&startDate=2026-06-20&status=ongoing')
  await back(app)
  await tap(app, home, 'quickPeriod')
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=latest-live&startDate=2026-06-20&endDate=2026-06-26&status=known-end')
  await back(app)
  await day(app, home, '2026-06-03')
  await tap(app, home, 'onDayActionTap', { action: 'period' })
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=latest-live&startDate=2026-06-20&status=ongoing')
  assert.deepEqual(app.wx.toasts.map(item => item.title), [
    '已有进行中的经期，继续编辑它', '已有进行中的经期，继续编辑它'
  ])
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
})

test('a cycle reminder reopens the ongoing record even when its start is before the reminder date', async t => {
  const app = homeApp(t, { periods: [
    period('april', '2026-04-10', '2026-04-14'),
    period('live', '2026-05-15', '', 'ongoing')
  ] })
  const home = await launch(app)
  assert.equal(app.rendered(home).cycleReminders[0].action, 'quickPeriod')
  await tap(app, home, 'onReminderTap', { index: 0 })
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=live&startDate=2026-05-15&status=ongoing')
  assert.equal(app.wx.toasts.at(-1).title, '已有进行中的经期，继续编辑它')
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
})

test('real day rows open their own editor and blank days offer dated actions', async t => {
  const app = homeApp(t, { periods: [period('p1', '2026-06-01', '2026-06-05')], memories: [memory('m1', '2026-06-20', '散步')] })
  const home = await launch(app)
  for (const [date, kind, id, expected] of [
    ['2026-06-03', 'period', 'p1', '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&status=known-end'],
    ['2026-06-20', 'memory', 'm1', '/pages/memory/edit/edit?id=m1&date=2026-06-20&note=' + encodeURIComponent('散步')]
  ]) {
    await day(app, home, date)
    assert.equal(visible('day-detail-list', app.rendered(home)), true)
    assert.equal(classes('day-detail-list', app.rendered(home)).includes('day-detail-fade'), false)
    await tap(app, home, 'onDayRecordTap', { kind, id })
    assert.equal(navigation(app).at(-1), expected)
    await back(app)
    await app.advance(200)
  }
  for (const [date, labels] of [['2026-06-10', ['补记经期', '补记欢乐时光']], ['2026-06-26', ['记经期', '记欢乐时光']]]) {
    await day(app, home, date)
    assert.equal(visible('day-detail-list', app.rendered(home)), false)
    assert.deepEqual(app.rendered(home).selectedDayDetail.actions.map(item => item.label), labels)
    await closeSheet(app, home, 'dayActions')
  }
  await day(app, home, '2026-06-10')
  await tap(app, home, 'onDayActionTap', { action: 'memory' })
  assert.equal(navigation(app).at(-1), '/pages/memory/edit/edit?date=2026-06-10')
  await back(app)
  await app.advance(200)
  await tap(app, home, 'quickMemory')
  assert.equal(navigation(app).at(-1), '/pages/memory/edit/edit?date=2026-06-26')
})

test('future dates keep holiday and workday meanings with a persistent no-record notice', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  const notice = { title: '未来日期不能新增记录', text: '到了这一天，再来记经期或欢乐时光' }
  for (const [date, year, month, meanings, subtitle] of [
    ['2026-06-30', 2026, 5, [], null],
    ['2026-09-25', 2026, 8, ['中秋。'], '八月十五 · 中秋'],
    ['2026-09-20', 2026, 8, ['官方调休上班日。'], null],
    ['2026-10-01', 2026, 9, ['国庆。'], '八月廿一 · 国庆']
  ]) {
    await selectMonth(app, home, year, month)
    await day(app, home, date)
    const data = app.rendered(home)
    assert.deepEqual(data.selectedDayDetail.actions, [])
    assert.deepEqual(data.selectedDayDetail.meanings.map(item => item.text), meanings)
    assert.equal(visible('detail-meaning-list', data), true)
    assert.equal(visible('future-notice', data), true)
    assert.deepEqual(data.selectedDayDetail.futureNotice, notice)
    if (subtitle) assert.equal(data.selectedDateSubtitle, subtitle)
    await closeSheet(app, home, 'dayActions')
  }
  assert.deepEqual(navigation(app), [])
  await selectMonth(app, home, 2026, 5)
  await day(app, home, '2026-06-19')
  assert.equal(app.rendered(home).selectedDateLabel, '6月19日 周五')
  assert.equal(app.rendered(home).selectedDateSubtitle, '五月初五 · 端午')
  assert.equal(visible('future-notice', app.rendered(home)), false)
  await closeSheet(app, home, 'dayActions')
  await selectMonth(app, home, 2020, 4)
  await day(app, home, '2020-05-23')
  assert.equal(app.rendered(home).selectedDateLabel, '2020年5月23日 周六')
  assert.equal(app.rendered(home).selectedDateSubtitle, '闰四月初一')
})

test('day titles and quick entries keep the rendered today across midnight until the next calendar projection', async t => {
  const app = homeApp(t, { now: '2026-12-31T23:59:59+08:00', periods: [period('live', '2026-12-25', '', 'ongoing')] })
  const home = await launch(app)
  assert.equal(app.rendered(home).homeStatus.text, '经期第 7 天')
  await app.advance(2000)
  await day(app, home, '2026-12-31')
  assert.equal(app.rendered(home).selectedDateLabel, '12月31日 周四')
  assert.equal(app.rendered(home).selectedDayDetail.periods[0].range, '12月25日–12月31日（进行中）')
  await closeSheet(app, home, 'dayActions')
  await tap(app, home, 'quickPeriod')
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=live&startDate=2026-12-25&endDate=2026-12-31&status=known-end')
  await back(app)
  await tap(app, home, 'nextMonth')
  const january = app.rendered(home)
  assert.equal(january.showBackToToday, false)
  assert.equal(january.homeStatus.text, '经期第 8 天')
  assert.deepEqual(january.days.filter(item => item.isToday).map(item => item.date), ['2027-01-01'])
  assert.equal(january.periodQuickLabel, '经期第 8 天 · 记结束')
  await tap(app, home, 'quickMemory')
  assert.equal(navigation(app).at(-1), '/pages/memory/edit/edit?date=2027-01-01')
})

test('a calendar render samples today once even when the system clock crosses midnight during projection', async t => {
  const app = homeApp(t, { now: '2026-12-31T23:59:59+08:00', periods: [period('live', '2026-12-25', '', 'ongoing')] })
  const home = await launch(app)
  const Clock = global.Date
  let todayReads = 0
  function MidnightDate(...args) {
    if (args.length) return new Clock(...args)
    return new Clock(todayReads++ === 0 ? '2026-12-31T23:59:59+08:00' : '2027-01-01T00:00:00+08:00')
  }
  MidnightDate.prototype = Clock.prototype
  Object.setPrototypeOf(MidnightDate, Clock)
  try {
    global.Date = MidnightDate
    app.dispatch(home, 'nextMonth')
  } finally {
    global.Date = Clock
  }
  await app.settle()
  const data = app.rendered(home)
  assert.equal(todayReads, 1)
  assert.equal(data.showBackToToday, true)
  assert.equal(data.homeStatus.text, '经期第 7 天')
  assert.equal(data.periodQuickLabel, '经期第 7 天 · 记结束')
  assert.deepEqual(data.days.filter(item => item.isToday), [])
  await day(app, home, '2027-01-01')
  assert.equal(app.rendered(home).selectedDateLabel, '2027年1月1日 周五')
  assert.equal(app.rendered(home).selectedDateIsFuture, true)
  assert.deepEqual(app.rendered(home).selectedDayDetail.actions, [])
})

test('a completion candidate is not seen until its first visible render commits', async t => {
  const app = homeApp(t, { autoCommit: false, periods: [period('live', '2026-06-20', '', 'ongoing')] })
  const home = app.launch('/pages/index/index')
  await app.settle()
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  app.commit(home)
  app.show()
  await app.settle()
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  app.commit(home)
  await app.settle()
  app.commit(home)
  assert.equal(app.rendered(home).ongoingCompletionReminder.title, '经期还未结束')
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, 'live')
})

test('a previously visible completion reminder stays seen when a later calendar render has not committed', async t => {
  const app = homeApp(t, { autoCommit: false, periods: [period('live', '2026-06-20', '', 'ongoing')] })
  const home = await launch(app)
  assert.equal(app.rendered(home).ongoingCompletionReminder.title, '经期还未结束')
  app.dispatch(home, 'nextMonth')
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, 'live')
})

test('completion reminder waits for leaving, survives refresh and is seen once per record', async t => {
  const app = homeApp(t, { periods: [period('p2', '2026-06-20', '', 'ongoing')] })
  const home = await launch(app)
  assert.equal(app.rendered(home).ongoingCompletionReminder.title, '经期还未结束')
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  await home.onPullDownRefresh()
  await app.settle()
  assert.equal(app.rendered(home).ongoingCompletionReminder.title, '经期还未结束')
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, 'p2')
  app.show()
  await app.settle()
  assert.equal(app.rendered(home).ongoingCompletionReminder, null)
  app.wx.reLaunch({ url: '/pages/index/index' })
  await app.settle()
  const later = app.currentPage
  assert.equal(app.rendered(later).ongoingCompletionReminder, null)
  later.applyRecordChange({ collection: 'periods', mode: 'update', record: period('p2', '2026-06-20', '2026-06-24') })
  later.applyRecordChange({ collection: 'periods', mode: 'add', record: period('p3', '2026-06-18', '', 'ongoing') })
  await app.settle()
  assert.equal(app.rendered(later).ongoingCompletionReminder.title, '经期还未结束')
  assert.equal(app.storage.ongoingPeriodReminderShown, 'p2')
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, 'p3')
})

test('short ongoing and completed records have no completion reminder or automatic writes', async t => {
  const app = homeApp(t, { periods: [period('p2', '2026-06-24', '', 'ongoing')] })
  const home = await launch(app)
  assert.equal(app.rendered(home).ongoingCompletionReminder, null)
  app.hide()
  assert.equal(app.storage.ongoingPeriodReminderShown, undefined)
  home.applyRecordChange({ collection: 'periods', mode: 'update', record: period('p2', '2026-06-24', '2026-06-26') })
  await app.settle()
  assert.equal(app.rendered(home).ongoingCompletionReminder, null)
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
})

test('tapping the completion reminder opens the original ongoing record without ending it', async t => {
  const app = homeApp(t, { periods: [period('p9', '2026-06-18', '', 'ongoing')] })
  const home = await launch(app)
  await tap(app, home, 'onOngoingReminderTap')
  assert.equal(app.storage.ongoingPeriodReminderShown, 'p9')
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?id=p9&startDate=2026-06-18&status=ongoing')
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp' && call.data.action !== 'list'), false)
  await back(app)
  assert.equal(attr('quick-btn', 'aria-label', app.rendered(home)), '经期第 9 天 · 记结束')
})

test('the projected cycle reminder opens the suggested date', async t => {
  const app = homeApp(t, { periods: [period('p1', '2026-04-28', '2026-05-02'), period('p2', '2026-05-26', '2026-05-30')] })
  const home = await launch(app)
  const reminders = app.rendered(home).cycleReminders
  assert.ok(reminders.length, 'real history must produce a reminder')
  assert.equal(reminders[0].title, '这几天可能开始')
  await tap(app, home, 'onReminderTap', { index: 0 })
  assert.equal(navigation(app).at(-1), '/pages/period/edit/edit?startDate=2026-06-26')
})

test('settings density changes resize a real six-row calendar on return before cloud responses', async t => {
  const app = homeApp(t, { now: '2026-08-15T12:00:00+08:00', storage: { roomCode: 'ROOM01', calendarDensity: 'full' }, windowInfo: { windowWidth: 375, windowHeight: 619 } })
  const home = await launch(app)
  assert.equal(Math.ceil(app.rendered(home).days.length / 7), 6)
  assert.equal(attr('calendar-grid', 'style', app.rendered(home)), '--calendar-row-height: 79.5px')
  assert.equal(classes('calendar-grid', app.rendered(home)).includes('calendar-info-merged'), false)
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  await tap(app, app.currentPage, 'setCalendarDensity', { density: 'compact' })
  assert.equal(app.storage.calendarDensity, 'compact')
  const pending = listRoute(app, 'periods').defer()
  app.wx.switchTab({ url: '/pages/index/index' })
  await app.settle()
  assert.equal(app.currentPage, home)
  assert.ok(classes('calendar-grid', app.rendered(home)).includes('calendar-density-compact'))
  assert.ok(classes('calendar-grid', app.rendered(home)).includes('calendar-info-merged'))
  assert.equal(attr('calendar-grid', 'style', app.rendered(home)), '--calendar-row-height: 55.33px')
  pending.resolve(success([]))
  await app.settle()
  assert.equal(attr('calendar-grid', 'style', app.rendered(home)), '--calendar-row-height: 55.33px')
  app.wx.setStorageSync('calendarDensity', 'invalid')
  app.hide(); app.show(); await app.settle()
  assert.ok(classes('calendar-grid', app.rendered(home)).includes('calendar-density-compact'))
})

test('homepage renders safe-area insets and keeps its navbar fallback without a capsule rectangle', async t => {
  const app = homeApp(t)
  app.wx.getMenuButtonBoundingClientRect = () => null
  const home = await launch(app)
  const style = attr('page', 'style', app.rendered(home))
  assert.match(style, /--safe-top: 44px/)
  assert.match(style, /--safe-bottom: 34px/)
  assert.match(style, /--nav-bar-height: 84px/)
  assert.match(style, /--capsule-right: 94px/)
})

test('homepage decorations resume before pending cloud responses and pause on hide', async t => {
  const app = homeApp(t)
  const pending = listRoute(app, 'periods').defer()
  const home = await launch(app)
  assert.equal(classes('page', app.rendered(home)).includes('page-hidden'), false)
  app.hide(); app.hide(); await app.settle()
  assert.equal(classes('page', app.rendered(home)).includes('page-hidden'), true)
  app.show(); app.show(); await app.settle()
  assert.equal(classes('page', app.rendered(home)).includes('page-hidden'), false)
  assert.equal(app.rendered(home).loading, true)
  pending.resolve(success([]))
  await app.settle()
})

for (const id of Object.keys(openers)) {
  test(`${id} enters in two poses, leaves for the exit duration, and can reopen mid-leave`, async t => {
    const app = homeApp(t, { autoCommit: false })
    const home = await launch(app)
    app.dispatch(home, openers[id], event(id === 'dayActions' ? { date: '2026-06-10' } : {}))
    app.commit(home)
    assert.equal(sheet(app, home, id).pose, 'sheet-closed')
    assert.equal(classes('page', app.rendered(home)).includes('page-obscured'), false)
    await app.settle(); app.commit(home)
    assert.equal(sheet(app, home, id).pose, 'sheet-open')
    assert.equal(classes('page', app.rendered(home)).includes('page-obscured'), true)
    assert.equal(app.tabBar.visible, false)
    await tap(app, home, closers[id])
    assert.equal(sheet(app, home, id).pose, 'sheet-leaving')
    await app.advance(199); app.commit(home)
    assert.equal(sheet(app, home, id).pose, 'sheet-leaving')
    assert.equal(app.tabBar.visible, false)
    await app.advance(1); app.commit(home)
    assert.equal(sheet(app, home, id).pose, 'unmounted')
    assert.equal(classes('page', app.rendered(home)).includes('page-obscured'), false)
    assert.equal(app.tabBar.visible, true)
    await openSheet(app, home, id)
    await tap(app, home, closers[id])
    await app.advance(100)
    await openSheet(app, home, id)
    assert.equal(sheet(app, home, id).pose, 'sheet-open')
    await app.advance(200); app.commit(home)
    assert.equal(sheet(app, home, id).pose, 'sheet-open')
    assert.equal(app.tabBar.visible, false)
    assert.deepEqual(navigation(app), [])
  })
}

for (const reducedMotion of [false, true]) {
  test(`sheets restore native tabs only after the last leave, reduced motion ${reducedMotion}`, async t => {
    const app = homeApp(t, { reducedMotion })
    const home = await launch(app)
    assert.equal(app.tabBar.visible, true)
    await openSheet(app, home, 'monthPicker')
    assert.deepEqual(app.tabBar.calls.at(-1), { visible: false, animation: !reducedMotion })
    app.hide(); app.show(); await app.settle()
    assert.equal(app.tabBar.visible, false)
    await openSheet(app, home, 'dayActions')
    await closeSheet(app, home, 'monthPicker')
    assert.equal(app.tabBar.visible, false)
    assert.equal(classes('page', app.rendered(home)).includes('page-obscured'), true)
    await closeSheet(app, home, 'dayActions')
    assert.deepEqual(app.tabBar.calls.at(-1), { visible: true, animation: !reducedMotion })
    await openSheet(app, home, 'info')
    app.wx.reLaunch({ url: '/pages/index/index' })
    await app.settle()
    assert.equal(app.tabBar.visible, true, 'a new home gives back the shared tab bar')
  })
}

test('system back closes sheets in priority order and remains intercepted through leave', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  for (const id of ['dayActions', 'toolsMenu', 'monthPicker', 'info']) await openSheet(app, home, id)
  const guard = tags.find(tag => tag.attrs.bindbeforeleave === 'onSheetSystemBack')
  const guardMounted = () => Boolean(expression(guard.attrs['wx:if'], app.rendered(home)))
  const order = ['info', 'monthPicker', 'toolsMenu', 'dayActions']
  for (let index = 0; index < order.length; index += 1) {
    assert.equal(guardMounted(), true)
    app.dispatch(home, 'onSheetSystemBack')
    app.dispatch(home, 'onSheetSystemBack') // native beforeleave re-entry in the same frame
    await app.settle()
    assert.equal(sheet(app, home, order[index]).pose, 'sheet-leaving')
    for (const lower of order.slice(index + 1)) assert.equal(sheet(app, home, lower).pose, 'sheet-open')
    assert.equal(guardMounted(), true)
    await app.advance(200)
    assert.equal(sheet(app, home, order[index]).pose, 'unmounted')
  }
  assert.equal(guardMounted(), false)
  assert.equal(app.currentPage, home)
  assert.deepEqual(app.navigation.map(call => call.method), ['reLaunch'])
})

test('tool menu hands off to named content without an uncovered frame and recap can reopen during leave', async t => {
  const app = homeApp(t, { autoCommit: false })
  const home = await launch(app)
  const monthBefore = [app.rendered(home).year, app.rendered(home).month]
  await tap(app, home, 'openPredictionSheet')
  assert.equal(sheet(app, home, 'info').handoff, false)
  assert.equal(sheet(app, home, 'info').name, '预测说明')
  await tap(app, home, 'closeInfoSheet')
  await tap(app, home, 'openMonthlyRecap')
  assert.equal(sheet(app, home, 'info').pose, 'sheet-open')
  assert.equal(sheet(app, home, 'info').name, '本月小结')
  await closeSheet(app, home, 'info')
  for (const [action, name] of [['legend', '日历图例'], ['prediction', '预测说明'], ['recap', '本月小结']]) {
    await openSheet(app, home, 'toolsMenu')
    app.dispatch(home, 'onMonthMenuTap', event({ action }))
    app.commit(home)
    assert.equal(sheet(app, home, 'toolsMenu').mounted, false)
    assert.equal(sheet(app, home, 'info').pose, 'sheet-closed')
    assert.equal(sheet(app, home, 'info').handoff, true)
    assert.equal(sheet(app, home, 'info').name, name)
    assert.equal(sheet(app, home, 'info').maskName, `关闭${name}`)
    assert.equal(classes('page', app.rendered(home)).includes('page-obscured'), true)
    assert.equal(app.tabBar.visible, false)
    await app.settle(); app.commit(home)
    assert.equal(sheet(app, home, 'info').pose, 'sheet-open')
    if (action === 'legend') assert.ok(app.rendered(home).legendItems.some(item => item.title === '欢乐时光'))
    if (action === 'prediction') assert.ok(app.rendered(home).predictionExplanation.summary)
    await tap(app, home, 'closeInfoSheet')
    assert.equal(sheet(app, home, 'info').pose, 'sheet-leaving')
    assert.equal(sheet(app, home, 'info').handoff, false)
    assert.equal(sheet(app, home, 'info').name, name)
    await app.advance(200); app.commit(home)
    assert.equal(sheet(app, home, 'info').mounted, false)
  }
  assert.deepEqual([app.rendered(home).year, app.rendered(home).month], monthBefore)
  assert.deepEqual(navigation(app), [])
  assert.equal(app.wx.modals.length, 0)
  assert.equal(app.wx.actionSheets.length, 0)
})

for (const id of Object.keys(openers)) {
  test(`${id} real WXS drag uses speed, distance and direction`, async t => {
    const app = homeApp(t, { selectors: { [`.sheet-slide-${id}`]: { height: 400 } } })
    const home = await launch(app)
    for (const [dy, elapsed, closes] of [[12, 100, true], [101, 10000, true], [40, 1000, false], [-120, 50, false]]) {
      await openSheet(app, home, id)
      const touch = { identifier: 1, pageX: 100, pageY: 100 }
      const currentTarget = { dataset: { sheet: id } }
      app.dispatch(home, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
      app.dispatch(home, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 100 + dy }] })
      await app.advance(elapsed)
      app.dispatch(home, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 100 + dy }] })
      await app.settle()
      assert.equal(sheet(app, home, id).pose, closes ? 'sheet-leaving' : 'sheet-open')
      await app.advance(16)
      assert.equal(app.viewStyle(home, `.sheet-slide-${id}`).transform, '', 'the real WXS change binding clears the drag displacement')
      assert.equal(app.viewStyle(home, `.sheet-slide-${id}`).transition, '')
      await app.advance(200)
      assert.equal(sheet(app, home, id).mounted, !closes)
      if (!closes) await closeSheet(app, home, id)
    }
  })
}

test('WXS attribute changes reach the view only after render commit and style observations are read-only', async t => {
  const app = homeApp(t, { autoCommit: false, selectors: { '.sheet-slide-monthPicker': { height: 400 } } })
  const home = await launch(app)
  await openSheet(app, home, 'monthPicker')
  const currentTarget = { dataset: { sheet: 'monthPicker' } }
  const touch = { identifier: 1, pageX: 100, pageY: 100 }
  app.dispatch(home, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
  app.dispatch(home, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 140 }] })
  assert.equal(app.viewStyle(home, '.sheet-slide-monthPicker').transform, 'translateY(40px)')
  const observed = app.viewStyle(home, '.sheet-slide-monthPicker')
  observed.transform = 'changed by test'
  assert.equal(app.viewStyle(home, '.sheet-slide-monthPicker').transform, 'translateY(40px)')
  await app.advance(1000)
  app.dispatch(home, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 140 }] })
  await app.advance(16)
  assert.equal(app.viewStyle(home, '.sheet-slide-monthPicker').transform, 'translateY(40px)', 'uncommitted data cannot reset the view')
  app.commit(home)
  await app.advance(16)
  assert.equal(app.viewStyle(home, '.sheet-slide-monthPicker').transform, '')
  assert.equal(sheet(app, home, 'monthPicker').pose, 'sheet-open')
})

function assertCalendarFrames(before, patches) {
  const data = { ...before }
  for (const patch of patches) {
    Object.assign(data, patch)
    const first = data.days.find(item => item.date)?.date
    const expected = `${data.year}-${String(data.month + 1).padStart(2, '0')}-01`
    assert.equal(first, expected, 'each platform render frame pairs its month title with the same month grid')
  }
}

test('month selection, arrows, year rollover and back-to-today commit a matching title and grid', async t => {
  const app = homeApp(t, { autoCommit: false, now: '2026-11-08T12:00:00+08:00' })
  const home = await launch(app)
  await selectMonth(app, home, 2019, 10)
  for (const [handler, expected] of [['nextMonth', [2019, 11]], ['nextMonth', [2020, 0]], ['prevMonth', [2019, 11]]]) {
    const before = app.rendered(home)
    const start = home.setDataCalls.length
    app.dispatch(home, handler)
    assertCalendarFrames(before, home.setDataCalls.slice(start))
    app.commit(home)
    assert.deepEqual([app.rendered(home).year, app.rendered(home).month], expected)
  }
  await tap(app, home, 'openMonthPicker')
  assert.equal(app.rendered(home).jumpYear, 2019)
  assert.equal(app.rendered(home).jumpMonth, 11)
  await tap(app, home, 'shiftJumpYear', { delta: 1 })
  await tap(app, home, 'shiftJumpYear', { delta: 1 })
  assert.equal(app.rendered(home).jumpYear, 2021)
  assert.deepEqual([app.rendered(home).year, app.rendered(home).month], [2019, 11])
  for (const [handler, dataset, expected] of [['selectJumpMonth', { month: 11 }, [2021, 11]], ['jumpToToday', {}, [2026, 10]]]) {
    const before = app.rendered(home)
    const start = home.setDataCalls.length
    app.dispatch(home, handler, event(dataset))
    assertCalendarFrames(before, home.setDataCalls.slice(start))
    app.commit(home)
    assert.deepEqual([app.rendered(home).year, app.rendered(home).month], expected)
    assert.equal(sheet(app, home, 'monthPicker').pose, 'sheet-leaving')
    await app.advance(200); app.commit(home)
    await tap(app, home, 'openMonthPicker')
  }
  assert.equal(visible('back-today', app.rendered(home)), false)
  assert.equal(app.wx.modals.length, 0)
  assert.equal(app.wx.actionSheets.length, 0)
})

for (const [year, month, blockedArrow, dx] of [[2001, 0, 'prevMonth', 80], [2035, 11, 'nextMonth', -80]]) {
  test(`month arrows, WXS swipe and year stepper stop quietly at ${year}-${month + 1}`, async t => {
    const app = homeApp(t)
    const home = await launch(app)
    await selectMonth(app, home, year, month)
    const arrow = tags.find(tag => tag.attrs.bindtap === blockedArrow)
    assert.equal(renderWxmlAttribute(arrow.attrs['aria-disabled'], app.rendered(home)), 'true')
    assert.ok(renderWxmlClasses(arrow.attrs.class, app.rendered(home)).includes('disabled'))
    const before = app.rendered(home).days
    await tap(app, home, blockedArrow)
    await swipe(app, home, dx)
    assert.deepEqual([app.rendered(home).year, app.rendered(home).month], [year, month])
    assert.deepEqual(app.rendered(home).days, before)
    assert.deepEqual(app.wx.toasts, [])
    await tap(app, home, 'openMonthPicker')
    const delta = year === 2001 ? -1 : 1
    const step = tags.find(tag => tag.attrs.bindtap === 'shiftJumpYear' && tag.attrs['data-delta'] === String(delta))
    assert.equal(renderWxmlAttribute(step.attrs['aria-disabled'], app.rendered(home)), 'true')
    await tap(app, home, 'shiftJumpYear', { delta })
    assert.equal(app.rendered(home).jumpYear, year)
    await tap(app, home, 'shiftJumpYear', { delta: -delta })
    assert.equal(app.rendered(home).jumpYear, year - delta)
    await tap(app, home, 'jumpToToday')
    assert.equal(renderWxmlAttribute(arrow.attrs['aria-disabled'], app.rendered(home)), 'false')
  })
}

for (const [dx, dy, delta] of [[-49, 0, 1], [49, 0, -1], [-80, 79, 1], [80, 10, -1], [-48, 0, 0], [48, 0, 0], [-49, 49, 0], [-49, 50, 0], [10, 0, 0], [0, 80, 0]]) {
  test(`real calendar WXS swipe (${dx}, ${dy}) changes month by ${delta}`, async t => {
    const app = homeApp(t)
    const home = await launch(app)
    const before = app.rendered(home)
    const start = home.setDataCalls.length
    await swipe(app, home, dx, dy)
    assert.equal(app.rendered(home).month, 5 + delta)
    assertCalendarFrames(before, home.setDataCalls.slice(start))
  })
}

test('month slide continues quick repeats, restarts at the duration and reverses with the grid', async t => {
  const app = homeApp(t, { now: '2026-11-08T12:00:00+08:00' })
  const home = await launch(app)
  const css = fs.readFileSync(path.join(__dirname, '../app.wxss'), 'utf8')
  const enterMs = Number(/--duration-enter:\s*(\d+)ms/.exec(css)[1])
  assert.equal(calendarAnimation(app, home, 'flip'), '')
  await tap(app, home, 'nextMonth')
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-next-a')
  await app.advance(enterMs - 1)
  await swipe(app, home, -80)
  assert.deepEqual([app.rendered(home).year, app.rendered(home).month], [2027, 0])
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-next-a')
  await app.advance(1)
  await tap(app, home, 'nextMonth')
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-next-b')
  await app.advance(60)
  await tap(app, home, 'prevMonth')
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-prev-a')
  await app.advance(60)
  await swipe(app, home, 80)
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-prev-a')
  await app.advance(60)
  await tap(app, home, 'nextMonth')
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-next-b')
  await selectMonth(app, home, 2027, 3)
  assert.equal(calendarAnimation(app, home, 'flip'), '')
  await tap(app, home, 'prevMonth')
  assert.equal(calendarAnimation(app, home, 'flip'), 'calendar-flip-prev-a')
  await tap(app, home, 'jumpToToday')
  assert.equal(calendarAnimation(app, home, 'flip'), '')
  assert.equal(app.rendered(home).month, 10)
})

test('back-to-today emphasis replays on request and clears on record, month and changed refresh', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  assert.equal(calendarAnimation(app, home, 'emphasis'), '')
  await tap(app, home, 'prevMonth')
  await tap(app, home, 'jumpToToday')
  assert.equal(calendarAnimation(app, home, 'emphasis'), 'calendar-emphasis-today-a')
  await tap(app, home, 'openMonthPicker')
  await tap(app, home, 'jumpToToday')
  assert.equal(calendarAnimation(app, home, 'emphasis'), 'calendar-emphasis-today-b')
  home.applyRecordChange({ collection: 'memories', record: memory('m1', '2026-06-03') })
  await app.settle()
  assert.equal(calendarAnimation(app, home, 'emphasis'), '')
  for (const action of ['nextMonth', 'select', 'refresh']) {
    await tap(app, home, 'jumpToToday')
    if (action === 'select') await selectMonth(app, home, 2026, 1)
    else if (action === 'refresh') {
      listRoute(app, 'memories').reply(success([memory('m2', '2026-06-04')]))
      await home.onPullDownRefresh(); await app.settle()
    } else await tap(app, home, action)
    assert.equal(calendarAnimation(app, home, 'emphasis'), '')
  }
})

test('closing real prediction content emphasizes only predicted days and does not replay during leave', async t => {
  const app = homeApp(t, { periods: [period('p1', '2026-04-28', '2026-05-02'), period('p2', '2026-05-26', '2026-05-30')] })
  const home = await launch(app)
  assert.ok(marked(app, home, 'predict').length)
  for (const token of ['a', 'b']) {
    await tap(app, home, 'openPredictionSheet')
    await tap(app, home, 'closeInfoSheet')
    assert.equal(calendarAnimation(app, home, 'emphasis'), `calendar-emphasis-predict-${token}`)
    await tap(app, home, 'closeInfoSheet')
    assert.equal(calendarAnimation(app, home, 'emphasis'), `calendar-emphasis-predict-${token}`)
    await app.advance(200)
  }
  for (const action of ['legend', 'recap']) {
    await tap(app, home, 'nextMonth'); await tap(app, home, 'prevMonth')
    await openSheet(app, home, 'toolsMenu')
    await tap(app, home, 'onMonthMenuTap', { action })
    await closeSheet(app, home, 'info')
    assert.equal(calendarAnimation(app, home, 'emphasis'), '')
  }
  await tap(app, home, 'nextMonth')
  assert.deepEqual(marked(app, home, 'predict'), [])
  await tap(app, home, 'openPredictionSheet')
  await closeSheet(app, home, 'info')
  assert.equal(calendarAnimation(app, home, 'emphasis'), '')
})

async function notifyHidden(app, home, change) {
  app.hide()
  home.applyRecordChange(change)
  await app.settle()
}

test('a saved memory blooms on return, confirmation refresh preserves it, later hiding clears it', async t => {
  const app = homeApp(t, { memories: [memory('m1', '2026-06-02')] })
  const home = await launch(app)
  assert.deepEqual(feedback(app, home), [])
  const saved = memory('m2', '2026-06-10')
  await notifyHidden(app, home, { collection: 'memories', mode: 'add', record: saved })
  assert.deepEqual(feedback(app, home), [['2026-06-10', 'record-feedback-memory']])
  listRoute(app, 'memories').reply(success([saved, memory('m1', '2026-06-02')]))
  app.show(); await app.settle()
  assert.equal(classes('page', app.rendered(home)).includes('page-hidden'), false)
  assert.deepEqual(feedback(app, home), [['2026-06-10', 'record-feedback-memory']])
  app.hide(); await app.settle()
  assert.deepEqual(feedback(app, home), [])
  app.show(); await app.settle()
  assert.deepEqual(feedback(app, home), [])
})

const earlier = period('p1', '2026-06-01', '2026-06-03')
const ongoing = period('p2', '2026-06-24', '', 'ongoing')
const unknownEnd = period('p3', '2026-06-08', '', 'unknown-end')
for (const [label, initial, mode, saved, dates] of [
  ['new across rows', [ongoing, unknownEnd, earlier], 'add', period('p9', '2026-06-12', '2026-06-15'), ['2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15']],
  ['new ongoing', [unknownEnd, earlier], 'add', period('p9', '2026-06-20', '', 'ongoing'), ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26']],
  ['completed ongoing', [ongoing, unknownEnd, earlier], 'update', period('p2', '2026-06-24', '2026-06-25'), ['2026-06-24', '2026-06-25']],
  ['completed unknown end', [ongoing, unknownEnd, earlier], 'update', period('p3', '2026-06-08', '2026-06-10'), ['2026-06-08', '2026-06-09', '2026-06-10']]
]) {
  test(`confirmed ${label} period blooms on every covered date`, async t => {
    const app = homeApp(t, { periods: initial })
    const home = await launch(app)
    await notifyHidden(app, home, { collection: 'periods', mode, record: saved })
    assert.deepEqual(feedback(app, home), dates.map(date => [date, 'record-feedback-period']))
    assert.ok(dates.every(date => marked(app, home, 'period').includes(date)))
  })
}

for (const [label, collection, change] of [
  ['memory note edit', 'memories', { mode: 'update', record: memory('m1', '2026-06-02', '补一句') }],
  ['memory date edit', 'memories', { mode: 'update', record: memory('m1', '2026-06-05') }],
  ['memory delete', 'memories', { mode: 'remove', record: { _id: 'm1' } }],
  ['mode-less upsert', 'memories', { record: memory('m9', '2026-06-09') }],
  ['other month', 'memories', { mode: 'add', record: memory('m9', '2026-05-01') }],
  ['merged into ongoing', 'periods', { mode: 'update', record: { ...ongoing, note: '已经记录过的经期' } }],
  ['unknown end', 'periods', { mode: 'update', record: { ...ongoing, status: 'unknown-end' } }],
  ['completed record date edit', 'periods', { mode: 'update', record: { ...earlier, endDate: '2026-06-04' } }],
  ['period delete', 'periods', { mode: 'remove', record: { _id: 'p1' } }],
  ['duplicate add notification', 'periods', { mode: 'add', record: { ...earlier, note: '重复回流' } }]
]) {
  test(`${label} does not play new-record feedback`, async t => {
    const app = homeApp(t, { periods: [ongoing, earlier], memories: [memory('m1', '2026-06-02')] })
    const home = await launch(app)
    await notifyHidden(app, home, { collection, ...change })
    assert.deepEqual(feedback(app, home), [])
  })
}

test('an unshown loading calendar accepts a record notification without playing feedback', async t => {
  const app = homeApp(t)
  const pending = listRoute(app, 'periods').defer()
  const home = await launch(app)
  await notifyHidden(app, home, { collection: 'memories', mode: 'add', record: memory('m9', '2026-06-09') })
  assert.equal(app.rendered(home).loading, true)
  assert.deepEqual(feedback(app, home), [])
  pending.resolve(success([]))
  await app.settle()
})

test('later saves replace feedback; month changes and changed cloud records clear it', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  const records = { periods: [], memories: [] }
  async function save(collection, record) {
    records[collection].push(record)
    listRoute(app, collection).reply(success(records[collection]))
    await notifyHidden(app, home, { collection, mode: 'add', record })
    app.show(); await app.settle()
  }
  await save('memories', memory('m1', '2026-06-10'))
  await save('periods', period('p1', '2026-06-12', '2026-06-13'))
  assert.deepEqual(feedback(app, home), [['2026-06-12', 'record-feedback-period'], ['2026-06-13', 'record-feedback-period']])
  await tap(app, home, 'nextMonth'); await tap(app, home, 'prevMonth')
  assert.deepEqual(feedback(app, home), [])
  await save('memories', memory('m2', '2026-06-18'))
  await home.onPullDownRefresh(); await app.settle()
  assert.deepEqual(feedback(app, home), [['2026-06-18', 'record-feedback-memory']])
  listRoute(app, 'memories').reply(success([...records.memories, memory('m3', '2026-06-19')]))
  await home.onPullDownRefresh(); await app.settle()
  assert.ok(marked(app, home, 'memory').includes('2026-06-19'))
  assert.deepEqual(feedback(app, home), [])
})

test('room loss clears calendar feedback, flip and emphasis before a recovered calendar appears', async t => {
  const app = homeApp(t)
  const home = await launch(app)
  await tap(app, home, 'nextMonth')
  assert.ok(calendarAnimation(app, home, 'flip'))
  await tap(app, home, 'jumpToToday')
  assert.ok(calendarAnimation(app, home, 'emphasis'))
  await notifyHidden(app, home, { collection: 'memories', mode: 'add', record: memory('m1', '2026-06-10') })
  app.wx.removeStorageSync('roomCode')
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.show(); await app.settle()
  assert.equal(app.rendered(home).noRoom, true)
  assert.equal(calendarAnimation(app, home, 'flip'), '')
  assert.equal(calendarAnimation(app, home, 'emphasis'), '')
  assert.deepEqual(feedback(app, home), [])
  app.wx.setStorageSync('roomCode', 'ROOM01')
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  app.hide(); app.show(); await app.settle()
  assert.equal(app.rendered(home).noRoom, false)
  assert.equal(calendarAnimation(app, home, 'flip'), '')
  assert.equal(calendarAnimation(app, home, 'emphasis'), '')
})
