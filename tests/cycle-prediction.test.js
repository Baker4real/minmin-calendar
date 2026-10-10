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

test('period duration is the inclusive day count when stored duration conflicts with the dates', () => {
  assert.equal(typeof cycle.getPeriodDuration, 'function')

  assert.equal(cycle.getPeriodDuration({
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    duration: 99
  }), 5)
})

test('period duration stays the inclusive day count when stored duration already matches the dates', () => {
  assert.equal(cycle.getPeriodDuration({
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    duration: 5
  }), 5)
})

test('period duration has no exact value while the end date is unknown or the record is ongoing', () => {
  assert.equal(cycle.getPeriodDuration({
    startDate: '2026-08-12',
    duration: 9
  }), 0)
  assert.equal(cycle.getPeriodDuration({
    startDate: '2026-08-12',
    endDate: '',
    duration: 9
  }), 0)
  assert.equal(cycle.getPeriodDuration({
    startDate: '2026-08-12',
    endDate: '',
    status: 'ongoing',
    duration: 9
  }), 0)
})

test('predictNextPeriod counts inclusive date duration when stored duration conflicts', () => {
  const prediction = cycle.predictNextPeriod([
    { startDate: '2026-06-01', endDate: '2026-06-05', duration: 2 },
    { startDate: '2026-06-30', endDate: '2026-07-04', duration: 9 }
  ])

  assert.equal(prediction.canPredict, true)
  assert.equal(prediction.avgDuration, 5)
  assert.equal(prediction.nextStart, '2026-07-29')
  assert.equal(prediction.nextEnd, '2026-08-02')
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
    status: 'known-end',
    note: 'need rest',
    duration: 3,
    flow: 'heavy',
    symptoms: ['cramps', 'headache']
  })

  assert.deepEqual(cycle.decoratePeriod(payload), {
    ...payload,
    statusLabel: '',
    flowLabel: '量多',
    symptomLabels: ['痛经', '头痛'],
    symptomText: '痛经、头痛',
    endDateDisplay: '6月12日',
    durationText: '3天',
    dateLabel: '6月10日–6月12日',
    rangeSummary: '6月10日–6月12日'
  })
})

test('buildPeriodPayload saves an ongoing record with only a start date and no invented end', () => {
  const payload = cycle.buildPeriodPayload({
    startDate: '2026-09-20',
    endDate: '',
    status: 'ongoing',
    note: '',
    flow: 'light',
    symptoms: []
  })

  assert.deepEqual(payload, {
    startDate: '2026-09-20',
    endDate: '',
    status: 'ongoing',
    note: '',
    duration: 0,
    flow: 'light',
    symptoms: []
  })

  // 状态权威：进行中时即使带上残留结束日期也不写入
  const staleEnd = cycle.buildPeriodPayload({
    startDate: '2026-09-20',
    endDate: '2026-09-30',
    status: 'ongoing'
  })
  assert.equal(staleEnd.endDate, '')
  assert.equal(staleEnd.duration, 0)

  const unknownEnd = cycle.buildPeriodPayload({
    startDate: '2026-06-10',
    status: 'unknown-end'
  })
  assert.deepEqual(
    { endDate: unknownEnd.endDate, status: unknownEnd.status, duration: unknownEnd.duration },
    { endDate: '', status: 'unknown-end', duration: 0 }
  )

  // 已知结束且起止同一天：合法单日已完成记录
  const oneDay = cycle.buildPeriodPayload({
    startDate: '2026-06-10',
    endDate: '2026-06-10',
    status: 'known-end'
  })
  assert.equal(oneDay.duration, 1)
  assert.equal(oneDay.status, 'known-end')
})

test('getPeriodStatus treats the explicit status as authoritative and interprets legacy data conservatively', () => {
  assert.equal(cycle.getPeriodStatus({ status: 'ongoing', endDate: '' }), 'ongoing')
  assert.equal(cycle.getPeriodStatus({ status: 'ongoing', endDate: '2026-06-10' }), 'ongoing')
  assert.equal(cycle.getPeriodStatus({ status: 'unknown-end' }), 'unknown-end')
  assert.equal(cycle.getPeriodStatus({ status: 'known-end', endDate: '2026-06-10' }), 'known-end')
  // 旧记录：带合法结束日期视为已结束，缺结束日期保守解释为结束日期不详
  assert.equal(cycle.getPeriodStatus({ startDate: '2026-06-01', endDate: '2026-06-05' }), 'known-end')
  assert.equal(cycle.getPeriodStatus({ startDate: '2026-06-01', duration: 9 }), 'unknown-end')
  assert.equal(cycle.isPeriodStatus('ongoing'), true)
  assert.equal(cycle.isPeriodStatus('finished'), false)
})

