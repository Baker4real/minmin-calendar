const assert = require('node:assert/strict')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')

const value = value => ({ detail: { value } })
const dataset = value => ({ currentTarget: { dataset: value } })
const homeRoute = '/pages/index/index'
const tabRoute = '/pages/period/period'
const records = [
  { kind: 'period', collection: 'periods', dateField: 'startDate', changeDate: 'onStartChange', quick: 'quickPeriod', marker: 'isPeriod',
    fields: { startDate: '2026-09-20', endDate: '', status: 'ongoing', note: '', flow: '', symptoms: [] },
    payload: { startDate: '2026-09-20', endDate: '', status: 'ongoing', note: '', duration: 0, flow: '', symptoms: [] },
    success: '保存成功', consequence: '删除后你们两人的日历都会移除这条经期记录，且不可恢复' },
  { kind: 'memory', collection: 'memories', dateField: 'date', changeDate: 'onDateChange', quick: 'quickMemory', marker: 'isMemory',
    fields: { date: '2026-09-20', note: '' }, payload: { date: '2026-09-20', note: '' },
    success: '已存进你们的欢乐时光', consequence: '删除后你们两人的日历都会移除这条欢乐时光，且不可恢复' }
]
const period = records[0]
const cloudRoute = (app, spec, action) => app.cloud.when({ name: 'dataOp', data: { action, collection: spec.collection } })
const writes = app => app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action !== 'list').map(call => call.data)
const form = (page, spec) => Object.fromEntries(Object.keys(spec.fields).map(key => [key, page.data[key]]))
const draftKey = (spec, id = 'new') => `recordDraft:${spec.collection}:${id}`
const editUrl = (spec, options = {}) => `/pages/${spec.kind}/edit/edit?${new URLSearchParams(options)}`
const cell = (page, date = '2026-09-20') => page.data.days.find(day => day.date === date)

