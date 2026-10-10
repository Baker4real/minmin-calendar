const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const route = require('../utils/recordEditRoute')

test('buildPeriodEditUrl builds add and edit routes with encoded optional fields', () => {
  assert.equal(route.buildPeriodEditUrl({
    startDate: '2026-06-01',
    endDate: '2026-06-05'
  }), '/pages/period/edit/edit?startDate=2026-06-01&endDate=2026-06-05')

  assert.equal(route.buildPeriodEditUrl({
    id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    note: '疼痛 & 休息',
    flow: 'heavy',
    symptoms: ['cramps', 'headache']
  }), '/pages/period/edit/edit?id=p1&startDate=2026-06-01&endDate=2026-06-05&note=%E7%96%BC%E7%97%9B%20%26%20%E4%BC%91%E6%81%AF&flow=heavy&symptoms=cramps%2Cheadache')
})

test('buildPeriodEditUrl carries the explicit status and omits the end date for incomplete records', () => {
  assert.equal(
    route.buildPeriodEditUrl({ id: 'p2', startDate: '2026-09-20', endDate: '', status: 'ongoing' }),
    '/pages/period/edit/edit?id=p2&startDate=2026-09-20&status=ongoing'
  )
  assert.equal(
    route.buildPeriodEditUrl({ id: 'p3', startDate: '2026-08-01', status: 'unknown-end' }),
    '/pages/period/edit/edit?id=p3&startDate=2026-08-01&status=unknown-end'
  )
})

test('parsePeriodEditOptions hydrates period edit page state from route options', () => {
  const state = route.parsePeriodEditOptions({
    id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    note: '%E7%96%BC%E7%97%9B%20%26%20%E4%BC%91%E6%81%AF',
    flow: 'heavy',
    symptoms: 'cramps%2Cheadache'
  }, { today: '2026-06-26' })

  assert.deepEqual(state, {
    id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    status: 'known-end',
    note: '疼痛 & 休息',
    flow: 'heavy',
    symptoms: ['cramps', 'headache'],
    isEdit: true,
    maxDate: '2026-06-26'
  })

  // 新增默认进行中：只带开始日期，结束日期为空，选择器上限为今天
  assert.deepEqual(route.parsePeriodEditOptions({}, { today: '2026-06-26' }), {
    id: '',
    startDate: '2026-06-26',
    endDate: '',
    status: 'ongoing',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: false,
    maxDate: '2026-06-26'
  })

  // 编辑旧记录缺结束日期：保守解释为结束日期不详
  assert.deepEqual(route.parsePeriodEditOptions({ id: 'p9', startDate: '2026-06-01' }, { today: '2026-06-26' }), {
    id: 'p9',
    startDate: '2026-06-01',
    endDate: '',
    status: 'unknown-end',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: true,
    maxDate: '2026-06-26'
  })

  // 状态权威：显式 ongoing 时路由里的残留结束日期被忽略
  assert.deepEqual(
    route.parsePeriodEditOptions({ id: 'p2', startDate: '2026-09-20', endDate: '2026-09-30', status: 'ongoing' }, { today: '2026-09-29' }),
    {
      id: 'p2',
      startDate: '2026-09-20',
      endDate: '',
      status: 'ongoing',
      note: '',
      flow: '',
      symptoms: [],
      isEdit: true,
      maxDate: '2026-09-29'
    }
  )
})

test('parsePeriodEditOptions derives the new-record default status from the effective start date', () => {
  // 补记过去某天：默认已结束，结束日留空，等用户自己选
  assert.deepEqual(route.parsePeriodEditOptions({ startDate: '2026-06-01' }, { today: '2026-06-26' }), {
    id: '',
    startDate: '2026-06-01',
    endDate: '',
    status: 'known-end',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: false,
    maxDate: '2026-06-26'
  })

  // 记今天：默认进行中，结束日期为空
  assert.deepEqual(route.parsePeriodEditOptions({ startDate: '2026-06-26' }, { today: '2026-06-26' }), {
    id: '',
    startDate: '2026-06-26',
    endDate: '',
    status: 'ongoing',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: false,
    maxDate: '2026-06-26'
  })

  // 显式状态调用方行为不变：显式 known-end 缺结束日期时不补开始日兜底
  assert.deepEqual(route.parsePeriodEditOptions({ startDate: '2026-06-01', status: 'known-end' }, { today: '2026-06-26' }), {
    id: '',
    startDate: '2026-06-01',
    endDate: '',
    status: 'known-end',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: false,
    maxDate: '2026-06-26'
  })
})

