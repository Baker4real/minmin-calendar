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
    summary: '预计区间 08月09日-08月11日',
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

test('prediction explanation leaves the headline date to the stats card (single authority)', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ])

  const explanation = insights.buildPredictionExplanation(prediction)

  // 统计卡头条是预测日期的唯一权威；说明 sheet 只解释区间与依据，不重复同一日期
  assert.ok(prediction.canPredict)
  assert.equal(explanation.summary.includes(prediction.nextDisplay), false)
  assert.match(explanation.summary, new RegExp(`区间 ${prediction.rangeDisplay}`))
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

test('buildMonthlyRecap keeps period duration and days in viewed month as two numbers when stored duration conflicts', () => {
  const spanning = {
    startDate: '2026-08-28',
    endDate: '2026-09-01',
    duration: 99
  }

  const august = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [spanning]
  })

  assert.deepEqual(august.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 4 天'
  ])
  assert.equal(august.periodSummary, '本月开始 1 次，本月 4 天')
})

test('buildMonthlyRecap states period duration and days in viewed month separately when a period spans months', () => {
  const spanning = period('2026-08-28', '2026-09-01')

  const august = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [spanning]
  })
  const september = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [spanning]
  })

  assert.equal(august.periodSummary, '本月开始 1 次，本月 4 天')
  assert.deepEqual(august.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 4 天'
  ])
  assert.equal(september.periodSummary, '从上月延续 1 次，本月 1 天')
  assert.deepEqual(september.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 1 天'
  ])
  assert.match(august.shareText, /本月开始 1 次，本月 4 天/)
  assert.match(august.shareText, /经期：08月28日-09月01日，整段 5 天，本月 4 天/)
  assert.match(september.shareText, /从上月延续 1 次，本月 1 天/)
  assert.doesNotMatch(september.shareText, /本月记录了 1 次经期，共 1 天/)
})

test('buildMonthlyRecap counts two periods continued from the previous month', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [
      period('2026-08-28', '2026-09-01'),
      period('2026-08-30', '2026-09-03')
    ]
  })

  assert.equal(recap.periodSummary, '从上月延续 2 次，本月 4 天')
  assert.deepEqual(recap.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 1 天',
    '经期：08月30日-09月03日，整段 5 天，本月 3 天'
  ])
})

test('buildMonthlyRecap splits started and continued counts when a month has both', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [
      period('2026-08-28', '2026-09-01'),
      period('2026-09-20', '2026-09-24')
    ]
  })

  assert.equal(recap.periodSummary, '本月开始 1 次，从上月延续 1 次，本月 6 天')
  assert.deepEqual(recap.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 1 天',
    '经期：09月20日-09月24日，5天'
  ])
})

test('buildMonthlyRecap uses the same started and continued copy across a year boundary', () => {
  const spanning = period('2026-12-28', '2027-01-01')

  const december = insights.buildMonthlyRecap({
    year: 2026,
    month: 11,
    periods: [spanning]
  })
  const january = insights.buildMonthlyRecap({
    year: 2027,
    month: 0,
    periods: [spanning]
  })

  assert.equal(december.periodSummary, '本月开始 1 次，本月 4 天')
  assert.deepEqual(december.highlights, [
    '经期：12月28日-01月01日，整段 5 天，本月 4 天'
  ])
  assert.equal(january.periodSummary, '从上月延续 1 次，本月 1 天')
  assert.deepEqual(january.highlights, [
    '经期：12月28日-01月01日，整段 5 天，本月 1 天'
  ])
})

test('buildMonthlyRecap keeps flow and symptoms after spanning duration labels', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [{
      startDate: '2026-08-28',
      endDate: '2026-09-01',
      duration: 5,
      flow: 'heavy',
      symptoms: ['cramps']
    }]
  })

  assert.deepEqual(recap.highlights, [
    '经期：08月28日-09月01日，整段 5 天，本月 1 天，经量 量多，痛经'
  ])
})

