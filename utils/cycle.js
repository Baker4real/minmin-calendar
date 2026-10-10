const util = require('./util')

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

const FLOW_OPTIONS = [
  { value: 'light', label: '量少' },
  { value: 'normal', label: '正常' },
  { value: 'heavy', label: '量多' }
]

const SYMPTOM_GROUPS = [
  { key: 'body', label: '身体' },
  { key: 'emotion', label: '情绪' }
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
  const predictedDuration = getPredictedDuration(durations, options)
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

  const manualCycle = toPositiveInt(options.typicalCycleLength)
  if (manualCycle) {
    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle: manualCycle,
      avgDuration: predictedDuration.days,
      durationSource: predictedDuration.source,
      rangeDays: 3,
      confidence: 'low',
      usedCycleCount: 0,
      ignoredCycleCount,
      source: 'manual',
      today: options.today
    })
  }

  return emptyPrediction()
}

function buildCycleReminders(prediction, periods, options = {}) {
  if (!prediction || !prediction.canPredict) return []

  const today = options.today || util.formatDate(new Date())
  if (!isDateString(today)) return []

  if (hasPeriodOnOrAfter(periods, prediction.nextStart)) return []

  const reminders = []
  const daysToRangeStart = util.daysBetween(util.parseDate(today), util.parseDate(prediction.rangeStart))
  const daysAfterRangeEnd = util.daysBetween(util.parseDate(prediction.rangeEnd), util.parseDate(today))

  if (today >= prediction.rangeStart && today <= prediction.rangeEnd) {
    reminders.push({
      type: 'due',
      title: '正在预测区间',
      text: '如果已经开始，可以直接记录今天',
      action: 'quickPeriod',
      date: today
    })
  } else if (daysToRangeStart > 0 && daysToRangeStart <= 7) {
    reminders.push({
      type: 'upcoming',
      title: '经期临近',
      text: `约 ${daysToRangeStart} 天后进入预测区间`,
      action: 'quickPeriod',
      date: today
    })
  } else if (daysAfterRangeEnd > 0 && daysAfterRangeEnd <= 7) {
    reminders.push({
      type: 'overdue',
      title: '预测已过',
      text: `预测区间已过 ${daysAfterRangeEnd} 天，如已开始可以补记`,
      action: 'quickPeriod',
      date: today
    })
  }

  return reminders
}

// 超期进行中记录的一次非阻塞完成提示（issue #98）。
// 预期时长优先级与预测结束日同源：用户配置 → 最近已完成时长中位数 → 五天默认；
// 进行中记录自身与结束日期不详记录的时长恒为 0，天然不进预期计算。
// 只返回提示对象，绝不写结束日期、绝不关闭状态。
function buildOngoingCompletionReminder(periods, options = {}) {
  const ongoing = findOngoingPeriod(periods)
  if (!ongoing) return null

  const today = options.today || util.formatDate(new Date())
  const runningDays = inclusiveDayCount(ongoing.startDate, today)
  if (!runningDays) return null

  const expected = expectedPeriodLength(periods, options)
  if (runningDays <= expected.days) return null

  return {
    type: 'ongoing-overdue',
    title: '经期还未结束',
    text: `已进行 ${runningDays} 天，超过预期的 ${expected.days} 天，可以补填结束日期`,
    runningDays,
    expectedDays: expected.days,
    expectedSource: expected.source,
    record: ongoing,
    recordKey: ongoing._id || ongoing.id || ongoing.startDate || '',
    date: today
  }
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
  const start = util.formatDisplayDate(period.startDate, { today })
  return start ? `${start}，结束日期不详` : '结束日期不详'
}

function periodRangeSummary(status, range, period, today) {
  if (range) return util.formatDisplayDateRange(range.startDate, range.endDate, { today })
  if (status === 'ongoing') {
    const label = periodDateLabel(status, range, period, today)
    return label ? `${label}，进行中` : '进行中'
  }
  return periodDateLabel(status, range, period, today)
}

