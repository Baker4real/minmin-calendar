const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')
const { changeEditorDate, confirmDelete } = require('./helpers/recordPages')
const { readSource } = require('./sourceFiles')
const { evaluateWxmlExpression, renderWxmlAttribute, renderWxmlClasses, wxmlOpeningTags } = require('./wxmlTemplate')

const value = value => ({ detail: { value } })
const dataset = value => ({ currentTarget: { dataset: value } })
const homeRoute = '/pages/index/index'
const tabRoute = '/pages/period/period'
const records = [
  { kind: 'period', collection: 'periods', dateField: 'startDate', changeDate: 'onStartChange', quick: 'quickPeriod', marker: 'isPeriod',
    fields: { startDate: '2026-09-20', endDate: '', status: 'ongoing', note: '', flow: '', symptoms: [] },
    payload: { startDate: '2026-09-20', endDate: '', status: 'ongoing', note: '', duration: 0, flow: '', symptoms: [] },
    success: '保存成功', deleteTitle: '删除这条经期？' },
  { kind: 'memory', collection: 'memories', dateField: 'date', changeDate: 'onDateChange', quick: 'quickMemory', marker: 'isMemory',
    fields: { date: '2026-09-20', note: '' }, payload: { date: '2026-09-20', note: '' },
    success: '已存进你们的欢乐时光', deleteTitle: '删除这条欢乐时光？' }
]
const period = records[0]
const cloudRoute = (app, spec, action) => app.cloud.when({ name: 'dataOp', data: { action, collection: spec.collection } })
const writes = app => app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action !== 'list').map(call => call.data)
const form = (page, spec) => Object.fromEntries(Object.keys(spec.fields).map(key => [key, page.data[key]]))
const draftKey = (spec, id = 'new') => `recordDraft:${spec.collection}:${id}`
const editUrl = (spec, options = {}) => `/pages/${spec.kind}/edit/edit?${new URLSearchParams(options)}`
const cell = (page, date = '2026-09-20') => page.data.days.find(day => day.date === date)

function sharedTemplateData(spec, templateName, handlerKey, handler, data) {
  const file = path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxml`)
  const invocations = wxmlOpeningTags(fs.readFileSync(file, 'utf8'))
    .filter(tag => tag.tag === 'template' && tag.attrs.is === templateName)
  for (const invocation of invocations) {
    const expression = /^\{\{([\s\S]*)\}\}$/.exec(invocation.attrs.data || '')
    assert.ok(expression, `${spec.kind} ${templateName} passes a data object`)
    const mapped = evaluateWxmlExpression(`{${expression[1]}}`, data)
    if (mapped[handlerKey] === handler) return mapped
  }
  assert.fail(`${spec.kind} binds ${handler} through ${templateName}`)
}

function datePickerName(spec, handler, data) {
  const mapped = sharedTemplateData(spec, 'sharedDateField', 'tapHandler', handler, data)
  const file = path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxml`)
  const picker = wxmlOpeningTags(readSource(file, 'utf8')).find(tag => tag.classes.includes('form-picker') && tag.attrs.bindtap === '{{tapHandler}}')
  assert.ok(picker, `${spec.kind} exposes its ${handler} date field through the shared template`)
  return renderWxmlAttribute(picker.attrs['aria-label'], mapped)
}

function setup(t, options = {}) {
  const app = createMiniProgram({ now: '2026-09-20T12:00:00+08:00', ...options, storage: { roomCode: 'ROOM01', ...options.storage } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  for (const spec of records) cloudRoute(app, spec, 'list').reply({ code: 0, data: [] })
  return app
}

// Periods this device has not read yet: a new period's save first asks the shared records to load them.
function periodsUnread(app) {
  cloudRoute(app, period, 'list').reject(new Error('network down'))
}

async function openEditor(app, spec, options = {}) {
  const home = app.launch(homeRoute)
  await app.flush()
  app.wx.navigateTo({ url: editUrl(spec, options) })
  await app.settle()
  return { home, page: app.currentPage }
}

test('edit pages name new, backfill, completion and existing-record actions', async (t) => {
  for (const spec of records) {
    const noun = spec.kind === 'period' ? '经期' : '欢乐时光'
    const scenarios = [
      { name: 'today', options: {}, title: `记${noun}` },
      { name: 'past', options: { [spec.dateField]: '2026-09-18' }, title: `补记${noun}` },
      { name: 'existing', options: { id: 'existing', ...spec.fields }, title: `编辑${noun}` }
    ]
    if (spec.kind === 'period') scenarios.push({ name: 'completion', options: { id: 'existing', ...spec.fields, intent: 'complete', endDate: '2026-09-20', status: 'known-end' }, title: '记结束' })
    for (const scenario of scenarios) {
      await t.test(`${spec.kind}: ${scenario.name}`, async (t) => {
        const app = setup(t)
        const { page } = await openEditor(app, spec, scenario.options)
        assert.equal(page.data.pageTitle, scenario.title)
      })
    }
  }
})

test('paired entries show the routed author and delete confirmation sentence; unpaired entries omit both', async (t) => {
  for (const spec of records) {
    for (const paired of [true, false]) {
      await t.test(`${spec.kind}: ${paired ? 'paired' : 'unpaired'}`, async (t) => {
        const app = setup(t)
        const fields = spec.kind === 'period'
          ? { ...spec.fields, startDate: '2026-09-18', endDate: '2026-09-20', status: 'known-end' }
          : spec.fields
        const saved = { _id: 'authored', ...fields, createdByMe: false }
        cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved], roomStatus: paired ? 'paired' : 'waiting' })
        const home = app.launch(homeRoute)
        await app.flush()
        await app.dispatch(home, 'onDayTap', dataset({ date: '2026-09-20' }))
        await app.settle()
        await app.dispatch(home, 'onDayRecordTap', dataset({ kind: spec.kind, id: 'authored' }))
        await app.settle()
        const page = app.currentPage
        assert.equal(page.data.authorLabel, paired ? 'TA 记的' : undefined)
        const cancelled = app.dispatch(page, 'delete')
        await app.settle()
        assert.equal(page.data.confirmationContent, paired
          ? '这条是 TA 记的；删除后你们两人的日历里都会移除'
          : '删除后你们两人的日历里都会移除')
        await app.dispatch(page, 'onConfirmationAction', dataset({ action: 'cancel' }))
        await app.advance(200)
        await cancelled
      })
    }
  }
})

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
      assert.equal(page.data.periodDayCountText, scenario.defaultEnd ? '共 11 天' : '')
      assert.equal(page.data.periodLengthHint, scenario.defaultEnd ? '比你通常的 5 天长，确认一下结束日？' : '')
      await changeEditorDate(app, page, 'onEndChange', scenario.end)
      assert.equal(page.data.periodDayCountText, `共 ${scenario.duration} 天`)
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
    if (status === 'known-end') await changeEditorDate(app, page, 'onEndChange', '2026-09-14')
    await app.dispatch(page, 'goBack')
    await app.flush()
    app.wx.navigateTo({ url: editUrl(period, route) })
    await app.settle()
    assert.equal(app.currentPage.data.status, status)
    assert.equal(app.currentPage.data.endDate, status === 'known-end' ? '2026-09-14' : '')
    assert.equal(app.currentPage.data.draftRestored, true)
  })
}

test('period: constant options are initial page data, not session render patches', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period)
  assert.deepEqual(page.data.statusOptions.map(item => item.value), ['ongoing', 'unknown-end', 'known-end'])
  assert.deepEqual(page.data.flowOptions.map(item => item.value), ['light', 'normal', 'heavy'])
  assert.deepEqual(page.data.symptomGroups.flatMap(group => group.options).map(item => item.value), ['cramps', 'headache', 'tired', 'acne', 'mood', 'sleep', 'cravings'])
  const constantKeys = ['statusOptions', 'flowOptions', 'symptomGroups']
  assert.equal(page.setDataCalls.some(patch => constantKeys.some(key => key in patch)), false)
  await app.dispatch(page, 'selectFlow', dataset({ value: 'heavy' }))
  await app.dispatch(page, 'toggleSymptom', dataset({ value: 'cramps' }))
  assert.equal(page.setDataCalls.some(patch => constantKeys.some(key => key in patch)), false)
  assert.deepEqual(page.data.selectedSymptoms, { cramps: true })
})

test('period: legacy draft restores its known dates, labels, flow and selected symptoms', async (t) => {
  const app = setup(t, { storage: { 'recordDraft:periods:legacy': JSON.stringify({ startDate: '2026-09-02', endDate: '2026-09-04', note: '旧草稿', flow: 'light', symptoms: ['cramps'] }) } })
  const { page } = await openEditor(app, period, { id: 'legacy', startDate: '2026-09-01', endDate: '2026-09-03' })
  assert.deepEqual(form(page, period), { startDate: '2026-09-02', endDate: '2026-09-04', status: 'known-end', note: '旧草稿', flow: 'light', symptoms: ['cramps'] })
  assert.equal(page.data.startDateLabel, '9月2⁠日')
  assert.equal(page.data.endDateLabel, '9月4⁠日')
  assert.equal(page.data.draftRestored, true)
  assert.deepEqual(Object.keys(page.data.selectedSymptoms || {}).filter(key => page.data.selectedSymptoms[key]), ['cramps'])
})