test('buildMonthlyRecap treats a middle month of a three-month period as continued from last month', () => {
  const spanning = period('2026-08-28', '2026-10-02')
  const september = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [spanning]
  })

  assert.equal(september.periodSummary, '从上月延续 1 次，本月 30 天')
  assert.deepEqual(september.highlights, [
    '经期：08月28日-10月02日，整段 36 天，本月 30 天'
  ])
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

  assert.equal(recap.periodSummary, '本月暂无经期记录')
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

test('buildMonthlyRecap states an ongoing period as start-through-today without inventing a duration', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [
      { startDate: '2026-09-20', endDate: '', status: 'ongoing', flow: 'heavy' }
    ],
    memories: [],
    prediction: null,
    today: '2026-09-24'
  })

  // 进行中：区间写到今天并说明进行中，只报本月天数，不写「整段 N 天」
  assert.deepEqual(recap.highlights, ['经期：09月20日-09月24日，进行中，本月 5 天，经量 量多'])
  assert.equal(recap.periodSummary, '本月记录了 1 次经期，共 5 天')
})

test('buildMonthlyRecap states an unknown-end period as its known start day only', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 7,
    periods: [
      { startDate: '2026-08-12', endDate: '', status: 'unknown-end' }
    ],
    memories: [],
    prediction: null,
    today: '2026-09-24'
  })

  // 结束日期不详：只写已知开始日与状态，不发明时长或区间
  assert.deepEqual(recap.highlights, ['经期：08月12日，结束日期不详'])
  assert.equal(recap.periodSummary, '本月记录了 1 次经期，共 1 天')
})

test('buildMonthlyRecap keeps completed precision separate from ongoing and unknown-end records', () => {
  const recap = insights.buildMonthlyRecap({
    year: 2026,
    month: 8,
    periods: [
      period('2026-09-02', '2026-09-06'),
      { startDate: '2026-09-10', endDate: '', status: 'unknown-end', duration: 9 },
      { startDate: '2026-09-20', endDate: '', status: 'ongoing', duration: 9 }
    ],
    memories: [],
    prediction: null,
    today: '2026-09-24'
  })

  // 同月三种状态各说各的事实：已完成写精确时长，不详只写开始日，进行中只写本月天数
  assert.deepEqual(recap.highlights, [
    '经期：09月02日-09月06日，5天',
    '经期：09月10日，结束日期不详',
    '经期：09月20日-09月24日，进行中，本月 5 天'
  ])
  // 存库的 9 天时长没有从任何未完成记录漏进文案
  assert.equal(recap.shareText.includes('9天'), false)
  assert.equal(recap.shareText.includes('9 天'), false)
  assert.equal(recap.highlights.some(line => line.includes('整段')), false)
  assert.equal(recap.periodSummary, '本月记录了 3 次经期，共 11 天')
})

test('prediction explanation states where the predicted duration comes from', () => {
  // 用户设置档：经期时长来自常用设置，不说「平均」
  const manual = insights.buildPredictionExplanation(
    cycle.predictNextPeriod(
      [period('2026-06-01', '2026-06-05')],
      { typicalCycleLength: 30, typicalPeriodLength: 4 }
    )
  )
  assert.deepEqual(manual.lines, [
    '参考手动设置的常用周期',
    '平均周期 30 天，经期时长按常用 4 天',
    '置信度：低'
  ])

  // 默认档：没有已完成时长，不把五天默认说成已知平均
  const defaulted = insights.buildPredictionExplanation(
    cycle.predictNextPeriod([
      { startDate: '2026-06-01', endDate: '', status: 'unknown-end', duration: 9 },
      { startDate: '2026-06-29', endDate: '', status: 'unknown-end', duration: 9 }
    ])
  )
  assert.deepEqual(defaulted.lines, [
    '参考最近 1 次有效周期',
    '平均周期 28 天，经期时长暂无已知记录，先按默认 5 天估',
    '置信度：低'
  ])
  assert.equal(defaulted.lines.some(line => line.includes('平均持续')), false)
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
