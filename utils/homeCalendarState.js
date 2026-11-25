const util = require('./util')
const cycle = require('./cycle')
const periodCoverage = require('./periodCoverage')
const calendarInsights = require('./calendarInsights')
const recordEditRoute = require('./recordEditRoute')
const { hasPublishedHolidayYear } = require('./chinaHolidays')

// 单日经期色带样本：图例「经期记录」和首页「记经期」、当日弹层的经期动作画的是同一段色带（issue #159）
const PERIOD_BAND_SAMPLE = {
  cellClass: 'period period-single',
  parts: [{ kind: 'band', className: 'period-band', text: '' }]
}

const CALENDAR_LEGEND_ITEMS = [
  {
    key: 'today',
    title: '今天',
    text: '日期外的浅玫瑰色小胶囊表示今天，胶囊描着细薰衣草边；经期中的今天也保留这枚胶囊。',
    cellClass: 'today',
    parts: [{ kind: 'num', className: 'day-num', text: '8' }]
  },
  {
    key: 'period',
    title: '经期记录',
    text: '连续的玫瑰色带表示这一天有经期记录。',
    ...PERIOD_BAND_SAMPLE
  },
  {
    key: 'memory',
    title: '欢乐时光',
    text: '爱心表示这一天留下了欢乐时光。',
    cellClass: '',
    parts: [{ kind: 'mark', className: 'mark memory-mark', text: '♥' }]
  },
  {
    key: 'predict',
    title: '下次可能开始的日子',
    text: '金色「预」表示下次可能开始的日子。',
    cellClass: '',
    parts: [{ kind: 'mark', className: 'mark predict-mark', text: '预' }]
  },
  {
    key: 'holiday',
    title: '节日',
    text: '金色文字写出当天的真实节日名称，如「中秋」。',
    cellClass: '',
    parts: [{ kind: 'tag', className: 'day-tag holiday-tag', text: '中秋' }]
  },
  {
    key: 'workday',
    title: '调休上班',
    text: '“班”表示官方调休上班日。',
    cellClass: '',
    parts: [{ kind: 'tag', className: 'day-tag workday-tag', text: '班' }]
  }
]

const UNSYNCED_PERIODS_TEXT = '经期未同步，暂不预测'

// periodsSynced / memoriesSynced：该集合在这个房间里是否成功同步过一次。投影在这里统一解释未同步：
// 本地标记、记录详情与小结保留；经期不报第几天、不预测；任一集合未同步都保留小结入口。
// recordChange：这次投影带来的那条记录变化 { collection, mode, record, before }（before 是变化前的那个集合），
// 投影据此给出记录成功反馈 recordFeedback（日期 → memory / period / both，issue #167、#222）；没有变化就是空表
function buildHomeCalendarState({
  year,
  month,
  periods = [],
  memories = [],
  today = util.formatDate(new Date()),
  roomPaired = false,
  periodsSynced = true,
  memoriesSynced = true,
  recordChange = null,
  newRecordIds = []
}) {
  const prediction = cycle.predictNextPeriod(periodsSynced ? periods : [], { today })
  const predictionWindow = prediction.canPredict
    ? {
        rangeStart: prediction.rangeStart,
        rangeEnd: prediction.rangeEnd
      }
    : null
  const days = buildHomeCalendarDays({
    year,
    month,
    periods,
    memories,
    predictionWindow,
    today,
    periodsSynced
  })
  const monthlyRecap = calendarInsights.buildMonthlyRecap({
    year,
    month,
    periods,
    memories,
    prediction,
    today
  })
  let homeStatus = withHomeStatusAria(cycle.buildHomeStatusLine(periods, { today, prediction }))
  let predictionExplanation = calendarInsights.buildPredictionExplanation(prediction, periods, { today })
  if (!periodsSynced) {
    homeStatus = withHomeStatusAria({ status: 'unsynced', text: UNSYNCED_PERIODS_TEXT, countdownText: '', tone: 'neutral' })
    const lines = ['经期同步后再按记录估算']
    predictionExplanation = {
      available: false,
      title: predictionExplanation.title,
      summary: UNSYNCED_PERIODS_TEXT,
      lines,
      lineItems: [{ key: 'prediction:0', text: lines[0] }]
    }
    monthlyRecap.periodSummary = '本月经期未同步'
    monthlyRecap.predictionSummary = UNSYNCED_PERIODS_TEXT
  }
  if (!memoriesSynced) monthlyRecap.memorySummary = '本月欢乐时光未同步'
  if (!periodsSynced || !memoriesSynced) {
    monthlyRecap.summaryLine = `本月 ${periodsSynced ? `经期 ${util.formatQuantity(monthlyRecap.periodDays, '天')}` : '经期未同步'} · ${memoriesSynced ? `欢乐时光 ${util.formatQuantity(monthlyRecap.memoryCount, '条')}` : '欢乐时光未同步'}`
    monthlyRecap.shareText = [monthlyRecap.title, monthlyRecap.periodSummary, monthlyRecap.memorySummary,
      monthlyRecap.predictionSummary, ...monthlyRecap.highlights].filter(Boolean).join('\n')
  }

  const quickEntry = buildPeriodQuickEntry(periods, { today, periodsSynced, roomPaired })
  const feedbackChanges = newRecordIds.map(({ collection, id }) => ({
    collection,
    mode: 'add',
    record: { _id: id },
    before: []
  }))
  if (recordChange) feedbackChanges.push(recordChange)

  const todayDate = util.parseDate(today)
  return {
    hasRecords: periods.length > 0 || memories.length > 0 || !periodsSynced || !memoriesSynced,
    showBackToToday: year !== todayDate.getFullYear() || month !== todayDate.getMonth(),
    periodQuickLabel: quickEntry.label,
    periodQuickAriaLabel: quickEntry.ariaLabel,
    periodQuickAction: quickEntry.action,
    memoryQuickAction: { url: recordEditRoute.buildMemoryEditUrl({ date: today }) },
    legendItems: CALENDAR_LEGEND_ITEMS,
    periodBandSample: PERIOD_BAND_SAMPLE,
    predictionExplanation,
    homeStatus,
    monthSummaryLine: monthlyRecap.summaryLine,
    monthlyRecap,
    days,
    recordFeedback: buildRecordFeedback(days, feedbackChanges, { periods, memories, today }),
    dayDetailsByDate: buildDayDetailsByDate(days, periods, memories, today, roomPaired)
  }
}