function setup(t, options = {}) {
  const app = createMiniProgram({ now: '2026-09-20T12:00:00+08:00', ...options, storage: { roomCode: 'ROOM01', ...options.storage } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  for (const spec of records) cloudRoute(app, spec, 'list').reply({ code: 0, data: [] })
  return app
}

async function openEditor(app, spec, options = {}) {
  const home = app.launch(homeRoute)
  await app.flush()
  app.wx.navigateTo({ url: editUrl(spec, options) })
  await app.settle()
  return { home, page: app.currentPage }
}

test('period: a legacy malformed end is unknown in both the calendar and the real editor', async (t) => {
  const app = setup(t)
  cloudRoute(app, period, 'list').reply({ code: 0, data: [
    { _id: 'legacy-bad-end', startDate: '2026-09-18', endDate: '2026-09-32' }
  ] })
  const { home, page } = await openEditor(app, period, { id: 'legacy-bad-end', startDate: '2026-09-18', endDate: '2026-09-32' })
  assert.equal(cell(home, '2026-09-18').isPeriod, false, 'a damaged range has no calendar projection')
  assert.equal(page.data.status, 'unknown-end')
  assert.equal(page.data.endDate, '')
  assert.equal(page.data.statusHint, '结束日不清楚，日历只标开始那天')
  assert.equal(page.data.periodDayCountText, '')
  assert.deepEqual(writes(app), [])
})

const statusCases = [
  { name: 'complete ongoing', route: { id: 'p1', startDate: '2026-09-10', status: 'ongoing' }, target: 'known-end', defaultEnd: '2026-09-20', end: '2026-09-14', duration: 5 },
  { name: 'complete unknown end', route: { id: 'p1', startDate: '2026-09-10', status: 'unknown-end' }, target: 'known-end', defaultEnd: '', end: '2026-09-13', duration: 4 },
  { name: 'forget known end', route: { id: 'p1', startDate: '2026-09-10', endDate: '2026-09-14' }, target: 'unknown-end', end: '', duration: 0 },
  { name: 'backfill unknown end', route: { startDate: '2026-09-10' }, target: 'unknown-end', end: '', duration: 0 }
]
for (const scenario of statusCases) {
  test(`period: ${scenario.name} preserves confirmed dates and saves the exact status`, async (t) => {
    const app = setup(t)
    const { home, page } = await openEditor(app, period, scenario.route)
    await app.dispatch(page, 'selectStatus', dataset({ value: scenario.target }))
    if (scenario.target === 'known-end') {
      assert.equal(page.data.endDate, scenario.defaultEnd)
      assert.equal(page.data.periodDayCountText, scenario.defaultEnd ? '共 11 天' : '')
      assert.equal(page.data.periodLengthHint, scenario.defaultEnd ? '比你通常的 5 天长，确认一下结束日？' : '')
      await app.dispatch(page, 'onEndChange', value(scenario.end))
      assert.equal(page.data.periodDayCountText, `共 ${scenario.duration} 天`)
      assert.equal(page.data.periodLengthHint, '')
    }
    const payload = { ...period.payload, startDate: '2026-09-10', endDate: scenario.end, status: scenario.target, duration: scenario.duration }
    const action = scenario.route.id ? 'update' : 'add'
    cloudRoute(app, period, action).reply({ code: 0, record: { _id: 'p1', ...payload } })
    await app.dispatch(page, 'save')
    assert.deepEqual(writes(app).map(call => [call.action, call.id, call.data]), [[action, scenario.route.id || '', payload]])
    assert.equal(cell(home, '2026-09-10').isPeriod, true)
    assert.equal(cell(home, '2026-09-11').isPeriod, scenario.target === 'known-end')
  })
}

for (const status of ['known-end', 'unknown-end']) {
  test(`period: ${status} draft survives reentry over an ongoing route`, async (t) => {
    const app = setup(t)
    const route = { id: 'drafted', startDate: '2026-09-10', status: 'ongoing' }
    const { page } = await openEditor(app, period, route)
    await app.dispatch(page, 'selectStatus', dataset({ value: status }))
    if (status === 'known-end') await app.dispatch(page, 'onEndChange', value('2026-09-14'))
    await app.dispatch(page, 'goBack')
    await app.flush()
    app.wx.navigateTo({ url: editUrl(period, route) })
    await app.settle()
    assert.equal(app.currentPage.data.status, status)
    assert.equal(app.currentPage.data.endDate, status === 'known-end' ? '2026-09-14' : '')
    assert.equal(app.currentPage.data.draftRestored, true)
  })
}

test('period: legacy draft restores its known dates, labels, flow and selected symptoms', async (t) => {
  const app = setup(t, { storage: { 'recordDraft:periods:legacy': JSON.stringify({ startDate: '2026-09-02', endDate: '2026-09-04', note: '旧草稿', flow: 'light', symptoms: ['cramps'] }) } })
  const { page } = await openEditor(app, period, { id: 'legacy', startDate: '2026-09-01', endDate: '2026-09-03' })
  assert.deepEqual(form(page, period), { startDate: '2026-09-02', endDate: '2026-09-04', status: 'known-end', note: '旧草稿', flow: 'light', symptoms: ['cramps'] })
  assert.equal(page.data.startDateLabel, '9月2日')
  assert.equal(page.data.endDateLabel, '9月4日')
  assert.equal(page.data.draftRestored, true)
  assert.deepEqual(page.data.symptomGroups.flatMap(group => group.options).filter(option => option.selected).map(option => option.value), ['cramps'])
})

test('period: status hints change without inventing a backfill end; history drives the length warning', async (t) => {
  const app = setup(t)
  cloudRoute(app, period, 'list').reply({ code: 0, data: [
    { _id: 'old1', startDate: '2026-05-01', endDate: '2026-05-03' },
    { _id: 'old2', startDate: '2026-06-01', endDate: '2026-06-03' }
  ] })
  const { page } = await openEditor(app, period, { startDate: '2026-09-10' })
  assert.equal(page.data.status, 'known-end')
  assert.equal(page.data.endDate, '')
  assert.equal(page.data.periodDayCountText, '')
  assert.equal(page.data.statusHint, '选好结束日期，这次经期才有确定的天数')
  await app.dispatch(page, 'onStartChange', value('2026-09-11'))
  assert.equal(page.data.endDate, '')
  await app.dispatch(page, 'save')
  assert.deepEqual(page.data.fieldErrors, { endDate: '请选择结束日期；还没结束可以选「进行中」' })
  await app.dispatch(page, 'onEndChange', value('2026-09-14'))
  assert.equal(page.data.periodDayCountText, '共 4 天')
  assert.equal(page.data.periodLengthHint, '比你通常的 3 天长，确认一下结束日？')
  for (const [status, hint] of [['unknown-end', '结束日不清楚，日历只标开始那天'], ['ongoing', '进行中可稍后补结束日期']]) {
    await app.dispatch(page, 'selectStatus', dataset({ value: status }))
    assert.equal(page.data.statusHint, hint)
    assert.equal(page.data.periodDayCountText, '')
  }
  assert.deepEqual(writes(app), [])
})

test('period: errors stay beside their own dates, hide with the field and retain the whole draft', async (t) => {
  const fields = { startDate: '2026-09-25', endDate: '2026-09-27', status: 'known-end', note: '草稿备注', flow: 'heavy', symptoms: ['cramps'] }
  const app = setup(t, { storage: { 'recordDraft:periods:p1': JSON.stringify(fields) } })
  const { page } = await openEditor(app, period, { id: 'p1', ...period.fields })
  await app.dispatch(page, 'toggleSymptom', dataset({ value: 'tired' }))
  await app.dispatch(page, 'save')
  await app.settle()
  assert.deepEqual(page.data.fieldErrors, { startDate: '开始日期不能晚于今天', endDate: '结束日期不能晚于今天' })
  assert.equal(app.platformCalls.pageScrollTo[0].selector, '#field-startDate')
  assert.deepEqual(form(page, period), { ...fields, symptoms: ['cramps', 'tired'] })
  assert.equal(page.data.draftRestored, true)
  assert.equal(app.wx.toasts.length, 1, 'only the restore notice is shown')
  app.hide()
  app.show()
  assert.deepEqual(JSON.parse(app.storage['recordDraft:periods:p1']), { ...fields, symptoms: ['cramps', 'tired'] })
  await app.dispatch(page, 'onStartChange', value('2026-09-15'))
  assert.deepEqual(page.data.fieldErrors, { endDate: '结束日期不能晚于今天' })
  await app.dispatch(page, 'selectStatus', dataset({ value: 'ongoing' }))
  assert.deepEqual(page.data.fieldErrors, {})
  await app.dispatch(page, 'selectStatus', dataset({ value: 'known-end' }))
  assert.deepEqual(page.data.fieldErrors, {})
  for (const [end, message] of [['2026-09-27', '结束日期不能晚于今天'], ['', '请选择结束日期；还没结束可以选「进行中」'], ['2026-02-31', '请选择有效的结束日期'], ['2026-09-14', '结束日期不能早于开始']]) {
    await app.dispatch(page, 'onEndChange', value(end))
    await app.dispatch(page, 'save')
    assert.deepEqual(page.data.fieldErrors, { endDate: message })
    assert.deepEqual(writes(app), [])
  }
  app.respondNext('showModal', { confirm: true })
  cloudRoute(app, period, 'remove').reply({ code: 0 })
  await app.dispatch(page, 'delete')
  assert.equal(writes(app).length, 1, 'validation does not prevent deleting the record')
  assert.equal(app.storage['recordDraft:periods:p1'], undefined)
})

for (const editExisting of [true, false]) {
  test(`period: overlap choice ${editExisting ? 'opens the real existing editor' : 'still creates'} without duplicate submissions`, async (t) => {
    const app = setup(t)
    const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end' }
    cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
    const { page } = await openEditor(app, period, { startDate: '2026-09-03' })
    await app.dispatch(page, 'onEndChange', value('2026-09-04'))
    app.hide()
    app.show()
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(app.wx.modals[0].title, '这一天已有经期')
    assert.equal(app.wx.modals[0].confirmText, '去编辑那条')
    assert.equal(app.wx.modals[0].cancelText, '仍然新建')
    await app.dispatch(page, 'save')
    assert.equal(app.wx.modals.length, 1)
    assert.deepEqual(writes(app), [])
    cloudRoute(app, period, 'add').reply({ code: 0, record: { _id: 'new', ...period.payload, startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', duration: 2 } })
    app.respond('showModal', 0, { confirm: editExisting, cancel: !editExisting })
    await saving
    await app.settle()
    if (editExisting) {
      assert.notEqual(app.currentPage, page)
      assert.equal(app.currentPage.data.isEdit, true)
      assert.equal(app.currentPage.data.startDate, '2026-09-01')
      assert.equal(app.currentPage.data.endDate, '2026-09-05')
      assert.deepEqual(writes(app), [])
    } else {
      assert.deepEqual(writes(app).map(call => call.data), [{ ...period.payload, startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', duration: 2 }])
    }
    assert.equal(app.storage[draftKey(period)], undefined)
  })
}

const overlapOwners = [
  { name: 'ongoing beats later completed', records: [
    { _id: 'live', startDate: '2026-09-10', status: 'ongoing' },
    { _id: 'done', startDate: '2026-09-18', endDate: '2026-09-20', status: 'known-end' }
  ], owner: 'live', day: 9, status: 'ongoing' },
  { name: 'latest ongoing wins', records: [
    { _id: 'old-live', startDate: '2026-09-01', status: 'ongoing' },
    { _id: 'new-live', startDate: '2026-09-15', status: 'ongoing' },
    { _id: 'done', startDate: '2026-09-18', endDate: '2026-09-20', status: 'known-end' }
  ], owner: 'new-live', day: 4, status: 'ongoing' },
  { name: 'later unknown end wins over completed', records: [
    { _id: 'done', startDate: '2026-09-10', endDate: '2026-09-20', status: 'known-end' },
    { _id: 'unknown', startDate: '2026-09-18', status: 'unknown-end' }
  ], owner: 'unknown', day: 1, status: 'unknown-end' },
  { name: 'an ongoing record outside the selected day does not override that day owner', records: [
    { _id: 'done', startDate: '2026-09-10', endDate: '2026-09-20', status: 'known-end' },
    { _id: 'live-after', startDate: '2026-09-19', status: 'ongoing' }
  ], owner: 'done', day: 9, status: 'known-end' },
  { name: 'latest completed wins', records: [
    { _id: 'first', startDate: '2026-09-10', endDate: '2026-09-20', status: 'known-end' },
    { _id: 'later', startDate: '2026-09-16', endDate: '2026-09-19', status: 'known-end' }
  ], owner: 'later', day: 3, status: 'known-end' }
]
for (const scenario of overlapOwners) {
  for (const editExisting of [true, false]) {
    test(`period overlap owner: ${scenario.name}, ${editExisting ? 'edit owner' : 'still create'}`, async (t) => {
      const app = setup(t)
      cloudRoute(app, period, 'list').reply({ code: 0, data: scenario.records })
      const { home, page } = await openEditor(app, period, { startDate: '2026-09-18', status: 'unknown-end' })
      assert.equal(cell(home, '2026-09-18').periodDayCount, scenario.day)
      assert.equal(cell(home, '2026-09-18').isOngoingPeriod, scenario.status === 'ongoing')
      assert.equal(cell(home, '2026-09-18').isUnknownEndPeriod, scenario.status === 'unknown-end')
      const saved = { _id: 'new-overlap', ...period.payload, startDate: '2026-09-18', status: 'unknown-end' }
      cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
      app.respondNext('showModal', { confirm: editExisting, cancel: !editExisting })
      await app.dispatch(page, 'save')
      await app.settle()
      assert.equal(app.wx.modals[0].confirmText, '去编辑那条')
      assert.equal(app.wx.modals[0].cancelText, '仍然新建')
      if (editExisting) {
        assert.equal(app.currentPage.data.id, scenario.owner)
        assert.equal(app.currentPage.data.status, scenario.status)
        assert.deepEqual(writes(app), [])
      } else {
        assert.deepEqual(writes(app).map(call => call.action), ['add'])
        assert.equal(writes(app)[0].data.status, 'unknown-end')
      }
    })
  }
}

test('period: merged save replaces the form, updates home once and moves drafts to the reopened identity', async (t) => {
  const app = setup(t)
  const existing = { _id: 'ongoing', ...period.payload, startDate: '2026-09-01', note: '伴侣已记', flow: 'normal', symptoms: ['tired'] }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  const home = app.launch(homeRoute)
  await app.flush()
  // An older editor snapshot misses the ongoing record; the cloud write is the final constraint.
  cloudRoute(app, period, 'list').reply({ code: 0, data: [] })
  app.wx.navigateTo({ url: editUrl(period) })
  await app.settle()
  const page = app.currentPage
  await app.dispatch(page, 'onNoteInput', value('被合并的输入'))
  app.hide()
  app.show()
  cloudRoute(app, period, 'add').reply({ code: 0, reopened: true, record: existing })
  const saving = app.dispatch(page, 'save')
  await app.settle()
  assert.deepEqual(app.wx.toasts, [])
  assert.equal(app.wx.modals.at(-1).title, '已打开进行中的经期')
  assert.equal(app.wx.modals.at(-1).content, '房间里已有一条进行中的经期，已为你打开它')
  assert.equal(app.wx.modals.at(-1).showCancel, false)
  app.respond('showModal', 0, { confirm: true })
  await saving
  assert.deepEqual(form(page, period), { ...period.fields, startDate: '2026-09-01', note: '伴侣已记', flow: 'normal', symptoms: ['tired'] })
  assert.equal(page.data.isEdit, true)
  assert.equal(page.data.draftRestored, false)
  assert.equal(app.storage[draftKey(period)], undefined)
  assert.equal(app.storage.recordTabSegment, 'period')
  assert.equal(cell(home, '2026-09-01').isPeriod, true)
  assert.deepEqual(page.data.symptomGroups.flatMap(group => group.options).filter(option => option.selected).map(option => option.value), ['tired'])
  await app.advance(1000)
  assert.equal(app.currentPage, page, 'merge explains and stays open instead of returning')
  await app.dispatch(page, 'selectStatus', dataset({ value: 'known-end' }))
  await app.dispatch(page, 'onEndChange', value('2026-09-05'))
  app.hide()
  app.show()
  assert.equal(app.storage[draftKey(period)], undefined)
  assert.deepEqual(JSON.parse(app.storage[draftKey(period, 'ongoing')]), { ...period.fields, startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end', note: '伴侣已记', flow: 'normal', symptoms: ['tired'] })
  const refresh = cloudRoute(app, period, 'list').defer()
  await app.dispatch(page, 'goBack')
  await app.settle()
  await app.dispatch(home, 'onDayTap', dataset({ date: '2026-09-01' }))
  await app.settle()
  assert.equal(home.data.selectedDayDetail.periods.length, 1, 'the optimistic update cannot duplicate the existing record before refresh')
  refresh.resolve({ code: 0, data: [existing] })
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  await app.flush()
  await app.dispatch(home, 'onDayRecordTap', dataset({ kind: 'period', id: home.data.selectedDayDetail.periods[0].recordId }))
  await app.flush()
  assert.equal(app.currentPage.data.draftRestored, true)
  assert.equal(app.currentPage.data.endDate, '2026-09-05')
  cloudRoute(app, period, 'update').reply({ code: 0, record: { ...existing, endDate: '2026-09-05', status: 'known-end', duration: 5 } })
  await app.dispatch(app.currentPage, 'save')
  assert.deepEqual(writes(app).map(call => [call.action, call.id]), [['add', ''], ['update', 'ongoing']])
  assert.equal(app.storage[draftKey(period, 'ongoing')], undefined)
  assert.equal(cell(home, '2026-09-06').isPeriod, false, 'completion updates the original band instead of adding another period')
})

test('period: merge replaces visible labels and draft baseline before the same editor saves an update', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period)
  const existing = { _id: 'ongoing', ...period.payload, startDate: '2026-09-01', note: '已有备注', flow: 'light', symptoms: ['tired'] }
  await app.dispatch(page, 'onNoteInput', value('本次新增输入'))
  app.hide()
  app.show()
  cloudRoute(app, period, 'add').reply({ code: 0, reopened: true, record: existing })
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(page, 'save')
  assert.equal(page.data.id, 'ongoing')
  assert.equal(page.data.startDateLabel, '9月1日')
  assert.equal(page.data.endDateLabel, '')
  assert.equal(page.data.note, '已有备注')
  app.hide()
  app.show()
  assert.equal(app.storage[draftKey(period)], undefined)
  assert.equal(app.storage[draftKey(period, 'ongoing')], undefined, 'unchanged merged fields are the new baseline')
  await app.dispatch(page, 'onNoteInput', value('修改这条记录'))
  app.hide()
  app.show()
  assert.deepEqual(JSON.parse(app.storage[draftKey(period, 'ongoing')]), {
    startDate: '2026-09-01', endDate: '', status: 'ongoing', note: '修改这条记录', flow: 'light', symptoms: ['tired']
  })
  await app.dispatch(page, 'onNoteInput', value('已有备注'))
  app.hide()
  app.show()
  assert.equal(app.storage[draftKey(period, 'ongoing')], undefined)
  await app.dispatch(page, 'onNoteInput', value('再次保存'))
  cloudRoute(app, period, 'update').reply({ code: 0, record: { ...existing, note: '再次保存' } })
  await app.dispatch(page, 'save')
  assert.deepEqual(writes(app).map(call => [call.action, call.id]), [['add', ''], ['update', 'ongoing']])
  assert.deepEqual(writes(app)[1].data, {
    startDate: '2026-09-01', endDate: '', status: 'ongoing', note: '再次保存', duration: 0, flow: 'light', symptoms: ['tired']
  })
  assert.equal(app.storage[draftKey(period)], undefined)
  assert.equal(app.storage[draftKey(period, 'ongoing')], undefined)
})

for (const spec of records) {
  test(`${spec.kind}: malformed route text stays editable and legacy success does not invent a home record`, async (t) => {
    const app = setup(t)
    const { home, page } = await openEditor(app, spec, { [spec.dateField]: '2026-09-18', note: '%E0%A4%A', ...(spec.kind === 'period' ? { endDate: '2026-09-19', symptoms: '%E0%A4%A' } : {}) })
    assert.equal(page.data.note, '%E0%A4%A')
    assert.equal(page.data[spec.dateField], '2026-09-18')
    if (spec.kind === 'period') {
      assert.deepEqual(page.data.symptoms, [])
      assert.equal(page.data.status, 'known-end')
      assert.equal(page.data.endDate, '2026-09-19')
    }
    cloudRoute(app, spec, 'add').reply({ code: 0, id: 'legacy' })
    await app.dispatch(page, 'save')
    assert.equal(page.data.submitted, true)
    assert.equal(app.wx.toasts.at(-1).title, spec.success)
    assert.equal(cell(home, '2026-09-18')[spec.marker], false)
    await app.advance(1000)
    assert.equal(app.currentPage, home)
  })

  test(`${spec.kind}: drafts persist on hide and unload, restore only their record, and clear at the baseline`, async (t) => {
    const app = setup(t)
    const route = { id: 'existing', [spec.dateField]: '2026-09-18', note: '原备注', ...(spec.kind === 'period' ? { status: 'ongoing' } : {}) }
    const { home, page } = await openEditor(app, spec, route)
    const baseline = form(page, spec)
    assert.equal(page.data.draftRestored, false)
    assert.deepEqual(app.wx.toasts, [])
    app.hide()
    assert.equal(page.data.pageHidden, true)
    assert.equal(app.storage[draftKey(spec, 'existing')], undefined)
    app.show()
    assert.equal(page.data.pageHidden, false)
    await app.dispatch(page, spec.changeDate, value('2026-09-17'))
    await app.dispatch(page, 'onNoteInput', value('未完成'))
    if (spec.kind === 'period') {
      await app.dispatch(page, 'selectFlow', dataset({ value: 'heavy' }))
      await app.dispatch(page, 'toggleSymptom', dataset({ value: 'cramps' }))
    }
    const expected = { ...baseline, [spec.dateField]: '2026-09-17', note: '未完成', ...(spec.kind === 'period' ? { flow: 'heavy', symptoms: ['cramps'] } : {}) }
    app.hide()
    assert.deepEqual(JSON.parse(app.storage[draftKey(spec, 'existing')]), expected)
    app.show()
    await app.dispatch(page, 'onNoteInput', value('卸载前又改了'))
    await app.dispatch(page, 'goBack')
    await app.flush()
    assert.equal(app.currentPage, home)
    assert.deepEqual(JSON.parse(app.storage[draftKey(spec, 'existing')]), { ...expected, note: '卸载前又改了' })
    for (const id of ['other', '']) {
      app.wx.navigateTo({ url: editUrl(spec, { ...route, id }) })
      await app.settle()
      assert.equal(app.currentPage.data.note, '原备注')
      assert.equal(app.currentPage.data.draftRestored, false)
      await app.dispatch(app.currentPage, 'goBack')
      await app.flush()
    }
    app.wx.navigateTo({ url: editUrl(spec, route) })
    await app.settle()
    const restored = app.currentPage
    assert.deepEqual(form(restored, spec), { ...expected, note: '卸载前又改了' })
    assert.equal(restored.data.draftRestored, true)
    assert.equal(app.wx.toasts.at(-1).title, '已恢复上次未完成的输入')
    assert.equal(restored.data[spec.kind === 'period' ? 'startDateLabel' : 'dateLabel'], '9月17日')
    if (spec.kind === 'period') {
      assert.deepEqual(restored.data.symptomGroups.flatMap(group => group.options).filter(option => option.selected).map(option => option.value), ['cramps'])
      await app.dispatch(restored, 'selectFlow', dataset({ value: 'heavy' }))
      await app.dispatch(restored, 'toggleSymptom', dataset({ value: 'cramps' }))
    }
    await app.dispatch(restored, spec.changeDate, value('2026-09-18'))
    await app.dispatch(restored, 'onNoteInput', value('原备注'))
    await app.dispatch(restored, 'goBack')
    await app.flush()
    assert.equal(app.storage[draftKey(spec, 'existing')], undefined)
    assert.deepEqual(writes(app), [])
  })

  const errors = spec.kind === 'period'
    ? ['', '2026-02-31', '2026-09-21'].map((date, index) => [date, ['请选择开始日期', '请选择有效的开始日期', '开始日期不能晚于今天'][index]])
    : ['', '2026-02-31', '2026-09-21'].map((date, index) => [date, ['请选择日期', '请选择有效日期', '日期不能晚于今天'][index]])
  for (const [date, message] of errors) {
    test(`${spec.kind}: ${date || 'missing date'} shows its field error without losing input or writing`, async (t) => {
      const app = setup(t)
      const { home, page } = await openEditor(app, spec, { id: 'invalid', ...spec.fields })
      await app.dispatch(page, spec.changeDate, value(date))
      await app.dispatch(page, 'onNoteInput', value('保留输入'))
      assert.deepEqual(page.data.fieldErrors, {}, 'editing a pristine field does not announce an error')
      await app.dispatch(page, 'save')
      await app.settle()
      assert.deepEqual(page.data.fieldErrors, { [spec.dateField]: message })
      assert.equal(page.data.saving, false)
      assert.equal(page.data.submitted, false)
      assert.equal(page.data.note, '保留输入')
      assert.deepEqual(writes(app), [])
      assert.deepEqual(app.wx.toasts, [])
      assert.equal(cell(home)[spec.marker], false)
      assert.deepEqual(app.platformCalls.pageScrollTo, [{ selector: `#field-${spec.dateField}`, offsetTop: -page.data.navBarHeight, duration: 0 }])
      app.hide()
      assert.equal(JSON.parse(app.storage[draftKey(spec, 'invalid')])[spec.dateField], date)
      app.show()
      await app.dispatch(page, spec.changeDate, value('2026-09-19'))
      assert.deepEqual(page.data.fieldErrors, {})
      cloudRoute(app, spec, 'update').reply({ code: 0, record: { _id: 'invalid', ...spec.payload, [spec.dateField]: '2026-09-19', note: '保留输入' } })
      await app.dispatch(page, 'save')
      assert.equal(writes(app).length, 1)
      assert.equal(writes(app)[0].id, 'invalid')
      assert.equal(writes(app)[0].data[spec.dateField], '2026-09-19')
      assert.equal(app.storage[draftKey(spec, 'invalid')], undefined)
      await app.dispatch(page, 'save')
      assert.equal(writes(app).length, 1)
    })
  }

  for (const action of ['add', 'update']) {
    const outcomes = ['match', 'different fields', 'empty list', 'refetch failure', ...(action === 'update' ? ['different identity'] : [])]
    for (const result of outcomes) {
      test(`${spec.kind}: unconfirmed ${action} checks ${result} before permitting another write`, async (t) => {
        const app = setup(t)
        const { home, page } = await openEditor(app, spec, { ...spec.fields, ...(action === 'update' ? { id: 'edited' } : {}) })
        await app.dispatch(page, 'onNoteInput', value('待核对的输入'))
        app.hide()
        app.show()
        const key = draftKey(spec, action === 'update' ? 'edited' : 'new')
        const pending = cloudRoute(app, spec, action).defer()
        const saving = app.dispatch(page, 'save')
        await app.settle()
        const check = cloudRoute(app, spec, 'list').defer()
        pending.reject(new Error('network down'))
        await app.settle()
        assert.equal(page.data.saving, true)
        assert.equal(cell(home)[spec.marker], false)
        await app.dispatch(page, 'save')
        assert.equal(writes(app).length, 1)
        const saved = { _id: 'edited', ...spec.payload, note: '待核对的输入' }
        if (result === 'refetch failure') check.reject(new Error('network down'))
        else check.resolve({ code: 0, data: result === 'empty list' ? [] : [{ ...saved,
          ...(result === 'different fields' ? { note: '旧内容' } : {}),
          ...(result === 'different identity' ? { _id: 'other' } : {}) }] })
        await app.settle()
        if (result === 'match') {
          await saving
          assert.equal(app.wx.toasts.at(-1).title, '已保存')
          assert.equal(page.data.submitted, true)
          assert.equal(cell(home)[spec.marker], true)
          assert.equal(app.storage[key], undefined)
          cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved] })
          await app.advance(1000)
          assert.equal(app.currentPage, home)
        } else {
          const modal = app.wx.modals.at(-1)
          assert.equal(modal.title, '保存失败')
          assert.equal(modal.showCancel, false)
          assert.equal(modal.content, result === 'refetch failure'
            ? '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
            : '没有保存成功，请重试')
          app.respond('showModal', app.wx.modals.length - 1, { confirm: true })
          await saving
          assert.equal(page.data.saving, false)
          assert.equal(page.data.submitted, false)
          assert.equal(page.data.note, '待核对的输入')
          assert.ok(app.storage[key])
          assert.equal(app.storage.recordTabSegment, undefined)
          assert.equal(cell(home)[spec.marker], false)
          await app.advance(1000)
          assert.equal(app.currentPage, page)
        }
        assert.equal(writes(app).length, 1, 'reconciliation must not replay the mutation')
      })
    }
  }

  test(`${spec.kind}: business rejection and acknowledged room repair preserve input without touching home`, async (t) => {
    const app = setup(t)
    const { home, page } = await openEditor(app, spec)
    await app.dispatch(page, 'onNoteInput', value('失败后仍保留'))
    cloudRoute(app, spec, 'add').reply({ code: -9, msg: '保存失败，请稍后重试' })
    await app.dispatch(page, 'save')
    assert.equal(app.wx.toasts.at(-1).title, '保存失败，请稍后重试')
    cloudRoute(app, spec, 'add').reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(app.wx.modals.at(-1).title, '房间状态已同步')
    assert.equal(app.wx.modals.at(-1).content, '房间状态已同步\n\n保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交')
    assert.equal(app.wx.modals.at(-1).confirmText, '知道了')
    assert.equal(app.wx.modals.at(-1).showCancel, false)
    app.respond('showModal', app.wx.modals.length - 1, { confirm: true })
    await saving
    assert.equal(cell(home)[spec.marker], false)
    assert.equal(page.data.saving, false)
    assert.equal(page.data.submitted, false)
    assert.equal(app.storage.recordTabSegment, undefined)
    assert.equal(writes(app).length, 2)
    app.hide()
    assert.equal(JSON.parse(app.storage[draftKey(spec)]).note, '失败后仍保留')
  })

  test(`${spec.kind}: delete confirms once, cancels cleanly, locks during the write and removes home on confirmation`, async (t) => {
    const app = setup(t)
    const saved = { _id: 'deleted', ...spec.payload }
    cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved] })
    const { home, page } = await openEditor(app, spec, { id: 'deleted', ...spec.fields })
    await app.dispatch(page, 'onNoteInput', value('删除前的草稿'))
    app.hide()
    app.show()
    const cancelled = app.dispatch(page, 'delete')
    await app.settle()
    const modal = app.wx.modals[0]
    assert.equal(modal.title, '确认删除')
    assert.equal(modal.content, spec.consequence)
    assert.equal(modal.confirmText, '删除')
    assert.equal(modal.confirmColor, '#F97373')
    assert.equal(page.data.deleting, false)
    await app.dispatch(page, 'delete')
    assert.equal(app.wx.modals.length, 1)
    app.respond('showModal', 0, { confirm: false, cancel: true })
    await cancelled
    assert.deepEqual(writes(app), [])
    assert.equal(cell(home)[spec.marker], true)
    const pending = cloudRoute(app, spec, 'remove').defer()
    const deleting = app.dispatch(page, 'delete')
    app.respond('showModal', 1, { confirm: true })
    await app.settle()
    assert.equal(app.rendered(page).deleting, true)
    await app.dispatch(page, 'delete')
    await app.dispatch(page, 'save')
    assert.equal(app.wx.modals.length, 2)
    assert.equal(writes(app).length, 1)
    assert.equal(cell(home)[spec.marker], true)
    pending.resolve({ code: 0 })
    await deleting
    assert.equal(page.data.deleting, false)
    assert.equal(page.data.submitted, true)
    assert.equal(app.currentPage, page)
    assert.equal(cell(home)[spec.marker], false)
    assert.equal(app.wx.toasts.at(-1).title, '已删除')
    assert.equal(app.storage[draftKey(spec, 'deleted')], undefined)
    assert.equal(app.storage.recordTabSegment, spec.kind)
    await app.dispatch(page, 'delete')
    await app.dispatch(page, 'save')
    assert.equal(writes(app).length, 1)
    assert.deepEqual(writes(app)[0], { action: 'remove', collection: spec.collection, data: {}, id: 'deleted', roomCode: 'ROOM01' })
    cloudRoute(app, spec, 'list').reply({ code: 0, data: [] })
    await app.advance(0)
    assert.equal(app.currentPage, home)
    assert.equal(app.navigation.filter(item => item.method === 'navigateBack').length, 1)
    assert.equal(app.storage[draftKey(spec, 'deleted')], undefined)
    app.wx.switchTab({ url: tabRoute })
    await app.flush()
    assert.equal(app.currentPage.data.segment, spec.kind)
    assert.equal(app.storage.recordTabSegment, undefined)
  })

  test(`${spec.kind}: save from home stays busy once, applies the canonical record, and returns on the fake clock`, async (t) => {
    const app = setup(t)
    const home = app.launch(homeRoute)
    await app.flush()
    await app.dispatch(home, spec.quick)
    await app.settle()
    const page = app.currentPage
    assert.equal(page.route, `pages/${spec.kind}/edit/edit`)
    assert.deepEqual(form(page, spec), spec.fields)
    assert.equal(page.data.maxDate, '2026-09-20')
    await app.dispatch(page, 'onNoteInput', value('表单备注'))
    app.hide()
    app.show()
    assert.ok(app.storage[draftKey(spec)])
    const pending = cloudRoute(app, spec, 'add').defer()
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(app.rendered(page).saving, true)
    if (spec.kind === 'period') {
      await app.dispatch(page, 'selectFlow', dataset({ value: 'heavy' }))
      await app.dispatch(page, 'toggleSymptom', dataset({ value: 'cramps' }))
      await app.dispatch(page, 'selectStatus', dataset({ value: 'unknown-end' }))
      assert.equal(page.data.flow, '')
      assert.deepEqual(page.data.symptoms, [])
      assert.equal(page.data.status, 'ongoing')
    }
    assert.equal(cell(home)[spec.marker], false)
    await app.dispatch(page, 'save')
    await app.dispatch(page, 'delete')
    assert.equal(writes(app).length, 1)
    assert.equal(app.wx.modals.length, 0)
    const saved = { _id: 'saved', ...spec.payload, [spec.dateField]: '2026-09-19', note: '云端确认的备注' }
    pending.resolve({ code: 0, record: saved })
    await saving
    await app.settle()
    assert.equal(app.rendered(page).saving, false)
    assert.equal(app.rendered(page).submitted, true)
    assert.deepEqual(writes(app), [{ action: 'add', collection: spec.collection, data: { ...spec.payload, note: '表单备注' }, id: '', roomCode: 'ROOM01' }])
    assert.equal(app.wx.toasts.at(-1).title, spec.success)
    if (spec.kind === 'memory') assert.equal(app.wx.toasts.at(-1).icon, 'none')
    assert.equal(cell(home, '2026-09-19')[spec.marker], true, 'the calendar uses the canonical date, not the submitted date')
    assert.equal(app.storage[draftKey(spec)], undefined)
    assert.equal(app.storage.recordTabSegment, spec.kind)
    await app.dispatch(page, 'save')
    await app.dispatch(page, 'delete')
    assert.equal(writes(app).length, 1)
    assert.equal(app.wx.modals.length, 0)
    cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved] })
    await app.advance(999)
    assert.equal(app.currentPage, page)
    await app.advance(1)
    assert.equal(app.currentPage, home)
    assert.equal(app.navigation.filter(item => item.method === 'navigateBack').length, 1)
    assert.equal(app.storage[draftKey(spec)], undefined, 'unload must not resurrect the saved draft')
    await app.dispatch(home, 'onDayTap', dataset({ date: '2026-09-19' }))
    await app.settle()
    const row = home.data.selectedDayDetail[spec.collection][0]
    await app.dispatch(home, 'onDayRecordTap', dataset({ kind: spec.kind, id: row.recordId }))
    await app.flush()
    assert.equal(app.currentPage.data.note, '云端确认的备注')
    assert.equal(app.currentPage.data[spec.dateField], '2026-09-19')
    await app.dispatch(app.currentPage, 'goBack')
    await app.flush()
    app.wx.switchTab({ url: tabRoute })
    await app.flush()
    assert.equal(app.currentPage.data.segment, spec.kind)
    assert.equal(app.storage.recordTabSegment, undefined)
  })
}