test('buildPeriodEditUrl opens an ongoing record as ended today when the caller is finishing it', () => {
  const url = route.buildPeriodEditUrl({
    _id: 'p2',
    startDate: '2026-06-20',
    endDate: '',
    status: 'ongoing',
    note: '腹痛'
  }, { intent: 'complete', today: '2026-06-26' })

  assert.equal(
    url,
    '/pages/period/edit/edit?id=p2&startDate=2026-06-20&endDate=2026-06-26&status=known-end&note=%E8%85%B9%E7%97%9B'
  )

  assert.deepEqual(route.parsePeriodEditOptions({
    id: 'p2',
    startDate: '2026-06-20',
    endDate: '2026-06-26',
    status: 'known-end',
    note: '%E8%85%B9%E7%97%9B'
  }, { today: '2026-06-26' }), {
    id: 'p2',
    startDate: '2026-06-20',
    endDate: '2026-06-26',
    status: 'known-end',
    note: '腹痛',
    flow: '',
    symptoms: [],
    isEdit: true,
    maxDate: '2026-06-26'
  })
})

test('parsePeriodEditOptions tolerates malformed encoded route options', () => {
  const state = route.parsePeriodEditOptions({
    id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    note: '%',
    flow: 'heavy',
    symptoms: '%E0%A4%A'
  }, { today: '2026-06-26' })

  assert.deepEqual(state, {
    id: 'p1',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    status: 'known-end',
    note: '%',
    flow: 'heavy',
    symptoms: [],
    isEdit: true,
    maxDate: '2026-06-26'
  })
})

test('buildMemoryEditUrl builds add and edit routes with encoded notes', () => {
  assert.equal(route.buildMemoryEditUrl({
    date: '2026-06-03'
  }), '/pages/memory/edit/edit?date=2026-06-03')

  assert.equal(route.buildMemoryEditUrl({
    id: 'm1',
    date: '2026-06-03',
    note: '电影 & 夜宵'
  }), '/pages/memory/edit/edit?id=m1&date=2026-06-03&note=%E7%94%B5%E5%BD%B1%20%26%20%E5%A4%9C%E5%AE%B5')
})

test('parseMemoryEditOptions hydrates memory edit page state from route options', () => {
  assert.deepEqual(route.parseMemoryEditOptions({
    id: 'm1',
    date: '2026-06-03',
    note: '%E7%94%B5%E5%BD%B1%20%26%20%E5%A4%9C%E5%AE%B5'
  }, { today: '2026-06-26' }), {
    id: 'm1',
    date: '2026-06-03',
    note: '电影 & 夜宵',
    isEdit: true,
    maxDate: '2026-06-26'
  })

  assert.deepEqual(route.parseMemoryEditOptions({}, { today: '2026-06-26' }), {
    id: '',
    date: '2026-06-26',
    note: '',
    isEdit: false,
    maxDate: '2026-06-26'
  })
})

test('parseMemoryEditOptions keeps the original date when editing while clamping the picker to today', () => {
  const state = route.parseMemoryEditOptions({
    id: 'm1',
    date: '2026-06-03'
  }, { today: '2026-06-26' })

  assert.equal(state.date, '2026-06-03')
  assert.equal(state.maxDate, '2026-06-26')
  assert.equal(state.isEdit, true)
})

test('memory edit page clamps the date picker to today', () => {
  const memoryEditWxml = fs.readFileSync(
    path.join(__dirname, '..', 'pages/memory/edit/edit.wxml'),
    'utf8'
  )
  const memoryEditJs = fs.readFileSync(
    path.join(__dirname, '..', 'pages/memory/edit/edit.js'),
    'utf8'
  )

  assert.match(memoryEditWxml, /<picker mode="date" value="\{\{date\}\}" end="\{\{maxDate\}\}"[^>]*bindchange="onDateChange"[^>]*>/)
  assert.match(memoryEditJs, /maxDate:\s*''/)
})

test('parseMemoryEditOptions tolerates truncated UTF-8 in note', () => {
  assert.deepEqual(route.parseMemoryEditOptions({
    date: '2026-06-03',
    note: '%E0%A4%A'
  }, { today: '2026-06-26' }), {
    id: '',
    date: '2026-06-03',
    note: '%E0%A4%A',
    isEdit: false,
    maxDate: '2026-06-26'
  })
})
