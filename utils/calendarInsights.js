const cycle = require('./cycle')
const util = require('./util')

const CONFIDENCE_COPY = {
  high: '最近几次很规律，比较准',
  medium: '已经有几次记录，大致可以参考',
  low: '记录还不多，仅供参考'
}

function buildPredictionExplanation(prediction) {
  if (!prediction || !prediction.canPredict) {
    const lines = ['至少需要连续的经期记录，预测才会更稳定']
    return {
      available: false,
      title: '预测说明',
      summary: '记录足够后会显示下次预测',
      lines,
      lineItems: buildTextItems(lines, 'prediction')
    }
  }

  const lines = []
  if (prediction.usedCycleCount > 0) {
    lines.push(`参考最近 ${prediction.usedCycleCount} 次有效周期`)
  } else {
    lines.push('参考手动设置的常用周期')
  }

  lines.push(formatDurationLine(prediction))
  lines.push(`预计持续 ${prediction.avgDuration} 天`)
  lines.push(spokenConfidence(prediction))

  if (prediction.ignoredCycleCount > 0) {
    lines.push(`已忽略 ${prediction.ignoredCycleCount} 次波动较大的记录`)
  }

  lines.push('根据记录估算，不是医疗建议')

  return {
    available: true,
    title: '预测说明',
    summary: `预计 ${prediction.nextDisplay} 开始，前后 ${windowDays(prediction)} 天都正常`,
    lines,
    lineItems: buildTextItems(lines, 'prediction')
  }
}

function buildMonthlyRecap({ year, month, periods = [], memories = [], prediction = null, today = util.formatDate(new Date()) }) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
  const monthPeriods = periods.filter(period => overlapsMonth(period, monthStart, monthEnd, today))
  const monthMemories = memories.filter(memory => isDateString(memory.date) && memory.date >= monthStart && memory.date <= monthEnd)
  const periodDays = monthPeriods.reduce((sum, period) => sum + getPeriodDaysInMonth(period, monthStart, monthEnd, today), 0)
  const highlights = []

  monthPeriods.forEach(period => {
    const highlight = formatPeriodHighlight(period, monthStart, monthEnd, today)
    if (highlight) highlights.push(highlight)
  })

  const memoryHighlight = formatMemoryHighlight(monthMemories)
  if (memoryHighlight) highlights.push(memoryHighlight)

  const title = `${year}年${month + 1}月小结`
  const periodSummary = formatPeriodSummary(monthPeriods, periodDays, monthStart, monthEnd, today)
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
    highlightItems: buildTextItems(highlights, 'recap'),
    shareText: shareLines.filter(Boolean).join('\n')
  }
}

function spokenConfidence(prediction) {
  return CONFIDENCE_COPY[prediction.confidence] || CONFIDENCE_COPY.low
}

function windowDays(prediction) {
  return util.daysBetween(util.parseDate(prediction.nextStart), util.parseDate(prediction.rangeEnd))
}

function formatPredictionSummary(prediction) {
  if (!prediction || !prediction.canPredict) return '下次预测暂无，记录更多后会更稳'
  return `下次预测 ${prediction.nextDisplay}，区间 ${prediction.rangeDisplay}（置信度：${spokenConfidence(prediction)}）`
}

// 预测持续天数按来源措辞：已知历史才说「平均」，用户设置说「常用」，
// 五天默认不冒充已知天数，写明是估计的兜底值
function formatDurationLine(prediction) {
  if (prediction.durationSource === 'manual') {
    return `平均周期 ${prediction.avgCycle} 天，经期时长按常用 ${prediction.avgDuration} 天`
  }
  if (prediction.durationSource === 'default') {
    return `平均周期 ${prediction.avgCycle} 天，经期时长暂无已知记录，先按默认 ${prediction.avgDuration} 天估`
  }
  return `平均周期 ${prediction.avgCycle} 天，平均持续 ${prediction.avgDuration} 天`
}

