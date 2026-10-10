const util = require('./util')
const cycle = require('./cycle')
const calendarInsights = require('./calendarInsights')

const CALENDAR_LEGEND_ITEMS = [
  {
    key: 'today',
    title: '今天',
    text: '薰衣草描边、玫瑰底，日期数字是玫瑰色。',
    cellClass: 'today',
    parts: [{ kind: 'num', className: 'day-num', text: '8' }]
  },
  {
    key: 'period',
    title: '经期记录',
    text: '连续的玫瑰色带表示这一天有经期记录。',
    cellClass: 'period period-single',
    parts: [{ kind: 'band', className: 'period-band', text: '' }]
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

function buildHomeCalendarState({ year, month, periods = [], memories = [], today = util.formatDate(new Date()) }) {
  const prediction = cycle.predictNextPeriod(periods, { today })
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
    nextPredict: prediction.canPredict ? prediction.nextStart : null,
    predictionWindow,
    today
  })
  const monthlyRecap = calendarInsights.buildMonthlyRecap({ year, month, periods, memories, prediction, today })

  return {
    avgCycle: prediction.canPredict ? prediction.avgCycle : null,
    avgDuration: prediction.canPredict ? prediction.avgDuration : null,
    nextPredict: prediction.canPredict ? prediction.nextStart : null,
    nextPredictDisplay: prediction.canPredict ? prediction.nextDisplay : '--',
    nextPredictWeekday: prediction.canPredict ? prediction.nextWeekday : '',
    predictionRangeDisplay: prediction.canPredict ? prediction.rangeDisplay : '',
    predictionWindow,
    predictConfidence: prediction.canPredict ? prediction.confidenceText : null,
    predictionDetail: prediction,
    legendItems: CALENDAR_LEGEND_ITEMS,
    predictionExplanation: calendarInsights.buildPredictionExplanation(prediction),
    homeStatus: cycle.buildHomeStatusLine(periods, { today, prediction }),
    monthPeriodDays: monthlyRecap.periodDays,
    monthMemoryCount: monthlyRecap.memoryCount,
    cycleReminders: prediction.canPredict ? cycle.buildCycleReminders(prediction, periods, { today }) : [],
    monthlyRecap,
    days,
    dayDetailsByDate: buildDayDetailsByDate(days, periods, memories, today)
  }
}