function withHomeStatusAria(homeStatus) {
  return {
    ...homeStatus,
    ariaLabel: [homeStatus.text, homeStatus.countdownText, '点按查看预测说明'].filter(Boolean).join('，')
  }
}

// 首页与记录 tab 共用同一个经期快捷入口投影。没有进行中时始终按今天新建；有进行中时打开同一条并带记结束意图。
function buildPeriodQuickEntry(periods, { today, periodsSynced = true, roomPaired = false } = {}) {
  const quickAction = cycle.buildPeriodQuickAction(periods, { today })
  const label = periodsSynced ? quickAction.label : quickAction.mode === 'complete' ? '记结束' : '记经期'
  return {
    label,
    ariaLabel: label,
    mode: quickAction.mode,
    action: quickAction.mode === 'complete'
      ? buildPeriodEntry(periods, today, today, { completeOngoing: true, roomPaired })
      : { url: recordEditRoute.buildPeriodEditUrl({ startDate: today }) }
  }
}

// 记录成功反馈（issue #167）只认真正新增或完成的那条记录：新增的欢乐时光；新增的经期，或给没有结束日的经期
// （进行中、结束日期不详）填上结束日（ADR 0007：填写结束日期完成同一条记录）。
// 反馈落在当月显示这条记录的格子上：欢乐时光是那一天的 ♥，经期是它投影出的每一格色带
function buildRecordFeedback(days, change, { periods, memories, today }) {
  const marked = {}
  const changes = Array.isArray(change) ? change : [change]
  for (const item of changes) {
    const id = recordIdentity(item && item.record)
    const after = !item ? null : item.collection === 'periods' ? periods : item.collection === 'memories' ? memories : null
    if (!id || !after) continue
    const previous = (item.before || []).find(record => recordIdentity(record) === id) || null
    const saved = after.find(record => recordIdentity(record) === id) || null
    const kind = recordFeedbackKind(item.collection, previous, saved, item.mode)
    const band = kind === 'period' ? periodCoverage.projectPeriodRange(saved, today) : null
    days.forEach(day => {
      if (!day || day.isEmpty || !day.date) return
      if (kind === 'memory' && day.isMemory && day.date === saved.date) markRecordFeedback(marked, day.date, 'memory')
      if (band && day.isPeriod && isPeriodActiveOnDate(band, day.date)) markRecordFeedback(marked, day.date, 'period')
    })
  }
  return marked
}

function markRecordFeedback(marked, date, kind) {
  const current = marked[date]
  marked[date] = current && current !== kind ? 'both' : kind
}

