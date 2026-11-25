const cycle = require('./cycle')
const periodCoverage = require('./periodCoverage')
const util = require('./util')

const CONFIDENCE_COPY = {
  high: '最近几次很规律，估得比较准',
  medium: '已经有几次记录，大致可以参考',
  low: '记录还不多，仅供参考'
}

function buildPredictionExplanation(prediction, periods = [], options = {}) {
  const today = options.today || util.formatDate(new Date())
  const status = cycle.buildHomeStatusLine(periods, { today, prediction }).status
  const leadingLine = buildOverdueLeadingLine(periods, today, status)
  if (!prediction || !prediction.canPredict) {
    const summary = [leadingLine, cycle.buildPredictionThresholdText(periods)].filter(Boolean).join('\n')
    return {
      available: false,
      title: '预测说明',
      summary,
      lines: [],
      lineItems: []
    }
  }

  if (status === 'late' || status === 'late-too-long') {
    const lateDays = util.daysBetween(util.parseDate(prediction.nextStart), util.parseDate(today))
    const lines = [
      '已经开始了就记经期；漏记了，在日历上点那一天补记',
      '根据记录估算，不是医疗建议'
    ]
    return {
      available: true,
      title: '预测说明',
      summary: `原本估在 ${prediction.nextDisplay} 前后 ${util.formatQuantity(windowDays(prediction), '天')}，现在已经过了 ${util.formatQuantity(lateDays, '天')}`,
      lines,
      lineItems: buildTextItems(lines, 'prediction'),
      periodAction: { label: '记经期' }
    }
  }

  const lines = [`参考最近 ${util.formatQuantity(prediction.usedCycleCount, '次')}有效周期`]
  lines.push(formatDurationLine(prediction))
  lines.push(spokenConfidence(prediction))

  if (prediction.ignoredCycleCount > 0) {
    lines.push(`已忽略 ${util.formatQuantity(prediction.ignoredCycleCount, '次')}波动较大的记录`)
  }

  lines.push('根据记录估算，不是医疗建议')

  return {
    available: true,
    title: '预测说明',
    // 窗口从句另起一行（<text> 里的换行即断行）：整句折行时 430px 宽下「口」会单独落在第二行
    summary: [leadingLine, `预计 ${prediction.nextDisplay} 开始，\n前后 ${util.formatQuantity(windowDays(prediction), '天')}是可能开始的窗口`].filter(Boolean).join('\n'),
    lines,
    lineItems: buildTextItems(lines, 'prediction')
  }
}

function buildOverdueLeadingLine(periods, today, status) {
  if (status !== 'in-period') return ''
  const active = periodCoverage.getPeriodOnDate(periods, today, today)
  if (!active || active.status !== 'ongoing') return ''
  const length = cycle.describeKnownPeriodLength({ startDate: active.record.startDate, endDate: today, periods })
  if (!length.exceedsExpected) return ''
  return `这次已经 ${util.formatQuantity(length.days, '天')}，比预期的 ${util.formatQuantity(length.expectedDays, '天')}多；结束了就点「记结束」`
}