test('R2 date panel: period start opens three bounded columns and confirms the draft', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
  assert.equal(sharedTemplateData(period, 'sharedDateField', 'tapHandler', 'openStartDatePicker', page.data).focused, false)

  await app.dispatch(page, 'openStartDatePicker')
  await app.settle()
  assert.equal(sharedTemplateData(period, 'sharedDateField', 'tapHandler', 'openStartDatePicker', page.data).focused, true)
  assert.equal(page.data.datePickerPhase, 'open')
  assert.equal(page.data.datePickerTitle, '开始日期')
  assert.equal(page.data.datePickerYears[0].label, '1900年')
  assert.equal(page.data.datePickerYears.at(-1).label, '2026年')
  assert.equal(page.data.datePickerMonths.at(-1).label, '12月')
  assert.equal(page.data.datePickerDays.at(-1).label, '31⁠日')
  assert.deepEqual(page.data.datePickerValue, [125, 11, 29])

  const expanded = readSource(path.join(__dirname, '../pages/period/edit/edit.wxml'), 'utf8')
  const columns = wxmlOpeningTags(expanded).filter(tag => tag.tag === 'picker-view-column')
  assert.equal(columns.length, 3)
  assert.deepEqual(columns.map(column => renderWxmlAttribute(column.attrs['aria-label'], page.data)), [
    '年份，2025年', '月份，12月', '日，30⁠日'
  ])
  const confirm = wxmlOpeningTags(expanded).find(tag => tag.attrs.bindtap === 'onDatePickerConfirm')
  assert.ok(confirm)
  assert.equal(renderWxmlAttribute(confirm.attrs['aria-label'], page.data), '确定，2025年12月30⁠日')

  await app.dispatch(page, 'onDatePickerChange', { detail: { value: [126, 11, 29] } })
  assert.equal(page.data.datePickerDraft, '2026-09-20', 'today is the inclusive upper bound')
  assert.equal(page.data.datePickerMonths.at(-1).label, '9月')
  assert.equal(page.data.datePickerDays.at(-1).label, '20⁠日')

  await app.dispatch(page, 'onDatePickerChange', { detail: { value: [125, 0, 0] } })
  assert.equal(page.data.datePickerDraft, '2025-01-01')
  assert.deepEqual(columns.map(column => renderWxmlAttribute(column.attrs['aria-label'], page.data)), [
    '年份，2025年', '月份，1月', '日，1⁠日'
  ])
  assert.equal(renderWxmlAttribute(confirm.attrs['aria-label'], page.data), '确定，2025年1月1⁠日')
  await app.dispatch(page, 'onDatePickerConfirm')
  await app.settle()
  assert.equal(page.data.startDate, '2025-01-01')
  assert.equal(page.data.datePickerPhase, 'leaving')
  await app.advance(200)
  assert.equal(page.data.datePickerMounted, false)
})

test('R2 date panel: all three date fields synchronize rounded pixel geometry across viewport widths', async (t) => {
  const viewports = [
    { name: '320px', width: 320, row: 38, height: 190, mask: 76, top: 76 },
    { name: '390px', width: 390, row: 46, height: 230, mask: 92, top: 92 },
    { name: '430px', width: 430, row: 50, height: 250, mask: 100, top: 100 },
    { name: 'missing window width', width: undefined, row: 44, height: 220, mask: 88, top: 88 }
  ]
  const panels = [
    { name: 'period start', spec: period, open: 'openStartDatePicker', options: { startDate: '2025-12-30', endDate: '2025-12-30' } },
    { name: 'period end', spec: period, open: 'openEndDatePicker', options: { startDate: '2025-12-30', endDate: '2025-12-30' } },
    { name: 'memory date', spec: records[1], open: 'openMemoryDatePicker', options: { date: '2025-12-30' } }
  ]
  for (const viewport of viewports) {
    for (const panel of panels) {
      await t.test(`${viewport.name}: ${panel.name}`, async (t) => {
        const app = setup(t, { windowInfo: { windowWidth: viewport.width } })
        const { page } = await openEditor(app, panel.spec, panel.options)
        await app.dispatch(page, panel.open)
        await app.settle()

        assert.equal(page.data.datePickerRowHeight, viewport.row)
        assert.equal(page.data.datePickerHeight, viewport.height)
        assert.equal(page.data.datePickerMaskHeight, viewport.mask)
        assert.equal(page.data.datePickerIndicatorTop, viewport.top)
        const mapped = sharedTemplateData(panel.spec, 'sharedBottomSheet', 'bodyTemplate', 'datePickerSheetBody', page.data)
        assert.equal(mapped.datePickerRowHeight, viewport.row)
        assert.equal(mapped.datePickerHeight, viewport.height)
        assert.equal(mapped.datePickerMaskHeight, viewport.mask)
        assert.equal(mapped.datePickerIndicatorTop, viewport.top)

        const expanded = readSource(path.join(__dirname, `../pages/${panel.spec.kind}/edit/edit.wxml`), 'utf8')
        const nodes = wxmlOpeningTags(expanded)
        const frame = nodes.find(tag => tag.classes.includes('date-picker-columns'))
        const picker = nodes.find(tag => tag.tag === 'picker-view')
        assert.equal(renderWxmlAttribute(frame.attrs.style, page.data), `height: ${viewport.height}px; --date-picker-mask-height: ${viewport.mask}px;`)
        assert.equal(renderWxmlAttribute(picker.attrs.style, page.data), `height: ${viewport.height}px;`)
        const indicator = renderWxmlAttribute(picker.attrs['indicator-style'], page.data)
        assert.match(indicator, new RegExp(`height: ${viewport.row}px;`))
        assert.match(indicator, new RegExp(`top: ${viewport.top}px;`))
        const options = nodes.filter(tag => tag.classes.includes('date-picker-option'))
        assert.equal(options.length, 3)
        for (const option of options) {
          assert.equal(renderWxmlAttribute(option.attrs.style, page.data), `height: ${viewport.row}px; line-height: ${viewport.row}px;`)
        }
      })
    }
  }
})