function buildHomeCalendarDays({ year, month, periods = [], memories = [], nextPredict = null, predictionWindow = null, today = util.formatDate(new Date()) }) {
  const periodDates = collectPeriodDates(periods, today)
  const ongoingPeriodDates = collectOngoingPeriodDates(periods, today)
  const unknownEndPeriodDates = collectUnknownEndPeriodDates(periods, today)
  const memoryDates = new Set(memories
    .map(memory => memory.date)
    .filter(isDateString))
  const predictDates = collectPredictDates(nextPredict, year, month, predictionWindow)

  const days = util.buildCalendarDays({ year, month }).map(day => {
    if (!day || day.isEmpty) return { ...day, ariaLabel: '' }
    const isPeriod = periodDates.has(day.date)
    const marked = {
      ...day,
      isToday: day.date === today,
      isPeriod,
      isOngoingPeriod: ongoingPeriodDates.has(day.date),
      isUnknownEndPeriod: unknownEndPeriodDates.has(day.date),
      isMemory: memoryDates.has(day.date),
      isPredict: predictDates.has(day.date) && !isPeriod,
      lunarCellText: lunarCellLabel(day.lunarText),
      periodDayCount: isPeriod ? countPeriodDay(day.date, periods, today) : 0
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

function collectPeriodDates(periods, today) {
  const periodDates = new Set()
  periods.forEach(period => {
    const range = cycle.projectPeriodRange(period, today)
    if (!range) return
    let date = util.parseDate(range.startDate)
    const end = util.parseDate(range.endDate)
    while (date <= end) {
      periodDates.add(util.formatDate(date))
      date.setDate(date.getDate() + 1)
    }
  })
  return periodDates
}

function collectOngoingPeriodDates(periods, today) {
  const ongoingDates = new Set()
  periods.forEach(period => {
    if (cycle.getPeriodStatus(period) !== 'ongoing') return
    const range = cycle.projectPeriodRange(period, today)
    if (!range) return
    let date = util.parseDate(range.startDate)
    const end = util.parseDate(range.endDate)
    while (date <= end) {
      ongoingDates.add(util.formatDate(date))
      date.setDate(date.getDate() + 1)
    }
  })
  return ongoingDates
}

// 结束日期不详只在已知开始日上区分状态，不延伸到其他日子
function collectUnknownEndPeriodDates(periods, today) {
  const unknownEndDates = new Set()
  periods.forEach(period => {
    if (cycle.getPeriodStatus(period) !== 'unknown-end') return
    const range = cycle.projectPeriodRange(period, today)
    if (!range) return
    unknownEndDates.add(range.startDate)
  })
  return unknownEndDates
}

function collectPredictDates(nextPredict, year, month, predictionWindow) {
  const predictDates = new Set()
  const startDate = predictionWindow && (predictionWindow.rangeStart || predictionWindow.startDate)
  const endDate = predictionWindow && (predictionWindow.rangeEnd || predictionWindow.endDate)

  if (isDateString(startDate) && isDateString(endDate) && startDate <= endDate) {
    let date = util.parseDate(startDate)
    const end = util.parseDate(endDate)
    while (date <= end) {
      if (date.getMonth() === month && date.getFullYear() === year) predictDates.add(util.formatDate(date))
      date.setDate(date.getDate() + 1)
    }
    return predictDates
  }

  if (!isDateString(nextPredict)) return predictDates

  const predictStart = util.parseDate(nextPredict)
  for (let i = 0; i < 5; i++) {
    const date = new Date(predictStart)
    date.setDate(date.getDate() + i)
    if (date.getMonth() === month && date.getFullYear() === year) {
      predictDates.add(util.formatDate(date))
    }
  }

  return predictDates
}

function isDateString(value) {
  return util.isValidDateString(value)
}

function buildDayDetailsByDate(days, periods, memories, today) {
  const details = {}
  const periodKeys = buildStableDetailKeys(periods, 'period', buildPeriodDetailFingerprint)
  const memoryKeys = buildStableDetailKeys(memories, 'memory', buildMemoryDetailFingerprint)

  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return

    const periodDetails = periods
      .map((period, index) => ({ period, range: cycle.projectPeriodRange(period, today), index }))
      .filter(item => isPeriodActiveOnDate(item.range, day.date))
      .map(({ period, range, index }) => {
        const detail = cycle.decoratePeriod({
          ...period,
          startDate: range.startDate,
          endDate: range.endDate
        }, { today })
        const meta = []
        if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
        if (detail.symptomText) meta.push(detail.symptomText)
        return {
          key: periodKeys[index],
          recordId: recordIdentity(period),
          range: formatPeriodDetailRange(range, today),
          metaText: meta.join(' · ')
        }
      })

    const memoryDetails = memories
      .map((memory, index) => ({ memory, index }))
      .filter(({ memory }) => isDateString(memory.date) && memory.date === day.date)
      .map(({ memory, index }) => ({
        key: memoryKeys[index],
        recordId: recordIdentity(memory),
        note: memory.note || '欢乐时光'
      }))
    const meanings = buildDayMeanings(day).filter(isDayDetailSentence)

    details[day.date] = {
      meanings,
      periods: periodDetails,
      memories: memoryDetails,
      actions: buildDayRecordActions(day, today),
      empty: !meanings.length && !periodDetails.length && !memoryDetails.length
    }
  })

  return details
}

function recordIdentity(record) {
  if (!record) return ''
  return record._id || record.id || ''
}

function isDayDetailSentence(meaning) {
  return meaning.key === 'predict' || meaning.key === 'holiday' || meaning.key === 'workday'
}

function buildDayRecordActions(day, today) {
  if (!day.date || day.date > today) return []
  return [
    {
      key: 'period',
      label: day.isPeriod ? '编辑这次经期' : (day.date === today ? '记经期' : '补记经期')
    },
    {
      key: 'memory',
      label: day.date === today ? '记欢乐时光' : '补记欢乐时光'
    }
  ]
}

function isPeriodActiveOnDate(range, date) {
  if (!range) return false
  return date >= range.startDate && date <= range.endDate
}

// 详情行文案暴露状态：进行中写明「开始日至今天」，结束日期不详不用空白日期表达
function formatPeriodDetailRange(range, today) {
  if (range.status === 'ongoing') {
    return `${util.formatDisplayDateRange(range.startDate, range.endDate, { today })}（进行中）`
  }
  if (range.status === 'unknown-end') {
    return `${util.formatDisplayDate(range.startDate, { today })}（结束日期不详）`
  }
  return util.formatDisplayDateRange(range.startDate, range.endDate, { today })
}

function buildStableDetailKeys(records, type, buildFingerprint) {
  const occurrences = new Map()
  return records.map(record => {
    if (record && record._id) return `${type}:${record._id}`

    const fingerprint = encodeURIComponent(JSON.stringify(buildFingerprint(record || {})))
    const occurrence = occurrences.get(fingerprint) || 0
    occurrences.set(fingerprint, occurrence + 1)
    return `${type}:fallback:${fingerprint}:${occurrence}`
  })
}

function buildPeriodDetailFingerprint(period) {
  const range = util.normalizeDateRange(period) || {}
  const detail = cycle.decoratePeriod(period)
  return [
    range.startDate || '',
    range.endDate || '',
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
      text: '这一天是下次可能开始的日子。'
    })
  }
  if (day.holidayName) {
    meanings.push({
      key: 'holiday',
      title: '节日',
      text: `${day.holidayName}。`
    })
  } else if (day.isWorkday) {
    meanings.push({
      key: 'workday',
      title: '调休上班',
      text: '官方调休上班日。'
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

function countPeriodDay(date, periods, today) {
  let chosenStart = ''
  let chosenRank = 3
  periods.forEach(period => {
    const range = cycle.projectPeriodRange(period, today)
    if (!range || date < range.startDate || date > range.endDate) return
    const rank = range.status === 'ongoing' ? 0 : range.status === 'known-end' ? 1 : 2
    if (rank < chosenRank || (rank === chosenRank && range.startDate > chosenStart)) {
      chosenRank = rank
      chosenStart = range.startDate
    }
  })
  if (!chosenStart) return 0
  return util.daysBetween(util.parseDate(chosenStart), util.parseDate(date)) + 1
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
      parts.push(`经期第${day.periodDayCount}天`)
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
  buildHomeCalendarState
}
