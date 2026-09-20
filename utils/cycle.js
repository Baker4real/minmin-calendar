const util = require('./util')

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

  const durations = normalized.map(item => item.duration).filter(isPositiveNumber)
  const cycleLengths = collectCycleLengths(normalized)
  const candidateCycles = cycleLengths.filter(length => length >= 15 && length <= 60)
  const stableCycles = getStableCycles(candidateCycles)
  const ignoredCycleCount = Math.max(0, cycleLengths.length - stableCycles.length)

  if (stableCycles.length >= 2) {
    const recentCycles = stableCycles.slice(-6)
    const avgCycle = Math.round(weightedMean(recentCycles))
    const avgDuration = getPredictedDuration(durations, options)
    const sd = standardDeviation(recentCycles)
    const rangeDays = clamp(Math.ceil(sd), 1, 7)
    const confidence = getConfidence(recentCycles.length, sd)

    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle,
      avgDuration,
      rangeDays,
      confidence,
      usedCycleCount: recentCycles.length,
      ignoredCycleCount,
      source: 'history'
    })
  }

  if (stableCycles.length === 1) {
    const avgDuration = getPredictedDuration(durations, options)
    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle: stableCycles[0],
      avgDuration,
      rangeDays: 3,
      confidence: 'low',
      usedCycleCount: 1,
      ignoredCycleCount,
      source: 'history'
    })
  }

  const manualCycle = toPositiveInt(options.typicalCycleLength)
  if (manualCycle) {
    const avgDuration = getPredictedDuration(durations, options)
    return buildPrediction({
      lastStart: normalized[normalized.length - 1].startDate,
      avgCycle: manualCycle,
      avgDuration,
      rangeDays: 3,
      confidence: 'low',
      usedCycleCount: 0,
      ignoredCycleCount,
      source: 'manual'
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

function buildPeriodPayload({ startDate, endDate, note = '', flow = '', symptoms = [] }) {
  const range = util.normalizeDateRange({ startDate, endDate })
  return {
    startDate,
    endDate: range ? range.endDate : (endDate || startDate),
    note,
    duration: range
      ? util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
      : 0,
    flow: FLOW_LABELS[flow] ? flow : '',
    symptoms: normalizeSymptoms(symptoms)
  }
}

function decoratePeriod(period) {
  const symptoms = normalizeSymptoms(period.symptoms)
  const symptomLabels = symptoms.map(value => SYMPTOM_LABELS[value])
  const flowLabel = FLOW_LABELS[period.flow] || ''

  return {
    ...period,
    flow: FLOW_LABELS[period.flow] ? period.flow : '',
    symptoms,
    flowLabel,
    symptomLabels,
    symptomText: symptomLabels.join('、')
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

function formatPredictionRange(prediction) {
  if (!prediction || !prediction.canPredict) return ''
  return `${formatMonthDay(prediction.rangeStart)}-${formatMonthDay(prediction.rangeEnd)}`
}

function buildPrediction({
  lastStart,
  avgCycle,
  avgDuration,
  rangeDays,
  confidence,
  usedCycleCount,
  ignoredCycleCount,
  source
}) {
  const nextStart = addDays(lastStart, avgCycle)
  const nextEnd = addDays(nextStart, Math.max(1, avgDuration) - 1)
  const rangeStart = addDays(nextStart, -rangeDays)
  const rangeEnd = addDays(nextStart, rangeDays)
  const display = util.formatPredictDisplay(nextStart)
  const prediction = {
    canPredict: true,
    avgCycle,
    avgDuration,
    nextStart,
    nextEnd,
    rangeStart,
    rangeEnd,
    confidence,
    confidenceText: confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低',
    usedCycleCount,
    ignoredCycleCount,
    source,
    nextDisplay: display.date,
    nextWeekday: display.weekday
  }
  prediction.rangeDisplay = formatPredictionRange(prediction)
  return prediction
}

function emptyPrediction() {
  return {
    canPredict: false,
    avgCycle: null,
    avgDuration: null,
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

function normalizePeriods(periods = []) {
  return periods
    .map(item => {
      const range = util.normalizeDateRange(item)
      if (!range) return null
      const duration = range.hasEndDate
        ? toPositiveInt(item.duration) || util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
        : util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
      return { ...item, startDate: range.startDate, endDate: range.endDate, duration }
    })
    .filter(Boolean)
    .filter(item => item.duration > 0)
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

function getPredictedDuration(durations, options) {
  const manualDuration = toPositiveInt(options.typicalPeriodLength)
  if (manualDuration) return manualDuration
  if (durations.length === 0) return 5
  return Math.max(1, Math.round(median(durations.slice(-6))))
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

function formatMonthDay(dateStr) {
  if (!isDateString(dateStr)) return ''
  const date = util.parseDate(dateStr)
  return `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`
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
  predictNextPeriod,
  buildCycleReminders,
  buildPeriodPayload,
  decoratePeriod,
  buildSymptomOptions,
  formatPredictionRange
}
