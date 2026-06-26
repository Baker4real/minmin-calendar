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
      range: '2026-08-01 ~ 2026-08-05',
      metaText: ''
    }
  ])
  assert.deepEqual(detail.memories, [
    { note: '一起散步' }
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
    ['memory', 'predict']
  )
  assert.deepEqual(detail.memories, [
    { note: '庆祝晚餐' }
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
