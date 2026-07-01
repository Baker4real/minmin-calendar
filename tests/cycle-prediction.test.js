const assert = require('node:assert/strict')
const test = require('node:test')

let cycle = {}
try {
  cycle = require('../utils/cycle')
} catch (error) {
  cycle = {}
}

test('predictNextPeriod ignores an outlier cycle and returns a range with confidence', () => {
  assert.equal(typeof cycle.predictNextPeriod, 'function')

  const prediction = cycle.predictNextPeriod([
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ])

  assert.deepEqual(pickPrediction(prediction), {
    canPredict: true,
    avgCycle: 28,
    avgDuration: 5,
    nextStart: '2026-08-10',
    nextEnd: '2026-08-14',
    rangeStart: '2026-08-09',
    rangeEnd: '2026-08-11',
    confidence: 'high',
    confidenceText: '高',
    usedCycleCount: 5,
    ignoredCycleCount: 1
  })
})

test('predictNextPeriod uses manual cycle settings when history is too short', () => {
  assert.equal(typeof cycle.predictNextPeriod, 'function')

  const prediction = cycle.predictNextPeriod(
    [period('2026-06-01', '2026-06-04')],
    { typicalCycleLength: 31, typicalPeriodLength: 4 }
  )

  assert.deepEqual(pickPrediction(prediction), {
    canPredict: true,
    avgCycle: 31,
    avgDuration: 4,
    nextStart: '2026-07-02',
    nextEnd: '2026-07-05',
    rangeStart: '2026-06-29',
    rangeEnd: '2026-07-05',
    confidence: 'low',
    confidenceText: '低',
    usedCycleCount: 0,
    ignoredCycleCount: 0
  })
})

test('predictNextPeriod can fall back to a single observed cycle with low confidence', () => {
  assert.equal(typeof cycle.predictNextPeriod, 'function')

  const prediction = cycle.predictNextPeriod([
    period('2026-06-01', '2026-06-05'),
    period('2026-06-30', '2026-07-04')
  ])

  assert.deepEqual(pickPrediction(prediction), {
    canPredict: true,
    avgCycle: 29,
    avgDuration: 5,
    nextStart: '2026-07-29',
    nextEnd: '2026-08-02',
    rangeStart: '2026-07-26',
    rangeEnd: '2026-08-01',
    confidence: 'low',
    confidenceText: '低',
    usedCycleCount: 1,
    ignoredCycleCount: 0
  })
})

test('predictNextPeriod ignores records with impossible calendar dates', () => {
  assert.equal(typeof cycle.predictNextPeriod, 'function')

  const prediction = cycle.predictNextPeriod(
    [
      period('2026-01-01', '2026-01-05'),
      period('2026-02-31', '2026-03-03'),
      { startDate: '2026-01-29', endDate: '2026-01-32', duration: 4 }
    ],
    { typicalCycleLength: 28, typicalPeriodLength: 5 }
  )

  assert.deepEqual(pickPrediction(prediction), {
    canPredict: true,
    avgCycle: 28,
    avgDuration: 5,
    nextStart: '2026-01-29',
    nextEnd: '2026-02-02',
    rangeStart: '2026-01-26',
    rangeEnd: '2026-02-01',
    confidence: 'low',
    confidenceText: '低',
    usedCycleCount: 0,
    ignoredCycleCount: 0
  })
})

test('buildCycleReminders returns upcoming and overdue reminder states', () => {
  assert.equal(typeof cycle.predictNextPeriod, 'function')
  assert.equal(typeof cycle.buildCycleReminders, 'function')

  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]
  const prediction = cycle.predictNextPeriod(periods)

  assert.deepEqual(cycle.buildCycleReminders(prediction, periods, { today: '2026-08-06' }), [
    {
      type: 'upcoming',
      title: '经期临近',
      text: '约 3 天后进入预测区间',
      action: 'quickPeriod',
      date: '2026-08-06'
    }
  ])

  assert.deepEqual(cycle.buildCycleReminders(prediction, periods, { today: '2026-08-09' }), [
    {
      type: 'due',
      title: '正在预测区间',
      text: '如果已经开始，可以直接记录今天',
      action: 'quickPeriod',
      date: '2026-08-09'
    }
  ])

  assert.deepEqual(cycle.buildCycleReminders(prediction, periods, { today: '2026-08-13' }), [
    {
      type: 'overdue',
      title: '预测已过',
      text: '预测区间已过 2 天，如已开始可以补记',
      action: 'quickPeriod',
      date: '2026-08-13'
    }
  ])
})

test('buildPeriodPayload and decoratePeriod normalize optional flow and symptom tags', () => {
  assert.equal(typeof cycle.buildPeriodPayload, 'function')
  assert.equal(typeof cycle.decoratePeriod, 'function')

  const payload = cycle.buildPeriodPayload({
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: 'need rest',
    flow: 'heavy',
    symptoms: ['cramps', 'headache', 'cramps', 'unknown']
  })

  assert.deepEqual(payload, {
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: 'need rest',
    duration: 3,
    flow: 'heavy',
    symptoms: ['cramps', 'headache']
  })

  assert.deepEqual(cycle.decoratePeriod(payload), {
    ...payload,
    flowLabel: '量多',
    symptomLabels: ['痛经', '头痛'],
    symptomText: '痛经、头痛'
  })
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

function pickPrediction(prediction) {
  return {
    canPredict: prediction.canPredict,
    avgCycle: prediction.avgCycle,
    avgDuration: prediction.avgDuration,
    nextStart: prediction.nextStart,
    nextEnd: prediction.nextEnd,
    rangeStart: prediction.rangeStart,
    rangeEnd: prediction.rangeEnd,
    confidence: prediction.confidence,
    confidenceText: prediction.confidenceText,
    usedCycleCount: prediction.usedCycleCount,
    ignoredCycleCount: prediction.ignoredCycleCount
  }
}
