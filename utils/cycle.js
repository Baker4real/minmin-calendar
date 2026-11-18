const util = require('./util')
const periodCoverage = require('./periodCoverage')
const { getPeriodStatus, projectPeriodRange, decidePeriodRecordForDate } = periodCoverage

// 经期记录三态：进行中 / 已结束但结束日期不详 / 已结束且有结束日期。
// 状态是权威：空结束日期不被隐含解释为单日经期或进行中经期。
const PERIOD_STATUS_OPTIONS = [
  { value: 'ongoing', label: '进行中' },
  { value: 'unknown-end', label: '结束日期不详' },
  { value: 'known-end', label: '已结束' }
]

const PERIOD_STATUS_LABELS = {
  ongoing: '进行中',
  'unknown-end': '结束日期不详',
  'known-end': ''
}

const PERIOD_STATUS_HINTS = {
  ongoing: '进行中可稍后补结束日期',
  'known-end': '选好结束日期，这次经期才有确定的天数',
  'unknown-end': '结束日不清楚，日历只标开始那天'
}

const FLOW_OPTIONS = [
  { value: 'light', label: '量少' },
  { value: 'normal', label: '正常' },
  { value: 'heavy', label: '量多' }
]

const SYMPTOM_GROUPS = [
  { key: 'body', label: '身体' },
  { key: 'emotion', label: '情绪与睡眠' }
]

const SYMPTOM_OPTIONS = [
  { value: 'cramps', label: '痛经', group: 'body' },
  { value: 'headache', label: '头痛', group: 'body' },
  { value: 'tired', label: '疲惫', group: 'body' },
  { value: 'acne', label: '长痘', group: 'body' },
  { value: 'mood', label: '情绪波动', group: 'emotion' },
  { value: 'sleep', label: '睡眠差', group: 'emotion' },
  { value: 'cravings', label: '嘴馋', group: 'emotion' }
]

const FLOW_LABELS = FLOW_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label
  return map
}, {})

const SYMPTOM_LABELS = SYMPTOM_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label
  return map
}, {})

function predictNextPeriod(periods, options = {}) {
  const normalized = normalizePeriods(periods)
  if (normalized.length === 0) return emptyPrediction()

  // 只有已知结束的记录贡献正时长；进行中与结束日期不详的时长恒为 0
  const durations = normalized.map(item => item.duration).filter(isPositiveNumber)
  const predictedDuration = getPredictedDuration(durations)
  const cycleLengths = collectCycleLengths(normalized)
  const candidateCycles = cycleLengths.filter(length => length >= 15 && length <= 60)
  const stableCycles = getStableCycles(candidateCycles)
  const ignoredCycleCount = Math.max(0, cycleLengths.length - stableCycles.length)

  if (stableCycles.length >= 2) {
    const recentCycles = stableCycles.slice(-6)
    const avgCycle = Math.round(weightedMean(recentCycles))
    const sd = standardDeviation(recentCycles)
    const rangeDays = clamp(Math.ceil(sd), 1, 7)
    const confidence = getConfidence(recentCycles.length, sd)

    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle,
      avgDuration: predictedDuration.days,
      durationSource: predictedDuration.source,
      rangeDays,
      confidence,
      usedCycleCount: recentCycles.length,
      ignoredCycleCount,
      source: 'history',
      today: options.today
    })
  }

  if (stableCycles.length === 1) {
    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle: stableCycles[0],
      avgDuration: predictedDuration.days,
      durationSource: predictedDuration.source,
      rangeDays: 3,
      confidence: 'low',
      usedCycleCount: 1,
      ignoredCycleCount,
      source: 'history',
      today: options.today
    })
  }

  return emptyPrediction()
}

function buildPeriodPayload({ startDate, endDate = '', status, note = '', flow = '', symptoms = [] }) {
  const normalizedStatus = getPeriodStatus({ status, endDate })
  const range = normalizedStatus === 'known-end'
    ? util.normalizeDateRange({ startDate, endDate })
    : null
  return {
    startDate,
    endDate: range ? range.endDate : '',
    status: normalizedStatus,
    note,
    duration: range
      ? util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
      : 0,
    flow: FLOW_LABELS[flow] ? flow : '',
    symptoms: normalizeSymptoms(symptoms)
  }
}

function periodDateLabel(status, range, period, today) {
  if (range) return util.formatDisplayDateRange(range.startDate, range.endDate, { today })
  if (status === 'ongoing') {
    if (isDateString(today) && isDateString(period.startDate)) {
      return util.formatDisplayDateRange(period.startDate, today, { today })
    }
    return util.formatDisplayDate(period.startDate, { today })
  }
  return util.formatDisplayDate(period.startDate, { today })
}