function recordFeedbackKind(collection, previous, saved, mode) {
  if (!saved) return ''
  if (collection === 'memories') return mode === 'add' && !previous ? 'memory' : ''
  if (mode === 'add') return previous ? '' : 'period'
  if (mode !== 'update' || !previous) return ''
  return periodCoverage.getPeriodStatus(previous) !== 'known-end' && periodCoverage.getPeriodStatus(saved) === 'known-end' ? 'period' : ''
}

function buildHomeCalendarDays({ year, month, periods, memories, predictionWindow, today, periodsSynced }) {
  const periodDates = periodCoverage.getMonthCoverage(periods, year, month, today).dates
  const memoryDates = new Set(memories
    .map(memory => memory.date)
    .filter(isDateString))
  const predictDates = collectPredictDates(year, month, predictionWindow)

  const days = util.buildCalendarDays({ year, month }).map(day => {
    if (!day || day.isEmpty) return { ...day, ariaLabel: '' }
    const isPeriod = periodDates.has(day.date)
    const owner = isPeriod ? periodCoverage.getPeriodOnDate(periods, day.date, today) : null
    const marked = {
      ...day,
      isToday: day.date === today,
      isPeriod,
      isOngoingPeriod: !!owner && owner.status === 'ongoing',
      isUnknownEndPeriod: !!owner && owner.status === 'unknown-end',
      isMemory: memoryDates.has(day.date),
      isPredict: predictDates.has(day.date) && !isPeriod,
      lunarCellText: lunarCellLabel(day.lunarText),
      periodDayCount: periodsSynced && owner ? owner.day : 0
    }
    return { ...marked, ariaLabel: buildDayAriaLabel(marked, today) }
  })
  return applyPeriodSegments(days, today)
}

// 同一行里相邻的经期日连成一段；换行处不跨行相连，行首行尾因此收口。
// 开放端只打在进行中经期投影到今天的那一格。
function applyPeriodSegments(days, today) {
  const periodSlots = new Set()
  days.forEach((day, index) => {
    if (day && !day.isEmpty && day.isPeriod) periodSlots.add(index)
  })
  return days.map((day, index) => {
    if (!day || day.isEmpty || !day.isPeriod) {
      return { ...day, periodSegment: 'none', periodOpenEnd: false }
    }
    const row = Math.floor(index / 7)
    const prevContinues = index > 0 && periodSlots.has(index - 1) && Math.floor((index - 1) / 7) === row
    const nextContinues = periodSlots.has(index + 1) && Math.floor((index + 1) / 7) === row
    let periodSegment = 'single'
    if (prevContinues && nextContinues) periodSegment = 'middle'
    else if (nextContinues) periodSegment = 'start'
    else if (prevContinues) periodSegment = 'end'
    return {
      ...day,
      periodSegment,
      periodOpenEnd: Boolean(day.isOngoingPeriod && day.date === today)
    }
  })
}

function collectPredictDates(year, month, predictionWindow) {
  const predictDates = new Set()
  if (!predictionWindow) return predictDates
  const date = util.parseDate(predictionWindow.rangeStart)
  const end = util.parseDate(predictionWindow.rangeEnd)
  while (date <= end) {
    if (date.getMonth() === month && date.getFullYear() === year) predictDates.add(util.formatDate(date))
    date.setDate(date.getDate() + 1)
  }
  return predictDates
}

function isDateString(value) {
  return util.isValidDateString(value)
}