test('R2 date panel: inertia locks confirmation until the settled draft can submit', async (t) => {
  const scenarios = [
    { spec: period, open: 'openStartDatePicker' },
    { spec: records[1], open: 'openMemoryDatePicker' }
  ]
  for (const { spec, open } of scenarios) {
    await t.test(spec.kind, async (t) => {
      const app = setup(t)
      const { page } = await openEditor(app, spec, { [spec.dateField]: '2025-12-30' })
      await app.dispatch(page, open)
      await app.settle()

      const expanded = readSource(path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxml`), 'utf8')
      const picker = wxmlOpeningTags(expanded).find(tag => tag.tag === 'picker-view')
      assert.ok(picker)
      assert.equal(picker.attrs.bindpickstart, 'onDatePickerPickStart')
      assert.equal(picker.attrs.bindpickend, 'onDatePickerPickEnd')
      const confirm = wxmlOpeningTags(expanded).find(tag => tag.attrs.bindtap === 'onDatePickerConfirm')
      assert.ok(confirm)
      assert.equal(confirm.tag, 'button', 'confirm has a native disabled state')

      let mapped = sharedTemplateData(spec, 'sharedBottomSheet', 'bodyTemplate', 'datePickerSheetBody', page.data)
      assert.equal(mapped.datePickerPicking, false, 'opening resets the scroll lock')
      assert.equal(renderWxmlAttribute(confirm.attrs.disabled, page.data), 'false')
      assert.equal(renderWxmlAttribute(confirm.attrs['aria-disabled'], page.data), 'false')
      assert.equal(renderWxmlClasses(confirm.attrs.class, page.data).includes('disabled'), false)

      await app.dispatch(page, 'onDatePickerPickStart')
      assert.equal(page.data.datePickerPicking, true)
      mapped = sharedTemplateData(spec, 'sharedBottomSheet', 'bodyTemplate', 'datePickerSheetBody', page.data)
      assert.equal(mapped.datePickerPicking, true, 'the page forwards the lock through the shared shell')
      assert.equal(renderWxmlAttribute(confirm.attrs.disabled, page.data), 'true')
      assert.equal(renderWxmlAttribute(confirm.attrs['aria-disabled'], page.data), 'true')
      assert.equal(renderWxmlClasses(confirm.attrs.class, page.data).includes('disabled'), true)

      await app.dispatch(page, 'onDatePickerConfirm')
      assert.equal(page.data.datePickerPhase, 'open', 'a rolling confirm does not close the panel')
      assert.equal(page.data[spec.dateField], '2025-12-30', 'a rolling confirm cannot write the old date')

      await app.dispatch(page, 'onDatePickerChange', { detail: { value: [125, 0, 0] } })
      assert.equal(page.data.datePickerDraft, '2025-01-01')
      await app.dispatch(page, 'onDatePickerPickEnd')
      await app.settle()
      assert.equal(page.data.datePickerPicking, false, 'settling releases the scroll lock after the value renders')
      assert.equal(renderWxmlAttribute(confirm.attrs.disabled, page.data), 'false')
      assert.equal(renderWxmlAttribute(confirm.attrs['aria-disabled'], page.data), 'false')
      assert.equal(renderWxmlClasses(confirm.attrs.class, page.data).includes('disabled'), false)

      await app.dispatch(page, 'onDatePickerConfirm')
      await app.settle()
      assert.equal(page.data[spec.dateField], '2025-01-01', 'the settled draft submits')
      assert.equal(page.data.datePickerPhase, 'leaving')
      assert.equal(page.data.datePickerPicking, false, 'closing resets the scroll lock')
      await app.advance(200)
      assert.equal(page.data.datePickerMounted, false)

      await app.dispatch(page, open)
      await app.settle()
      assert.equal(page.data.datePickerPicking, false, 'reopening starts unlocked')
      await app.dispatch(page, 'onDatePickerPickStart')
      await app.dispatch(page, 'onDatePickerClose')
      assert.equal(page.data.datePickerPicking, false, 'cancellation also resets the scroll lock immediately')
      await app.advance(200)
    })
  }
})

test('R2 date panel: pick settlement follows public value semantics across event orders', async (t) => {
  await t.test('pickend before the final change stays locked until clamp renders', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker')
    await app.settle()
    const expanded = readSource(path.join(__dirname, '../pages/period/edit/edit.wxml'), 'utf8')
    const picker = wxmlOpeningTags(expanded).find(tag => tag.tag === 'picker-view')
    assert.equal(picker.attrs['immediate-change'], '{{true}}', 'the final value is emitted at release, before native pickend')

    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    assert.equal(page.data.datePickerPicking, true, 'pickend alone cannot reopen confirmation')
    await app.dispatch(page, 'onDatePickerConfirm')
    assert.equal(page.data.startDate, '2025-12-30')
    assert.equal(page.data.datePickerPhase, 'open')

    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 120, detail: { value: [126, 11, 30] } })
    assert.equal(page.data.datePickerDraft, '2026-09-20', 'the final change applies the inclusive upper-bound clamp')
    assert.equal(page.data.datePickerPicking, true, 'the lock survives until the clamped value render completes')
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)
    await app.dispatch(page, 'onDatePickerConfirm')
    await app.settle()
    assert.equal(page.data.startDate, '2026-09-20')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
  })

  await t.test('a pick without a final change unlocks without a timer delay', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker')
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    assert.equal(page.data.datePickerPicking, true)
    await app.settle()
    assert.equal(page.data.datePickerPicking, false, 'the render barrier settles a no-change gesture')
    await app.dispatch(page, 'onDatePickerConfirm')
    await app.settle()
    assert.equal(page.data.startDate, '2025-12-30')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
  })

  await t.test('stale end work and timestamped end events cannot unlock a newer pick', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker')
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 200 })
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 150, detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()
    assert.equal(page.data.datePickerPicking, true, 'neither stale callback nor stale native event ends the new pick')
    assert.equal(page.data.datePickerDraft, '2025-12-30', 'a stale change cannot overwrite the new pick draft')
    assert.equal(page.data.datePickerPhase, 'open')

    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 210, detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 220 })
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)
    await app.dispatch(page, 'onDatePickerConfirm')
    await app.settle()
    assert.equal(page.data.startDate, '2025-01-01')
    await app.advance(200)
  })

  await t.test('cancel and reopen invalidate pending end work', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker')
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.dispatch(page, 'onDatePickerClose')
    assert.equal(page.data.datePickerPicking, false)

    await app.dispatch(page, 'openStartDatePicker')
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 200 })
    await app.settle()
    assert.equal(page.data.datePickerPhase, 'open')
    assert.equal(page.data.datePickerPicking, true, 'the cancelled pick cannot settle the reopened panel')
    await app.dispatch(page, 'onDatePickerClose')
    assert.equal(page.data.datePickerPicking, false)
    await app.advance(200)
    assert.equal(page.data.datePickerMounted, false)
  })
})

test('R2 date panel: retained picks and the confirm render barrier reject stale submission orders', async (t) => {
  await t.test('settle then confirm then a late final change submits the rendered final draft', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 50 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)

    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 115 })
    assert.equal(page.data.datePickerPicking, true, 'confirm disables itself before its render barrier')
    assert.equal(page.data.datePickerPhase, 'open')
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 120, detail: { value: [126, 11, 30] } })
    await app.settle()

    assert.equal(page.data.startDate, '2026-09-20', 'the change before the confirm barrier is the submitted draft')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 130, detail: { value: [125, 0, 0] } })
    assert.equal(page.data.startDate, '2026-09-20')
    assert.equal(page.data.datePickerDraft, '2026-09-20', 'a change after confirm starts leaving cannot rewrite the panel')
    await app.advance(200)
  })

  await t.test('settle then a late change relocks before a same-turn confirm', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 50 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()

    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 120, detail: { value: [126, 11, 30] } })
    assert.equal(page.data.datePickerPicking, true, 'a late change on the retained pick relocks confirmation')
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 130 })
    assert.equal(page.data.startDate, '2025-12-30')
    assert.equal(page.data.datePickerPhase, 'open', 'confirm early-returns while the late draft is rendering')
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 140 })
    await app.settle()
    assert.equal(page.data.startDate, '2026-09-20')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
  })

  await t.test('a no-change confirmation uses one render barrier and ignores repeated taps', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 50 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)

    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 115 })
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 116 })
    assert.equal(page.data.startDate, '2025-12-30')
    assert.equal(page.data.datePickerPhase, 'open')
    assert.equal(page.data.datePickerPicking, true)
    await app.settle()
    assert.equal(page.data.startDate, '2025-12-30')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
    assert.equal(page.data.datePickerMounted, false)
  })

  await t.test('an old confirm barrier and old change cannot finish or overwrite a newer pick', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 50 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 115 })

    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 200 })
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 150, detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.settle()
    assert.equal(page.data.datePickerPhase, 'open', 'the old confirm barrier cannot close the new gesture')
    assert.equal(page.data.datePickerPicking, true)
    assert.equal(page.data.datePickerDraft, '2025-12-30')

    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 210, detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 220 })
    await app.settle()
    assert.equal(page.data.datePickerPicking, false)
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 230 })
    await app.settle()
    assert.equal(page.data.startDate, '2025-01-01')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
  })

  await t.test('cancel and reopen reject old changes before and after the new panel opens', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 50 })
    await app.settle()
    await app.dispatch(page, 'onDatePickerPickStart', { timeStamp: 100 })
    await app.dispatch(page, 'onDatePickerPickEnd', { timeStamp: 110 })
    await app.dispatch(page, 'onDatePickerClose', { timeStamp: 115 })
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 120, detail: { value: [125, 0, 0] } })
    assert.equal(page.data.datePickerDraft, '2025-12-30', 'a cancelled panel has no active pick to write')

    await app.dispatch(page, 'openStartDatePicker', { timeStamp: 200 })
    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 120, detail: { value: [125, 0, 0] } })
    await app.settle()
    assert.equal(page.data.datePickerPhase, 'open')
    assert.equal(page.data.datePickerPicking, false)
    assert.equal(page.data.datePickerDraft, '2025-12-30', 'the reopened generation rejects the old change by its openedAt boundary')

    await app.dispatch(page, 'onDatePickerChange', { timeStamp: 210, detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerConfirm', { timeStamp: 220 })
    await app.settle()
    assert.equal(page.data.startDate, '2025-01-01')
    assert.equal(page.data.datePickerPhase, 'leaving')
    await app.advance(200)
  })
})

test('R2 date panel: period end and memory date reuse one shared panel with existing lower bounds', async (t) => {
  await t.test('period end starts at its start-date lower bound', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
    sharedTemplateData(period, 'sharedDateField', 'tapHandler', 'openEndDatePicker', page.data)
    sharedTemplateData(period, 'sharedBottomSheet', 'bodyTemplate', 'datePickerSheetBody', page.data)

    await app.dispatch(page, 'openEndDatePicker')
    await app.settle()
    assert.equal(page.data.datePickerTitle, '结束日期')
    assert.equal(page.data.datePickerDraft, '2025-12-30')
    assert.equal(page.data.datePickerYears[0].label, '2025年')
    assert.equal(page.data.datePickerYears.at(-1).label, '2026年')
    assert.equal(page.data.datePickerMonths[0].label, '12月')
    assert.equal(page.data.datePickerDays[0].label, '30⁠日')
    assert.equal(page.data.datePickerYearAria, '年份，2025年')
    assert.equal(page.data.datePickerMonthAria, '月份，12月')
    assert.equal(page.data.datePickerDayAria, '日，30⁠日')
    assert.equal(page.data.datePickerConfirmAria, '确定，2025年12月30⁠日')

    await app.dispatch(page, 'onDatePickerChange', { detail: { value: [0, 0, 1] } })
    await app.dispatch(page, 'onDatePickerConfirm')
    await app.settle()
    assert.equal(page.data.endDate, '2025-12-31')
    assert.equal(page.data.startDate, '2025-12-30')
  })

  await t.test('memory date uses the default native lower bound and today ceiling', async (t) => {
    const app = setup(t)
    const memory = records[1]
    const { page } = await openEditor(app, memory, { date: '2025-12-31' })
    sharedTemplateData(memory, 'sharedDateField', 'tapHandler', 'openMemoryDatePicker', page.data)
    sharedTemplateData(memory, 'sharedBottomSheet', 'bodyTemplate', 'datePickerSheetBody', page.data)

    await app.dispatch(page, 'openMemoryDatePicker')
    await app.settle()
    assert.equal(page.data.datePickerTitle, '日期')
    assert.equal(page.data.datePickerYears[0].label, '1900年')
    assert.equal(page.data.datePickerYears.at(-1).label, '2026年')
    assert.equal(page.data.datePickerDraft, '2025-12-31')
    assert.equal(page.data.datePickerConfirmAria, '确定，2025年12月31⁠日')
    await app.dispatch(page, 'onDatePickerChange', { detail: { value: [125, 0, 0] } })
    await app.dispatch(page, 'onDatePickerConfirm')
    await app.settle()
    assert.equal(page.data.date, '2025-01-01')
  })
})

test('R2 date panel: mask, close, drag and system back cancel; touchcancel only resets', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period, { startDate: '2025-12-30' })
  const closes = [
    { name: 'mask', handler: 'onDatePickerMask' },
    { name: 'close button', handler: 'onDatePickerClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    await app.dispatch(page, 'openStartDatePicker')
    await app.settle()
    await app.dispatch(page, 'onDatePickerChange', { detail: { value: [125, 0, 0] } })
    assert.equal(page.data.datePickerDraft, '2025-01-01')
    if (close.name === 'drag') {
      const currentTarget = { dataset: { sheet: 'datePicker' } }
      const touch = { identifier: 1, pageX: 100, pageY: 100 }
      app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
      app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
      await app.advance(100)
      app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
    } else {
      await app.dispatch(page, close.handler)
    }
    assert.equal(page.data.datePickerPhase, 'leaving', `${close.name} uses the shared exit`)
    assert.equal(page.data.startDate, '2025-12-30', `${close.name} discards the draft`)
    await app.advance(200)
    assert.equal(page.data.datePickerMounted, false)
    assert.equal(page.data.pageObscured, false)
  }

  await app.dispatch(page, 'openStartDatePicker')
  await app.settle()
  await app.dispatch(page, 'onDatePickerChange', { detail: { value: [125, 0, 0] } })
  const currentTarget = { dataset: { sheet: 'datePicker' } }
  const touch = { identifier: 1, pageX: 100, pageY: 100 }
  const dragToken = page.data.datePickerDragClear.token
  app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
  app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 180 }] })
  app.dispatch(page, 'sheetDrag.touchCancel', { currentTarget, changedTouches: [{ ...touch, pageY: 180 }] })
  assert.equal(page.data.datePickerPhase, 'open')
  assert.deepEqual(page.data.datePickerDragClear, { token: dragToken + 1, action: 'reset', sheet: 'datePicker' })
  assert.equal(page.data.startDate, '2025-12-30')
  await app.advance(16)
  assert.equal(app.viewStyle(page, '.sheet-slide-datePicker').transform, '')
  await app.dispatch(page, 'onDatePickerMask')
  await app.advance(200)
})

test('date fields read the same current and cross-year display dates, then append their errors', async (t) => {
  await t.test('period start and selected end dates', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { id: 'p-date', startDate: '2025-12-30', endDate: '2026-01-02' })
    assert.equal(page.data.startDateLabel, '2025年12月30⁠日')
    assert.equal(page.data.endDateLabel, '1月2⁠日')
    assert.equal(datePickerName(period, 'openStartDatePicker', page.data), `开始日期，${page.data.startDateLabel}，点按修改`)
    assert.equal(datePickerName(period, 'openEndDatePicker', page.data), `结束日期，${page.data.endDateLabel}，点按修改`)

    page.onStartChange(value('2026-09-25'))
    await app.dispatch(page, 'save')
    assert.deepEqual(page.data.fieldErrors, { startDate: '开始日期不能晚于今天', endDate: '结束日期不能晚于今天' })
    assert.equal(page.data.startDateLabel, '9月25⁠日')
    assert.equal(datePickerName(period, 'openStartDatePicker', page.data), `开始日期，${page.data.startDateLabel}，点按修改，${page.data.fieldErrors.startDate}`)
    assert.equal(datePickerName(period, 'openEndDatePicker', page.data), `结束日期，${page.data.endDateLabel}，点按修改，${page.data.fieldErrors.endDate}`)
  })

  await t.test('empty period end date', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, period, { startDate: '2026-09-10' })
    assert.equal(page.data.endDateLabel, '')
    assert.equal(datePickerName(period, 'openEndDatePicker', page.data), '结束日期，还没选，点按选择')
    await app.dispatch(page, 'save')
    assert.equal(datePickerName(period, 'openEndDatePicker', page.data), `结束日期，还没选，点按选择，${page.data.fieldErrors.endDate}`)
  })

  await t.test('memory date', async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, records[1], { date: '2025-12-31' })
    assert.equal(page.data.dateLabel, '2025年12月31⁠日')
    assert.equal(datePickerName(records[1], 'openMemoryDatePicker', page.data), `日期，${page.data.dateLabel}，点按修改`)
    page.onDateChange(value('2026-09-21'))
    await app.dispatch(page, 'save')
    assert.equal(page.data.dateLabel, '9月21⁠日')
    assert.equal(datePickerName(records[1], 'openMemoryDatePicker', page.data), `日期，${page.data.dateLabel}，点按修改，${page.data.fieldErrors.date}`)
  })
})

test('period: completion intent keeps route status and end date while restoring the remaining draft fields', async (t) => {
  const app = setup(t, { storage: { 'recordDraft:periods:p2': JSON.stringify({
    startDate: '2026-09-10', endDate: '', status: 'ongoing', note: '草稿备注', flow: 'heavy', symptoms: ['cramps']
  }) } })
  const { page } = await openEditor(app, period, {
    id: 'p2', startDate: '2026-09-10', endDate: '2026-09-20', status: 'known-end',
    note: '原备注', flow: 'light', symptoms: 'tired', intent: 'complete'
  })
  assert.equal(page.data.status, 'known-end')
  assert.equal(page.data.endDate, '2026-09-20')
  assert.equal(page.data.startDate, '2026-09-10')
  assert.equal(page.data.note, '草稿备注')
  assert.equal(page.data.flow, 'heavy')
  assert.deepEqual(page.data.symptoms, ['cramps'])
  assert.equal(page.data.draftRestored, true)
})

test('period: status option screen-reader names include each option consequence', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period)
  const template = readSource(path.join(__dirname, '../pages/period/edit/edit.wxml'), 'utf8')
  const option = wxmlOpeningTags(template).find(tag => tag.attrs.bindtap === '{{tapHandler}}' && tag.attrs['aria-checked'] === '{{checked}}')
  assert.ok(option)
  assert.deepEqual(page.data.statusOptions.map(item => {
    const mapped = sharedTemplateData(period, 'sharedChoiceChip', 'tapHandler', 'selectStatus', { ...page.data, item })
    assert.equal(mapped.role, 'radio')
    return renderWxmlAttribute(option.attrs['aria-label'], mapped)
  }), [
    '经期状态 进行中，进行中可稍后补结束日期',
    '经期状态 结束日期不详，结束日不清楚，日历只标开始那天',
    '经期状态 已结束，选好结束日期，这次经期才有确定的天数'
  ])
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
  await changeEditorDate(app, page, 'onStartChange', '2026-09-11')
  assert.equal(page.data.endDate, '')
  await app.dispatch(page, 'save')
  assert.deepEqual(page.data.fieldErrors, { endDate: '请选择结束日期；还没结束可以选「进行中」' })
  await changeEditorDate(app, page, 'onEndChange', '2026-09-14')
  assert.equal(page.data.periodDayCountText, '共 4 天')
  assert.equal(page.data.periodLengthHint, '比你通常的 3 天长，确认一下结束日？')
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
  assert.equal(app.wx.toasts.length, 0, 'the alert row replaces the restore toast')
  app.hide()
  app.show()
  assert.deepEqual(JSON.parse(app.storage['recordDraft:periods:p1']), { ...fields, symptoms: ['cramps', 'tired'] })
  await changeEditorDate(app, page, 'onStartChange', '2026-09-15')
  assert.deepEqual(page.data.fieldErrors, { endDate: '结束日期不能晚于今天' })
  await app.dispatch(page, 'selectStatus', dataset({ value: 'ongoing' }))
  assert.deepEqual(page.data.fieldErrors, {})
  await app.dispatch(page, 'selectStatus', dataset({ value: 'known-end' }))
  assert.deepEqual(page.data.fieldErrors, {})
  for (const [end, message] of [['2026-09-27', '结束日期不能晚于今天'], ['', '请选择结束日期；还没结束可以选「进行中」'], ['2026-02-31', '请选择有效的结束日期'], ['2026-09-14', '结束日期不能早于开始']]) {
    page.onEndChange(value(end))
    await app.dispatch(page, 'save')
    assert.deepEqual(page.data.fieldErrors, { endDate: message })
    assert.deepEqual(writes(app), [])
  }
  cloudRoute(app, period, 'remove').reply({ code: 0 })
  await confirmDelete(app, page)
  assert.equal(writes(app).length, 1, 'validation does not prevent deleting the record')
  assert.equal(app.storage['recordDraft:periods:p1'], undefined)
})

test('period: new start date shows its owning period inline only while covered', async (t) => {
  const app = setup(t)
  const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end' }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  const { page } = await openEditor(app, period, { startDate: '2026-09-03' })
  assert.equal(page.data.startDateOwnerText, '这一天已在 9月1⁠日 开始的那次经期里')

  const template = readSource(path.join(__dirname, '../pages/period/edit/edit.wxml'), 'utf8')
  const startField = template.slice(template.indexOf('id="field-startDate"'), template.indexOf('id="field-endDate"'))
  assert.match(startField, /<view wx:if="\{\{startDateOwnerText\}\}" class="form-hint start-date-owner micro-notice">[\s\S]*<text class="micro-notice-text">\{\{startDateOwnerText\}\}<\/text>/)

  await changeEditorDate(app, page, 'onStartChange', '2026-09-06')
  assert.equal(page.data.startDateOwnerText, '')
  await changeEditorDate(app, page, 'onStartChange', '2026-09-04')
  assert.equal(page.data.startDateOwnerText, '这一天已在 9月1⁠日 开始的那次经期里')

  app.wx.navigateTo({ url: editUrl(period, { id: existing._id, ...existing }) })
  await app.settle()
  assert.equal(app.currentPage.data.isEdit, true)
  assert.equal(app.currentPage.data.startDateOwnerText, '')
})

test('period: inline owner uses the existing cross-year display date', async (t) => {
  const app = setup(t)
  const existing = { _id: 'cross-year', startDate: '2025-12-28', endDate: '2026-01-03', status: 'known-end' }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  const { page } = await openEditor(app, period, { startDate: '2026-01-02' })
  assert.equal(page.data.startDateOwnerText, '这一天已在 2025年12月28⁠日 开始的那次经期里')
})

test('period: opening the inline owner matches editing that owner and preserves the new draft', async (t) => {
  const app = setup(t)
  const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end', createdByMe: false }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing], roomStatus: 'paired' })
  const { page } = await openEditor(app, period, { startDate: '2026-09-03' })
  await changeEditorDate(app, page, 'onEndChange', '2026-09-04')
  await app.dispatch(page, 'onNoteInput', value('保留新建草稿'))

  const template = readSource(path.join(__dirname, '../pages/period/edit/edit.wxml'), 'utf8')
  const openAction = wxmlOpeningTags(template).find(tag => tag.attrs.bindtap === 'openStartDateOwner')
  assert.ok(openAction, 'the inline owner exposes an open action')
  assert.equal(openAction.attrs['aria-role'], 'button')
  assert.equal(openAction.attrs['aria-label'], '打开那条')
  assert.equal(openAction.attrs['hover-class'], 'start-date-owner-action-hover')
  assert.match(template, /bindtap="openStartDateOwner"[^>]*>打开那条<\/text>/)

  await app.dispatch(page, 'openStartDateOwner')
  await app.settle()
  const inlineUrl = app.navigation.at(-1).url
  assert.notEqual(app.currentPage, page)
  assert.equal(app.currentPage.data.id, existing._id)
  assert.equal(app.currentPage.data.isEdit, true)
  assert.equal(app.currentPage.data.authorLabel, 'TA 记的')
  assert.deepEqual(JSON.parse(app.storage[draftKey(period)]), {
    startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', note: '保留新建草稿', flow: '', symptoms: []
  })

  await app.dispatch(app.currentPage, 'goBack')
  await app.settle()
  assert.equal(app.currentPage, page)
  assert.equal(page.data.note, '保留新建草稿')
  const saving = app.dispatch(page, 'save')
  await app.settle()
  assert.equal(page.data.confirmationTitle, '这一天已有经期')
  await app.dispatch(page, 'onConfirmationAction', dataset({ action: 'edit' }))
  await app.advance(200)
  await saving
  await app.settle()
  assert.equal(app.navigation.at(-1).url, inlineUrl, 'inline and confirmation actions build the same destination')
  assert.equal(app.currentPage.data.id, existing._id)
})

for (const choice of [
  { action: 'edit', name: 'edit opens the real existing editor and preserves the new draft' },
  { action: 'create', name: 'create saves the new record' },
  { action: 'cancel', name: 'cancel keeps the form without creating or navigating' }
]) {
  test(`period: overlap panel ${choice.name} without duplicate submissions`, async (t) => {
    const app = setup(t)
    const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end' }
    cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
    cloudRoute(app, period, 'add').reply({ code: 0, record: { _id: 'new', ...period.payload, startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', duration: 2 } })
    const { page } = await openEditor(app, period, { startDate: '2026-09-03' })
    await changeEditorDate(app, page, 'onEndChange', '2026-09-04')
    app.hide()
    app.show()
    const originalForm = form(page, period)
    const navigationCount = app.navigation.length
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(page.data.confirmationTitle, '这一天已有经期')
    assert.equal(page.data.confirmationContent, '开始日落在 9月1⁠日 开始的那次经期里；仍然新建会另存一条，这几天会被两条经期覆盖')
    assert.deepEqual(page.data.confirmationActions, [
      { id: 'edit', text: '编辑那条', kind: 'primary' },
      { id: 'create', text: '仍然新建', kind: 'secondary' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ])
    assert.equal(page.data.confirmationPhase, 'open')
    assert.deepEqual(app.wx.modals, [], 'overlap confirmation must not call native showModal')
    await app.dispatch(page, 'save')
    assert.equal(page.data.confirmationMounted, true)
    assert.deepEqual(writes(app), [])
    await app.dispatch(page, 'onConfirmationAction', dataset({ action: choice.action }))
    assert.equal(page.data.confirmationPhase, 'leaving')
    assert.deepEqual(writes(app), [], 'closing the panel does not itself save')
    await app.advance(200)
    await saving
    await app.settle()
    if (choice.action === 'edit') {
      assert.notEqual(app.currentPage, page)
      assert.equal(app.currentPage.data.isEdit, true)
      assert.equal(app.currentPage.data.startDate, '2026-09-01')
      assert.equal(app.currentPage.data.endDate, '2026-09-05')
      assert.deepEqual(writes(app), [])
      assert.deepEqual(JSON.parse(app.storage[draftKey(period)]), {
        startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', note: '', flow: '', symptoms: []
      }, 'editing the owner keeps the unfinished new-record draft')
    } else if (choice.action === 'create') {
      assert.deepEqual(writes(app).map(call => call.data), [{ ...period.payload, startDate: '2026-09-03', endDate: '2026-09-04', status: 'known-end', duration: 2 }])
      assert.equal(app.storage[draftKey(period)], undefined)
    } else {
      assert.deepEqual(writes(app), [])
      assert.equal(app.currentPage, page)
      assert.equal(app.navigation.length, navigationCount)
      assert.deepEqual(form(page, period), originalForm)
      assert.equal(page.data.saving, false)
      assert.equal(page.data.submitted, false)
      assert.deepEqual(app.wx.toasts, [])
    }
  })
}

test('period: overlap panel mask, close, drag and system back all cancel without native confirmation', async (t) => {
  const app = setup(t)
  const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end' }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  const { page } = await openEditor(app, period, { startDate: '2026-09-03' })
  await changeEditorDate(app, page, 'onEndChange', '2026-09-04')
  await app.dispatch(page, 'onNoteInput', value('保留输入'))
  const originalForm = form(page, period)
  const navigationCount = app.navigation.length
  const closes = [
    { name: 'mask', handler: 'onConfirmationMask' },
    { name: 'close button', handler: 'onConfirmationClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(page.data.confirmationPhase, 'open', `${close.name} starts from an open panel`)
    if (close.name === 'drag') {
      const currentTarget = { dataset: { sheet: 'confirmation' } }
      const touch = { identifier: 1, pageX: 100, pageY: 100 }
      app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
      app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
      await app.advance(100)
      app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      assert.deepEqual(page.data.confirmationDragClear, { token: 1, action: 'close', sheet: 'confirmation' })
    } else {
      await app.dispatch(page, close.handler)
    }
    assert.equal(page.data.confirmationPhase, 'leaving', `${close.name} uses the shared exit`)
    assert.deepEqual(writes(app), [], `${close.name} must not save while leaving`)
    await app.advance(200)
    await saving
    assert.equal(page.data.confirmationMounted, false, `${close.name} unmounts the panel`)
    assert.equal(page.data.pageObscured, false, `${close.name} restores the background`)
    assert.equal(app.currentPage, page)
    assert.equal(app.navigation.length, navigationCount)
    assert.deepEqual(form(page, period), originalForm)
    assert.equal(page.data.saving, false)
    assert.equal(page.data.submitted, false)
    assert.deepEqual(app.wx.toasts, [])
  }
  assert.deepEqual(app.wx.modals, [])
})

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
      const ownerCell = cell(home, '2026-09-18')
      assert.ok(ownerCell.ariaLabel.includes(`经期第 ${scenario.day} 天`))
      assert.equal(ownerCell.ariaLabel.includes('经期进行中'), scenario.status === 'ongoing')
      assert.equal(ownerCell.ariaLabel.includes('结束日期不详'), scenario.status === 'unknown-end')
      assert.equal(Object.hasOwn(ownerCell, 'periodDayCount'), false)
      assert.equal(Object.hasOwn(ownerCell, 'isOngoingPeriod'), false)
      assert.equal(Object.hasOwn(ownerCell, 'isUnknownEndPeriod'), false)
      const saved = { _id: 'new-overlap', ...period.payload, startDate: '2026-09-18', status: 'unknown-end' }
      cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
      const saving = app.dispatch(page, 'save')
      await app.settle()
      assert.equal(page.data.confirmationTitle, '这一天已有经期')
      assert.deepEqual(page.data.confirmationActions.map(action => action.id), ['edit', 'create', 'cancel'])
      assert.deepEqual(app.wx.modals, [])
      await app.dispatch(page, 'onConfirmationAction', dataset({ action: editExisting ? 'edit' : 'create' }))
      await app.advance(200)
      await saving
      await app.settle()
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
  // This device has not read the partner's ongoing record yet; the cloud write is the final constraint.
  const home = app.launch(homeRoute)
  await app.flush()
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
  assert.equal(app.platformCalls.vibrateShort, undefined, 'a cloud merge that reopens an existing record stays silent')
  assert.deepEqual(form(page, period), { ...period.fields, startDate: '2026-09-01', note: '伴侣已记', flow: 'normal', symptoms: ['tired'] })
  assert.equal(page.data.isEdit, true)
  assert.equal(page.data.draftRestored, false)
  assert.equal(app.storage[draftKey(period)], undefined)
  assert.equal(app.storage.recordTabSegment, 'period')
  assert.equal(cell(home, '2026-09-01').isPeriod, true)
  assert.deepEqual(Object.keys(page.data.selectedSymptoms || {}).filter(key => page.data.selectedSymptoms[key]), ['tired'])
  await app.advance(1000)
  assert.equal(app.currentPage, page, 'merge explains and stays open instead of returning')
  await app.dispatch(page, 'selectStatus', dataset({ value: 'known-end' }))
  await changeEditorDate(app, page, 'onEndChange', '2026-09-05')
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
  assert.deepEqual(app.platformCalls.vibrateShort, [{ type: 'light' }], 'only the later confirmed update adds a haptic')
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
  assert.equal(page.data.startDateLabel, '9月1⁠日')
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
  assert.deepEqual(JSON.parse(app.storage[draftKey(period, 'ongoing')]), {
    startDate: '2026-09-01', endDate: '', status: 'ongoing', note: '修改这条记录', flow: 'light', symptoms: ['tired']
  }, 'returning to the new baseline neither writes nor clears the earlier draft')
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

for (const exit of ['invalid', 'edit existing', 'still create', 'cancel']) {
  test(`period: delayed preflight ${exit} releases saving and preserves the correct outcome guard`, async (t) => {
    const app = setup(t)
    periodsUnread(app)
    const { page } = await openEditor(app, period, exit === 'invalid' ? { startDate: '2026-09-18' } : {})
    await app.dispatch(page, 'onNoteInput', value('保存前的备注'))
    const history = cloudRoute(app, period, 'list').defer()
    const saved = { _id: 'saved', ...period.payload, note: '保存前的备注' }
    cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
    const saving = app.dispatch(page, 'save')
    await app.settle()
    assert.equal(app.rendered(page).saving, true)
    const existing = { _id: 'covered', startDate: '2026-09-18', status: 'ongoing' }
    history.resolve({ code: 0, data: exit === 'invalid' ? [] : [existing] })
    await app.settle()
    if (exit !== 'invalid') {
      assert.equal(app.rendered(page).saving, true, 'the overlap question is part of this save')
      await app.dispatch(page, 'onNoteInput', value('询问时不能修改'))
      await app.dispatch(page, 'save')
      await app.dispatch(page, 'delete')
      assert.equal(page.data.note, '保存前的备注')
      assert.equal(page.data.confirmationPhase, 'open')
      assert.deepEqual(app.wx.modals, [])
      assert.deepEqual(writes(app), [])
      const action = { 'edit existing': 'edit', 'still create': 'create', cancel: 'cancel' }[exit]
      await app.dispatch(page, 'onConfirmationAction', dataset({ action }))
      await app.advance(200)
    }
    await saving
    await app.settle()
    assert.equal(app.rendered(page).saving, false)
    assert.equal(page.data.submitted, exit === 'still create')
    assert.equal(writes(app).length, exit === 'still create' ? 1 : 0)
    if (exit === 'edit existing') {
      assert.equal(app.currentPage.data.id, 'covered')
      assert.equal(app.rendered(app.currentPage).saving, false)
      app.wx.navigateBack({})
      await app.settle()
    }
    assert.equal(app.currentPage, page)
    if (exit === 'invalid') assert.deepEqual(page.data.fieldErrors, { endDate: '请选择结束日期；还没结束可以选「进行中」' })
    if (exit === 'cancel') assert.deepEqual(app.wx.toasts, [])
    if (exit === 'still create') {
      await app.dispatch(page, 'save')
      assert.equal(writes(app).length, 1, 'confirmed success remains submitted until return')
    } else {
      await app.dispatch(page, 'onNoteInput', value('结束后可继续编辑'))
      assert.equal(page.data.note, '结束后可继续编辑', 'an early exit must not leave the form locked')
    }
  })
}

async function assertNoteFocusToggle(app, page, spec, { onFocus, onBlur } = {}) {
  const template = readSource(path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxml`), 'utf8')
  const textarea = wxmlOpeningTags(template).find(tag => tag.tag === 'textarea')
  assert.ok(textarea, `the ${spec.kind} note textarea exists`)
  assert.equal(textarea.attrs.bindfocus, 'onNoteFocus')
  assert.equal(textarea.attrs.bindblur, 'onNoteBlur')
  assert.equal(page.data.noteFocused, false)
  assert.equal(renderWxmlClasses(textarea.attrs.class, page.data).includes('form-control-focused'), false)

  await app.dispatch(page, 'onNoteFocus')
  assert.equal(page.data.noteFocused, true)
  assert.equal(renderWxmlClasses(textarea.attrs.class, page.data).includes('form-control-focused'), true)
  if (onFocus) onFocus()

  await app.dispatch(page, 'onNoteBlur')
  assert.equal(page.data.noteFocused, false)
  assert.equal(renderWxmlClasses(textarea.attrs.class, page.data).includes('form-control-focused'), false)
  if (onBlur) onBlur()
}

test('edit pages derive a quiet note counter only from 350 through 500 characters', async (t) => {
  for (const spec of records) {
    await t.test(spec.kind, async (t) => {
      const app = setup(t)
      const { page } = await openEditor(app, spec)
      assert.equal(page.data.noteCountText, '')
      const template = readSource(path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxml`), 'utf8')
      assert.match(template, /<text wx:if="\{\{noteCountText\}\}" class="note-count">\{\{noteCountText\}\}<\/text>/)
      const wxss = readSource(path.join(__dirname, `../pages/${spec.kind}/edit/edit.wxss`), 'utf8')
      assert.match(wxss, /\.note-count\s*\{[^}]*font-variant-numeric: tabular-nums[^}]*color: var\(--text-secondary\)/s)

      for (const [length, expected] of [[349, ''], [350, '350 / 500'], [500, '500 / 500']]) {
        await app.dispatch(page, 'onNoteInput', value('字'.repeat(length)))
        assert.equal(page.data.noteCountText, expected)
      }
    })
  }
})

test('period: fixed actions hide on note focus, restore on blur, and save only once', async (t) => {
  const app = setup(t)
  const { page } = await openEditor(app, period)
  await assertNoteFocusToggle(app, page, period, {
    onFocus: () => {
      const actions = sharedTemplateData(period, 'sharedRecordActions', 'actionsClass', 'record-actions-fixed', page.data)
      assert.equal(actions.actionsHidden, true)
    },
    onBlur: () => {
      const actions = sharedTemplateData(period, 'sharedRecordActions', 'actionsClass', 'record-actions-fixed', page.data)
      assert.equal(Boolean(actions.actionsHidden), false)
    }
  })

  const pending = cloudRoute(app, period, 'add').defer()
  const saving = app.dispatch(page, 'save')
  await app.settle()
  await app.dispatch(page, 'save')
  assert.equal(writes(app).length, 1, 'a repeated save cannot add a second record')
  assert.equal(page.setDataCalls.filter(patch => patch.saving === true).length, 1)
  pending.resolve({ code: 0, record: { _id: 'saved', ...period.payload } })
  await saving
  await app.settle()
})

test('memory: note focus only toggles the focused class and never hides the fixed save bar', async (t) => {
  const app = setup(t)
  const memory = records[1]
  const { page } = await openEditor(app, memory)
  const initialActions = sharedTemplateData(memory, 'sharedRecordActions', 'actionsClass', 'record-actions-fixed', page.data)
  assert.equal(Boolean(initialActions.actionsHidden), false)
  await assertNoteFocusToggle(app, page, memory, {
    onFocus: () => {
      const actions = sharedTemplateData(memory, 'sharedRecordActions', 'actionsClass', 'record-actions-fixed', page.data)
      assert.equal(Boolean(actions.actionsHidden), false)
    },
    onBlur: () => {
      const actions = sharedTemplateData(memory, 'sharedRecordActions', 'actionsClass', 'record-actions-fixed', page.data)
      assert.equal(Boolean(actions.actionsHidden), false)
    }
  })
})

test('new and existing record saves use the same iconless success capsule on both edit pages', async (t) => {
  for (const spec of records) {
    for (const mode of ['new', 'edit']) {
      await t.test(`${spec.kind}: ${mode}`, async (t) => {
        const app = setup(t)
        const action = mode === 'edit' ? 'update' : 'add'
        const { page } = await openEditor(app, spec, {
          ...spec.fields,
          ...(mode === 'edit' ? { id: 'existing' } : {})
        })
        cloudRoute(app, spec, action).reply({ code: 0, record: { _id: 'saved', ...spec.payload } })
        await app.dispatch(page, 'save')
        assert.equal(app.wx.toasts.at(-1).title, spec.success)
        assert.equal(app.wx.toasts.at(-1).icon, 'none')
      })
    }
  }
})

for (const spec of records) {
  test(`${spec.kind}: one save publishes the saving state exactly once`, async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, spec)
    const pending = cloudRoute(app, spec, 'add').defer()
    const saving = app.dispatch(page, 'save')
    await app.settle()
    const savingWrites = page.setDataCalls.filter(patch => patch.saving === true).length
    pending.resolve({ code: 0, record: { _id: 'saved', ...spec.payload } })
    await saving
    await app.settle()
    assert.equal(savingWrites, 1)
  })

  test(`${spec.kind}: saving is visible from the tap through preflight and keeps the tapped form stable`, async (t) => {
    const app = setup(t)
    if (spec.kind === 'period') periodsUnread(app)
    const { home, page } = await openEditor(app, spec)
    await app.dispatch(page, 'onNoteInput', value('点击时的备注'))
    const history = spec.kind === 'period' ? cloudRoute(app, spec, 'list').defer() : null
    const pending = cloudRoute(app, spec, 'add').defer()
    const saving = app.dispatch(page, 'save')
    assert.equal(page.data.saving, true, 'the tap publishes busy state before yielding')
    await app.settle()
    assert.equal(app.rendered(page).saving, true)
    await app.dispatch(page, 'onNoteInput', value('等待时不能混入的备注'))
    await app.dispatch(page, spec.kind === 'period' ? 'openStartDatePicker' : 'openMemoryDatePicker')
    if (spec.kind === 'period') {
      await app.dispatch(page, 'openEndDatePicker')
      await app.dispatch(page, 'selectStatus', dataset({ value: 'known-end' }))
      await app.dispatch(page, 'selectFlow', dataset({ value: 'heavy' }))
      await app.dispatch(page, 'toggleSymptom', dataset({ value: 'cramps' }))
    }
    assert.deepEqual(form(page, spec), { ...spec.fields, note: '点击时的备注' })
    await app.dispatch(page, 'save')
    await app.dispatch(page, 'delete')
    assert.equal(writes(app).length, history ? 0 : 1)
    assert.deepEqual(app.wx.modals, [])
    if (history) history.resolve({ code: 0, data: [] })
    await app.settle()
    assert.equal(app.rendered(page).saving, true)
    assert.deepEqual(writes(app), [{ action: 'add', collection: spec.collection,
      data: { ...spec.payload, note: '点击时的备注' }, id: '', roomCode: 'ROOM01' }])
    pending.resolve({ code: 0, record: { _id: 'saved', ...spec.payload, note: '点击时的备注' } })
    await saving
    await app.settle()
    assert.equal(app.rendered(page).saving, false)
    assert.equal(app.rendered(page).submitted, true)
    await app.dispatch(page, 'save')
    await app.dispatch(page, 'delete')
    assert.equal(writes(app).length, 1)
    await app.advance(999)
    assert.equal(app.currentPage, page)
    await app.advance(1)
    assert.equal(app.currentPage, home)
  })

  test(`${spec.kind}: cancelling a binding prompt and returning from binding both leave the form retryable`, async (t) => {
    const app = setup(t)
    const { page } = await openEditor(app, spec)
    app.wx.removeStorageSync('roomCode')
    app.cloud.when('getMyRoom').reply({ code: 1, msg: '未加入任何房间' })
    for (const confirm of [false, true]) {
      const saving = app.dispatch(page, 'save')
      await app.settle()
      assert.equal(app.wx.modals.at(-1).confirmText, '去绑定')
      app.respond('showModal', app.wx.modals.length - 1, { confirm, cancel: !confirm })
      await saving
      await app.settle()
      assert.equal(app.rendered(page).saving, false)
      assert.equal(page.data.submitted, false)
      assert.deepEqual(writes(app), [])
      if (confirm) {
        assert.equal(app.currentPage.route, 'pages/bind/bind')
        app.wx.navigateBack({})
        await app.settle()
      }
      assert.equal(app.currentPage, page)
      await app.dispatch(page, 'onNoteInput', value(confirm ? '绑定返回后可编辑' : '取消后可编辑'))
      assert.equal(page.data.note, confirm ? '绑定返回后可编辑' : '取消后可编辑')
    }
    app.wx.setStorageSync('roomCode', 'ROOM01')
    app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
    const saved = { _id: 'saved', ...spec.payload, note: '绑定返回后可编辑' }
    cloudRoute(app, spec, 'add').reply({ code: 0, record: saved })
    await app.dispatch(page, 'save')
    assert.equal(writes(app).length, 1)
    assert.equal(writes(app)[0].data.note, '绑定返回后可编辑')
    assert.equal(page.data.submitted, true)
  })

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

  for (const mode of ['new', 'edit']) {
    test(`${spec.kind}: ${mode} draft restore notice offers discard and restores route values without a toast`, async (t) => {
      const routeDate = spec.kind === 'period' && mode === 'new' ? '2025-09-18' : '2026-09-18'
      const endDate = spec.kind === 'period' && mode === 'new' ? '2025-09-19' : '2026-09-19'
      const routeForm = spec.kind === 'period'
        ? { startDate: routeDate, endDate, status: 'known-end', note: '入口初值', flow: 'light', symptoms: ['tired'] }
        : { date: routeDate, note: '入口初值' }
      const stored = { ...routeForm, note: '草稿输入', ...(spec.kind === 'period' ? { flow: 'heavy', symptoms: ['cramps'] } : {}) }
      const id = mode === 'edit' ? 'existing' : 'new'
      const app = setup(t, { storage: { [draftKey(spec, id)]: JSON.stringify(stored) } })
      const routeOptions = {
        ...(mode === 'edit' ? { id } : {}),
        [spec.dateField]: routeDate,
        note: routeForm.note,
        ...(spec.kind === 'period' ? { endDate, status: 'known-end', flow: 'light', symptoms: 'tired' } : {})
      }
      const { page } = await openEditor(app, spec, routeOptions)
      assert.deepEqual(form(page, spec), stored)
      assert.equal(page.data.draftRestored, true)
      assert.equal(page.data.draftNoticeText, mode === 'new'
        ? `已恢复 ${routeDate.startsWith('2025-') ? '2025年9月18⁠日' : '9月18⁠日'} 没填完的内容`
        : '已恢复上次没保存的修改')
      assert.equal(page.data.draftDiscardText, mode === 'new' ? '放弃' : '放弃修改')
      assert.deepEqual(app.wx.toasts, [], 'the alert row replaces the restore toast')

      await app.dispatch(page, 'discardDraft')
      assert.deepEqual(form(page, spec), routeForm)
      assert.equal(page.data.draftRestored, false)
      assert.equal(app.storage[draftKey(spec, id)], undefined)
      assert.deepEqual(app.wx.toasts, [])
    })
  }

  test(`${spec.kind}: new record drafts restore only on the same route date and survive a different-date visit`, async (t) => {
    const stored = spec.kind === 'period'
      ? { startDate: '2026-09-18', endDate: '2026-09-19', status: 'known-end', note: '那天的草稿', flow: 'heavy', symptoms: ['cramps'] }
      : { date: '2026-09-18', note: '那天的草稿' }
    const app = setup(t, { storage: { [draftKey(spec)]: JSON.stringify(stored) } })
    const otherRoute = { [spec.dateField]: '2026-09-20' }
    const { page: otherDate } = await openEditor(app, spec, otherRoute)
    assert.equal(otherDate.data[spec.dateField], '2026-09-20')
    assert.equal(otherDate.data.note, '')
    assert.equal(otherDate.data.draftRestored, false)
    assert.deepEqual(JSON.parse(app.storage[draftKey(spec)]), stored, 'a different date does not consume the draft')
    await app.dispatch(otherDate, 'goBack')
    await app.flush()
    assert.deepEqual(JSON.parse(app.storage[draftKey(spec)]), stored, 'an unchanged different-date visit neither writes nor clears')

    app.wx.navigateTo({ url: editUrl(spec, { [spec.dateField]: '2026-09-18' }) })
    await app.settle()
    assert.deepEqual(form(app.currentPage, spec), stored)
    assert.equal(app.currentPage.data.draftRestored, true)
  })

  test(`${spec.kind}: drafts persist on hide and unload, restore only their record, and stay untouched at the baseline`, async (t) => {
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
    await changeEditorDate(app, page, spec.changeDate, '2026-09-17')
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
    assert.deepEqual(app.wx.toasts, [], 'the alert row replaces the restore toast')
    assert.equal(restored.data[spec.kind === 'period' ? 'startDateLabel' : 'dateLabel'], '9月17⁠日')
    if (spec.kind === 'period') {
      assert.deepEqual(Object.keys(restored.data.selectedSymptoms || {}).filter(key => restored.data.selectedSymptoms[key]), ['cramps'])
      await app.dispatch(restored, 'selectFlow', dataset({ value: 'heavy' }))
      await app.dispatch(restored, 'toggleSymptom', dataset({ value: 'cramps' }))
    }
    await changeEditorDate(app, restored, spec.changeDate, '2026-09-18')
    await app.dispatch(restored, 'onNoteInput', value('原备注'))
    await app.dispatch(restored, 'goBack')
    await app.flush()
    assert.deepEqual(JSON.parse(app.storage[draftKey(spec, 'existing')]), { ...expected, note: '卸载前又改了' }, 'an unchanged form neither writes nor clears the stored draft')
    assert.deepEqual(writes(app), [])
  })

  const errors = spec.kind === 'period'
    ? ['', '2026-02-31', '2026-09-21'].map((date, index) => [date, ['请选择开始日期', '请选择有效的开始日期', '开始日期不能晚于今天'][index]])
    : ['', '2026-02-31', '2026-09-21'].map((date, index) => [date, ['请选择日期', '请选择有效日期', '日期不能晚于今天'][index]])
  for (const [date, message] of errors) {
    test(`${spec.kind}: ${date || 'missing date'} shows its field error without losing input or writing`, async (t) => {
      const app = setup(t)
      const { home, page } = await openEditor(app, spec, { id: 'invalid', ...spec.fields })
      page[spec.changeDate](value(date))
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
      await changeEditorDate(app, page, spec.changeDate, '2026-09-19')
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
          assert.equal(app.wx.toasts.at(-1).icon, 'none', 'read-back confirmation keeps the same iconless capsule')
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
            ? '还不确定有没有存上。回到列表刷新看看，已经有了就不用再记'
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
        assert.deepEqual(app.platformCalls.vibrateShort, result === 'match' ? [{ type: 'light' }] : undefined,
          'only a read-back that confirms the saved record produces one light haptic')
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
    assert.equal(app.wx.modals.at(-1).title, '已重新连上房间')
    assert.equal(app.wx.modals.at(-1).content, '已重新连上房间\n\n还不确定有没有存上。回到列表刷新看看，已经有了就不用再记')
    assert.equal(app.wx.modals.at(-1).confirmText, '知道了')
    assert.equal(app.wx.modals.at(-1).showCancel, false)
    app.respond('showModal', app.wx.modals.length - 1, { confirm: true })
    await saving
    assert.equal(cell(home)[spec.marker], false)
    assert.equal(page.data.saving, false)
    assert.equal(page.data.submitted, false)
    assert.equal(app.storage.recordTabSegment, undefined)
    assert.equal(writes(app).length, 2)
    assert.equal(app.platformCalls.vibrateShort, undefined, 'rejected and unconfirmed writes stay silent')
    app.hide()
    assert.equal(JSON.parse(app.storage[draftKey(spec)]).note, '失败后仍保留')
  })

  test(`${spec.kind}: delete uses the shared sheet with its date and consequence, and only the danger action removes the record`, async (t) => {
    const app = setup(t)
    const fields = spec.kind === 'period'
      ? { ...spec.fields, startDate: '2026-09-18', endDate: '2026-09-20', status: 'known-end' }
      : spec.fields
    const saved = { _id: 'deleted', ...fields }
    cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved] })
    const { home, page } = await openEditor(app, spec, { id: 'deleted', ...fields })
    await app.dispatch(page, 'onNoteInput', value('删除前的草稿'))
    app.hide()
    app.show()
    const cancelled = app.dispatch(page, 'delete')
    await app.settle()
    assert.equal(page.data.confirmationTitle, spec.deleteTitle)
    if (spec.kind === 'period') assert.match(page.data.confirmationDateText, /^9月18⁠日.*9月20⁠日$/)
    else assert.equal(page.data.confirmationDateText, '9月20⁠日')
    assert.equal(page.data.confirmationContent, '删除后你们两人的日历里都会移除')
    assert.deepEqual(page.data.confirmationActions, [
      { id: 'confirm', text: '删除', kind: 'danger' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ])
    assert.equal(page.data.confirmationPhase, 'open')
    assert.equal(page.data.pageObscured, true)
    assert.equal(page.data.deleting, false)
    assert.equal(app.wx.modals.length, 0, 'delete confirmation must not call native showModal')
    await app.dispatch(page, 'delete')
    assert.equal(page.data.confirmationMounted, true)
    await app.dispatch(page, 'onConfirmationAction', dataset({ action: 'cancel' }))
    await app.advance(200)
    await cancelled
    assert.equal(page.data.confirmationMounted, false)
    assert.equal(page.data.pageObscured, false)
    assert.deepEqual(writes(app), [])
    assert.equal(cell(home)[spec.marker], true)

    const pending = cloudRoute(app, spec, 'remove').defer()
    const deleting = app.dispatch(page, 'delete')
    await app.settle()
    await app.dispatch(page, 'onConfirmationAction', dataset({ action: 'confirm' }))
    assert.equal(page.data.confirmationPhase, 'leaving')
    assert.deepEqual(writes(app), [], 'closing the sheet does not itself delete')
    await app.advance(200)
    await app.settle()
    assert.equal(app.rendered(page).deleting, true)
    await app.dispatch(page, 'delete')
    await app.dispatch(page, 'save')
    assert.equal(app.wx.modals.length, 0)
    assert.equal(writes(app).length, 1)
    assert.equal(cell(home)[spec.marker], true)
    pending.resolve({ code: 0 })
    await deleting
    assert.equal(page.data.deleting, false)
    assert.equal(page.data.submitted, true)
    assert.equal(app.currentPage, page)
    assert.equal(cell(home)[spec.marker], false)
    assert.equal(app.wx.toasts.at(-1).title, '已删除')
    assert.equal(app.platformCalls.vibrateShort, undefined, 'delete confirmation and success stay silent')
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

  test(`${spec.kind}: mask, close, drag and system back all cancel delete without native confirmation`, async (t) => {
    const app = setup(t)
    const saved = { _id: 'kept', ...spec.payload }
    cloudRoute(app, spec, 'list').reply({ code: 0, data: [saved] })
    const { home, page } = await openEditor(app, spec, { id: 'kept', ...spec.fields })
    const closes = [
      { name: 'mask', handler: 'onConfirmationMask' },
      { name: 'close button', handler: 'onConfirmationClose' },
      { name: 'drag' },
      { name: 'system back', handler: 'onSheetSystemBack' }
    ]
    for (const close of closes) {
      const cancelled = app.dispatch(page, 'delete')
      await app.settle()
      assert.equal(page.data.confirmationPhase, 'open', `${close.name} starts from an open panel`)
      if (close.name === 'drag') {
        const currentTarget = { dataset: { sheet: 'confirmation' } }
        const touch = { identifier: 1, pageX: 100, pageY: 100 }
        app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
        app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
        await app.advance(100)
        app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      } else {
        await app.dispatch(page, close.handler, close.event)
      }
      assert.equal(page.data.confirmationPhase, 'leaving', `${close.name} uses the shared exit`)
      assert.deepEqual(writes(app), [], `${close.name} must not delete while leaving`)
      await app.advance(200)
      await cancelled
      assert.equal(page.data.confirmationMounted, false, `${close.name} unmounts the panel`)
      assert.equal(page.data.pageObscured, false, `${close.name} restores the background`)
      assert.equal(cell(home)[spec.marker], true, `${close.name} keeps the calendar record`)
    }
    assert.equal(app.wx.modals.length, 0)
    assert.equal(app.currentPage, page)
    assert.equal(app.navigation.filter(item => item.method === 'navigateBack').length, 0)
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
    assert.deepEqual(app.platformCalls.vibrateShort, [{ type: 'light' }], 'one light haptic follows the confirmed save')
    if (spec.kind === 'memory') assert.equal(app.wx.toasts.at(-1).icon, 'none')
    assert.equal(cell(home, '2026-09-19')[spec.marker], true, 'the calendar uses the canonical date, not the submitted date')
    assert.equal(app.storage[draftKey(spec)], undefined)
    assert.equal(app.storage.recordTabSegment, spec.kind)
    await app.dispatch(page, 'save')
    await app.dispatch(page, 'delete')
    assert.equal(writes(app).length, 1)
    assert.equal(app.wx.modals.length, 0)
    assert.deepEqual(app.platformCalls.vibrateShort, [{ type: 'light' }], 'submitted save cannot repeat the haptic')
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

// #195: the period editor reads the periods held in the app's shared Room records.
test('period: from the shown home, the editor reads no list, the save is one add, and the return refresh lists each kind once', async (t) => {
  const app = setup(t)
  const home = app.launch(homeRoute)
  await app.flush()
  const shown = app.cloud.calls.length
  const calls = () => app.cloud.calls.slice(shown).map(call => [call.name, call.data.action, call.data.collection])
  await app.dispatch(home, 'quickPeriod')
  await app.settle()
  const page = app.currentPage
  assert.equal(page.route, 'pages/period/edit/edit')
  assert.deepEqual(calls(), [], 'opening the editor from home reads nothing')
  const saved = { _id: 'saved', ...period.payload }
  cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
  await app.dispatch(page, 'save')
  await app.settle()
  assert.deepEqual(calls(), [['dataOp', 'add', 'periods']], 'saving a new period only adds it')
  cloudRoute(app, period, 'list').reply({ code: 0, data: [saved] })
  await app.advance(1000)
  await app.flush()
  assert.equal(app.currentPage, home)
  assert.equal(cell(home).isPeriod, true)
  assert.deepEqual(calls(), [['dataOp', 'add', 'periods'], ['dataOp', 'list', 'periods'], ['dataOp', 'list', 'memories']])
})

const lists = app => app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action === 'list').map(call => call.data.collection)

test('period: an editor opened while the shared records are loading joins that load and hints from what it brings', async (t) => {
  const app = setup(t)
  const periods = cloudRoute(app, period, 'list').defer()
  app.launch(homeRoute)
  await app.settle()
  app.wx.navigateTo({ url: editUrl(period, { startDate: '2026-09-10', endDate: '2026-09-14' }) })
  await app.settle()
  const page = app.currentPage
  assert.deepEqual(lists(app), ['periods', 'memories'], 'the editor reads nothing of its own')
  assert.equal(page.data.periodDayCountText, '共 5 天')
  assert.equal(page.data.periodLengthHint, '', 'no history yet: the default 5 days')
  periods.resolve({ code: 0, data: [
    { _id: 'old1', startDate: '2026-05-01', endDate: '2026-05-03' },
    { _id: 'old2', startDate: '2026-06-01', endDate: '2026-06-03' }
  ] })
  await app.settle()
  assert.equal(page.data.periodLengthHint, '比你通常的 3 天长，确认一下结束日？')
  assert.deepEqual(lists(app), ['periods', 'memories'])
})

test('period: periods this device cannot read leave the default length and no overlap question', async (t) => {
  const app = setup(t)
  periodsUnread(app)
  const { page } = await openEditor(app, period, { startDate: '2026-09-03', endDate: '2026-09-09' })
  assert.deepEqual(lists(app), ['periods', 'memories', 'periods', 'memories'], 'opening asks the shared records once')
  assert.equal(page.data.periodLengthHint, '比你通常的 5 天长，确认一下结束日？')
  const saved = { _id: 'saved', ...period.payload, startDate: '2026-09-03', endDate: '2026-09-09', status: 'known-end', duration: 7 }
  cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
  await app.dispatch(page, 'save')
  await app.settle()
  assert.deepEqual(lists(app).slice(4), ['periods', 'memories'], 'saving asks the shared records once more')
  assert.deepEqual(app.wx.modals, [])
  assert.deepEqual(writes(app).map(call => call.action), ['add'])
  assert.equal(page.data.submitted, true)
})

test('period: a period saved here and not yet confirmed by a list counts for the next editor', async (t) => {
  const app = setup(t)
  const { home, page } = await openEditor(app, period, { startDate: '2026-09-10', endDate: '2026-09-12' })
  const saved = { _id: 'local', ...period.payload, startDate: '2026-09-10', endDate: '2026-09-12', status: 'known-end', duration: 3 }
  cloudRoute(app, period, 'add').reply({ code: 0, record: saved })
  await app.dispatch(page, 'save')
  const refresh = cloudRoute(app, period, 'list').defer()
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  app.wx.navigateTo({ url: editUrl(period, { startDate: '2026-09-11', endDate: '2026-09-15' }) })
  await app.settle()
  const next = app.currentPage
  assert.equal(next.data.periodLengthHint, '比你通常的 3 天长，确认一下结束日？')
  const saving = app.dispatch(next, 'save')
  await app.settle()
  assert.equal(next.data.confirmationTitle, '这一天已有经期')
  assert.deepEqual(app.wx.modals, [])
  await app.dispatch(next, 'onConfirmationAction', dataset({ action: 'edit' }))
  await app.advance(200)
  await saving
  await app.settle()
  assert.equal(app.currentPage.data.id, 'local')
  assert.deepEqual(writes(app).map(call => call.action), ['add'])
  refresh.resolve({ code: 0, data: [saved] })
  await app.flush()
})

test('period: a save in the editor opened through the overlap question reaches home before any refresh', async (t) => {
  const app = setup(t)
  const existing = { _id: 'covered', startDate: '2026-09-01', endDate: '2026-09-05', status: 'known-end' }
  cloudRoute(app, period, 'list').reply({ code: 0, data: [existing] })
  const { home, page } = await openEditor(app, period, { startDate: '2026-09-03' })
  const saving = app.dispatch(page, 'save')
  await app.settle()
  assert.equal(page.data.confirmationTitle, '这一天已有经期')
  assert.deepEqual(app.wx.modals, [])
  await app.dispatch(page, 'onConfirmationAction', dataset({ action: 'edit' }))
  await app.advance(200)
  await saving
  await app.settle()
  const owner = app.currentPage
  assert.equal(owner.data.id, 'covered')
  await changeEditorDate(app, owner, 'onEndChange', '2026-09-07')
  cloudRoute(app, period, 'update').reply({ code: 0, record: { ...existing, endDate: '2026-09-07' } })
  await app.dispatch(owner, 'save')
  assert.equal(cell(home, '2026-09-07').isPeriod, true)
  assert.equal(app.storage.recordTabSegment, 'period')
  assert.deepEqual(lists(app), ['periods', 'memories'], 'only the first home load has read')
})