test('findOngoingPeriod returns the ongoing record and projectPeriodRange never invents future dates', () => {
  const periods = [
    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' },
    { _id: 'p2', startDate: '2026-09-20', endDate: '', status: 'ongoing' },
    { _id: 'p3', startDate: '2026-08-01', endDate: '', status: 'unknown-end' }
  ]

  assert.equal(cycle.findOngoingPeriod(periods)._id, 'p2')
  assert.equal(cycle.findOngoingPeriod(periods.slice(0, 1)), null)

  // 进行中投影开始日至今天；结束日期不详只投已知开始日；已知结束保持含首尾
  assert.deepEqual(
    cycle.projectPeriodRange(periods[1], '2026-09-24'),
    { startDate: '2026-09-20', endDate: '2026-09-24', status: 'ongoing' }
  )
  assert.deepEqual(
    cycle.projectPeriodRange(periods[2], '2026-09-24'),
    { startDate: '2026-08-01', endDate: '2026-08-01', status: 'unknown-end' }
  )
  assert.deepEqual(
    cycle.projectPeriodRange(periods[0], '2026-09-24'),
    { startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }
  )
  // 开始日期晚于今天的进行中数据不投影未来
  assert.equal(cycle.projectPeriodRange({ startDate: '2026-09-30', status: 'ongoing' }, '2026-09-24'), null)
})

test('decoratePeriod exposes ongoing and unknown-end status copy instead of a blank date', () => {
  const ongoing = cycle.decoratePeriod(
    { _id: 'p2', startDate: '2026-09-20', endDate: '', status: 'ongoing' },
    { today: '2026-09-24' }
  )
  assert.equal(ongoing.statusLabel, '进行中')
  assert.equal(ongoing.endDateDisplay, '9月24日')
  assert.equal(ongoing.durationText, '进行中')
  assert.equal(ongoing.dateLabel, '9月20日–9月24日')
  assert.equal(ongoing.rangeSummary, '9月20日–9月24日，进行中')
  assert.equal(ongoing.duration, 0)

  const unknownEnd = cycle.decoratePeriod({ _id: 'p3', startDate: '2026-08-01', endDate: '' })
  assert.equal(unknownEnd.statusLabel, '结束日期不详')
  assert.equal(unknownEnd.endDateDisplay, '结束日期不详')
  assert.equal(unknownEnd.durationText, '结束日期不详')
  assert.equal(unknownEnd.dateLabel, '8月1日，结束日期不详')
  assert.equal(unknownEnd.rangeSummary, '8月1日，结束日期不详')
  assert.equal(unknownEnd.duration, 0)
})

test('an ongoing start counts as a cycle start but never contributes an exact duration', () => {
  const history = [
    period('2026-06-01', '2026-06-05'),
    period('2026-06-29', '2026-07-03'),
    period('2026-07-27', '2026-07-31')
  ]
  const withOngoing = [
    ...history,
    { startDate: '2026-09-20', endDate: '', status: 'ongoing', duration: 99 }
  ]

  const prediction = cycle.predictNextPeriod(withOngoing)

  // 进行中的开始日参与周期起点：lastStart 推到 2026-09-20，
  // 到它的 55 天间隔被稳定性过滤忽略，周期长度沿用历史 28 天
  assert.equal(prediction.canPredict, true)
  assert.equal(prediction.nextStart, '2026-10-18')
  assert.equal(prediction.usedCycleCount, 2)
  // 未完成记录不进精确时长：持续时长仍来自已完成历史的中位数 5
  assert.equal(prediction.avgDuration, 5)
})