function buildMonthlyRecap({
  year,
  month,
  periods = [],
  memories = [],
  prediction = null,
  today = util.formatDate(new Date())
}) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
  const monthPeriods = periods.filter(period => overlapsMonth(period, monthStart, monthEnd, today))
  const monthMemories = memories.filter(memory => isDateString(memory.date) && memory.date >= monthStart && memory.date <= monthEnd)
  const periodDays = periodCoverage.getMonthCoverage(periods, year, month, today).count
  const highlights = []
  const highlightItems = []
  const addHighlight = (kind, text, dateBadge) => {
    if (!text) return
    highlights.push(text)
    const summaryStart = text.indexOf('，')
    highlightItems.push({
      key: `recap:${highlightItems.length}`,
      kind,
      text,
      dateBadge,
      summary: summaryStart < 0 ? text : text.slice(summaryStart + 1)
    })
  }

  monthPeriods.forEach(period => {
    const range = normalizePeriodRange(period, today)
    if (!range) return
    const dateBadge = range.status === 'unknown-end'
      ? util.formatDisplayDate(range.startDate, { today })
      : util.formatDisplayDateRange(range.startDate, range.endDate, { today })
    addHighlight('period', formatPeriodHighlight(period, monthStart, monthEnd, today), dateBadge)
  })

  formatMemoryHighlights(monthMemories, today).forEach(highlight => {
    addHighlight('memory', highlight.text, highlight.dateBadge)
  })

  const shareTitle = `${year}年${month + 1}月小结`
  const periodSummary = formatPeriodSummary(monthPeriods, periodDays, monthStart, monthEnd, today)
  const memorySummary = monthMemories.length ? `留下 ${util.formatQuantity(monthMemories.length, '条')}欢乐时光` : '本月还没有欢乐时光'
  const predictionSummary = formatPredictionSummary(prediction)
  const shareLines = [shareTitle, periodSummary, memorySummary, predictionSummary, ...highlights]
  const summaryLine = `本月 经期 ${util.formatQuantity(periodDays, '天')} · 欢乐时光 ${util.formatQuantity(monthMemories.length, '条')}`

  return {
    title: '本月小结',
    subtitle: `${year}年${month + 1}月`,
    shareTitle,
    periodSummary,
    memorySummary,
    predictionSummary,
    summaryLine,
    periodDays,
    memoryCount: monthMemories.length,
    highlights,
    highlightItems,
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
  return `下次预测 ${prediction.nextDisplay}，区间 ${prediction.rangeDisplay}，${spokenConfidence(prediction)}`
}

// 预测持续天数按来源措辞：已知历史才说「平均」，
// 五天默认不冒充已知天数，写明是估计的兜底值
function formatDurationLine(prediction) {
  if (prediction.durationSource === 'default') {
    return `平均周期 ${util.formatQuantity(prediction.avgCycle, '天')}，经期时长暂无已知记录，先按默认 ${util.formatQuantity(prediction.avgDuration, '天')}估`
  }
  return `平均周期 ${util.formatQuantity(prediction.avgCycle, '天')}，平均持续 ${util.formatQuantity(prediction.avgDuration, '天')}`
}

function formatPeriodSummary(monthPeriods, periodDays, monthStart, monthEnd, today) {
  if (!monthPeriods.length) return '本月暂无经期记录'

  const spanning = monthPeriods.some(period => {
    const range = normalizePeriodRange(period, today)
    return range && !isPeriodFullyInMonth(range, monthStart, monthEnd)
  })
  if (!spanning) return `本月记录了 ${util.formatQuantity(monthPeriods.length, '次')}经期，共 ${util.formatQuantity(periodDays, '天')}`

  // 跨月这件事由经期区间本身说明，小结不再另写「从上月延续 / 本月开始」。
  return `本月 ${util.formatQuantity(periodDays, '天')}`
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
    parts.push(`本月 ${util.formatQuantity(getPeriodDaysInMonth(period, monthStart, monthEnd, today), '天')}`)
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
    parts.push(util.formatQuantity(duration, '天'))
  } else {
    parts.push(`整段 ${util.formatQuantity(duration, '天')}`, `本月 ${util.formatQuantity(getPeriodDaysInMonth(period, monthStart, monthEnd, today), '天')}`)
  }
  if (detail.flowLabel) parts.push(`经量 ${detail.flowLabel}`)
  if (detail.symptomText) parts.push(detail.symptomText)
  return parts.join('，')
}

function formatMemoryHighlights(memories, today) {
  return memories.map(memory => {
    const dateBadge = util.formatDisplayDate(memory.date, { today })
    return {
      text: `欢乐时光：${dateBadge}，${normalizeMemoryNote(memory)}`,
      dateBadge
    }
  })
}

function normalizeMemoryNote(memory) {
  const note = typeof memory.note === 'string' ? memory.note.trim() : ''
  return note || '欢乐时光'
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
  return periodCoverage.projectPeriodRange(period, today)
}

function isDateString(value) {
  return util.isValidDateString(value)
}

module.exports = {
  buildPredictionExplanation,
  buildMonthlyRecap
}
