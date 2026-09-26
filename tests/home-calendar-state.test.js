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
  assert.equal(detail.periods.length, 1)
  assert.match(detail.periods[0].key, /^period:fallback:/)
  assert.deepEqual(
    { range: detail.periods[0].range, metaText: detail.periods[0].metaText },
    { range: '2026-08-01 ~ 2026-08-05', metaText: '' }
  )
  assert.equal(detail.memories.length, 1)
  assert.match(detail.memories[0].key, /^memory:fallback:/)
  assert.equal(detail.memories[0].note, '一起散步')
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
  assert.equal(detail.memories.length, 1)
  assert.match(detail.memories[0].key, /^memory:fallback:/)
  assert.equal(detail.memories[0].note, '庆祝晚餐')
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

test('buildHomeCalendarState expresses a period day inside the prediction window as period only', () => {
  const periods = [
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-08-10')
  ]
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods,
    memories: [{ date: '2026-08-10', note: '庆祝晚餐' }],
    today: '2026-08-20'
  })

  const periodOnly = state.days.find(day => day.date === '2026-08-08')
  const overlap = state.days.find(day => day.date === '2026-08-09')
  const overlapWithMemory = state.days.find(day => day.date === '2026-08-10')
  const predictOnly = state.days.find(day => day.date === '2026-08-11')

  assert.equal(periodOnly.isPeriod, true)
  assert.equal(periodOnly.isPredict, false)
  assert.equal(periodOnly.isMemory, false)
  assert.equal(overlap.isPeriod, true)
  assert.equal(overlap.isPredict, false)
  assert.equal(overlap.isMemory, false)
  assert.equal(overlapWithMemory.isPeriod, true)
  assert.equal(overlapWithMemory.isMemory, true)
  assert.equal(overlapWithMemory.isPredict, false)
  assert.equal(predictOnly.isPeriod, false)
  assert.equal(predictOnly.isMemory, false)
  assert.equal(predictOnly.isPredict, true)
  assert.deepEqual(
    state.days.filter(day => day.isPredict).map(day => day.date),
    ['2026-08-11']
  )

  assertPeriodDetailWithoutPrediction(state.dayDetailsByDate['2026-08-08'])
  assertPeriodDetailWithoutPrediction(state.dayDetailsByDate['2026-08-09'])
  assertPeriodDetailWithoutPrediction(state.dayDetailsByDate['2026-08-10'])
  assert.deepEqual(
    state.dayDetailsByDate['2026-08-10'].meanings.map(item => item.key),
    ['period', 'memory']
  )
  assert.equal(state.dayDetailsByDate['2026-08-10'].memories[0].note, '庆祝晚餐')
  assert.deepEqual(
    state.dayDetailsByDate['2026-08-11'].meanings.map(item => [item.key, item.title]),
    [['predict', '预测区间']]
  )
  assert.match(state.dayDetailsByDate['2026-08-11'].meanings[0].text, /预测/)

  assert.equal(periodOnly.ariaLabel, '8月8日 周六 六月廿六 经期')
  assert.equal(overlap.ariaLabel, '8月9日 周日 六月廿七 经期')
  assert.equal(overlapWithMemory.ariaLabel, '8月10日 周一 六月廿八 经期 欢乐时光')
  assert.equal(predictOnly.ariaLabel, '8月11日 周二 六月廿九 预测区间')
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

  const periodKeys = detail.periods.map(item => item.key)
  const memoryKeys = detail.memories.map(item => item.key)
  assert.equal(new Set(periodKeys).size, 2)
  assert.equal(new Set(memoryKeys).size, 2)
  assert.ok(periodKeys.every(key => key.startsWith('period:fallback:')))
  assert.ok(memoryKeys.every(key => key.startsWith('memory:fallback:')))
})

test('buildHomeCalendarState prefers record ids for period and memory detail keys', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [
      { _id: 'period-a', startDate: '2026-08-12', endDate: '2026-08-12', duration: 1 },
      { _id: 'period-b', startDate: '2026-08-12', endDate: '2026-08-12', duration: 1 }
    ],
    memories: [
      { _id: 'memory-a', date: '2026-08-12', note: '同一天' },
      { _id: 'memory-b', date: '2026-08-12', note: '同一天' }
    ],
    today: '2026-08-01'
  })

  const detail = state.dayDetailsByDate['2026-08-12']
  assert.deepEqual(detail.periods.map(item => item.key), ['period:period-a', 'period:period-b'])
  assert.deepEqual(detail.memories.map(item => item.key), ['memory:memory-a', 'memory:memory-b'])
})

