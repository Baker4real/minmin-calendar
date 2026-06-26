const assert = require('node:assert/strict')
const test = require('node:test')

const cycle = require('../utils/cycle')
const insights = require('../utils/calendarInsights')

test('calendar legend explains every visible marker with unique keys', () => {
  assert.deepEqual(
    insights.CALENDAR_LEGEND_ITEMS.map(item => item.key),
    ['today', 'period', 'memory', 'predict', 'holiday', 'workday']
  )

  assert.equal(new Set(insights.CALENDAR_LEGEND_ITEMS.map(item => item.key)).size, 6)
  assert.match(insights.CALENDAR_LEGEND_ITEMS.find(item => item.key === 'predict').text, /预测区间/)
  assert.match(insights.CALENDAR_LEGEND_ITEMS.find(item => item.key === 'memory').text, /欢乐时光/)
})

test('buildPredictionExplanation turns prediction math into plain copy', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ])

  assert.deepEqual(insights.buildPredictionExplanation(prediction), {
    available: true,
    title: '预测说明',
    summary: '预计 08月10日，区间 08月09日-08月11日',
    lines: [
      '参考最近 5 次有效周期',
      '平均周期 28 天，平均持续 5 天',
      '置信度：高',
      '已忽略 1 次波动较大的记录'
    ]
  })
})

test('buildDayMeanings explains why a tapped date has markers', () => {
  const meanings = insights.buildDayMeanings({
    isToday: true,
    isPeriod: true,
    isMemory: true,
    isPredict: true,
    holidayName: '七夕',
    isWorkday: false
  })

  assert.deepEqual(
    meanings.map(item => [item.key, item.title]),
    [
      ['today', '今天'],
      ['period', '经期记录'],
      ['memory', '欢乐时光'],
      ['predict', '预测区间'],
      ['holiday', '节日']
    ]
  )
})

test('buildMonthlyRecap creates a gentle shareable recap for the selected month', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-04-18', '2026-04-22'),
    period('2026-05-16', '2026-05-20'),
    period('2026-06-13', '2026-06-17'),
    period('2026-07-11', '2026-07-15')
  ])

  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [
      {
        startDate: '2026-08-09',
        endDate: '2026-08-13',
        duration: 5,
        flow: 'heavy',
        symptoms: ['cramps']
      },
      period('2026-07-11', '2026-07-15')
    ],
    memories: [
      { date: '2026-08-07', note: '七夕晚餐' },
      { date: '2026-08-22', note: '一起看电影' }
    ],
    prediction
  })

  assert.equal(recap.title, '2026年8月小结')
  assert.equal(recap.periodSummary, '本月记录了 1 次经期，共 5 天')
  assert.equal(recap.memorySummary, '留下 2 条欢乐时光')
  assert.equal(recap.predictionSummary, '下次预测 08月08日，区间 08月07日-08月09日（中）')
  assert.deepEqual(recap.highlights, [
    '经期：08月09日-08月13日，5天，经量 量多，痛经',
    '欢乐时光：七夕晚餐；一起看电影'
  ])
  assert.match(recap.shareText, /2026年8月小结/)
  assert.match(recap.shareText, /本月记录了 1 次经期，共 5 天/)
  assert.match(recap.shareText, /留下 2 条欢乐时光/)
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