test('predicted duration prefers the configured typical length over the completed-history median', () => {
  // 已完成历史时长中位数是 5，用户设置 3 天时以设置优先
  const prediction = cycle.predictNextPeriod(
    [
      period('2026-06-01', '2026-06-05'),
      period('2026-06-29', '2026-07-03')
    ],
    { typicalPeriodLength: 3 }
  )

  assert.equal(prediction.canPredict, true)
  assert.equal(prediction.avgDuration, 3)
  assert.equal(prediction.durationSource, 'manual')
  // 预测结束日按 3 天推：07-27 开始，07-29 结束
  assert.equal(prediction.nextStart, '2026-07-27')
  assert.equal(prediction.nextEnd, '2026-07-29')
})

test('predicted duration uses the completed-history median when no typical length is configured', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-06-01', '2026-06-03'),
    period('2026-06-29', '2026-07-05')
  ])

  assert.equal(prediction.canPredict, true)
  assert.equal(prediction.avgDuration, 5)
  assert.equal(prediction.durationSource, 'history')
  assert.equal(prediction.nextStart, '2026-07-27')
  assert.equal(prediction.nextEnd, '2026-07-31')
})

test('a one-day completed record still contributes its single exact day to the median', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-06-01', '2026-06-01'),
    period('2026-06-29', '2026-07-03')
  ])

  // 已完成时长 1 与 5 的中位数是 3：单日记录不被当成未知，也不被夸大
  assert.equal(prediction.avgDuration, 3)
  assert.equal(prediction.durationSource, 'history')
})

test('predicted duration falls back to the five-day default when no completed duration exists', () => {
  const prediction = cycle.predictNextPeriod([
    { startDate: '2026-06-01', endDate: '', status: 'unknown-end', duration: 9 },
    { startDate: '2026-06-29', endDate: '', status: 'unknown-end', duration: 9 }
  ])

  // 只有结束日期不详的记录：开始日可当周期起点，但存库时长 9 不进预测，落在默认档
  assert.equal(prediction.canPredict, true)
  assert.equal(prediction.avgDuration, 5)
  assert.equal(prediction.durationSource, 'default')
  assert.equal(prediction.nextEnd, '2026-07-31')
})

test('an unknown-end start anchors the cycle but its stored duration never enters the median', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-06-01', '2026-06-05'),
    period('2026-06-29', '2026-07-03'),
    period('2026-07-27', '2026-07-31'),
    { startDate: '2026-08-24', endDate: '', status: 'unknown-end', duration: 9 }
  ])

  // 结束日期不详的开始日推进最近起点到 08-24，预测从它起算
  assert.equal(prediction.nextStart, '2026-09-21')
  // 预测持续时长只来自已完成历史 5、5、5，不含存库的 9
  assert.equal(prediction.avgDuration, 5)
  assert.equal(prediction.durationSource, 'history')
})

test('predictNextPeriod invents nothing without history and keeps a single record unpreditable', () => {
  const noHistory = cycle.predictNextPeriod([])
  assert.equal(noHistory.canPredict, false)
  assert.equal(noHistory.avgDuration, null)
  assert.equal(noHistory.durationSource, null)
  assert.equal(noHistory.nextEnd, null)

  // 仅一条历史：没有周期间隔，不产出预测结束日，也不编造持续天数
  const single = cycle.predictNextPeriod([period('2026-06-01', '2026-06-05')])
  assert.equal(single.canPredict, false)
  assert.equal(single.avgDuration, null)
  assert.equal(single.nextEnd, null)
})

test('prediction never writes a predicted end date back onto period records', () => {
  const periods = [
    period('2026-06-01', '2026-06-05'),
    period('2026-06-29', '2026-07-03'),
    { _id: 'p-ongoing', startDate: '2026-09-20', endDate: '', status: 'ongoing', duration: 0 }
  ]
  const snapshot = JSON.parse(JSON.stringify(periods))

  const prediction = cycle.predictNextPeriod(periods)

  // 预测结束日只存在于预测对象；进行中记录仍无结束日期、时长仍为 0
  assert.equal(prediction.canPredict, true)
  assert.ok(prediction.nextEnd)
  assert.deepEqual(periods, snapshot)
  assert.equal(periods[2].endDate, '')
  assert.equal(periods[2].duration, 0)
  assert.notEqual(periods[2].endDate, prediction.nextEnd)
})

