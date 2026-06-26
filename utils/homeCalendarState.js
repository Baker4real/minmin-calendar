const util = require('./util')
const cycle = require('./cycle')
const calendarInsights = require('./calendarInsights')

function buildHomeCalendarState({ year, month, periods = [], memories = [], today = util.formatDate(new Date()) }) {
  const prediction = cycle.predictNextPeriod(periods)
  const predictionWindow = prediction.canPredict
    ? {
        rangeStart: prediction.rangeStart,
        rangeEnd: prediction.rangeEnd
      }
    : null
  const days = util.buildCalendarDays({
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
    predictionExplanation: calendarInsights.buildPredictionExplanation(prediction),
    cycleReminders: prediction.canPredict ? cycle.buildCycleReminders(prediction, periods, { today }) : [],
    monthlyRecap: calendarInsights.buildMonthlyRecap({ year, month, periods, memories, prediction }),
    days,
    dayDetailsByDate: buildDayDetailsByDate(days, periods, memories)
  }
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
      meanings: calendarInsights.buildDayMeanings(day),
      periods: periodDetails,
      memories: memoryDetails,
      empty: !periodDetails.length && !memoryDetails.length
    }
  })

  return details
}

module.exports = {
  buildHomeCalendarState
}
