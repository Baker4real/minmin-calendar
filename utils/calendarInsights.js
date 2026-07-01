const cycle = require('./cycle')
const util = require('./util')

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

function buildMonthlyRecap({ year, month, periods = [], memories = [], prediction = null }) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
  const monthPeriods = periods.filter(period => overlapsMonth(period, monthStart, monthEnd))
  const monthMemories = memories.filter(memory => isDateString(memory.date) && memory.date >= monthStart && memory.date <= monthEnd)
  const periodDays = monthPeriods.reduce((sum, period) => sum + getPeriodDaysInMonth(period, monthStart, monthEnd), 0)
  const highlights = []

  monthPeriods.forEach(period => {
    const highlight = formatPeriodHighlight(period)
    if (highlight) highlights.push(highlight)
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
  const range = normalizePeriodRange(period)
  if (!range) return ''

  const duration = getPeriodDuration(period)
  const detail = cycle.decoratePeriod({
    ...period,
    startDate: range.startDate,
    endDate: range.endDate,
    duration
  })
  const parts = [`经期：${formatMonthDay(detail.startDate)}-${formatMonthDay(detail.endDate)}`, `${duration}天`]
  if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
  if (detail.symptomText) parts.push(detail.symptomText)
  return parts.join('，')
}

function overlapsMonth(period, monthStart, monthEnd) {
  const range = normalizePeriodRange(period)
  if (!range) return false
  return range.endDate >= monthStart && range.startDate <= monthEnd
}

function getPeriodDaysInMonth(period, monthStart, monthEnd) {
  const range = normalizePeriodRange(period)
  if (!range) return 0

  const startDate = range.startDate > monthStart ? range.startDate : monthStart
  const endDate = range.endDate < monthEnd ? range.endDate : monthEnd
  if (startDate > endDate) return 0
  return util.daysBetween(util.parseDate(startDate), util.parseDate(endDate)) + 1
}

function getPeriodDuration(period) {
  const range = normalizePeriodRange(period)
  if (!range) return 0

  const duration = Number(period.duration)
  if (range.hasEndDate && Number.isFinite(duration) && duration > 0) return Math.round(duration)
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
}

function formatMonthDay(dateStr) {
  return util.formatPredictDisplay(dateStr).date
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function normalizePeriodRange(period) {
  return util.normalizeDateRange(period)
}

function isDateString(value) {
  return util.isValidDateString(value)
}

module.exports = {
  buildPredictionExplanation,
  buildMonthlyRecap
}