function buildDayDetailsByDate(days, periods, memories, today, roomPaired = false) {
  const details = {}
  const periodRanges = periods.map(period => periodCoverage.projectPeriodRange(period, today))
  const periodKeys = buildStableDetailKeys(periods, 'period',
    (period, index) => buildPeriodDetailFingerprint(period, today, periodRanges[index]))
  const memoryKeys = buildStableDetailKeys(memories, 'memory', buildMemoryDetailFingerprint)

  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return

    const periodDetails = periods
      .map((period, index) => ({ period, range: periodRanges[index], index }))
      .filter(item => isPeriodActiveOnDate(item.range, day.date))
      .map(({ period, range, index }) => {
        const detail = cycle.decoratePeriod({
          ...period,
          startDate: range.startDate,
          endDate: range.endDate
        }, { today, projectedRange: range })
        const meta = []
        if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
        if (detail.symptomText) meta.push(detail.symptomText)
        const authorLabel = cycle.recordAuthorLabel(period, { paired: roomPaired === true })
        const note = cycle.recordNoteSummary(period.note)
        return withAuthorLabel({
          key: periodKeys[index],
          recordId: recordIdentity(period),
          ...describePeriodDetail(range, authorLabel, today, note),
          note,
          metaText: meta.join(' · ')
        }, authorLabel)
      })

    const memoryDetails = memories
      .map((memory, index) => ({ memory, index }))
      .filter(({ memory }) => isDateString(memory.date) && memory.date === day.date)
      .map(({ memory, index }) => {
        const authorLabel = cycle.recordAuthorLabel(memory, { paired: roomPaired === true })
        return withAuthorLabel({
          key: memoryKeys[index],
          recordId: recordIdentity(memory),
          note: memory.note || '欢乐时光',
          ariaLabel: cycle.memoryEditAriaLabel({
            dateText: util.formatDisplayDate(memory.date, { today }),
            note: memory.note,
            authorLabel
          })
        }, authorLabel)
      })
    const meanings = buildDayMeanings(day).filter(isDayDetailSentence)

    const isFuture = day.date > today
    const periodAction = isFuture ? null : buildPeriodEntry(periods, day.date, today, { completeOngoing: true, roomPaired })
    details[day.date] = {
      title: util.formatDisplayDate(day.date, { today, withWeekday: true }),
      subtitle: [day.lunarText, day.holidayName].filter(Boolean).join(' · '),
      isFuture,
      periodAction,
      memoryAction: isFuture ? null : { url: recordEditRoute.buildMemoryEditUrl({ date: day.date }) },
      meanings,
      periods: periodDetails,
      memories: memoryDetails,
      actions: buildDayRecordActions(day, today, day.isPeriod),
      futureNotice: buildFutureDayNotice(day, today)
    }
  })

  return details
}

// 按日期的经期入口只转译归属 module 的完整落点，路由默认值由 recordEditRoute 持有。
function buildPeriodEntry(periods, date, today, { completeOngoing = false, roomPaired = false } = {}) {
  const decision = periodCoverage.decidePeriodRecordForDate(periods, date, { today })
  const record = decision.action === 'open' ? decision.record : { startDate: decision.startDate }
  const routedRecord = withAuthorLabel(record, cycle.recordAuthorLabel(record, { paired: roomPaired }))
  return {
    url: recordEditRoute.buildPeriodEditUrl(routedRecord,
      completeOngoing && decision.reason === 'ongoing' ? { intent: 'complete', today } : undefined)
  }
}

function withAuthorLabel(row, authorLabel) {
  if (!authorLabel) return row
  return { ...row, authorLabel }
}

function recordIdentity(record) {
  if (!record) return ''
  return record._id || record.id || ''
}

function isDayDetailSentence(meaning) {
  return meaning.key === 'predict' || meaning.key === 'holiday' || meaning.key === 'workday'
}

// 经期的编辑动作只有一个名字（CONTEXT.md「Record names」）：详情行读屏名使用这个领域动作名
const PERIOD_EDIT_ACTION = '编辑这次经期'

function buildDayRecordActions(day, today, suppressPeriod = false) {
  if (!day.date || day.date > today) return []
  const actions = []
  if (!suppressPeriod) {
    actions.push({
      key: 'period',
      label: day.date === today ? '记经期' : '补记经期'
    })
  }
  actions.push({
    key: 'memory',
    label: day.date === today ? '记欢乐时光' : '补记欢乐时光'
  })
  return actions
}

// 晚于今天的日子没有记录动作；当日弹层用这句持久说明给出下一步，不再只剩标题和关闭键
function buildFutureDayNotice(day, today) {
  if (!day.date || day.date <= today) return null
  return {
    title: '未来日期不能新增记录',
    text: '到了这一天，再来记经期或欢乐时光'
  }
}

function isPeriodActiveOnDate(range, date) {
  if (!range) return false
  return date >= range.startDate && date <= range.endDate
}

// 经期详情行：日期和状态各只算一次。进行中写「开始日至今天」，结束日期不详只写开始日、不用空白日期表达；
// 状态文字只取 cycle.PERIOD_STATUS_OPTIONS。可见行把进行中、结束日期不详写进括号（已结束不加），
// 读屏名（issue #157）说全三种状态并接上作者（作者只在房间已配对时有值），同一天的多条各自可辨
function describePeriodDetail(range, authorLabel, today, noteSummary = '') {
  const dates = range.status === 'unknown-end'
    ? util.formatDisplayDate(range.startDate, { today })
    : util.formatDisplayDateRange(range.startDate, range.endDate, { today })
  const status = periodStatusText(range.status)
  return {
    range: range.status === 'known-end' ? dates : `${dates}（${status}）`,
    ariaLabel: joinAriaParts([PERIOD_EDIT_ACTION, dates, status, authorLabel, noteSummary])
  }
}

