const util = require('./util')
const cycle = require('./cycle')
const calendarInsights = require('./calendarInsights')

const CALENDAR_LEGEND_ITEMS = [
  {
    key: 'today',
    title: '今天',
    marker: '',
    text: '玫瑰色光圈圈出今天，日期数字变成玫瑰色。'
  },
  {
    key: 'period',
    title: '经期记录',
    marker: '●',
    text: '粉色圆点表示这一天有经期记录。'
  },
  {
    key: 'memory',
    title: '欢乐时光',
    marker: '♥',
    text: '爱心表示这一天留下了欢乐时光。'
  },
  {
    key: 'predict',
    title: '预测区间',
    marker: '预',
    text: '金色“预”表示下次经期的预测区间。'
  },
  {
    key: 'holiday',
    title: '节日',
    marker: '中秋',
    text: '金色标签会写出当天的真实节日名称，如「中秋」。'
  },
  {
    key: 'workday',
    title: '调休上班',
    marker: '班',
    text: '“班”表示官方调休上班日。'
  }
]

function buildHomeCalendarState({ year, month, periods = [], memories = [], today = util.formatDate(new Date()) }) {
  const prediction = cycle.predictNextPeriod(periods)
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
    cycleReminders: prediction.canPredict ? cycle.buildCycleReminders(prediction, periods, { today }) : [],
    monthlyRecap: calendarInsights.buildMonthlyRecap({ year, month, periods, memories, prediction }),
    days,
    dayDetailsByDate: buildDayDetailsByDate(days, periods, memories)
  }
}

function buildHomeCalendarDays({ year, month, periods = [], memories = [], nextPredict = null, predictionWindow = null, today = util.formatDate(new Date()) }) {
  const periodDates = collectPeriodDates(periods)
  const memoryDates = new Set(memories
    .map(memory => memory.date)
    .filter(isDateString))
  const predictDates = collectPredictDates(nextPredict, year, month, predictionWindow)

  return util.buildCalendarDays({ year, month }).map(day => {
    if (!day || day.isEmpty) return { ...day, ariaLabel: '' }
    const marked = {
      ...day,
      isToday: day.date === today,
      isPeriod: periodDates.has(day.date),
      isMemory: memoryDates.has(day.date),
      isPredict: predictDates.has(day.date)
    }
    return { ...marked, ariaLabel: buildDayAriaLabel(marked) }
  })
}

function collectPeriodDates(periods) {
  const periodDates = new Set()
  periods.forEach(period => {
    const range = util.normalizeDateRange(period)
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

function buildDayDetailsByDate(days, periods, memories) {
  const details = {}
  const periodKeys = buildStableDetailKeys(periods, 'period', buildPeriodDetailFingerprint)
  const memoryKeys = buildStableDetailKeys(memories, 'memory', buildMemoryDetailFingerprint)

  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return

    const periodDetails = periods
      .map((period, index) => ({ period, range: util.normalizeDateRange(period), index }))
      .filter(item => isPeriodActiveOnDate(item.range, day.date))
      .map(({ period, range, index }) => {
        const detail = cycle.decoratePeriod({
          ...period,
          startDate: range.startDate,
          endDate: range.endDate
        })
        const meta = []
        if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
        if (detail.symptomText) meta.push(detail.symptomText)
        return {
          key: periodKeys[index],
          range: `${range.startDate} ~ ${range.endDate}`,
          metaText: meta.join(' · ')
        }
      })

    const memoryDetails = memories
      .map((memory, index) => ({ memory, index }))
      .filter(({ memory }) => isDateString(memory.date) && memory.date === day.date)
      .map(({ memory, index }) => ({
        key: memoryKeys[index],
        note: memory.note || '特别日子'
      }))
    const meanings = buildDayMeanings(day)

    details[day.date] = {
      meanings,
      periods: periodDetails,
      memories: memoryDetails,
      empty: !meanings.length && !periodDetails.length && !memoryDetails.length
    }
  })

  return details
}

function isPeriodActiveOnDate(range, date) {
  if (!range) return false
  return date >= range.startDate && date <= range.endDate
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
      text: '这一天落在已记录的经期范围内。'
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
      title: '预测区间',
      text: '这一天落在下次经期的预测范围内。'
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
  period: '经期',
  memory: '欢乐时光',
  predict: '预测区间',
  workday: '调休上班'
}

function buildDayAriaLabel(day) {
  if (!day || day.isEmpty || !day.date) return ''
  const parts = [formatAriaDate(day.date)]
  if (day.weekday) parts.push(day.weekday)
  buildDayMeanings(day).forEach(meaning => {
    if (meaning.key === 'holiday') {
      if (day.holidayName) parts.push(day.holidayName)
      return
    }
    const text = DAY_ARIA_MEANING_TEXT[meaning.key]
    if (text) parts.push(text)
  })
  return parts.join(' ')
}

function formatAriaDate(date) {
  const [, month, dayOfMonth] = date.split('-')
  return `${Number(month)}月${Number(dayOfMonth)}日`
}

module.exports = {
  buildHomeCalendarState
}