test('buildHomeCalendarState spells out a complete aria label for stacked markers', () => {
  const periods = [
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods,
    memories: [{ date: '2026-08-10', note: '庆祝晚餐' }],
    today: '2026-08-10'
  })

  assert.equal(
    state.days.find(day => day.date === '2026-08-10').ariaLabel,
    '8月10日 周一 六月廿八 今天 欢乐时光 预测区间'
  )
  assert.equal(
    state.days.find(day => day.date === '2026-08-11').ariaLabel,
    '8月11日 周二 六月廿九 预测区间'
  )
})

test('buildHomeCalendarState aria labels cover plain days, single markers, holidays and workdays', () => {
  const august = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [period('2026-08-12', '2026-08-12')],
    memories: [],
    today: '2026-08-01'
  })
  assert.equal(
    august.days.find(day => day.date === '2026-08-12').ariaLabel,
    '8月12日 周三 六月三十 经期'
  )
  assert.equal(
    august.days.find(day => day.date === '2026-08-13').ariaLabel,
    '8月13日 周四 七月初一'
  )

  const june = buildHomeCalendarState({ year: 2026, month: 5, today: '2026-06-01' })
  assert.equal(
    june.days.find(day => day.date === '2026-06-19').ariaLabel,
    '6月19日 周五 五月初五 端午'
  )

  const january = buildHomeCalendarState({ year: 2026, month: 0, today: '2026-01-01' })
  assert.equal(
    january.days.find(day => day.date === '2026-01-04').ariaLabel,
    '1月4日 周日 冬月十六 调休上班'
  )
})

test('buildHomeCalendarState keeps long holiday names complete for screen readers and day details', () => {
  // 可视层把超长节日名裁在格子里（issue #72），读屏名称与当日详情仍用完整节日名
  const nanjing = buildHomeCalendarState({ year: 2015, month: 8, today: '2015-09-01' })
  const commemoration = nanjing.days.find(day => day.date === '2015-09-03')
  assert.equal(commemoration.holidayName, '抗日战争暨世界反法西斯战争胜利70周年纪念日')
  assert.equal(
    commemoration.ariaLabel,
    '9月3日 周四 七月廿一 抗日战争暨世界反法西斯战争胜利70周年纪念日'
  )
  const commemorationDetail = nanjing.dayDetailsByDate['2015-09-03']
  assert.deepEqual(
    commemorationDetail.meanings.map(item => [item.key, item.title]),
    [['holiday', '节日']]
  )
  assert.equal(
    commemorationDetail.meanings[0].text,
    '抗日战争暨世界反法西斯战争胜利70周年纪念日。'
  )

  const combined = buildHomeCalendarState({ year: 2020, month: 9, today: '2020-10-01' })
  const nationalDay = combined.days.find(day => day.date === '2020-10-01')
  assert.equal(nationalDay.holidayName, '国庆/中秋')
  assert.equal(nationalDay.isToday, true)
  assert.equal(nationalDay.ariaLabel, '10月1日 周四 八月十五 今天 国庆/中秋')
  const combinedDetail = combined.dayDetailsByDate['2020-10-01']
  assert.deepEqual(
    combinedDetail.meanings.map(item => item.key),
    ['today', 'holiday']
  )
  assert.equal(combinedDetail.meanings[1].text, '国庆/中秋。')
})

test('buildHomeCalendarState keeps the full leap-month lunar string in the day name', () => {
  const state = buildHomeCalendarState({
    year: 2020,
    month: 4,
    today: '2020-05-01'
  })
  const day = state.days.find(item => item.date === '2020-05-23')

  assert.equal(day.lunarText, '闰四月初一')
  assert.equal(day.ariaLabel, '5月23日 周六 闰四月初一')
})

test('buildHomeCalendarState keeps hidden non-month cells silent for screen readers', () => {
  const state = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [period('2026-08-01', '2026-08-02')],
    memories: [{ date: '2026-08-01', note: '月初记录' }],
    today: '2026-08-01'
  })

  const emptyCells = state.days.filter(day => day.isEmpty)
  assert.ok(emptyCells.length > 0, 'expected leading non-month cells in the grid')
  emptyCells.forEach(day => assert.equal(day.ariaLabel, ''))
})

test('legend items describe the real calendar rendering instead of phantom glyphs', () => {
  const state = buildHomeCalendarState({ year: 2026, month: 7, today: '2026-08-10' })
  const legend = Object.fromEntries(state.legendItems.map(item => [item.key, item]))

  assert.notEqual(legend.today.marker, '今')
  assert.match(legend.today.text, /玫瑰色光圈/)
  assert.notEqual(legend.today.marker, legend.period.marker)

  assert.notEqual(legend.holiday.marker, '节')
  assert.equal(legend.holiday.marker, '中秋')
  assert.match(legend.holiday.text, /真实节日名称/)

  assert.equal(legend.period.marker, '●')
  assert.equal(legend.memory.marker, '♥')
})