function periodStatusText(status) {
  const option = cycle.PERIOD_STATUS_OPTIONS.find(item => item.value === status)
  return option ? option.label : ''
}

// 空的部分直接跳过，不留多余的逗号
function joinAriaParts(parts) {
  return parts.filter(Boolean).join('，')
}

function buildStableDetailKeys(records, type, buildFingerprint) {
  const occurrences = new Map()
  return records.map((record, index) => {
    if (record && record._id) return `${type}:${record._id}`

    const fingerprint = encodeURIComponent(JSON.stringify(buildFingerprint(record || {}, index)))
    const occurrence = occurrences.get(fingerprint) || 0
    occurrences.set(fingerprint, occurrence + 1)
    return `${type}:fallback:${fingerprint}:${occurrence}`
  })
}

function buildPeriodDetailFingerprint(period, today, range) {
  const projectedRange = range || {}
  const detail = cycle.decoratePeriod(period, { today, projectedRange: range })
  return [
    projectedRange.startDate || '',
    projectedRange.endDate || '',
    detail.status || '',
    normalizeKeyText(period.note),
    detail.flow,
    detail.symptoms
  ]
}

function buildMemoryDetailFingerprint(memory) {
  return [memory.date || '', normalizeKeyText(memory.note)]
}

function normalizeKeyText(value) {
  return value === undefined || value === null ? '' : String(value)
}

function buildDayMeanings(day = {}) {
  const meanings = []
  if (day.isToday) {
    meanings.push({
      key: 'today',
      title: '今天',
      text: '这是今天，所以日历会重点高亮。'
    })
  }
  if (day.isPeriod) {
    meanings.push({
      key: 'period',
      title: '经期记录',
      text: day.isOngoingPeriod
        ? '这一天落在进行中的经期范围内（开始日至今天）。'
        : day.isUnknownEndPeriod
          ? '这一天是结束日期不详的经期记录的已知开始日。'
          : '这一天落在已记录的经期范围内。'
    })
  }
  if (day.isMemory) {
    meanings.push({
      key: 'memory',
      title: '欢乐时光',
      text: '这一天有一条欢乐时光记录。'
    })
  }
  if (day.isPredict) {
    meanings.push({
      key: 'predict',
      title: '下次可能开始的日子',
      text: '按之前的记录估的，前后几天都有可能。'
    })
  }
  if (day.holidayName) {
    meanings.push({
      key: 'holiday',
      title: '节日',
      text: hasPublishedHolidayYear(util.parseDate(day.date).getFullYear())
        ? '法定假日，按官方安排放假'
        : '节日按历法标出，放假和调休等官方公布后更新'
    })
  } else if (day.isWorkday) {
    meanings.push({
      key: 'workday',
      title: '调休上班',
      text: '这天是周末，按官方安排调成上班'
    })
  }
  return meanings
}

const DAY_ARIA_MEANING_TEXT = {
  today: '今天',
  'period-ongoing': '经期进行中',
  'period-unknown-end': '结束日期不详',
  memory: '欢乐时光',
  predict: '下次可能开始的日子',
  workday: '调休上班'
}

function buildDayAriaLabel(day, today) {
  if (!day || day.isEmpty || !day.date) return ''
  const parts = [util.formatDisplayDate(day.date, { today, withWeekday: true })]
  if (day.lunarText) parts.push(day.lunarText)
  buildDayMeanings(day).forEach(meaning => {
    if (meaning.key === 'holiday') {
      if (day.holidayName) parts.push(day.holidayName)
      return
    }
    if (meaning.key === 'period') {
      parts.push(day.periodDayCount ? `经期第 ${util.formatQuantity(day.periodDayCount, '天')}` : '经期记录')
      if (day.isOngoingPeriod) parts.push(DAY_ARIA_MEANING_TEXT['period-ongoing'])
      else if (day.isUnknownEndPeriod) parts.push(DAY_ARIA_MEANING_TEXT['period-unknown-end'])
      return
    }
    const text = DAY_ARIA_MEANING_TEXT[meaning.key]
    if (text) parts.push(text)
  })
  return parts.join(' ')
}

function lunarCellLabel(lunarText) {
  if (!lunarText) return ''
  if (lunarText.endsWith('初一')) return lunarText.slice(0, -2)
  return lunarText.slice(-2)
}

module.exports = {
  buildHomeCalendarState,
  buildPeriodQuickEntry
}
