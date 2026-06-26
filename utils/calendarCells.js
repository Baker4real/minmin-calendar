const util = require('./util')

function buildCalendarCells({ year, month, periods = [], memories = [], nextPredict = null, predictionWindow = null, today = util.formatDate(new Date()) }) {
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

module.exports = {
  buildCalendarCells
}
