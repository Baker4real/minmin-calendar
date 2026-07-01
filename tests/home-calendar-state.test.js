const assert = require('node:assert/strict')
const test = require('node:test')

const cycle = require('../utils/cycle')
const insights = require('../utils/calendarInsights')
const { buildHomeCalendarState } = require('../utils/homeCalendarState')

test('buildHomeCalendarState returns fallback prediction state and explicit day details when records are insufficient', () => {
  const periods = [
    period('2026-08-01', '2026-08-05')
  ]
  const memories = [
    { date: '2026-08-03', note: '一起散步' }
  ]
  const prediction = cycle.predictNextPeriod(periods)

  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods,
    memories,
    today: '2026-08-03'
  })

  assert.equal(state.avgCycle, null)
  assert.equal(state.avgDuration, null)
  assert.equal(state.nextPredict, null)
  assert.equal(state.nextPredictDisplay, '--')
  assert.equal(state.nextPredictWeekday, '')
  assert.equal(state.predictionRangeDisplay, '')
  assert.equal(state.predictionWindow, null)
  assert.equal(state.predictConfidence, null)
  assert.deepEqual(state.predictionDetail, prediction)
  assert.deepEqual(state.predictionExplanation, insights.buildPredictionExplanation(prediction))
  assert.deepEqual(
    state.legendItems.map(item => item.key),
    ['today', 'period', 'memory', 'predict', 'holiday', 'workday']
  )
  assert.equal(new Set(state.legendItems.map(item => item.key)).size, 6)
  assert.match(state.legendItems.find(item => item.key === 'predict').text, /预测区间/)
  assert.match(state.legendItems.find(item => item.key === 'memory').text, /欢乐时光/)
  assert.deepEqual(state.cycleReminders, [])
  assert.deepEqual(
    state.monthlyRecap,
    insights.buildMonthlyRecap({ year: 2026, month: 7, periods, memories, prediction })
  )

  const day = state.days.find(item => item.date === '2026-08-03')
  assert.equal(day.isToday, true)
  assert.equal(day.isPeriod, true)
  assert.equal(day.isMemory, true)
  assert.equal(day.isPredict, false)

  const detail = state.dayDetailsByDate['2026-08-03']
  assert.deepEqual(
    detail.meanings.map(item => item.key),
    ['today', 'period', 'memory']
  )
  assert.deepEqual(detail.periods, [
    {
      key: 'period:2026-08-01:2026-08-05:0',
      range: '2026-08-01 ~ 2026-08-05',
      metaText: ''
    }
  ])
  assert.deepEqual(detail.memories, [
    { key: 'memory:2026-08-03:0', note: '一起散步' }
  ])
  assert.equal(detail.empty, false)
})

test('buildHomeCalendarState reuses cycle and insight helpers for predictable records', () => {
  const periods = [
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]
  const memories = [
    { date: '2026-08-10', note: '庆祝晚餐' }
  ]
  const prediction = cycle.predictNextPeriod(periods)

  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods,
    memories,
    today: '2026-08-10'
  })

  assert.equal(state.avgCycle, prediction.avgCycle)
  assert.equal(state.avgDuration, prediction.avgDuration)
  assert.equal(state.nextPredict, prediction.nextStart)
  assert.equal(state.nextPredictDisplay, prediction.nextDisplay)
  assert.equal(state.nextPredictWeekday, prediction.nextWeekday)
  assert.equal(state.predictionRangeDisplay, prediction.rangeDisplay)
  assert.deepEqual(state.predictionWindow, {
    rangeStart: prediction.rangeStart,
    rangeEnd: prediction.rangeEnd
  })
  assert.equal(state.predictConfidence, prediction.confidenceText)
  assert.deepEqual(state.predictionDetail, prediction)
  assert.deepEqual(state.predictionExplanation, insights.buildPredictionExplanation(prediction))
  assert.deepEqual(
    state.legendItems.map(item => item.key),
    ['today', 'period', 'memory', 'predict', 'holiday', 'workday']
  )
  assert.deepEqual(
    state.cycleReminders,
    cycle.buildCycleReminders(prediction, periods, { today: '2026-08-10' })
  )
  assert.deepEqual(
    state.monthlyRecap,
    insights.buildMonthlyRecap({ year: 2026, month: 7, periods, memories, prediction })
  )

  const predictedDates = state.days.filter(item => item.isPredict).map(item => item.date)
  assert.deepEqual(predictedDates, ['2026-08-09', '2026-08-10', '2026-08-11'])

  const detail = state.dayDetailsByDate['2026-08-10']
  assert.deepEqual(
    detail.meanings.map(item => item.key),
    ['today', 'memory', 'predict']
  )
  assert.deepEqual(detail.memories, [
    { key: 'memory:2026-08-10:0', note: '庆祝晚餐' }
  ])
})

test('buildHomeCalendarState explains why a tapped date has markers', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [period('2026-08-10', '2026-08-10')],
    memories: [{ date: '2026-08-10', note: '庆祝晚餐' }],
    today: '2026-08-10'
  })

  const detail = state.dayDetailsByDate['2026-08-10']

  assert.deepEqual(
    detail.meanings.map(item => [item.key, item.title]),
    [
      ['today', '今天'],
      ['period', '经期记录'],
      ['memory', '欢乐时光']
    ]
  )
})