test('buildOngoingCompletionReminder prefers the configured typical length over the history median', () => {
  assert.equal(typeof cycle.buildOngoingCompletionReminder, 'function')

  const periods = [
    period('2026-06-01', '2026-06-05'),
    { _id: 'p-ongoing', startDate: '2026-06-20', endDate: '', status: 'ongoing', duration: 0 }
  ]

  // 用户配置 3 天：进行到第 4 天（06-23）已超过 3 天 → 提示，预期按配置
  const reminded = cycle.buildOngoingCompletionReminder(periods, {
    today: '2026-06-23',
    typicalPeriodLength: 3
  })
  assert.equal(reminded.type, 'ongoing-overdue')
  assert.equal(reminded.title, '经期还未结束')
  assert.equal(reminded.text, '已进行 4 天，超过预期的 3 天，可以补填结束日期')
  assert.equal(reminded.expectedDays, 3)
  assert.equal(reminded.expectedSource, 'manual')
  assert.equal(reminded.runningDays, 4)
  assert.equal(reminded.record._id, 'p-ongoing')
  assert.equal(reminded.recordKey, 'p-ongoing')
  assert.equal(reminded.date, '2026-06-23')

  // 同一天但不带配置：已完成历史中位数 5 天，第 4 天未超过 → 不提示
  assert.equal(cycle.buildOngoingCompletionReminder(periods, { today: '2026-06-23' }), null)
})

test('buildOngoingCompletionReminder uses the recent completed-duration median as the threshold', () => {
  const periods = [
    period('2026-05-01', '2026-05-03'), // 3 天
    period('2026-06-01', '2026-06-05'), // 5 天
    period('2026-07-01', '2026-07-08'), // 8 天
    { _id: 'p-ongoing', startDate: '2026-08-01', endDate: '', status: 'ongoing', duration: 0 }
  ]

  // 中位数 5：第 5 天（08-05）仍未「超过」，第 6 天（08-06）超过 → 提示
  assert.equal(cycle.buildOngoingCompletionReminder(periods, { today: '2026-08-05' }), null)
  const reminded = cycle.buildOngoingCompletionReminder(periods, { today: '2026-08-06' })
  assert.equal(reminded.expectedDays, 5)
  assert.equal(reminded.expectedSource, 'history')
  assert.equal(reminded.runningDays, 6)
})

test('buildOngoingCompletionReminder falls back to the five-day default without completed history', () => {
  // 无已完成历史：只有结束日期不详与进行中，存库 duration 9 不被当作完成时长
  const periods = [
    { startDate: '2026-08-01', endDate: '', status: 'unknown-end', duration: 9 },
    { _id: 'p-ongoing', startDate: '2026-08-05', endDate: '', status: 'ongoing', duration: 9 }
  ]

  // 默认 5 天：第 5 天（08-09）未超过，第 6 天（08-10）超过 → 提示
  assert.equal(cycle.buildOngoingCompletionReminder(periods, { today: '2026-08-09' }), null)
  const reminded = cycle.buildOngoingCompletionReminder(periods, { today: '2026-08-10' })
  assert.equal(reminded.expectedDays, 5)
  assert.equal(reminded.expectedSource, 'default')
  assert.equal(reminded.recordKey, 'p-ongoing')

  // 只有这条进行中记录（自身存库 duration 99）：无已完成历史仍落默认档，自身不参与计算
  const only = [{ _id: 'p1', startDate: '2026-09-20', endDate: '', status: 'ongoing', duration: 99 }]
  const remindedAlone = cycle.buildOngoingCompletionReminder(only, { today: '2026-09-26' })
  assert.equal(remindedAlone.expectedDays, 5)
  assert.equal(remindedAlone.expectedSource, 'default')
  assert.equal(remindedAlone.runningDays, 7)
})

test('no completion reminder without an ongoing record or before exceeding the expected duration', () => {
  const completed = [period('2026-06-01', '2026-06-05')]
  assert.equal(cycle.buildOngoingCompletionReminder(completed, { today: '2026-06-10' }), null)
  assert.equal(cycle.buildOngoingCompletionReminder([], { today: '2026-06-10' }), null)

  // 进行中第 5 天恰好等于默认预期 5 天：未「超过」不提示
  const ongoing = [{ _id: 'p1', startDate: '2026-06-01', endDate: '', status: 'ongoing' }]
  assert.equal(cycle.buildOngoingCompletionReminder(ongoing, { today: '2026-06-05' }), null)

  // 没有 _id 的进行中记录用开始日作为一次性标记的键
  const idLess = [{ startDate: '2026-06-01', endDate: '', status: 'ongoing' }]
  const keyed = cycle.buildOngoingCompletionReminder(idLess, { today: '2026-06-08' })
  assert.equal(keyed.recordKey, '2026-06-01')
})

