const assert = require('node:assert/strict')
const test = require('node:test')

const cycle = require('../utils/cycle')
const insights = require('../utils/calendarInsights')

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
    ],
    lineItems: [
      { key: 'prediction:0', text: '参考最近 5 次有效周期' },
      { key: 'prediction:1', text: '平均周期 28 天，平均持续 5 天' },
      { key: 'prediction:2', text: '置信度：高' },
      { key: 'prediction:3', text: '已忽略 1 次波动较大的记录' }
    ]
  })
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
  assert.deepEqual(recap.highlightItems, [
    { key: 'recap:0', text: '经期：08月09日-08月13日，5天，经量 量多，痛经' },
    { key: 'recap:1', text: '欢乐时光：七夕晚餐；一起看电影' }
  ])
  assert.match(recap.shareText, /2026年8月小结/)
  assert.match(recap.shareText, /本月记录了 1 次经期，共 5 天/)
  assert.match(recap.shareText, /留下 2 条欢乐时光/)
})

test('buildMonthlyRecap ignores impossible dates before deriving counts and highlights', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [
      {
        startDate: '2026-08-32',
        endDate: '2026-09-02',
        duration: 2,
        flow: 'heavy'
      },
      {
        startDate: '2026-08-09',
        endDate: '2026-08-32',
        duration: 5,
        flow: 'normal'
      },
      period('2026-08-20', '2026-08-22')
    ],
    memories: [
      { date: '2026-08-32', note: '错误日期' },
      { date: '2026-08-21', note: '有效记忆' }
    ]
  })

  assert.equal(recap.periodSummary, '本月记录了 1 次经期，共 3 天')
  assert.equal(recap.memorySummary, '留下 1 条欢乐时光')
  assert.deepEqual(recap.highlights, [
    '经期：08月20日-08月22日，3天',
    '欢乐时光：有效记忆'
  ])
  assert.doesNotMatch(recap.shareText, /错误日期/)
})

test('buildMonthlyRecap collapses repeated default memory labels in highlights', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 5,
    periods: [],
    memories: [
      { date: '2026-06-01' },
      { date: '2026-06-07', note: '' },
      { date: '2026-06-13', note: '   ' },
      { date: '2026-06-20' },
      { date: '2026-06-28' }
    ]
  })

  assert.equal(recap.memorySummary, '留下 5 条欢乐时光')
  assert.deepEqual(recap.highlights, [
    '欢乐时光：5 个特别日子'
  ])
  assert.equal(recap.shareText.includes('特别日子；特别日子'), false)
})

test('buildMonthlyRecap keeps real memory notes in order while collapsing defaults', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 5,
    periods: [],
    memories: [
      { date: '2026-06-01', note: '散步' },
      { date: '2026-06-07' },
      { date: '2026-06-13', note: '看电影' },
      { date: '2026-06-20', note: '散步' },
      { date: '2026-06-28', note: '   ' }
    ]
  })

  assert.deepEqual(recap.highlights, [
    '欢乐时光：散步；2 个特别日子；看电影；散步'
  ])
})

test('buildMonthlyRecap gives duplicate highlight text unique render keys', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [
      period('2026-08-09', '2026-08-09'),
      period('2026-08-09', '2026-08-09')
    ],
    memories: []
  })

  assert.deepEqual(recap.highlights, [
    '经期：08月09日-08月09日，1天',
    '经期：08月09日-08月09日，1天'
  ])
  assert.deepEqual(recap.highlightItems, [
    { key: 'recap:0', text: '经期：08月09日-08月09日，1天' },
    { key: 'recap:1', text: '经期：08月09日-08月09日，1天' }
  ])
})

test('calendarInsights does not expose marker semantics outside home calendar state', () => {
  assert.equal('CALENDAR_LEGEND_ITEMS' in insights, false)
  assert.equal('buildDayMeanings' in insights, false)
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
