const cycle = require('./cycle')
const util = require('./util')

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

function buildPredictionExplanation(prediction) {
  if (!prediction || !prediction.canPredict) {
    return {
      available: false,
      title: '预测说明',
      summary: '记录足够后会显示下次预测',
      lines: ['至少需要连续的经期记录，预测才会更稳定']
    }
  }

  const lines = []
  if (prediction.usedCycleCount > 0) {
    lines.push(`参考最近 ${prediction.usedCycleCount} 次有效周期`)
  } else {
    lines.push('参考手动设置的常用周期')
  }

  lines.push(`平均周期 ${prediction.avgCycle} 天，平均持续 ${prediction.avgDuration} 天`)
  lines.push(`置信度：${prediction.confidenceText}`)

  if (prediction.ignoredCycleCount > 0) {
    lines.push(`已忽略 ${prediction.ignoredCycleCount} 次波动较大的记录`)
  }

  return {
    available: true,
    title: '预测说明',
    summary: `预计 ${prediction.nextDisplay}，区间 ${prediction.rangeDisplay}`,
    lines
  }
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

function buildMonthlyRecap({ year, month, periods = [], memories = [], prediction = null }) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
  const monthPeriods = periods.filter(period => overlapsMonth(period, monthStart, monthEnd))
  const monthMemories = memories.filter(memory => memory.date >= monthStart && memory.date <= monthEnd)
  const periodDays = monthPeriods.reduce((sum, period) => sum + getPeriodDaysInMonth(period, monthStart, monthEnd), 0)
  const highlights = []

  monthPeriods.forEach(period => {
    highlights.push(formatPeriodHighlight(period))
  })

  if (monthMemories.length) {
    highlights.push(`欢乐时光：${monthMemories.map(memory => memory.note || '特别日子').join('；')}`)
  }

  const title = `${year}年${month + 1}月小结`
  const periodSummary = monthPeriods.length
    ? `本月记录了 ${monthPeriods.length} 次经期，共 ${periodDays} 天`
    : '本月暂无经期记录'
  const memorySummary = monthMemories.length
    ? `留下 ${monthMemories.length} 条欢乐时光`
    : '本月还没有欢乐时光'
  const predictionSummary = formatPredictionSummary(prediction)
  const shareLines = [title, periodSummary, memorySummary, predictionSummary, ...highlights]

  return {
    title,
    periodSummary,
    memorySummary,
    predictionSummary,
    highlights,
    shareText: shareLines.filter(Boolean).join('\n')
  }
}

function formatPredictionSummary(prediction) {
  if (!prediction || !prediction.canPredict) return '下次预测暂无，记录更多后会更稳'
  return `下次预测 ${prediction.nextDisplay}，区间 ${prediction.rangeDisplay}（${prediction.confidenceText}）`
}

function formatPeriodHighlight(period) {
  const detail = cycle.decoratePeriod(period)
  const parts = [`经期：${formatMonthDay(detail.startDate)}-${formatMonthDay(detail.endDate)}`, `${getPeriodDuration(detail)}天`]
  if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
  if (detail.symptomText) parts.push(detail.symptomText)
  return parts.join('，')
}

function overlapsMonth(period, monthStart, monthEnd) {
  if (!period || !period.startDate) return false
  const endDate = period.endDate || period.startDate
  return endDate >= monthStart && period.startDate <= monthEnd
}

function getPeriodDaysInMonth(period, monthStart, monthEnd) {
  const startDate = period.startDate > monthStart ? period.startDate : monthStart
  const endDate = (period.endDate || period.startDate) < monthEnd ? (period.endDate || period.startDate) : monthEnd
  return util.daysBetween(util.parseDate(startDate), util.parseDate(endDate)) + 1
}

function getPeriodDuration(period) {
  const duration = Number(period.duration)
  if (Number.isFinite(duration) && duration > 0) return Math.round(duration)
  return util.daysBetween(util.parseDate(period.startDate), util.parseDate(period.endDate || period.startDate)) + 1
}

function formatMonthDay(dateStr) {
  return util.formatPredictDisplay(dateStr).date
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

module.exports = {
  CALENDAR_LEGEND_ITEMS,
  buildPredictionExplanation,
  buildDayMeanings,
  buildMonthlyRecap
}
