const assert = require('node:assert/strict')
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
    note: '疼痛 & 休息',
    flow: 'heavy',
    symptoms: ['cramps', 'headache'],
    isEdit: true
  })

  assert.deepEqual(route.parsePeriodEditOptions({}, { today: '2026-06-26' }), {
    id: '',
    startDate: '2026-06-26',
    endDate: '2026-06-26',
    note: '',
    flow: '',
    symptoms: [],
    isEdit: false
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
    note: '%',
    flow: 'heavy',
    symptoms: [],
    isEdit: true
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
    isEdit: true
  })

  assert.deepEqual(route.parseMemoryEditOptions({}, { today: '2026-06-26' }), {
    id: '',
    date: '2026-06-26',
    note: '',
    isEdit: false
  })
})

test('parseMemoryEditOptions tolerates truncated UTF-8 in note', () => {
  assert.deepEqual(route.parseMemoryEditOptions({
    date: '2026-06-03',
    note: '%E0%A4%A'
  }, { today: '2026-06-26' }), {
    id: '',
    date: '2026-06-03',
    note: '%E0%A4%A',
    isEdit: false
  })
})