function formatPeriodSummary(monthPeriods, periodDays, monthStart, monthEnd, today) {
  if (!monthPeriods.length) return '本月暂无经期记录'

  const spanning = monthPeriods.some(period => {
    const range = normalizePeriodRange(period, today)
    return range && !isPeriodFullyInMonth(range, monthStart, monthEnd)
  })
  if (!spanning) return `本月记录了 ${monthPeriods.length} 次经期，共 ${periodDays} 天`

  // 跨月这件事由经期区间本身说明，小结不再另写「从上月延续 / 本月开始」。
  return `本月 ${periodDays} 天`
}

function formatPeriodHighlight(period, monthStart, monthEnd, today) {
  const range = normalizePeriodRange(period, today)
  if (!range) return ''

  const detail = cycle.decoratePeriod({
    ...period,
    startDate: range.startDate,
    endDate: range.endDate
  }, { today })

  // 进行中与结束日期不详没有精确经期时长，不写「整段 N 天」；只报本月天数
  if (range.status === 'ongoing') {
    const parts = [`经期：${util.formatDisplayDateRange(range.startDate, range.endDate, { today })}，进行中`]
    parts.push(`本月 ${getPeriodDaysInMonth(period, monthStart, monthEnd, today)} 天`)
    if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
    if (detail.symptomText) parts.push(detail.symptomText)
    return parts.join('，')
  }
  if (range.status === 'unknown-end') {
    const parts = [`经期：${util.formatDisplayDate(range.startDate, { today })}，结束日期不详`]
    if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
    if (detail.symptomText) parts.push(detail.symptomText)
    return parts.join('，')
  }

  const duration = cycle.getPeriodDuration(period)
  const parts = [`经期：${util.formatDisplayDateRange(detail.startDate, detail.endDate, { today })}`]
  if (isPeriodFullyInMonth(range, monthStart, monthEnd)) {
    parts.push(`${duration}天`)
  } else {
    parts.push(`整段 ${duration} 天`, `本月 ${getPeriodDaysInMonth(period, monthStart, monthEnd, today)} 天`)
  }
  if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
  if (detail.symptomText) parts.push(detail.symptomText)
  return parts.join('，')
}

function formatMemoryHighlight(memories) {
  if (!memories.length) return ''

  const notes = memories
    .map(normalizeMemoryNote)
    .filter(note => !note.isDefault)
    .map(note => note.text)
  if (!notes.length) return ''

  return `欢乐时光：${notes.join('；')}`
}

function normalizeMemoryNote(memory) {
  const note = typeof memory.note === 'string' ? memory.note.trim() : ''
  return note
    ? { text: note, isDefault: false }
    : { text: '特别日子', isDefault: true }
}

function overlapsMonth(period, monthStart, monthEnd, today) {
  const range = normalizePeriodRange(period, today)
  if (!range) return false
  return range.endDate >= monthStart && range.startDate <= monthEnd
}

function isPeriodFullyInMonth(range, monthStart, monthEnd) {
  return range.startDate >= monthStart && range.endDate <= monthEnd
}

function getPeriodDaysInMonth(period, monthStart, monthEnd, today) {
  const range = normalizePeriodRange(period, today)
  if (!range) return 0

  const startDate = range.startDate > monthStart ? range.startDate : monthStart
  const endDate = range.endDate < monthEnd ? range.endDate : monthEnd
  if (startDate > endDate) return 0
  return util.daysBetween(util.parseDate(startDate), util.parseDate(endDate)) + 1
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function buildTextItems(lines, prefix) {
  return lines.map((text, index) => ({
    key: `${prefix}:${index}`,
    text
  }))
}

function normalizePeriodRange(period, today) {
  return cycle.projectPeriodRange(period, today)
}

function isDateString(value) {
  return util.isValidDateString(value)
}

module.exports = {
  buildPredictionExplanation,
  buildMonthlyRecap
}