test('buildHomeCalendarState keeps fallback detail keys stable when records are inserted', () => {
  const periodA = { startDate: '2026-08-12', endDate: '2026-08-12', duration: 1, flow: 'light' }
  const periodB = { startDate: '2026-08-12', endDate: '2026-08-12', duration: 1, flow: 'heavy' }
  const memoryA = { date: '2026-08-12', note: 'A' }
  const memoryB = { date: '2026-08-12', note: 'B' }
  const initial = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [periodA, periodB],
    memories: [memoryA, memoryB],
    today: '2026-08-01'
  }).dayDetailsByDate['2026-08-12']
  const afterInsert = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [
      { startDate: '2026-08-12', endDate: '2026-08-12', duration: 1, flow: 'medium' },
      periodA,
      periodB
    ],
    memories: [{ date: '2026-08-12', note: 'new' }, memoryA, memoryB],
    today: '2026-08-01'
  }).dayDetailsByDate['2026-08-12']

  const initialPeriodKeys = new Map(initial.periods.map(item => [item.metaText, item.key]))
  const insertedPeriodKeys = new Map(afterInsert.periods.map(item => [item.metaText, item.key]))
  assert.equal(insertedPeriodKeys.get('经量 量少'), initialPeriodKeys.get('经量 量少'))
  assert.equal(insertedPeriodKeys.get('经量 量多'), initialPeriodKeys.get('经量 量多'))

  const initialMemoryKeys = new Map(initial.memories.map(item => [item.note, item.key]))
  const insertedMemoryKeys = new Map(afterInsert.memories.map(item => [item.note, item.key]))
  assert.equal(insertedMemoryKeys.get('A'), initialMemoryKeys.get('A'))
  assert.equal(insertedMemoryKeys.get('B'), initialMemoryKeys.get('B'))
})

test('buildHomeCalendarState keeps fallback detail keys stable when records are reordered', () => {
  const crampsFirst = {
    startDate: '2026-08-12',
    endDate: '2026-08-12',
    duration: 1,
    symptoms: ['cramps', 'headache']
  }
  const headacheFirst = {
    startDate: '2026-08-12',
    endDate: '2026-08-12',
    duration: 1,
    symptoms: ['headache', 'cramps']
  }
  const initial = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [crampsFirst, headacheFirst],
    memories: [
      { date: '2026-08-12', note: 'A' },
      { date: '2026-08-12', note: 'B' }
    ],
    today: '2026-08-01'
  }).dayDetailsByDate['2026-08-12']
  const reordered = buildHomeCalendarState({
    year: 2026,
    month: 7,
    periods: [headacheFirst, crampsFirst],
    memories: [
      { date: '2026-08-12', note: 'B' },
      { date: '2026-08-12', note: 'A' }
    ],
    today: '2026-08-01'
  }).dayDetailsByDate['2026-08-12']

  const initialPeriodKeys = new Map(initial.periods.map(item => [item.metaText, item.key]))
  const reorderedPeriodKeys = new Map(reordered.periods.map(item => [item.metaText, item.key]))
  assert.equal(reorderedPeriodKeys.get('痛经、头痛'), initialPeriodKeys.get('痛经、头痛'))
  assert.equal(reorderedPeriodKeys.get('头痛、痛经'), initialPeriodKeys.get('头痛、痛经'))

  const initialMemoryKeys = new Map(initial.memories.map(item => [item.note, item.key]))
  const reorderedMemoryKeys = new Map(reordered.memories.map(item => [item.note, item.key]))
  assert.equal(reorderedMemoryKeys.get('A'), initialMemoryKeys.get('A'))
  assert.equal(reorderedMemoryKeys.get('B'), initialMemoryKeys.get('B'))
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
  const validDetails = state.dayDetailsByDate['2026-03-03']
  assert.equal(validDetails.periods.length, 1)
  assert.match(validDetails.periods[0].key, /^period:fallback:/)
  assert.deepEqual(
    { range: validDetails.periods[0].range, metaText: validDetails.periods[0].metaText },
    { range: '2026-03-03 ~ 2026-03-03', metaText: '' }
  )
  assert.equal(validDetails.memories.length, 1)
  assert.match(validDetails.memories[0].key, /^memory:fallback:/)
  assert.equal(validDetails.memories[0].note, 'valid memory')
})

function assertPeriodDetailWithoutPrediction(detail) {
  assert.ok(detail.meanings.some(item => item.key === 'period' && /经期/.test(item.title)))
  assert.equal(detail.meanings.some(item => item.key === 'predict' || /预测区间/.test(`${item.title} ${item.text}`)), false)
  assert.equal(detail.periods.length > 0, true)
}

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