test('buildHomeCalendarState applies calendar marker semantics on top of date metadata', () => {
  const periods = [
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]
  const memories = [
    { date: '2026-08-10', note: '庆祝晚餐' }
  ]

  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods,
    memories,
    today: '2026-08-10'
  })

  const predictedDates = state.days.filter(day => day.isPredict).map(day => day.date)
  assert.deepEqual(predictedDates, ['2026-08-09', '2026-08-10', '2026-08-11'])

  const periodMemoryAndPredict = state.days.find(day => day.date === '2026-08-10')
  assert.equal(periodMemoryAndPredict.isToday, true)
  assert.equal(periodMemoryAndPredict.isPeriod, false)
  assert.equal(periodMemoryAndPredict.isMemory, true)
  assert.equal(periodMemoryAndPredict.isPredict, true)
  assert.equal(periodMemoryAndPredict.lunarText, '六月廿八')
})

test('buildHomeCalendarState aligns missing endDate period markers with detail rows', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [
      {
        _id: 'p-missing-end',
        startDate: '2026-08-12',
        duration: 5,
        flow: 'light'
      }
    ],
    memories: [],
    today: '2026-08-01'
  })

  const day = state.days.find(item => item.date === '2026-08-12')
  assert.equal(day.isPeriod, true)

  const detail = state.dayDetailsByDate['2026-08-12']
  assert.deepEqual(
    detail.meanings.map(item => item.key),
    ['period']
  )
  assert.deepEqual(detail.periods, [
    {
      key: 'period:p-missing-end',
      range: '2026-08-12 ~ 2026-08-12',
      metaText: '经量 量少'
    }
  ])
  assert.deepEqual(detail.memories, [])
  assert.equal(detail.empty, false)
})

test('buildHomeCalendarState does not show an empty state when a date only has meanings', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [],
    memories: [],
    today: '2026-08-10'
  })

  const todayDetail = state.dayDetailsByDate['2026-08-10']
  assert.deepEqual(todayDetail.meanings.map(item => item.key), ['today'])
  assert.deepEqual(todayDetail.periods, [])
  assert.deepEqual(todayDetail.memories, [])
  assert.equal(todayDetail.empty, false)

  const plainDetail = state.dayDetailsByDate['2026-08-11']
  assert.deepEqual(plainDetail.meanings, [])
  assert.equal(plainDetail.empty, true)
})

test('buildHomeCalendarState gives duplicate detail rows unique render keys', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [
      { startDate: '2026-08-12', endDate: '2026-08-12', duration: 1 },
      { startDate: '2026-08-12', endDate: '2026-08-12', duration: 1 }
    ],
    memories: [
      { date: '2026-08-12', note: '同一天' },
      { date: '2026-08-12', note: '同一天' }
    ],
    today: '2026-08-01'
  })

  const detail = state.dayDetailsByDate['2026-08-12']

  assert.deepEqual(detail.periods.map(item => item.key), [
    'period:2026-08-12:2026-08-12:0',
    'period:2026-08-12:2026-08-12:1'
  ])
  assert.deepEqual(detail.memories.map(item => item.key), [
    'memory:2026-08-12:0',
    'memory:2026-08-12:1'
  ])
})

test('buildHomeCalendarState ignores impossible dates in markers and details', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 2,
    periods: [
      { startDate: '2026-02-31', endDate: '2026-03-02', duration: 3, note: 'invalid' },
      { startDate: '2026-03-04', endDate: '2026-03-32', duration: 29, note: 'invalid end' },
      { startDate: '2026-03-03', endDate: '2026-03-03', duration: 1, note: 'valid' }
    ],
    memories: [
      { date: '2026-02-31', note: 'invalid memory' },
      { date: '2026-03-03', note: 'valid memory' }
    ],
    today: '2026-03-03'
  })

  const invalidRolledDay = state.days.find(day => day.date === '2026-03-02')
  assert.equal(invalidRolledDay.isPeriod, false)
  assert.equal(invalidRolledDay.isMemory, false)
  assert.deepEqual(state.dayDetailsByDate['2026-03-02'].periods, [])
  assert.deepEqual(state.dayDetailsByDate['2026-03-02'].memories, [])

  const invalidEndDay = state.days.find(day => day.date === '2026-03-04')
  assert.equal(invalidEndDay.isPeriod, false)
  assert.deepEqual(state.dayDetailsByDate['2026-03-04'].periods, [])

  const validDay = state.days.find(day => day.date === '2026-03-03')
  assert.equal(validDay.isPeriod, true)
  assert.equal(validDay.isMemory, true)
  assert.deepEqual(state.dayDetailsByDate['2026-03-03'].periods, [
    {
      key: 'period:2026-03-03:2026-03-03:2',
      range: '2026-03-03 ~ 2026-03-03',
      metaText: ''
    }
  ])
  assert.deepEqual(state.dayDetailsByDate['2026-03-03'].memories, [
    { key: 'memory:2026-03-03:1', note: 'valid memory' }
  ])
})

function period(startDate, endDate) {
  return {
    startDate,
    endDate,
    duration: daysBetween(startDate, endDate) + 1
  }
}

function daysBetween(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}