test('the completion reminder never writes an end date or closes the ongoing record', () => {
  const periods = [
    period('2026-06-01', '2026-06-05'),
    { _id: 'p-ongoing', startDate: '2026-06-20', endDate: '', status: 'ongoing', duration: 0 }
  ]
  const snapshot = JSON.parse(JSON.stringify(periods))

  const reminder = cycle.buildOngoingCompletionReminder(periods, { today: '2026-06-30' })

  assert.ok(reminder, 'expected the overdue reminder')
  assert.deepEqual(periods, snapshot)
  assert.equal(periods[1].endDate, '')
  assert.equal(periods[1].status, 'ongoing')
  assert.equal(periods[1].duration, 0)
  // 提示携带的是原记录引用本身，供页面打开同一条记录，不含任何写入
  assert.equal(reminder.record, periods[1])
})

test('describeKnownPeriodLength counts inclusive days and flags spans past the completion-reminder threshold', () => {
  assert.equal(typeof cycle.describeKnownPeriodLength, 'function')

  const periods = [
    period('2026-05-01', '2026-05-03'),
    period('2026-06-01', '2026-06-05'),
    period('2026-07-01', '2026-07-08')
  ]
  const snapshot = JSON.parse(JSON.stringify(periods))

  const within = cycle.describeKnownPeriodLength({
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    periods
  })
  assert.deepEqual(within, {
    days: 5,
    text: '共 5 天',
    exceedsExpected: false,
    expectedDays: 5,
    expectedSource: 'history',
    hint: ''
  })

  const over = cycle.describeKnownPeriodLength({
    startDate: '2026-08-01',
    endDate: '2026-08-06',
    periods
  })
  assert.equal(over.days, 6)
  assert.equal(over.text, '共 6 天')
  assert.equal(over.exceedsExpected, true)
  assert.equal(over.expectedDays, 5)
  assert.equal(over.expectedSource, 'history')
  assert.equal(over.hint, '超过预期的 5 天，请核对结束日期')

  const manual = cycle.describeKnownPeriodLength({
    startDate: '2026-08-01',
    endDate: '2026-08-04',
    periods,
    typicalPeriodLength: 3
  })
  assert.equal(manual.expectedDays, 3)
  assert.equal(manual.expectedSource, 'manual')
  assert.equal(manual.days, 4)
  assert.equal(manual.hint, '超过预期的 3 天，请核对结束日期')

  const unknownOnly = [
    { startDate: '2026-08-01', endDate: '', status: 'unknown-end', duration: 9 }
  ]
  const atDefault = cycle.describeKnownPeriodLength({
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    periods: unknownOnly
  })
  assert.equal(atDefault.expectedDays, 5)
  assert.equal(atDefault.expectedSource, 'default')
  assert.equal(atDefault.exceedsExpected, false)
  assert.equal(atDefault.hint, '')

  const overDefault = cycle.describeKnownPeriodLength({
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    periods: unknownOnly
  })
  assert.equal(overDefault.days, 6)
  assert.equal(overDefault.hint, '超过预期的 5 天，请核对结束日期')

  const open = cycle.describeKnownPeriodLength({
    startDate: '2026-09-01',
    endDate: '',
    periods
  })
  assert.equal(open.days, 0)
  assert.equal(open.text, '')
  assert.equal(open.hint, '')
  assert.equal(open.exceedsExpected, false)

  assert.deepEqual(periods, snapshot)
})

