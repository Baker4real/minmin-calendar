const util = require('./util')
const cycle = require('./cycle')
const calendarInsights = require('./calendarInsights')

const CALENDAR_LEGEND_ITEMS = [
  {
    key: 'today',
    title: '今天',
    marker: '今',
    text: '今天会用玫瑰色光圈突出。'
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
    marker: '节',
    text: '金色标签表示节日或法定假期。'
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
  const memoryDates = new Set(memories.map(memory => memory.date))
  const predictDates = collectPredictDates(nextPredict, year, month, predictionWindow)

  return util.buildCalendarDays({ year, month }).map(day => {
    if (!day || day.isEmpty) return day
    return {
      ...day,
      isToday: day.date === today,
      isPeriod: periodDates.has(day.date),
      isMemory: memoryDates.has(day.date),
      isPredict: predictDates.has(day.date)
    }
  })
}

function collectPeriodDates(periods) {
  const periodDates = new Set()
  periods.forEach(period => {
    if (!isDateString(period.startDate)) return
    const endDate = isDateString(period.endDate) ? period.endDate : period.startDate
    let date = util.parseDate(period.startDate)
    const end = util.parseDate(endDate)
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

  if (isDateString(startDate) && isDateString(endDate)) {
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
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function buildDayDetailsByDate(days, periods, memories) {
  const details = {}

  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return

    const periodDetails = periods
      .filter(period => day.date >= period.startDate && day.date <= period.endDate)
      .map(period => {
        const detail = cycle.decoratePeriod(period)
        const meta = []
        if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
        if (detail.symptomText) meta.push(detail.symptomText)
        return {
          range: `${period.startDate} ~ ${period.endDate}`,
          metaText: meta.join(' · ')
        }
      })

    const memoryDetails = memories
      .filter(memory => memory.date === day.date)
      .map(memory => ({ note: memory.note || '特别日子' }))

    details[day.date] = {
      meanings: buildDayMeanings(day),
      periods: periodDetails,
      memories: memoryDetails,
      empty: !periodDetails.length && !memoryDetails.length
    }
  })

  return details
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

module.exports = {
  buildHomeCalendarState
}