function decoratePeriod(period, { today } = {}) {
  const status = getPeriodStatus(period)
  const range = status === 'known-end' ? util.normalizeDateRange(period) : null
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

function getPeriodStatus(period = {}) {
  if (isPeriodStatus(period.status)) return period.status
  // 旧数据兼容：带合法结束日期视为已结束；缺结束日期保守解释为结束日期不详。
  if (isDateString(period.endDate)) return 'known-end'
  return 'unknown-end'
}

function isPeriodStatus(value) {
  return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
}

function findOngoingPeriod(periods = []) {
  const list = Array.isArray(periods) ? periods : []
  return list.find(item => getPeriodStatus(item) === 'ongoing') || null
}

function buildPeriodQuickAction(periods, options = {}) {
  const today = options.today || util.formatDate(new Date())
  const ongoing = findOngoingPeriod(periods)
  if (!ongoing) return { label: '记经期', ariaLabel: '记经期', mode: 'add' }
  const day = inclusiveDayCount(ongoing.startDate, today)
  if (!day) return { label: '记结束', ariaLabel: '记结束', mode: 'complete' }
  const label = `经期第 ${day} 天 · 记结束`
  return { label, ariaLabel: label, mode: 'complete' }
}

// 日历与小结共用的投影区间：进行中投影开始日至今天（不发明未来日期），
// 结束日期不详只投已知开始日，已知结束保持含首尾区间。
function projectPeriodRange(period, today) {
  if (hasCorruptEndDate(period)) return null
  const status = getPeriodStatus(period)
  if (status === 'ongoing') {
    if (!isDateString(period.startDate) || !isDateString(today)) return null
    if (period.startDate > today) return null
    return { startDate: period.startDate, endDate: today, status }
  }
  if (status === 'unknown-end') {
    if (!isDateString(period.startDate)) return null
    return { startDate: period.startDate, endDate: period.startDate, status }
  }
  const range = util.normalizeDateRange(period)
  return range ? { startDate: range.startDate, endDate: range.endDate, status } : null
}

// 结束日期存在但不是合法日期（如 2026-01-32）是损坏数据，不当作结束日期不详
function hasCorruptEndDate(period = {}) {
  const endDate = period.endDate
  return endDate !== undefined && endDate !== null && endDate !== '' && !isDateString(endDate)
}

function getPeriodDuration(period) {
  if (getPeriodStatus(period) !== 'known-end') return 0
  const range = util.normalizeDateRange(period)
  if (!range) return 0
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
}

function normalizePeriods(periods = []) {
  return periods
    .map(item => {
      if (hasCorruptEndDate(item)) return null
      const status = getPeriodStatus(item)
      if (status === 'known-end') {
        const range = util.normalizeDateRange(item)
        if (!range) return null
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

function expectedPeriodLength(periods, options = {}) {
  const durations = normalizePeriods(periods).map(item => item.duration).filter(isPositiveNumber)
  return getPredictedDuration(durations, options)
}

// 已知起止的含首尾天数，以及是否超过超期完成提醒所用的同一预期时长。
// 只描述，不改记录、不写结束日。
function describeKnownPeriodLength({ startDate, endDate, periods = [], typicalPeriodLength } = {}) {
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
  const expected = expectedPeriodLength(periods, { typicalPeriodLength })
  const exceedsExpected = days > expected.days
  return {
    days,
    text: `共 ${days} 天`,
    exceedsExpected,
    expectedDays: expected.days,
    expectedSource: expected.source,
    hint: exceedsExpected ? `超过预期的 ${expected.days} 天，请核对结束日期` : ''
  }
}

// 预测持续时长的优先级：用户设置 → 已完成历史时长中位数 → 五天默认。
// 进行中与结束日期不详的记录不进 durations；结果只用于预测展示，绝不写回经期记录。
function getPredictedDuration(durations, options) {
  const manualDuration = toPositiveInt(options.typicalPeriodLength)
  if (manualDuration) return { days: manualDuration, source: 'manual' }
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

function hasPeriodOnOrAfter(periods, dateStr) {
  return normalizePeriods(periods).some(period => period.startDate >= dateStr)
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

function toPositiveInt(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.round(number)
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
  buildCycleReminders,
  buildOngoingCompletionReminder,
  describeKnownPeriodLength,
  buildPeriodPayload,
  getPeriodStatus,
  isPeriodStatus,
  findOngoingPeriod,
  buildPeriodQuickAction,
  projectPeriodRange,
  getPeriodDuration,
  decoratePeriod,
  buildSymptomOptions,
  formatPredictionRange
}