test('buildPeriodQuickAction names the ongoing period day and otherwise stays a plain record action', () => {
  assert.equal(typeof cycle.buildPeriodQuickAction, 'function')

  const periods = [
    period('2026-06-01', '2026-06-05'),
    { _id: 'p2', startDate: '2026-06-20', endDate: '', status: 'ongoing', duration: 0 }
  ]
  const snapshot = JSON.parse(JSON.stringify(periods))

  assert.deepEqual(cycle.buildPeriodQuickAction(periods, { today: '2026-06-26' }), {
    label: '经期第 7 天 · 记结束',
    ariaLabel: '经期第 7 天 · 记结束',
    mode: 'complete'
  })
  assert.deepEqual(cycle.buildPeriodQuickAction([
    { _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05', status: 'known-end' }
  ], { today: '2026-06-26' }), {
    label: '记经期',
    ariaLabel: '记经期',
    mode: 'add'
  })
  assert.deepEqual(cycle.buildPeriodQuickAction([
    { _id: 'future', startDate: '2026-06-30', endDate: '', status: 'ongoing' }
  ], { today: '2026-06-26' }), {
    label: '记结束',
    ariaLabel: '记结束',
    mode: 'complete'
  })
  assert.deepEqual(periods, snapshot)
  assert.equal(periods[1].endDate, '')
  assert.equal(periods[1].status, 'ongoing')
})

test('buildSymptomOptions groups every symptom into exactly one body or emotion group', () => {
  assert.equal(typeof cycle.buildSymptomOptions, 'function')

  const groups = cycle.buildSymptomOptions(['mood'])

  assert.deepEqual(
    groups.map(group => ({ key: group.key, label: group.label })),
    [
      { key: 'body', label: '身体' },
      { key: 'emotion', label: '情绪' }
    ]
  )

  const flattened = groups.flatMap(group => group.options)
  assert.deepEqual(
    flattened.map(option => option.value),
    cycle.SYMPTOM_OPTIONS.map(option => option.value)
  )

  assert.deepEqual(
    groups[0].options.map(option => option.value),
    ['cramps', 'headache', 'tired', 'acne']
  )
  assert.deepEqual(
    groups[1].options.map(option => option.value),
    ['mood', 'sleep', 'cravings']
  )

  assert.equal(flattened.find(option => option.value === 'mood').selected, true)
  assert.equal(flattened.find(option => option.value === 'cramps').selected, false)
})

test('home status line says which day of the current period it is', () => {
  assert.equal(typeof cycle.buildHomeStatusLine, 'function')

  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    { startDate: '2026-07-13', endDate: '', status: 'ongoing' }
  ]

  assert.deepEqual(cycle.buildHomeStatusLine(periods, { today: '2026-07-15' }), {
    status: 'in-period',
    text: '经期第 3 天',
    tone: 'default'
  })
})

test('home status line counts a finished period that still includes today', () => {
  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-08-08', '2026-08-12')
  ]

  assert.deepEqual(cycle.buildHomeStatusLine(periods, { today: '2026-08-10' }), {
    status: 'in-period',
    text: '经期第 3 天',
    tone: 'default'
  })
})

test('home status line counts down to the predicted start before the window', () => {
  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]

  assert.deepEqual(cycle.buildHomeStatusLine(periods, { today: '2026-08-01' }), {
    status: 'before-window',
    text: '预计 8月10日 开始 · 还有 9 天',
    tone: 'default'
  })
})

test('home status line uses the shared date format when the predicted start is next year', () => {
  assert.deepEqual(cycle.buildHomeStatusLine([], {
    today: '2026-12-01',
    prediction: {
      canPredict: true,
      nextStart: '2027-01-05',
      rangeStart: '2027-01-03',
      rangeEnd: '2027-01-07'
    }
  }), {
    status: 'before-window',
    text: '预计 2027年1月5日 开始 · 还有 35 天',
    tone: 'default'
  })
})

test('home status line says the period may start once today is inside the window', () => {
  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]

  assert.deepEqual(cycle.buildHomeStatusLine(periods, { today: '2026-08-10' }), {
    status: 'in-window',
    text: '这几天可能开始',
    tone: 'default'
  })
})

test('home status line says how many days late in a neutral tone after the window', () => {
  const periods = [
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ]

  assert.deepEqual(cycle.buildHomeStatusLine(periods, { today: '2026-08-12' }), {
    status: 'late',
    text: '比预计晚 2 天',
    tone: 'neutral'
  })
})

test('home status line asks for more records when a prediction is not possible', () => {
  assert.deepEqual(
    cycle.buildHomeStatusLine([period('2026-06-01', '2026-06-05')], { today: '2026-08-01' }),
    {
      status: 'insufficient',
      text: '多记几次后就能预测',
      tone: 'default'
    }
  )
  assert.deepEqual(cycle.buildHomeStatusLine([], { today: '2026-08-01' }), {
    status: 'insufficient',
    text: '多记几次后就能预测',
    tone: 'default'
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