function periodRangeSummary(status, range, period, today) {
  if (range) return util.formatDisplayDateRange(range.startDate, range.endDate, { today })
  if (status === 'ongoing') {
    const label = periodDateLabel(status, range, period, today)
    return label ? `${label}，进行中` : '进行中'
  }
  const start = periodDateLabel(status, range, period, today)
  return start ? `${start}，结束日期不详` : '结束日期不详'
}

function recordAuthorLabel(record, { paired = false } = {}) {
  if (paired !== true) return ''
  if (!record || typeof record.createdByMe !== 'boolean') return ''
  return record.createdByMe ? '我记的' : 'TA 记的'
}

// 读屏名里的备注摘要（issue #157）：折成单行，只取开头 20 个字，超出用「…」收尾；
// 空白备注返回空串，由拼读屏名的一方跳过
const NOTE_SUMMARY_MAX_CHARS = 20

function recordNoteSummary(note) {
  const text = String(note || '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  if (chars.length <= NOTE_SUMMARY_MAX_CHARS) return text
  return `${chars.slice(0, NOTE_SUMMARY_MAX_CHARS).join('').trim()}…`
}

// 欢乐时光编辑入口的读屏名（issue #157）：首页当日详情行和「记录」tab 月份卡行共用这一处。
// 动作 + 日期 + 非空备注的短摘要 + 作者（只在房间已配对时有值），同一天的多条各自可辨；空的部分跳过，不留多余标点
function memoryEditAriaLabel({ dateText, note, authorLabel }) {
  return ['编辑欢乐时光', dateText, recordNoteSummary(note), authorLabel].filter(Boolean).join('，')
}

function decoratePeriod(period, { today, projectedRange } = {}) {
  const status = getPeriodStatus(period)
  const range = status === 'known-end'
    ? (projectedRange === undefined ? projectPeriodRange(period, today) : projectedRange)
    : null
  const symptoms = normalizeSymptoms(period.symptoms)
  const symptomLabels = symptoms.map(value => SYMPTOM_LABELS[value])
  const flowLabel = FLOW_LABELS[period.flow] || ''
  const duration = range
    ? util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
    : 0

  return {
    ...period,
    status,
    statusLabel: PERIOD_STATUS_LABELS[status] || '',
    startDate: range ? range.startDate : period.startDate,
    endDate: range ? range.endDate : '',
    duration,
    flow: FLOW_LABELS[period.flow] ? period.flow : '',
    symptoms,
    flowLabel,
    symptomLabels,
    symptomText: symptomLabels.join('、'),
    endDateDisplay: range
      ? util.formatDisplayDate(range.endDate, { today })
      : status === 'ongoing' ? (isDateString(today) ? util.formatDisplayDate(today, { today }) : '') : '结束日期不详',
    durationText: range ? `${duration}天` : PERIOD_STATUS_LABELS[status] || '',
    dateLabel: periodDateLabel(status, range, period, today),
    rangeSummary: periodRangeSummary(status, range, period, today)
  }
}

function periodStatusHint(status) {
  return PERIOD_STATUS_HINTS[status] || ''
}

function buildSymptomOptions(selectedSymptoms = []) {
  const selected = new Set(normalizeSymptoms(selectedSymptoms))
  return SYMPTOM_GROUPS.map(group => ({
    ...group,
    options: SYMPTOM_OPTIONS
      .filter(item => item.group === group.key)
      .map(item => ({
        value: item.value,
        label: item.label,
        selected: selected.has(item.value)
      }))
  }))
}

function formatPredictionRange(prediction, today) {
  if (!prediction || !prediction.canPredict) return ''
  return util.formatDisplayDateRange(prediction.rangeStart, prediction.rangeEnd, { today })
}

function buildPrediction({
  lastStart,
  avgCycle,
  avgDuration,
  durationSource,
  rangeDays,
  confidence,
  usedCycleCount,
  ignoredCycleCount,
  source,
  today
}) {
  const nextStart = addDays(lastStart, avgCycle)
  const nextEnd = addDays(nextStart, Math.max(1, avgDuration) - 1)
  const rangeStart = addDays(nextStart, -rangeDays)
  const rangeEnd = addDays(nextStart, rangeDays)
  const prediction = {
    canPredict: true,
    avgCycle,
    avgDuration,
    durationSource,
    nextStart,
    nextEnd,
    rangeStart,
    rangeEnd,
    confidence,
    confidenceText: confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低',
    usedCycleCount,
    ignoredCycleCount,
    source,
    nextDisplay: util.formatDisplayDate(nextStart, { today }),
    nextWeekday: util.getChineseDateMeta(nextStart).weekday
  }
  prediction.rangeDisplay = formatPredictionRange(prediction, today)
  return prediction
}

function emptyPrediction() {
  return {
    canPredict: false,
    avgCycle: null,
    avgDuration: null,
    durationSource: null,
    nextStart: null,
    nextEnd: null,
    rangeStart: null,
    rangeEnd: null,
    confidence: null,
    confidenceText: '',
    usedCycleCount: 0,
    ignoredCycleCount: 0,
    source: 'none',
    nextDisplay: '--',
    nextWeekday: '',
    rangeDisplay: ''
  }
}

function isPeriodStatus(value) {
  return PERIOD_STATUS_OPTIONS.some(option => option.value === value)
}

// 保留既有 cycle interface；经期规则由 periodCoverage 回答。
function findOngoingPeriod(periods = []) {
  const entry = decidePeriodRecordForDate(periods, '')
  return entry.reason === 'ongoing' ? entry.record : null
}

// 状态行、预测说明和记录 tab 空态共用这一份预测门槛文案。
function buildPredictionThresholdText(periods) {
  return normalizePeriods(periods).length < 2
    ? '记两次经期后就能估下次'
    : '最近几次间隔差得多，再记几次就能估'
}

// 首页唯一状态句。经期覆盖今天时优先于预测；窗口前的倒数独立投影在右侧。
// 窗口结束后第 1–7 天仍数晚几天，第 8 天起只说上次记录与补记，不让数字继续增长。
function buildHomeStatusLine(periods, options = {}) {
  const today = isDateString(options.today) ? options.today : util.formatDate(new Date())
  const prediction = options.prediction || predictNextPeriod(periods, { ...options, today })
  const active = periodCoverage.getPeriodOnDate(periods, today, today)
  if (active) {
    let text = `经期第 ${active.day} 天`
    if (active.status === 'ongoing') {
      const expected = expectedPeriodLength(periods)
      const overdueDays = active.day - expected.days
      if (overdueDays > 0) text += ` · 比预期多 ${overdueDays} 天`
    }
    return { status: 'in-period', text, countdownText: '', tone: 'default' }
  }
  if (!prediction || !prediction.canPredict || !isDateString(prediction.nextStart)) {
    return {
      status: 'insufficient',
      text: buildPredictionThresholdText(periods),
      countdownText: '',
      tone: 'default'
    }
  }
  if (isDateString(prediction.rangeStart) && today < prediction.rangeStart) {
    const days = util.daysBetween(util.parseDate(today), util.parseDate(prediction.nextStart))
    const dateText = util.formatDisplayDate(prediction.nextStart, { today })
    return {
      status: 'before-window',
      text: `预计 ${dateText} 开始`,
      countdownText: `还有 ${days} 天`,
      tone: 'default'
    }
  }
  if (!isDateString(prediction.rangeEnd) || today <= prediction.rangeEnd) {
    return {
      status: 'in-window',
      text: '这几天可能开始',
      countdownText: '',
      tone: 'default'
    }
  }
  const daysAfterWindow = util.daysBetween(util.parseDate(prediction.rangeEnd), util.parseDate(today))
  if (daysAfterWindow <= 7) {
    const lateDays = util.daysBetween(util.parseDate(prediction.nextStart), util.parseDate(today))
    return {
      status: 'late',
      text: `比预计晚 ${lateDays} 天`,
      countdownText: '',
      tone: 'neutral'
    }
  }
  const normalized = normalizePeriods(periods)
  const lastStart = normalized.length ? normalized[normalized.length - 1].startDate : prediction.lastStart
  const dateText = isDateString(lastStart) ? util.formatDisplayDate(lastStart, { today }) : ''
  return {
    status: 'late-too-long',
    text: `上次记录 ${dateText} 开始 · 可以补记`,
    countdownText: '',
    tone: 'neutral'
  }
}

function buildPeriodQuickAction(periods, options = {}) {
  const today = options.today || util.formatDate(new Date())
  const ongoing = findOngoingPeriod(periods)
  if (!ongoing) return { label: '记经期', ariaLabel: '记经期', mode: 'add' }
  const owner = periodCoverage.getPeriodOnDate([ongoing], today, today)
  if (!owner) return { label: '记结束', ariaLabel: '记结束', mode: 'complete' }
  const label = `经期第 ${owner.day} 天 · 记结束`
  return { label, ariaLabel: label, mode: 'complete' }
}

function getPeriodDuration(period) {
  if (getPeriodStatus(period) !== 'known-end') return 0
  const range = projectPeriodRange(period)
  if (!range) return 0
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
}

function normalizePeriods(periods = []) {
  return periods
    .map(item => {
      const range = projectPeriodRange(item, item && item.startDate)
      if (!range) return null
      const status = range.status
      if (status === 'known-end') {
        return {
          ...item,
          status,
          startDate: range.startDate,
          endDate: range.endDate,
          duration: getPeriodDuration(item)
        }
      }
      if (!isDateString(item.startDate)) return null
      return { ...item, status, endDate: '', duration: 0 }
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

function collectCycleLengths(periods) {
  const lengths = []
  for (let i = 1; i < periods.length; i++) {
    const length = util.daysBetween(util.parseDate(periods[i - 1].startDate), util.parseDate(periods[i].startDate))
    if (length > 0) lengths.push(length)
  }
  return lengths
}

function getStableCycles(cycleLengths) {
  if (cycleLengths.length === 0) return []
  const center = median(cycleLengths)
  const deviations = cycleLengths.map(length => Math.abs(length - center))
  const mad = median(deviations)
  const threshold = Math.max(7, mad * 2)
  const stable = cycleLengths.filter(length => Math.abs(length - center) <= threshold)
  return stable.length >= 2 ? stable : cycleLengths
}

function inclusiveDayCount(startDate, endDate) {
  if (!isDateString(startDate) || !isDateString(endDate) || startDate > endDate) return 0
  return util.daysBetween(util.parseDate(startDate), util.parseDate(endDate)) + 1
}

function expectedPeriodLength(periods) {
  const durations = normalizePeriods(periods).map(item => item.duration).filter(isPositiveNumber)
  return getPredictedDuration(durations)
}

// 已知起止的含首尾天数，以及是否超过超期完成提醒所用的同一预期时长。
// 只描述，不改记录、不写结束日。
function describeKnownPeriodLength({ startDate, endDate, periods = [] } = {}) {
  const days = inclusiveDayCount(startDate, endDate)
  if (!days) {
    return {
      days: 0,
      text: '',
      exceedsExpected: false,
      expectedDays: 0,
      expectedSource: '',
      hint: ''
    }
  }
  const expected = expectedPeriodLength(periods)
  const exceedsExpected = days > expected.days
  return {
    days,
    text: `共 ${days} 天`,
    exceedsExpected,
    expectedDays: expected.days,
    expectedSource: expected.source,
    hint: exceedsExpected ? `比你通常的 ${expected.days} 天长，确认一下结束日？` : ''
  }
}

// 预测持续时长的优先级：已完成历史时长中位数 → 五天默认。
// 进行中与结束日期不详的记录不进 durations；结果只用于预测展示，绝不写回经期记录。
function getPredictedDuration(durations) {
  if (durations.length === 0) return { days: 5, source: 'default' }
  return { days: Math.max(1, Math.round(median(durations.slice(-6)))), source: 'history' }
}

function getConfidence(count, sd) {
  if (count >= 5 && sd <= 2) return 'high'
  if (count >= 3 && sd <= 5) return 'medium'
  return 'low'
}

function normalizeSymptoms(symptoms) {
  if (!Array.isArray(symptoms)) return []
  const seen = new Set()
  const normalized = []
  symptoms.forEach(value => {
    if (!SYMPTOM_LABELS[value] || seen.has(value)) return
    seen.add(value)
    normalized.push(value)
  })
  return normalized
}

function weightedMean(values) {
  const weights = values.map((_, index) => index + 1)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function standardDeviation(values) {
  if (values.length <= 1) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

function addDays(dateStr, days) {
  const date = util.parseDate(dateStr)
  date.setDate(date.getDate() + days)
  return util.formatDate(date)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isDateString(value) {
  return util.isValidDateString(value)
}

module.exports = {
  FLOW_OPTIONS,
  SYMPTOM_GROUPS,
  SYMPTOM_OPTIONS,
  PERIOD_STATUS_OPTIONS,
  predictNextPeriod,
  describeKnownPeriodLength,
  buildPeriodPayload,
  getPeriodStatus,
  isPeriodStatus,
  findOngoingPeriod,
  decidePeriodRecordForDate,
  buildPeriodQuickAction,
  buildHomeStatusLine,
  buildPredictionThresholdText,
  periodStatusHint,
  projectPeriodRange,
  getPeriodDuration,
  recordAuthorLabel,
  memoryEditAriaLabel,
  decoratePeriod,
  buildSymptomOptions,
  formatPredictionRange
}
